// GET /api/v1/policies, REST mirror of MCP get_policies.

import {
  policyQueryTelemetryStatus,
  queryPolicies,
} from "@/lib/mcp/queries";
import { getPublishedPolicyCacheMaxAge } from "@/lib/mcp/published-offer";
import {
  jsonBadRequest,
  jsonError,
  jsonOk,
  optionalParam,
  optionsPreflight,
} from "@/lib/api/responses";
import { trackRest } from "@/lib/api/track-rest";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const topic = optionalParam(url, "topic");
  if (topic && topic.length > 80) {
    await trackRest(request, { tool: "get_policies", status: "error" });
    return jsonBadRequest("topic must be at most 80 characters.", "topic");
  }
  const now = new Date();
  const result = queryPolicies({ topic }, now);
  if (!result.ok) {
    await trackRest(request, { tool: "get_policies", status: "error" });
    return jsonError(result.error);
  }
  await trackRest(request, {
    tool: "get_policies",
    status: policyQueryTelemetryStatus(result),
  });
  return jsonOk({ topic: topic ?? null }, result.data, {
    cacheControl: `public, max-age=${getPublishedPolicyCacheMaxAge(now)}`,
  });
}

export async function OPTIONS() {
  return optionsPreflight();
}
