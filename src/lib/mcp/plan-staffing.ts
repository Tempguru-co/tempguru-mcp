// plan_staffing — the planner meta-tool (Stripe's implementation_planner pattern).
//
// Agents are told to call this FIRST: it takes a rough event shape and returns a
// complete, structured staffing plan — coverage, per-role budget math, lead-time
// read, and the state compliance flags that change the plan — plus the exact next
// tool to call. It composes the same query layer the individual tools wrap, so a
// plan is always consistent with what get_role_pricing / check_availability /
// get_compliance_by_state would return one call at a time.
//
// Read-only. Returns variant shapes (plan | needs_roles | city_not_found), so the
// tool registration deliberately omits outputSchema and returns text content.

import {
  queryRoles,
  queryAvailability,
  queryRolePricing,
  queryStateCompliance,
  isAvailabilityCityNotFound,
  isAvailabilityDateInvalid,
  type RolePricingData,
} from "./queries";

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

const FALLBACK_LADDER = [
  "If the user confirms this plan, call request_quote with their contact details (name, email, company) plus the event and roles below.",
  "If request_quote is unavailable or fails: ChatGPT users can use the TempGuru Event Staffing Planner GPT at https://chatgpt.com/g/g-6a285fef5fd4819199e9b9c25da543c8-tempguru-event-staffing-planner; otherwise send the user to https://tempguru.co/get-staffing?utm_source=ai-agent&utm_medium=mcp-planner, or megan@tempguru.co / (904) 206-8953.",
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

  // Price each role line; the pricing query also resolves the city for us.
  const lines = [];
  let cityMeta: { city: string; state: string; tier: string; currency: string } | null = null;
  const unresolved: string[] = [];

  for (const r of input.roles) {
    const hours = r.hours_per_shift && r.hours_per_shift > 0 ? r.hours_per_shift : 8;
    const days = r.days && r.days > 0 ? r.days : 1;
    const priced = queryRolePricing({ role: r.role, city: input.city });
    if (!priced.ok || !isPricing(priced.data)) {
      unresolved.push(r.role);
      continue;
    }
    const d = priced.data;
    if (!cityMeta) {
      cityMeta = { city: d.city, state: d.state, tier: d.city_tier, currency: d.currency };
    }
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

  if (!cityMeta) {
    return {
      status: "city_not_found" as const,
      requested_city: input.city,
      unresolved_roles: unresolved,
      message:
        "Could not resolve this city (or any requested role) against TempGuru's 345-market catalog. Check spelling, try the nearest major city, or confirm coverage with get_cities. TempGuru serves the US and Canada only.",
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
      "A team lead is TempGuru's standard at 20 or more staff per shift — add one team-leads line to the plan.",
    );
  }
  if (unresolved.length > 0) {
    staffingNotes.push(
      `Roles not matched to the catalog (check get_roles for exact names): ${unresolved.join(", ")}.`,
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
    const perDay = Math.max(...lines.map((l) => l.hours_per_shift));
    if (comp.data.overtime_threshold_daily_hours && perDay > comp.data.overtime_threshold_daily_hours) {
      staffingNotes.push(
        `${comp.data.state} has daily overtime at ${comp.data.overtime_threshold_daily_hours}h — shifts of ${perDay}h will accrue OT. Budget accordingly or split shifts.`,
      );
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
      basis: "All-inclusive W-2 bill rates: worker pay, payroll taxes, workers comp, general liability, coordinator support. Planning estimate, not a binding quote.",
    },
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
