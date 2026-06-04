// Telemetry storage — Upstash Redis via Vercel Marketplace integration.
//
// The integration sets KV_REST_API_URL + KV_REST_API_TOKEN automatically on
// the tempguru-mcp project once Upstash is added from the Vercel Marketplace.
// If those env vars aren't set (e.g. local dev without integration), the
// client below short-circuits to a no-op so the MCP tools continue serving
// without an active telemetry backend.

import { Redis } from "@upstash/redis";

type RedisCmd = (redis: Redis) => Promise<unknown>;

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
 * Fire-and-forget execution against Redis. Returns immediately; never blocks
 * the caller; never throws. Use this for telemetry writes from request paths.
 */
export function ff(cmd: RedisCmd): void {
  const r = client();
  if (!r) return;
  cmd(r).catch(() => {
    // Telemetry failures must never surface to MCP clients. Silently drop.
  });
}

/**
 * Awaited execution against Redis. Use this for dashboard reads where we
 * want to surface errors to the operator.
 */
export async function exec<T>(cmd: (redis: Redis) => Promise<T>): Promise<T | null> {
  const r = client();
  if (!r) return null;
  return cmd(r);
}

export function isConfigured(): boolean {
  return client() !== null;
}
