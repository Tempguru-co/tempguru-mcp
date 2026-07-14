// Light per-IP rate limit for the public quote-submission endpoint.
//
// Fixed-window counter in Upstash (the same Redis the telemetry layer uses):
// INCR ratelimit:quote:{hash} + EXPIRE NX. Fails OPEN on any Redis absence,
// error, or slow response, a broken limiter must never block a legitimate
// quote submission, mirroring the telemetry layer's "never degrade the call"
// posture.
//
// Privacy: IPs are never stored raw (OPERATIONS.md: "No raw IPs"). The key
// uses a truncated SHA-256 of the IP and expires with the window, so nothing
// identifying or durable lands in Redis.
//
// The limit is deliberately generous: ChatGPT Actions, Coze, and Copilot
// route many end users through shared platform egress IPs, so a tight per-IP
// cap would throttle legitimate traffic from exactly the surfaces this
// endpoint exists for. 20/hour stops runaway agent loops and hand-rolled
// spam scripts, which is what a no-auth public write can realistically gate.

// Relative import (not the "@/" alias) so this module can be bundled into the
// stdio build by esbuild, which doesn't resolve tsconfig path aliases.
import { createHash } from "node:crypto";
import { exec } from "../telemetry/redis";

const LIMIT = 20; // max submissions per IP per window
const WINDOW_SECONDS = 3600; // 1-hour fixed window
const CHECK_CAP_MS = 1000; // never let the limiter delay a submission longer than this

export type RateLimitVerdict =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

const ALLOWED: RateLimitVerdict = { allowed: true };

export async function checkQuoteRateLimit(ip: string): Promise<RateLimitVerdict> {
  // No client IP (local dev, direct invocation), nothing meaningful to key
  // on, and on Vercel the header is always present. Fail open.
  if (!ip) return ALLOWED;

  const hash = createHash("sha256").update(ip).digest("hex").slice(0, 32);
  const key = `ratelimit:quote:${hash}`;

  const check: Promise<RateLimitVerdict | null> = exec(async (r) => {
    const count = await r.incr(key);
    // NX: only set the TTL when the key has none, so a crash between INCR
    // and EXPIRE can never leave an immortal counter that bans an IP forever.
    await r.expire(key, WINDOW_SECONDS, "nx");
    if (count <= LIMIT) return ALLOWED;
    const ttl = await r.ttl(key);
    return {
      allowed: false,
      retryAfterSeconds: ttl > 0 ? ttl : WINDOW_SECONDS,
    };
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const verdict = await Promise.race([
      check,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), CHECK_CAP_MS);
      }),
    ]);
    // null = Redis not configured (exec short-circuit) or check timed out.
    return verdict ?? ALLOWED;
  } catch {
    return ALLOWED; // Redis hiccup, fail open
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// Generic per-IP fixed-window limiter for cheap read-side abuse vectors
// (plan-snapshot persistence, quote-status lookups). Same fail-open posture
// and hashed-IP privacy as the quote limiter, higher ceiling.
const READ_LIMIT = 60; // per IP per hour, per kind
export async function checkReadRateLimit(ip: string, kind: string): Promise<RateLimitVerdict> {
  if (!ip) return { allowed: true };
  const hash = createHash("sha256").update(ip).digest("hex").slice(0, 32);
  const key = `ratelimit:${kind}:${hash}`;
  const check: Promise<RateLimitVerdict | null> = exec(async (r) => {
    const count = await r.incr(key);
    await r.expire(key, WINDOW_SECONDS, "nx");
    if (count <= READ_LIMIT) return { allowed: true };
    const ttl = await r.ttl(key);
    return { allowed: false, retryAfterSeconds: ttl > 0 ? ttl : WINDOW_SECONDS };
  });
  let timer;
  try {
    const verdict = await Promise.race([
      check,
      new Promise((resolve) => { timer = setTimeout(() => resolve(null), CHECK_CAP_MS); }),
    ]);
    return (verdict as RateLimitVerdict | null) ?? { allowed: true };
  } catch {
    return { allowed: true };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
