// Canonical public-offer contract.
//
// The terms and structured values live in content/mcp-data/policies.json so
// get_policies, generated OKF/llms artifacts, and runtime handoffs cannot
// acquire independent offer copy. This module supplies the short, explicitly
// requested MCP strings and a shared expiry gate for every runtime surface.

import { POLICIES, type Policy } from "./data";

export const AGENT5_SERVER_INSTRUCTION =
  "A published first-order offer (code AGENT5) exists; get_policies returns its exact terms.";

export const AGENT5_PLAN_NOTE =
  "First-order offer AGENT5 may apply (5% off, $500 cap, expires 2026-12-31); see get_policies. Not reflected in the totals above.";

export const AGENT5_DETAILS_VALUE = "AGENT5";

type PublishedOffer = Policy & {
  topic: "offers";
  code: "AGENT5";
  discount_percent: 5;
  cap_usd: 500;
  expires: "2026-12-31";
  scope: "first order, new clients";
};

const offer = POLICIES.find((policy) => policy.topic === "offers");

function isAgent5Offer(value: Policy | undefined): value is PublishedOffer {
  return Boolean(
    value &&
      value.topic === "offers" &&
      value.code === "AGENT5" &&
      value.discount_percent === 5 &&
      value.cap_usd === 500 &&
      value.expires === "2026-12-31" &&
      value.scope === "first order, new clients" &&
      value.confirmed_claims.length === 1,
  );
}

if (!isAgent5Offer(offer)) {
  throw new Error("Canonical AGENT5 offer record is missing or incomplete");
}

const canonicalOffer: PublishedOffer = offer;
const AGENT5_EXPIRES_AT_MS = Date.parse("2027-01-01T05:00:00.000Z");

export const AGENT5_CANONICAL_TERMS = canonicalOffer.confirmed_claims[0];

/** The published date is inclusive through the end of Dec. 31 at TempGuru HQ. */
export function isAgent5OfferActive(now = new Date()): boolean {
  return now.getTime() < AGENT5_EXPIRES_AT_MS;
}

/** Prevent a cached pre-expiry policy response from outliving the offer. */
export function getPublishedPolicyCacheMaxAge(
  now = new Date(),
  defaultSeconds = 3_600,
): number {
  const millisecondsUntilExpiry = AGENT5_EXPIRES_AT_MS - now.getTime();
  if (millisecondsUntilExpiry <= 0) return defaultSeconds;
  const secondsUntilExpiry = Math.floor(millisecondsUntilExpiry / 1_000);
  return Math.min(defaultSeconds, secondsUntilExpiry);
}

export function getActiveAgent5Offer(
  now = new Date(),
): PublishedOffer | null {
  return isAgent5OfferActive(now) ? canonicalOffer : null;
}

/** Hide expired dated policy rows even if source cleanup has not shipped yet. */
export function getPublishedPolicies(now = new Date()): Policy[] {
  return POLICIES.filter(
    (policy) => policy.topic !== "offers" || isAgent5OfferActive(now),
  );
}

export function getAgent5ServerInstruction(now = new Date()): string | null {
  return getActiveAgent5Offer(now) ? AGENT5_SERVER_INSTRUCTION : null;
}

export function getAgent5PlanNote(now = new Date()): string | null {
  return getActiveAgent5Offer(now) ? AGENT5_PLAN_NOTE : null;
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
  if (!getActiveAgent5Offer(now)) {
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
