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
// PLAN_STAFFING_OUTPUT so clients still get structuredContent. A plan with any
// unresolved role line carries plan_complete:false plus the unpriced lines, so
// a partial total can never silently read as the full budget.

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
import {
  findCity,
  findProvince,
  suggestCity,
  suggestRole,
  isSecurityPhrase,
  SECURITY_ROLE_NOTE,
} from "./data";

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

// ─── Overtime engine ─────────────────────────────────────────────────────────
//
// Jurisdiction OT rules: daily 1.5x threshold, optional daily 2x threshold
// (CA >12h, BC >12h), weekly 1.5x threshold, optional seventh-consecutive-day
// premium (CA: first 8h at 1.5x, beyond 8h at 2x). The schedule model assumes
// CONSECUTIVE days (plan_staffing has no calendar), split into 7-day workweeks.
type OtRules = {
  daily: number | null;
  weekly: number;
  dailyDouble: number | null;
  seventhDay: boolean;
};

type OtHours = { ot15: number; ot2: number };

// OT hours for ONE worker across ONE workweek segment of `daysInWeek`
// consecutive days at `h` hours/day. Daily and weekly schemes are computed
// separately and the scheme with the larger premium wins (approximates
// non-pyramiding: the same hour is never billed under both rules).
function weekOtHours(daysInWeek: number, h: number, rules: OtRules): OtHours {
  let d15 = 0;
  let d2 = 0;
  for (let d = 1; d <= daysInWeek; d++) {
    const isSeventh = rules.seventhDay && daysInWeek === 7 && d === 7;
    if (isSeventh) {
      // CA seventh consecutive day: first 8h at 1.5x, beyond 8h at 2x.
      d15 += Math.min(h, 8);
      d2 += Math.max(h - 8, 0);
    } else if (rules.daily) {
      const doubleAt = rules.dailyDouble ?? Infinity;
      d15 += Math.min(Math.max(h - rules.daily, 0), doubleAt - rules.daily);
      d2 += rules.dailyDouble ? Math.max(h - rules.dailyDouble, 0) : 0;
    }
  }
  const w15 = Math.max(daysInWeek * h - rules.weekly, 0);
  const dailyPremium = d15 * 0.5 + d2 * 1.0;
  const weeklyPremium = w15 * 0.5;
  return dailyPremium >= weeklyPremium ? { ot15: d15, ot2: d2 } : { ot15: w15, ot2: 0 };
}

// Per-worker OT hours across the whole engagement: OT is computed PER WORKWEEK
// and summed (a 14-day run is two 40h weeks, not one 112h week; the day-8
// remainder of an 8-day run still earns its daily OT).
function engagementOtHours(days: number, h: number, rules: OtRules): OtHours {
  const fullWeeks = Math.floor(days / 7);
  const remDays = days % 7;
  const full = fullWeeks > 0 ? weekOtHours(7, h, rules) : { ot15: 0, ot2: 0 };
  const rem = remDays > 0 ? weekOtHours(remDays, h, rules) : { ot15: 0, ot2: 0 };
  return {
    ot15: full.ot15 * fullWeeks + rem.ot15,
    ot2: full.ot2 * fullWeeks + rem.ot2,
  };
}

export function buildStaffingPlan(input: PlanStaffingInput) {
  // Resolve the city FIRST, independent of roles, so an uncovered/misspelled
  // city is reported as city_not_found even on a roles-free catalog call, and
  // a valid city with unmatched role phrasing never reads as "not covered".
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

  // No roles yet: return the catalog so the agent can come back with a real mix.
  if (!input.roles || input.roles.length === 0) {
    const roles = queryRoles();
    return {
      status: "needs_roles" as const,
      event: { city: cityMeta.city, state: cityMeta.state, market_tier: cityMeta.tier },
      message:
        `${cityMeta.city} is covered (${cityMeta.tier}-tier market). No roles specified. Pick roles and headcount from the catalog below, then call plan_staffing again with a roles array, e.g. [{role: 'brand-ambassadors', headcount: 4}].`,
      available_roles: roles.ok ? roles.data : null,
      tip:
        input.attendees && input.attendees > 0
          ? `For ~${input.attendees} attendees, organizers commonly plan 1 staffer per 50-75 guests for registration/guest services, plus role-specific needs (booth coverage, crowd control).`
          : "Common starting mix for a booth or conference presence: brand ambassadors or registration staff, plus a team lead at 20 or more staff per shift.",
    };
  }

  // Price each resolved role line; collect unresolved role phrasings WITH their
  // requested headcount/hours/days retained, so an unpriced line is never
  // silently dropped from the plan's economics.
  const lines = [];
  const unresolved: Array<{
    role: string;
    headcount: number;
    hours_per_shift: number;
    days: number;
    suggestion?: EntitySuggestion;
  }> = [];

  for (const r of input.roles) {
    const hours = r.hours_per_shift && r.hours_per_shift > 0 ? r.hours_per_shift : 8;
    const days = r.days && r.days > 0 ? r.days : 1;
    const priced = queryRolePricing({ role: r.role, city: input.city });
    if (!priced.ok || !isPricing(priced.data)) {
      const sr = suggestRole(r.role);
      unresolved.push({
        role: r.role,
        headcount: r.headcount,
        hours_per_shift: hours,
        days,
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

  const planComplete = unresolved.length === 0;

  const totals = lines.reduce(
    (acc, l) => ({
      low: acc.low + l.estimated_total_range.low,
      high: acc.high + l.estimated_total_range.high,
    }),
    { low: 0, high: 0 },
  );

  const staffingNotes: string[] = [];
  if (!planComplete) {
    const parts = unresolved.map((u) =>
      u.suggestion ? `${u.role} × ${u.headcount} (did you mean ${u.suggestion.name}?)` : `${u.role} × ${u.headcount}`,
    );
    staffingNotes.push(
      `INCOMPLETE PLAN: ${unresolved.length} requested role(s) could not be priced and are EXCLUDED from every total below: ${parts.join(", ")}. Resolve them (see unpriced_roles / get_roles) and call plan_staffing again before presenting a budget or submitting a quote.`,
    );
  }

  // Operational default: a team lead is standard at 20+ staff on a shift.
  // Trigger on TOTAL requested staff (including unpriced lines): 10+10 across
  // two roles is still a 20-person crew.
  const totalStaff = input.roles.reduce((n, r) => n + r.headcount, 0);
  const hasLead = lines.some((l) => /team.?lead/i.test(l.role_slug));
  if (totalStaff >= 20 && !hasLead) {
    staffingNotes.push(
      "A team lead is TempGuru's standard at 20 or more staff per shift, add one team-leads line to the plan.",
    );
  }

  // "Security" resolved to Crowd Control: never leave that substitution silent.
  if (input.roles.some((r) => isSecurityPhrase(r.role))) {
    staffingNotes.push(SECURITY_ROLE_NOTE);
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
        note:
          avail.data.days_until_event < 0
            ? "This date is in the PAST — confirm the intended date with the user before planning or quoting."
            : "Lead-time guidance, not a reservation. Even rush windows are worth submitting.",
      };
    }
  }

  // The compliance flags that actually change an event plan. US states come
  // from the compliance dataset; Canadian markets use provincial employment
  // standards (OT thresholds; wage floors confirmed by the coordinator).
  let compliance: {
    jurisdiction: string;
    min_wage_usd: number | null;
    overtime_weekly_hours: number | null;
    overtime_daily_hours: number | null;
    unique_rules: string[];
    note: string;
  } | null = null;
  let otRules: OtRules | null = null;

  if (city.country === "CA") {
    const prov = findProvince(city.state_abbr);
    if (prov) {
      compliance = {
        jurisdiction: prov.name,
        min_wage_usd: null,
        overtime_weekly_hours: prov.overtime_weekly,
        overtime_daily_hours: prov.overtime_daily,
        unique_rules: prov.unique_rules,
        note: "Canadian market: provincial employment standards apply (overtime thresholds shown; billed in CAD). Provincial minimum wages change frequently and are confirmed by the coordinator on the binding quote. All workers are payroll employees, never contractors. General information, not legal advice.",
      };
      otRules = {
        daily: prov.overtime_daily,
        weekly: prov.overtime_weekly,
        dailyDouble: prov.overtime_daily_double,
        seventhDay: false,
      };
    } else {
      compliance = {
        jurisdiction: city.state,
        min_wage_usd: null,
        overtime_weekly_hours: null,
        overtime_daily_hours: null,
        unique_rules: [],
        note: "Canadian market: provincial employment standards apply but are not modeled for this province — the estimate is straight-time only, and the coordinator confirms provincial wage and overtime rules on the binding quote.",
      };
    }
  } else {
    const comp = queryStateCompliance({ state: cityMeta.state });
    if (comp.ok && "state_abbr" in comp.data) {
      compliance = {
        jurisdiction: comp.data.state,
        min_wage_usd: comp.data.min_wage_usd,
        overtime_weekly_hours: comp.data.overtime_threshold_weekly_hours,
        overtime_daily_hours: comp.data.overtime_threshold_daily_hours,
        unique_rules: comp.data.unique_rules,
        note: "All TempGuru placements are W-2 with workers comp and general liability included. General information, not legal advice.",
      };
      otRules = {
        daily: comp.data.overtime_threshold_daily_hours,
        weekly: comp.data.overtime_threshold_weekly_hours,
        dailyDouble: comp.data.overtime_daily_double_hours,
        seventhDay: comp.data.seventh_day_overtime,
      };
    }
  }

  // Compute an overtime-ADJUSTED total. Straight-time (estimated_total_range)
  // understates the eventual quote wherever daily/weekly OT (or a double-time
  // band / seventh-day premium) applies. OT hours bill at 1.5x, double-time
  // hours at 2x. If no line triggers OT, overtime stays null.
  let overtime: {
    low: number;
    high: number;
    currency: "USD" | "CAD";
    includes_double_time: boolean;
    note: string;
  } | null = null;

  if (otRules) {
    let otLow = 0;
    let otHigh = 0;
    let triggered = false;
    let anyDouble = false;
    for (const l of lines) {
      const perWorkerHours = l.hours_per_shift * l.days;
      const ot = engagementOtHours(l.days, l.hours_per_shift, otRules);
      const otHoursPerWorker = ot.ot15 + ot.ot2;
      if (otHoursPerWorker > 0) triggered = true;
      if (ot.ot2 > 0) anyDouble = true;
      const regularPerWorker = perWorkerHours - otHoursPerWorker;
      const reg = l.headcount * regularPerWorker;
      const ot15 = l.headcount * ot.ot15;
      const ot2 = l.headcount * ot.ot2;
      otLow += reg * l.hourly_range.low + ot15 * l.hourly_range.low * 1.5 + ot2 * l.hourly_range.low * 2;
      otHigh += reg * l.hourly_range.high + ot15 * l.hourly_range.high * 1.5 + ot2 * l.hourly_range.high * 2;
    }
    if (triggered && compliance) {
      overtime = {
        low: Math.round(otLow),
        high: Math.round(otHigh),
        currency: cityMeta.currency,
        includes_double_time: anyDouble,
        note:
          `${compliance.jurisdiction} overtime applies to this schedule (daily > ${otRules.daily ?? "n/a"}h or weekly > ${otRules.weekly}h, per workweek). ` +
          `This range bills overtime at 1.5x${anyDouble ? ` and double-time bands (>${otRules.dailyDouble ?? 12}h/day${otRules.seventhDay ? " / 7th consecutive day past 8h" : ""}) at 2x` : ""}; the straight-time range above does not.`,
      };
      const perDay = Math.max(...lines.map((l) => l.hours_per_shift));
      if (otRules.daily && perDay > otRules.daily) {
        staffingNotes.push(
          `${compliance.jurisdiction} has daily overtime at ${otRules.daily}h, shifts of ${perDay}h will accrue OT${otRules.dailyDouble && perDay > otRules.dailyDouble ? ` (and double time past ${otRules.dailyDouble}h)` : ""}. See overtime_adjusted_total_range or split shifts.`,
        );
      } else {
        staffingNotes.push(
          `This multi-day schedule crosses ${compliance.jurisdiction}'s ${otRules.weekly}h weekly overtime threshold per worker (computed per workweek, assuming consecutive days). See overtime_adjusted_total_range or add staff to shorten shifts.`,
        );
      }
      if (otRules.seventhDay && lines.some((l) => l.days >= 7)) {
        staffingNotes.push(
          `${compliance.jurisdiction}'s seventh-consecutive-day premium is included in the OT-adjusted range. If the schedule has days off (non-consecutive), the premium may not apply — the coordinator confirms on the binding quote.`,
        );
      }
    }
  }

  const totalBasis =
    "All-inclusive W-2 bill rates: worker pay, payroll taxes, workers comp, general liability, coordinator support. Straight-time planning estimate, not a binding quote." +
    (planComplete ? "" : ` EXCLUDES ${unresolved.length} unpriced role(s) — see unpriced_roles.`);

  return {
    status: "plan" as const,
    plan_complete: planComplete,
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
    ...(planComplete ? {} : { unpriced_roles: unresolved }),
    estimated_total_range: {
      ...totals,
      currency: cityMeta.currency,
      basis: totalBasis,
    },
    overtime_adjusted_total_range: overtime,
    lead_time: leadTime,
    compliance,
    staffing_notes: staffingNotes,
    next_steps: [
      ...(planComplete
        ? []
        : [
            "Do NOT submit request_quote from this partial plan: resolve the unpriced_roles (each carries a did-you-mean suggestion; get_roles lists exact names), then call plan_staffing again for complete totals.",
          ]),
      "Present this plan to the user: roles, headcount, the estimated total range (label it a planning estimate), the lead-time read, and any staffing notes.",
      ...FALLBACK_LADDER,
      "A human coordinator replies with a binding quote within one business day. No payment until the user approves the quote.",
    ],
  };
}
