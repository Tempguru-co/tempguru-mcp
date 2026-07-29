// Non-PII persistence and website handoff for complete staffing plans.
//
// The pure planner deliberately remains synchronous. Its MCP handler decorates
// a complete result through this module, which allowlists the exact fields that
// may enter telemetry Redis. Free-text descriptions and all contact fields are
// excluded by construction.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { findCity, findRole } from "./data";
import {
  redisJsonStore,
  type ExpiringJsonStore,
} from "../telemetry/expiring-json-store";
import { normalizeControlledSource } from "../telemetry/source-tags";
import { parseEventStart } from "../dates/parse-event-start";

export const PLAN_TTL_SECONDS = 60 * 60 * 24 * 30;
export const PLAN_ID_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const PLAN_ID_PATTERN = /^[A-HJ-NP-Z2-9]{12}$/;

const PlanLineSchema = z.object({
  role: z.string(),
  role_slug: z.string(),
  headcount: z.number().int(),
  hours_per_shift: z.number(),
  days: z.number().int(),
  hourly_range: z.object({ low: z.number(), high: z.number() }),
  estimated_total_range: z.object({ low: z.number(), high: z.number() }),
});

const TotalSchema = z.object({
  low: z.number(),
  high: z.number(),
  currency: z.enum(["USD", "CAD"]),
  basis: z.string(),
});

const OvertimeTotalSchema = z
  .object({
    low: z.number(),
    high: z.number(),
    currency: z.enum(["USD", "CAD"]),
    includes_double_time: z.boolean().optional(),
    note: z.string(),
  })
  .nullable();

export const PlanSnapshotSchema = z.object({
  city: z.object({
    slug: z.string(),
    name: z.string(),
    state: z.string(),
  }),
  event: z.object({
    event_date: z.string().nullable(),
    event_type: z.string().nullable(),
    attendees: z.number().int().nullable(),
  }),
  plan_lines: z.array(PlanLineSchema),
  estimated_total_range: TotalSchema,
  overtime_adjusted_total_range: OvertimeTotalSchema,
  compliance_jurisdiction: z.string().nullable(),
  created_at: z.string(),
  channel: z.enum(["mcp", "rest"]),
  source: z.string().nullable(),
});

export type PlanSnapshot = z.infer<typeof PlanSnapshotSchema>;

type CompletePlan = {
  status: "plan";
  // buildStaffingPlan infers this as boolean because it is calculated at
  // runtime; callers must guard `=== true` before persistence.
  plan_complete: boolean;
  event: {
    city: string;
    state: string;
    event_type?: string | null;
    event_date?: string | null;
    attendees?: number | null;
  };
  plan_lines: z.infer<typeof PlanLineSchema>[];
  estimated_total_range: z.infer<typeof TotalSchema>;
  overtime_adjusted_total_range: z.infer<typeof OvertimeTotalSchema>;
  compliance?: { jurisdiction: string } | null;
  lead_time?: { event_date: string } | null;
};

export type PlanContinuation = {
  form_url: string;
  note: string;
};

export type PersistedPlanDecoration = {
  plan_id?: string;
  continuation: PlanContinuation;
};

const SAFE_EVENT_TYPES = new Set([
  "trade-show",
  "conference",
  "festival",
  "concert",
  "sporting-event",
  "corporate",
  "brand-activation",
  "other",
]);

/** Reduce a public free-string event type to the documented non-PII catalog. */
export function normalizePlanEventType(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return SAFE_EVENT_TYPES.has(normalized) ? normalized : "other";
}

/** Parse a recognized calendar date, then persist only its canonical ISO day. */
export function normalizePlanEventDate(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const date = parseEventStart(value.trim());
  return date ? date.toISOString().slice(0, 10) : null;
}

export function makePlanId(): string {
  const bytes = randomBytes(12);
  let id = "";
  for (const byte of bytes) id += PLAN_ID_ALPHABET[byte % PLAN_ID_ALPHABET.length];
  return id;
}

export function snapshotFromPlan(
  plan: CompletePlan,
  inputCity: string,
  channel: "mcp" | "rest",
  source?: string,
  createdAt = new Date().toISOString(),
): PlanSnapshot {
  const city = findCity(inputCity);
  if (!city) {
    throw new Error("Cannot snapshot a complete plan with an unresolved city");
  }
  return {
    city: { slug: city.slug, name: city.name, state: city.state },
    event: {
      event_date:
        normalizePlanEventDate(plan.event.event_date) ??
        normalizePlanEventDate(plan.lead_time?.event_date),
      event_type: normalizePlanEventType(plan.event.event_type),
      attendees: plan.event.attendees ?? null,
    },
    plan_lines: plan.plan_lines.map((line) => ({
      role: line.role,
      role_slug: line.role_slug,
      headcount: line.headcount,
      hours_per_shift: line.hours_per_shift,
      days: line.days,
      hourly_range: { ...line.hourly_range },
      estimated_total_range: { ...line.estimated_total_range },
    })),
    estimated_total_range: { ...plan.estimated_total_range },
    overtime_adjusted_total_range: plan.overtime_adjusted_total_range
      ? { ...plan.overtime_adjusted_total_range }
      : null,
    compliance_jurisdiction: plan.compliance?.jurisdiction ?? null,
    created_at: createdAt,
    channel,
    source: normalizeControlledSource(source),
  };
}

function signatureFor(id: string, exp: number, secret: string): string {
  return createHmac("sha256", secret).update(`${id}.${exp}`).digest("hex");
}

export function verifyPlanLinkSignature(
  id: string,
  exp: number,
  signature: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (!PLAN_ID_PATTERN.test(id) || !Number.isSafeInteger(exp) || exp <= nowSeconds) return false;
  if (!/^[a-f0-9]{64}$/i.test(signature) || !secret) return false;
  const expected = Buffer.from(signatureFor(id, exp, secret), "hex");
  const actual = Buffer.from(signature, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function buildPlanContinuation(
  snapshot: PlanSnapshot,
  planId?: string,
  options: { secret?: string; nowSeconds?: number } = {},
): PlanContinuation {
  const url = new URL("https://tempguru.co/get-staffing");
  if (planId) url.searchParams.set("plan", planId);

  const secret = options.secret ?? process.env.PLAN_LINK_SECRET?.trim();
  if (planId && secret) {
    const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
    const createdSeconds = Math.floor(Date.parse(snapshot.created_at) / 1000);
    const storedPlanExpiry = Number.isFinite(createdSeconds)
      ? createdSeconds + PLAN_TTL_SECONDS
      : now + PLAN_TTL_SECONDS;
    // A resumed plan can be close to Redis expiry. Never mint a handoff link
    // that appears valid after the underlying snapshot has been deleted.
    const exp = Math.min(now + PLAN_TTL_SECONDS, storedPlanExpiry);
    if (exp > now) {
      url.searchParams.set("sig", signatureFor(planId, exp, secret));
      url.searchParams.set("exp", String(exp));
    }
  }

  url.searchParams.set("city", snapshot.city.name);
  if (snapshot.event.event_date) url.searchParams.set("dates", snapshot.event.event_date);
  url.searchParams.set(
    "roles",
    snapshot.plan_lines.map((line) => `${line.role_slug}:${line.headcount}`).join(","),
  );
  url.searchParams.set("utm_source", "ai-agent");
  const attributedSource =
    snapshot.source && snapshot.source !== "other" ? snapshot.source : null;
  url.searchParams.set("utm_medium", attributedSource ?? snapshot.channel);
  if (attributedSource) url.searchParams.set("utm_content", snapshot.channel);

  return {
    form_url: url.toString(),
    note: planId
      ? `This non-PII plan is saved for 30 days. Resume it with get_plan using plan_id ${planId}, or continue on the prefilled website form.`
      : "Plan storage was unavailable, so there is no resumable plan_id. The website URL still carries the city, date, and compact role/headcount prefill.",
  };
}

export async function persistCompletePlan(
  plan: CompletePlan,
  inputCity: string,
  channel: "mcp" | "rest",
  source?: string,
  store: ExpiringJsonStore = redisJsonStore,
): Promise<PersistedPlanDecoration> {
  let snapshot: PlanSnapshot;
  try {
    snapshot = snapshotFromPlan(plan, inputCity, channel, source);
  } catch {
    // A complete plan should always have a resolvable city, but retain the
    // documented fail-open behavior if a future planner shape violates that.
    snapshot = {
      city: { slug: "unresolved", name: "Unresolved market", state: "Unresolved" },
      event: {
        event_date:
          normalizePlanEventDate(plan.event.event_date) ??
          normalizePlanEventDate(plan.lead_time?.event_date),
        event_type: normalizePlanEventType(plan.event.event_type),
        attendees: plan.event.attendees ?? null,
      },
      plan_lines: plan.plan_lines,
      estimated_total_range: plan.estimated_total_range,
      overtime_adjusted_total_range: plan.overtime_adjusted_total_range,
      compliance_jurisdiction: plan.compliance?.jurisdiction ?? null,
      created_at: new Date().toISOString(),
      channel,
      source: normalizeControlledSource(source),
    };
  }

  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const id = makePlanId();
      const saved = await store.put(`plan:${id}`, snapshot, PLAN_TTL_SECONDS, {
        ifAbsent: true,
      });
      if (saved === "stored") {
        return { plan_id: id, continuation: buildPlanContinuation(snapshot, id) };
      }
      if (saved === "unavailable") break;
    }
  } catch {
    // Storage is explicitly fail-open; the prefilled non-resumable URL below
    // still preserves the planning details for the website handoff.
  }
  return { continuation: buildPlanContinuation(snapshot) };
}

export async function loadPlanSnapshot(
  planId: string,
  store: ExpiringJsonStore = redisJsonStore,
): Promise<PlanSnapshot | null> {
  const normalized = planId.trim().toUpperCase();
  if (!PLAN_ID_PATTERN.test(normalized)) return null;
  const raw = await store.get<unknown>(`plan:${normalized}`);
  if (!raw) return null;
  const parsedRaw =
    typeof raw === "string"
      ? (() => {
          try {
            return JSON.parse(raw) as unknown;
          } catch {
            return null;
          }
        })()
      : raw;
  const parsed = PlanSnapshotSchema.safeParse(parsedRaw);
  return parsed.success ? parsed.data : null;
}

export type SavedPlanResult =
  | {
      plan_found: true;
      plan_id: string;
      snapshot: PlanSnapshot;
      continuation: PlanContinuation;
      message: string;
      next_steps: string[];
    }
  | {
      plan_found: false;
      plan_id: string;
      message: string;
      next_steps: string[];
    };

/** Shared MCP/REST read behavior for a saved plan reference. */
export async function querySavedPlan(
  planId: string,
  store: ExpiringJsonStore = redisJsonStore,
): Promise<SavedPlanResult> {
  const normalized = planId.trim().toUpperCase();
  const snapshot = await loadPlanSnapshot(normalized, store);
  if (!snapshot) {
    return {
      plan_found: false,
      plan_id: normalized,
      message:
        "That plan was not found or has expired. Saved plans are retained for 30 days; re-run plan_staffing and save the complete plan when needed.",
      next_steps: [
        "Call plan_staffing again with the event city, date, roles, and headcount, then call save_staffing_plan only if no plan_id was returned and persistence is needed.",
        "If a quote was already submitted, use get_quote_status with the TG reference instead.",
      ],
    };
  }
  return {
    plan_found: true,
    plan_id: normalized,
    snapshot,
    continuation: buildPlanContinuation(snapshot, normalized),
    message: "Saved staffing plan restored. Review it with the user before submitting or changing the quote request.",
    next_steps: [
      "Confirm the restored roles, headcount, dates, and planning estimate with the user.",
      "After explicit confirmation, call request_quote and include this plan_id.",
    ],
  };
}

export function rolesMateriallyDiffer(
  submitted: Array<{ role: string; headcount: number }>,
  snapshot: PlanSnapshot,
): boolean {
  const normalize = (role: string) =>
    findRole(role)?.slug ?? role.trim().toLowerCase().replace(/[\s_]+/g, "-");
  const aggregate = (lines: Array<{ role: string; headcount: number }>) => {
    const result = new Map<string, number>();
    for (const line of lines) {
      const role = normalize(line.role);
      result.set(role, (result.get(role) ?? 0) + line.headcount);
    }
    return result;
  };
  const submittedMap = aggregate(submitted);
  const snapshotMap = aggregate(
    snapshot.plan_lines.map((line) => ({ role: line.role_slug, headcount: line.headcount })),
  );
  if (submittedMap.size !== snapshotMap.size) return true;
  for (const [role, planned] of snapshotMap) {
    const actual = submittedMap.get(role);
    if (actual === undefined) return true;
    const delta = Math.abs(actual - planned);
    // A role-set change is always material. For a shared role, flag a change
    // of at least two people or 25%; ignore one-person rounding on larger crews.
    if (delta >= 2 || delta / Math.max(planned, 1) >= 0.25) return true;
  }
  return false;
}
