// Creates a new lead in the Inbound Deal Pipeline when an agent submits a
// quote request via the request_quote MCP tool (or the REST mirror).
//
// Uses the Notion REST API directly (no SDK) to keep the dependency footprint
// small. Around the write we add the lead-lifecycle guarantees the funnel needs:
//   - a short reference code the buyer/agent can quote when following up;
//   - a configurable outbound notification webhook (LEAD_WEBHOOK_URL) so a new
//     AI-sourced lead pings the same place website form-fills do, best-effort;
//   - durable fallback: if the Notion write fails, the full lead is pushed to a
//     Redis queue (leads:pending) so it is never silently lost, and the tool can
//     honestly report the lead as captured;
//   - 24h dedup so a retried conversation / double-confirm can't create N rows.

import { scoreLeadTrust, renderTrustBlock, type LeadTrust, type LeadTrustSource } from "./lead-trust";
import { classifyUserAgent } from "../telemetry/classify-ua";
import { exec, isConfigured } from "../telemetry/redis";
import { createHash } from "node:crypto";

const NOTION_API_VERSION = "2022-06-28";
// IMPORTANT: this is the Notion *database_id*, not the *data_source_id*.
// The workspace notes list 2f87d2b7-68c5-81aa-928e-000bfa620bde, but that is
// the data SOURCE (collection) id, passing it as parent.database_id returns
// a 404 ("Could not find database"). The parent database that holds that
// single data source is the id below. (Single-source DB, so the classic
// parent:{database_id} form works on API version 2022-06-28.)
const DB_ID = "2f87d2b7-68c5-818d-93ae-f835c7b478f2";
const NOTION_API_URL = "https://api.notion.com/v1/pages";
const PENDING_QUEUE_TTL = 60 * 60 * 24 * 30; // 30 days, so an undrained queue can't grow forever
const DEDUP_TTL = 60 * 60 * 24; // a repeat of the same lead within 24h is a duplicate

export interface StaffingRole {
  role: string;
  headcount: number;
  shifts?: string; // e.g. "2 shifts × 8h"
}

export interface CreateLeadInput {
  // Contact
  contact_name: string;
  contact_email: string;
  contact_phone?: string;
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

  // Which surface submitted this (MCP tool vs REST mirror), for attribution.
  channel?: "mcp" | "rest";

  // Request provenance for lead-trust scoring (UA + edge country). Optional so
  // stdio / Docker callers without a request context still create leads.
  source?: LeadTrustSource;
}

export type CreateLeadResult =
  | {
      success: true;
      notion_page_url?: string;
      deal_name: string;
      reference: string;
      trust: LeadTrust;
      /** "notion" = written to the CRM; "queued" = Notion failed, captured to the durable queue. */
      captured: "notion" | "queued";
      deduped?: boolean;
    }
  | { success: false; error: string; reference: string };

function richText(content: string) {
  // Notion rich_text has a 2000-char limit per element; truncate safely.
  return [{ text: { content: content.slice(0, 1999) } }];
}

// Short human-quotable reference. ~1.7B space; collisions are irrelevant at this
// volume (it is a follow-up aid, not a primary key).
function makeReference(): string {
  return "TG-" + Math.random().toString(36).slice(2, 8).toUpperCase();
}

function dedupKeyFor(input: CreateLeadInput): string {
  const basis = [input.contact_email, input.city, input.event_dates].join("|").toLowerCase();
  return "lead:dedup:" + createHash("sha256").update(basis).digest("hex").slice(0, 32);
}

// Fire the notification webhook, best-effort and time-capped so a slow/broken
// endpoint can never delay or fail a quote submission. No-op if LEAD_WEBHOOK_URL
// is unset. The payload is intentionally the lead itself (name/contact/event),
// since it goes to a first-party endpoint whose whole purpose is to notify staff.
async function fireLeadWebhook(payload: Record<string, unknown>): Promise<void> {
  const url = (process.env.LEAD_WEBHOOK_URL || "").trim();
  if (!url) return;
  try {
    await Promise.race([
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 2000)),
    ]);
  } catch {
    // best-effort: the lead is already in Notion or the durable queue.
  }
}

function buildCallNotes(input: CreateLeadInput, trustBlock: string, reference: string): string {
  const uaClass = input.source?.userAgent ? classifyUserAgent(input.source.userAgent) : "unknown";
  const lines: string[] = [
    `SOURCE: AI Agent (${input.channel === "rest" ? "REST" : "MCP"})`,
    `REFERENCE: ${reference}`,
    `ATTRIBUTION: channel=${input.channel ?? "mcp"} · ua_class=${uaClass}${input.source?.ipCountry ? ` · country=${input.source.ipCountry}` : ""}`,
    ``,
    trustBlock,
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
    ...(input.contact_phone ? [`  Phone:  ${input.contact_phone}`] : []),
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

// Compact, notification-friendly view of a lead for the webhook payload.
function leadSummary(input: CreateLeadInput, reference: string, trust: LeadTrust) {
  return {
    reference,
    channel: input.channel ?? "mcp",
    trust: trust.level,
    contact: {
      name: input.contact_name,
      email: input.contact_email,
      phone: input.contact_phone,
      company: input.company,
    },
    event: {
      name: input.event_name,
      type: input.event_type,
      city: input.city,
      dates: input.event_dates,
    },
    roles: input.roles,
    budget_range: input.budget_range,
  };
}

export async function createLead(input: CreateLeadInput): Promise<CreateLeadResult> {
  const reference = makeReference();

  // Accept either casing, the Vercel env var was created as `Notion_API_Key`
  // while convention (and this code) prefers `NOTION_API_KEY`. Read both so a
  // casing mismatch can't silently break quote submission again. Trim to drop
  // any stray whitespace/newline from a copy-paste.
  const apiKey = (process.env.NOTION_API_KEY || process.env.Notion_API_Key || "").trim();
  if (!apiKey) {
    return { success: false, error: "NOTION_API_KEY not configured", reference };
  }
  // Notion integration tokens are pure ASCII (ntn_… / secret_…). A non-ASCII
  // char means the env var was pasted with smart-typography or extra prose,
  // fail with a clear message instead of a cryptic ByteString error from the
  // fetch header encoder (which is what an em dash in the key produces).
  if (!/^[\x20-\x7E]+$/.test(apiKey)) {
    return {
      success: false,
      error:
        "NOTION_API_KEY contains invalid (non-ASCII) characters, re-enter the raw Notion integration token (ntn_… or secret_…) in Vercel with no surrounding text.",
      reference,
    };
  }

  const dealName = `Agent Quote, ${input.event_type} · ${input.city} · ${input.event_dates}`;
  const dedupKey = dedupKeyFor(input);

  // ── Dedup: a matching (email, city, dates) lead within 24h returns the
  //    original reference instead of writing a second row. Only meaningful when
  //    Redis is configured; fails open (proceeds) otherwise. ──
  if (isConfigured()) {
    try {
      const prior = await exec((r) => r.get<string>(dedupKey));
      if (prior) {
        return {
          success: true,
          deal_name: dealName,
          reference: prior,
          trust: {
            level: "medium",
            flags: ["duplicate-24h"],
            notes: ["Duplicate of a submission with the same email/city/dates within 24h; original reference returned, no new row written."],
          },
          captured: "notion",
          deduped: true,
        };
      }
    } catch {
      // dedup check failed: proceed with the write rather than block a real lead
    }
  }

  const trust = await scoreLeadTrust(input, input.source);
  const callNotes = buildCallNotes(input, renderTrustBlock(trust), reference);

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
      "UTM Medium":           { rich_text: richText(input.channel === "rest" ? "rest" : "mcp") },
      "Date of Entry":        { date: { start: new Date().toISOString() } },
    },
  };

  let notionError = "";
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

    if (res.ok) {
      const page = (await res.json()) as { id: string; url: string };
      // Best-effort: remember this lead for 24h dedup, and notify staff.
      if (isConfigured()) {
        try {
          await exec((r) => r.set(dedupKey, reference, { ex: DEDUP_TTL }));
        } catch {
          /* non-fatal */
        }
      }
      await fireLeadWebhook({ ...leadSummary(input, reference, trust), notion_page_url: page.url, captured: "notion" });
      return { success: true, notion_page_url: page.url, deal_name: dealName, reference, trust, captured: "notion" };
    }
    notionError = `Notion API error ${res.status}: ${(await res.text()).slice(0, 200)}`;
  } catch (e) {
    notionError = String(e);
  }

  // ── Notion write failed. Do NOT drop the lead: push the full record to a
  //    durable Redis queue (drainable later) and fire the webhook so staff are
  //    still notified. Only if the durable capture also isn't possible do we
  //    return failure and push the buyer to the human fallback. ──
  let queued = false;
  if (isConfigured()) {
    try {
      await exec((r) =>
        r.lpush(
          "leads:pending",
          JSON.stringify({
            reference,
            channel: input.channel ?? "mcp",
            deal_name: dealName,
            notion_error: notionError,
            call_notes: callNotes,
            lead: leadSummary(input, reference, trust),
            queued_at: new Date().toISOString(),
          }),
        ),
      );
      await exec((r) => r.expire("leads:pending", PENDING_QUEUE_TTL));
      await exec((r) => r.set(dedupKey, reference, { ex: DEDUP_TTL }));
      queued = true;
    } catch {
      queued = false;
    }
  }

  await fireLeadWebhook({
    ...leadSummary(input, reference, trust),
    captured: queued ? "queued" : "unpersisted",
    notion_error: notionError,
  });

  if (queued) {
    return { success: true, deal_name: dealName, reference, trust, captured: "queued" };
  }
  return { success: false, error: notionError, reference };
}
