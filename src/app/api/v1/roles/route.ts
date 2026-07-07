// GET /api/v1/roles
// List all event staffing roles TempGuru provides.

import { queryRoles } from "@/lib/mcp/queries";
import { jsonOk, jsonError, optionsPreflight } from "@/lib/api/responses";
import { trackRest } from "@/lib/api/track-rest";

export async function GET(request: Request) {
  const result = queryRoles();
  await trackRest(request, { tool: "get_roles", status: result.ok ? "success" : "error" });
  if (!result.ok) return jsonError(result.error);
  return jsonOk({}, result.data);
}

export async function OPTIONS() {
  return optionsPreflight();
}
