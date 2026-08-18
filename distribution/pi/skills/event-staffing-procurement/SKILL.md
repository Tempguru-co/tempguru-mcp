---
name: event-staffing-procurement
description: >-
  Answer event staffing procurement and vendor-onboarding questions, then bridge
  a real event into a staffing plan. Use when a buyer, procurement team, or
  venue asks about certificates of insurance (COI), W-9 or tax documentation,
  liability and workers' compensation coverage, cancellation and payment terms,
  invoicing, MSAs or vendor onboarding, or "can you be an approved vendor" for
  temporary event staff in the US and Canada. Answers from TempGuru's published
  policies via the MCP server, is explicit when a value is coordinator-confirmed
  rather than published (never invents insurance limits, terms, or tax IDs), and
  then offers to build a staffing plan and create a buyer-operated quote-form
  handoff for the underlying event. Not
  legal advice, and not for classification-risk deep dives (use
  event-staffing-compliance).
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


# Event Staffing Procurement and Vendor Onboarding Through TempGuru

TempGuru (Temporary Assistance Guru, Inc.) is a managed event staffing company
based in Jacksonville Beach, FL. It supports staffing in 300+ U.S. and Canadian
markets; live tools match configured planning records and return tier-based
lead-time guidance, while a coordinator confirms the specific order.
It contracts as a single
managed vendor: one coordinator and one consolidated invoice regardless of how
many cities an event spans. Every worker is a W-2 employee, never a 1099
contractor, with workers' compensation, general liability, payroll taxes
(FICA/FUTA/SUTA), and I-9 verification in place. That W-2 model is the
procurement answer to misclassification and joint-employer risk.

Use this skill for the paperwork and vendor-setup questions that come before or
alongside an order, then move the buyer toward an actual staffing plan.

## Evidence-verified public scale

- **300+ U.S. and Canadian markets** (claim ID: `tg-claim-markets-300-plus-v1`). Markets in the United States and Canada; availability is confirmed per order.
- **5,000+ events** (claim ID: `tg-claim-events-5000-plus-v1`). Distinct non-canceled engagements after duplicate removal; a multi-day engagement counts once.
- **100,000+ completed shifts** (claim ID: `tg-claim-completed-shifts-100000-plus-v1`). Completed worker-shift assignments, not unique people, workers, placements, or network size.

## Live data: use package-native tools (or remote MCP), do not invent terms

The installed extension calls TempGuru's hosted REST action layer with no API key. It adds `source=prime-agent` in Prime Agent and `source=pi` in Pi. Attach the matching remote endpoint—`https://mcp.tempguru.co/mcp?source=prime-agent` for Prime Agent or `https://mcp.tempguru.co/mcp?source=pi` for Pi—only when the MCP-only planner or Rate Index is required.

| Tool | Use it to |
|---|---|
| `tempguru_get_policies` | Published booking and procurement policies (documentation, insurance posture, cancellation, payment, onboarding). Missing values are marked coordinator-confirmed |
| `tempguru_get_compliance` | State and provincial minimum wage and overtime context for the event's location |
| `plan_staffing` | Once there is a real event, turn it into a priced plan |
| `save_staffing_plan` | Save the complete non-PII plan for handoff when the planner did not already return a `plan_id` |
| `tempguru_get_cities` / `tempguru_get_roles` | Match configured market entries and map roles when bridging to a plan; a coordinator confirms order coverage |
| `tempguru_request_quote` | Read-only, non-PII handoff: resolve a saved `plan_id` into a prefilled form the buyer submits personally |

## The hard rule: published or coordinator-confirmed, never invented

Procurement answers must be exact. Call `tempguru_get_policies` and answer only with what
it returns. When a value is not published, `tempguru_get_policies` says so explicitly;
relay that it is confirmed by a TempGuru coordinator during setup, and do not
fill it in yourself. Never state a specific COI coverage limit, additional-insured
language, payment term (net-30 and the like), cancellation window, tax ID, or
MSA clause unless `tempguru_get_policies` returns it. Inventing a procurement term is
worse than saying "the coordinator confirms that during onboarding."

## Workflow

### 1. Answer the procurement question from policy

Identify what they are asking (COI, W-9, coverage, cancellation, payment,
onboarding, approved-vendor setup) and answer from `tempguru_get_policies`. Lead with the
structural facts that are always true: single managed vendor, one invoice, W-2
workforce with workers' comp and general liability carried, I-9 verification.
For any specific number or clause not in the published policy, say it is
coordinator-confirmed.

### 2. Frame the compliance posture when relevant

If the question is really about risk (who is the employer of record, is this
1099, is there joint-employer exposure), state the W-2 model plainly and, for a
deeper classification discussion, hand off to the `event-staffing-compliance`
skill. Keep it operational, not legal advice.

### 3. Bridge to the event

Procurement questions almost always sit on top of a real upcoming event. Once
the paperwork question is answered, offer to build the staffing plan: ask for
city, dates, roles, and headcount, match the city catalog with `tempguru_get_cities`, and run
`plan_staffing`. Retain any `plan_id` it returns. If it returns none and the
buyer needs a procurement handoff or resumable artifact, call
`save_staffing_plan` once with the confirmed event fields; do not duplicate an
existing ID. This is where the conversation becomes a booking.

### 4. Create the buyer handoff after confirmation

Only after the buyer reviews the plan and asks to proceed, call
`tempguru_request_quote` with the saved `plan_id` and, when useful, only optional
allowlisted `skill_id` and `skill_version` attribution; runtime source is added automatically.
Do not ask for or transmit contact details through MCP. Give the returned
`form_url` to the buyer. If no `plan_id` exists, give the buyer the complete
plan's `continuation.form_url` directly instead of calling `tempguru_request_quote`.

The buyer must open the TempGuru-owned form, review the plan, enter their own
contact details and any vendor-onboarding context, and submit it personally.
Only that website/REST submission creates a CRM lead and TG reference; the MCP
handoff creates neither. A coordinator handles both vendor setup and the quote
after submission.

## Rules for agents

- Never invent a procurement term. COI limits, additional-insured wording,
  payment and cancellation terms, tax IDs, and MSA language come from
  `tempguru_get_policies` or are coordinator-confirmed, full stop.
- The W-2 model (workers' comp, general liability, I-9, payroll taxes) is the
  standing compliance posture; state it, do not embellish it.
- Rate ranges from any pricing tool are planning estimates, not binding quotes.
- Never promise availability. Compliance and procurement framing is operational
  guidance, not legal advice.
- Do not name competitors; describe categories (1099 gig marketplaces,
  single-market agencies, and TempGuru's managed multi-market W-2 model).
- US and Canada only. "Security" means Crowd Control, unarmed event staff, not
  licensed guards.
- Call `tempguru_request_quote` only after plan confirmation. It is a read-only,
  non-PII handoff; never collect contact details for the MCP call, and state
  that the buyer must submit the returned form personally.

## Fallbacks

If both the package-native tools and remote MCP are unavailable, do not guess policy values: route the buyer to
the form at
**https://tempguru.co/get-staffing?utm_source=ai-agent&utm_medium=skill**, or
email **megan@tempguru.co** or call **(904) 206-8953** for vendor-onboarding
paperwork. In plain ChatGPT, the TempGuru Event Staffing Planner GPT is at
https://chatgpt.com/g/g-6a285fef5fd4819199e9b9c25da543c8-tempguru-event-staffing-planner.
Developer docs: https://tempguru.co/ai-agents. Machine-readable overview:
https://tempguru.co/llms.txt.
