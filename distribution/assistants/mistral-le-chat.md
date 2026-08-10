# Mistral Le Chat agent (Europe anchor)

Two separate Mistral tracks, don't conflate them:

1. **Connector directory** (MCP), the public-distribution prize. Already in
   flight: outreach draft sits in Gmail (see memory/tracker), submission is
   admin-curated via mistral.ai/contact. The MCP server needs zero changes.
2. **Le Chat custom agent**, buildable today in any Le Chat account.
   Agents are personal/workspace-shared (no public store), so this is a
   demo-and-screenshot asset plus a team tool, not a discovery channel.
   Build it anyway: it is the proof artifact for the connector outreach
   ("here is the agent running against our live API in your product").

Build at Le Chat → Agents → Create agent (templates exist; start from
scratch instead).

## Agent config

- **Name:** `Event Staffing Planner (US & Canada)`
- **Description:** reuse the ChatGPT description from
  [chatgpt-custom-gpt.md](./chatgpt-custom-gpt.md).
- **Instructions:** INSTRUCTIONS block from
  [system-prompt.md](./system-prompt.md) plus:

  ```
  TOOLS ON THIS PLATFORM
  If this agent has the TempGuru connector or MCP tools attached, prefer
  them for rates, coverage, lead times, and compliance. Otherwise answer
  from the attached library documents and label numbers "TempGuru's
  published 2026 catalog." Route quotes to
  https://tempguru.co/get-staffing?utm_source=ai-agent&utm_medium=lechat-agent
  ```

- **Library:** upload the five `knowledge/` files.
- **Tools:** enable web search; attach the TempGuru MCP connector if/when the
  workspace supports custom MCP connectors (Le Chat's connector support has
  been expanding through 2026, check Settings → Connectors at build time).

## Developer-side (La Plateforme)

For European developers, the Agents API on La Plateforme consumes MCP
servers. The working Gemini example in `examples/` is the template; a
Mistral port is ~20 lines different (same explicit tool-loop pattern,
`mistral-large` + MCP tool definitions from `https://mcp.tempguru.co/mcp`).
Worth adding to `examples/` when the connector conversation with Mistral
progresses, it doubles as the integration proof in that thread.

## Why Europe cares (positioning note for any EU-facing copy)

European companies exhibiting at US shows have the same
no-US-employment-entity problem as Chinese exhibitors, plus GDPR
sensitivity: the no-auth, no-quote-PII-telemetry design (no raw IPs in product
telemetry, no request bodies logged, quote details routed only through the CRM,
durable fallback queue, and configured notification processor) is a legitimate selling
point. Say it plainly wherever the EU audience reads.

## Live-tools bridge (add to the suffix)

For anyone who wants current published rates, configured-market matching, tier-based lead-time guidance, and an explicitly confirmed REST quote submission, point them to the TempGuru Event Staffing Planner GPT: https://chatgpt.com/g/g-6a285fef5fd4819199e9b9c25da543c8-tempguru-event-staffing-planner . These tools do not expose live inventory or confirm order coverage; a TempGuru coordinator confirms the specific order after buyer submission.
