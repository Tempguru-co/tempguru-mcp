import { A2A_INTERFACE, MARKET_CATALOG_DESCRIPTION } from "../public-facts";

export function buildAgentCard(version: string) {
  return {
    name: "TempGuru Event Staffing",
    description:
      "A deterministic A2A adapter for TempGuru's public event-staffing planner and catalog. " +
      MARKET_CATALOG_DESCRIPTION +
      " Text messages return invocation help; application/json data parts execute the advertised planning and lookup skills.",
    supportedInterfaces: [
      {
        url: A2A_INTERFACE.url,
        protocolBinding: A2A_INTERFACE.protocolBinding,
        protocolVersion: A2A_INTERFACE.protocolVersion,
      },
    ],
    provider: {
      organization: "Temporary Assistance Guru, Inc.",
      url: "https://tempguru.co",
    },
    version,
    documentationUrl: "https://tempguru.co/ai-agents",
    capabilities: {
      streaming: false,
      pushNotifications: false,
      extendedAgentCard: false,
    },
    defaultInputModes: ["text/plain", "application/json"],
    defaultOutputModes: ["text/plain", "application/json"],
    skills: [
      {
        id: "event-staffing-plan",
        name: "Event Staffing Plan",
        description:
          "Build a non-binding event-staffing plan from structured city, date, role, headcount, shift, and event inputs. Returns a configured-market match, W-2 rate math, tier-based lead-time guidance, compliance flags, and a buyer-operated continuation URL. It never confirms order coverage, reserves staff, or submits contact details.",
        tags: ["event-staffing", "staffing-plan", "w2", "pricing", "availability"],
        examples: [
          "{\"skillId\":\"event-staffing-plan\",\"input\":{\"city\":\"Austin\",\"event_date\":\"2026-10-15\",\"roles\":[{\"role\":\"brand-ambassadors\",\"headcount\":4}]}}",
        ],
        inputModes: ["application/json"],
        outputModes: ["application/json", "text/plain"],
      },
      {
        id: "event-staffing-lookup",
        name: "Event Staffing Catalog Lookup",
        description:
          "Query TempGuru's repository-backed market catalog, roles, city-specific rate estimates, lead-time guidance, state compliance data, or published procurement policies. The data part must include skillId, action, and an action-specific input object.",
        tags: ["event-staffing", "market-catalog", "roles", "rates", "compliance", "policies"],
        examples: [
          "{\"skillId\":\"event-staffing-lookup\",\"action\":\"catalog\",\"input\":{\"city\":\"Chicago\"}}",
          "{\"skillId\":\"event-staffing-lookup\",\"action\":\"pricing\",\"input\":{\"city\":\"Miami\",\"role\":\"registration-staff\"}}",
        ],
        inputModes: ["application/json"],
        outputModes: ["application/json", "text/plain"],
      },
    ],
    iconUrl: "https://mcp.tempguru.co/logo.svg",
  } as const;
}
