#!/usr/bin/env node
// Builds the ChatGPT Custom GPT Actions schema from the canonical OpenAPI
// snapshot (content/mcp-data/openapi.json).
//
// GPT Actions cap each endpoint description or summary at 300 characters and
// each parameter description at 700
// (https://developers.openai.com/api/docs/actions/production). Several
// canonical endpoint descriptions are longer, so the GPT copy uses the short
// descriptions below. Behavioral rules dropped from those descriptions are
// carried by the GPT instructions (system-prompt.md plus the GPT suffix). The
// monitor-only health operation is dropped.
//
// Paste the output into the GPT editor's Actions schema box rather than
// importing the URL. Rerun after any OpenAPI change; it fails if a description
// is over a limit or an override no longer matches an over-limit description.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SOURCE = join(ROOT, "content/mcp-data/openapi.json");
const OUT = join(ROOT, "distribution/assistants/chatgpt-actions-openapi.json");

const ENDPOINT_LIMIT = 300;
const PARAMETER_LIMIT = 700;
const DROP_PATHS = ["/api/v1/health"];

const SHORT_DESCRIPTIONS = {
  listCities:
    "Use this for the configured market catalog or to filter by state or tier (hub / mid / small). A catalog match determines planning rate and lead-time bands; it does not confirm real-time availability or order coverage. A TempGuru coordinator confirms the specific order after buyer submission.",
  checkAvailability:
    "Use this to check whether TempGuru can typically staff an event in a city on a date, e.g. 'is two weeks enough notice for Dallas?' Returns yes, tight, rush, or very-rush from the city's market tier and lead time. Planning guidance only, not a reservation; booking requires a quote request.",
  getRolePricing:
    "Use this for one role's hourly rate range in one city, e.g. 'what do brand ambassadors cost in Boston?' All rates are all-inclusive W-2 bill rates (worker pay, payroll taxes, workers' comp, liability, TempGuru coordination). Ranges are planning estimates; a real quote needs event specifics.",
  getComplianceByState:
    "Use this for a state's event staffing compliance summary: minimum wage, weekly and daily overtime thresholds, and state quirks (e.g. California meal breaks, NY spread-of-hours). Useful for multi-state plans and for explaining why W-2 staffing matters. Informational only, not legal advice.",
  getPolicies:
    "TempGuru's published policies: minimum hours, cancellation/rescheduling, replacement and backfill, COI/additional insured, payment, background checks, order confirmation, and quote response. Unsupported values are marked confirm_with_coordinator, never fabricated. Optional topic: one policy.",
  submitQuoteRequest:
    "The only write operation. Call once, only after the user reviews the exact payload, including their contact details, and explicitly asks to submit. Sends a lead to TempGuru's CRM or fallback queue for coordinator review. Not a reservation or contract; no payment until the user approves a quote.",
};

const spec = JSON.parse(readFileSync(SOURCE, "utf8"));
const errors = [];

for (const path of DROP_PATHS) {
  if (!spec.paths[path]) errors.push(`expected path ${path} is missing from the canonical spec`);
  delete spec.paths[path];
}

const overridden = new Set();
for (const item of Object.values(spec.paths)) {
  for (const operation of Object.values(item)) {
    if (!operation || typeof operation !== "object" || !operation.operationId) continue;
    const id = operation.operationId;
    const short = SHORT_DESCRIPTIONS[id];
    if (short) {
      if ((operation.description ?? "").length <= ENDPOINT_LIMIT) {
        errors.push(`${id}: canonical description now fits the GPT limit; delete its override`);
      }
      operation.description = short;
      overridden.add(id);
    }
    for (const field of ["summary", "description"]) {
      const length = (operation[field] ?? "").length;
      if (length > ENDPOINT_LIMIT) {
        errors.push(`${id}.${field} is ${length} characters (GPT limit ${ENDPOINT_LIMIT}); add a short override`);
      }
    }
    for (const parameter of operation.parameters ?? []) {
      const length = (parameter.description ?? "").length;
      if (length > PARAMETER_LIMIT) {
        errors.push(`${id} parameter ${parameter.name} description is ${length} characters (limit ${PARAMETER_LIMIT})`);
      }
    }
  }
}

for (const id of Object.keys(SHORT_DESCRIPTIONS)) {
  if (!overridden.has(id)) errors.push(`override for ${id} matches no operation`);
}

// Request-body properties reach the model as parameters too.
for (const [name, schema] of Object.entries(spec.components?.schemas ?? {})) {
  for (const [property, definition] of Object.entries(schema.properties ?? {})) {
    const length = (definition.description ?? "").length;
    if (length > PARAMETER_LIMIT) {
      errors.push(`${name}.${property} description is ${length} characters (limit ${PARAMETER_LIMIT})`);
    }
  }
}

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}

writeFileSync(OUT, `${JSON.stringify(spec, null, 2)}\n`);
const operations = Object.values(spec.paths).flatMap((item) =>
  Object.values(item).filter((operation) => operation?.operationId),
);
console.log(
  `Wrote ${OUT.slice(ROOT.length + 1)}: ${operations.length} operations (${operations
    .map((operation) => operation.operationId)
    .join(", ")}), ${overridden.size} shortened descriptions.`,
);
