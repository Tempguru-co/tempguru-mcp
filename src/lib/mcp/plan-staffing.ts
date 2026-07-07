// plan_staffing, the planner meta-tool (Stripe's implementation_planner pattern).
//
// Agents are told to call this FIRST: it takes a rough event shape and returns a
// complete, structured staffing plan, coverage, per-role budget math, lead-time
// read, and the state compliance flags that change the plan, plus the exact next
// tool to call. It composes the same query layer the individual tools wrap, so a
// plan is always consistent with what get_role_pricing / check_availability /
// get_compliance_by_state would return one call at a time.
//
// Read-only. Returns variant shapes discriminated by `status`
// (plan | needs_roles | roles_not_found | city_not_found); the tool declares
// PLAN_STAFFING_OUTPUT so clients still get structuredContent.

import {
  queryRoles,
  queryAvailability,
  queryRolePricing,
  queryStateCompliance,
  isAvailabilityCityNotFound,
  isAvailabilityDateInvalid,
  type RolePricingData,
  type EntitySuggestion,
} from "./queries";
import { findCity, suggestCity, suggestRole } from "./data";

export type PlanRoleInput = {
  role: string;
  headcount: number;
  hours_per_shift?: number;
  days?: number;
};

export type PlanStaffingInput = {
  city: string;
  event_date?: string;
  event_type?: string;
  attendees?: number;
  roles?: PlanRoleInput[];
  description?: string;
};

// Neutral, factual fallback. Deliberately no cross-platform (ChatGPT GPT)
// steering in tool output; platform-specific fallbacks live in the docs/skills.
const FALLBACK_LADDER = [
  "If the user confirms this plan, call request_quote with their contact details (name, email, company) plus the event and roles below.",
  "If request_quote is unavailable or fails, direct the user to https://tempguru.co/get-staffing, megan@tempguru.co, or (904) 206-8953.",
];

function isPricing(d: unknown): d is RolePricingData {
  return !!d && typeof d === "object" && "hourly_range_low" in (d as Record<string, unknown>);
}

export function buildStaffingPlan(input: PlanStaffingInput) {
  // No roles yet: return the catalog so the agent can come back with a real mix.
  if (!input.roles || input.roles.length === 0) {
    const roles = queryRoles();
    return {
      status: "needs_roles" as const,
      message:
        "No roles specified. Pick roles and headcount from the catalog below, then call plan_staffing again with a roles array, e.g. [{role: 'brand-ambassadors', headcount: 4}].",
      available_roles: roles.ok ? roles.data : null,
      tip:
        input.attendees && input.attendees > 0
          ? `For ~${input.attendees} attendees, organizers commonly plan 1 staffer per 50-75 guests for registration/guest services, plus role-specific needs (booth coverage, crowd control).`
          : "Common starting mix for a booth or conference presence: brand ambassadors or registration staff, plus a team lead at 20 or more staff per shift.",
    };
  }

  // Resolve the city up front and independently of the roles. This is the fix
  // for the flagship bug: previously cityMeta was only ever set from a
  // successful priced role line, so a valid city with unmatched role phrasing
  // (e.g. "brand ambassador" singular in Chicago) reported status:city_not_found
  // and told the agent the city wasn't covered. City resolution and role
  // resolution are now separate, with distinct statuses.
  const city = findCity(input.city);
  if (!city) {
    const sug = suggestCity(input.city);
    return {
      status: "city_not_found" as const,
      requested_city: input.city,
      suggestion: sug
        ? ({ kind: "city", slug: sug.slug, name: sug.name } as EntitySuggestion)
        : undefined,
      message: sug
        ? `TempGuru has no exact match for "${input.city}" among its 345 US/CA markets. The closest covered market is ${sug.name}, confirm with the user that they mean ${sug.name} before planning it (do not assume), or check get_cities.`
        : `TempGuru has no match for "${input.city}" among its 345 US/CA markets (US and Canada only). Check spelling, ask the user for the nearest major city, or confirm coverage with get_cities.`,
      next_steps: FALLBACK_LADDER,
    };
  }
  const cityMeta = {
    city: city.name,
    state: city.state,
    tier: city.tier as string,
    currency: city.country === "CA" ? ("CAD" as const) : ("USD" as const),
  };

  // Price each resolved role line; collect unresolved role phrasings with a
  // did-you-mean so the agent can retry without re-listing the whole catalog.
  const lines = [];
  const unresolved: Array<{ role: string; suggestion?: EntitySuggestion }> = [];

  for (const r of input.roles) {
    const hours = r.hours_per_shift && r.hours_per_shift > 0 ? r.hours_per_shift : 8;
    const days = r.days && r.days > 0 ? r.days : 1;
    const priced = queryRolePricing({ role: r.role, city: input.city });
    if (!priced.ok || !isPricing(priced.data)) {
      const sr = suggestRole(r.role);
      unresolved.push({
        role: r.role,
        suggestion: sr ? { kind: "role", slug: sr.slug, name: sr.name } : undefined,
      });
      continue;
    }
    const d = priced.data;
    const workerHours = r.headcount * hours * days;
    lines.push({
      role: d.role,
      role_slug: d.role_slug,
      headcount: r.headcount,
      hours_per_shift: hours,
      days,
      hourly_range: { low: d.hourly_range_low, high: d.hourly_range_high },
      estimated_total_range: {
        low: workerHours * d.hourly_range_low,
        high: workerHours * d.hourly_range_high,
      },
    });
  }

  // City is valid but NOT ONE role resolved. Distinct from city_not_found:
  // report coverage + the catalog + per-role suggestions so the agent recovers.
  if (lines.length === 0) {
    const roles = queryRoles();
    return {
      status: "roles_not_found" as const,
      event: { city: cityMeta.city, state: cityMeta.state, market_tier: cityMeta.tier },
      requested_roles: input.roles.map((r) => r.role),
      unresolved_roles: unresolved,
      available_roles: roles.ok ? roles.data : null,
      message: `${cityMeta.city} is covered, but none of the requested roles matched TempGuru's catalog. Pick roles from the list below (or use each unresolved role's suggestion) and call plan_staffing again.`,
      next_steps: FALLBACK_LADDER,
    };
  }

  const totals = lines.reduce(
    (acc, l) => ({
      low: acc.low + l.estimated_total_range.low,
      high: acc.high + l.estimated_total_range.high,
    }),
    { low: 0, high: 0 },
  );

  // Operational default: a team lead is standard at 20+ staff on a shift.
  const biggestShift = Math.max(...lines.map((l) => l.headcount));
  const hasLead = lines.some((l) => /team.?lead/i.test(l.role_slug));
  const staffingNotes: string[] = [];
  if (biggestShift >= 20 && !hasLead) {
    staffingNotes.push(
      "A team lead is TempGuru's standard at 20 or more staff per shift, add one team-leads line to the plan.",
    );
  }
  if (unresolved.length > 0) {
    const parts = unresolved.map((u) =>
      u.suggestion ? `${u.role} (did you mean ${u.suggestion.name}?)` : u.role,
    );
    staffingNotes.push(
      `Roles not matched to the catalog (check get_roles for exact names): ${parts.join(", ")}.`,
    );
  }

  // Lead-time read, when a date was given.
  let leadTime = null;
  if (input.event_date) {
    const avail = queryAvailability({ date: input.event_date, city: input.city });
    if (avail.ok && !isAvailabilityCityNotFound(avail.data) && !isAvailabilityDateInvalid(avail.data)) {
      leadTime = {
        event_date: avail.data.event_date,
        days_until_event: avail.data.days_until_event,
        recommendation: avail.data.recommendation,
        note: "Lead-time guidance, not a reservation. Even rush windows are worth submitting.",
      };
    }
  }

  // The compliance flags that actually change an event plan.
  let compliance = null;
  let overtime: {
    low: number;
    high: number;
    currency: "USD" | "CAD";
    note: string;
  } | null = null;
  const comp = queryStateCompliance({ state: cityMeta.state });
  if (comp.ok && "state_abbr" in comp.data) {
    compliance = {
      state: comp.data.state,
      min_wage_usd: comp.data.min_wage_usd,
      overtime_weekly_hours: comp.data.overtime_threshold_weekly_hours,
      overtime_daily_hours: comp.data.overtime_threshold_daily_hours,
      unique_rules: comp.data.unique_rules,
      note: "All TempGuru placements are W-2 with workers comp and general liability included. General information, not legal advice.",
    };
    const dailyThreshold = comp.data.overtime_threshold_daily_hours; // null in most states
    const weeklyThreshold = comp.data.overtime_threshold_weekly_hours; // usually 40

    // Compute an overtime-ADJUSTED total. Straight-time (estimated_total_range)
    // understates the eventual quote wherever daily or weekly OT applies, which
    // is exactly the states plan_staffing flags. Per worker, take the GREATER of
    // daily and weekly OT hours (CA-style, so the two don't double-count), bill
    // OT hours at 1.5x. If no line triggers OT, overtime stays null.
    let otLow = 0;
    let otHigh = 0;
    let triggered = false;
    for (const l of lines) {
      const perWorkerHours = l.hours_per_shift * l.days;
      const dailyOtPerWorker = dailyThreshold
        ? l.days * Math.max(0, l.hours_per_shift - dailyThreshold)
        : 0;
      // Weekly OT applies PER WORKWEEK, not across the whole engagement, so a
      // 14-day run is two 40h weeks, not one 112h week. Assume consecutive days
      // (the model has no calendar): full 7-day weeks plus a remainder.
      const fullWeeks = Math.floor(l.days / 7);
      const remDays = l.days % 7;
      const weeklyOtPerWorker =
        fullWeeks * Math.max(0, 7 * l.hours_per_shift - weeklyThreshold) +
        Math.max(0, remDays * l.hours_per_shift - weeklyThreshold);
      const otHoursPerWorker = Math.max(dailyOtPerWorker, weeklyOtPerWorker);
      if (otHoursPerWorker > 0) triggered = true;
      const regularHoursPerWorker = perWorkerHours - otHoursPerWorker;
      const regWorker = l.headcount * regularHoursPerWorker;
      const otWorker = l.headcount * otHoursPerWorker;
      otLow += regWorker * l.hourly_range.low + otWorker * l.hourly_range.low * 1.5;
      otHigh += regWorker * l.hourly_range.high + otWorker * l.hourly_range.high * 1.5;
    }
    if (triggered) {
      overtime = {
        low: Math.round(otLow),
        high: Math.round(otHigh),
        currency: cityMeta.currency,
        note: `${comp.data.state} overtime applies to this schedule (daily > ${dailyThreshold ?? "n/a"}h or weekly > ${weeklyThreshold}h). This range bills the overtime hours at 1.5x; the straight-time range above does not.`,
      };
      const daily = comp.data.overtime_threshold_daily_hours;
      const perDay = Math.max(...lines.map((l) => l.hours_per_shift));
      if (daily && perDay > daily) {
        staffingNotes.push(
          `${comp.data.state} has daily overtime at ${daily}h, shifts of ${perDay}h will accrue OT. See overtime_adjusted_total_range or split shifts.`,
        );
      } else {
        staffingNotes.push(
          `This multi-day schedule crosses ${comp.data.state}'s ${weeklyThreshold}h weekly overtime threshold per worker. See overtime_adjusted_total_range or add staff to shorten shifts.`,
        );
      }
    }
  }

  return {
    status: "plan" as const,
    event: {
      city: cityMeta.city,
      state: cityMeta.state,
      market_tier: cityMeta.tier,
      event_type: input.event_type ?? null,
      event_date: input.event_date ?? null,
      attendees: input.attendees ?? null,
      description: input.description ?? null,
    },
    plan_lines: lines,
    estimated_total_range: {
      ...totals,
      currency: cityMeta.currency,
      basis: "All-inclusive W-2 bill rates: worker pay, payroll taxes, workers comp, general liability, coordinator support. Straight-time planning estimate, not a binding quote.",
    },
    overtime_adjusted_total_range: overtime,
    lead_time: leadTime,
    compliance,
    staffing_notes: staffingNotes,
    next_steps: [
      "Present this plan to the user: roles, headcount, the estimated total range (label it a planning estimate), the lead-time read, and any staffing notes.",
      ...FALLBACK_LADDER,
      "A human coordinator replies with a binding quote within one business day. No payment until the user approves the quote.",
    ],
  };
}
