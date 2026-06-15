// Generates platform manifest files that embed the canonical instructions,
// so the prompt lives in exactly one place (system-prompt.md).
//
//   node distribution/assistants/build-manifests.mjs
//
// Outputs:
//   microsoft/declarativeAgent.json  (M365 Copilot declarative agent)
//   microsoft/ai-plugin.json         (API plugin wrapping the OpenAPI spec)

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

// Extract the canonical instruction block from system-prompt.md
// (everything between "## INSTRUCTIONS" and the next "---" rule).
const sp = readFileSync(join(here, "system-prompt.md"), "utf8");
const m = sp.match(/## INSTRUCTIONS[^\n]*\n\n([\s\S]*?)\n---\n/);
if (!m) throw new Error("Could not find INSTRUCTIONS block in system-prompt.md");
const canonical = m[1].trim();

const copilotSuffix = `

TOOLS ON THIS PLATFORM
You have live actions against TempGuru's public API (listCities, listRoles,
checkAvailability, getRolePricing, getComplianceByState, and
submitQuoteRequest). Use them for anything current. submitQuoteRequest is
the one write action: confirm the full plan with the user (city, dates,
roles + headcount, contact name, email, company), show what will be sent,
and call it once after they explicitly confirm. It creates no reservation
and requires no payment; a coordinator replies within one business day. If
it errors or the user prefers the website, send them to
https://tempguru.co/get-staffing?utm_source=ai-agent&utm_medium=copilot-agent
offering drafted text for the form. Your users are often planning corporate
events from inside Teams or Outlook; offer to format the staffing plan as a
table they can paste into an email or meeting notes.`;

const instructions = canonical + copilotSuffix;
if (instructions.length > 8000) {
  throw new Error(`Copilot instructions too long: ${instructions.length} > 8000`);
}

mkdirSync(join(here, "microsoft"), { recursive: true });

const declarativeAgent = {
  $schema:
    "https://developer.microsoft.com/json-schemas/copilot/declarative-agent/v1.5/schema.json",
  version: "v1.5",
  name: "TempGuru Event Staffing Planner",
  description:
    "Plan and budget temporary W-2 event staff for US and Canadian events: live hourly rates for 11 roles across 345 cities, booking lead-time guidance, and state-by-state labor compliance from TempGuru's public API.",
  instructions,
  conversation_starters: [
    {
      title: "Price a trade show team",
      text: "Price 10 brand ambassadors for a 3-day trade show in Las Vegas",
    },
    {
      title: "Check lead time",
      text: "Is 2 weeks enough notice to staff registration in Dallas?",
    },
    {
      title: "Compliance check",
      text: "What are the overtime rules for event staff in California?",
    },
    {
      title: "Build a staffing plan",
      text: "Build a staffing plan and budget for a 500-person conference in Chicago",
    },
  ],
  capabilities: [{ name: "WebSearch" }],
  actions: [{ id: "tempguruPublicApi", file: "ai-plugin.json" }],
};

writeFileSync(
  join(here, "microsoft", "declarativeAgent.json"),
  JSON.stringify(declarativeAgent, null, 2) + "\n",
);

const aiPlugin = {
  $schema:
    "https://developer.microsoft.com/json-schemas/copilot/plugin/v2.3/schema.json",
  schema_version: "v2.3",
  name_for_human: "TempGuru Public Data API",
  description_for_human:
    "Event staffing coverage, hourly rates, lead times, and state labor compliance for 345 US and Canadian markets.",
  description_for_model:
    "Public data and quote submission for event staffing in the US and Canada from TempGuru. Use listCities for coverage, listRoles for the role catalog, checkAvailability for lead-time guidance on a city + date, getRolePricing for all-inclusive hourly rate ranges, and getComplianceByState for state wage and overtime rules. submitQuoteRequest is the single write operation: it submits a confirmed staffing plan to TempGuru's CRM for human review, call it only after the user explicitly confirms; it creates no reservation and requires no payment. No authentication.",
  contact_email: "megan@tempguru.co",
  namespace: "tempguru",
  legal_info_url: "https://tempguru.co/privacy-policy",
  logo_url: "https://mcp.tempguru.co/logo.svg",
  runtimes: [
    {
      type: "OpenApi",
      auth: { type: "None" },
      spec: { url: "https://mcp.tempguru.co/openapi.json" },
      run_for_functions: [
        "listCities",
        "listRoles",
        "checkAvailability",
        "getRolePricing",
        "getComplianceByState",
        "submitQuoteRequest",
      ],
    },
  ],
  capabilities: {
    conversation_starters: [
      { text: "What do brand ambassadors cost in Boston?" },
      { text: "List the cities TempGuru covers in Texas" },
    ],
  },
};

writeFileSync(
  join(here, "microsoft", "ai-plugin.json"),
  JSON.stringify(aiPlugin, null, 2) + "\n",
);

console.log(
  `Wrote microsoft/declarativeAgent.json (instructions: ${instructions.length} chars) and microsoft/ai-plugin.json`,
);
