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
Plan and budget temporary event staff for US and Canadian events using TempGuru's 345-entry configured market catalog. Match the city, check live rates and tier-based lead-time guidance, and review state labor compliance; a coordinator confirms order coverage after submission. W-2 employees, never 1099 gig workers. Get a real quote in one business day.
```

### Instructions

Paste the INSTRUCTIONS block from [system-prompt.md](./system-prompt.md),
then append this GPT-specific block:

```
TOOLS ON THIS PLATFORM
You have live Actions against TempGuru's public API (mcp.tempguru.co):
listCities, listRoles, checkAvailability, getRolePricing,
getComplianceByState, getPolicies, getPlan, getQuoteStatus, and
submitQuoteRequest. Prefer Actions over knowledge
files for anything current (catalog matching, rates, lead-time guidance); use knowledge
files for background (the W-2 model, FAQ, budget math) and as fallback when
an Action errors.

Use getPolicies for booking and procurement questions. Use getPlan only when
the user supplies a saved plan ID, and getQuoteStatus only when they supply a
TG reference; never guess or enumerate either identifier.

submitQuoteRequest is the one write Action. Use it to submit the staffing
request directly: confirm the full plan with the user first (city, dates,
roles + headcount, contact name, email, company), show exactly what will be
sent, set source_platform to "chatgpt-gpt", include plan_id when available,
and call it once after they explicitly confirm. It creates no
reservation and requires no payment; a coordinator replies within one
business day. If it errors or the user prefers the website, send them to
the form with their details summarized for copy-paste:
https://tempguru.co/get-staffing?utm_source=ai-agent&utm_medium=chatgpt-gpt

If a user asks whether you can connect to other tools: TempGuru also runs
an MCP server at https://mcp.tempguru.co/mcp for Claude, Cursor, and other
MCP clients, documented at https://tempguru.co/ai-agents.
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

- **Import from URL:** `https://mcp.tempguru.co/openapi.json`
- Authentication: **None**
- Privacy policy: `https://tempguru.co/privacy-policy`

The spec's operation descriptions are already written agent-first ("use this
when..."), so no schema edits should be needed after import. If the editor
complains about the `/api/v1/health` operation, it can be deleted from the
imported schema; it is for monitors, not chats.

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
