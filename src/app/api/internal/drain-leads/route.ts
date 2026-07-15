import { timingSafeEqual } from "node:crypto";
import {
  configuredNotionApiKey,
  drainPendingLeads,
  MAX_DRAIN_BATCH,
} from "@/lib/notion/create-lead";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function json(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function secretsEqual(presented: string, expected: string): boolean {
  const a = Buffer.from(presented, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Vercel Cron invokes this route with `Authorization: Bearer $CRON_SECRET`. */
export async function GET(request: Request): Promise<Response> {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    return json({ ok: false, error: "Scheduled lead drain is not configured." }, 503);
  }

  const expected = `Bearer ${cronSecret}`;
  const presented = request.headers.get("authorization") ?? "";
  if (!secretsEqual(presented, expected)) {
    return json({ ok: false, error: "Unauthorized." }, 401);
  }

  const apiKey = configuredNotionApiKey();
  if (!apiKey) {
    return json({ ok: false, error: "CRM integration is not configured." }, 503);
  }

  const drain = await drainPendingLeads(
    apiKey,
    MAX_DRAIN_BATCH,
    Date.now() + maxDuration * 1000,
  );
  return json({ ok: true, drain }, 200);
}
