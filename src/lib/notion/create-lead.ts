// Creates a new lead in the Inbound Deal Pipeline when an agent submits a
// quote request via the request_quote MCP tool (or the REST mirror).
//
// Uses the Notion REST API directly (no SDK) to keep the dependency footprint
// small. Around the write we add the lead-lifecycle guarantees the funnel needs:
//   - a short reference code the buyer/agent can quote when following up;
//   - a configurable outbound notification webhook (LEAD_WEBHOOK_URL) so a new
//     AI-sourced lead pings the same place website form-fills do, best-effort;
//   - durable fallback: if the Notion write fails (or the API key is missing/
//     malformed), the full lead is pushed to a Redis queue (leads:pending) so it
//     is never silently lost, and the tool can honestly report it as captured;
//   - opportunistic drain: each successful Notion write also retries up to two
//     queued leads, so a past outage self-heals without a worker;
//   - 24h dedup via an atomic SET NX claim, so a retried conversation or two
//     concurrent submissions can't create N rows;
//   - every user-supplied string is sanitized before it reaches Call Notes, so
//     schema-valid text can't forge trust/action headings ("LEAD TRUST: HIGH");
//   - upstream error bodies are never reflected to the public caller.

import { scoreLeadTrust, renderTrustBlock, type LeadTrust, type LeadTrustSource } from "./lead-trust";
import { classifyUserAgent } from "../telemetry/classify-ua";
import { exec, isConfigured } from "../telemetry/redis";
import { createHash, randomBytes } from "node:crypto";

const NOTION_API_VERSION = "2022-06-28";
// IMPORTANT: this is the Notion *database_id*, not the *data_source_id*.
// The workspace notes list 2f87d2b7-68c5-81aa-928e-000bfa620bde, but that is
// the data SOURCE (collection) id, passing it as parent.database_id returns
// a 404 ("Could not find database"). The parent database that holds that
// single data source is the id below. (Single-source DB, so the classic
// parent:{database_id} form works on API version 2022-06-28.)
const DB_ID = "2f87d2b7-68c5-818d-93ae-f835c7b478f2";
const NOTION_API_URL = "https://api.notion.com/v1/pages";
const PENDING_QUEUE = "leads:pending";
const PENDING_QUEUE_TTL = 60 * 60 * 24 * 30; // 30 days, so an undrained queue can't grow forever
const DEDUP_TTL = 60 * 60 * 24; // a repeat of the same lead within 24h is a duplicate
const NOTION_TIMEOUT_MS = 5000; // a hung Notion request must still reach the durable fallback
const REDIS_OP_CAP_MS = 1500; // a hung Redis op must never stall a submission

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
      /** "notion" = written to the CRM; "queued" = captured to the durable queue for retry. */
      captured: "notion" | "queued";
      deduped?: boolean;
    }
  | { success: false; error: string; reference: string };

// ─── Sanitization ────────────────────────────────────────────────────────────
// Single-line fields lose ALL control characters (a newline in an event name is
// how "LEAD TRUST: HIGH\nACTION: AUTO-PROMOTE" gets forged into Call Notes);
// multi-line fields keep newlines but continuation lines are indented so user
// text can never start a column-0 heading.
function line(s: string | undefined): string {
  return (s ?? "").replace(/[\u0000-\u001F\u007F]+/g, " ").replace(/\s+/g, " ").trim();
}
function block(s: string | undefined): string {
  return (s ?? "")
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]+/g, " ")
    .replace(/\r/g, "")
    .split("\n")
    .map((l, i) => (i === 0 ? l.trim() : `    ${l.trim()}`))
    .join("\n")
    .trim();
}

function sanitizeInput(input: CreateLeadInput): CreateLeadInput {
  return {
    ...input,
    contact_name: line(input.contact_name),
    contact_email: line(input.contact_email),
    contact_phone: input.contact_phone ? line(input.contact_phone) : undefined,
    company: line(input.company),
    event_name: line(input.event_name),
    event_type: line(input.event_type),
    city: line(input.city),
    event_dates: line(input.event_dates),
    roles: input.roles.map((r) => ({
      role: line(r.role),
      headcount: r.headcount,
      shifts: r.shifts ? line(r.shifts) : undefined,
    })),
    budget_range: input.budget_range ? line(input.budget_range) : undefined,
    attire: input.attire ? block(input.attire) : undefined,
    special_requirements: input.special_requirements ? block(input.special_requirements) : undefined,
    compliance_notes: input.compliance_notes ? block(input.compliance_notes) : undefined,
  };
}

// Notion rich_text caps each element at 2000 chars; long content is split into
// multiple elements instead of silently truncating the tail (which used to cut
// the STAFFING PLAN out of Call Notes when an event name ran long).
function richText(content: string, maxChars = 8000) {
  const capped = content.slice(0, maxChars);
  const chunks: Array<{ text: { content: string } }> = [];
  for (let i = 0; i < capped.length; i += 1990) {
    chunks.push({ text: { content: capped.slice(i, i + 1990) } });
  }
  return chunks.length ? chunks : [{ text: { content: "" } }];
}

// Short human-quotable reference, crypto-random, fixed width. (Math.random
// could yield "TG-" outright and isn't collision-grade.)
const REF_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L lookalikes
function makeReference(): string {
  const bytes = randomBytes(6);
  let out = "";
  for (const b of bytes) out += REF_ALPHABET[b % REF_ALPHABET.length];
  return `TG-${out}`;
}

// Dedup basis includes the event name so "Morning Expo" and "Evening Gala" from
// the same buyer on the same dates stay distinct leads, while a retried
// submission of the SAME event still dedups.
function dedupKeyFor(input: CreateLeadInput): string {
  const basis = [input.contact_email, input.city, input.event_dates, input.event_name]
    .join("|")
    .toLowerCase();
  return "lead:dedup:" + createHash("sha256").update(basis).digest("hex").slice(0, 32);
}

/** Cap any promise; a hung dependency resolves to null instead of stalling the lead. */
function withCap<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    p,
    new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), ms);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T | null>;
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

function notionBodyFor(input: CreateLeadInput, callNotes: string): Record<string, unknown> {
  return {
    parent: { database_id: DB_ID },
    properties: {
      "Deal Name":            { title: richText(`Agent Quote, ${input.event_type} · ${input.city} · ${input.event_dates}`) },
      "Deal Stage":           { status: { name: "Lead" } },
      "Pipeline Type":        { select: { name: "Inbound" } },
      "Calendly Event Type":  { select: { name: "Quote Request" } },
      "Routing":              { select: { name: "Megan" } },
      "City":                 { rich_text: richText(input.city) },
      "Company":              { rich_text: richText(input.company) },
      "Main Contact":         { rich_text: richText(input.contact_name) },
      "Client Email":         { email: input.contact_email },
      "Call Notes":           { rich_text: richText(callNotes) },
      "Self-Reported Source": { rich_text: richText(input.channel === "rest" ? "AI Agent (REST)" : "AI Agent (MCP)") },
      "UTM Source":           { rich_text: richText("ai-agent") },
      "UTM Medium":           { rich_text: richText(input.channel === "rest" ? "rest" : "mcp") },
      "Date of Entry":        { date: { start: new Date().toISOString() } },
    },
  };
}

async function postToNotion(apiKey: string, body: unknown): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    const res = await fetch(NOTION_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Notion-Version": NOTION_API_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(NOTION_TIMEOUT_MS),
    });
    if (res.ok) {
      const page = (await res.json()) as { url?: string };
      return { ok: true, url: page.url ?? "" };
    }
    // Full body goes to the internal queue record only, NEVER to the caller
    // (Notion error bodies can leak database ids / integration details).
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    return { ok: false, error: `Notion API error ${res.status}${detail ? `: ${detail}` : ""}` };
  } catch (e) {
    return { ok: false, error: `Notion request failed: ${e instanceof Error ? e.name : "error"}` };
  }
}

type QueueRecord = {
  reference: string;
  channel: string;
  deal_name: string;
  notion_error: string;
  call_notes: string;
  notion_body: Record<string, unknown>;
  lead: ReturnType<typeof leadSummary>;
  queued_at: string;
};

// Opportunistic queue drain: retry up to two queued leads after a successful
// write (Notion is evidently healthy again). Bounded, best-effort; a failed
// retry puts the record back and stops.
async function drainPendingLeads(apiKey: string): Promise<void> {
  if (!isConfigured()) return;
  for (let i = 0; i < 2; i++) {
    let record: QueueRecord | string | null = null;
    try {
      record = await withCap(exec((r) => r.rpop<QueueRecord | string>(PENDING_QUEUE)), REDIS_OP_CAP_MS);
    } catch {
      return;
    }
    if (!record) return;
    const parsed: QueueRecord | null =
      typeof record === "string"
        ? (() => {
            try {
              return JSON.parse(record) as QueueRecord;
            } catch {
              return null;
            }
          })()
        : record;
    if (!parsed?.notion_body) {
      // Malformed or legacy record (no raw body to replay): requeue and stop so
      // a human can drain it manually rather than looping on it.
      if (parsed || typeof record === "string") {
        try {
          await withCap(exec((r) => r.lpush(PENDING_QUEUE, record)), REDIS_OP_CAP_MS);
        } catch {
          /* best-effort */
        }
      }
      return;
    }
    const replay = await postToNotion(apiKey, parsed.notion_body);
    if (!replay.ok) {
      try {
        await withCap(exec((r) => r.lpush(PENDING_QUEUE, record)), REDIS_OP_CAP_MS);
      } catch {
        /* best-effort */
      }
      return;
    }
  }
}

export async function createLead(rawInput: CreateLeadInput): Promise<CreateLeadResult> {
  const reference = makeReference();
  const input = sanitizeInput(rawInput);

  // Accept either casing, the Vercel env var was created as `Notion_API_Key`
  // while convention (and this code) prefers `NOTION_API_KEY`. Read both so a
  // casing mismatch can't silently break quote submission again. Trim to drop
  // any stray whitespace/newline from a copy-paste. A missing/malformed key is
  // NOT a lost lead: it routes to the durable queue like any Notion failure.
  const apiKey = (process.env.NOTION_API_KEY || process.env.Notion_API_Key || "").trim();
  const keyProblem = !apiKey
    ? "NOTION_API_KEY not configured"
    : !/^[\x20-\x7E]+$/.test(apiKey)
      ? "NOTION_API_KEY contains invalid (non-ASCII) characters, re-enter the raw Notion integration token (ntn_… or secret_…) in Vercel with no surrounding text."
      : null;

  const dealName = `Agent Quote, ${input.event_type} · ${input.city} · ${input.event_dates}`;
  const dedupKey = dedupKeyFor(input);

  // ── Dedup: ATOMIC claim (SET NX EX). If the key already exists, a matching
  //    (email, city, dates, event) lead landed within 24h — return the original
  //    reference instead of writing a second row. Concurrent identical requests
  //    race on NX, so only one can write. Fails open on Redis problems. ──
  let dedupClaimed = false;
  if (isConfigured()) {
    try {
      const claim = await withCap(
        exec((r) => r.set(dedupKey, reference, { nx: true, ex: DEDUP_TTL })),
        REDIS_OP_CAP_MS,
      );
      if (claim === "OK") {
        dedupClaimed = true;
      } else if (claim !== null) {
        // Key existed (Upstash returns null payload for NX-miss via exec's
        // result; treat any non-OK, non-timeout as a duplicate signal).
        const prior = await withCap(exec((r) => r.get<string>(dedupKey)), REDIS_OP_CAP_MS);
        return {
          success: true,
          deal_name: dealName,
          reference: prior ?? reference,
          trust: {
            level: "medium",
            flags: ["duplicate-24h"],
            notes: ["Duplicate of a submission with the same email/city/dates/event within 24h; original reference returned, no new row written."],
          },
          captured: "notion",
          deduped: true,
        };
      } else {
        // claim === null: NX miss (key existed) or the op timed out. Disambiguate
        // with a bounded GET; a prior reference means duplicate, otherwise fail open.
        const prior = await withCap(exec((r) => r.get<string>(dedupKey)), REDIS_OP_CAP_MS);
        if (prior) {
          return {
            success: true,
            deal_name: dealName,
            reference: prior,
            trust: {
              level: "medium",
              flags: ["duplicate-24h"],
              notes: ["Duplicate of a submission with the same email/city/dates/event within 24h; original reference returned, no new row written."],
            },
            captured: "notion",
            deduped: true,
          };
        }
      }
    } catch {
      // dedup check failed: proceed with the write rather than block a real lead
    }
  }

  const trust = await scoreLeadTrust(input, input.source);
  const callNotes = buildCallNotes(input, renderTrustBlock(trust), reference);
  const body = notionBodyFor(input, callNotes);

  let notionError = keyProblem ?? "";
  if (!keyProblem) {
    const wrote = await postToNotion(apiKey, body);
    if (wrote.ok) {
      await fireLeadWebhook({ ...leadSummary(input, reference, trust), notion_page_url: wrote.url, captured: "notion" });
      // Notion is healthy: opportunistically retry previously queued leads.
      await withCap(drainPendingLeads(apiKey), 6000);
      return { success: true, notion_page_url: wrote.url, deal_name: dealName, reference, trust, captured: "notion" };
    }
    notionError = wrote.error;
  }

  // ── Notion write failed (or key unusable). Do NOT drop the lead: push the
  //    full record (including the ready-to-replay Notion body) to the durable
  //    queue and fire the webhook so staff still hear about it. Only if the
  //    durable capture also fails do we return failure. ──
  let queued = false;
  if (isConfigured()) {
    try {
      const record: QueueRecord = {
        reference,
        channel: input.channel ?? "mcp",
        deal_name: dealName,
        notion_error: notionError,
        call_notes: callNotes,
        notion_body: body,
        lead: leadSummary(input, reference, trust),
        queued_at: new Date().toISOString(),
      };
      const pushed = await withCap(exec((r) => r.lpush(PENDING_QUEUE, record)), REDIS_OP_CAP_MS);
      if (pushed !== null) {
        await withCap(exec((r) => r.expire(PENDING_QUEUE, PENDING_QUEUE_TTL)), REDIS_OP_CAP_MS);
        queued = true;
      }
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
  // Nothing persisted: release the dedup claim so an immediate retry isn't
  // falsely treated as a duplicate of a lead that was never captured.
  if (dedupClaimed && isConfigured()) {
    try {
      await withCap(exec((r) => r.del(dedupKey)), REDIS_OP_CAP_MS);
    } catch {
      /* best-effort */
    }
  }
  // Public error stays generic: upstream bodies/ids are internal-only (they
  // live in the queue record, which never left our infrastructure).
  const publicError = keyProblem
    ? "CRM integration is not configured"
    : "CRM write failed and the durable capture was unavailable";
  return { success: false, error: `${publicError} (reference ${reference})`, reference };
}
