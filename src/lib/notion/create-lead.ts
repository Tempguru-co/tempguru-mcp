// Creates a new lead in the Inbound Deal Pipeline when an agent submits a
// quote request via the request_quote MCP tool.
//
// Uses the Notion REST API directly (no SDK) to keep the dependency footprint
// small. All writes are fire-and-NOT-forgotten, we await the result so the
// MCP tool can confirm success or surface a clean error message.

const NOTION_API_VERSION = "2022-06-28";
// IMPORTANT: this is the Notion *database_id*, not the *data_source_id*.
// The workspace notes list 2f87d2b7-68c5-81aa-928e-000bfa620bde, but that is
// the data SOURCE (collection) id, passing it as parent.database_id returns
// a 404 ("Could not find database"). The parent database that holds that
// single data source is the id below. (Single-source DB, so the classic
// parent:{database_id} form works on API version 2022-06-28.)
const DB_ID = "2f87d2b7-68c5-818d-93ae-f835c7b478f2";
const NOTION_API_URL = "https://api.notion.com/v1/pages";

export interface StaffingRole {
  role: string;
  headcount: number;
  shifts?: string; // e.g. "2 shifts × 8h"
}

export interface CreateLeadInput {
  // Contact
  contact_name: string;
  contact_email: string;
  company: string;

  // Event
  event_name: string;
  event_type: string;
  city: string;
  event_dates: string;

  // Staffing plan
  roles: StaffingRole[];
  budget_range?: string;
  attire?: string;
  special_requirements?: string;
  compliance_notes?: string;
}

export type CreateLeadResult =
  | { success: true; notion_page_url: string; deal_name: string }
  | { success: false; error: string };

function richText(content: string) {
  // Notion rich_text has a 2000-char limit per element; truncate safely.
  return [{ text: { content: content.slice(0, 1999) } }];
}

function buildCallNotes(input: CreateLeadInput): string {
  const lines: string[] = [
    `SOURCE: AI Agent (MCP)`,
    ``,
    `EVENT`,
    `  Name:   ${input.event_name}`,
    `  Type:   ${input.event_type}`,
    `  City:   ${input.city}`,
    `  Dates:  ${input.event_dates}`,
    ``,
    `CONTACT`,
    `  Name:   ${input.contact_name}`,
    `  Email:  ${input.contact_email}`,
    `  Co:     ${input.company}`,
    ``,
    `STAFFING PLAN`,
    ...input.roles.map(
      (r) =>
        `  ${r.role}: ${r.headcount} staff${r.shifts ? ` (${r.shifts})` : ""}`
    ),
  ];

  if (input.budget_range) {
    lines.push(``, `ESTIMATED BUDGET RANGE`, `  ${input.budget_range}`);
  }
  if (input.attire) {
    lines.push(``, `ATTIRE`, `  ${input.attire}`);
  }
  if (input.compliance_notes) {
    lines.push(``, `COMPLIANCE NOTES`, `  ${input.compliance_notes}`);
  }
  if (input.special_requirements) {
    lines.push(``, `SPECIAL REQUIREMENTS`, `  ${input.special_requirements}`);
  }

  return lines.join("\n");
}

export async function createLead(input: CreateLeadInput): Promise<CreateLeadResult> {
  // Accept either casing, the Vercel env var was created as `Notion_API_Key`
  // while convention (and this code) prefers `NOTION_API_KEY`. Read both so a
  // casing mismatch can't silently break quote submission again. Trim to drop
  // any stray whitespace/newline from a copy-paste.
  const apiKey = (process.env.NOTION_API_KEY || process.env.Notion_API_Key || "").trim();
  if (!apiKey) {
    return { success: false, error: "NOTION_API_KEY not configured" };
  }
  // Notion integration tokens are pure ASCII (ntn_… / secret_…). A non-ASCII
  // char means the env var was pasted with smart-typography or extra prose, // fail with a clear message instead of a cryptic ByteString error from the
  // fetch header encoder (which is what an em dash in the key produces).
  if (!/^[\x20-\x7E]+$/.test(apiKey)) {
    return {
      success: false,
      error:
        "NOTION_API_KEY contains invalid (non-ASCII) characters, re-enter the raw Notion integration token (ntn_… or secret_…) in Vercel with no surrounding text.",
    };
  }

  const dealName = `Agent Quote, ${input.event_type} · ${input.city} · ${input.event_dates}`;
  const today = new Date().toISOString().slice(0, 10);
  const callNotes = buildCallNotes(input);

  const body = {
    parent: { database_id: DB_ID },
    properties: {
      "Deal Name":            { title: richText(dealName) },
      "Deal Stage":           { status: { name: "Lead" } },
      "Pipeline Type":        { select: { name: "Inbound" } },
      "Calendly Event Type":  { select: { name: "Quote Request" } },
      "Routing":              { select: { name: "Megan" } },
      "City":                 { rich_text: richText(input.city) },
      "Company":              { rich_text: richText(input.company) },
      "Main Contact":         { rich_text: richText(input.contact_name) },
      "Client Email":         { email: input.contact_email },
      "Call Notes":           { rich_text: richText(callNotes) },
      "Self-Reported Source": { rich_text: richText("AI Agent (MCP)") },
      "UTM Source":           { rich_text: richText("ai-agent") },
      "UTM Medium":           { rich_text: richText("mcp") },
      "Date of Entry":        { date: { start: today } },
    },
  };

  try {
    const res = await fetch(NOTION_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Notion-Version": NOTION_API_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      return { success: false, error: `Notion API error ${res.status}: ${err.slice(0, 200)}` };
    }

    const page = await res.json() as { id: string; url: string };
    return {
      success: true,
      notion_page_url: page.url,
      deal_name: dealName,
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}
