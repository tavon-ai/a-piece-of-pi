/**
 * CRM Extension
 *
 * 1. /pipeline command — interactive contact browser with actions
 * 2. tool_call gate — confirms before editing/writing contact files
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { matchesKey, truncateToWidth } from "@mariozechner/pi-tui";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// ── Parse contact frontmatter ──────────────────────────────────────

interface Contact {
	id: string;
	name: string;
	company: string;
	status: string;
	score: string;
	industry: string;
	companySize: number;
	annualRevenue: number;
	role: string;
	email: string;
	lastContactDate: string;
	file: string;
}

function parseContact(filePath: string, cwd: string): Contact | null {
	try {
		const content = readFileSync(join(cwd, filePath), "utf-8");
		const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
		if (!fmMatch) return null;

		const fm: Record<string, string> = {};
		for (const line of fmMatch[1].split("\n")) {
			const idx = line.indexOf(":");
			if (idx === -1) continue;
			const key = line.slice(0, idx).trim();
			const val = line.slice(idx + 1).trim();
			fm[key] = val;
		}

		const headingMatch = content.match(/^#\s+(.+?)\s*—\s*(.+)$/m);
		const name = headingMatch?.[1] ?? fm.id ?? "Unknown";
		const company = headingMatch?.[2] ?? "Unknown";

		return {
			id: fm.id ?? "",
			name,
			company,
			status: fm.status ?? "unknown",
			score: fm.score ?? "",
			industry: fm.industry ?? "",
			companySize: parseInt(fm.companySize) || 0,
			annualRevenue: parseInt(fm.annualRevenue) || 0,
			role: fm.role ?? "",
			email: fm.email ?? "",
			lastContactDate: fm.lastContactDate ?? "",
			file: filePath,
		};
	} catch {
		return null;
	}
}

function loadAllContacts(cwd: string): Contact[] {
	try {
		const files = readdirSync(join(cwd, "contacts")).filter((f) => f.endsWith(".md"));
		return files.map((f) => parseContact(`contacts/${f}`, cwd)).filter((c): c is Contact => c !== null);
	} catch {
		return [];
	}
}

// ── Extension ──────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	// ── 1. /pipeline command ─────────────────────────────────────────

	pi.registerCommand("pipeline", {
		description: "Interactive CRM pipeline — browse contacts, pick an action",
		handler: async (_args, ctx) => {
			const contacts = loadAllContacts(ctx.cwd);

			if (contacts.length === 0) {
				ctx.ui.notify("No contacts found in contacts/", "warning");
				return;
			}

			// Step 1: Pick a contact
			const tierIcon = (score: string) => {
				const n = parseInt(score);
				if (isNaN(n)) return "·";
				if (n >= 80) return "🔥";
				if (n >= 50) return "🟡";
				return "🧊";
			};

			const statusIcon: Record<string, string> = {
				new: "🆕",
				contacted: "📧",
				qualified: "✅",
				customer: "🤝",
				unqualified: "❌",
			};

			const options = contacts.map((c) => {
				const si = statusIcon[c.status] ?? "·";
				const score = c.score ? ` ${tierIcon(c.score)} ${c.score}` : "";
				return `${si} ${c.name} — ${c.company} [${c.status}]${score}`;
			});

			const picked = await ctx.ui.select("Select a contact:", options);
			if (!picked) return;

			const idx = options.indexOf(picked);
			const contact = contacts[idx];

			// Step 2: Pick an action
			const action = await ctx.ui.select(`${contact.name} (${contact.company})`, [
				"📊 Score this lead",
				"✅ Mark as qualified",
				"📧 Mark as contacted",
				"❌ Mark as unqualified",
				"📝 Log an interaction",
				"🔍 View full details",
			]);

			if (!action) return;

			// Step 3: Send as user message to pi
			const messages: Record<string, string> = {
				"📊 Score this lead": `Score ${contact.name} from ${contact.file}. Read the file, compute the score using the rubric, show the breakdown, and update the score in the frontmatter.`,
				"✅ Mark as qualified": `Update ${contact.name} in ${contact.file}: set status to "qualified" in the frontmatter.`,
				"📧 Mark as contacted": `Update ${contact.name} in ${contact.file}: set status to "contacted" in the frontmatter.`,
				"❌ Mark as unqualified": `Update ${contact.name} in ${contact.file}: set status to "unqualified" in the frontmatter.`,
				"📝 Log an interaction": `Ask me what type of interaction (email/call/meeting/demo) and a summary, then create a new interaction file in interactions/ for ${contact.name} (${contact.id}) and update lastContactDate in ${contact.file}.`,
				"🔍 View full details": `Read ${contact.file} and show me all details about ${contact.name}, including any interactions in interactions/ that reference ${contact.id}.`,
			};

			const msg = messages[action];
			if (msg) {
				pi.sendUserMessage(msg);
			}
		},
	});

	// ── 2. Gate writes to contact files ──────────────────────────────

	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "edit" && event.toolName !== "write") return undefined;

		const path = (event.input as any).path as string;
		if (!path || !path.startsWith("contacts/")) return undefined;

		if (!ctx.hasUI) {
			return { block: true, reason: "Contact modification blocked (no UI for confirmation)" };
		}

		const contact = parseContact(path, ctx.cwd);
		const label = contact ? `${contact.name} (${contact.company})` : path;

		const action = event.toolName === "edit" ? "Edit" : "Write";
		const choice = await ctx.ui.select(`${action} contact file: ${label}\n\nAllow?`, ["Yes", "No"]);

		if (choice !== "Yes") {
			return { block: true, reason: "User declined contact modification" };
		}

		return undefined;
	});
}
