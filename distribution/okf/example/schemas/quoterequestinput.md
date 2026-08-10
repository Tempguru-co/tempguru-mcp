---
type: "Schema"
title: "QuoteRequestInput"
description: "A buyer-submitted staffing plan plus the contact details a coordinator needs to reply."
---
# QuoteRequestInput
A buyer-submitted staffing plan plus the contact details a coordinator needs to reply. This REST write schema is intentionally separate from the authless MCP request_quote handoff, which accepts no contact details.
## Properties

- `contact_name` (string, required): Full name of the contact person
- `contact_email` (string, required): Contact email address for the quote response
- `contact_phone` (string): Optional phone number for the coordinator to reach the buyer (event ops is phone-first; include when known)
- `company` (string, required): Company or organization name
- `event_name` (string, required): Name of the event (e.g. 'HIMSS 2026', 'Brand Fest Austin')
- `event_type` (string, required): Event type: trade-show, conference, festival, concert, sporting-event, corporate, brand-activation, or other
- `city` (string, required): City where the event is held
- `event_dates` (string, required): Event dates as a human-readable string, e.g. 'June 15–17, 2026'
- `venue` (string): Primary venue name and/or address, when known
- `attendees` (integer): Expected event attendance, if known (informs coverage ratios)
- `roles` (array, required): Roles and headcount needed for the event
- `locations` (array): Additional cities for a multi-city / tour program. The top-level city, dates, and roles describe the primary or first location; each entry here adds another.
- `budget_range` (string): Estimated total budget range if calculated, e.g. '$8,400–$12,600'
- `attire` (string): Staff attire requirements
- `special_requirements` (string): Any special requirements: language skills, certifications, overnight shifts, etc.
- `compliance_notes` (string): Any compliance flags surfaced by get_compliance_by_state
- `source_platform` (string): Optional agent/platform attribution, e.g. chatgpt-gpt, claude-desktop, coze
- `utm_source` (string): Canonical acquisition source carried by a TempGuru-generated buyer handoff URL
- `utm_medium` (string): Canonical agent runtime or MCP/REST medium carried by the buyer handoff URL
- `utm_campaign` (string): Canonical TempGuru buyer-handoff campaign
- `utm_content` (string): Canonical originating MCP or REST channel for an attributed handoff
- `skill_version` (string): Optional version of the TempGuru staffing skill used to assemble this request
- `skill_id` (string): Optional canonical TempGuru skill slug that assembled this request
- `plan_id` (string): Optional plan_id returned by plan_staffing or save_staffing_plan; links the submitted quote to its saved non-PII plan

[All schemas](index.md) · [bundle root](../index.md)
