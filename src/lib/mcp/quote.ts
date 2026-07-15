// Shared request_quote contract, zod input schema + confirmation payloads.
//
// Both write surfaces consume this:
//   - src/lib/mcp/register-tools.ts             MCP tool `request_quote` (HTTP + stdio)
//   - src/app/api/v1/quote-requests/route.ts    REST mirror `POST /api/v1/quote-requests`
//
// Keeping the schema and the confirmation shapes here guarantees the REST
// endpoint and the MCP tool validate identically and return byte-identical
// payloads, the same single-source-of-truth promise queries.ts makes for
// the read-only surfaces. Edit the schema here and both surfaces (plus the
// MCP tool's advertised JSON schema) move together; the OpenAPI spec in
// src/lib/api/openapi.ts mirrors it by hand and must be kept in sync.

import { z } from "zod";
import { PLAN_ID_PATTERN } from "./plan-store";

/**
 * Canonical skill identifiers accepted on quote submissions. Keep this list
 * deliberately closed: it is copied into CRM attribution and aggregate
 * telemetry, so arbitrary public strings must never become a new dimension.
 */
export const QUOTE_SKILL_IDS = [
  "event-staffing-ordering",
  "event-staffing-compliance",
  "staffing-plan-from-event-brief",
  "urgent-event-backfill",
  "staffing-agency-partner-growth",
] as const;

export type QuoteSkillId = (typeof QUOTE_SKILL_IDS)[number];

// Raw shape (not z.object) because McpServer.registerTool takes a ZodRawShape.
// The REST route validates with RequestQuoteSchema below, same shape object.
//
// Required text fields are trimmed and must be non-empty, and the staffing
// plan needs at least one role, a lead with blank contact/event fields or
// no roles is garbage by the time it reaches the CRM (createLead writes
// fields verbatim to Notion).
// Field caps are realistic business maxima, not just DoS guards: they keep a
// megabyte "event name" from eating the Notion Call Notes budget and keep
// headcounts inside anything a real event could want.
export const REQUEST_QUOTE_INPUT = {
  contact_name: z.string().trim().min(1).max(120).describe("Full name of the contact person"),
  contact_email: z.string().trim().email().max(254).describe("Contact email address for the quote response"),
  contact_phone: z.string().trim().max(40).optional().describe("Optional phone number for the coordinator to reach the buyer (event ops is phone-first; include when known)"),
  company: z.string().trim().min(1).max(160).describe("Company or organization name"),
  event_name: z.string().trim().min(1).max(200).describe("Name of the event (e.g. 'HIMSS 2026', 'Brand Fest Austin')"),
  event_type: z.string().trim().min(1).max(80).describe("Event type: trade-show, conference, festival, concert, sporting-event, corporate, brand-activation, or other"),
  city: z.string().trim().min(1).max(120).describe("City where the event is held"),
  event_dates: z.string().trim().min(1).max(160).describe("Event dates as a human-readable string, e.g. 'June 15–17, 2026'"),
  venue: z.string().trim().max(200).optional().describe("Primary venue name and/or address, when known"),
  attendees: z.number().int().positive().max(5_000_000).optional().describe("Expected event attendance, if known (informs coverage ratios)"),
  roles: z.array(
    z.object({
      role: z.string().trim().min(1).max(80).describe("Staffing role name, e.g. brand-ambassadors, registration-staff"),
      headcount: z.number().int().positive().max(10_000).describe("Number of staff needed"),
      shifts: z.string().max(160).optional().describe("Shift description, e.g. '2 days × 8h'"),
    })
  ).min(1).max(50).describe("Roles and headcount needed for the event"),
  locations: z
    .array(
      z.object({
        city: z.string().trim().min(1).max(120).describe("City for this leg of a multi-city program"),
        venue: z.string().trim().max(200).optional().describe("Venue for this location, if known"),
        event_dates: z.string().trim().max(160).optional().describe("Dates for this location, if they differ from the top-level dates"),
        roles: z
          .array(
            z.object({
              role: z.string().trim().min(1).max(80).describe("Staffing role name"),
              headcount: z.number().int().positive().max(10_000).describe("Number of staff needed at this location"),
              shifts: z.string().max(160).optional().describe("Shift description for this location"),
            }),
          )
          .max(50)
          .optional()
          .describe("Roles for this location if they differ from the top-level roles"),
      }),
    )
    .max(50)
    .optional()
    .describe("Additional cities for a multi-city / tour program. The top-level city, dates, and roles describe the primary or first location; each entry here adds another."),
  budget_range: z.string().max(120).optional().describe("Estimated total budget range if calculated, e.g. '$8,400–$12,600'"),
  attire: z.string().max(500).optional().describe("Staff attire requirements"),
  special_requirements: z.string().max(2000).optional().describe("Any special requirements: language skills, certifications, overnight shifts, etc."),
  compliance_notes: z.string().max(2000).optional().describe("Any compliance flags surfaced by get_compliance_by_state"),
  source_platform: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .optional()
    .describe("Optional agent/platform attribution, e.g. chatgpt-gpt, claude-desktop, coze"),
  skill_version: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .optional()
    .describe("Optional version of the TempGuru staffing skill used to assemble this request"),
  skill_id: z
    .enum(QUOTE_SKILL_IDS)
    .optional()
    .describe("Optional canonical TempGuru skill slug that assembled this request"),
  plan_id: z
    .string()
    .trim()
    .toUpperCase()
    .max(12)
    .regex(PLAN_ID_PATTERN, "plan_id must be a 12-character TempGuru plan reference")
    .optional()
    .describe("Optional plan_id returned by plan_staffing; links the submitted quote to its saved non-PII plan"),
};

/** Whole-body schema for surfaces that validate a JSON document (REST). */
export const RequestQuoteSchema = z.object(REQUEST_QUOTE_INPUT);

export type RequestQuoteInput = z.infer<typeof RequestQuoteSchema>;

// ─── Confirmation payloads ────────────────────────────────────────────────
//
// The exact objects both surfaces return. The REST route serializes them
// directly; the MCP tool wraps them in a text content block.

export function quoteSubmittedPayload(
  contactEmail: string,
  dealName: string,
  reference: string,
  captured: "notion" | "queued" = "notion",
  planLinked = false,
) {
  const receiptNote =
    captured === "queued"
      ? "Your request is captured and queued; a coordinator will follow up within one business day."
      : "A coordinator will review the details and respond with a quote within one business day.";
  return {
    submitted: true as const,
    plan_linked: planLinked,
    deal_name: dealName,
    reference,
    message:
      `Your staffing request has been submitted to TempGuru (reference ${reference}). ${receiptNote} ` +
      "Orders are confirmed within 48 hours of approval. Contact megan@tempguru.co or (904) 206-8953 for urgent requests.",
    next_steps: [
      "Save your reference: " + reference,
      "Watch for a quote email at " + contactEmail,
      "TempGuru may follow up to confirm shift details or attire",
      "No payment or commitment is required until you approve the quote",
    ],
  };
}

export function quoteFailedPayload(error: string, reference?: string) {
  return {
    submitted: false as const,
    error,
    ...(reference ? { reference } : {}),
    message:
      `Submission failed${reference ? ` (reference ${reference})` : ""}. Please have the user contact TempGuru directly at megan@tempguru.co or (904) 206-8953` +
      `${reference ? ` and mention reference ${reference}` : ""}.`,
  };
}
