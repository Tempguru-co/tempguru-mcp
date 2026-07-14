// GET /api/v1/quote-requests/{reference}, REST mirror of MCP get_quote_status.

import { queryQuoteStatus, QUOTE_REFERENCE_PATTERN } from "@/lib/mcp/quote-status";
import { jsonBadRequest, jsonOk, jsonRateLimited, optionsPreflight } from "@/lib/api/responses";
import { checkReadRateLimit } from "@/lib/api/rate-limit";
import { trackRest } from "@/lib/api/track-rest";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ reference: string }> },
) {
  const { reference } = await params;
  const normalized = reference.trim().toUpperCase();
  if (!QUOTE_REFERENCE_PATTERN.test(normalized)) {
    await trackRest(request, { tool: "get_quote_status", status: "error" });
    return jsonBadRequest(
      "reference must match the TG-ABC234 quote-reference format.",
      "reference",
    );
  }
  const ip =
    (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() ||
    (request.headers.get("x-real-ip") ?? "");
  const verdict = await checkReadRateLimit(ip, "status");
  if (!verdict.allowed) {
    await trackRest(request, { tool: "get_quote_status", status: "error" });
    return jsonRateLimited(verdict.retryAfterSeconds);
  }
  const result = await queryQuoteStatus(normalized);
  await trackRest(request, {
    tool: "get_quote_status",
    status: result.quote_found ? "success" : "error",
  });
  return jsonOk(
    { reference: normalized },
    result,
    { cacheControl: "no-store" },
  );
}

export async function OPTIONS() {
  return optionsPreflight();
}
