// GET /api/v1/cities?state={name}&tier={hub|mid|small}
// List cities TempGuru serves. Both query params optional.

import { queryCities, type CitiesQuery, type CityTier } from "@/lib/mcp/queries";
import {
  jsonOk,
  jsonError,
  optionalParam,
  optionsPreflight,
} from "@/lib/api/responses";

const VALID_TIERS: CityTier[] = ["hub", "mid", "small"];

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = optionalParam(url, "state");
  const tierRaw = optionalParam(url, "tier");
  const tier =
    tierRaw && (VALID_TIERS as string[]).includes(tierRaw)
      ? (tierRaw as CityTier)
      : tierRaw // keep invalid value so queryCities returns 400
      ? (tierRaw as unknown as CityTier)
      : undefined;

  const input: CitiesQuery = { state, tier };
  const result = queryCities(input);
  if (!result.ok) return jsonError(result.error);
  return jsonOk(input, result.data);
}

export async function OPTIONS() {
  return optionsPreflight();
}
