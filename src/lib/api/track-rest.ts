// Telemetry for the REST read endpoints. These mirror the MCP tools but were
// previously untracked, so a whole distribution channel (Custom GPT Actions,
// Copilot/Coze plugins hitting /api/v1/*) was invisible on the dashboard. This
// helper pulls UA/country/source off the Request and records the call tagged
// channel:"rest" so /admin can split MCP vs REST volume.
//
// Awaited by callers (like the MCP path) so the write lands before the response
// on Vercel's serverless runtime; track() itself caps the wait and fails open.

import { track } from "@/lib/telemetry/track";
import type { FunnelEvent } from "@/lib/telemetry/track";

export function trackRest(
  request: Request,
  rec: {
    tool: string;
    status: "success" | "error";
    city?: string;
    role?: string;
    state?: string;
    funnelEvents?: FunnelEvent[];
    sourcePlatform?: string;
  },
): Promise<void> {
  const url = new URL(request.url);
  return track({
    ...rec,
    channel: "rest",
    userAgent: request.headers.get("user-agent") ?? "",
    ipCountry: request.headers.get("x-vercel-ip-country") ?? "",
    source: request.headers.get("x-tempguru-source") ?? url.searchParams.get("source") ?? "",
  });
}
