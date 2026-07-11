// GET /api/v1/plans/{id}, REST mirror of MCP get_plan.

import { PLAN_ID_PATTERN, querySavedPlan } from "@/lib/mcp/plan-store";
import { jsonBadRequest, jsonOk, optionsPreflight } from "@/lib/api/responses";
import { trackRest } from "@/lib/api/track-rest";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const normalized = id.trim().toUpperCase();
  if (!PLAN_ID_PATTERN.test(normalized)) {
    await trackRest(request, { tool: "get_plan", status: "error" });
    return jsonBadRequest("id must be a 12-character TempGuru plan reference.", "id");
  }
  const result = await querySavedPlan(normalized);
  await trackRest(request, {
    tool: "get_plan",
    status: result.plan_found ? "success" : "error",
    funnelEvents: result.plan_found ? ["plans_resumed"] : undefined,
  });
  return jsonOk(
    { plan_id: normalized },
    result,
    { cacheControl: "no-store" },
  );
}

export async function OPTIONS() {
  return optionsPreflight();
}
