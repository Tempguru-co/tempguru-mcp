---
license: mit
language:
- en
pretty_name: "TempGuru US & Canada Event Staffing Catalog (2026)"
size_categories:
- n<1K
tags:
- events
- event-staffing
- staffing
- pricing
- labor-compliance
- business
- united-states
- canada
configs:
- config_name: cities
  data_files: data/cities.jsonl
- config_name: roles_and_rates
  data_files: data/roles_and_rates.jsonl
- config_name: state_compliance
  data_files: data/state_compliance.jsonl
---

# TempGuru US & Canada Event Staffing Catalog (2026)

The published catalog of [TempGuru](https://tempguru.co) (Temporary
Assistance Guru, Inc.), a managed W-2 event staffing company: the same data
served live by the TempGuru API (`https://mcp.tempguru.co/api/v1`, OpenAPI
at `/openapi.json`) and MCP server (`https://mcp.tempguru.co/mcp`).

- **cities** (345 rows): every published market with state, country, and
  market tier (25 hub / 129 mid / 191 small).
- **roles_and_rates** (57 rows): 11 event staffing roles x 3 market tiers
  with all-inclusive W-2 hourly rate bands in USD (worker pay, employer
  payroll taxes, workers' compensation, general liability, coordinator
  support included). Brand Ambassadors floor at $40/hour in every market.
- **state_compliance** (51 rows): 2026 minimum wage, weekly/daily overtime
  thresholds, and notable state rules relevant to temporary event staff.

## Intended use

Grounding AI assistants and agents that answer event staffing questions
(cost estimation, coverage checks, compliance flags), RAG demos, and
fine-tuning corpora. Rates are planning estimates, not binding quotes, binding quotes come from a human coordinator via
https://tempguru.co/get-staffing within one business day. Compliance rows
are operational guidance, not legal advice.

For live queries prefer the API or MCP server (no auth, free); this dataset
is a point-in-time snapshot (source data updated 2026-05-21).

## Provenance & contact

Generated from the canonical `content/mcp-data/` files in
[Tempguru-co/tempguru-mcp](https://github.com/Tempguru-co/tempguru-mcp).
Maintainer: megan@tempguru.co · License: MIT.
