// Per-tool-invocation telemetry writer.
//
// Schema (Redis keys — all keyed by UTC date `YYYY-MM-DD`):
//
//   tools:{date}                 HASH  tool_name → invocation count
//   uas:{date}                   HASH  ua_class → invocation count
//   countries:{date}             HASH  iso2_country → invocation count
//   status:{date}                HASH  "success"|"error" → count
//   queries:cities:{date}        ZSET  city slug → invocation count (sorted)
//   queries:roles:{date}         ZSET  role slug → invocation count (sorted)
//   queries:states:{date}        ZSET  state code → invocation count (sorted)
//   recent:invocations           LIST  last 200 events as JSON strings
//   dates:active                 ZSET  yyyy-mm-dd → unix timestamp (for the time-series widget)
//
// Each daily key gets a 90-day TTL on first write. recent:invocations is
// trimmed to 200 entries on every write.

import { ff } from "./redis";
import { classifyUserAgent, type UaClass } from "./classify-ua";

const TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days
const RECENT_LIMIT = 200;

export interface TrackInput {
  tool: string;
  userAgent: string;
  ipCountry: string;
  status: "success" | "error";
  city?: string;
  role?: string;
  state?: string;
}

const utcDate = (): string => new Date().toISOString().slice(0, 10);
const slug = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 80);

export function track(input: TrackInput): void {
  const date = utcDate();
  const ua: UaClass = classifyUserAgent(input.userAgent);

  ff(async (r) => {
    // Counters
    await Promise.allSettled([
      r.hincrby(`tools:${date}`, input.tool, 1),
      r.hincrby(`uas:${date}`, ua, 1),
      r.hincrby(`status:${date}`, input.status, 1),
      input.ipCountry
        ? r.hincrby(`countries:${date}`, input.ipCountry.toUpperCase(), 1)
        : Promise.resolve(),
      input.city ? r.zincrby(`queries:cities:${date}`, 1, slug(input.city)) : Promise.resolve(),
      input.role ? r.zincrby(`queries:roles:${date}`, 1, slug(input.role)) : Promise.resolve(),
      input.state
        ? r.zincrby(`queries:states:${date}`, 1, input.state.toUpperCase().slice(0, 2))
        : Promise.resolve(),
    ]);

    // Set TTL on the daily keys (idempotent — re-setting is safe)
    await Promise.allSettled([
      r.expire(`tools:${date}`, TTL_SECONDS),
      r.expire(`uas:${date}`, TTL_SECONDS),
      r.expire(`status:${date}`, TTL_SECONDS),
      r.expire(`countries:${date}`, TTL_SECONDS),
      r.expire(`queries:cities:${date}`, TTL_SECONDS),
      r.expire(`queries:roles:${date}`, TTL_SECONDS),
      r.expire(`queries:states:${date}`, TTL_SECONDS),
    ]);

    // Track which dates have any data — used by the time-series widget
    await r.zadd("dates:active", { score: Date.now(), member: date });

    // Append to recent invocations ring buffer
    const event = JSON.stringify({
      ts: new Date().toISOString(),
      tool: input.tool,
      ua,
      country: input.ipCountry || null,
      status: input.status,
      city: input.city || null,
      role: input.role || null,
      state: input.state || null,
    });
    await r.lpush("recent:invocations", event);
    await r.ltrim("recent:invocations", 0, RECENT_LIMIT - 1);
  });
}
