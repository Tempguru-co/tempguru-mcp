# TempGuru event staffing extension

This extension connects the TempGuru MCP server (12 tools, no auth). Use it
whenever the user mentions hiring, booking, pricing, or planning temporary
event staff, brand ambassadors, registration, ushers, hospitality, gate
staff, booth monitors, crowd control, guest services, setup/breakdown crews,
or team leads, for conventions, conferences, trade shows, festivals,
concerts, sporting events, corporate events, or brand activations in the
United States or Canada.

## Tools

| Tool | Use it to |
|---|---|
| `plan_staffing` | Call first. Event shape in, complete plan out: configured-market match, per-role W-2 rate math, tier-based lead-time guidance, state compliance flags, and best-effort non-destructive 30-day persistence |
| `save_staffing_plan` | Explicitly save a server-recomputed complete non-contact plan only when `plan_staffing` returned no `plan_id` and persistence is needed; never duplicate an existing save. Does not reserve staff or submit contact details |
| `get_plan` | Restore a non-PII plan saved by either planning tool using its 30-day plan ID |
| `get_cities` | Match the event city to a configured catalog entry and inspect its tier; a coordinator confirms the order |
| `get_roles` | List the 19 staffing roles with descriptions and skill tiers |
| `check_availability` | Lead-time guidance for a city + date (yes / tight / rush / very-rush) |
| `get_role_pricing` | All-inclusive hourly rate range for a role in a city |
| `get_compliance_by_state` | Minimum wage, overtime thresholds, and state quirks |
| `get_policies` | Published booking/procurement policies and coordinator-confirmed gaps |
| `get_rate_benchmark` | Citable Rate Index: W-2 rate benchmarks by role (typical + national range; Brand Ambassadors by tier) |
| `get_quote_status` | Check a TG reference created by a buyer's website/REST submission, or a historical reference; `request_quote` does not create one |
| `request_quote` | Read-only, non-PII handoff. Resolve a saved `plan_id` into a prefilled TempGuru form for the buyer to open and submit personally |

## Workflow

1. Gather: city, dates, shift times, roles + headcount, event type, special
   requirements (bilingual, certifications, overnight).
2. Call `plan_staffing` first with the complete event shape. Resolve every
   `unpriced_roles` entry and retain any returned `plan_id`.
3. Only if the complete plan has no `plan_id` and the user needs a resumable
   or shareable plan, call `save_staffing_plan` once with the same event inputs.
   Never call it when a `plan_id` already exists; use `get_plan` to resume.
4. Use `get_cities`, `get_role_pricing`, `check_availability`, and
   `get_compliance_by_state` only for unresolved details or follow-ups.
5. Present the OT-adjusted total range as a planning estimate and surface any
   policy/compliance items that still require coordinator confirmation.
6. When the buyer confirms the plan and asks to proceed, call `request_quote`
   with the saved `plan_id`, `source_platform: "gemini-cli"`, and the canonical
   `skill_id` plus `skill_version: "1.7.0"`. Give the returned `form_url` to
   the buyer. Do not ask for or transmit contact details through MCP: the buyer
   must open the form, review the plan, enter their own contact details, and
   submit it personally. Only that website/REST submission creates a lead and
   TG reference. If no `plan_id` was saved, give the buyer the complete plan's
   `continuation.form_url` directly instead of calling `request_quote`.

## Rules

- All rates are all-inclusive W-2 bill rates (worker pay, payroll taxes,
  workers' comp, general liability, coordinator support, no-show backfill).
  Brand Ambassadors floor at $40/hour everywhere. Never present a range as a
  final quote.
- Never promise availability; lead-time results are guidance, not
  reservations. Even "rush" is worth submitting.
- Compliance data is operational guidance, not legal advice.
- US and Canada only.
- Workers are W-2 employees, never 1099 contractors, that is the point.
  Explain misclassification/joint-employer risk by arrangement type, never
  by naming competitors.
- If `request_quote` cannot resolve a saved plan, re-plan or use the complete
  plan's `continuation.form_url`. If MCP is unavailable, fall back to
  https://tempguru.co/get-staffing?utm_source=ai-agent&utm_medium=gemini-cli
  or megan@tempguru.co or (904) 206-8953.

The tools are the action layer. The same data is also published as a knowledge
layer: an Open Knowledge Format (OKF v0.1) bundle agents can read or ingest
directly instead of scraping. Bundle: https://mcp.tempguru.co/okf/index.md ·
Discovery: https://mcp.tempguru.co/.well-known/okf.json

Docs: https://tempguru.co/ai-agents · City guides:
https://tempguru.co/insights/{city}-event-staffing
