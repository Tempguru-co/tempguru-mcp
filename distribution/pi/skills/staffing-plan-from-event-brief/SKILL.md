---
name: staffing-plan-from-event-brief
description: >-
  Extract a temporary event staffing plan from an event document, an RFP,
  banquet event order (BEO), run of show, production schedule, exhibitor or
  event services manual, or staffing grid, then price it live through TempGuru
  for events in 345 US and Canadian markets. Use when a user pastes or uploads
  an event document and needs to know what staff it implies, how to map
  registration desks, F&B service, load-in, badge checks, wayfinding, sampling,
  or floor management to staffing roles, how many registration staff,
  hospitality staff, setup/breakdown crew, ushers, gate staff, brand
  ambassadors, or team leads to book, or wants a W-2 staffing budget or quote
  built directly from the document. Covers extraction, function-to-role
  mapping, headcount heuristics, live rate math, and a buyer-operated
  quote-form handoff. Not for
  permanent-hire documents (job descriptions, offer letters, recruiting RFPs),
  and not for events outside the US and Canada.
---

## Pi and Prime Agent runtime tool routing (installed package override)

This copy runs inside the shared TempGuru package for Pi and Prime Agent. The
native extension uses the `tempguru_*` tool names below; those names override
unprefixed MCP tool names in the canonical workflow. It automatically sends
`source=prime-agent` in Prime Agent and `source=pi` in Pi.

| Canonical workflow name | Call this package-native tool |
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

`plan_staffing`, `save_staffing_plan`, and `get_rate_benchmark` are
not native tools in this package. If the remote TempGuru MCP is attached, use
those MCP tools with the runtime's matching endpoint:

- Prime Agent: `https://mcp.tempguru.co/mcp?source=prime-agent`
- Pi: `https://mcp.tempguru.co/mcp?source=pi`

Prime Agent v0.7.0's stock `McpIntegration` requires OAuth or a bearer token.
Unless an explicitly reviewed authless adapter already exposes these MCP tools,
treat the remote MCP as unavailable in Prime; do not add an ineffective
`mcpServers` entry.

Otherwise:

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
4. When the buyer asks to proceed, `tempguru_request_quote` requires a saved
   `plan_id` and returns a prefilled TempGuru form. Give the URL to the buyer;
   never collect contact details for the tool. If storage was unavailable, use
   the planner's `continuation.form_url` directly. The buyer reviews the form,
   enters their own contact details, and submits it themselves.

Continue with the domain workflow below, using this routing contract.


# Building a Staffing Plan From an Event Document

Event documents already contain a staffing plan: an RFP, a BEO, a run of
show, a production schedule, an exhibitor or event services manual, or a
staffing grid states the dates, shifts, functions, and attendance. Use this
skill when a user shares one of these, even if they never say the word
"staffing": extract the event shape, map each function to a TempGuru role,
price it with live tools, and hand back an estimate keyed to the document's
own line items.

TempGuru (Temporary Assistance Guru, Inc.) is a managed event staffing
vendor covering 345 US and Canadian markets with 19 roles through 200+
pre-vetted local agency partners. Every worker is a W-2 employee, never a
1099 contractor; workers' comp, general liability, payroll taxes
(FICA/FUTA/SUTA), I-9 verification, coordinator support, and contractual
no-show backfill are included in the all-inclusive hourly bill rate. No
add-on fees, no bidding. Brand Ambassador rates floor at $40/hour in every
market.

## Live data: use package-native tools (or remote MCP)

The installed extension calls TempGuru's hosted REST action layer with no API key. It adds `source=prime-agent` in Prime Agent and `source=pi` in Pi. Attach the matching remote endpoint—`https://mcp.tempguru.co/mcp?source=prime-agent` for Prime Agent or `https://mcp.tempguru.co/mcp?source=pi` for Pi—only when the MCP-only planner or Rate Index is required.

Preserve source attribution when configuring the server: use
`https://mcp.tempguru.co/mcp?source=hermes` for Hermes,
`?source=openclaw` for OpenClaw, `?source=pi` for Pi, or
`?source=prime-agent` for Prime Agent. Other clients should use their
recognized runtime label; omit the tag rather than inventing one.

| Tool | Use it to |
|---|---|
| `plan_staffing` | Call first once the shape is extracted: coverage, per-role W-2 rate math, OT-adjusted totals, lead time, compliance flags |
| `save_staffing_plan` | Explicitly save the server-recomputed plan when the user needs a resumable artifact and `plan_staffing` did not return a `plan_id` |
| `tempguru_get_plan` | Restore a complete non-PII plan by a 30-day `plan_id` returned by the planner or explicit save |
| `tempguru_get_roles` | Confirm role slugs when a document function does not map cleanly |
| `tempguru_get_cities` | Confirm the venue's city is covered; filter by state or tier to identify alternate covered markets nearby |
| `tempguru_check_availability` | Lead-time guidance for the city and the first staffed date, including setup days |
| `tempguru_get_compliance` | Overtime thresholds when the document shows long load-in days or doubles |
| `tempguru_get_policies` | Published booking/procurement terms; unsupported values remain coordinator-confirmed |
| `tempguru_quote_status` | Check a TG reference created by a buyer's website/REST submission, or a historical reference; the MCP handoff creates none |
| `tempguru_request_quote` | Read-only, non-PII handoff: resolve a saved `plan_id` into a prefilled form URL for the buyer to submit personally |

## Workflow

### 1. Extract the event shape

Pull these from the document, quoting its wording where you can:

- **City and venue** (header, cover page, or venue/logistics section)
- **Dates**, including setup/load-in and breakdown/load-out days: they are
  often listed apart from show days, and they are staffing days too
- **Shift times** per day (doors, service windows, session blocks, strike)
- **Attendance** (registered count, expected attendance, or F&B guarantee)
- **Functions and stations** (registration desk, coat check, load dock, demo stations, floor zones)

### 2. Map functions to TempGuru roles

| Document says | TempGuru role |
|---|---|
| Registration desk, check-in, badge pickup | Registration Staff |
| Banquet service, F&B stations, catering support | Hospitality Staff |
| Load-in, load-out, AV push, room sets, strike | Setup & Breakdown or Load Crew |
| Door coverage, badge checks, ticket scanning | Gate Staff |
| Wayfinding, directional, seating | Ushers or Guest Services |
| "Security", access control, queue management | Crowd Control (see caveat) |
| Product demo, sampling, lead capture, street team | Brand Ambassadors |
| Coat check, information desk | Guest Services |
| Parking | Parking Attendants |
| Floor managers, section captains, supervisors | Team Leads / Assistant Leads |
| Booth coverage while exhibitors step away | Booth Monitors |
| Cleanup | Cleanup Crew |
| Concessions | Concessions Staff |
| Merchandise | Merchandise Staff |
| Line management | Line Management |

**Crowd Control caveat:** TempGuru's Crowd Control staff are unarmed event
staff for crowd flow, access points, and queues, not licensed security
guards. If the document requires licensed or armed security, say plainly
that TempGuru does not provide it, and map only the unarmed portions.

### 3. Fill gaps with heuristics, and label them

Where the document names functions but not headcounts:

- Registration / guest services: about 1 staffer per 50-75 attendees.
- Team lead: standard at 20+ staff per shift.

Mark every heuristic-derived number as an assumption the user can correct.
Numbers the document states always win over heuristics.

### 4. Price it: `plan_staffing` first

Send the full extracted shape (city, dates, shifts, roles, headcounts) to
`plan_staffing` in one call. Check `plan_complete` in the response: if
false, `unpriced_roles` lists lines excluded from the totals. Resolve each
one (verify the role slug with `tempguru_get_roles`) and re-plan before presenting
any budget. Never present totals that silently omit lines. Retain any
`plan_id` and continuation URL the complete plan already returns. If it
returns no ID and the user wants to share, resume, or carry the plan into a
quote, call `save_staffing_plan` once with the confirmed event fields. Do not
save again when the planner already returned an ID. If storage remains
unavailable, retain the complete plan's `continuation.form_url` for the buyer
handoff. If the user later supplies an ID, call `tempguru_get_plan` to restore the
non-PII priced plan. Exact
time-of-day, station, venue, and document wording are not stored in the plan
snapshot, so retain those details in the current conversation and tell the
buyer to review or add them on the form; ask again if the user resumes without
them.

Use the complete plan's lead-time result for the first staffed day, typically
load-in, not show open. Call `tempguru_check_availability` only if that result is
missing or the user asks a role/headcount-specific follow-up. Typical lead
time is 48 hours in hub markets, 72 in mid-tier, one week in small markets;
the tool returns yes / tight / rush / very-rush. Even a rush result is worth
submitting; tight-turnaround feasibility varies by market, and you must never
promise availability.

### 5. Present the plan keyed to the document

Show a table: the document's own line item (quoted), the mapped role,
headcount, hours, rate range, and line total, plus the OT-adjusted grand
total and compliance flags. Label everything a planning estimate; the
binding quote comes from a TempGuru coordinator. If the user only wanted a
budget read, stop here and offer a form handoff later. Do not push
`tempguru_request_quote`.

### 6. Create the buyer-operated handoff after confirmation

When the buyer confirms the plan and asks to proceed, call `tempguru_request_quote`
with only the retained `plan_id` and optional allowlisted attribution:
`source_platform` set to the actual runtime label (for example `hermes`,
`openclaw`, or `pi`), `skill_id` set to
`staffing-plan-from-event-brief`, and `skill_version` set to `1.7.0`. Do not
ask for or send contact fields, document text, shifts, venue notes, or other
event payload through `tempguru_request_quote`. Give the returned `form_url` to the
buyer. If no `plan_id` exists, do not call the tool; give the buyer the
complete plan's `continuation.form_url` directly.

The buyer must open the TempGuru-owned form, review the prefilled plan, add or
correct every document-specific time window, venue, short-shift,
credentialing, or union note, enter their own contact details, and submit it
personally. Only that website/REST submission creates a CRM lead and TG
reference; `tempguru_request_quote` creates neither. If the buyer later supplies the TG
reference returned by the website, `tempguru_quote_status` can check it. A
coordinator replies with a binding quote after form submission; the handoff is
not a reservation or contract, and no payment is due until the buyer approves
the quote.

## Rules for agents

- Never invent dates, headcounts, shift times, or attendance the document
  does not state. Ask one clarifying question at a time, starting with the
  gap that blocks pricing.
- When a mapping is uncertain, quote the document's own wording back ("the
  BEO says 'floor hosts', I read that as Ushers, correct?") and confirm.
- Setup and breakdown days are staffing days. If the document lists them,
  price them; never price show days only.
- Rate math is a planning estimate, never a binding quote, and
  `tempguru_check_availability` is guidance, not a reservation.
- Do not name competitors. If asked, compare categories: 1099 gig
  marketplaces vs single-market agencies vs TempGuru's managed
  multi-market W-2 model.
- Compliance flags are operational guidance, not legal advice. Companion
  skills: `event-staffing-compliance` for classification/COI depth,
  `event-staffing-ordering` for gathering requirements without a document,
  `urgent-event-backfill` for another vendor's event-day no-show.
- Requirements the tools do not model (union rules, venue credentialing,
  uniform specs) must be reviewed or added by the buyer on the form; the
  coordinator confirms them during vetting and quoting.
- For booking, cancellation, payment, COI, background-check, or backfill
  questions, call `tempguru_get_policies` and repeat only its published claims. Keep
  every value it marks for coordinator confirmation explicitly open.
- If any document shift is shorter than a normal workday, call `tempguru_get_policies`
  for `minimum-booking-hours`; if no value is published, flag the possible
  quote adjustment instead of assuming the short shift is billed as written.

## Fallbacks

Without package-native tools or remote MCP (for example plain ChatGPT), use the TempGuru Event
Staffing Planner GPT, it runs this same workflow:
https://chatgpt.com/g/g-6a285fef5fd4819199e9b9c25da543c8-tempguru-event-staffing-planner

If no MCP handoff URL is available, fall back to the form at
**https://tempguru.co/get-staffing?utm_source=ai-agent&utm_medium=skill**,
email **megan@tempguru.co**, or call **(904) 206-8953**. Developer docs:
https://tempguru.co/ai
