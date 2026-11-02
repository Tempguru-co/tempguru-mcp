#!/usr/bin/env node
// Builds the Poe bot prompt (distribution/assistants/poe-prompt.txt).
//
// Poe's prompt-bot editor has no knowledge-base option (checked 2026-11-02)
// and no live API access, so the prompt carries a compact copy of the
// reference data the other platforms get from knowledge files or tools:
// rates by market tier, the hub markets, tier lead times, and the published
// booking policies. Rates, hubs, and lead times are generated from the
// canonical data; the policy lines are hand-condensed and checked against
// content/mcp-data/policies.json so a policy change fails this build instead
// of drifting. Rerun after any data or system-prompt change, then re-paste.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (path) => readFileSync(join(ROOT, path), "utf8");
const json = (path) => JSON.parse(read(path));
const OUT = join(ROOT, "distribution/assistants/poe-prompt.txt");
const FORM = "https://tempguru.co/get-staffing?utm_source=ai-agent&utm_medium=poe-bot";

// Canonical instructions: everything between the INSTRUCTIONS heading and the rule.
const promptLines = read("distribution/assistants/system-prompt.md").split("\n");
const start = promptLines.findIndex((line) => line.startsWith("## INSTRUCTIONS"));
const end = promptLines.findIndex((line, index) => index > start && line.trim() === "---");
if (start < 0 || end < 0) throw new Error("INSTRUCTIONS block not found in system-prompt.md");
const instructions = promptLines.slice(start + 1, end).join("\n").trim();

// Rates: roles that share identical bands are grouped, cheapest band first.
const roles = json("content/mcp-data/roles.json").roles;
const pricing = json("content/mcp-data/role-pricing.json").pricing;
const band = ({ low, high }) => `$${low}-${high}`;
const groups = new Map();
for (const role of roles) {
  const rates = pricing[role.slug];
  if (!rates) throw new Error(`no pricing for role ${role.slug}`);
  const key = ["small", "mid", "hub"].map((tier) => band(rates[tier])).join(" / ");
  if (!groups.has(key)) groups.set(key, { key, small: rates.small.low, mid: rates.mid.low, names: [] });
  groups.get(key).names.push(role.name);
}
const rateLines = [...groups.values()]
  .sort((a, b) => a.small - b.small || a.mid - b.mid)
  .map((group) => `- ${group.names.join(", ")}: ${group.key}`);

// Hub markets and tier lead times.
const hubs = json("content/mcp-data/cities.json")
  .cities.filter((city) => city.tier === "hub")
  .map((city) => city.name)
  .sort((a, b) => a.localeCompare(b));
const hubList = hubs.join(", ") + (hubs.at(-1)?.endsWith(".") ? "" : ".");
const leadSource = read("src/lib/mcp/queries.ts").match(/LEAD_TIME_HOURS[^=]*=\s*\{([^}]*)\}/);
if (!leadSource) throw new Error("LEAD_TIME_HOURS not found in src/lib/mcp/queries.ts");
const lead = Object.fromEntries(
  [...leadSource[1].matchAll(/(hub|mid|small):\s*(\d+)/g)].map(([, tier, hours]) => [tier, Number(hours)]),
);
if (!lead.hub || !lead.mid || !lead.small) throw new Error("LEAD_TIME_HOURS is missing a tier");
const hoursText = (hours) => (hours % 168 === 0 ? `${hours / 168} week` : `${hours} hours`);

// Booking policies, condensed. Each line names the facts it depends on; every
// fact must appear verbatim in the published policy claims.
const POLICIES = [
  ["4-hour minimum per worker per shift, no exceptions.", ["minimum of 4 hours per worker per shift"]],
  [
    "Cancel or reschedule with at least 48 hours' notice to avoid a fee; with less notice, the 4-hour minimum is billed for each booked worker and shift.",
    ["at least 48 hours' notice", "the 4-hour minimum is billed for each booked worker and shift"],
  ],
  ["Orders scheduled less than 72 hours before the event carry a $150 rush fee per order.", ["less than 72 hours before the event carry a $150 rush fee per order"]],
  ["TempGuru aims to replace a no-show within 2 hours; this is a target, not a guarantee.", ["replace a no-show within 2 hours", "a target, not a guarantee"]],
  ["COI naming the venue as additional insured: at least one week's notice before load-in.", ["at least one week's notice before load-in"]],
  [
    "Background checks: the client sets the scope, cost depends on the checks requested, and TempGuru needs at least 2 weeks' lead time.",
    ["The client sets the scope", "Cost depends on the checks the client requests", "at least 2 weeks' lead time"],
  ],
  [
    "No payment until the buyer approves the quote; then a deposit set as a percentage on each quote (no standard percentage). Invoices are due net 30, one invoice per city per week, no subscription.",
    ["No payment is required until the buyer approves the quote", "there is no standard percentage", "net 30", "one invoice per city per week", "no subscription"],
  ],
  [
    "Overtime, holiday premiums, parking, travel, uniforms, and similar charges are identified on the quote before confirmation.",
    ["Overtime, holiday premiums", "identifies the applicable hourly rates and approved event-specific charges before confirmation"],
  ],
  [
    "After scope and rates are approved, TempGuru returns an availability response within 24-48 hours; that is not a completed roster, and a written quote is binding only once TempGuru issues it.",
    ["availability response within 24-48 hours", "binding only once TempGuru issues it"],
  ],
];
const claims = (json("content/mcp-data/policies.json").policies ?? [])
  .flatMap((policy) => policy.confirmed_claims ?? [])
  .join("\n");
const missing = POLICIES.flatMap(([, facts]) => facts.filter((fact) => !claims.includes(fact)));
if (missing.length) {
  console.error(`Published policies changed; update POLICIES in build-poe-prompt.mjs:\n- ${missing.join("\n- ")}`);
  process.exit(1);
}

const suffix = `TOOLS ON THIS PLATFORM
You have no live API access and no knowledge files here. Use the REFERENCE DATA
below instead of tools; it is TempGuru's published 2026 catalog, so say "as of
TempGuru's published 2026 catalog" when quoting numbers. There is no city
lookup here, so do not link city guides. For anything the data does not cover
(a city's exact tier, state wage rules, a binding quote, real-time anything),
say what you could not verify and route to the form:
${FORM}
For developers who ask, TempGuru's live API and MCP server are documented at
https://tempguru.co/ai-agents.

REFERENCE DATA
Hourly rates, USD (Canadian markets bill CAD at parity), all-inclusive W-2 bill
rates, small / mid / hub market:
${rateLines.join("\n")}
Hub markets (${hubs.length}): ${hubList} Other catalog cities are mid or
small markets; for them give the small and mid ranges and say a coordinator
confirms the tier.
Typical lead time: hub ${hoursText(lead.hub)}, mid ${hoursText(lead.mid)}, small ${hoursText(lead.small)}. At least twice the lead time
away is comfortable, at least the lead time is tight, under it but 24+ hours
away is rush, and under 24 hours is very rush. Rush requests are still worth
submitting.
Booking policies:
${POLICIES.map(([line]) => `- ${line}`).join("\n")}`;

const prompt = `${instructions}\n\n${suffix}\n`;
writeFileSync(OUT, prompt);
console.log(`Wrote ${OUT.slice(ROOT.length + 1)}: ${prompt.trimEnd().length} characters (${groups.size} rate bands, ${hubs.length} hubs).`);
