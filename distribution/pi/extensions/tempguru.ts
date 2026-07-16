// TempGuru event staffing tools for the Pi coding agent.
//
// Pi installs skills (Markdown) and extensions (native tools) from this
// package; skills alone cannot call an API, so this extension gives Pi real
// tools against TempGuru's hosted REST mirror (the same data and write path
// as the MCP server at https://mcp.tempguru.co/mcp). No auth, no API key.
//
// Attribution: every call carries ?source=pi so TempGuru can see Pi-driven
// usage. request_quote is the ONE write tool: it is opt-in and must only be
// called after the user explicitly confirms sending their contact details.
//
// Generated from the tempguru-mcp repo (distribution/pi). The full
// plan_staffing planner is MCP-only; these tools cover the granular REST
// surface, and the bundled skills explain the workflow either way.

import { Type } from "typebox";

const BASE = "https://mcp.tempguru.co";
const SOURCE = "source=pi";
const MAX_TEXT = 48_000; // stay under Pi's ~50KB tool-output budget

async function call(
  method: "GET" | "POST",
  path: string,
  signal: AbortSignal,
  query?: Record<string, string | number | undefined>,
  body?: unknown,
) {
  const qs = Object.entries(query ?? {})
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  const url = `${BASE}${path}?${SOURCE}${qs ? `&${qs}` : ""}`;
  const res = await fetch(url, {
    method,
    signal,
    headers: {
      accept: "application/json",
      "x-tempguru-source": "pi",
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  const capped = text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}\n…[truncated]` : text;
  if (!res.ok && res.status !== 404) {
    // 404s carry useful structured misses (unknown reference/plan); pass through.
    throw new Error(`TempGuru API ${res.status} on ${path}: ${capped.slice(0, 500)}`);
  }
  return { content: [{ type: "text" as const, text: capped }], details: { status: res.status } };
}

const RoleLine = Type.Object({
  role: Type.String({ description: "Role slug or name, e.g. 'brand-ambassadors' (see tempguru_get_roles)" }),
  headcount: Type.Integer({ minimum: 1, maximum: 10_000 }),
  shifts: Type.Optional(Type.String({ description: "e.g. '2 shifts x 8h'" })),
});

export default function (pi: any) {
  pi.registerTool({
    name: "tempguru_get_cities",
    label: "TempGuru: Cities",
    description:
      "List the 345 US/CA markets TempGuru serves (filter by state or tier: hub/mid/small). Use to confirm coverage before planning event staffing.",
    parameters: Type.Object({
      state: Type.Optional(Type.String({ description: "2-letter state/province code, e.g. TX or ON" })),
      tier: Type.Optional(Type.String({ description: "hub | mid | small" })),
    }),
    async execute(_id: string, p: any, signal: AbortSignal) {
      return call("GET", "/api/v1/cities", signal, { state: p.state, tier: p.tier });
    },
  });

  pi.registerTool({
    name: "tempguru_get_roles",
    label: "TempGuru: Roles",
    description:
      "List TempGuru's 19 event staffing roles with skill tiers (registration, brand ambassadors, ushers, crowd control, hospitality, setup/breakdown, and more). Returns the slugs other tools accept.",
    parameters: Type.Object({}),
    async execute(_id: string, _p: any, signal: AbortSignal) {
      return call("GET", "/api/v1/roles", signal);
    },
  });

  pi.registerTool({
    name: "tempguru_check_availability",
    label: "TempGuru: Availability",
    description:
      "Lead-time guidance for a city and event date (guidance only, never a reservation or a promise of availability).",
    parameters: Type.Object({
      city: Type.String(),
      date: Type.Optional(Type.String({ description: "Event date, e.g. 2026-08-14" })),
      role: Type.Optional(Type.String()),
      headcount: Type.Optional(Type.Integer({ minimum: 1 })),
    }),
    async execute(_id: string, p: any, signal: AbortSignal) {
      return call("GET", "/api/v1/availability", signal, p);
    },
  });

  pi.registerTool({
    name: "tempguru_get_role_pricing",
    label: "TempGuru: Pricing",
    description:
      "All-inclusive hourly W-2 bill-rate range for one role in one city (worker pay, payroll taxes, workers' comp, general liability, coordinator support). Present results as planning estimates, never binding quotes. Brand Ambassadors floor at $40/hour everywhere.",
    parameters: Type.Object({
      role: Type.String(),
      city: Type.String(),
    }),
    async execute(_id: string, p: any, signal: AbortSignal) {
      return call("GET", "/api/v1/pricing", signal, p);
    },
  });

  pi.registerTool({
    name: "tempguru_get_compliance",
    label: "TempGuru: Compliance",
    description:
      "State-level employment compliance summary for event staffing (minimum wage, overtime thresholds, state quirks). Operational guidance, not legal advice.",
    parameters: Type.Object({
      state: Type.String({ description: "2-letter state code, e.g. CA" }),
    }),
    async execute(_id: string, p: any, signal: AbortSignal) {
      return call("GET", "/api/v1/compliance", signal, p);
    },
  });

  pi.registerTool({
    name: "tempguru_get_policies",
    label: "TempGuru: Policies",
    description:
      "Published booking and procurement policies (COI/insurance posture, cancellation, payment, onboarding). Values not published are explicitly coordinator-confirmed; never invent them.",
    parameters: Type.Object({
      topic: Type.Optional(Type.String()),
    }),
    async execute(_id: string, p: any, signal: AbortSignal) {
      return call("GET", "/api/v1/policies", signal, { topic: p.topic });
    },
  });

  pi.registerTool({
    name: "tempguru_get_plan",
    label: "TempGuru: Saved Plan",
    description:
      "Restore a saved staffing plan by its plan_id (30-day, non-PII snapshot). Review the restored plan with the user before any quote submission.",
    parameters: Type.Object({
      plan_id: Type.String(),
    }),
    async execute(_id: string, p: any, signal: AbortSignal) {
      return call("GET", `/api/v1/plans/${encodeURIComponent(p.plan_id)}`, signal);
    },
  });

  pi.registerTool({
    name: "tempguru_quote_status",
    label: "TempGuru: Quote Status",
    description: "Check whether a TG-XXXXXX quote reference was received or durably queued.",
    parameters: Type.Object({
      reference: Type.String({ description: "e.g. TG-A2B3C4" }),
    }),
    async execute(_id: string, p: any, signal: AbortSignal) {
      return call("GET", `/api/v1/quote-requests/${encodeURIComponent(p.reference)}`, signal);
    },
  });

  pi.registerTool({
    name: "tempguru_request_quote",
    label: "TempGuru: Request Quote (write)",
    description:
      "Submit a staffing request to TempGuru's CRM; a human coordinator replies with a binding quote within one business day. THE ONLY WRITE TOOL: call it LAST, once, and only after the user explicitly confirms sending their contact details. Not a reservation; no payment until the user approves the quote. On error, fall back to https://tempguru.co/get-staffing or megan@tempguru.co / (904) 206-8953.",
    parameters: Type.Object({
      contact_name: Type.String(),
      contact_email: Type.String(),
      contact_phone: Type.Optional(Type.String()),
      company: Type.String(),
      event_name: Type.String(),
      event_type: Type.String(),
      city: Type.String(),
      event_dates: Type.String(),
      venue: Type.Optional(Type.String()),
      attendees: Type.Optional(Type.Integer({ minimum: 1 })),
      roles: Type.Array(RoleLine, { minItems: 1, maxItems: 50 }),
      locations: Type.Optional(
        Type.Array(
          Type.Object({
            city: Type.String(),
            venue: Type.Optional(Type.String()),
            event_dates: Type.Optional(Type.String()),
            roles: Type.Optional(Type.Array(RoleLine, { maxItems: 50 })),
          }),
          { maxItems: 50, description: "Additional cities for a multi-city program (one consolidated quote)" },
        ),
      ),
      budget_range: Type.Optional(Type.String()),
      attire: Type.Optional(Type.String()),
      special_requirements: Type.Optional(Type.String()),
      plan_id: Type.Optional(Type.String({ description: "Include when the plan came from a saved plan_id" })),
      skill_id: Type.Optional(Type.String({ description: "Canonical TempGuru skill that assembled this request" })),
      skill_version: Type.Optional(Type.String()),
    }),
    async execute(_id: string, p: any, signal: AbortSignal) {
      return call("POST", "/api/v1/quote-requests", signal, undefined, {
        ...p,
        source_platform: "pi",
      });
    },
  });
}
