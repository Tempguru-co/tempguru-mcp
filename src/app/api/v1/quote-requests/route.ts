// POST /api/v1/quote-requests, REST mirror of the MCP `request_quote` tool.
//
// The one write operation on the public REST surface. Exists so OpenAPI-based
// agent platforms (ChatGPT Custom GPT Actions, Coze plugins, Copilot API
// plugins) can submit staffing inquiries natively instead of falling back to
// the web form. Validation (shared zod schema), CRM write (createLead), and
// confirmation payloads are byte-identical to the MCP tool, all three live
// in shared modules (src/lib/mcp/quote.ts, src/lib/notion/create-lead.ts).
//
// Privacy contract (README / OPERATIONS.md): contact and event details go
// ONLY to the Notion CRM. Telemetry records tool name, city slug, UA class,
// country, and success/error, never the request body. The telemetry write
// is awaited in-handler; deferred writes die at Vercel function shutdown.
//
// Abuse posture (public, no-auth write):
//   - JSON body capped at 64 KB
//   - zod validation incl. email format (same schema as the MCP tool)
//   - light per-IP fixed-window rate limit, fail-open (src/lib/api/rate-limit.ts)

import {
  RequestQuoteSchema,
  quoteSubmittedPayload,
  quoteFailedPayload,
} from "@/lib/mcp/quote";
import { createLead } from "@/lib/notion/create-lead";
import { track } from "@/lib/telemetry/track";
import { checkQuoteRateLimit } from "@/lib/api/rate-limit";
import {
  jsonWriteError,
  jsonWrite,
  jsonRateLimited,
  optionsPreflightPost,
} from "@/lib/api/responses";

const MAX_BODY_BYTES = 64_000;

function clientIp(request: Request): string {
  // On Vercel, x-forwarded-for is set by the platform with the real client
  // IP first; x-real-ip is the fallback. Empty locally (limiter fails open).
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "";
}

export async function POST(request: Request) {
  // ── Parse, with size cap ────────────────────────────────────────────────
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) {
    return jsonWriteError(
      { code: "invalid_param", message: `Request body too large (max ${MAX_BODY_BYTES} bytes).` },
      { status: 413 },
    );
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return jsonWriteError({ code: "invalid_param", message: "Could not read request body." });
  }
  // Re-check actual size in bytes (Content-Length can lie or be absent with
  // chunked encoding, and string .length counts UTF-16 code units, not bytes).
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return jsonWriteError(
      { code: "invalid_param", message: `Request body too large (max ${MAX_BODY_BYTES} bytes).` },
      { status: 413 },
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return jsonWriteError({ code: "invalid_param", message: "Request body must be valid JSON." });
  }

  // ── Validate, the exact schema the MCP tool advertises ────────────────
  const parsed = RequestQuoteSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue.path.join(".") || undefined;
    const missing = issue.code === "invalid_type" && issue.message.includes("undefined");
    return jsonWriteError({
      code: missing ? "missing_required" : "invalid_param",
      message: field ? `${field}: ${issue.message}` : issue.message,
      field,
    });
  }
  const input = parsed.data;

  // ── Rate limit (after validation, so malformed floods cost no Redis) ───
  const verdict = await checkQuoteRateLimit(clientIp(request));
  if (!verdict.allowed) {
    return jsonRateLimited(verdict.retryAfterSeconds);
  }

  // ── CRM write, then telemetry awaited in-handler (no PII in telemetry) ─
  const userAgent = request.headers.get("user-agent") ?? "";
  const ipCountry = request.headers.get("x-vercel-ip-country") ?? "";
  // Attribution tag for telemetry: header first, else a `source` field a website
  // widget posts in its body (zod strips it from `input`, so read raw `body`).
  // NB: distinct from createLead's `source` (UA + country for trust scoring),
  // same word, different jobs.
  const rawBodySource =
    body && typeof body === "object" && typeof (body as Record<string, unknown>).source === "string"
      ? ((body as Record<string, unknown>).source as string)
      : "";
  const sourceTag = request.headers.get("x-tempguru-source") ?? rawBodySource;
  const result = await createLead({ ...input, channel: "rest", source: { userAgent, ipCountry } });
  await track({
    tool: "request_quote",
    status: result.success ? "success" : "error",
    city: input.city,
    userAgent,
    ipCountry,
    source: sourceTag,
  });

  if (!result.success) {
    // Upstream CRM failure (Notion down / unconfigured), same payload the
    // MCP tool returns, surfaced as 502 so agents know to use the fallback.
    return jsonWrite(quoteFailedPayload(result.error), 502);
  }

  return jsonWrite(
    quoteSubmittedPayload(input.contact_email, result.deal_name, result.reference, result.captured),
  );
}

export async function OPTIONS() {
  return optionsPreflightPost();
}
