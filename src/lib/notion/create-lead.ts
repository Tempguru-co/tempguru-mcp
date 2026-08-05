// Creates a new lead in the Inbound Deal Pipeline when a buyer submits the
// TempGuru quote form or an approved REST integration posts the same contract.
// The authless MCP request_quote tool never calls this module.
//
// Uses the Notion REST API directly (no SDK) to keep the dependency footprint
// small. Around the write we add the lead-lifecycle guarantees the funnel needs:
//   - a short reference code the buyer/agent can quote when following up;
//   - a configurable outbound notification webhook (LEAD_WEBHOOK_URL) so a new
//     AI-sourced lead pings the same place website form-fills do, best-effort;
//   - durable fallback: if the Notion write fails (or the API key is missing/
//     malformed), the PII record gets its own 90-day Redis key while
//     leads:pending / leads:pending:inflight contain only opaque IDs, so it is
//     recoverable across timeouts without extending personal-data retention;
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
import { REDIS_OP_CAP_MS, withCap } from "../telemetry/expiring-json-store";
import {
  loadPlanSnapshot,
  rolesMateriallyDiffer,
  type PlanSnapshot,
} from "../mcp/plan-store";
import {
  buildQuoteStatusDealName,
  loadQuoteStatus,
  makeQuoteStatusStub,
  QUOTE_REFERENCE_PATTERN,
  QUOTE_STATUS_TTL_SECONDS,
  saveQuoteStatus,
} from "../mcp/quote-status";
import { findCity, findRole } from "../mcp/data";
import {
  normalizeControlledSource,
  normalizeQuoteUtmCampaign,
  normalizeQuoteUtmContent,
  normalizeQuoteUtmMedium,
  normalizeQuoteUtmSource,
  normalizeSourcePlatform,
} from "../telemetry/source-tags";
import type { QuoteSkillId } from "../mcp/quote";
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
const INFLIGHT_QUEUE = "leads:pending:inflight";
const PENDING_RECORD_PREFIX = "leads:pending:record:";
const DRAIN_LOCK = "leads:pending:drain-lock";
// Keep queued lead capture available for the same 90-day window its public
// `queued` status stub is visible; otherwise the status could outlive the work.
const PENDING_QUEUE_TTL = QUOTE_STATUS_TTL_SECONDS;
// Longer than the scheduled function budget so a live drain cannot lose its
// lease and overlap another worker between the Notion write and status/ACK.
const DRAIN_LOCK_TTL = 90;
const DEDUP_TTL = 60 * 60 * 24; // a repeat of the same lead within 24h is a duplicate
// A dedup claim starts as a short processing lease and becomes a 24-hour
// captured result only after Notion or the durable queue has accepted the lead.
// A terminated serverless invocation therefore cannot leave a phantom
// "successful" lead reference blocking retries for a full day.
const DEDUP_PROCESSING_TTL = 30;
export const MAX_DRAIN_BATCH = 10;
const DRAIN_FINISH_RESERVE_MS = 10_000;
const NOTION_TIMEOUT_MS = 5000; // a hung Notion request must still reach the durable fallback
const COMPARE_AND_DELETE_SCRIPT = `
  if redis.call("GET", KEYS[1]) == ARGV[1] then
    return redis.call("DEL", KEYS[1])
  end
  return 0
`;
const COMPARE_AND_SET_SCRIPT = `
  if redis.call("GET", KEYS[1]) == ARGV[1] then
    return redis.call("SET", KEYS[1], ARGV[2], "EX", ARGV[3])
  end
  return nil
`;

export interface StaffingRole {
  role: string;
  headcount: number;
  shifts?: string; // e.g. "2 shifts × 8h"
}

// One leg of a multi-city / tour program. The top-level city/dates/roles carry
// the primary location; each entry here adds another.
export interface QuoteLocation {
  city: string;
  venue?: string;
  event_dates?: string;
  roles?: StaffingRole[];
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
  venue?: string;
  attendees?: number;
  // Additional cities for a multi-city / tour program.
  locations?: QuoteLocation[];

  // Staffing plan
  roles: StaffingRole[];
  budget_range?: string;
  attire?: string;
  special_requirements?: string;
  compliance_notes?: string;

  // Agent-funnel attribution. These are optional and sanitized before entering
  // Call Notes/UTM fields. plan_id resolves only to a non-PII Redis snapshot.
  source_platform?: string;
  skill_version?: string;
  skill_id?: QuoteSkillId;
  plan_id?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;

  // Which authorized surface submitted this, retained for historical
  // attribution compatibility. The current buyer form uses `rest`.
  channel?: "mcp" | "rest";

  // Request provenance for lead-trust scoring (UA + edge country). Optional so
  // stdio / Docker callers without a request context still create leads.
  source?: LeadTrustSource;

  // Server-controlled request attribution (`X-TempGuru-Source` / `?source=`).
  // This is not part of the public quote schema; the REST handler attaches it
  // after validation so a saved plan can carry its originating runtime through
  // to CRM and telemetry even when the form omits source_platform.
  controlled_source?: string;
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
      /** True only when plan_id resolved to a saved snapshot and was attached. */
      plan_linked: boolean;
      /** Canonical effective platform after explicit/current/saved precedence. */
      source_platform?: string;
      /** Canonical TempGuru skill slug supplied with the request, when present. */
      skill_id?: QuoteSkillId;
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
  const sourcePlatform = normalizeSourcePlatform(input.source_platform);
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
    venue: input.venue ? line(input.venue) : undefined,
    attendees: input.attendees,
    locations: input.locations?.map((loc) => ({
      city: line(loc.city),
      venue: loc.venue ? line(loc.venue) : undefined,
      event_dates: loc.event_dates ? line(loc.event_dates) : undefined,
      roles: loc.roles?.map((r) => ({
        role: line(r.role),
        headcount: r.headcount,
        shifts: r.shifts ? line(r.shifts) : undefined,
      })),
    })),
    roles: input.roles.map((r) => ({
      role: line(r.role),
      headcount: r.headcount,
      shifts: r.shifts ? line(r.shifts) : undefined,
    })),
    budget_range: input.budget_range ? line(input.budget_range) : undefined,
    attire: input.attire ? block(input.attire) : undefined,
    special_requirements: input.special_requirements ? block(input.special_requirements) : undefined,
    compliance_notes: input.compliance_notes ? block(input.compliance_notes) : undefined,
    source_platform:
      sourcePlatform && sourcePlatform !== "other" ? sourcePlatform : undefined,
    skill_version: input.skill_version ? line(input.skill_version) : undefined,
    plan_id: input.plan_id ? line(input.plan_id).toUpperCase() : undefined,
    utm_source: normalizeQuoteUtmSource(input.utm_source) ?? undefined,
    utm_medium: normalizeQuoteUtmMedium(input.utm_medium) ?? undefined,
    utm_campaign: normalizeQuoteUtmCampaign(input.utm_campaign) ?? undefined,
    utm_content: normalizeQuoteUtmContent(input.utm_content) ?? undefined,
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

// Dedup basis includes the event name AND a canonical role/headcount/shift
// fingerprint. Exact retries dedup even if role rows are reordered or synonyms
// are used; a materially revised crew does not get mistaken for the old order.
function dedupKeyFor(input: CreateLeadInput): string {
  const roleTotals = new Map<string, number>();
  for (const row of input.roles) {
    const role =
      findRole(row.role)?.slug ??
      row.role.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const shifts = line(row.shifts).toLowerCase();
    // JSON tuple keys avoid delimiter ambiguity when a free-form shift note
    // contains punctuation used by the serialized fingerprint.
    const key = JSON.stringify([role, shifts]);
    roleTotals.set(key, (roleTotals.get(key) ?? 0) + row.headcount);
  }
  const roleFingerprint = JSON.stringify(
    [...roleTotals.entries()].sort(([a], [b]) => a.localeCompare(b)),
  );
  const canonicalCity = findCity(input.city)?.slug ?? input.city;
  const basis = [
    input.contact_email,
    canonicalCity,
    input.event_dates,
    input.event_name,
    roleFingerprint,
  ]
    .join("|")
    .toLowerCase();
  return "lead:dedup:" + createHash("sha256").update(basis).digest("hex").slice(0, 32);
}

type DedupState =
  | { state: "processing"; reference: string }
  | {
      state: "captured";
      reference: string;
      captured: "notion" | "queued";
      planLinked: boolean;
      sourcePlatform?: string;
      skillId?: QuoteSkillId;
    }
  | { state: "legacy"; reference: string };

function processingDedupValue(reference: string): string {
  return `processing|${reference}`;
}

function capturedDedupValue(input: {
  reference: string;
  captured: "notion" | "queued";
  planLinked: boolean;
  sourcePlatform?: string;
  skillId?: QuoteSkillId;
}): string {
  return [
    "captured",
    input.reference,
    input.captured,
    input.planLinked ? "1" : "0",
    input.sourcePlatform ?? "",
    input.skillId ?? "",
  ].join("|");
}

function parseDedupState(raw: unknown): DedupState | null {
  if (typeof raw !== "string") return null;
  const parts = raw.split("|");
  if (parts[0] === "processing" && QUOTE_REFERENCE_PATTERN.test(parts[1] ?? "")) {
    return { state: "processing", reference: parts[1] };
  }
  if (
    parts[0] === "captured" &&
    QUOTE_REFERENCE_PATTERN.test(parts[1] ?? "") &&
    (parts[2] === "notion" || parts[2] === "queued")
  ) {
    return {
      state: "captured",
      reference: parts[1],
      captured: parts[2],
      planLinked: parts[3] === "1",
      ...(parts[4] ? { sourcePlatform: parts[4] } : {}),
      ...(parts[5] ? { skillId: parts[5] as QuoteSkillId } : {}),
    };
  }
  // Backward compatibility for 24-hour bare-reference keys written by v1.4.0.
  if (QUOTE_REFERENCE_PATTERN.test(raw)) return { state: "legacy", reference: raw };
  return null;
}

export function resolveEffectiveSourcePlatform(
  input: CreateLeadInput,
  snapshot: PlanSnapshot | null,
): string | undefined {
  const explicit = normalizeSourcePlatform(input.source_platform);
  if (explicit && explicit !== "other") return explicit;

  const utmMedium = normalizeQuoteUtmMedium(input.utm_medium);
  const utmPlatform = normalizeSourcePlatform(utmMedium ?? undefined);
  if (utmPlatform && utmPlatform !== "other") return utmPlatform;

  const currentSource = normalizeControlledSource(input.controlled_source);
  const currentPlatform = normalizeSourcePlatform(currentSource ?? undefined);
  if (currentPlatform && currentPlatform !== "other") return currentPlatform;

  const savedPlatform = normalizeSourcePlatform(snapshot?.source ?? undefined);
  return savedPlatform && savedPlatform !== "other" ? savedPlatform : undefined;
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

function buildCallNotes(
  input: CreateLeadInput,
  trustBlock: string,
  reference: string,
  snapshot: PlanSnapshot | null,
): string {
  const uaClass = input.source?.userAgent ? classifyUserAgent(input.source.userAgent) : "unknown";
  const attribution = [
    `channel=${input.channel ?? "mcp"}`,
    `ua_class=${uaClass}`,
    ...(input.source?.ipCountry ? [`country=${input.source.ipCountry}`] : []),
    ...(input.source_platform ? [`source_platform=${input.source_platform}`] : []),
    ...(input.skill_id ? [`skill_id=${input.skill_id}`] : []),
    ...(input.skill_version ? [`skill_version=${input.skill_version}`] : []),
    ...(input.plan_id ? [`plan_id=${input.plan_id}`] : []),
    ...(input.utm_source ? [`utm_source=${input.utm_source}`] : []),
    ...(input.utm_medium ? [`utm_medium=${input.utm_medium}`] : []),
    ...(input.utm_campaign ? [`utm_campaign=${input.utm_campaign}`] : []),
    ...(input.utm_content ? [`utm_content=${input.utm_content}`] : []),
  ];
  const lines: string[] = [
    `SOURCE: AI Agent (${input.channel === "rest" ? "REST" : "MCP"})`,
    `REFERENCE: ${reference}`,
    `ATTRIBUTION: ${attribution.join(" · ")}`,
    ``,
    trustBlock,
    ``,
    ...(snapshot
      ? [
          `PLAN SNAPSHOT`,
          `  ID:       ${input.plan_id}`,
          `  Created:  ${snapshot.created_at}`,
          `  Event:    ${snapshot.event.event_type ?? "unspecified"} · ${snapshot.city.name}, ${snapshot.city.state} · ${snapshot.event.event_date ?? "date not supplied"}`,
          `  Roles:    ${snapshot.plan_lines.map((role) => `${role.role_slug} × ${role.headcount} (${role.days}d × ${role.hours_per_shift}h)`).join("; ")}`,
          `  Estimate: ${snapshot.estimated_total_range.low}-${snapshot.estimated_total_range.high} ${snapshot.estimated_total_range.currency}`,
          ...(snapshot.overtime_adjusted_total_range
            ? [
                `  OT total:  ${snapshot.overtime_adjusted_total_range.low}-${snapshot.overtime_adjusted_total_range.high} ${snapshot.overtime_adjusted_total_range.currency}`,
              ]
            : []),
          ...(snapshot.compliance_jurisdiction
            ? [`  Compliance jurisdiction: ${snapshot.compliance_jurisdiction}`]
            : []),
          ``,
        ]
      : []),
    `EVENT`,
    `  Name:   ${input.event_name}`,
    `  Type:   ${input.event_type}`,
    `  City:   ${input.city}`,
    `  Dates:  ${input.event_dates}`,
    ...(input.venue ? [`  Venue:  ${input.venue}`] : []),
    ...(input.attendees ? [`  Attendees: ${input.attendees.toLocaleString("en-US")}`] : []),
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

  if (input.locations?.length) {
    lines.push(``, `ADDITIONAL LOCATIONS (multi-city)`);
    for (const loc of input.locations) {
      const head = [loc.city, loc.venue, loc.event_dates].filter(Boolean).join(" — ");
      lines.push(`  ${head}`);
      for (const r of loc.roles ?? []) {
        lines.push(`    ${r.role}: ${r.headcount} staff${r.shifts ? ` (${r.shifts})` : ""}`);
      }
    }
  }
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
      ...(input.venue ? { venue: input.venue } : {}),
      ...(input.attendees ? { attendees: input.attendees } : {}),
      ...(input.locations?.length ? { locations: input.locations } : {}),
    },
    roles: input.roles,
    budget_range: input.budget_range,
    source_platform: input.source_platform,
    skill_id: input.skill_id,
    skill_version: input.skill_version,
    plan_id: input.plan_id,
    utm_source: input.utm_source,
    utm_medium: input.utm_medium,
    utm_campaign: input.utm_campaign,
    utm_content: input.utm_content,
  };
}

function notionBodyFor(input: CreateLeadInput, callNotes: string): Record<string, unknown> {
  // The verified Notion schema has UTM Source + UTM Medium only. Preserve the
  // low-cardinality platform in Source and encode the optional skill/plan
  // attribution into Medium instead of inventing unverified Campaign/Content
  // properties that could reject the entire CRM write.
  const utmMedium = [
    input.utm_medium ?? (input.channel === "rest" ? "rest" : "mcp"),
    ...(input.utm_campaign ? [`campaign=${input.utm_campaign}`] : []),
    ...(input.utm_content ? [`content=${input.utm_content}`] : []),
    ...(input.skill_id ? [`skill=${input.skill_id}`] : []),
    ...(input.skill_version ? [`skill_version=${input.skill_version}`] : []),
    ...(input.plan_id ? [`plan=${input.plan_id}`] : []),
  ].join(" · ");
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
      "Self-Reported Source": { rich_text: richText(`${input.channel === "rest" ? "AI Agent (REST)" : "AI Agent (MCP)"}${input.source_platform ? ` · ${input.source_platform}` : ""}`) },
      "UTM Source":           { rich_text: richText(input.utm_source || input.source_platform || "ai-agent") },
      "UTM Medium":           { rich_text: richText(utmMedium) },
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
  /** Controlled non-PII display value for the public status stub. */
  status_deal_name?: string;
  notion_error: string;
  call_notes: string;
  notion_body: Record<string, unknown>;
  lead: ReturnType<typeof leadSummary>;
  queued_at: string;
};

type QueueToken = string | QueueRecord;

const QUEUE_ID_PATTERN = /^\d{13}-[a-f0-9]{32}$/;

function makeQueueId(): string {
  return `${Date.now()}-${randomBytes(16).toString("hex")}`;
}

function queueRecordKey(queueId: string): string {
  return `${PENDING_RECORD_PREFIX}${queueId}`;
}

function isQueueId(value: unknown): value is string {
  return typeof value === "string" && QUEUE_ID_PATTERN.test(value);
}

function queueIdExpired(queueId: string): boolean {
  const createdMs = Number(queueId.slice(0, 13));
  return Number.isFinite(createdMs) && Date.now() - createdMs >= PENDING_QUEUE_TTL * 1000;
}

function parseQueueRecord(raw: unknown): QueueRecord | null {
  const candidate =
    typeof raw === "string"
      ? (() => {
          try {
            return JSON.parse(raw) as unknown;
          } catch {
            return null;
          }
        })()
      : raw;
  if (!candidate || typeof candidate !== "object") return null;
  const record = candidate as Partial<QueueRecord>;
  return typeof record.reference === "string" && record.notion_body && typeof record.notion_body === "object"
    ? (record as QueueRecord)
    : null;
}

/**
 * Persist PII under its own expiring key and queue only an opaque non-PII ID.
 * MULTI makes record+index creation all-or-nothing. If the HTTP response times
 * out after Redis commits, the unique record key disambiguates that timeout.
 */
async function enqueuePendingLead(record: QueueRecord): Promise<boolean> {
  const queueId = makeQueueId();
  const recordKey = queueRecordKey(queueId);
  try {
    const committed = await withCap(
      exec((r) =>
        r
          .multi()
          .set(recordKey, record, { ex: PENDING_QUEUE_TTL })
          .lpush(PENDING_QUEUE, queueId)
          .expire(PENDING_QUEUE, PENDING_QUEUE_TTL)
          .exec(),
      ),
      REDIS_OP_CAP_MS,
    );
    if (committed !== null) return true;

    // A capped transaction may have committed server-side. The queue ID is
    // unique to this call, so finding its record proves the whole MULTI landed.
    return (
      (await withCap(exec((r) => r.get<QueueRecord>(recordKey)), REDIS_OP_CAP_MS)) !== null
    );
  } catch {
    return false;
  }
}

async function acquireDrainLock(): Promise<string | null> {
  const token = randomBytes(16).toString("hex");
  try {
    const claim = await withCap(
      exec((r) => r.set(DRAIN_LOCK, token, { nx: true, ex: DRAIN_LOCK_TTL })),
      REDIS_OP_CAP_MS,
    );
    if (claim === "OK") return token;
    if (claim !== null) return null;
    // SET may have committed before its response timed out. Only this token
    // proves ownership; a different value means another drain holds the lease.
    const observed = await withCap(exec((r) => r.get<string>(DRAIN_LOCK)), REDIS_OP_CAP_MS);
    return observed === token ? token : null;
  } catch {
    return null;
  }
}

async function claimQueueToken(): Promise<QueueToken | null> {
  try {
    // A prior invocation can be terminated after LMOVE. Recover that claimed
    // token before taking another pending item; the drain lock prevents peers
    // from replaying it concurrently.
    const inflight = await withCap(
      exec(async (r) => (await r.lindex(INFLIGHT_QUEUE, -1)) as QueueToken | null),
      REDIS_OP_CAP_MS,
    );
    if (inflight) return inflight;

    const moved = await withCap(
      exec((r) =>
        r.lmove<QueueToken>(PENDING_QUEUE, INFLIGHT_QUEUE, "right", "left"),
      ),
      REDIS_OP_CAP_MS,
    );
    if (moved) {
      // Inflight contains opaque IDs for new records. This TTL is housekeeping;
      // the PII record itself already has its own immutable 90-day expiry.
      await withCap(exec((r) => r.expire(INFLIGHT_QUEUE, PENDING_QUEUE_TTL)), REDIS_OP_CAP_MS);
    }
    return moved;
  } catch {
    return null;
  }
}

async function loadClaimedRecord(token: QueueToken): Promise<QueueRecord | null> {
  if (!isQueueId(token)) return parseQueueRecord(token);
  try {
    const raw = await withCap(
      exec((r) => r.get<QueueRecord | string>(queueRecordKey(token))),
      REDIS_OP_CAP_MS,
    );
    return parseQueueRecord(raw);
  } catch {
    return null;
  }
}

async function requeueClaim(token: QueueToken): Promise<void> {
  try {
    await withCap(
      exec((r) =>
        r
          .multi()
          .lrem(INFLIGHT_QUEUE, 1, token)
          .lpush(PENDING_QUEUE, token)
          .expire(PENDING_QUEUE, PENDING_QUEUE_TTL)
          .expire(INFLIGHT_QUEUE, PENDING_QUEUE_TTL)
          .exec(),
      ),
      REDIS_OP_CAP_MS,
    );
  } catch {
    // The transaction is all-or-nothing. On an ambiguous response the token is
    // in either pending or inflight, never destructively popped from both.
  }
}

async function acknowledgeClaim(token: QueueToken): Promise<void> {
  try {
    await withCap(
      exec((r) => {
        const tx = r.multi().lrem(INFLIGHT_QUEUE, 1, token);
        if (isQueueId(token)) {
          tx.lrem(PENDING_QUEUE, 0, token).del(queueRecordKey(token));
        }
        return tx.exec();
      }),
      REDIS_OP_CAP_MS,
    );
  } catch {
    // At-least-once delivery: a timed-out ACK leaves the token recoverable.
    // A received status below prevents a second Notion write on the next drain.
  }
}

async function compareAndDelete(key: string, expected: string): Promise<void> {
  try {
    await withCap(
      exec((r) => r.eval(COMPARE_AND_DELETE_SCRIPT, [key], [expected])),
      REDIS_OP_CAP_MS,
    );
  } catch {
    // Best-effort cleanup only; both callers set a bounded TTL on the key.
  }
}

async function compareAndSet(
  key: string,
  expected: string,
  replacement: string,
  ttlSeconds: number,
): Promise<boolean> {
  try {
    const result = await withCap(
      exec((r) =>
        r.eval(
          COMPARE_AND_SET_SCRIPT,
          [key],
          [expected, replacement, String(ttlSeconds)],
        ),
      ),
      REDIS_OP_CAP_MS,
    );
    return result === "OK";
  } catch {
    return false;
  }
}

export type DrainPendingLeadsResult = {
  configured: boolean;
  lock_acquired: boolean;
  claimed: number;
  delivered: number;
  already_received: number;
  requeued: number;
  discarded_expired: number;
  unreadable_rotated: number;
  deadline_reached: boolean;
};

// Bounded queue drain used both opportunistically after a healthy write and by
// the authenticated scheduled route. Pending -> inflight is atomic, so a Redis
// timeout or serverless termination can delay a lead but cannot pop and lose it.
// The hard batch cap and 90-second lease bound each scheduled run. A failed or
// timed-out Notion call requeues and stops immediately; healthy calls can clear
// a normal outage backlog within the route's 60-second function budget.
export async function drainPendingLeads(
  apiKey: string,
  requestedLimit = 2,
  deadlineMs?: number,
): Promise<DrainPendingLeadsResult> {
  const result: DrainPendingLeadsResult = {
    configured: isConfigured(),
    lock_acquired: false,
    claimed: 0,
    delivered: 0,
    already_received: 0,
    requeued: 0,
    discarded_expired: 0,
    unreadable_rotated: 0,
    deadline_reached: false,
  };
  if (!result.configured) return result;

  const limit = Math.min(
    MAX_DRAIN_BATCH,
    Math.max(1, Number.isFinite(requestedLimit) ? Math.trunc(requestedLimit) : 1),
  );
  const lockToken = await acquireDrainLock();
  if (!lockToken) return result;
  result.lock_acquired = true;
  const rotatedTokens = new Set<string>();
  try {
    for (let i = 0; i < limit; i++) {
      if (deadlineMs && Date.now() + DRAIN_FINISH_RESERVE_MS >= deadlineMs) {
        result.deadline_reached = true;
        break;
      }
      const token = await claimQueueToken();
      if (!token) break;
      result.claimed++;
      const parsed = await loadClaimedRecord(token);
      if (!parsed) {
        // A current per-record GET can be unavailable, so leave the token
        // recoverable. Only an ID older than its record TTL is definitely a ghost.
        if (isQueueId(token) && queueIdExpired(token)) {
          await acknowledgeClaim(token);
          result.discarded_expired++;
          continue;
        }
        // Rotate an unreadable/missing record to the newest end of pending so
        // one damaged ID cannot head-of-line block every healthy lead for its
        // full 90-day TTL. Stop if the same token comes around again in this
        // invocation, preventing a one-item poison queue from busy-looping.
        const tokenIdentity = typeof token === "string" ? token : JSON.stringify(token);
        const seen = rotatedTokens.has(tokenIdentity);
        rotatedTokens.add(tokenIdentity);
        await requeueClaim(token);
        result.requeued++;
        result.unreadable_rotated++;
        if (seen) break;
        continue;
      }
      const priorStatus = await loadQuoteStatus(parsed.reference);
      if (priorStatus?.status === "received") {
        // Notion + status committed but a previous ACK response timed out.
        await acknowledgeClaim(token);
        result.already_received++;
        continue;
      }
      if (deadlineMs && Date.now() + DRAIN_FINISH_RESERVE_MS >= deadlineMs) {
        await requeueClaim(token);
        result.requeued++;
        result.deadline_reached = true;
        break;
      }
      const replay = await postToNotion(apiKey, parsed.notion_body);
      if (!replay.ok) {
        await requeueClaim(token);
        result.requeued++;
        break;
      }
      await saveQuoteStatus(
        parsed.reference,
        makeQuoteStatusStub(
          "received",
          parsed.status_deal_name ?? "TempGuru quote request",
          parsed.channel === "rest" ? "rest" : "mcp",
          priorStatus?.created_at ?? parsed.queued_at,
        ),
      );
      await acknowledgeClaim(token);
      result.delivered++;
    }
  } finally {
    await compareAndDelete(DRAIN_LOCK, lockToken);
  }
  return result;
}

function notionApiKeyConfig(): { apiKey: string; problem: string | null } {
  // Accept either casing, the Vercel env var was historically created as
  // `Notion_API_Key`. A malformed key is treated the same as an unavailable
  // integration so quote capture routes into Redis instead of being dropped.
  const apiKey = (process.env.NOTION_API_KEY || process.env.Notion_API_Key || "").trim();
  const problem = !apiKey
    ? "NOTION_API_KEY not configured"
    : !/^[\x20-\x7E]+$/.test(apiKey)
      ? "NOTION_API_KEY contains invalid (non-ASCII) characters, re-enter the raw Notion integration token (ntn_… or secret_…) in Vercel with no surrounding text."
      : null;
  return { apiKey, problem };
}

/** Validated Notion key for the protected scheduled drain route. */
export function configuredNotionApiKey(): string | null {
  const { apiKey, problem } = notionApiKeyConfig();
  return problem ? null : apiKey;
}

async function resultForExistingDedup(
  state: DedupState,
  dealName: string,
  input: CreateLeadInput,
): Promise<CreateLeadResult> {
  const status = await loadQuoteStatus(state.reference);
  if (state.state === "processing" && !status) {
    return {
      success: false,
      error:
        "A matching quote submission is still being captured. Retry after 30 seconds; do not create a second request.",
      reference: state.reference,
    };
  }
  if (state.state === "legacy" && !status) {
    // A bare v1.4.0 claim without a status may be an orphan left by a terminated
    // invocation. Never claim it reached Notion; its bounded legacy TTL will
    // expire, after which a retry can acquire the new processing lease.
    return {
      success: false,
      error:
        "A matching prior submission could not be verified. Retry later or follow up with its reference.",
      reference: state.reference,
    };
  }

  const captured =
    status?.status === "queued"
      ? "queued"
      : status?.status === "received"
        ? "notion"
        : state.state === "captured"
          ? state.captured
          : "notion";
  const sourcePlatform =
    state.state === "captured"
      ? state.sourcePlatform
      : normalizeSourcePlatform(input.source_platform) ?? undefined;
  const skillId = state.state === "captured" ? state.skillId : input.skill_id;
  return {
    success: true,
    deal_name: dealName,
    reference: state.reference,
    trust: {
      level: "medium",
      flags: ["duplicate-24h"],
      notes: [
        "Duplicate of an exact role/headcount/shift submission within 24h; original reference returned, no new row written.",
      ],
    },
    captured,
    plan_linked: state.state === "captured" ? state.planLinked : false,
    ...(sourcePlatform ? { source_platform: sourcePlatform } : {}),
    ...(skillId ? { skill_id: skillId } : {}),
    deduped: true,
  };
}

export async function createLead(rawInput: CreateLeadInput): Promise<CreateLeadResult> {
  const reference = makeReference();
  const input = sanitizeInput(rawInput);
  const { apiKey, problem: keyProblem } = notionApiKeyConfig();

  const dealName = `Agent Quote, ${input.event_type} · ${input.city} · ${input.event_dates}`;
  const statusDealName = buildQuoteStatusDealName(input.event_type, input.city);
  const dedupKey = dedupKeyFor(input);

  // ── Dedup state machine. The initial NX claim is a short processing lease;
  //    it becomes a 24-hour captured result only after Notion or the durable
  //    queue commits. A dead invocation can therefore delay a retry by at most
  //    30 seconds instead of manufacturing a false-positive lead for 24 hours. ──
  const processingValue = processingDedupValue(reference);
  if (isConfigured()) {
    try {
      const claim = await withCap(
        exec((r) =>
          r.set(dedupKey, processingValue, {
            nx: true,
            ex: DEDUP_PROCESSING_TTL,
          }),
        ),
        REDIS_OP_CAP_MS,
      );
      if (claim !== "OK") {
        // A null SET response is ambiguous: either NX missed or the write
        // committed and its HTTP response exceeded the cap. This request owns
        // the claim when Redis contains its own processing token; any other
        // parseable state belongs to a prior request and may short-circuit
        // persistence safely.
        const priorRaw = await withCap(
          exec((r) => r.get<unknown>(dedupKey)),
          REDIS_OP_CAP_MS,
        );
        const prior = parseDedupState(priorRaw);
        if (prior && priorRaw !== processingValue) {
          return resultForExistingDedup(prior, dealName, input);
        }
      }
    } catch {
      // dedup check failed: proceed with the write rather than block a real lead
    }
  }

  const [trust, planSnapshot] = await Promise.all([
    scoreLeadTrust(input, input.source),
    input.plan_id ? loadPlanSnapshot(input.plan_id) : Promise.resolve(null),
  ]);
  const effectiveSourcePlatform = resolveEffectiveSourcePlatform(input, planSnapshot);
  const leadInput: CreateLeadInput = effectiveSourcePlatform
    ? { ...input, source_platform: effectiveSourcePlatform }
    : input;
  const planLinked = planSnapshot !== null;
  const finalizeDedup = async (captured: "notion" | "queued") => {
    if (!isConfigured()) return;
    await compareAndSet(
      dedupKey,
      processingValue,
      capturedDedupValue({
        reference,
        captured,
        planLinked,
        sourcePlatform: effectiveSourcePlatform,
        skillId: leadInput.skill_id,
      }),
      DEDUP_TTL,
    );
  };
  if (planSnapshot && rolesMateriallyDiffer(input.roles, planSnapshot)) {
    trust.flags.push("plan-role-drift");
    trust.notes.push(
      `Submitted role/headcount mix materially differs from saved plan ${input.plan_id}; review both versions before quoting.`,
    );
    if (trust.level === "high") trust.level = "medium";
  }
  const callNotes = buildCallNotes(leadInput, renderTrustBlock(trust), reference, planSnapshot);
  const body = notionBodyFor(leadInput, callNotes);

  let notionError = keyProblem ?? "";
  if (!keyProblem) {
    const wrote = await postToNotion(apiKey, body);
    if (wrote.ok) {
      await finalizeDedup("notion");
      await saveQuoteStatus(
        reference,
        makeQuoteStatusStub(
          "received",
          statusDealName,
          leadInput.channel === "rest" ? "rest" : "mcp",
        ),
      );
      await fireLeadWebhook({
        ...leadSummary(leadInput, reference, trust),
        notion_page_url: wrote.url,
        captured: "notion",
      });
      // Notion is healthy: opportunistically retry previously queued leads.
      await withCap(drainPendingLeads(apiKey), 6000);
      return {
        success: true,
        notion_page_url: wrote.url,
        deal_name: dealName,
        reference,
        trust,
        captured: "notion",
        plan_linked: planLinked,
        ...(effectiveSourcePlatform ? { source_platform: effectiveSourcePlatform } : {}),
        ...(leadInput.skill_id ? { skill_id: leadInput.skill_id } : {}),
      };
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
        channel: leadInput.channel ?? "mcp",
        deal_name: dealName,
        status_deal_name: statusDealName,
        notion_error: notionError,
        call_notes: callNotes,
        notion_body: body,
        lead: leadSummary(leadInput, reference, trust),
        queued_at: new Date().toISOString(),
      };
      queued = await enqueuePendingLead(record);
    } catch {
      queued = false;
    }
  }

  if (queued) await finalizeDedup("queued");

  await fireLeadWebhook({
    ...leadSummary(leadInput, reference, trust),
    captured: queued ? "queued" : "unpersisted",
    notion_error: notionError,
  });

  if (queued) {
    await saveQuoteStatus(
      reference,
      makeQuoteStatusStub(
        "queued",
        statusDealName,
        leadInput.channel === "rest" ? "rest" : "mcp",
      ),
    );
    return {
      success: true,
      deal_name: dealName,
      reference,
      trust,
      captured: "queued",
      plan_linked: planLinked,
      ...(effectiveSourcePlatform ? { source_platform: effectiveSourcePlatform } : {}),
      ...(leadInput.skill_id ? { skill_id: leadInput.skill_id } : {}),
    };
  }
  // Nothing persisted: release only a claim owned by THIS request. Always
  // perform the compare+delete because a capped SET can commit after the first
  // follow-up GET; an unconditional DEL could erase a different caller's claim.
  if (isConfigured()) {
    await compareAndDelete(dedupKey, processingValue);
  }
  // Public error stays generic: upstream bodies/ids are internal-only (they
  // live in the queue record, which never left our infrastructure).
  const publicError = keyProblem
    ? "CRM integration is not configured"
    : "CRM write failed and the durable capture was unavailable";
  return { success: false, error: `${publicError} (reference ${reference})`, reference };
}
