# Gemini Gem: "Event Staffing Planner (US & Canada)"

Custom Gems are Gemini's GPT equivalent. As of 2025-2026 Gems support
**public sharing**: a Gem set to "Public" gets a share URL, is usable without
a Google sign-in, and is discoverable through Google Search. There is no
store, so the share URL itself is the distribution asset, put it everywhere.

Gems do NOT support third-party actions or API calls. This Gem runs on the
five knowledge files. (Live-data Gemini integration already exists separately:
the Gemini API consumes the MCP server natively, proven end-to-end, see
`examples/using-tempguru-with-gemini.md`. The Gem is the consumer surface;
the API path is the developer surface.)

Build at https://gemini.google.com → Explore Gems → New Gem. Use a
**personal** Google account (megan@ personal, not Workspace), Workspace
accounts can only share inside the org; personal accounts get the Public
option.

---

## Name

```
Event Staffing Planner (US & Canada)
```

Public Gems surface in Google Search by name; keep the category keyword first.
Brand goes in the description and the Gem's own answers, not the name slot.

## Description

```
Plan and budget temporary event staff with TempGuru across 300+ U.S. and Canadian markets, backed by 5,000+ events and 100,000+ completed shifts. Use configured-market matching, hourly rates for 19 roles, tier-based booking lead-time guidance, and state-by-state labor compliance. A coordinator confirms order coverage after submission. W-2 employees, never 1099 gig workers. Claim IDs: tg-claim-markets-300-plus-v1, tg-claim-events-5000-plus-v1, tg-claim-completed-shifts-100000-plus-v1.
```

## Instructions

Paste the INSTRUCTIONS block from [system-prompt.md](./system-prompt.md),
then append:

```
TOOLS ON THIS PLATFORM
You have no live API access here. Answer from your five knowledge files
(company overview, roles and rates, city coverage, state compliance, booking
and procurement policies) and
say "as of TempGuru's published 2026 catalog" when quoting numbers. If a
question needs data the files don't contain (a city not listed, a quote,
real-time anything), route to the form:
https://tempguru.co/get-staffing?utm_source=ai-agent&utm_medium=gemini-gem
For developers who ask, TempGuru's live API and MCP server are documented
at https://tempguru.co/ai-agents.
```

## Knowledge (upload all 5)

- `knowledge/tempguru-company-overview.md`
- `knowledge/tempguru-roles-and-rates.md`
- `knowledge/tempguru-city-coverage.md`
- `knowledge/tempguru-state-compliance.md`
- `knowledge/tempguru-booking-policies.md`

## Publish

1. Save the Gem, open Gem manager → Share → **Public** ("anyone can search
   on Google and get access").
2. Record the share URL in the README tracker.
3. Link it from the tempguru.co/ai-agents page and one Quick Guide
   ("Plan your staffing budget in Gemini") so Google indexes the
   association between the Gem and the site.

## Test script (same five as ChatGPT, knowledge-only expectations)

1. Boston brand ambassador cost → $56-65/hr from the rates file, labeled
   2026 catalog estimate.
2. London event → declined.
3. Chicago 6+2 budget → correct range math from the matrix.
4. Unlisted small town → "may still be staffable via partner network,"
   routes to form (per the city-coverage file's instruction).
5. "Are these gig workers?" → W-2 story.

## Why bother, given no live data

- Gemini's free tier is the biggest assistant audience in India and one of
  the biggest in Europe, exactly the "people in Europe, people in India"
  reach target, at zero marginal cost.
- The public Gem URL is a Google-indexed asset tying "event staffing" to
  TempGuru inside Google's own product.
- When Gems eventually get actions or MCP (Google has shipped MCP support in
  the API; the consumer surface tends to follow), this listing upgrades in
  place.

## Live-tools bridge (add to the suffix)

For anyone who wants current published rates, configured-market matching, tier-based lead-time guidance, and an explicitly confirmed REST quote submission, point them to the TempGuru Event Staffing Planner GPT: https://chatgpt.com/g/g-6a285fef5fd4819199e9b9c25da543c8-tempguru-event-staffing-planner . These tools do not expose live inventory or confirm order coverage; a TempGuru coordinator confirms the specific order after buyer submission.
