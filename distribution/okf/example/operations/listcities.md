---
type: "API Operation"
title: "List configured market entries"
description: "Use this for the canonical configured market catalog or to filter by state or tier (hub / mid / small)."
method: "GET"
path: "/api/v1/cities"
resource: "https://mcp.tempguru.co/api/v1/cities"
operation_id: "listCities"
tags:
  - "Discovery"
---
# List configured market entries
Use this for the canonical configured market catalog or to filter by state or tier (hub / mid / small). A catalog match determines planning rate and lead-time bands; it does not confirm real-time availability or order coverage. A TempGuru coordinator confirms the specific order after buyer submission.
- **Operation:** `GET https://mcp.tempguru.co/api/v1/cities`
- **Tags:** Discovery
## Parameters

- `state` (query): Filter by state. Accepts either a 2-letter postal code (e.g., 'CA') or a full state name (e.g., 'California'). US states and Canadian provinces both supported.
- `tier` (query): Filter by market tier. 'hub' = 25 major metros (NYC, LA, Boston, etc.); 'mid' = 128 secondary markets; 'small' = 192 tertiary markets.
- `country` (query): Filter to the United States (`US`) or Canada (`CA`).
- `city` (query): Switch to a single-city configured-catalog match instead of listing entries. A match is not confirmed order coverage.
- `limit` (query): Maximum list rows returned. The unfiltered endpoint defaults to 100.

## Related schemas

- [CitiesResponse](../schemas/citiesresponse.md)
- [Error](../schemas/error.md)

[All operations](index.md) · [bundle root](../index.md)
