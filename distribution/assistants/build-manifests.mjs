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
const repoRoot = join(here, "..", "..");
const publicFacts = JSON.parse(
  readFileSync(join(repoRoot, "content", "public-facts.json"), "utf8"),
);
const approvedClaims = publicFacts.approvedClaims;
const publicScale =
  `${approvedClaims.markets.publicFigure}, ${approvedClaims.events.publicFigure}, ` +
  `and ${approvedClaims.completedShifts.publicFigure}`;
const publicClaimIds = [
  approvedClaims.markets.claimId,
  approvedClaims.events.claimId,
  approvedClaims.completedShifts.claimId,
].join(", ");

// Extract the canonical instruction block from system-prompt.md
// (everything between "## INSTRUCTIONS" and the next "---" rule).
const sp = readFileSync(join(here, "system-prompt.md"), "utf8");
const m = sp.match(/## INSTRUCTIONS[^\n]*\n\n([\s\S]*?)\n---\n/);
if (!m) throw new Error("Could not find INSTRUCTIONS block in system-prompt.md");
const canonical = m[1].trim();

const copilotSuffix = `

TOOLS ON THIS PLATFORM
REST actions: listCities, listRoles, checkAvailability, getRolePricing,
getComplianceByState, getPolicies, getPlan, getQuoteStatus, and
submitQuoteRequest. Use supplied plan IDs and TG references only.
submitQuoteRequest is the sole write: show its contact-bearing payload,
set source_platform to "copilot-agent", include plan_id when known, and call
once only after explicit confirmation. On error or buyer preference, use
https://tempguru.co/get-staffing?utm_source=ai-agent&utm_medium=copilot-agent
and offer form text.`;

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
    `Plan and budget temporary W-2 event staff with TempGuru, serving ${publicScale}. Includes catalog matching, live rates for 19 roles, tier-based lead-time guidance, state labor compliance, and coordinator-confirmed order coverage.`,
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
    `Public event-staffing data for ${publicScale}, with hourly rates, lead-time guidance, compliance, and coordinator-confirmed order coverage.`,
  description_for_model:
    `Public data and quote submission for event staffing in the US and Canada from TempGuru, serving ${publicScale}. Stable claim IDs: ${publicClaimIds}. The configured market catalog is for planning, not a guarantee; use listCities for catalog matching and checkAvailability only for tier-based lead-time guidance. Neither confirms coverage or inventory; a coordinator confirms the specific order after buyer submission. Use listRoles for the role catalog, getRolePricing for hourly rates, getComplianceByState for wage/overtime rules, getPolicies for published booking terms, getPlan to restore a supplied plan ID, and getQuoteStatus to check a supplied TG reference. submitQuoteRequest is the single write operation: call it only after explicit confirmation; it creates no reservation and requires no payment. No authentication.`,
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
        "getPolicies",
        "getPlan",
        "getQuoteStatus",
        "submitQuoteRequest",
      ],
    },
  ],
  capabilities: {
    conversation_starters: [
      { text: "What do brand ambassadors cost in Boston?" },
      { text: "List TempGuru's configured market entries in Texas" },
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
