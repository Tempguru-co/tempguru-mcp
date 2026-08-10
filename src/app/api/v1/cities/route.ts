// GET /api/v1/cities?state={name}&tier={hub|mid|small}&country={US|CA}&city={name}&limit={n}
// List configured market entries, or (with city=) a single catalog match. All optional.

import { queryCities, type CitiesQuery, type CityTier } from "@/lib/mcp/queries";
import {
  jsonOk,
  jsonError,
  optionalParam,
  optionalIntParam,
  optionsPreflight,
} from "@/lib/api/responses";
import { trackRest } from "@/lib/api/track-rest";

const VALID_TIERS: CityTier[] = ["hub", "mid", "small"];

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = optionalParam(url, "state");
  const country = optionalParam(url, "country");
  const city = optionalParam(url, "city");
  const limit = optionalIntParam(url, "limit");
  const tierRaw = optionalParam(url, "tier");
  const tier =
    tierRaw && (VALID_TIERS as string[]).includes(tierRaw)
      ? (tierRaw as CityTier)
      : tierRaw // keep invalid value so queryCities returns 400
      ? (tierRaw as unknown as CityTier)
      : undefined;

  const input: CitiesQuery = { state, tier, country, city, limit };
  const result = queryCities(input);
  await trackRest(request, { tool: "get_cities", status: result.ok ? "success" : "error", state, city });
  if (!result.ok) return jsonError(result.error);
  return jsonOk(input, result.data);
}

export async function OPTIONS() {
  return optionsPreflight();
}
