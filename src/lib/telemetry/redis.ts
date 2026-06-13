// Telemetry storage, Upstash Redis via Vercel Marketplace integration.
//
// The integration sets KV_REST_API_URL + KV_REST_API_TOKEN automatically on
// the tempguru-mcp project once Upstash is added from the Vercel Marketplace.
// If those env vars aren't set (e.g. local dev without integration), the
// client below short-circuits to a no-op so the MCP tools continue serving
// without an active telemetry backend.

import { Redis } from "@upstash/redis";

let cached: Redis | null | undefined;

function client(): Redis | null {
  if (cached !== undefined) return cached;
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    cached = null;
    return null;
  }
  cached = new Redis({ url, token });
  return cached;
}

/**
 * Awaited execution against Redis. Returns the command's result, or null when
 * telemetry isn't configured (e.g. local dev / stdio). Does NOT swallow errors, * read callers want them surfaced; write callers (telemetry) wrap their own
 * try/catch so a Redis hiccup can never break a tool call.
 *
 * Telemetry writes are awaited via this same path (capped) rather than deferred:
 * on Vercel's serverless runtime, fire-and-forget / next-server after() writes
 * were killed on function shutdown before they reached Upstash. Awaiting inside
 * the tool handler is the only durable option.
 */
export async function exec<T>(cmd: (redis: Redis) => Promise<T>): Promise<T | null> {
  const r = client();
  if (!r) return null;
  return cmd(r);
}

export function isConfigured(): boolean {
  return client() !== null;
}
