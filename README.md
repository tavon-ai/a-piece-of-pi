# A Piece of PI – Embedding The OpenClaw Coding Agent In Your Product

When people use OpenClaw, they're amazed. It auto-discovers new capabilities, explores available data sources, stitches components together, and dynamically builds new solutions. It feels like the system is learning. It feels magical.

At its core, OpenClaw is powered by pi.dev: a deliberately simple coding agent built on a small set of powerful primitives. PI's "radical extensibility" turns out to be a strong architectural fit for the kinds of composable, evolving use cases OpenClaw is designed to support.

In this talk, we'll take a closer look at what's actually happening under the hood at the agent layer. This session is aimed at a technically curious audience — especially those who want to look beyond the surface and consider working with OpenClaw seriously.


## Examples

This repository contains two examples that demonstrate different approaches. Both examples implement the same use case: a **CRM Lead Qualifier** that helps sales teams score and prioritize leads.

### [example-agent-core](./example-agent-core/)

A from-scratch agent built with `@mariozechner/pi-agent-core`. Demonstrates tool definitions with TypeBox schemas, event streaming, `beforeToolCall` confirmation gates, parallel tool execution, and steering messages.

### [example-pi-coding-agent](./example-pi-coding-agent/)

The same CRM concept, but using pi's coding agent directly — no custom agent code. CRM data lives as markdown files, behaviour is defined in `AGENTS.md`, and two extensions add a `/pipeline` command and a write-confirmation gate.
