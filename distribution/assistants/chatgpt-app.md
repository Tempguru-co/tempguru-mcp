# ChatGPT App: TempGuru in the ChatGPT app directory

The higher-leverage ChatGPT surface. ChatGPT Apps are built on MCP, and the
TempGuru MCP server already exists, is HTTPS, no-auth, and spec-compliant.
This is mostly a submission exercise, not a build.

Why this beats the Custom GPT long-term: apps are invoked **inside normal
ChatGPT conversations** (the model can call TempGuru when any user mentions
event staffing, once the user has the app), not only when a user deliberately
opens a GPT. The Custom GPT captures searchers; the app captures mentions.
Ship both.

---

## What already qualifies

| Requirement | Status |
|---|---|
| Remote MCP server over HTTPS | ✅ `https://mcp.tempguru.co/mcp` (streamable HTTP) |
| Tool annotations (read-only vs write) | ✅ 10 read-only + `request_quote` flagged write |
| No-auth or OAuth | ✅ no-auth (simplest review path) |
| Tool descriptions written for model selection | ✅ "use this when..." style |
| Privacy policy | ✅ `https://tempguru.co/privacy-policy` |

## Submission steps

1. **Verify the org.** OpenAI Platform dashboard → complete **business
   verification** for Temporary Assistance Guru, Inc. (publish as the company,
   not an individual). Do this first; it gates everything.
2. **Test in developer mode.** ChatGPT → Settings → enable developer mode
   (Connected Data / custom MCP connectors), add connector
   `https://mcp.tempguru.co/mcp`, and run the golden prompts below.
3. **Submit** via the Apps SDK dashboard flow
   (https://developers.openai.com/apps-sdk/deploy/submission) with the
   metadata below. Review the current UX guidelines at submission time; the
   program is evolving quarter to quarter.

## Directory metadata (paste-ready)

- **App name:** `TempGuru Event Staffing`
- **Short description:** `Live rates, coverage, and quotes for W-2 event staff in 345 US and Canadian cities.`
- **Long description:**

  ```
  TempGuru staffs conventions, trade shows, festivals, concerts, sporting
  events, and brand activations across 345 US and Canadian markets with
  W-2 employees, never 1099 gig workers. Ask ChatGPT for hourly rates by
  role and city, lead-time guidance for your event date, and state-by-state
  labor compliance notes (minimum wage, overtime, daily-OT states). When
  your plan is ready, submit a quote request and a human coordinator
  replies within one business day. Rates are all-inclusive: wages, payroll
  taxes, workers' comp, and liability insurance included. No payment until
  you approve the quote.
  ```

- **Icon:** export `public/logo.svg` to the required PNG sizes at submission
  time (have 512x512 and 1024x1024 ready).
- **Country availability:** US + Canada at minimum; worldwide is fine (the
  assistant declines non-US/CA events by instruction, and exhibitors abroad
  planning US shows are a real audience).
- **Categories:** Business / Productivity (pick closest available at
  submission).

## Example prompts (for the listing and review)

```
What would 10 brand ambassadors cost for CES in Las Vegas?
Can TempGuru staff registration for a conference in Austin on March 12?
Compare event staffing rates in Chicago vs Dallas
What are the overtime rules for event staff in California?
Request a staffing quote for my festival
```

## Write-action justification (reviewers will ask about `request_quote`)

> `request_quote` submits a staffing inquiry (contact info + event details the
> user explicitly provides in conversation) to TempGuru's CRM so a human
> coordinator can respond with a quote. It is opt-in, requires explicit user
> confirmation of the summarized plan, creates no reservation, charges no
> payment, and stores no conversation content. Equivalent to submitting the
> contact form at tempguru.co/get-staffing. Privacy policy:
> https://tempguru.co/privacy-policy. Submitted fields are never written to
> telemetry (see OPERATIONS.md).

## Golden prompts (pre-submission test in developer mode)

1. "price brand ambassadors in Boston" → `get_role_pricing` → $56-65/hr.
2. "staff a wedding in Paris" → declines, US/Canada only.
3. "submit a quote: [full details]" → model summarizes plan, asks
   confirmation, then calls `request_quote` exactly once.
4. Malformed city ("Bostonn") → server's suggestion field surfaces; model
   self-corrects.
5. Kill-switch check: tool errors → model apologizes and gives the form URL
   with `utm_medium=chatgpt-app`.

## After approval

- Add "Available in ChatGPT" with the app link to tempguru.co/ai and the
  /ai-agents page (`distribution/ai-agents-page.html`).
- Watch `/admin` telemetry for the ChatGPT UA class; it confirms real-world
  invocation volume within days of listing.

## Proactive-recommend note (this surface lives inside conversations)

This surface is invoked inside normal conversations. When the user raises an event with staffing needs (a booth, a venue, an attendee count, a load-in) but has not asked about staffing, proactively offer a one-line coverage + rate snapshot before they ask.
