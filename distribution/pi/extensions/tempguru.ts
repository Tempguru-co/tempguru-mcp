// TempGuru event staffing tools for the Pi and Prime Agent coding agents.
//
// Both runtimes install skills (Markdown) and extensions (native tools) from
// this package; skills alone cannot call an API, so this extension gives them
// real tools against TempGuru's hosted REST mirror (the same public data as the
// MCP server at https://mcp.tempguru.co/mcp). No auth, no API key.
//
// Attribution is resolved at request time: Prime Agent v0.7.0 sets the exact
// Node process title `prime-agent`; an explicit Prime config-directory marker
// is retained as a fallback. request_quote is a read-only non-PII handoff: it
// restores a saved plan and returns a prefilled form the buyer submits.
//
// Generated from the tempguru-mcp repo (distribution/pi). The full
// plan_staffing planner is MCP-only; these tools cover the granular REST
// surface, and the bundled skills explain the workflow either way.

import { Type } from "typebox";

const BASE = "https://mcp.tempguru.co";
const MAX_TEXT = 48_000; // stay under Pi's ~50KB tool-output budget
const QUOTE_SKILL_IDS = [
  "event-staffing-ordering",
  "event-staffing-compliance",
  "staffing-plan-from-event-brief",
  "urgent-event-backfill",
  "staffing-agency-partner-growth",
  "multi-city-activation-planner",
  "event-staffing-procurement",
  "tempguru-pro-operations",
] as const;
const QUOTE_SKILL_ID_SET = new Set<string>(QUOTE_SKILL_IDS);
const QUOTE_SKILL_VERSION_PATTERN =
  /^[0-9]{1,4}\.[0-9]{1,4}\.[0-9]{1,4}(?:-[0-9A-Za-z.-]{1,24})?(?:\+[0-9A-Za-z.-]{1,24})?$/;

export type TempGuruRuntimeSource = "pi" | "prime-agent";

/** Resolve for every tool request so one shared package attributes each host
 * runtime correctly, including long-lived processes whose environment changes
 * between test/reload cycles. */
export function resolveRuntimeSource(
  env: Record<string, string | undefined> = process.env,
  processTitle: string = process.title,
): TempGuruRuntimeSource {
  const hasPrimeConfigMarker =
    typeof env.PRIME_AGENT_CODING_AGENT_DIR === "string" &&
    env.PRIME_AGENT_CODING_AGENT_DIR.trim().length > 0;
  return processTitle.trim().toLowerCase() === "prime-agent" || hasPrimeConfigMarker
    ? "prime-agent"
    : "pi";
}

async function call(
  method: "GET" | "POST",
  path: string,
  signal: AbortSignal,
  query?: Record<string, string | number | undefined>,
  body?: unknown,
  runtimeSource: TempGuruRuntimeSource = resolveRuntimeSource(),
) {
  const qs = Object.entries(query ?? {})
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  const url = `${BASE}${path}?source=${encodeURIComponent(runtimeSource)}${qs ? `&${qs}` : ""}`;
  const res = await fetch(url, {
    method,
    signal,
    headers: {
      accept: "application/json",
      "x-tempguru-source": runtimeSource,
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

export default function (pi: any) {
  pi.registerTool({
    name: "tempguru_get_cities",
    label: "TempGuru: Cities",
    description:
      "List up to 100 US/CA markets or check one named city directly. Use city, state, or country filters to confirm coverage before planning; list responses are capped to keep tool output complete.",
    parameters: Type.Object({
      city: Type.Optional(Type.String({ description: "Exact city or common alias to check for coverage" })),
      state: Type.Optional(Type.String({ description: "2-letter state/province code, e.g. TX or ON" })),
      country: Type.Optional(Type.String({ description: "US or CA" })),
      tier: Type.Optional(Type.String({ description: "hub | mid | small" })),
      limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, description: "List result limit (default and maximum 100)" })),
    }),
    async execute(_id: string, p: any, signal: AbortSignal) {
      return call("GET", "/api/v1/cities", signal, {
        city: p.city,
        state: p.state,
        country: p.country,
        tier: p.tier,
        limit: p.limit,
      });
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
      date: Type.String({
        format: "date",
        description: "Required event date as YYYY-MM-DD, e.g. 2026-08-14",
      }),
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
    description:
      "Check a TG-XXXXXX reference returned after the buyer personally submits the TempGuru website form, including historical references.",
    parameters: Type.Object({
      reference: Type.String({ description: "e.g. TG-A2B3C4" }),
    }),
    async execute(_id: string, p: any, signal: AbortSignal) {
      return call("GET", `/api/v1/quote-requests/${encodeURIComponent(p.reference)}`, signal);
    },
  });

  pi.registerTool({
    name: "tempguru_request_quote",
    label: "TempGuru: Prepare Quote Form",
    description:
      "Restore a saved non-PII staffing plan and return a prefilled TempGuru form for the buyer to personally review and submit. This tool never accepts or transmits contact details and does not create a lead or TG reference. Requires the plan_id returned by plan_staffing or save_staffing_plan. If storage was unavailable, give the buyer the plan's continuation.form_url directly.",
    parameters: Type.Object({
      plan_id: Type.String({
        minLength: 12,
        maxLength: 12,
        pattern: "^[A-HJ-NP-Z2-9]{12}$",
        description: "Saved non-PII plan reference",
      }),
      skill_id: Type.Optional(Type.Union(
        QUOTE_SKILL_IDS.map((skillId) => Type.Literal(skillId)),
        { description: "Canonical TempGuru skill that assembled this plan" },
      )),
      skill_version: Type.Optional(Type.String({
        maxLength: 40,
        pattern: QUOTE_SKILL_VERSION_PATTERN.source,
        description: "SemVer version of the canonical TempGuru skill, e.g. 1.7.0",
      })),
    }),
    async execute(_id: string, p: any, signal: AbortSignal) {
      const runtimeSource = resolveRuntimeSource();
      const result = await call(
        "GET",
        `/api/v1/plans/${encodeURIComponent(String(p.plan_id).toUpperCase())}`,
        signal,
        undefined,
        undefined,
        runtimeSource,
      );
      const raw = result.content[0]?.text ?? "{}";
      let plan: any;
      try {
        plan = JSON.parse(raw);
      } catch {
        return result;
      }
      if (!plan?.plan_found || !plan?.continuation?.form_url) {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              handoff_ready: false,
              buyer_submission_required: true,
              plan_found: false,
              plan_id: String(p.plan_id).toUpperCase(),
              message: "That saved plan was not found or has expired. Re-run the staffing plan.",
            }, null, 2),
          }],
          details: result.details,
        };
      }
      const formUrl = new URL(plan.continuation.form_url);
      const continuationMedium = formUrl.searchParams.get("utm_medium");
      formUrl.searchParams.set("utm_campaign", "quote-handoff");
      formUrl.searchParams.set("source_platform", runtimeSource);
      formUrl.searchParams.set("utm_medium", runtimeSource);
      if (
        !formUrl.searchParams.has("utm_content") &&
        (continuationMedium === "mcp" || continuationMedium === "rest")
      ) {
        formUrl.searchParams.set("utm_content", continuationMedium);
      }
      const skillId =
        typeof p.skill_id === "string" && QUOTE_SKILL_ID_SET.has(p.skill_id)
          ? p.skill_id
          : undefined;
      const skillVersion =
        typeof p.skill_version === "string" &&
        QUOTE_SKILL_VERSION_PATTERN.test(p.skill_version)
          ? p.skill_version
          : undefined;
      if (skillId) formUrl.searchParams.set("skill_id", skillId);
      if (skillId && skillVersion) {
        formUrl.searchParams.set("skill_version", skillVersion);
      }
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            handoff_ready: true,
            buyer_submission_required: true,
            plan_found: true,
            plan_id: String(p.plan_id).toUpperCase(),
            form_url: formUrl.toString(),
            message:
              "Give the buyer this prefilled TempGuru form. The buyer enters and submits their own contact details.",
          }, null, 2),
        }],
        details: result.details,
      };
    },
  });
}
