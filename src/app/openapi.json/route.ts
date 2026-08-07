// GET /openapi.json
// OpenAPI 3.1 spec describing the public REST API.
// Served with application/json Content-Type and a 1-hour public cache.

import { buildOpenApiSpec } from "@/lib/api/openapi";
import { MACHINE_SECURITY_HEADERS } from "@/lib/http/security";

export async function GET() {
  const spec = buildOpenApiSpec();
  return new Response(JSON.stringify(spec, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      ...MACHINE_SECURITY_HEADERS,
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      ...MACHINE_SECURITY_HEADERS,
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Accept",
      "Access-Control-Max-Age": "86400",
    },
  });
}
