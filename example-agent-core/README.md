# CRM Lead Qualifier — agent-core Edition

A from-scratch agent built with `@mariozechner/pi-agent-core` that helps sales teams qualify leads.
For the same use case implemented with pi's coding agent, see [`example-pi-coding-agent`](../example-pi-coding-agent/).

## What it demonstrates

| Concept | Where |
|---------|-------|
| **Tool definition** with TypeBox schemas | `src/tools.ts` — 4 tools with typed params |
| **Event streaming** for live UI | `src/index.ts` — `agent.subscribe()` handler |
| **`beforeToolCall`** for confirmation | Blocks `update_contact` and `log_interaction` until user confirms |
| **Parallel tool execution** | Agent can `score_lead` on multiple contacts simultaneously |
| **Steering messages** | Type `/steer <msg>` to redirect the agent mid-run |
| **Error handling** | Tools throw errors, agent reports them to LLM |

## Setup

```bash
npm install
```

You need an `ANTHROPIC_API_KEY` environment variable (or change the model in `src/index.ts`).

## Run

```bash
npm start
```

## Example prompts

- `Show me all new leads and score them`
- `Qualify all contacts and recommend who to prioritize`
- `Search for healthcare contacts`
- `Score lead c5 and update their status to qualified`
- `Log a demo meeting with Sarah Chen about enterprise features`

## Architecture

```
src/
├── data.ts    — Mock CRM database (contacts + interactions)
├── tools.ts   — 4 AgentTools: search, score, update, log
└── index.ts   — Agent setup, event handler, interactive REPL
```

## Key agent-core concepts used

### Event lifecycle
```
prompt("Score all new leads")
├─ agent_start
├─ turn_start
├─ message_start (user)
├─ message_end (user)
├─ message_start (assistant) → calls search_contacts
├─ tool_execution_start × 1
├─ tool_execution_end × 1
├─ turn_end
├─ turn_start
├─ message_start (assistant) → calls score_lead × 3 in parallel!
├─ tool_execution_start × 3
├─ tool_execution_end × 3
├─ turn_end
├─ turn_start
├─ message_start (assistant) → final recommendation
├─ message_end
├─ turn_end
└─ agent_end
```

### beforeToolCall flow
When the agent tries to `update_contact`, the `beforeToolCall` hook prompts the user:
```
⚠ Allow: Update contact c3 → status: qualified? (y/n):
```
Answering `n` returns `{ block: true }` and the LLM sees the tool was blocked.
