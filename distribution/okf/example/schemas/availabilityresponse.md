---
type: "Schema"
title: "AvailabilityResponse"
---
# AvailabilityResponse
Schema `AvailabilityResponse`.
## Properties

- `input` (object, required)
- `city_found` (boolean, required)
- `catalog_match` (boolean, required): The city resolved to a configured catalog entry; this does not confirm order coverage.
- `coverage_confirmation_required` (boolean, required)
- `city` (string, required)
- `state` (string, required)
- `city_tier` (string, required)
- `event_date` (string, required)
- `days_until_event` (integer, required)
- `in_past` (boolean, required): True when the requested event date has already passed. Confirm the intended date before planning or quoting.
- `typical_lead_time_hours` (integer, required)
- `recommendation` (string, required): yes = comfortable window; tight = at or near typical lead time; rush = inside lead time; very-rush = <24h.
- `role_found` (boolean,null, required): null when no role was requested; true when the requested role resolved; false when it did not match the catalog.
- `role_suggestion` (object): Present only when role_found is false and there is one unambiguous nearby catalog match. Confirm before using it.
- `role` (object)
- `count` (integer)
- `notes` (array, required)

[All schemas](index.md) · [bundle root](../index.md)
