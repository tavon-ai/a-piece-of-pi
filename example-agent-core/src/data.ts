// ── Mock CRM Database ──────────────────────────────────────────────

export interface Contact {
  id: string;
  name: string;
  company: string;
  email: string;
  role: string;
  industry: string;
  companySize: number;
  annualRevenue: number;
  lastContactDate: string;
  status: "new" | "contacted" | "qualified" | "unqualified" | "customer";
  score?: number;
  notes: string[];
}

export interface Interaction {
  id: string;
  contactId: string;
  date: string;
  type: "email" | "call" | "meeting" | "demo";
  summary: string;
}

// In-memory CRM data
export const contacts: Contact[] = [
  {
    id: "c1",
    name: "Sarah Chen",
    company: "TechNova Inc",
    email: "sarah@technova.io",
    role: "VP of Engineering",
    industry: "SaaS",
    companySize: 250,
    annualRevenue: 45_000_000,
    lastContactDate: "2026-03-20",
    status: "new",
    notes: ["Inbound from website, interested in enterprise plan"],
  },
  {
    id: "c2",
    name: "Marcus Johnson",
    company: "RetailFlow",
    email: "marcus@retailflow.com",
    role: "CTO",
    industry: "E-commerce",
    companySize: 80,
    annualRevenue: 12_000_000,
    lastContactDate: "2026-03-15",
    status: "contacted",
    notes: ["Met at conference", "Asked about API integrations"],
  },
  {
    id: "c3",
    name: "Lisa Park",
    company: "HealthBridge",
    email: "lpark@healthbridge.org",
    role: "Director of IT",
    industry: "Healthcare",
    companySize: 500,
    annualRevenue: 80_000_000,
    lastContactDate: "2026-02-28",
    status: "new",
    notes: ["Needs HIPAA compliance", "Budget approved for Q2"],
  },
  {
    id: "c4",
    name: "Tom Rivera",
    company: "PixelCraft Studios",
    email: "tom@pixelcraft.co",
    role: "Founder",
    industry: "Gaming",
    companySize: 15,
    annualRevenue: 800_000,
    lastContactDate: "2026-01-10",
    status: "new",
    notes: ["Early-stage startup", "Looking for free tier"],
  },
  {
    id: "c5",
    name: "Anika Patel",
    company: "FinServ Global",
    email: "apatel@finservglobal.com",
    role: "Head of Platform",
    industry: "Financial Services",
    companySize: 2000,
    annualRevenue: 300_000_000,
    lastContactDate: "2026-03-25",
    status: "contacted",
    notes: ["Enterprise RFP in progress", "Needs SOC2 + on-prem option"],
  },
];

export const interactions: Interaction[] = [
  {
    id: "i1",
    contactId: "c1",
    date: "2026-03-20",
    type: "email",
    summary: "Initial outreach after website signup. Expressed interest in enterprise features.",
  },
  {
    id: "i2",
    contactId: "c2",
    date: "2026-03-10",
    type: "meeting",
    summary: "30-min intro call. Discussed API capabilities and pricing tiers.",
  },
  {
    id: "i3",
    contactId: "c2",
    date: "2026-03-15",
    type: "email",
    summary: "Sent follow-up with API docs and case studies.",
  },
  {
    id: "i4",
    contactId: "c5",
    date: "2026-03-22",
    type: "demo",
    summary: "Full platform demo for FinServ team. 5 attendees. Strong interest in compliance module.",
  },
];

let nextInteractionId = 5;

export function addInteraction(interaction: Omit<Interaction, "id">): Interaction {
  const newInteraction = { ...interaction, id: `i${nextInteractionId++}` };
  interactions.push(newInteraction);
  return newInteraction;
}
