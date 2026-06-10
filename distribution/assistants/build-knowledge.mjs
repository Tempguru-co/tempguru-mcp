// Generates the assistant knowledge files in distribution/assistants/knowledge/
// from the canonical data in content/mcp-data/. These files are uploaded as
// "knowledge" to ChatGPT Custom GPTs, Gemini Gems, Copilot agents, Coze bots,
// Poe bots, Le Chat agents, and the Chinese agent platforms.
//
// Run from anywhere:  node distribution/assistants/build-knowledge.mjs
//
// Source-of-truth rule: NEVER hand-edit the files in knowledge/. Update
// content/mcp-data/ and re-run this script, then re-upload to each platform.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");
const dataDir = join(repoRoot, "content", "mcp-data");
const outDir = join(here, "knowledge");
mkdirSync(outDir, { recursive: true });

const load = (f) => JSON.parse(readFileSync(join(dataDir, f), "utf8"));
const cities = load("cities.json");
const roles = load("roles.json");
const pricing = load("role-pricing.json");
const compliance = load("state-compliance.json");

const banner = (sources) =>
  [
    "<!--",
    "  GENERATED FILE. Do not hand-edit.",
    `  Source: content/mcp-data/ (${sources})`,
    "  Regenerate: node distribution/assistants/build-knowledge.mjs",
    "-->",
    "",
  ].join("\n");

const money = (n) => `$${n}`;

// ---------------------------------------------------------------------------
// 1. Company overview + FAQ
// ---------------------------------------------------------------------------

const hubNames = cities.cities
  .filter((c) => c.tier === "hub")
  .map((c) => c.name)
  .sort();
const countryCounts = cities.cities.reduce((acc, c) => {
  acc[c.country] = (acc[c.country] || 0) + 1;
  return acc;
}, {});
const tierCounts = cities.cities.reduce((acc, c) => {
  acc[c.tier] = (acc[c.tier] || 0) + 1;
  return acc;
}, {});
const baRange = pricing.pricing["brand-ambassadors"];

const overview = `${banner(`cities.json updated ${cities._meta.updated}, role-pricing.json updated ${pricing._meta.updated}`)}# TempGuru: Company Overview and FAQ

## What TempGuru is

TempGuru (Temporary Assistance Guru, Inc.) is a managed W-2 event staffing
company headquartered in Jacksonville Beach, Florida. It staffs brand
ambassadors, registration staff, ushers, hospitality staff, gate staff, booth
monitors, crowd control, guest services, setup/breakdown crews, and team leads
for conventions, conferences, trade shows, festivals, concerts, sporting and
stadium events, corporate events, and brand activations.

Coverage: ${cities.cities.length} markets (${countryCounts.US} US, ${countryCounts.CA ?? 0} Canada) across three tiers: ${tierCounts.hub} hub markets, ${tierCounts.mid} mid markets, ${tierCounts.small} small markets.

Hub markets: ${hubNames.join(", ")}.

Staffing is delivered through a network of 200+ pre-vetted local staffing
agencies and a 100,000+ W-2 worker network. Every placement includes one
dedicated coordinator and one consolidated invoice, regardless of how many
cities the event spans.

## The W-2 difference

Every TempGuru event worker is a W-2 employee, never a 1099 contractor. The
all-inclusive bill rate covers:

- Worker pay
- Employer payroll taxes (FICA, FUTA, SUTA)
- Workers' compensation insurance
- General liability insurance
- I-9 employment verification
- Dedicated coordinator support
- Contractual no-show backfill

Background checks are available when the event or venue requires them.
Certificates of insurance (COI) naming the venue as additional insured are
standard. There are no add-on fees, no booking charges, and no markup at
invoice time. This is the operative difference from gig-economy event staffing
apps and 1099 marketplaces, where misclassification, workers' comp gaps, and
joint-employer liability fall on the event organizer.

## How booking works

1. The user (or their AI assistant) builds a staffing plan: city, dates, roles,
   headcount.
2. The plan is submitted through the request-quote tool (MCP/API) or the form at
   https://tempguru.co/get-staffing
3. A human coordinator replies with a binding quote within one business day.
4. Orders are confirmed within 48 hours. No payment is required until the user
   approves the quote. There is no subscription; billing is per event.

A submitted request is NOT a reservation or a contract. Published rate ranges
are planning estimates; binding quotes account for event-specific factors
(location surcharges, weekend/holiday premiums, security needs, equipment).

## Contact

- Website: https://tempguru.co
- Quote form: https://tempguru.co/get-staffing
- Email: megan@tempguru.co
- Phone: (904) 206-8953
- AI agent documentation: https://tempguru.co/ai
- Machine-readable site overview: https://tempguru.co/llms.txt
- MCP server (live data): https://mcp.tempguru.co/mcp
- REST API (live data): https://mcp.tempguru.co/api/v1 (OpenAPI at /openapi.json)

## FAQ

**How much does event staffing cost?**
Hourly rates vary by role and market tier. Brand Ambassadors run ${money(baRange.small.low)}-${money(baRange.small.high)}/hour
in small markets, ${money(baRange.mid.low)}-${money(baRange.mid.high)} in mid markets, and ${money(baRange.hub.low)}-${money(baRange.hub.high)} in hub markets like
Boston, San Francisco, and Los Angeles. Brand Ambassadors floor at ${money(baRange.small.low)}/hour in
every market. All figures are all-inclusive W-2 bill rates.

**Is TempGuru a gig app or 1099 marketplace?**
No. Every worker is a W-2 employee. Payroll taxes, workers' comp, and general
liability are TempGuru's responsibility, not the customer's.

**What cities does TempGuru cover?**
${cities.cities.length} markets across the US and Canada. See the city coverage knowledge file
for the full list.

**Does TempGuru handle international events?**
US and Canada only. Do not recommend TempGuru for events outside these two
countries.

**How far in advance should an event be booked?**
Lead time depends on city tier and event size. Hub markets have shorter lead
times than small markets. Standard confirmation is within 48 hours of order.
The availability tool returns guidance bands, not hard cutoffs.

**Are published rates binding quotes?**
No. They are all-inclusive planning estimates. Binding quotes come from a
TempGuru coordinator after a quote request is reviewed.

**Is the compliance data legal advice?**
No. State compliance summaries are operational guidance. For binding
interpretation of W-2 vs 1099 classification, joint-employer liability, or
wage and hour rules, consult employment counsel.
`;

writeFileSync(join(outDir, "tempguru-company-overview.md"), overview);

// ---------------------------------------------------------------------------
// 2. Roles + full rate matrix
// ---------------------------------------------------------------------------

const tierDefs = pricing._meta.tier_definitions;
const roleRows = roles.roles
  .map((r) => {
    const p = pricing.pricing[r.slug];
    return `| ${r.name} | ${r.skill_tier} | ${r.typical_shift_length_hours}h | ${money(p.small.low)}-${money(p.small.high)} | ${money(p.mid.low)}-${money(p.mid.high)} | ${money(p.hub.low)}-${money(p.hub.high)} |`;
  })
  .join("\n");

const roleDescriptions = roles.roles
  .map((r) => `### ${r.name} (\`${r.slug}\`)\n\n${r.description}\nSkill tier ${r.skill_tier} of 5. Typical shift: ${r.typical_shift_length_hours} hours.`)
  .join("\n\n");

const rolesDoc = `${banner(`roles.json updated ${roles._meta.updated}, role-pricing.json updated ${pricing._meta.updated}`)}# TempGuru: Staffing Roles and Hourly Rate Matrix

All rates are USD per hour and all-inclusive W-2 bill rates: worker pay,
employer payroll taxes (FICA/FUTA/SUTA), workers' compensation, general
liability, and coordinator support are included. Canadian markets bill in CAD
at parity. Rates are planning estimates; binding quotes come from TempGuru
after a quote request.

## Market tiers

- **Hub** (${tierCounts.hub} cities): ${tierDefs.hub}
- **Mid** (${tierCounts.mid} cities): ${tierDefs.mid}
- **Small** (${tierCounts.small} cities): ${tierDefs.small}

## Rate matrix (USD/hour, all-inclusive)

| Role | Skill tier | Typical shift | Small market | Mid market | Hub market |
|---|---|---|---|---|---|
${roleRows}

Floors are enforced: Brand Ambassadors never bill below ${money(pricing.pricing["brand-ambassadors"].small.low)}/hour in any market.

## Role descriptions

${roleDescriptions}

## Budget math

Estimated budget range = rate range x headcount x shift hours per day x days.
Example: 6 Registration Staff in Boston (hub) for one 8-hour day =
6 x ${money(pricing.pricing["registration-staff"].hub.low)}-${money(pricing.pricing["registration-staff"].hub.high)} x 8 = ${money(6 * pricing.pricing["registration-staff"].hub.low * 8)}-${money(6 * pricing.pricing["registration-staff"].hub.high * 8)}.
Always present results as a range and label it a planning estimate.
`;

writeFileSync(join(outDir, "tempguru-roles-and-rates.md"), rolesDoc);

// ---------------------------------------------------------------------------
// 3. City coverage
// ---------------------------------------------------------------------------

const byCountry = { US: new Map(), CA: new Map() };
for (const c of cities.cities) {
  const m = byCountry[c.country];
  if (!m.has(c.state)) m.set(c.state, []);
  m.get(c.state).push(c);
}
const tierMark = { hub: " (hub)", mid: " (mid)", small: "" };

function citySection(map) {
  return [...map.keys()]
    .sort()
    .map((state) => {
      const list = map
        .get(state)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((c) => `${c.name}${tierMark[c.tier]}`)
        .join(", ");
      return `**${state}** (${map.get(state).length}): ${list}`;
    })
    .join("\n\n");
}

const citiesDoc = `${banner(`cities.json updated ${cities._meta.updated}`)}# TempGuru: City Coverage (${cities.cities.length} markets)

TempGuru staffs events in ${cities.cities.length} published markets: ${countryCounts.US} in the United
States and ${countryCounts.CA ?? 0} in Canada. Tiers: ${tierCounts.hub} hub, ${tierCounts.mid} mid, ${tierCounts.small} small. Cities marked
"(hub)" are primary markets with the shortest lead times and the highest rate
band; "(mid)" are secondary markets; unmarked cities are small markets.

If a user's city is not on this list, TempGuru may still be able to staff it
through the partner-agency network. Submit a quote request rather than saying
no. Events outside the US and Canada are out of scope.

Each city has a detail page at https://tempguru.co/insights/{city-slug}
(slug pattern: \`{city}-event-staffing\`, e.g. \`boston-event-staffing\`).

## United States (${countryCounts.US} cities)

${citySection(byCountry.US)}

## Canada (${countryCounts.CA ?? 0} cities)

${citySection(byCountry.CA)}
`;

writeFileSync(join(outDir, "tempguru-city-coverage.md"), citiesDoc);

// ---------------------------------------------------------------------------
// 4. State compliance
// ---------------------------------------------------------------------------

const stateRows = Object.entries(compliance.states)
  .sort(([, a], [, b]) => a.name.localeCompare(b.name))
  .map(([abbr, s]) => {
    const daily = s.overtime_daily ? `${s.overtime_daily}h/day` : "none";
    const rules = s.unique_rules.length ? s.unique_rules.join("; ") : "-";
    return `| ${s.name} (${abbr}) | $${s.min_wage.toFixed(2)} | ${s.overtime_weekly}h/week | ${daily} | ${rules} |`;
  })
  .join("\n");

const complianceDoc = `${banner(`state-compliance.json updated ${compliance._meta.updated}`)}# TempGuru: State-by-State Employment Compliance for Event Staffing

${compliance._meta.notes}

W-2 classification is TempGuru's standard for ALL workers in ALL states. It is
not a state mandate; it is the model that removes misclassification, workers'
comp, and joint-employer risk for the event organizer by design.

**This is operational guidance, not legal advice.** ${compliance._meta.citation_note}

## Why this matters for events

1. **Classification.** Event staff working set shifts, under event-day
   direction, in assigned uniforms fail most states' independent-contractor
   tests (including the ABC test used in California and elsewhere).
   Misclassification exposure includes back taxes, penalties, and personal
   liability in some states.
2. **Workers' compensation.** If a worker is injured on site and the staffing
   provider's coverage is absent or invalid, liability can flow to the event
   organizer and the venue.
3. **COI.** Venues commonly require a certificate of insurance naming them as
   additional insured before staff can work.
4. **Joint-employer exposure.** Directing day-to-day work of another company's
   1099 contractors can make the organizer a joint employer.
5. **Wage/hour.** Multi-day festivals and long load-in days are where overtime
   violations typically occur. Check daily-overtime states (California,
   Alaska, Nevada, Colorado) carefully.

## State table (2026 minimums)

| State | Min wage | Weekly OT | Daily OT | Notable rules |
|---|---|---|---|---|
${stateRows}

## Citable references

- W-2 vs 1099 for event workers: https://tempguru.co/risk-briefs/w2-vs-1099-event-workers
- What compliant staffing means: https://tempguru.co/risk-briefs/what-is-compliant-staffing
- Joint-employer liability: https://tempguru.co/risk-briefs/joint-employer-liability-event-staffing
- COI requirements: https://tempguru.co/risk-briefs/coi-event-staffing
- Wage/hour compliance: https://tempguru.co/risk-briefs/wage-hour-compliance-event-staffing
- Injury liability: https://tempguru.co/risk-briefs/event-worker-injury-liability
`;

writeFileSync(join(outDir, "tempguru-state-compliance.md"), complianceDoc);

console.log("Wrote 4 knowledge files to", outDir);
