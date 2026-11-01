// AGENT5 quote-form prefill: the offer's only remaining surface, human-facing.
//
// AGENT5 is deliberately absent from everything a model reads: MCP server
// instructions, plan_staffing/get_plan results, get_policies and its REST
// mirror, OpenAPI, and the generated OKF/llms knowledge. Anthropic's connector
// review rejects tool text that promotes products and services, and OpenAI's
// plugin guidelines forbid advertising discounts or promotions, so promotional
// copy in model-readable fields puts both directory listings at risk.
//
// What remains is this server-rendered prefill on the TempGuru quote form a
// buyer opens after an agent handoff. The model never sees it: the handoff URL
// carries no details field, and the page adds the code itself. The buyer can
// review or delete it before submitting. scripts/check-submissions.mjs keeps
// the code out of the agent-facing surfaces.
//
// Expiry: the prefill stops after December 31, 2026 (TempGuru HQ time). After
// that date, delete this module and its one caller in request-quote/page.tsx.

export const AGENT5_DETAILS_VALUE = "AGENT5";

const AGENT5_EXPIRES_AT_MS = Date.parse("2027-01-01T05:00:00.000Z");

/** The offer date is inclusive through the end of Dec. 31 at TempGuru HQ. */
export function isAgent5OfferActive(now = new Date()): boolean {
  return now.getTime() < AGENT5_EXPIRES_AT_MS;
}

/**
 * Add the public redemption code once without accepting or persisting contact
 * details. The buyer can review and edit this bounded form field before the
 * eventual REST submission creates a lead.
 */
export function appendAgent5ToDetails(
  details: string | null | undefined,
  now = new Date(),
): string {
  const existing = details?.trim() ?? "";
  if (!isAgent5OfferActive(now)) {
    if (/^AGENT5$/i.test(existing)) return "";
    return existing.replace(/\n\s*\n\s*AGENT5$/i, "").trim().slice(0, 2_000);
  }
  if (/\bAGENT5\b/i.test(existing)) {
    return existing.slice(0, 2_000);
  }
  const separator = existing ? "\n\n" : "";
  const allowedExisting = 2_000 - separator.length - AGENT5_DETAILS_VALUE.length;
  return `${existing.slice(0, allowedExisting)}${separator}${AGENT5_DETAILS_VALUE}`;
}

export function getAgent5QuoteDetailsPrefill(
  input: { planRestored: boolean; utmCampaign?: string },
  now = new Date(),
): string {
  if (!input.planRestored || input.utmCampaign !== "quote-handoff") return "";
  return appendAgent5ToDetails("", now);
}
