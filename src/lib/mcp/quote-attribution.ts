import {
  QUOTE_SKILL_IDS,
  QUOTE_SKILL_VERSION_PATTERN,
  type QuoteSkillId,
} from "./quote";
import {
  normalizeQuoteUtmCampaign,
  normalizeQuoteUtmContent,
  normalizeQuoteUtmMedium,
  normalizeQuoteUtmSource,
  normalizeSourcePlatform,
} from "../telemetry/source-tags";

export type QuoteAttribution = {
  source_platform?: string;
  skill_id?: QuoteSkillId;
  skill_version?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
};

export type QuoteAttributionQuery = {
  source_platform?: unknown;
  skill_id?: unknown;
  skill_version?: unknown;
  utm_source?: unknown;
  utm_medium?: unknown;
  utm_campaign?: unknown;
  utm_content?: unknown;
};

const SKILL_IDS = new Set<string>(QUOTE_SKILL_IDS);
const ATTRIBUTION_FIELDS = [
  "source_platform",
  "skill_id",
  "skill_version",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
] as const;

function boundedSingle(
  value: unknown,
  maxLength: number,
): string {
  if (typeof value !== "string" || value.length > maxLength) return "";
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return /[<>{}\[\]\\`]/.test(cleaned) ? "" : cleaned;
}

/**
 * Convert public handoff query parameters into the closed attribution contract
 * accepted by the buyer form. Duplicate, overlong, unknown, and free-text
 * values are discarded before they can enter the browser POST or CRM.
 */
export function sanitizeQuoteAttributionQuery(
  params: QuoteAttributionQuery,
): QuoteAttribution {
  const rawPlatform = boundedSingle(params.source_platform, 80);
  const normalizedPlatform = normalizeSourcePlatform(rawPlatform || undefined);
  const explicitPlatform =
    normalizedPlatform && normalizedPlatform !== "other"
      ? normalizedPlatform
      : undefined;

  const rawSkillId = boundedSingle(params.skill_id, 80);
  const skillId = SKILL_IDS.has(rawSkillId)
    ? (rawSkillId as QuoteSkillId)
    : undefined;
  const rawSkillVersion = boundedSingle(params.skill_version, 40);
  const skillVersion =
    skillId && QUOTE_SKILL_VERSION_PATTERN.test(rawSkillVersion)
      ? rawSkillVersion
      : undefined;

  const utmSource = normalizeQuoteUtmSource(
    boundedSingle(params.utm_source, 40) || undefined,
  );
  const utmMedium = normalizeQuoteUtmMedium(
    boundedSingle(params.utm_medium, 40) || undefined,
  );
  const utmCampaign = normalizeQuoteUtmCampaign(
    boundedSingle(params.utm_campaign, 40) || undefined,
  );
  const utmContent = normalizeQuoteUtmContent(
    boundedSingle(params.utm_content, 40) || undefined,
  );

  // Direct plan continuations encode their canonical runtime in utm_medium.
  // Promote it to source_platform only when it is an actual known platform;
  // generic transport values (mcp/rest) normalize to `other` and are ignored.
  const mediumPlatform = normalizeSourcePlatform(utmMedium || undefined);
  const inferredPlatform =
    mediumPlatform && mediumPlatform !== "other"
      ? mediumPlatform
      : undefined;
  const sourcePlatform = explicitPlatform ?? inferredPlatform;

  return {
    ...(sourcePlatform ? { source_platform: sourcePlatform } : {}),
    ...(skillId ? { skill_id: skillId } : {}),
    ...(skillVersion ? { skill_version: skillVersion } : {}),
    ...(utmSource ? { utm_source: utmSource } : {}),
    ...(utmMedium ? { utm_medium: utmMedium } : {}),
    ...(utmCampaign ? { utm_campaign: utmCampaign } : {}),
    ...(utmContent ? { utm_content: utmContent } : {}),
  };
}

/**
 * Fail optional analytics open at the lead-capture boundary. The public JSON
 * schema advertises canonical enums, but a stale client or edited URL must not
 * turn an otherwise valid buyer request into a 400. Remove every raw
 * attribution field, then re-add only values accepted by the closed contract.
 */
export function sanitizeQuoteRequestAttribution(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;

  const sanitized: Record<string, unknown> = {
    ...(input as Record<string, unknown>),
  };
  const attribution = sanitizeQuoteAttributionQuery(sanitized);
  for (const field of ATTRIBUTION_FIELDS) delete sanitized[field];
  return { ...sanitized, ...attribution };
}
