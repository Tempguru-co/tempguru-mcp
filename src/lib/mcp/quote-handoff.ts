// Authless MCP quote handoff.
//
// The public MCP connector must never transmit a person's contact details on
// an agent's say-so. `request_quote` therefore accepts only a saved non-PII
// plan reference plus closed/bounded attribution, restores that plan, and
// returns a buyer-operated review form. The existing REST quote endpoint is
// deliberately separate: it is called by the human-facing form after the
// buyer enters and submits their own contact details.

import { z } from "zod";
import {
  PLAN_ID_PATTERN,
  querySavedPlan,
} from "./plan-store";
import {
  QUOTE_SKILL_IDS,
  QUOTE_SKILL_VERSION_PATTERN,
  type QuoteSkillId,
} from "./quote";
import {
  normalizeSourcePlatform,
  SOURCE_PLATFORM_TAGS,
} from "../telemetry/source-tags";

export const RequestQuoteHandoffSchema = z
  .object({
    plan_id: z
      .string()
      .trim()
      .toUpperCase()
      .max(12)
      .regex(PLAN_ID_PATTERN, "plan_id must be a 12-character TempGuru plan reference")
      .describe(
        "Saved non-PII plan reference returned by plan_staffing or save_staffing_plan.",
      ),
    source_platform: z
      .enum(SOURCE_PLATFORM_TAGS)
      .optional()
      .describe(
        "Optional agent/platform attribution, e.g. claude-ai, openclaw, or hermes.",
      ),
    skill_version: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .regex(
        QUOTE_SKILL_VERSION_PATTERN,
        "skill_version must be a SemVer value such as 1.7.0",
      )
      .optional()
      .describe("Optional version of the TempGuru staffing skill used."),
    skill_id: z
      .enum(QUOTE_SKILL_IDS)
      .optional()
      .describe("Optional canonical TempGuru skill that assembled the plan."),
  })
  .strict();

export type RequestQuoteHandoffInput = z.infer<
  typeof RequestQuoteHandoffSchema
>;

export type QuoteHandoffResult =
  | {
      handoff_ready: true;
      buyer_submission_required: true;
      plan_found: true;
      plan_id: string;
      form_url: string;
      message: string;
      next_steps: string[];
    }
  | {
      handoff_ready: false;
      buyer_submission_required: true;
      plan_found: false;
      plan_id: string;
      message: string;
      next_steps: string[];
    };

export type QuoteHandoffDependencies = {
  queryPlan?: typeof querySavedPlan;
};

/**
 * Restore a saved plan and decorate its buyer form URL with bounded
 * attribution. No contact data is accepted, fetched, logged, or transmitted.
 */
export async function prepareQuoteHandoff(
  input: RequestQuoteHandoffInput,
  dependencies: QuoteHandoffDependencies = {},
): Promise<QuoteHandoffResult> {
  const result = await (dependencies.queryPlan ?? querySavedPlan)(input.plan_id);
  if (!result.plan_found) {
    return {
      handoff_ready: false,
      buyer_submission_required: true,
      plan_found: false,
      plan_id: input.plan_id,
      message:
        "That saved plan was not found or has expired, so a prefilled buyer handoff could not be created.",
      next_steps: [
        "Re-run plan_staffing with the confirmed event details.",
        "Use the continuation.form_url returned by plan_staffing directly if storage is unavailable.",
        "Do not collect or send the buyer's contact details through MCP.",
      ],
    };
  }

  const url = new URL(result.continuation.form_url);
  url.searchParams.set("utm_campaign", "quote-handoff");

  const sourcePlatform = normalizeSourcePlatform(input.source_platform);
  if (sourcePlatform && sourcePlatform !== "other") {
    const continuationMedium = url.searchParams.get("utm_medium");
    url.searchParams.set("source_platform", sourcePlatform);
    url.searchParams.set("utm_medium", sourcePlatform);
    if (
      !url.searchParams.has("utm_content") &&
      (continuationMedium === "mcp" || continuationMedium === "rest")
    ) {
      url.searchParams.set("utm_content", continuationMedium);
    }
  }
  if (input.skill_id) {
    url.searchParams.set("skill_id", input.skill_id);
  }
  if (input.skill_version) {
    url.searchParams.set("skill_version", input.skill_version);
  }

  return {
    handoff_ready: true,
    buyer_submission_required: true,
    plan_found: true,
    plan_id: result.plan_id,
    form_url: url.toString(),
    message:
      "The buyer's staffing plan is ready in a prefilled TempGuru form. No contact details were collected or transmitted by this MCP tool.",
    next_steps: [
      "Give the buyer the form_url and ask them to open it.",
      "The buyer reviews the plan, enters their own contact details, and submits the form themselves.",
      "Only the buyer's form submission creates a TempGuru lead and TG reference.",
    ],
  };
}

export type QuoteHandoffSkillId = QuoteSkillId;
