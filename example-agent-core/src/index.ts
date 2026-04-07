// ── CRM Lead Qualifier Agent ───────────────────────────────────────
//
// Demonstrates:
//   1. Tool definition with TypeBox schemas
//   2. Event streaming for live UI updates
//   3. beforeToolCall for confirmation before writes
//   4. Parallel tool execution (score multiple leads at once)
//   5. Steering messages (interrupt the agent mid-run)
//   6. The full agent event lifecycle
//

import { Agent, type AgentEvent, type BeforeToolCallContext } from "@mariozechner/pi-agent-core";
import { getModel } from "@mariozechner/pi-ai";
import * as readline from "node:readline";
import { searchContactsTool, scoreLeadTool, updateContactTool, logInteractionTool } from "./tools.js";

// ── Helpers ────────────────────────────────────────────────────────

const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const BOLD = "\x1b[1m";

function log(color: string, prefix: string, msg: string) {
  console.log(`${color}${prefix}${RESET} ${msg}`);
}

// ── Confirmation prompt for write operations ───────────────────────

// Shared readline instance — set in main(), used by confirm()
let mainRl: readline.Interface;

function confirm(question: string): Promise<boolean> {
  // Pause the main REPL so we don't get double-echo
  mainRl.pause();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${YELLOW}⚠ ${question} (y/n): ${RESET}`, (answer) => {
      rl.close();
      mainRl.resume();
      resolve(answer.trim().toLowerCase() === "y");
    });
  });
}

// ── Create Agent ───────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a CRM Lead Qualifier assistant. You help sales teams manage contacts, score leads, and prioritize outreach.

You have access to these tools:
- search_contacts: Find contacts by name, company, industry, or status
- score_lead: Calculate a lead score (0-100) for a contact
- update_contact: Update status, score, or add notes to a contact
- log_interaction: Record an interaction (email, call, meeting, demo)

When asked to qualify leads:
1. Search for relevant contacts
2. Score them (you can score multiple in parallel!)
3. Recommend which to prioritize based on scores
4. Offer to update their status and log interactions

Be concise and action-oriented. Use tables when comparing multiple leads.`;

const agent = new Agent({
  initialState: {
    systemPrompt: SYSTEM_PROMPT,
    model: getModel("anthropic", "claude-sonnet-4-20250514"),
    tools: [searchContactsTool, scoreLeadTool, updateContactTool, logInteractionTool],
    messages: [],
    thinkingLevel: "off",
  },

  // Standard LLM messages pass through; custom types would be filtered here
  convertToLlm: (messages) =>
    messages.filter((m) => "role" in m && ["user", "assistant", "toolResult"].includes(m.role)),

  // Parallel execution: the agent can score multiple leads at the same time
  toolExecution: "parallel",

  // ── beforeToolCall: require confirmation for write operations ───
  beforeToolCall: async ({ toolCall, args }: BeforeToolCallContext) => {
    if (toolCall.name === "update_contact" || toolCall.name === "log_interaction") {
      const desc =
        toolCall.name === "update_contact"
          ? `Update contact ${(args as any).contactId}` +
            (((args as any).status && ` → status: ${(args as any).status}`) || "") +
            (((args as any).note && ` → note: "${(args as any).note}"`) || "")
          : `Log ${(args as any).type} for ${(args as any).contactId}: "${(args as any).summary}"`;

      const allowed = await confirm(`Allow: ${desc}?`);
      if (!allowed) {
        return { block: true, reason: "User declined this action." };
      }
    }
    return undefined;
  },
});

// ── Event Subscriber: live UI ──────────────────────────────────────

agent.subscribe(async (event: AgentEvent) => {
  switch (event.type) {
    case "agent_start":
      log(DIM, "───", "Agent started");
      break;

    case "turn_start":
      log(DIM, "───", "New turn");
      break;

    case "message_start":
      if ("role" in event.message && event.message.role === "assistant") {
        process.stdout.write(`${CYAN}${BOLD}Assistant: ${RESET}`);
      }
      break;

    case "message_update":
      // Stream text deltas live
      if (event.assistantMessageEvent.type === "text_delta") {
        process.stdout.write(event.assistantMessageEvent.delta);
      }
      break;

    case "message_end":
      if ("role" in event.message && event.message.role === "assistant") {
        const msg = event.message as any;
        process.stdout.write("\n");
        if (msg.stopReason === "error") {
          log(RED, "  ✗", `LLM error: ${msg.errorMessage ?? "unknown"}`);
        }
      }
      break;

    case "tool_execution_start":
      log(GREEN, "🔧", `${event.toolName}(${JSON.stringify(event.args)})`);
      break;

    case "tool_execution_update":
      // Show streaming tool progress
      if (event.partialResult?.content?.[0]?.type === "text") {
        log(DIM, "  ⏳", event.partialResult.content[0].text);
      }
      break;

    case "tool_execution_end":
      if (event.isError) {
        log(RED, "  ✗", `${event.toolName} failed`);
      } else {
        log(GREEN, "  ✓", `${event.toolName} done`);
      }
      break;

    case "turn_end":
      if (event.toolResults.length > 0) {
        log(DIM, "───", `Turn complete (${event.toolResults.length} tool result(s))`);
      }
      break;

    case "agent_end":
      log(DIM, "───", `Agent finished (${event.messages.length} messages total)`);
      // Debug: show last assistant message details
      const lastMsg = [...event.messages].reverse().find((m: any) => m.role === "assistant") as any;
      if (lastMsg?.stopReason && lastMsg.stopReason !== "end") {
        log(RED, "  ⚠", `stopReason: ${lastMsg.stopReason}, error: ${lastMsg.errorMessage ?? "none"}`);
      }
      console.log();
      break;
  }
});

// ── Interactive REPL ───────────────────────────────────────────────

async function main() {
  console.log(`${BOLD}${CYAN}╔════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}${CYAN}║   CRM Lead Qualifier Agent             ║${RESET}`);
  console.log(`${BOLD}${CYAN}╚════════════════════════════════════════╝${RESET}`);
  console.log();
  console.log(`${DIM}Commands:${RESET}`);
  console.log(`${DIM}  Type a message to chat with the agent${RESET}`);
  console.log(`${DIM}  /steer <msg>  — send a steering message while agent is working${RESET}`);
  console.log(`${DIM}  /reset        — clear conversation${RESET}`);
  console.log(`${DIM}  /quit         — exit${RESET}`);
  console.log();
  console.log(`${DIM}Try: "Show me all new leads and score them"${RESET}`);
  console.log(`${DIM}     "Qualify all contacts and recommend who to prioritize"${RESET}`);
  console.log();

  mainRl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = () => {
    mainRl.question(`${YELLOW}You: ${RESET}`, async (input) => {
      const trimmed = input.trim();

      if (!trimmed) {
        prompt();
        return;
      }

      if (trimmed === "/quit") {
        console.log("Bye!");
        mainRl.close();
        process.exit(0);
      }

      if (trimmed === "/reset") {
        agent.reset();
        console.log(`${DIM}Conversation reset.${RESET}\n`);
        prompt();
        return;
      }

      // Steering: inject a message while the agent is running
      if (trimmed.startsWith("/steer ")) {
        const msg = trimmed.slice(7);
        agent.steer({
          role: "user",
          content: msg,
          timestamp: Date.now(),
        });
        log(YELLOW, "⚡", `Steering message queued: "${msg}"`);
        prompt();
        return;
      }

      try {
        await agent.prompt(trimmed);
      } catch (err: any) {
        log(RED, "Error:", err.message);
      }

      prompt();
    });
  };

  prompt();
}

main();
