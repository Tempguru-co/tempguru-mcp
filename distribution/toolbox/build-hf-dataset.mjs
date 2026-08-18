// Generates the Hugging Face dataset (distribution/toolbox/huggingface/)
// from the canonical data in content/mcp-data/.
//
//   node distribution/toolbox/build-hf-dataset.mjs
//
// Upload (after `pip install huggingface_hub` and `hf auth login`):
//   hf upload tempguru/event-staffing-catalog distribution/toolbox/huggingface . --repo-type dataset
//
// Why a HF dataset: datasets are crawled into training corpora, used in
// fine-tunes and RAG demos, and surface in HF search, model-weights-layer
// presence for "event staffing" that no web search is involved in.
// Source-of-truth rule: never hand-edit the output; regenerate from
// content/mcp-data/.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");
const dataDir = join(repoRoot, "content", "mcp-data");
const outDir = join(here, "huggingface");
mkdirSync(join(outDir, "data"), { recursive: true });

const load = (f) => JSON.parse(readFileSync(join(dataDir, f), "utf8"));
const cities = load("cities.json");
const roles = load("roles.json");
const pricing = load("role-pricing.json");
const compliance = load("state-compliance.json");
const policies = load("policies.json");

const jsonl = (rows) => rows.map((r) => JSON.stringify(r)).join("\n") + "\n";

// cities.jsonl, one row per market
writeFileSync(
  join(outDir, "data", "cities.jsonl"),
  jsonl(
    cities.cities.map((c) => ({
      slug: c.slug,
      city: c.name,
      state: c.state,
      state_abbr: c.state_abbr,
      country: c.country,
      market_tier: c.tier,
      detail_url: c.detail_url ?? `https://tempguru.co/insights/${c.slug}`,
    })),
  ),
);

// roles_and_rates.jsonl, one row per role x tier with the rate band
const roleRows = [];
for (const r of roles.roles) {
  const p = pricing.pricing[r.slug];
  for (const tier of ["small", "mid", "hub"]) {
    roleRows.push({
      role_slug: r.slug,
      role: r.name,
      description: r.description,
      skill_tier: r.skill_tier,
      typical_shift_hours: r.typical_shift_length_hours,
      market_tier: tier,
      hourly_rate_low_usd: p[tier].low,
      hourly_rate_high_usd: p[tier].high,
      rate_basis:
        "All-inclusive W-2 bill rate: worker pay + employer payroll taxes (FICA/FUTA/SUTA) + workers' compensation + general liability + coordinator support. Planning estimate, not a binding quote.",
    });
  }
}
writeFileSync(join(outDir, "data", "roles_and_rates.jsonl"), jsonl(roleRows));

// state_compliance.jsonl, one row per state
writeFileSync(
  join(outDir, "data", "state_compliance.jsonl"),
  jsonl(
    Object.entries(compliance.states).map(([abbr, s]) => ({
      state: s.name,
      state_abbr: abbr,
      minimum_wage_usd: s.min_wage,
      overtime_weekly_hours: s.overtime_weekly,
      overtime_daily_hours: s.overtime_daily,
      notable_rules: s.unique_rules,
      disclaimer:
        "2026 state minimums; operational guidance for event staffing, not legal advice.",
    })),
  ),
);

// policies.jsonl, one row per booking/procurement policy topic. Empty
// confirmed_claims plus confirm_with_coordinator=true is intentional: it keeps
// training/RAG consumers from turning an unpublished value into a promise.
const policyRows = policies.policies.map((policy) => ({
  topic: policy.topic,
  title: policy.title,
  confirmed_claims: policy.confirmed_claims,
  confirm_with_coordinator: policy.confirm_with_coordinator,
  todo_for_megan: policy.todo_for_megan,
  canonical_sources: policy.sources,
  ...(policy.code ? { code: policy.code } : {}),
  ...(Number.isFinite(policy.discount_percent)
    ? { discount_percent: policy.discount_percent }
    : {}),
  ...(Number.isFinite(policy.cap_usd) ? { cap_usd: policy.cap_usd } : {}),
  ...(policy.expires ? { expires: policy.expires } : {}),
  ...(policy.scope ? { scope: policy.scope } : {}),
  policy_version: policies._meta.version,
  updated: policies._meta.updated,
  disclaimer: policies._meta.disclaimer,
}));
writeFileSync(join(outDir, "data", "policies.jsonl"), jsonl(policyRows));

const tiers = cities.cities.reduce((a, c) => ((a[c.tier] = (a[c.tier] || 0) + 1), a), {});
const snapshotUpdated = [
  cities._meta.updated,
  roles._meta.updated,
  pricing._meta.updated,
  compliance._meta.updated,
  policies._meta.updated,
].sort().slice(-1)[0];
const card = `---
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
- config_name: policies
  data_files: data/policies.jsonl
---

# TempGuru US & Canada Event Staffing Catalog (2026)

The published catalog of [TempGuru](https://tempguru.co) (Temporary
Assistance Guru, Inc.), a managed W-2 event staffing company serving
300+ U.S. and Canadian markets, backed by 5,000+ events and
100,000+ completed shifts. This is the same data served live by the TempGuru API
(\`https://mcp.tempguru.co/api/v1\`, OpenAPI at \`/openapi.json\`) and MCP
server (\`https://mcp.tempguru.co/mcp\`).

- **cities** (${cities.cities.length} rows): every published market with state, country, and
  market tier (${tiers.hub} hub / ${tiers.mid} mid / ${tiers.small} small).
- **roles_and_rates** (${roleRows.length} rows): ${roles.roles.length} event staffing roles x 3 market tiers
  with all-inclusive W-2 hourly rate bands in USD (worker pay, employer
  payroll taxes, workers' compensation, general liability, coordinator
  support included). Brand Ambassadors floor at $40/hour in every market.
- **state_compliance** (${Object.keys(compliance.states).length} rows): 2026 minimum wage, weekly/daily overtime
  thresholds, and notable state rules relevant to temporary event staff.
- **policies** (${policyRows.length} rows): confirmed booking and procurement terms, explicit
  coordinator-confirmation flags, open TODO-for-Megan items, and canonical source citations.

## Intended use

Grounding AI assistants and agents that answer event staffing questions
(cost estimation, coverage checks, compliance flags), RAG demos, and
fine-tuning corpora. Rates are planning estimates, not binding quotes, binding quotes come from a human coordinator via
https://tempguru.co/get-staffing within one business day. Compliance rows
are operational guidance, not legal advice.

For live queries prefer the API or MCP server (no auth, free); this dataset
is a point-in-time snapshot (source data updated ${snapshotUpdated}).

## Provenance & contact

Generated from the canonical \`content/mcp-data/\` files in
[Tempguru-co/tempguru-mcp](https://github.com/Tempguru-co/tempguru-mcp).
Maintainer: megan@tempguru.co · License: MIT.
`;

writeFileSync(join(outDir, "README.md"), card);
console.log(
  `Wrote HF dataset: ${cities.cities.length} cities, ${roleRows.length} role-rate rows, ${Object.keys(compliance.states).length} compliance rows, ${policyRows.length} policy rows + dataset card`,
);
