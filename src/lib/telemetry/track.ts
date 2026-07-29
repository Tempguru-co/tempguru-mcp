// Per-tool-invocation telemetry writer.
//
// Schema (Redis keys, all keyed by UTC date `YYYY-MM-DD`):
//
//   tools:{date}                 HASH  tool_name → invocation count
//   uas:{date}                   HASH  ua_class → invocation count
//   ua:unclassified:{date}       HASH  fixed "unclassified" bucket → count
//   countries:{date}             HASH  iso2_country → invocation count
//   status:{date}                HASH  "success"|"error" → count
//   sources:{date}               HASH  attribution tag → count (our controlled surfaces)
//   funnel:{date}                HASH  "channel:event" → lifecycle count
//   source-platforms:{date}       HASH  canonical agent platform → successful new quote leads
//   source-skills:{date}          HASH  canonical TempGuru skill → successful new quote leads
//   queries:cities:{date}        ZSET  canonical city slug → invocation count (sorted)
//   queries:cities:unmatched:{date}  HASH  fixed "unmatched" bucket → count
//   queries:roles:{date}         ZSET  role slug → invocation count (sorted)
//   queries:states:{date}        ZSET  state code → invocation count (sorted)
//   recent:invocations           LIST  last 200 events as JSON strings
//   dates:active                 ZSET  yyyy-mm-dd → unix timestamp (for the time-series widget)
//
// Each daily key gets a 90-day TTL on first write. recent:invocations is
// trimmed to 200 entries on every write.

import { exec } from "./redis";
import { classifyUserAgent, type UaClass } from "./classify-ua";
import { findCity, findRole, findState } from "../mcp/data";
import { normalizeControlledSource, normalizeSourcePlatform } from "./source-tags";
import { QUOTE_SKILL_IDS, type QuoteSkillId } from "../mcp/quote";

const TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days
const RECENT_LIMIT = 200;
// Hard cap on how long a telemetry write may delay a tool response. Upstash
// REST writes land in well under this; the cap only guards against a slow or
// hung backend so telemetry can never noticeably degrade a tool call.
const WRITE_CAP_MS = 1000;

export interface TrackInput {
  tool: string;
  userAgent: string;
  ipCountry: string;
  status: "success" | "error";
  city?: string;
  role?: string;
  state?: string;
  // Which surface served the call: the MCP tool endpoint or the REST mirror.
  // Lets the dashboard split MCP vs REST volume (REST read routes were invisible
  // before). Defaults to "mcp" when unset.
  channel?: "mcp" | "rest";
  // Attribution tag set by a surface we control (X-TempGuru-Source header or
  // ?source= param). Empty/undefined for organic/unattributed traffic.
  source?: string;
  // Coarse, non-PII lifecycle events. These are counts only; no plan/reference
  // identifiers enter telemetry.
  funnelEvents?: FunnelEvent[];
  // Agent-supplied platform attribution. Canonical allowlist only; unknown
  // values collapse to `other` before Redis.
  sourcePlatform?: string;
  // Canonical TempGuru skill that produced a successful quote lead. Closed
  // enum only; arbitrary public strings never become telemetry dimensions.
  sourceSkill?: QuoteSkillId;
}

export type FunnelEvent =
  | "plans_created"
  | "plans_saved"
  | "plans_resumed"
  | "quotes_submitted"
  | "quotes_linked";

const QUOTE_SKILL_ID_SET = new Set<string>(QUOTE_SKILL_IDS);

export function normalizeSourceSkill(value: string | undefined): QuoteSkillId | null {
  return value && QUOTE_SKILL_ID_SET.has(value) ? (value as QuoteSkillId) : null;
}

const utcDate = (): string => new Date().toISOString().slice(0, 10);
export function canonicalTelemetryRole(value: string | undefined): string | null {
  return value ? findRole(value)?.slug ?? null : null;
}

export function canonicalTelemetryCity(value: string | undefined): string | null {
  const city = value ? findCity(value) : null;
  return city ? city.slug.replace(/-event-staffing$/, "") : null;
}

export function canonicalTelemetryState(value: string | undefined): string | null {
  return value ? findState(value)?.abbr ?? null : null;
}

export function canonicalTelemetryCountry(value: string | undefined): string | null {
  const country = value?.trim().toUpperCase() ?? "";
  return /^[A-Z]{2}$/.test(country) ? country : null;
}

export async function track(input: TrackInput): Promise<void> {
  const date = utcDate();
  const ua: UaClass = classifyUserAgent(input.userAgent);

  // Never persist the public user-agent string. The existing UA class plus a
  // fixed diagnostic bucket preserve aggregate visibility without retaining a
  // name, email, phone, token, or other caller-controlled substring.
  const unclassifiedBucket = ua === "other" ? "unclassified" : null;

  // Sanitize the city demand signal so only real, recognized markets feed the
  // "Top cities queried" chart. findCity() resolves against our 345-market
  // catalog (by slug or name), so junk lookups (test, aaaa, injection strings,
  // emoji) and unrecognized place names never pollute the aggregate. The
  // canonical slug (suffix stripped) also dedupes "Atlanta" vs
  // "atlanta-event-staffing" into one member. A present-but-unrecognized input
  // increments a fixed diagnostic bucket (mirroring ua:unclassified), so its
  // aggregate volume stays visible without retaining the public input.
  const canonicalCity = canonicalTelemetryCity(input.city);
  const unmatchedCityBucket = input.city && !canonicalCity ? "unmatched" : null;
  const canonicalRole = canonicalTelemetryRole(input.role);
  const canonicalState = canonicalTelemetryState(input.state);
  const canonicalCountry = canonicalTelemetryCountry(input.ipCountry);

  // Attribution tag from a controlled surface (custom_gpt / website_widget /
  // manual_test / team_demo / ...). Sanitized to [a-z0-9_-], capped. Only our
  // own surfaces set it; organic traffic has none, which is the whole point:
  // subtract the tagged-known to see the untagged candidate-real pool.
  const sourceTag = normalizeControlledSource(input.source);
  const sourcePlatformTag = normalizeSourcePlatform(input.sourcePlatform);
  const sourceSkillTag = normalizeSourceSkill(input.sourceSkill);
  const funnelEvents = [...new Set(input.funnelEvents ?? [])];

  // Build the ring-buffer payload before entering the async context so it is
  // already serialised when the Promise.allSettled batch fires.
  const channel = input.channel === "rest" ? "rest" : "mcp";

  const event = JSON.stringify({
    ts: new Date().toISOString(),
    tool: input.tool,
    ua,
    channel,
    country: canonicalCountry,
    status: input.status,
    city: canonicalCity,
    role: canonicalRole,
    state: canonicalState,
    source: sourceTag,
    source_platform: sourcePlatformTag,
    source_skill: sourceSkillTag,
  });

  // Issue all writes in ONE Promise.allSettled so they race to completion in
  // parallel, then AWAIT the batch (capped) so it lands before the tool handler
  // returns its result. Non-awaited / after()-deferred writes were killed at
  // Vercel function shutdown before reaching Upstash, awaiting in-handler is
  // the only durable path on serverless.
  const write = exec(async (r) => {
    // Funnel counts and successful-lead attribution form one logical event.
    // MULTI keeps their increments and TTLs atomic, so a partial Redis response
    // can never record a quote without its channel (or vice versa).
    const funnelWrite = funnelEvents.length
      ? (() => {
          const transaction = r.multi();
          for (const funnelEvent of funnelEvents) {
            transaction.hincrby(`funnel:${date}`, `${channel}:${funnelEvent}`, 1);
          }
          const tracksQuoteSource =
            Boolean(sourcePlatformTag) && funnelEvents.includes("quotes_submitted");
          if (tracksQuoteSource) {
            transaction.hincrby(
              `source-platforms:${date}`,
              sourcePlatformTag as string,
              1,
            );
          }
          const tracksQuoteSkill =
            Boolean(sourceSkillTag) && funnelEvents.includes("quotes_submitted");
          if (tracksQuoteSkill) {
            transaction.hincrby(
              `source-skills:${date}`,
              sourceSkillTag as string,
              1,
            );
          }
          transaction.expire(`funnel:${date}`, TTL_SECONDS);
          if (tracksQuoteSource) {
            transaction.expire(`source-platforms:${date}`, TTL_SECONDS);
          }
          if (tracksQuoteSkill) {
            transaction.expire(`source-skills:${date}`, TTL_SECONDS);
          }
          return transaction.exec();
        })()
      : Promise.resolve();

    await Promise.allSettled([
      // Counters
      r.hincrby(`tools:${date}`, input.tool, 1),
      r.hincrby(`uas:${date}`, ua, 1),
      // Fixed unclassified bucket only; the raw public UA is never stored.
      unclassifiedBucket
        ? r.hincrby(`ua:unclassified:${date}`, unclassifiedBucket, 1)
        : Promise.resolve(),
      r.hincrby(`status:${date}`, input.status, 1),
      r.hincrby(`channels:${date}`, channel, 1),
      canonicalCountry
        ? r.hincrby(`countries:${date}`, canonicalCountry, 1)
        : Promise.resolve(),
      sourceTag ? r.hincrby(`sources:${date}`, sourceTag, 1) : Promise.resolve(),
      funnelWrite,
      // Real markets feed the sorted demand chart; unrecognized inputs land in
      // a separate diagnostic HASH so junk never pollutes "Top cities queried".
      canonicalCity ? r.zincrby(`queries:cities:${date}`, 1, canonicalCity) : Promise.resolve(),
      unmatchedCityBucket
        ? r.hincrby(`queries:cities:unmatched:${date}`, unmatchedCityBucket, 1)
        : Promise.resolve(),
      canonicalRole ? r.zincrby(`queries:roles:${date}`, 1, canonicalRole) : Promise.resolve(),
      canonicalState
        ? r.zincrby(`queries:states:${date}`, 1, canonicalState)
        : Promise.resolve(),
      // TTLs (idempotent, re-setting is safe)
      r.expire(`tools:${date}`, TTL_SECONDS),
      r.expire(`uas:${date}`, TTL_SECONDS),
      unclassifiedBucket
        ? r.expire(`ua:unclassified:${date}`, TTL_SECONDS)
        : Promise.resolve(),
      r.expire(`status:${date}`, TTL_SECONDS),
      r.expire(`channels:${date}`, TTL_SECONDS),
      r.expire(`countries:${date}`, TTL_SECONDS),
      sourceTag ? r.expire(`sources:${date}`, TTL_SECONDS) : Promise.resolve(),
      r.expire(`queries:cities:${date}`, TTL_SECONDS),
      unmatchedCityBucket
        ? r.expire(`queries:cities:unmatched:${date}`, TTL_SECONDS)
        : Promise.resolve(),
      r.expire(`queries:roles:${date}`, TTL_SECONDS),
      r.expire(`queries:states:${date}`, TTL_SECONDS),
      // dates:active ZSET, used by the time-series widget
      r.zadd("dates:active", { score: Date.now(), member: date }),
      // Ring buffer, lpush must complete before ltrim; chain with .then()
      // so both are initiated in this batch but trim only fires after push.
      r.lpush("recent:invocations", event).then(() =>
        r.ltrim("recent:invocations", 0, RECENT_LIMIT - 1),
      ),
    ]);
  });

  // Await the write, but never let it hold up (or break) the tool response for
  // more than WRITE_CAP_MS. In the normal case the write completes in well under
  // the cap and is durably persisted; in the pathological slow-Redis case we
  // drop the datapoint rather than degrade the agent's call.
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      write,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, WRITE_CAP_MS);
      }),
    ]);
  } catch {
    // Telemetry must never surface to MCP clients. Silently drop.
  } finally {
    if (timer) clearTimeout(timer);
  }
}
