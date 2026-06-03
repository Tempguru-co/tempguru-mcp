// GET /api/v1/compliance?state={name}
// State-level event staffing compliance summary. state required.

import {
  queryStateCompliance,
  isComplianceNotFound,
  type StateComplianceQuery,
} from "@/lib/mcp/queries";
import {
  jsonOk,
  jsonError,
  requireParam,
  optionsPreflight,
} from "@/lib/api/responses";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = requireParam(url, "state");

  if (!state) {
    return jsonError({
      code: "missing_required",
      message: "state is required (2-letter code or full name)",
      field: "state",
    });
  }

  const input: StateComplianceQuery = { state };
  const result = queryStateCompliance(input);
  if (!result.ok) return jsonError(result.error);

  if (isComplianceNotFound(result.data)) {
    return jsonError({
      code: "not_found",
      message: `Unknown state "${result.data.requested}". Use a 2-letter code (e.g., CA) or full name (e.g., California).`,
      field: "state",
    });
  }

  return jsonOk(input, result.data);
}

export async function OPTIONS() {
  return optionsPreflight();
}
