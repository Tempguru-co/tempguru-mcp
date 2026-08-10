---
type: "Schema"
title: "ComplianceResponse"
---
# ComplianceResponse
Schema `ComplianceResponse`.
## Properties

- `input` (object, required)
- `state` (string, required)
- `state_abbr` (string, required)
- `min_wage_usd` (number, required)
- `w2_required` (boolean, required)
- `w2_note` (string)
- `overtime_threshold_weekly_hours` (integer, required)
- `overtime_threshold_daily_hours` (integer)
- `overtime_daily_double_hours` (integer)
- `seventh_day_overtime` (boolean)
- `unique_rules` (array, required)
- `liability_coverage_included` (boolean)
- `workers_comp_included` (boolean)
- `min_wage_as_of` (string,null)
- `min_wage_source` (string,null)
- `data_version` (string, required)
- `data_current_as_of` (string, required)
- `currency_note` (string, required)
- `citation_note` (string, required)

[All schemas](index.md) · [bundle root](../index.md)
