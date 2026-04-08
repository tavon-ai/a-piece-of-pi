/**
 * Contact Editor Extension
 *
 * /edit command — inline record editor with constrained fields.
 *
 * Unlike /pipeline (which crafts a prompt and lets the agent do the work),
 * this command edits the file directly — no LLM involved.
 *
 * Showcases: ctx.ui.custom() with a full TUI component, keyboard handling,
 * direct file I/O, and theme integration.
 *
 * UI: Navigate with ↑↓, press Enter to edit a field.
 *   - Fields with a fixed set of values → inline dropdown (↑↓ to pick, Enter to confirm)
 *   - Free-text fields → inline text input (type, Enter to confirm)
 *   - Read-only fields → Enter does nothing
 *   - Esc always cancels the current edit or exits the editor
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Key, matchesKey, truncateToWidth } from "@mariozechner/pi-tui";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ── Types ──────────────────────────────────────────────────────────

interface Contact {
	name: string;
	company: string;
	status: string;
	score: string;
	industry: string;
	companySize: string;
	annualRevenue: string;
	role: string;
	email: string;
	lastContactDate: string;
	file: string;
}

const VALID_STATUSES = ["new", "contacted", "qualified", "unqualified", "customer"] as const;

const STATUS_ICONS: Record<string, string> = {
	new: "🆕",
	contacted: "📧",
	qualified: "✅",
	unqualified: "❌",
	customer: "🤝",
};

// ── File I/O ───────────────────────────────────────────────────────

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
		return {
			name: headingMatch?.[1] ?? fm.id ?? "Unknown",
			company: headingMatch?.[2] ?? "Unknown",
			status: fm.status ?? "unknown",
			score: fm.score ?? "",
			industry: fm.industry ?? "",
			companySize: fm.companySize ?? "",
			annualRevenue: fm.annualRevenue ?? "",
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

function updateFrontmatterField(filePath: string, cwd: string, field: string, value: string): void {
	const fullPath = join(cwd, filePath);
	const content = readFileSync(fullPath, "utf-8");
	const fmMatch = content.match(/^(---\n)([\s\S]*?)(\n---)/);
	if (!fmMatch) return;

	const lines = fmMatch[2].split("\n");
	let found = false;
	const updatedLines = lines.map((line) => {
		const idx = line.indexOf(":");
		if (idx === -1) return line;
		const key = line.slice(0, idx).trim();
		if (key === field) {
			found = true;
			return `${key}: ${value}`;
		}
		return line;
	});
	if (!found) {
		updatedLines.push(`${field}: ${value}`);
	}

	const newContent = content.replace(fmMatch[0], `${fmMatch[1]}${updatedLines.join("\n")}${fmMatch[3]}`);
	writeFileSync(fullPath, newContent, "utf-8");
}

// ── Formatting helpers ─────────────────────────────────────────────

function formatRevenue(raw: string): string {
	const n = parseInt(raw);
	if (isNaN(n)) return raw || "—";
	if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
	if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(0)}M`;
	if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
	return `$${n}`;
}

function tierIcon(score: string): string {
	const n = parseInt(score);
	if (isNaN(n)) return "·";
	if (n >= 80) return "🔥";
	if (n >= 50) return "🟡";
	return "🧊";
}

// ── Field definitions ──────────────────────────────────────────────

type FieldType = "select" | "text" | "readonly";

interface Field {
	key: string;
	label: string;
	type: FieldType;
	getValue: (c: Contact) => string;
	format?: (value: string) => string;
	// For "select" fields
	options?: readonly string[];
	formatOption?: (value: string) => string;
	// For "text" fields
	validate?: (value: string) => boolean;
	placeholder?: string;
}

const FIELDS: Field[] = [
	{
		key: "status",
		label: "Status",
		type: "select",
		getValue: (c) => c.status,
		format: (v) => `${STATUS_ICONS[v] ?? "·"} ${v}`,
		options: VALID_STATUSES,
		formatOption: (v) => `${STATUS_ICONS[v] ?? "·"} ${v}`,
	},
	{
		key: "score",
		label: "Score",
		type: "text",
		getValue: (c) => c.score,
		format: (v) => (v ? `${tierIcon(v)} ${v}` : "—"),
		validate: (v) => v === "" || (/^\d+$/.test(v) && parseInt(v) >= 0 && parseInt(v) <= 100),
		placeholder: "0–100",
	},
	{
		key: "industry",
		label: "Industry",
		type: "readonly",
		getValue: (c) => c.industry || "—",
	},
	{
		key: "role",
		label: "Role",
		type: "readonly",
		getValue: (c) => c.role || "—",
	},
	{
		key: "companySize",
		label: "Company",
		type: "readonly",
		getValue: (c) => (c.companySize ? `${c.companySize} employees` : "—"),
	},
	{
		key: "annualRevenue",
		label: "Revenue",
		type: "readonly",
		getValue: (c) => formatRevenue(c.annualRevenue),
	},
	{
		key: "email",
		label: "Email",
		type: "readonly",
		getValue: (c) => c.email || "—",
	},
	{
		key: "lastContactDate",
		label: "Last Contact",
		type: "readonly",
		getValue: (c) => c.lastContactDate || "—",
	},
];

// ── Extension ──────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	pi.registerCommand("edit", {
		description: "Edit a contact record with constrained fields",
		handler: async (_args, ctx) => {
			const contacts = loadAllContacts(ctx.cwd);
			if (contacts.length === 0) {
				ctx.ui.notify("No contacts found in contacts/", "warning");
				return;
			}

			// Step 1: Pick a contact
			const options = contacts.map((c) => {
				const si = STATUS_ICONS[c.status] ?? "·";
				const score = c.score ? ` ${tierIcon(c.score)} ${c.score}` : "";
				return `${si} ${c.name} — ${c.company} [${c.status}]${score}`;
			});

			const picked = await ctx.ui.select("Edit which contact?", options);
			if (!picked) return;

			const idx = options.indexOf(picked);
			const contact = contacts[idx];

			// Step 2: Inline editor
			interface EditResult {
				saved: boolean;
				changes: { field: string; from: string; to: string }[];
			}

			const result = await ctx.ui.custom<EditResult>((tui, theme, _kb, done) => {
				// ── State ───────────────────────────────────────────
				let selectedRow = 0;
				let editMode: "none" | "select" | "text" = "none";
				let dropdownIndex = 0;
				let textBuffer = "";

				const values: Record<string, string> = {};
				for (const f of FIELDS) {
					values[f.key] = f.getValue(contact);
				}
				let cachedLines: string[] | undefined;

				function refresh() {
					cachedLines = undefined;
					tui.requestRender();
				}

				function collectChanges(): { field: string; from: string; to: string }[] {
					const changes: { field: string; from: string; to: string }[] = [];
					for (const f of FIELDS) {
						if (f.type === "readonly") continue;
						const original = f.getValue(contact);
						const current = values[f.key];
						if (current !== original) {
							changes.push({ field: f.key, from: original, to: current });
						}
					}
					return changes;
				}

				// ── Input: dropdown mode ────────────────────────────

				function handleSelectMode(data: string) {
					const field = FIELDS[selectedRow];
					const opts = field.options!;

					if (matchesKey(data, Key.up)) {
						dropdownIndex = Math.max(0, dropdownIndex - 1);
						refresh();
					} else if (matchesKey(data, Key.down)) {
						dropdownIndex = Math.min(opts.length - 1, dropdownIndex + 1);
						refresh();
					} else if (matchesKey(data, Key.enter)) {
						values[field.key] = opts[dropdownIndex];
						editMode = "none";
						refresh();
					} else if (matchesKey(data, Key.escape)) {
						editMode = "none";
						refresh();
					}
				}

				// ── Input: text mode ────────────────────────────────

				function handleTextMode(data: string) {
					const field = FIELDS[selectedRow];

					if (matchesKey(data, Key.enter)) {
						if (!field.validate || field.validate(textBuffer)) {
							values[field.key] = textBuffer;
							editMode = "none";
						}
						refresh();
					} else if (matchesKey(data, Key.escape)) {
						editMode = "none";
						refresh();
					} else if (matchesKey(data, Key.backspace)) {
						textBuffer = textBuffer.slice(0, -1);
						refresh();
					} else if (data.length === 1 && !data.startsWith("\x1b")) {
						textBuffer += data;
						refresh();
					}
				}

				// ── Input: navigation mode ──────────────────────────

				function handleInput(data: string) {
					if (editMode === "select") return handleSelectMode(data);
					if (editMode === "text") return handleTextMode(data);

					// ↑↓ navigate
					if (matchesKey(data, Key.up)) {
						selectedRow = Math.max(0, selectedRow - 1);
						refresh();
						return;
					}
					if (matchesKey(data, Key.down)) {
						selectedRow = Math.min(FIELDS.length - 1, selectedRow + 1);
						refresh();
						return;
					}

					const field = FIELDS[selectedRow];

					// Enter → open field editor
					if (matchesKey(data, Key.enter)) {
						if (field.type === "select") {
							editMode = "select";
							dropdownIndex = field.options!.indexOf(values[field.key] as any);
							if (dropdownIndex < 0) dropdownIndex = 0;
							refresh();
						} else if (field.type === "text") {
							editMode = "text";
							textBuffer = values[field.key] || "";
							refresh();
						}
						return;
					}

					// Ctrl+S → save
					if (matchesKey(data, Key.ctrl("s"))) {
						done({ saved: true, changes: collectChanges() });
						return;
					}

					// Esc → exit
					if (matchesKey(data, Key.escape)) {
						done({ saved: false, changes: [] });
						return;
					}
				}

				// ── Rendering ───────────────────────────────────────

				function render(width: number): string[] {
					if (cachedLines) return cachedLines;

					const lines: string[] = [];
					const add = (s: string) => lines.push(truncateToWidth(s, width));
					const bar = "─".repeat(Math.min(width, 50));
					const labelWidth = 14;

					// Header
					add(theme.fg("accent", bar));
					add(theme.fg("accent", theme.bold(` ✏ ${contact.name} — ${contact.company}`)));
					add(theme.fg("accent", bar));
					lines.push("");

					// Fields
					for (let i = 0; i < FIELDS.length; i++) {
						const f = FIELDS[i];
						const isSelected = i === selectedRow;
						const rawValue = values[f.key];
						const displayValue = f.format ? f.format(rawValue) : rawValue || "—";

						const cursor = isSelected ? theme.fg("accent", " ▸ ") : "   ";
						const label = theme.fg("muted", f.label.padEnd(labelWidth));

						// ── Select field with open dropdown ──
						if (f.type === "select" && editMode === "select" && isSelected) {
							add(`${cursor}${label}${theme.fg("accent", "▼")}`);
							for (let j = 0; j < f.options!.length; j++) {
								const opt = f.options![j];
								const optLabel = f.formatOption ? f.formatOption(opt) : opt;
								const isHighlighted = j === dropdownIndex;
								const pad = "".padEnd(labelWidth);
								if (isHighlighted) {
									add(`     ${pad}${theme.bg("selectedBg", theme.fg("text", ` ${optLabel} `))}`);
								} else {
									add(`     ${pad}${theme.fg("dim", ` ${optLabel}`)}`);
								}
							}
							continue;
						}

						// ── Text field with open input ──
						if (f.type === "text" && editMode === "text" && isSelected) {
							const valid = !f.validate || f.validate(textBuffer);
							const inputDisplay = textBuffer || theme.fg("dim", f.placeholder || "");
							const cursorChar = theme.fg("accent", "█");
							const indicator = textBuffer && !valid ? theme.fg("error", " ✘") : "";
							add(`${cursor}${label}${inputDisplay}${cursorChar}${indicator}`);
							continue;
						}

						// ── Normal display ──
						if (isSelected && f.type !== "readonly") {
							const hint = theme.fg("dim", "  ↵ edit");
							add(`${cursor}${label}${theme.fg("accent", displayValue)}${hint}`);
						} else if (isSelected) {
							add(`${cursor}${label}${theme.fg("text", displayValue)}`);
						} else {
							const valueColor = f.type !== "readonly" ? "text" : "dim";
							add(`${cursor}${label}${theme.fg(valueColor, displayValue)}`);
						}
					}

					// Change preview
					lines.push("");
					const changes = collectChanges();
					if (changes.length > 0) {
						const changeDesc = changes.map((c) => `${c.field}: ${c.from || "—"} → ${c.to}`).join(", ");
						add(theme.fg("warning", `  Changes: ${changeDesc}`));
						lines.push("");
					}

					// Context-sensitive help
					let help: string;
					if (editMode === "select") {
						help = "↑↓ pick  •  Enter confirm  •  Esc cancel";
					} else if (editMode === "text") {
						help = "Type a value  •  Enter confirm  •  Esc cancel";
					} else {
						help = "↑↓ navigate  •  Enter edit  •  Ctrl+S save  •  Esc exit";
					}
					add(theme.fg("dim", `  ${help}`));
					add(theme.fg("accent", bar));

					cachedLines = lines;
					return lines;
				}

				return {
					render,
					invalidate: () => { cachedLines = undefined; },
					handleInput,
				};
			});

			// Step 3: Write changes to file
			if (!result.saved || result.changes.length === 0) {
				ctx.ui.notify(result.saved ? "No changes" : "Edit cancelled", "info");
				return;
			}

			for (const change of result.changes) {
				updateFrontmatterField(contact.file, ctx.cwd, change.field, change.to);
			}

			const summary = result.changes.map((c) => `${c.field}: ${c.from || "—"} → ${c.to}`).join(", ");
			ctx.ui.notify(`Updated ${contact.name}: ${summary}`, "success");
		},
	});
}
