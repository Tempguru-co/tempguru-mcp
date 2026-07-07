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

// Raw shape (not z.object) because McpServer.registerTool takes a ZodRawShape.
// The REST route validates with RequestQuoteSchema below, same shape object.
//
// Required text fields are trimmed and must be non-empty, and the staffing
// plan needs at least one role, a lead with blank contact/event fields or
// no roles is garbage by the time it reaches the CRM (createLead writes
// fields verbatim to Notion).
export const REQUEST_QUOTE_INPUT = {
  contact_name: z.string().trim().min(1).describe("Full name of the contact person"),
  contact_email: z.string().trim().email().describe("Contact email address for the quote response"),
  contact_phone: z.string().trim().optional().describe("Optional phone number for the coordinator to reach the buyer (event ops is phone-first; include when known)"),
  company: z.string().trim().min(1).describe("Company or organization name"),
  event_name: z.string().trim().min(1).describe("Name of the event (e.g. 'HIMSS 2026', 'Brand Fest Austin')"),
  event_type: z.string().trim().min(1).describe("Event type: trade-show, conference, festival, concert, sporting-event, corporate, brand-activation, or other"),
  city: z.string().trim().min(1).describe("City where the event is held"),
  event_dates: z.string().trim().min(1).describe("Event dates as a human-readable string, e.g. 'June 15–17, 2026'"),
  roles: z.array(
    z.object({
      role: z.string().trim().min(1).describe("Staffing role name, e.g. brand-ambassadors, registration-staff"),
      headcount: z.number().int().positive().describe("Number of staff needed"),
      shifts: z.string().optional().describe("Shift description, e.g. '2 days × 8h'"),
    })
  ).min(1).describe("Roles and headcount needed for the event"),
  budget_range: z.string().optional().describe("Estimated total budget range if calculated, e.g. '$8,400–$12,600'"),
  attire: z.string().optional().describe("Staff attire requirements"),
  special_requirements: z.string().optional().describe("Any special requirements: language skills, certifications, overnight shifts, etc."),
  compliance_notes: z.string().optional().describe("Any compliance flags surfaced by get_compliance_by_state"),
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
) {
  const receiptNote =
    captured === "queued"
      ? "Your request is captured and queued; a coordinator will follow up within one business day."
      : "A coordinator will review the details and respond with a quote within one business day.";
  return {
    submitted: true as const,
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

export function quoteFailedPayload(error: string) {
  return {
    submitted: false as const,
    error,
    message:
      "Submission failed. Please have the user contact TempGuru directly at megan@tempguru.co or (904) 206-8953.",
  };
}
