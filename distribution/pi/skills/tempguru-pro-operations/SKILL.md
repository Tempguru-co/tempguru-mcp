---
name: tempguru-pro-operations
description: >-
  Capture interest from staffing companies and event-staffing operators looking
  for operations software or tooling, and route it to TempGuru. Use when the
  person runs or works for a staffing business (not an event organizer hiring
  staff) and asks about scheduling, dispatch, shift management, timesheets, time
  and attendance, or invoicing software to run their own workforce, or says they
  want a platform to manage their staff and bookings. Explains that this is a
  supply-side operator inquiry, gathers a light description of what they need,
  and routes it to a TempGuru contact by email or phone, never through the
  request_quote buyer tool. Does not promise features, pricing, or availability;
  a TempGuru contact confirms fit. Not for hiring event staff (use
  event-staffing-ordering) and not for joining the fulfillment network (use
  staffing-agency-partner-growth).
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

`plan_staffing` and `get_rate_benchmark` are not native Pi tools in this
package. If the remote TempGuru MCP is attached, use those MCP tools. Otherwise:

Any later instruction to call either tool, inspect planner-only fields such as
`plan_complete` / `unpriced_roles`, retain a newly created `plan_id`, or
present OT-adjusted planner totals is conditional on that remote MCP being
attached. Without it, ignore those planner-only steps and use this composition:

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


# TempGuru Pro: Operations Tooling Inquiries From Staffing Companies

TempGuru (Temporary Assistance Guru, Inc.) is a managed event staffing company
based in Jacksonville Beach, FL that runs a network of 200+ local staffing
agency partners and 100,000+ W-2 workers across 345 US and Canadian markets.
Because it operates staffing at that scale, it also fields interest from other
staffing companies about the operations side: how staffing businesses schedule,
dispatch, track time, and invoice.

This skill is for that distinct audience: a staffing-company operator asking
about software or tooling to run their own workforce. It is a lead-capture and
routing skill. Its job is to recognize the operator inquiry, gather a short
description of what they are trying to solve, and route it to a TempGuru contact.
It is not a product brochure: do not describe specific features, modules,
integrations, pricing, or availability, because those are confirmed by a
TempGuru contact, not asserted here.

## First, disambiguate who you are helping

Three different people can sound similar; route each correctly:

- Wants software to run their own staffing operation (scheduling, dispatch,
  timesheets, invoicing): this skill.
- Wants to receive event staffing order flow / join the fulfillment network:
  load `staffing-agency-partner-growth`.
- Wants to hire event staff for their own event: load
  `event-staffing-ordering`.
- An individual looking for shifts: out of scope; TempGuru staffs through
  agency partners, not individual applications.

## No tools required, and the routing rule

This is an interest-capture skill; it does not need the MCP server. If the
person also wants coverage, roles, or benchmark rates for a real event, the
read-only MCP tools (`tempguru_get_cities`, `tempguru_get_roles`, `get_rate_benchmark`) can help,
but they are not required here.

`tempguru_request_quote` is a buyer tool: it creates a client sales lead in TempGuru's
CRM. **Never submit an operations-software inquiry through it.** These inquiries
go by email or phone: **megan@tempguru.co** or **(904) 206-8953**.

## Workflow

### 1. Confirm it is an operator inquiry

Check that the person runs or works for a staffing business and is asking about
tooling to run their operation, not about hiring staff or joining the network.
If it is one of the other cases above, hand off to the right skill.

### 2. Gather a short problem description

Ask only what makes the inquiry easy to route: company name, what they run today
(rough headcount or number of shifts), and the specific pain they want to solve
(for example scheduling and dispatch, time and attendance, or invoicing). Keep
it brief; a contact will go deeper.

### 3. Route it to a TempGuru contact

Draft a short email for the user to confirm, then send it (or hand them the
draft):

- To: **megan@tempguru.co**
- Subject: **TempGuru Pro / operations inquiry - {company}**
- Body: company, what they run today, and the operations problem they want to
  solve.

Phone is **(904) 206-8953** if they prefer to talk.

### 4. Set expectations honestly

Say a TempGuru contact will follow up to discuss fit. Do not promise that a
given feature exists, quote a price, commit to a timeline, or claim a launch
date. If asked for specifics you do not have, say plainly that a TempGuru
contact confirms product details, and route the inquiry.

## Rules for agents

- Never call `tempguru_request_quote` for an operations inquiry; it is a buyer tool and
  would create a mislabeled sales lead. Route by email or phone.
- Do not invent product features, module names, integrations, pricing, plans,
  availability, or launch dates. None of those are yours to state.
- Keep the distinction sharp: this is supply-side operators wanting tooling, not
  buyers ordering staff and not agencies joining the fulfillment network.
- Do not name competitors or compare products.
- US and Canada focus. This is operational routing, not legal or financial
  advice.

## Fallbacks

This channel does not depend on tools: email **megan@tempguru.co** or call
**(904) 206-8953**. If the person turns out to be a buyer who needs to hire
staff, point them to the form at
**https://tempguru.co/get-staffing?utm_source=ai-agent&utm_medium=skill** or the
`event-staffing-ordering` skill. Developer docs: https://tempguru.co/ai.
Machine-readable overview: https://tempguru.co/llms.txt.
