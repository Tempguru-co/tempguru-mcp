// GET /api/v1/pricing?role={slug}&city={name}
// All-inclusive hourly rate range for a role in a city. Both required.

import {
  queryRolePricing,
  isPricingRoleNotFound,
  isPricingCityNotFound,
  isPricingNoData,
  type RolePricingQuery,
} from "@/lib/mcp/queries";
import {
  jsonOk,
  jsonError,
  requireParam,
  optionsPreflight,
} from "@/lib/api/responses";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const role = requireParam(url, "role");
  const city = requireParam(url, "city");

  if (!role) {
    return jsonError({ code: "missing_required", message: "role is required", field: "role" });
  }
  if (!city) {
    return jsonError({ code: "missing_required", message: "city is required", field: "city" });
  }

  const input: RolePricingQuery = { role, city };
  const result = queryRolePricing(input);
  if (!result.ok) return jsonError(result.error);

  if (isPricingRoleNotFound(result.data)) {
    return jsonError({
      code: "not_found",
      message: `Unknown role "${result.data.requested}". Available roles: ${result.data.available_roles.map((r) => r.slug).join(", ")}.`,
      field: "role",
      suggestion: {
        kind: "role",
        slug: result.data.available_roles[0]?.slug,
        name: result.data.available_roles[0]?.name ?? "",
      },
    });
  }

  if (isPricingCityNotFound(result.data)) {
    return jsonError({
      code: "not_found",
      message: `City "${result.data.requested}" is not in TempGuru's 345-page footprint. See /api/v1/cities for the canonical list.`,
      field: "city",
    });
  }

  if (isPricingNoData(result.data)) {
    return jsonError({
      code: "not_found",
      message: result.data.error,
      field: "role",
    });
  }

  return jsonOk(input, result.data);
}

export async function OPTIONS() {
  return optionsPreflight();
}
