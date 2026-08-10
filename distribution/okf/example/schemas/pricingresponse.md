---
type: "Schema"
title: "PricingResponse"
---
# PricingResponse
Schema `PricingResponse`.
## Properties

- `input` (object, required)
- `role` (string, required)
- `role_slug` (string, required)
- `city` (string, required)
- `state` (string, required)
- `city_tier` (string, required)
- `hourly_range_low` (number, required)
- `hourly_range_high` (number, required)
- `currency` (string, required)
- `all_inclusive` (string, required)
- `tier_definition` (string)
- `all_tiers_for_context` (object)
- `pricing_notes` (string)
- `role_note` (string): Caveat emitted when the requested phrasing maps to a constrained service, for example security mapping to unarmed Crowd Control rather than licensed guards.

[All schemas](index.md) · [bundle root](../index.md)
