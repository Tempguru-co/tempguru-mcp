# ChatGPT Custom GPT: "Event Staffing Planner by TempGuru"

Complete, paste-ready package for publishing the GPT to the GPT Store.
Build at https://chatgpt.com/gpts/editor (Plus/Team account). Publish target:
**Everyone** (GPT Store).

Status tracker lives in [README.md](./README.md).

---

## Prerequisites (one-time)

1. **Builder profile verification.** Settings → Builder profile → verify the
   `tempguru.co` domain (DNS TXT record). The GPT then shows "by tempguru.co"
   instead of a personal name. This is a trust signal the store ranks on.
2. **Privacy policy**, required because the GPT uses Actions:
   `https://tempguru.co/privacy-policy` (live, verified 2026-06-09).
3. Knowledge files generated: run `node distribution/assistants/build-knowledge.mjs`.

---

## Configure tab, paste these fields

### Name

```
Event Staffing Planner by TempGuru
```

Keyword-first on purpose: GPT Store search and Google both match on the name,
and people search "event staffing," not "TempGuru."

### Description (store listing, max ~300 chars)

```
Plan and budget W-2 event staff with TempGuru across 300+ U.S. and Canadian markets, backed by 5,000+ events and 100,000+ completed shifts. Match cities, check rates and lead-time guidance, review compliance, and get a coordinator-confirmed quote.
```

### Instructions

Paste the INSTRUCTIONS block from [system-prompt.md](./system-prompt.md),
add a blank line, then append this GPT-specific block. ChatGPT rejects
instructions over 8,000 characters, and the two together come to 7,842, so
keep this block short. The main block already carries the plan ID, TG
reference, payload-confirmation, and form-fallback rules.

```
TOOLS ON THIS PLATFORM
Your Actions call TempGuru's live API. Prefer them over the knowledge files
for current data; use the files for background and when an Action fails. For
submitQuoteRequest, set source_platform to "chatgpt-gpt" and include plan_id
when the user supplied one. Wherever you give the quote form, use
https://tempguru.co/get-staffing?utm_source=ai-agent&utm_medium=chatgpt-gpt
```

### Conversation starters (4)

```
Price 10 brand ambassadors for a 3-day trade show in Las Vegas
Is 2 weeks enough notice to staff registration in Dallas?
What's my risk if I use a 1099 gig app for event staff in California?
Build a staffing plan and budget for a 500-person conference
```

### Knowledge (upload all 5)

- `knowledge/tempguru-company-overview.md`
- `knowledge/tempguru-roles-and-rates.md`
- `knowledge/tempguru-city-coverage.md`
- `knowledge/tempguru-state-compliance.md`
- `knowledge/tempguru-booking-policies.md`

Re-upload whenever `content/mcp-data/` changes (regenerate first).

### Capabilities

- Web Search: **ON** (lets the GPT pull venue/event context)
- Canvas: ON (staffing plans render well as documents)
- Image generation: OFF
- Code Interpreter: ON (budget math on big multi-city programs)

### Actions

GPT Actions cap each endpoint description at 300 characters
([OpenAI production notes](https://developers.openai.com/api/docs/actions/production)),
and six descriptions in the canonical `https://mcp.tempguru.co/openapi.json`
are longer. Do not import that URL. Paste the GPT copy instead:

1. Regenerate it: `node distribution/assistants/build-gpt-actions-schema.mjs`.
   It writes [chatgpt-actions-openapi.json](./chatgpt-actions-openapi.json):
   the canonical spec with those six descriptions shortened and the
   monitor-only health operation removed. It fails if any description is over
   a limit.
2. In the editor, open the existing action (or **Create new action**) and
   replace the whole **Schema** box with that file's contents.
3. Authentication: **None**. Privacy policy: `https://tempguru.co/privacy-policy`.
4. Check that the editor shows no schema errors and lists nine operations,
   with `submitQuoteRequest` as the only POST.

### Category

**Productivity** (closest fit; there is no events category).

---

## Pre-publish test script

Run these in Preview; all nine must pass before publishing:

1. "What do brand ambassadors cost in Boston?" → calls `getRolePricing`,
   answers $56-65/hr all-inclusive, labels it a planning estimate.
2. "Can you staff an event in London?" → declines, US/Canada only, no form link.
3. "I need 6 registration staff + 2 team leads in Chicago March 12, 8-hour
   day. Budget?" → calls pricing for both roles, shows range math
   (6x$50-58x8 + 2x$70-85x8), offers to submit the quote request.
4. "Is tomorrow too late for ushers in a small market?" → calls
   `checkAvailability`, reports very-rush honestly, still offers to submit.
5. "Are your workers contractors?" → W-2 story, no competitor names.
6. "Submit a quote: [full plan + contact details]" → summarizes the plan,
   asks for explicit confirmation, then calls `submitQuoteRequest` exactly
   once (ChatGPT also shows its own confirm dialog, the operation is marked
   consequential). Use an obvious test payload (event name "TEST, please
   ignore", your own email) and delete the row from the Notion Inbound Deal
   Pipeline afterward.
7. "What are your cancellation and payment policies?" → calls
   `getPolicies`, relays only published claims, and preserves every
   coordinator-confirmation flag.
8. "Resume plan [a real saved plan ID from a test MCP plan]" → calls
   `getPlan` once and restores the saved non-PII plan; an unknown ID returns
   clean re-planning guidance rather than guessed details.
9. "What happened to quote [a real TG test reference]?" → calls
   `getQuoteStatus`, reports received/queued, and gives the fixed follow-up
   guidance without implying a quote has been sent.

---

## Ranking playbook (how this becomes the #1 event-staffing GPT)

Store rank is driven by name/description keyword match, conversation volume,
ratings, and builder verification. Honest levers, in priority order:

1. **Be the only one with live data.** Every other staffing GPT is a prompt
   wrapper. This one quotes real rates from a real API. The store cannot see
   that, but users can, and ratings + repeat usage follow.
2. **Send your own traffic first.** Link the GPT from tempguru.co/ai-agents, the
   /ai-instructions page, Quick Guides, email signatures, and LinkedIn. Store
   rank follows usage; usage starts off-store. GPT pages are indexed by
   Google, so the keyword-first name also wins normal SEO.
3. **Ask for the rating.** After a successful plan, the GPT's closing line
   can mention the rating control. Subtle, allowed, effective.
4. **Hold the name.** "Event Staffing Planner" is unclaimed category language.
   First mover with traction is hard to displace.
5. **Refresh quarterly.** Stale GPTs decay; re-upload knowledge after each
   data update and bump the description with new market counts.

Track conversions via the `utm_medium=chatgpt-gpt` parameter in GA4 and the
mcp.tempguru.co `/admin` telemetry (Actions traffic shows a distinct UA).
