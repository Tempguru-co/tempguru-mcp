// GET /api/v1/roles
// List all event staffing roles TempGuru provides.

import { queryRoles } from "@/lib/mcp/queries";
import { jsonOk, jsonError, optionsPreflight } from "@/lib/api/responses";

export async function GET() {
  const result = queryRoles();
  if (!result.ok) return jsonError(result.error);
  return jsonOk({}, result.data);
}

export async function OPTIONS() {
  return optionsPreflight();
}
