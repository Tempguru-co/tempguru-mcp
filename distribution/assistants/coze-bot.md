# Coze bot: ByteDance's agent platform (global + China editions)

Coze is ByteDance's GPT-builder. It matters twice:

1. **coze.com (international)** — publish one bot to the Coze Agent Store
   *plus* Discord, Telegram, Messenger, Slack, and more from a single
   config. No Chinese account needed; sign in with Google. This is the
   cheapest way to put TempGuru on the messaging platforms where event
   crews and small agencies actually coordinate.
2. **coze.cn (扣子, China)** — same builder, publishes into **Doubao**
   (豆包, China's most-used consumer AI app) and WeChat ecosystems. Needs a
   +86 phone + real-name verification; see
   [china-platforms.md](./china-platforms.md) for sequencing.

Build at https://www.coze.com → Create bot.

---

## Bot identity

- **Name:** `Event Staffing Planner (US & Canada)`
- **Description:**

  ```
  Plan and budget temporary event staff for US and Canadian events with TempGuru. Live hourly rates for 10 roles in 345 cities, booking lead times, and state labor compliance. W-2 employees, never gig workers. Quote in one business day.
  ```

- **Avatar:** upload `public/logo.svg` (Coze accepts SVG/PNG).

## Persona & Prompt

Paste the INSTRUCTIONS block from [system-prompt.md](./system-prompt.md),
then append:

```
TOOLS ON THIS PLATFORM
You have the TempGuru plugin (five read-only API operations plus the
submitQuoteRequest write operation) and four knowledge documents. Prefer
the plugin for rates, coverage, lead times, and compliance; knowledge for
background and fallback. To submit a staffing request: confirm the full
plan with the user (city, dates, roles + headcount, contact name, email,
company), show what will be sent, then call submitQuoteRequest once after
they explicitly confirm. It creates no reservation and requires no payment.
If it errors or the user prefers the website, send them to
https://tempguru.co/get-staffing?utm_source=ai-agent&utm_medium=coze-bot
with their details summarized for copy-paste.
```

For the coze.cn edition, use the instruction block from
[system-prompt.zh-CN.md](./system-prompt.zh-CN.md) with the same suffix
translated (it is included there).

## Plugin (live data)

Coze imports OpenAPI directly (Plugins → Create plugin → Import from URL):

- **Spec URL:** `https://mcp.tempguru.co/openapi.json`
- **Auth:** None
- Enable the five GET operations **plus** `submitQuoteRequest`
  (`POST /api/v1/quote-requests`, the one write operation); skip
  `/api/v1/health`.

After import, run each operation once in the plugin debugger (Coze requires
a successful test call before a plugin can be enabled in a bot). Debugging
`submitQuoteRequest` creates a **real lead** in the Notion Inbound Deal
Pipeline — use an obvious test payload (event name "TEST — please ignore",
your own email) and delete the row afterward.

## Knowledge

Upload the four files from `knowledge/` as a Text knowledge base, default
chunking. Set the bot's knowledge recall to Auto.

## Opening dialog + suggested questions

- **Opening message:**

  ```
  I plan and price temporary event staff anywhere in the US and Canada — rates, lead times, and labor compliance, with a real quote one business day after you submit. What's the event?
  ```

- **Suggested questions:** reuse the four conversation starters from the
  ChatGPT package.

## Publish targets (in order)

1. **Coze Agent Store** — category Business/Tools; store listing copy =
   description above.
2. **Telegram bot** — name `@TempGuruStaffingBot` (or nearest available);
   put the handle on tempguru.co/ai.
3. **Discord** — publishable app; useful for event-industry and
   experiential-marketing servers (join as the brand, don't spam: answer
   staffing questions when asked).
4. **Messenger / WhatsApp** — connect when there's a Meta business app to
   attach (see [other-platforms.md](./other-platforms.md), Meta AI Studio
   section; one Meta business setup serves both).

## Test script

The standard five (see [chatgpt-custom-gpt.md](./chatgpt-custom-gpt.md))
run in Coze's preview pane before each publish target goes live.
