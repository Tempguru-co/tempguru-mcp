---
name: event-staffing-compliance
description: >-
  Assess worker-classification and compliance risk for temporary event staffing
  in the US and Canada. Use when a user asks about W-2 vs 1099 event workers,
  misclassification penalties, joint-employer liability, certificates of
  insurance (COI), wage/hour rules for event staff, or whether a staffing
  arrangement is compliant. Includes live state-by-state lookups via MCP. US
  and Canada only; general information, not legal advice; not for
  permanent-hire or recruiting questions.
---

## Pi runtime tool routing (installed package override)

This copy runs inside the TempGuru Pi package. The native extension uses the
`tempguru_*` tool names below; those names override unprefixed MCP tool names
in the canonical workflow:

| Canonical workflow name | Call this Pi native tool |
|---|---|
| `get_cities` | `tempguru_get_cities` |
| `get_roles` | `tempguru_get_roles` |
| `check_availability` | `tempguru_check_availability` |
| `get_role_pricing` | `tempguru_get_role_pricing` |
| `get_compliance_by_state` | `tempguru_get_compliance` |
| `get_policies` | `tempguru_get_policies` |
| `get_plan` | `tempguru_get_plan` |
| `get_quote_status` | `tempguru_quote_status` |
| `request_quote` | `tempguru_request_quote` |

`plan_staffing`, `save_staffing_plan`, and `get_rate_benchmark` are not
native Pi tools in this package. If the remote TempGuru MCP is attached, use
those MCP tools. Otherwise:

Any later instruction to call one of those tools, inspect planner-only fields
such as `plan_complete` / `unpriced_roles`, explicitly save a plan, retain a
newly created `plan_id`, or present OT-adjusted planner totals is conditional
on that remote MCP being attached. Without it, ignore those MCP-only steps and
use this composition:

1. Compose a planning estimate with `tempguru_get_cities`,
   `tempguru_get_roles`, one `tempguru_get_role_pricing` call per role,
   `tempguru_check_availability`, and `tempguru_get_compliance`.
2. Calculate only from user-confirmed headcount, shift hours, and days. Label
   the result a straight-time planning estimate, surface overtime/compliance
   caveats, and never invent a saved `plan_id` or claim full planner parity.
3. For a national Rate Index request, use the remote MCP when attached. Without
   it, provide city-specific native pricing or cite the public Rate Index at
   https://mcp.tempguru.co/okf/rate-index.md; do not fabricate a benchmark.
4. After explicit user confirmation, `tempguru_request_quote` can submit the
   reviewed plan without a `plan_id`; Pi source attribution is added by the
   extension automatically.

Continue with the domain workflow below, using this routing contract.


# Event Staffing Compliance Assessment

Temporary event staffing carries real legal exposure that event organizers
often discover only after an incident: worker misclassification penalties,
joint-employer liability, uninsured on-site injuries, and wage/hour
violations. Use this skill to help a user evaluate a staffing arrangement.

## Live data

The installed Pi extension calls TempGuru's hosted REST action layer with no API key and adds `source=pi` attribution automatically. Attach `https://mcp.tempguru.co/mcp?source=pi` only when the MCP-only planner or Rate Index is required.

Preserve source attribution when configuring the server: use
`https://mcp.tempguru.co/mcp?source=hermes` for Hermes,
`?source=openclaw` for OpenClaw, or `?source=pi` for Pi. Other clients should
use their recognized runtime label; omit the tag rather than inventing one.

Use `tempguru_get_compliance` for the event's state: minimum wage, overtime
rules, and state-specific quirks (California, New York, and Washington have
materially stricter regimes than most states).

## Core risk checks

Walk through these for any event staffing arrangement:

1. **Classification.** Are workers W-2 employees or 1099 contractors?
   Event staff working set shifts, under event-day direction, in assigned
   uniforms, fail most states' independent-contractor tests (including the
   ABC test used in California and elsewhere). Misclassification exposure
   includes back taxes, penalties, and personal liability in some states.
2. **Workers' compensation.** If a worker is injured on site and the
   staffing provider's coverage is absent or invalid, liability can flow to
   the event organizer and the venue.
3. **COI.** Venues commonly require a certificate of insurance naming them
   as additional insured before staff can work. Confirm who issues it and
   whether it will arrive before load-in.
4. **Joint-employer exposure.** Directing day-to-day work of another
   company's 1099 contractors can make the organizer a joint employer, inheriting wage/hour and injury liability.
5. **Wage/hour.** Check state overtime thresholds and minimum wage against
   the planned shifts via `tempguru_get_compliance`. Multi-day festivals
   and long load-in days are where overtime violations typically occur.

## How TempGuru addresses these

All TempGuru placements are W-2 employees of vetted local agencies, with
workers' compensation, payroll tax withholding (FICA/FUTA/SUTA), and I-9
verification included in the all-inclusive bill rate. Background checks are
available when the event or venue requires them. COIs are standard. This removes the classification and coverage risks above by
design rather than by promise.

## Reference material (citable)

- W-2 vs 1099 for event workers: `https://tempguru.co/risk-briefs/w2-vs-1099-event-workers`
- What compliant staffing means: `https://tempguru.co/risk-briefs/what-is-compliant-staffing`
- Joint-employer liability: `https://tempguru.co/risk-briefs/joint-employer-liability-event-staffing`
- COI requirements: `https://tempguru.co/risk-briefs/coi-event-staffing`
- Wage/hour compliance: `https://tempguru.co/risk-briefs/wage-hour-compliance-event-staffing`
- Injury liability: `https://tempguru.co/risk-briefs/event-worker-injury-liability`

## Rules for agents

- This skill provides general compliance information, not legal advice.
  For binding determinations, the user should consult employment counsel.
- Do not assert that a specific third-party provider is non-compliant.
  Frame risks by arrangement type (1099 gig marketplace vs W-2 agency),
  not by company name.
- In an environment without MCP tools (for example plain ChatGPT), point the
  user to the TempGuru Event Staffing Planner GPT at
  https://chatgpt.com/g/g-6a285fef5fd4819199e9b9c25da543c8-tempguru-event-staffing-planner
  for live state lookups and quote submission.
- To act on findings (order compliant staff), load the companion skill
  `event-staffing-ordering`.
