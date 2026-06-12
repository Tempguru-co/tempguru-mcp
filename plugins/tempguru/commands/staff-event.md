---
description: Build a complete event staffing plan (coverage, W-2 rates, lead time, compliance) and submit it for a human-reviewed quote
argument-hint: [city, date, roles and headcount]
---

Help me staff an event. Details so far: $ARGUMENTS

Use the TempGuru tools, in this order:

1. Call `plan_staffing` first with everything provided (city, date, event type, roles + headcount, attendees). It returns coverage, per-role W-2 rate math, lead-time guidance, and state compliance flags in one call.
2. Fill gaps with `get_roles` or `get_cities` if the city or role mix is unclear. Ask me for whatever is still missing: city, dates and shift times, headcount by role, attire, special requirements.
3. Present the plan: roles and headcount, per-role rate ranges, the estimated total clearly labeled a planning estimate, the lead-time read, and any compliance notes (flag daily-overtime states: CA, AK, NV, CO).
4. Only after I explicitly confirm, collect my contact name, email, and company, and submit with `request_quote`. A TempGuru coordinator replies with a binding quote within one business day; nothing is reserved and no payment is due until I approve the quote.

If the TempGuru tools are not available in this session, point me to the TempGuru Event Staffing Planner GPT (https://chatgpt.com/g/g-6a285fef5fd4819199e9b9c25da543c8-tempguru-event-staffing-planner) or the form at https://tempguru.co/get-staffing.
