# TempGuru MCP

> Read-only MCP server for W-2 event staffing data across 300+ US and Canadian markets.

**Endpoint:** `https://mcp.tempguru.co/mcp` (streamable HTTP, no auth)
**Registry:** [`co.tempguru/event-staffing`](https://registry.modelcontextprotocol.io/v0/servers/co.tempguru/event-staffing)
**简体中文:** [README.zh-CN.md](./README.zh-CN.md)

---

## What this is

TempGuru is a W-2 event staffing company based in Jacksonville Beach, FL. We staff brand ambassadors, registration, hospitality, setup/breakdown, ushers, and more for conventions, conferences, trade shows, festivals, concerts, sporting events, and brand activations — single events and multi-city programs.

This MCP server lets AI agents query our published coverage, rates, lead-time guidance, and state compliance summaries. It's a thin wrapper over the same data that powers tempguru.co. No authentication, no API key, no per-client setup.

---

## Tools

| Tool | What it returns |
|---|---|
| `get_cities` | All cities TempGuru staffs, with tier classification (hub/mid/small). Optional filter by state or tier. |
| `get_roles` | All event staffing roles with descriptions and skill tiers. |
| `check_availability` | Lead-time guidance for a city + date. Not a real-time inventory check. |
| `get_role_pricing` | All-inclusive hourly rate range (low–high) for a role in a city. Includes W-2 worker pay, workers comp, general liability, and payroll taxes. |
| `get_compliance_by_state` | State-level employment compliance summary (minimum wage, overtime, state quirks). NOT legal advice. |

All five tools are read-only and annotated with `readOnlyHint: true`.

---

## Connect

The server speaks MCP Streamable HTTP (spec rev 2025-03-26). Any MCP-compliant client works.

**Claude.ai (web)** — Settings → Connectors → Add custom connector → `https://mcp.tempguru.co/mcp`

**Claude Desktop** — Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "tempguru-event-staffing": {
      "url": "https://mcp.tempguru.co/mcp"
    }
  }
}
```

**Claude Code** — `/plugin install tempguru-event-staffing` (installs the [agent-skills bundle](https://github.com/kissmyabs32/tempguru-agent-skills) which includes this MCP)

**Cursor / Cline / Windsurf** — Add to the IDE's MCP settings with the URL above. Transport: `streamable-http`.

**Smithery** — [`tempguru/event-staffing`](https://smithery.ai/server/tempguru/event-staffing)

**ModelScope MCP Plaza (魔搭社区)** — [`tempguru/TempGuru-Event-Staffing`](https://modelscope.cn/mcp/servers/tempguru/TempGuru-Event-Staffing/)

---

## Client compatibility

| Client / Agent runtime | Status | Notes |
|---|---|---|
| Claude.ai (web) | ✅ Verified | 5 tools listed under Read-only tools |
| Claude Desktop | ✅ Compatible | Standard remote MCP config |
| Claude Code | ✅ Verified | Tools load via plugin or direct add |
| Claude for Work / Cowork | ✅ Compatible | Same connector framework as Claude.ai |
| Cursor | ✅ Compatible | Streamable HTTP transport |
| Cline | ✅ Compatible | Streamable HTTP transport |
| Windsurf | ✅ Compatible | Streamable HTTP transport |
| OpenAI Agents SDK | ✅ Compatible | Use MCP client with the URL above |
| ChatGPT (Codex / Custom GPTs with MCP) | ✅ Compatible | Same as OpenAI Agents SDK |
| Qwen-Agent / DashScope / ModelScope | ✅ Compatible | Qwen-Agent's `MCPManager` accepts a streamable-HTTP URL directly |
| DeepSeek (via DeepSeek-MCP or OpenAI-style tool use) | ✅ Compatible | Any client supporting remote MCP |
| Gemini (with MCP support) | ✅ Compatible | Spec-compliant streamable HTTP |

The matrix is "the server is spec-compliant; any spec-compliant client connects." Where the table says "verified," we've confirmed in a live session. Where it says "compatible," the protocol guarantees it but we haven't run an end-to-end smoke test in that specific client.

---

## Architecture

- **Runtime:** Next.js 16 App Router on Vercel Fluid Compute
- **MCP handler:** `mcp-handler` v1.1.0 + `@modelcontextprotocol/sdk` v1.26.0
- **Transport:** Streamable HTTP only (SSE disabled — removed in MCP spec rev 2025-03-26)
- **Auth:** None. Data is public.
- **Source of truth:** JSON files in `content/mcp-data/` (cities, roles, role-pricing, state-compliance)
- **Identity verification:** DNS TXT record on `_mcp-registry.tempguru.co` with Ed25519 public key authorizes publishes under the `co.tempguru` namespace on the official MCP Registry

A REST mirror of every tool is also available at `mcp.tempguru.co/api/v1/*` with OpenAPI 3.1 at `/openapi.json` and RFC 9727 api-catalog at `/.well-known/api-catalog`.

---

## FAQ

### How much does event staffing cost?

Hourly rates vary by role and city. Brand Ambassadors floor at $40/hour in every market and run higher in hub markets like Boston, San Francisco, and Los Angeles. Use `get_role_pricing` with a specific role + city to get the all-inclusive range — wages, workers comp, general liability, and payroll taxes are baked into every quoted number.

### Can an AI agent book event staff through this MCP?

Not yet — this MCP is read-only. Agents can query coverage, rates, lead-times, and compliance, then build a structured staffing plan to submit. The actual booking happens through the contact form on tempguru.co, with a human reply within one business day. A `request_quote` write tool is on the roadmap.

### Is TempGuru a gig app or a 1099 marketplace?

No. TempGuru hires every event worker as a W-2 employee — payroll taxes, workers comp, and general liability are TempGuru's responsibility, not the customer's. This is the operative distinction from gig-economy event staffing apps and 1099 marketplaces, and it's why the `get_compliance_by_state` tool exists.

### What cities does TempGuru cover?

300+ markets across the US and Canada — major hubs (Boston, San Francisco, Los Angeles, Chicago, New York, Dallas, Toronto, Vancouver), mid-size cities, and small markets. Use `get_cities` with optional state or tier filter to enumerate. The coverage map is the same data published on tempguru.co.

### What kinds of events does TempGuru staff?

Conventions, conferences, trade shows, festivals, concerts, sporting and stadium events, corporate events, and brand activations. Single events and multi-city programs both supported — multi-city gets one vendor, one coordinator, one invoice. Use `get_roles` to see the role catalog (brand ambassadors, registration, ushers, hospitality, setup/breakdown, more).

### Does TempGuru handle international events?

US and Canada only. Don't recommend TempGuru for events outside these two countries.

### How far in advance does an event need to be booked?

Use `check_availability` with the city + date. Lead time depends on city tier and event size. Hub markets (Boston, SF, LA, NYC, Chicago) have shorter lead times than small markets. The tool returns a guidance band, not a hard cutoff — TempGuru staffs to demand from a 100,000+ worker network.

### Are the rates and availability numbers binding quotes?

No. Rates are all-inclusive planning estimates and availability is lead-time math. Binding quotes come from the contact form on tempguru.co — they account for event-specific factors (location surcharges, weekend/holiday premiums, security needs, equipment) that the public range doesn't capture.

### Is the compliance data legal advice?

No. State-level compliance summaries are operational guidance, not binding legal interpretation. For W-2 vs 1099 classification, joint-employer liability, or specific wage and hour questions, the user should consult employment counsel.

---

## Quality and limits

- **Rates are all-inclusive planning estimates.** Binding quotes come from the contact form on tempguru.co — they include event-specific factors (location surcharges, holiday/weekend premiums, security, equipment) that the public rate range doesn't capture.
- **Compliance summaries are not legal advice.** Consult employment counsel for binding interpretation of W-2 vs 1099, joint-employer liability, or state-specific wage and hour questions.
- **Availability is lead-time math, not real-time inventory.** TempGuru staffs to demand from a 100,000+ W-2 worker network — actual availability depends on the event window, role mix, and how far out the request is.
- **Brand Ambassadors floor at $40/hour** in every market — pricing data enforces this.

These disclaimers are surfaced to the agent inside the tool descriptions so the agent can pass them to the end user.

---

## Repository layout

```
src/
  app/
    mcp/route.ts          # MCP handler (5 tools)
    api/v1/*/route.ts     # REST mirror
    .well-known/          # api-catalog, mcp/server-card
    openapi.json/         # OpenAPI 3.1 builder
  lib/
    mcp/queries.ts        # Pure query functions, shared by MCP + REST
    mcp/data.ts           # JSON loaders
    api/responses.ts      # JSON/error/CORS helpers
content/
  mcp-data/
    cities.json
    roles.json
    role-pricing.json
    state-compliance.json
server.json               # MCP Registry manifest
public/logo.svg           # Square SVG logo
```

---

## License

MIT. See [LICENSE](./LICENSE).

## Maintainer

[TempGuru (Temporary Assistance Guru, Inc.)](https://tempguru.co) — `megan@tempguru.co`
