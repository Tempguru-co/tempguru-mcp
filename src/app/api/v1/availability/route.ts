// GET /api/v1/availability?city={name}&date={YYYY-MM-DD}&role={slug}&headcount={int}
// Lead-time guidance for an event. city and date required.

import {
  queryAvailability,
  isAvailabilityCityNotFound,
  isAvailabilityDateInvalid,
  type AvailabilityQuery,
} from "@/lib/mcp/queries";
import {
  jsonOk,
  jsonError,
  optionalParam,
  requireParam,
  optionalIntParam,
  optionsPreflight,
} from "@/lib/api/responses";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const city = requireParam(url, "city");
  const date = requireParam(url, "date");
  const role = optionalParam(url, "role");
  const headcount = optionalIntParam(url, "headcount");

  if (!city) {
    return jsonError({ code: "missing_required", message: "city is required", field: "city" });
  }
  if (!date) {
    return jsonError({ code: "missing_required", message: "date is required", field: "date" });
  }

  const input: AvailabilityQuery = { city, date, role, headcount };
  const result = queryAvailability(input);
  if (!result.ok) return jsonError(result.error);

  // The query function returns successful payloads with shape variants for
  // city-not-found and date-invalid (to preserve MCP byte-identity). For REST
  // we translate those to proper HTTP error envelopes.
  if (isAvailabilityCityNotFound(result.data)) {
    return jsonError({
      code: "not_found",
      message: result.data.message,
      field: "city",
    });
  }

  if (isAvailabilityDateInvalid(result.data)) {
    return jsonError({
      code: "invalid_param",
      message: result.data.error,
      field: "date",
    });
  }

  return jsonOk(input, result.data);
}

export async function OPTIONS() {
  return optionsPreflight();
}
