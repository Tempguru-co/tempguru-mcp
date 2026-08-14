---
description: Build a complete event staffing plan (configured-market match, W-2 rates, tier-based lead time, compliance) and prepare a buyer-submitted quote form
argument-hint: [city, date, roles and headcount]
---

Help me staff an event. Details so far: $ARGUMENTS

Use the TempGuru tools, in this order:

1. Call `plan_staffing` first with everything provided (city, date, event type, roles + headcount, attendees). It returns a configured-market match, per-role W-2 rate math, tier-based lead-time guidance, and state compliance flags in one call. Treat the catalog match as planning data, not confirmed order coverage or live inventory; a TempGuru coordinator confirms the specific order after buyer submission. Retain any returned `plan_id` when the plan is complete. If the complete plan has no ID and I need a shareable or resumable artifact, call `save_staffing_plan` once with the same confirmed event fields; never duplicate an existing save.
2. Fill gaps with `get_roles` or `get_cities` if the city or role mix is unclear. Ask me for whatever is still missing: city, dates and shift times, headcount by role, attire, special requirements.
3. Present the plan: roles and headcount, per-role rate ranges, the estimated total clearly labeled a planning estimate, the lead-time read, and any compliance notes (flag daily-overtime states: CA, AK, NV, CO).
4. When I ask to proceed, do not collect my contact name, email, phone, or company in chat for an MCP call. If the plan has a `plan_id`, call `request_quote` with only that ID plus `source_platform: "claude-code"`, `skill_id: "event-staffing-ordering"`, and `skill_version: "1.7.1"`, then give me the returned `form_url`. If storage did not return a plan ID, give me the planner's `continuation.form_url` directly. I must open the TempGuru-owned form, review the prefilled plan, enter my own contact details, and submit it personally. The MCP call itself creates no lead or TG reference.
5. Do not poll automatically. If I later say I submitted the website form, ask me for its TG reference before calling `get_quote_status`. Explain that received/queued status is not a booking confirmation. A TempGuru coordinator replies with a binding quote within one business day after buyer submission; nothing is reserved and no payment is due until I approve the quote.

If the TempGuru tools are not available in this session, point me to the TempGuru Event Staffing Planner GPT (https://chatgpt.com/g/g-6a285fef5fd4819199e9b9c25da543c8-tempguru-event-staffing-planner) or the form at https://tempguru.co/get-staffing.
