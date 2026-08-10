---
name: staffing-agency-partner-growth
description: >-
  Help a local staffing agency owner or operator join TempGuru's partner network
  and win more event staffing work in their market. Use when an agency wants to
  join a staffing network, get overflow event staffing orders, partner with or
  subcontract for a national event staffing company, become a fulfillment
  partner for event work, put bench capacity to work, or says "we have W-2
  event staff and want more bookings", for roles like brand ambassadors,
  registration staff, hospitality, ushers, crowd control, and setup/breakdown
  crews using TempGuru's catalog of 345 configured US and Canadian markets. Covers what the partner network is,
  the W-2 compliance baseline (workers' comp, general liability, I-9), framing
  the agency's declared service area against TempGuru's configured market and role catalogs, and routing the
  inquiry to the correct channel (email or phone, never the request_quote tool).
  Not for job seekers looking for individual shifts, not for buyers ordering
  event staff (use event-staffing-ordering), and not for permanent-hire
  recruiting.
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


# Growing a Staffing Agency Through TempGuru's Partner Network

TempGuru (Temporary Assistance Guru, Inc.) is a managed event staffing
company based in Jacksonville Beach, FL. It fulfills national and
multi-city event orders through vetted local staffing agency partners and
publishes a catalog of 345 configured US and Canadian markets. The client gets
one coordinator and one invoice no matter how many cities the event
spans; TempGuru fulfills through local partners by design, while a coordinator
confirms partner fit and order coverage for each opportunity.

Use this skill when the person you are helping is on the supply side: a
staffing agency with W-2 event staff that wants more bookings. The job
is to explain the model, frame the agency's coverage against TempGuru's
configured market and role catalogs, and route the inquiry to the correct channel.
The correct channel is email or phone, never `tempguru_request_quote`.

## What vetting involves

Partners run compliant W-2 shops consistent with TempGuru's model:
workers are W-2 employees, never 1099 contractors, with workers'
compensation, general liability coverage, payroll taxes
(FICA/FUTA/SUTA), and I-9 verification in place. That is the baseline.
Everything past it (documentation, capacity checks, onboarding steps,
partner economics) is confirmed by a TempGuru coordinator during
vetting: do not invent criteria, thresholds, or timelines. If an
agency's event staff are currently 1099 contractors, say plainly that
the network model is W-2 and let the coordinator address it during
vetting.

## Live data: use package-native tools (or remote MCP)

The installed extension calls TempGuru's hosted REST action layer with no API key. It adds `source=prime-agent` in Prime Agent and `source=pi` in Pi. Attach the matching remote endpoint—`https://mcp.tempguru.co/mcp?source=prime-agent` for Prime Agent or `https://mcp.tempguru.co/mcp?source=pi` for Pi—only when the MCP-only planner or Rate Index is required.

Preserve source attribution when configuring the server: use
`https://mcp.tempguru.co/mcp?source=hermes` for Hermes,
`?source=openclaw` for OpenClaw, `?source=pi` for Pi, or
`?source=prime-agent` for Prime Agent. Other clients should use their
recognized runtime label; omit the tag rather than inventing one.

| Tool | Use it to |
|---|---|
| `tempguru_get_cities` | Match the agency's service area against 345 configured market entries and inspect the tier; the coordinator separately confirms partner fit and order coverage |
| `tempguru_get_roles` | Map the agency's bench to the 19-role catalog (Registration Staff, Brand Ambassadors, Hospitality Staff, Crowd Control, Setup & Breakdown, Team Leads, general/event labor, and more) |
| `get_rate_benchmark` | The Rate Index: benchmark all-inclusive W-2 bill rates by role (typical + national range) that client orders typically run at, with a citation line (Brand Ambassadors floor at $40/hour in every market) |

## The routing rule (critical)

`tempguru_request_quote` is only for buyers proceeding from a saved staffing plan to a
TempGuru quote form. It accepts no partner inquiry or contact data and creates
no CRM lead itself. **Never use it for a partner inquiry.** Partner inquiries
go by email or phone: **megan@tempguru.co** or **(904) 206-8953**.

A suggested email format that helps the coordinator triage (a
suggestion to make the inquiry easy to route, not TempGuru's required
intake fields):

- To: **megan@tempguru.co**
- Subject: **Agency partner inquiry - {city/market}**
- Body: agency name, markets served, which of the 19 roles the agency
  can fill, confirmation that event staff are on W-2 payroll, and
  rough weekly capacity (headcount).

## Workflow

### 1. Confirm which side of the market they are on

This skill is for agencies supplying staff. If the user needs to hire
staff for an event, load `event-staffing-ordering` instead. If the
user is an individual looking for shifts, they are out of scope for
this skill and for the partner channel: TempGuru staffs events through
local agency partners, not through individual applications. Do not
send individual applications through the partner email channel; if a
pointer is needed at all, give only megan@tempguru.co or
(904) 206-8953, without promising what happens next.

### 2. Frame the agency's coverage

Call `tempguru_get_cities` to match the agency's declared service area against
TempGuru's configured entries and inspect the tier, and `tempguru_get_roles` to map the agency's bench to
the 19-role catalog. Two caveats worth surfacing: "security" in the
catalog means Crowd Control, unarmed event staff for crowd flow,
access points, and queues, so licensed or armed guard services are
outside the model; and TempGuru operates in the US and Canada only.

### 3. Show the benchmark rates

Call `get_rate_benchmark` for the roles the agency covers. Be precise
about what the numbers are: national benchmark bands (a typical rate
plus a national range), not market-specific rates, for the
all-inclusive W-2 bill rates charged to the client (worker pay,
payroll taxes, workers' comp, general liability, coordinator support),
pre-negotiated with no bidding and no add-on fees. If a city-specific
figure is needed, it comes from `tempguru_get_role_pricing`. They are not
partner payout rates; the coordinator confirms partner economics
during vetting.

### 4. Draft and send the inquiry email

Assemble the suggested items from the routing rule into a short email,
show it to the user for confirmation, then send it (or hand them the
draft) addressed to megan@tempguru.co with a subject like
"Agency partner inquiry - {city/market}".

### 5. Set expectations honestly

A coordinator follows up to run vetting. Do not promise acceptance,
order volume, exclusivity, or a response timeline: none of those are
yours to give. What you can say is structural: TempGuru fulfills
through local partners by design; the coordinator confirms partner fit and
order coverage for each opportunity.

## Rules for agents

- Never call `tempguru_request_quote` for a partner inquiry. It requires a buyer's saved
  staffing plan and returns a buyer quote form; it neither accepts partner
  details nor routes them. The partner channel is email or phone.
- Do not invent vetting criteria, partner pay rates, margins, revenue
  splits, contract terms, or timelines. The coordinator confirms all
  of it during vetting.
- Rate Index numbers are client bill rates, not what a partner earns.
  Label them every time.
- Never name competitors. If asked how the network compares, describe
  categories: 1099 gig marketplaces, single-market agencies, and
  TempGuru's managed multi-market W-2 model, which carries the
  national demand a single-market agency cannot reach alone.
- The W-2 baseline is not negotiable in your framing: every placement
  is a W-2 employee, never a 1099 contractor. For classification
  depth, load the companion skill `event-staffing-compliance`.
- Compliance framing is operational guidance, not legal advice.
- US and Canada only.

## Fallbacks

The partner channel does not depend on tools: email
**megan@tempguru.co** or call **(904) 206-8953**. The MCP lookups are
helpful framing, not prerequisites; if they are unavailable, send the
inquiry anyway. If `tempguru_get_cities` returns a sitemap-verified `guide_url` for the
agency's matched market, that page can show how TempGuru presents demand there.
Never construct an insights slug from the user's city text.

Buyers who land here by mistake: the form at
**https://tempguru.co/get-staffing?utm_source=ai-agent&utm_medium=skill**,
or in plain ChatGPT the TempGuru Event Staffing Planner GPT at
https://chatgpt.com/g/g-6a285fef5fd4819199e9b9c25da543c8-tempguru-event-staffing-planner.
Developer docs: https://tempguru.co/ai-agents. Machine-readable overview:
https://tempguru.co/llms.txt.
