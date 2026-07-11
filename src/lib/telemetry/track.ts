// Per-tool-invocation telemetry writer.
//
// Schema (Redis keys, all keyed by UTC date `YYYY-MM-DD`):
//
//   tools:{date}                 HASH  tool_name → invocation count
//   uas:{date}                   HASH  ua_class → invocation count
//   ua:unclassified:{date}       HASH  raw UA string → count (only "other" bucket)
//   countries:{date}             HASH  iso2_country → invocation count
//   status:{date}                HASH  "success"|"error" → count
//   sources:{date}               HASH  attribution tag → count (our controlled surfaces)
//   queries:cities:{date}        ZSET  canonical city slug → invocation count (sorted)
//   queries:cities:unmatched:{date}  HASH  unrecognized city input → count (diagnostic)
//   queries:roles:{date}         ZSET  role slug → invocation count (sorted)
//   queries:states:{date}        ZSET  state code → invocation count (sorted)
//   recent:invocations           LIST  last 200 events as JSON strings
//   dates:active                 ZSET  yyyy-mm-dd → unix timestamp (for the time-series widget)
//
// Each daily key gets a 90-day TTL on first write. recent:invocations is
// trimmed to 200 entries on every write.

import { exec } from "./redis";
import { classifyUserAgent, type UaClass } from "./classify-ua";
import { findCity } from "../mcp/data";

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
}

const utcDate = (): string => new Date().toISOString().slice(0, 10);
// Bug fix: also replace underscores so "registration_staff" normalises to "registration-staff"
const slug = (s: string): string => s.trim().toLowerCase().replace(/[\s_]+/g, "-").slice(0, 80);
// The diagnostic buckets (unclassified UAs, unmatched city inputs) retain raw
// caller strings; redact anything email-shaped first so PII can never persist
// in telemetry even when a caller stuffs an address into those fields.
const redactEmails = (s: string): string => s.replace(/[^\s@"'<>()]+@[^\s@"'<>()]+/g, "[email]");

export async function track(input: TrackInput): Promise<void> {
  const date = utcDate();
  const ua: UaClass = classifyUserAgent(input.userAgent);

  // Diagnostic: when a UA still falls into "other", retain the raw string
  // (truncated) so the dashboard can show exactly what's unclassified and we
  // can add a pattern next time. Without this, "other" is a black hole.
  const rawUnclassified =
    ua === "other" && input.userAgent
      ? redactEmails(input.userAgent.trim()).slice(0, 200)
      : null;

  // Sanitize the city demand signal so only real, recognized markets feed the
  // "Top cities queried" chart. findCity() resolves against our 345-market
  // catalog (by slug or name), so junk lookups (test, aaaa, injection strings,
  // emoji) and unrecognized place names never pollute the aggregate. The
  // canonical slug (suffix stripped) also dedupes "Atlanta" vs
  // "atlanta-event-staffing" into one member. A present-but-unrecognized input
  // is bucketed separately (mirrors the ua:unclassified capture) so it stays
  // visible for review instead of vanishing silently.
  const cityMatch = input.city ? findCity(input.city) : null;
  const canonicalCity = cityMatch ? cityMatch.slug.replace(/-event-staffing$/, "") : null;
  const unmatchedCity = input.city && !cityMatch ? slug(redactEmails(input.city)) : null;

  // Attribution tag from a controlled surface (custom_gpt / website_widget /
  // manual_test / team_demo / ...). Sanitized to [a-z0-9_-], capped. Only our
  // own surfaces set it; organic traffic has none, which is the whole point:
  // subtract the tagged-known to see the untagged candidate-real pool.
  const sourceTag =
    (input.source ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || null;

  // Build the ring-buffer payload before entering the async context so it is
  // already serialised when the Promise.allSettled batch fires.
  const channel = input.channel === "rest" ? "rest" : "mcp";

  const event = JSON.stringify({
    ts: new Date().toISOString(),
    tool: input.tool,
    ua,
    channel,
    country: input.ipCountry || null,
    status: input.status,
    // Recent feed shows reality: canonical slug when matched, slugified raw
    // when not, so an unrecognized lookup is still visible in the forensic feed.
    city: canonicalCity ?? unmatchedCity,
    role: input.role ? slug(input.role) : null,
    state: input.state ? input.state.toUpperCase().slice(0, 2) : null,
    source: sourceTag,
  });

  // Issue all writes in ONE Promise.allSettled so they race to completion in
  // parallel, then AWAIT the batch (capped) so it lands before the tool handler
  // returns its result. Non-awaited / after()-deferred writes were killed at
  // Vercel function shutdown before reaching Upstash, awaiting in-handler is
  // the only durable path on serverless.
  const write = exec(async (r) => {
    await Promise.allSettled([
      // Counters
      r.hincrby(`tools:${date}`, input.tool, 1),
      r.hincrby(`uas:${date}`, ua, 1),
      // Raw unclassified UA capture (only when bucket === "other")
      rawUnclassified
        ? r.hincrby(`ua:unclassified:${date}`, rawUnclassified, 1)
        : Promise.resolve(),
      r.hincrby(`status:${date}`, input.status, 1),
      r.hincrby(`channels:${date}`, channel, 1),
      input.ipCountry
        ? r.hincrby(`countries:${date}`, input.ipCountry.toUpperCase(), 1)
        : Promise.resolve(),
      sourceTag ? r.hincrby(`sources:${date}`, sourceTag, 1) : Promise.resolve(),
      // Real markets feed the sorted demand chart; unrecognized inputs land in
      // a separate diagnostic HASH so junk never pollutes "Top cities queried".
      canonicalCity ? r.zincrby(`queries:cities:${date}`, 1, canonicalCity) : Promise.resolve(),
      unmatchedCity
        ? r.hincrby(`queries:cities:unmatched:${date}`, unmatchedCity, 1)
        : Promise.resolve(),
      input.role ? r.zincrby(`queries:roles:${date}`, 1, slug(input.role)) : Promise.resolve(),
      input.state
        ? r.zincrby(`queries:states:${date}`, 1, input.state.toUpperCase().slice(0, 2))
        : Promise.resolve(),
      // TTLs (idempotent, re-setting is safe)
      r.expire(`tools:${date}`, TTL_SECONDS),
      r.expire(`uas:${date}`, TTL_SECONDS),
      rawUnclassified ? r.expire(`ua:unclassified:${date}`, TTL_SECONDS) : Promise.resolve(),
      r.expire(`status:${date}`, TTL_SECONDS),
      r.expire(`channels:${date}`, TTL_SECONDS),
      r.expire(`countries:${date}`, TTL_SECONDS),
      sourceTag ? r.expire(`sources:${date}`, TTL_SECONDS) : Promise.resolve(),
      r.expire(`queries:cities:${date}`, TTL_SECONDS),
      unmatchedCity ? r.expire(`queries:cities:unmatched:${date}`, TTL_SECONDS) : Promise.resolve(),
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
