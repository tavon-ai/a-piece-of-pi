# CRM Lead Qualifier — pi Edition

The same CRM concept as [`example-pi-agent-core`](../example-pi-agent-core/), but using pi's coding agent harness directly.
No custom agent code — just markdown files, an AGENTS.md, and a small extension.

## The coding agent principle

> **An LLM agent runs tools in a loop to achieve a goal.**
> — Simon Willison

A **coding agent** is an agent whose tools are the ones developers already use: **find files, read files, edit files, run commands.**

LLMs were trained on billions of examples of navigating files and directories. `grep`, `cat`, `ls`, `find` — these aren't new skills we're teaching. They're **native operations**. Structure *any* data as files — customer records, sales transcripts, CRM data — and the LLM brings the same file-navigation capabilities. No custom retrieval logic needed.

The entire pattern is:

```
while true:
    response = llm(conversation)
    if no tool calls in response:
        break                          # goal achieved
    execute the tool calls
    append results to conversation     # memory
```

Here's what that looks like for our CRM:

```
User: "Score all new leads and tell me who to prioritize"

→ LLM decides: I need to find the new leads
  → calls: bash("grep -rl 'status: new' contacts/")
  → result: c1-sarah-chen.md, c3-lisa-park.md, c4-tom-rivera.md

→ LLM decides: I need to read their details
  → calls: read("contacts/c1-sarah-chen.md")
  → calls: read("contacts/c3-lisa-park.md")
  → calls: read("contacts/c4-tom-rivera.md")
  → result: [frontmatter with company size, revenue, industry, role, recency]

→ LLM decides: I have the data and the scoring rubric from AGENTS.md, I can score them
  → responds with a table:
    "Lisa Park — 80 🔥 Hot (Healthcare, 500 employees, $80M revenue)
     Sarah Chen — 63 🟡 Warm (SaaS, 250 employees, $45M revenue)
     Tom Rivera — 12 🧊 Cold (Gaming, 15 employees, $800K revenue)
     Prioritize Lisa Park — large healthcare company with budget approved for Q2."
```

Each step, the LLM makes one decision: **do I need another tool call, or am I done?** That decision-making in a loop is what makes it an agent rather than a single LLM call.

## What's different from example-pi-agent-core

| | example-pi-agent-core | example-pi-coding-agent |
|---|---|---|
| **Runtime** | Custom Node.js app | pi coding agent |
| **Tools** | 4 custom AgentTools | pi's built-in read/write/edit/bash |
| **Database** | In-memory arrays | Markdown files with YAML frontmatter |
| **Confirmation** | Custom `beforeToolCall` | Extension `tool_call` gate |
| **UI** | Custom terminal REPL | pi's TUI + `/pipeline` command |
| **Sessions** | None | pi sessions with branching, `/tree` |
| **Scoring** | Hardcoded in tool | LLM computes from AGENTS.md rubric |

## Structure

```
example-pi-coding-agent/
├── .pi/extensions/
│   ├── crm.ts              ← /pipeline command + write gate
│   └── edit-contact.ts     ← /edit command (inline record editor)
├── contacts/               ← Markdown files = CRM database
│   ├── c1-sarah-chen.md
│   ├── c2-marcus-johnson.md
│   ├── c3-lisa-park.md
│   ├── c4-tom-rivera.md
│   └── c5-anika-patel.md
├── interactions/            ← Created by the agent
├── AGENTS.md                ← CRM instructions + scoring rubric
└── README.md
```

## Run

```bash
cd example-pi-coding-agent
pi
```

## Example prompts

- `Show me all new leads` — uses bash + read
- `Score Lisa Park` — LLM reads file, applies rubric from AGENTS.md, edits score
- `Mark Anika Patel as qualified` — triggers confirmation gate
- `Log a demo meeting with Sarah Chen about enterprise features` — creates interaction file
- `/pipeline` — TUI overview of all contacts by status
- `/edit` — inline record editor with constrained fields (no LLM)

## Extensions: extending the coding agent

A coding agent gives you find, read, edit, bash. But real-world use cases need more.

Extensions let you **extend the coding agent** without forking or rebuilding it. They hook into the agent's lifecycle and add custom commands, tool call gates, custom tools, event hooks, and UI components — all running in your process, not in the LLM's context window.

This project has two extensions that showcase two different patterns:

### Pattern 1: UI → Agent (`.pi/extensions/crm.ts`)

**`/pipeline` command** — presents an interactive picker, then sends the user's choice as a prompt to the agent:

```
/pipeline
→ Select a contact: 🆕 Lisa Park — HealthBridge [new]
→ Action: 📊 Score this lead
→ Agent receives: "Score Lisa Park from contacts/c3-lisa-park.md..."
→ Agent does the work via bash/read/edit
```

Uses `ctx.ui.select()` for two selection dialogs, then `pi.sendUserMessage()` to hand off to the agent loop. The command is pure UI sugar — the agent still does the work.

**Write gate** — intercepts `edit`/`write` tool calls targeting `contacts/` and asks for confirmation via `ctx.ui.select()`. Answering No returns `{ block: true }` and the LLM sees the tool was blocked.

### Pattern 2: UI → File (`.pi/extensions/edit-contact.ts`)

**`/edit` command** — an inline record editor that modifies the file directly, no LLM involved:

```
─────────────────────────────────────
 ✏ Lisa Park — HealthBridge
─────────────────────────────────────

 ▸ Status        🆕 new              ↵ edit
   Score         —
   Industry      Healthcare
   Role          Director of IT
   ...

   ↑↓ navigate  •  Enter edit  •  Ctrl+S save  •  Esc exit
```

Press Enter on Status → inline dropdown appears:

```
 ▸ Status        ▼
                   🆕 new
                   📧 contacted
                   ✅ qualified       ← highlighted
                   ❌ unqualified
                   🤝 customer
```

Press Enter on Score → inline text input:

```
 ▸ Score         75█
```

Uses `ctx.ui.custom()` to render a full TUI component with:
- **Dropdown for constrained fields** — Enter opens a list of only valid statuses, ↑↓ to pick, Enter to confirm
- **Inline text input for free fields** — Enter opens a text cursor, type a value, Enter to confirm
- **Validation** — score rejects non-numeric or out-of-range input with a ✘ indicator
- **Read-only display fields** — industry, role, revenue shown but Enter does nothing
- **Live change preview** — shows pending changes before save
- **Direct file I/O** — writes YAML frontmatter on Ctrl+S, no agent involved

### The two patterns compared

| | `/pipeline` | `/edit` |
|---|---|---|
| **UI method** | `ctx.ui.select()` | `ctx.ui.custom()` |
| **Who does the work** | The agent (via tools) | The extension (direct file I/O) |
| **Input validation** | None — agent interprets the prompt | Enforced — only valid statuses, 0–100 scores |
| **LLM cost** | Yes (tokens for tool calls) | Zero |
| **Best for** | Complex tasks needing reasoning | Simple, structured edits |

### The bigger picture

Extensions are the bridge between "coding agent as a generic loop" and "coding agent as YOUR application." The core loop stays simple (tools in a loop), but extensions let you:

- Gate destructive operations (confirmation before writes)
- Add domain-specific UI (pipeline views, record editors)
- Register custom tools (database queries, API calls, external services)
- React to lifecycle events (log tool calls, trigger CI, checkpoint git)
- Persist state across sessions

## Other pi features this exercises

- **AGENTS.md** — project context that teaches the LLM how to be a CRM agent
- **Built-in tools** — read/write/edit/bash cover all CRUD operations
- **Sessions** — `/tree` to branch, revisit, compare qualification strategies
- **Steering** — redirect the agent while it's scoring leads
