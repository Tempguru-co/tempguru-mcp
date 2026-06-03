// GET /api/v1/health
// Health probe. Returns the running package version. No cache.

import { jsonOkNoCache, optionsPreflight } from "@/lib/api/responses";
import pkg from "../../../../../package.json";

export async function GET() {
  return jsonOkNoCache({ status: "ok", version: pkg.version });
}

export async function OPTIONS() {
  return optionsPreflight();
}
