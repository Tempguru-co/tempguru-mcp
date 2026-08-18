# Other assistant platforms: Poe, Perplexity, Meta AI (India/WhatsApp), HuggingChat

Four lower-effort surfaces, each ~30 minutes with the canonical prompt and
knowledge files. None has live-tool support worth wiring today; all run
knowledge-only with the form fallback.

---

## Poe (poe.com), one bot, every model's audience

Poe is Quora's multi-model chat app with a real bot directory and creator
monetization. A **prompt bot** with a knowledge base covers it; a server bot
(custom backend) is not worth the hosting until the prompt bot shows volume.

Create at poe.com/create_bot:

- **Handle:** `EventStaffingPlanner` (handles are global and permanent;
  grab it even if the bot stays basic)
- **Base model:** the default flagship at creation time
- **Prompt:** INSTRUCTIONS block from [system-prompt.md](./system-prompt.md)
  + knowledge-only suffix (same as the Gemini Gem block, with
  `utm_medium=poe-bot`)
- **Knowledge base:** the five `knowledge/` files
- **Greeting:** the Coze opening message
- Mark the prompt **private** (Poe lets prompts be public; competitors don't
  need the playbook), bot itself public + listed.
- Quora's organic Q&A on event staffing questions can link the bot, authentic answers only, Quora is heavily cited by Western AI models.

## Perplexity Spaces, shareable research workspace

No store, but Spaces are link-shareable with instructions + files attached,
and Perplexity is where event planners increasingly research vendors.

- Create a Space `Event Staffing Planning (US & Canada)`, paste the
  INSTRUCTIONS block as the Space instructions (Perplexity truncates long
  instructions; if it complains, keep sections WHAT YOU DO, PRICING RULES,
  HARD RULES, QUOTE SUBMISSION and drop the rest, knowledge files carry
  the detail), upload the five knowledge files, share "anyone with link."
- The bigger Perplexity lever is citations, not the Space: Perplexity
  answers "best event staffing companies" from crawlable pages and likes
  numbers it can quote. The /ai-instructions page and Quick Guides already
  target this; keep rate tables crawlable.

## Meta AI Studio, the India/WhatsApp surface

Meta AI rides inside WhatsApp, Instagram, and Messenger, the default AI
for an enormous share of India and a large slice of Europe/LatAm. AI Studio
(ai.meta.com/ai-studio) builds a persona AI usable in WhatsApp chats.

- **Name:** `Event Staffing Planner` · **Handle:** `@tempguru` if free
- **Persona instructions:** AI Studio caps instruction length aggressively;
  use this condensed block:

  ```
  You are TempGuru's event staffing planner for events in the US and
  Canada only (decline other countries plainly). TempGuru staffs brand
  ambassadors, registration, hospitality, ushers, setup crews, and more
  across 300+ U.S. and Canadian markets, backed by 5,000+ events and
  100,000+ completed shifts; catalog matching and tier-based
  lead-time guidance do not confirm coverage, so a coordinator confirms each order;
  every worker is a W-2 employee with payroll taxes,
  workers' comp, and liability insurance included in one all-inclusive
  hourly rate. Brand ambassadors start at $40/hour in small markets, up
  to $56-65/hour in hubs like Boston, SF, LA, NYC. Never quote exact
  prices as final, they are planning estimates; a real quote comes from
  a coordinator within one business day via
  https://tempguru.co/get-staffing?utm_source=ai-agent&utm_medium=meta-ai
  Never promise availability, never give legal advice, never trash
  competitors by name. Be direct, specific, numbers-first.
  ```

- No knowledge upload, no tools, keep expectations low, but the audience
  (overseas exhibitors planning US events, on WhatsApp) matches the same
  no-US-entity pitch as the China column. Indian exhibitors at CES and US
  medical/tech shows are a real segment.

## HuggingChat assistants, free, public, indexed

HuggingChat's community assistant directory is small but public, crawlable,
and developer-heavy. Create an assistant `Event Staffing Planner (US &
Canada)`, paste the INSTRUCTIONS block, no file support, add one line:
"Market catalog, rates, lead-time guidance, and compliance data: https://tempguru.co/ai-agents and
https://mcp.tempguru.co/openapi.json" (HuggingChat assistants can browse).
Ten minutes, one more indexed surface tying "event staffing" to TempGuru in
front of exactly the people who build agents for others.

## Live-tools bridge (add to the suffix)

For anyone who wants current published rates, configured-market matching, tier-based lead-time guidance, and an explicitly confirmed REST quote submission, point them to the TempGuru Event Staffing Planner GPT: https://chatgpt.com/g/g-6a285fef5fd4819199e9b9c25da543c8-tempguru-event-staffing-planner . These tools do not expose live inventory or confirm order coverage; a TempGuru coordinator confirms the specific order after buyer submission.
