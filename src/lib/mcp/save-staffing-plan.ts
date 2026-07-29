// Explicit saved-plan write for the staged planner split.
//
// Phase A leaves plan_staffing's existing autosave behavior in place. This
// helper establishes the future write boundary without trusting a plan payload
// supplied by an agent: callers provide only bounded event inputs, and the
// server recomputes rates, totals, lead time, and compliance before persisting.

import { z } from "zod";
import { checkReadRateLimit, type RateLimitVerdict } from "../api/rate-limit";
import { buildStaffingPlan } from "./plan-staffing";
import {
  PLAN_ID_PATTERN,
  PLAN_TTL_SECONDS,
  buildPlanContinuation,
  persistCompletePlan,
  snapshotFromPlan,
  type PersistedPlanDecoration,
  type PlanContinuation,
} from "./plan-store";

const SAVE_ROLE_INPUT = z.strictObject({
  role: z.string().trim().min(1).max(80).describe("Role name or slug."),
  headcount: z
    .number()
    .int()
    .positive()
    .max(10_000)
    .describe("Staff needed for this role."),
  hours_per_shift: z
    .number()
    .positive()
    .max(24)
    .optional()
    .describe("Hours per shift (default 8, max 24)."),
  days: z
    .number()
    .int()
    .positive()
    .max(365)
    .optional()
    .describe("Number of event days (default 1)."),
});

// Raw shape for the future McpServer.registerTool call. Unlike plan_staffing,
// roles are required: a catalog/needs-roles response is not a savable plan.
// There is intentionally no description or caller-provided pricing/total field.
export const SAVE_STAFFING_PLAN_INPUT = {
  city: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .describe("Event city, name or slug (e.g. Chicago)."),
  event_date: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .optional()
    .describe("Event date, ISO YYYY-MM-DD preferred."),
  event_type: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .optional()
    .describe(
      "trade-show, conference, festival, concert, sporting-event, corporate, brand-activation, or other.",
    ),
  attendees: z
    .number()
    .int()
    .positive()
    .max(5_000_000)
    .optional()
    .describe("Expected attendee count."),
  roles: z
    .array(SAVE_ROLE_INPUT)
    .min(1)
    .max(50)
    .describe("Confirmed roles, headcount, hours, and days to recompute and save."),
};

/** Strict whole-document validator for direct/helper and future REST usage. */
export const SaveStaffingPlanInputSchema = z.strictObject(
  SAVE_STAFFING_PLAN_INPUT,
);

export type SaveStaffingPlanInput = z.infer<
  typeof SaveStaffingPlanInputSchema
>;

type CompletePlan = Parameters<typeof persistCompletePlan>[0];
type PersistPlan = (
  plan: CompletePlan,
  inputCity: string,
  channel: "mcp" | "rest",
  source?: string,
) => Promise<PersistedPlanDecoration>;

export type SaveStaffingPlanContext = {
  channel?: "mcp" | "rest";
  ip?: string;
  source?: string;
};

export type SaveStaffingPlanDependencies = {
  checkRateLimit?: (ip: string) => Promise<RateLimitVerdict>;
  persistPlan?: PersistPlan;
  now?: () => Date;
};

type PlanStatus =
  | "plan"
  | "needs_roles"
  | "roles_not_found"
  | "city_not_found";

export type SaveStaffingPlanResult =
  | {
      status: "saved";
      schema_version: "1.0";
      plan_id: string;
      created_at: string;
      expires_at: string;
      resource_uri: string;
      continuation: PlanContinuation;
      quote_readiness: "needs_contact";
      message: string;
      next_actions: Array<"share" | "revise" | "request_quote">;
    }
  | {
      status: "plan_incomplete";
      plan_status: PlanStatus;
      message: string;
      next_actions: Array<"revise" | "plan_again">;
    }
  | {
      status: "rate_limited";
      retry_after_seconds: number;
      continuation: PlanContinuation;
      message: string;
      next_actions: Array<
        "retry_save" | "continue_on_website" | "request_quote_without_plan_id"
      >;
    }
  | {
      status: "storage_unavailable";
      continuation: PlanContinuation;
      message: string;
      next_actions: Array<
        "retry_save" | "continue_on_website" | "request_quote_without_plan_id"
      >;
    };

const defaultCheckRateLimit = (ip: string) =>
  checkReadRateLimit(ip, "plan");

function validNow(now: () => Date): Date {
  const candidate = now();
  return Number.isFinite(candidate.getTime()) ? candidate : new Date();
}

function incompleteMessage(plan: ReturnType<typeof buildStaffingPlan>): string {
  if ("message" in plan && typeof plan.message === "string") {
    return plan.message;
  }
  if (
    plan.status === "plan" &&
    plan.plan_complete === false &&
    "unpriced_roles" in plan &&
    plan.unpriced_roles
  ) {
    const roles = plan.unpriced_roles.map((role) => role.role).join(", ");
    return `The server-recomputed plan is incomplete; these roles could not be priced: ${roles}.`;
  }
  return "The server-recomputed plan is incomplete and cannot be saved.";
}

function transientContinuation(
  plan: CompletePlan,
  input: SaveStaffingPlanInput,
  channel: "mcp" | "rest",
  source: string | undefined,
  createdAt: string,
): PlanContinuation {
  const snapshot = snapshotFromPlan(
    plan,
    input.city,
    channel,
    source,
    createdAt,
  );
  return buildPlanContinuation(snapshot);
}

/**
 * Recompute and explicitly persist a complete non-PII staffing plan.
 *
 * Input validation intentionally rejects unknown fields at every level, so an
 * agent cannot smuggle in rates, totals, compliance claims, or free-text PII.
 * Expected operational misses are returned as status variants; malformed input
 * remains a Zod validation error for the MCP input boundary to report.
 */
export async function saveStaffingPlan(
  rawInput: unknown,
  context: SaveStaffingPlanContext = {},
  dependencies: SaveStaffingPlanDependencies = {},
): Promise<SaveStaffingPlanResult> {
  const input = SaveStaffingPlanInputSchema.parse(rawInput);
  const plan = buildStaffingPlan(input);

  if (plan.status !== "plan" || plan.plan_complete !== true) {
    return {
      status: "plan_incomplete",
      plan_status: plan.status,
      message: incompleteMessage(plan),
      next_actions: ["revise", "plan_again"],
    };
  }

  const channel = context.channel ?? "mcp";
  const now = validNow(dependencies.now ?? (() => new Date()));
  const createdAt = now.toISOString();
  const fallbackContinuation = transientContinuation(
    plan,
    input,
    channel,
    context.source,
    createdAt,
  );

  // The limiter is fail-open if its dependency is unavailable, matching the
  // existing public write posture. A real denial remains an explicit outcome.
  let verdict: RateLimitVerdict = { allowed: true };
  try {
    verdict = await (dependencies.checkRateLimit ?? defaultCheckRateLimit)(
      context.ip ?? "",
    );
  } catch {
    verdict = { allowed: true };
  }
  if (!verdict.allowed) {
    return {
      status: "rate_limited",
      retry_after_seconds: verdict.retryAfterSeconds,
      continuation: fallbackContinuation,
      message:
        `This plan was recomputed but not saved because this source reached the save limit. Retry after ${verdict.retryAfterSeconds} seconds.`,
      next_actions: [
        "retry_save",
        "continue_on_website",
        "request_quote_without_plan_id",
      ],
    };
  }

  let decoration: PersistedPlanDecoration;
  try {
    decoration = await (dependencies.persistPlan ?? persistCompletePlan)(
      plan,
      input.city,
      channel,
      context.source,
    );
  } catch {
    decoration = { continuation: fallbackContinuation };
  }

  if (
    !decoration.plan_id ||
    !PLAN_ID_PATTERN.test(decoration.plan_id)
  ) {
    return {
      status: "storage_unavailable",
      continuation: decoration.continuation ?? fallbackContinuation,
      message:
        "The plan was recomputed, but resumable storage is unavailable. No plan_id was created; the website continuation still carries the safe event details.",
      next_actions: [
        "retry_save",
        "continue_on_website",
        "request_quote_without_plan_id",
      ],
    };
  }

  return {
    status: "saved",
    schema_version: "1.0",
    plan_id: decoration.plan_id,
    created_at: createdAt,
    // This is deliberately conservative: Redis starts its TTL no earlier than
    // this timestamp, so the advertised expiry can never outlive the record.
    expires_at: new Date(
      now.getTime() + PLAN_TTL_SECONDS * 1000,
    ).toISOString(),
    resource_uri:
      `https://mcp.tempguru.co/api/v1/plans/${decoration.plan_id}`,
    continuation: decoration.continuation,
    quote_readiness: "needs_contact",
    message:
      "The complete non-PII staffing plan is saved for 30 days and can be shared, resumed, or linked to a quote request.",
    next_actions: ["share", "revise", "request_quote"],
  };
}
