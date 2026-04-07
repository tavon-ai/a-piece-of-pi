// ── CRM Tools ──────────────────────────────────────────────────────

import { Type } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { contacts, interactions, addInteraction, type Contact } from "./data.js";

// ── search_contacts ────────────────────────────────────────────────
// Search by name, company, industry, or status

export const searchContactsTool: AgentTool = {
  name: "search_contacts",
  label: "Search Contacts",
  description:
    "Search CRM contacts by name, company, industry, or status. Returns matching contacts with their details. Use an empty query to list all contacts.",
  parameters: Type.Object({
    query: Type.Optional(Type.String({ description: "Search term (matches name, company, industry)" })),
    status: Type.Optional(
      Type.Union(
        [
          Type.Literal("new"),
          Type.Literal("contacted"),
          Type.Literal("qualified"),
          Type.Literal("unqualified"),
          Type.Literal("customer"),
        ],
        { description: "Filter by status" }
      )
    ),
  }),
  execute: async (_toolCallId, rawParams, _signal, onUpdate) => {
    const params = rawParams as { query?: string; status?: string };
    onUpdate?.({
      content: [{ type: "text", text: "Searching contacts..." }],
      details: {},
    });

    // Simulate slight DB latency
    await new Promise((r) => setTimeout(r, 200));

    let results = [...contacts];

    if (params.query) {
      const q = params.query.toLowerCase();
      results = results.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.company.toLowerCase().includes(q) ||
          c.industry.toLowerCase().includes(q)
      );
    }

    if (params.status) {
      results = results.filter((c) => c.status === params.status);
    }

    // Include interaction count per contact
    const enriched = results.map((c) => ({
      ...c,
      interactionCount: interactions.filter((i) => i.contactId === c.id).length,
    }));

    return {
      content: [
        {
          type: "text",
          text:
            enriched.length > 0
              ? JSON.stringify(enriched, null, 2)
              : "No contacts found matching your criteria.",
        },
      ],
      details: { matchCount: enriched.length },
    };
  },
};

// ── score_lead ─────────────────────────────────────────────────────
// Compute a lead score (0-100) based on firmographic + engagement data

export const scoreLeadTool: AgentTool = {
  name: "score_lead",
  label: "Score Lead",
  description:
    "Calculate a lead score (0-100) for a contact based on company size, revenue, industry, engagement, and recency. Higher = more likely to convert.",
  parameters: Type.Object({
    contactId: Type.String({ description: "Contact ID to score" }),
  }),
  execute: async (_toolCallId, rawParams, signal, onUpdate) => {
    const params = rawParams as { contactId: string };
    const contact = contacts.find((c) => c.id === params.contactId);
    if (!contact) {
      throw new Error(`Contact not found: ${params.contactId}`);
    }

    onUpdate?.({
      content: [{ type: "text", text: `Scoring ${contact.name}...` }],
      details: { phase: "analyzing" },
    });

    // Simulate scoring computation
    await new Promise((r) => setTimeout(r, 500));

    if (signal?.aborted) throw new Error("Aborted");

    let score = 0;
    const factors: string[] = [];

    // Company size factor (0-25)
    if (contact.companySize >= 1000) {
      score += 25;
      factors.push("Large enterprise (+25)");
    } else if (contact.companySize >= 100) {
      score += 15;
      factors.push("Mid-market company (+15)");
    } else if (contact.companySize >= 30) {
      score += 8;
      factors.push("Small business (+8)");
    } else {
      score += 2;
      factors.push("Very small company (+2)");
    }

    // Revenue factor (0-25)
    if (contact.annualRevenue >= 100_000_000) {
      score += 25;
      factors.push("High revenue (+25)");
    } else if (contact.annualRevenue >= 10_000_000) {
      score += 15;
      factors.push("Good revenue (+15)");
    } else if (contact.annualRevenue >= 1_000_000) {
      score += 8;
      factors.push("Moderate revenue (+8)");
    } else {
      score += 2;
      factors.push("Low revenue (+2)");
    }

    // Industry fit (0-20)
    const highValueIndustries = ["Financial Services", "Healthcare", "SaaS"];
    if (highValueIndustries.includes(contact.industry)) {
      score += 20;
      factors.push(`High-value industry: ${contact.industry} (+20)`);
    } else {
      score += 5;
      factors.push(`Standard industry: ${contact.industry} (+5)`);
    }

    // Role seniority (0-15)
    const seniorRoles = ["VP", "CTO", "Head", "Director", "Chief"];
    if (seniorRoles.some((r) => contact.role.includes(r))) {
      score += 15;
      factors.push(`Senior decision-maker: ${contact.role} (+15)`);
    } else {
      score += 5;
      factors.push(`${contact.role} (+5)`);
    }

    // Engagement recency (0-15)
    const daysSinceContact = Math.floor(
      (Date.now() - new Date(contact.lastContactDate).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSinceContact <= 7) {
      score += 15;
      factors.push("Very recent engagement (+15)");
    } else if (daysSinceContact <= 30) {
      score += 10;
      factors.push("Recent engagement (+10)");
    } else if (daysSinceContact <= 90) {
      score += 5;
      factors.push("Moderate engagement recency (+5)");
    } else {
      score += 0;
      factors.push("Stale contact (+0)");
    }

    score = Math.min(100, score);

    onUpdate?.({
      content: [{ type: "text", text: `Scored ${contact.name}: ${score}/100` }],
      details: { phase: "complete" },
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              contactId: contact.id,
              name: contact.name,
              score,
              tier: score >= 80 ? "Hot" : score >= 50 ? "Warm" : "Cold",
              factors,
            },
            null,
            2
          ),
        },
      ],
      details: { score, factors },
    };
  },
};

// ── update_contact ─────────────────────────────────────────────────
// Update contact status, score, or add notes

export const updateContactTool: AgentTool = {
  name: "update_contact",
  label: "Update Contact",
  description: "Update a contact's status, lead score, or add a note. Requires confirmation via beforeToolCall.",
  parameters: Type.Object({
    contactId: Type.String({ description: "Contact ID to update" }),
    status: Type.Optional(
      Type.Union(
        [
          Type.Literal("new"),
          Type.Literal("contacted"),
          Type.Literal("qualified"),
          Type.Literal("unqualified"),
          Type.Literal("customer"),
        ],
        { description: "New status" }
      )
    ),
    score: Type.Optional(Type.Number({ description: "New lead score (0-100)" })),
    note: Type.Optional(Type.String({ description: "Note to append" })),
  }),
  execute: async (_toolCallId, rawParams, _signal) => {
    const params = rawParams as { contactId: string; status?: Contact["status"]; score?: number; note?: string };
    const contact = contacts.find((c) => c.id === params.contactId);
    if (!contact) {
      throw new Error(`Contact not found: ${params.contactId}`);
    }

    const changes: string[] = [];

    if (params.status !== undefined) {
      const old = contact.status;
      contact.status = params.status;
      changes.push(`Status: ${old} → ${params.status}`);
    }

    if (params.score !== undefined) {
      const old = contact.score;
      contact.score = params.score;
      changes.push(`Score: ${old ?? "unset"} → ${params.score}`);
    }

    if (params.note) {
      contact.notes.push(params.note);
      changes.push(`Added note: "${params.note}"`);
    }

    return {
      content: [
        {
          type: "text",
          text: `Updated ${contact.name}:\n${changes.join("\n")}`,
        },
      ],
      details: { contactId: contact.id, changes },
    };
  },
};

// ── log_interaction ────────────────────────────────────────────────
// Log a new interaction (email, call, meeting, demo)

export const logInteractionTool: AgentTool = {
  name: "log_interaction",
  label: "Log Interaction",
  description: "Log a new interaction (email, call, meeting, or demo) with a contact.",
  parameters: Type.Object({
    contactId: Type.String({ description: "Contact ID" }),
    type: Type.Union(
      [Type.Literal("email"), Type.Literal("call"), Type.Literal("meeting"), Type.Literal("demo")],
      { description: "Interaction type" }
    ),
    summary: Type.String({ description: "Brief summary of the interaction" }),
  }),
  execute: async (_toolCallId, rawParams, _signal) => {
    const params = rawParams as { contactId: string; type: "email" | "call" | "meeting" | "demo"; summary: string };
    const contact = contacts.find((c) => c.id === params.contactId);
    if (!contact) {
      throw new Error(`Contact not found: ${params.contactId}`);
    }

    const interaction = addInteraction({
      contactId: params.contactId,
      date: new Date().toISOString().split("T")[0],
      type: params.type,
      summary: params.summary,
    });

    // Update last contact date
    contact.lastContactDate = interaction.date;

    return {
      content: [
        {
          type: "text",
          text: `Logged ${params.type} with ${contact.name}: "${params.summary}" (interaction ${interaction.id})`,
        },
      ],
      details: { interaction },
    };
  },
};
