# TempGuru event staffing plugin

TempGuru plans temporary W-2 event staff across 300+ U.S. and Canadian markets: registration, brand ambassadors, hospitality, ushers, crowd control, setup/breakdown crews, and team leads for conventions, trade shows, festivals, concerts, sporting events, corporate events, and brand activations. This plugin lets Claude turn an event brief into a staffing plan with roles, headcount, all-inclusive hourly rate ranges, tier-based lead-time guidance, and state or provincial compliance notes. It then hands the buyer a prefilled TempGuru quote form to review and submit personally.

Totals are planning estimates, not binding quotes. Lead-time guidance is not a reservation. Compliance notes are operational guidance, not legal advice. A TempGuru coordinator confirms coverage and issues any binding quote after the buyer submits the form.

## What it contains

- **MCP server** (`.mcp.json`): the remote TempGuru Event Staffing server at `https://mcp.tempguru.co/mcp`, over Streamable HTTP. It needs no account, API key, or credentials.
- **8 skills** (`skills/`): event staffing ordering, compliance, staffing plans built from event documents (RFP, BEO, run of show), urgent backfill, multi-city activations, procurement and vendor onboarding, staffing-agency partnering, and operations-tooling inquiries from staffing companies.
- **1 command** (`commands/staff-event.md`): `/staff-event [city, date, roles and headcount]` walks through the planning flow.

The plugin runs no hooks, scripts, local servers, or package installs.

## What it sends and where

The only network destination is TempGuru's own server at `mcp.tempguru.co`, which TempGuru owns and operates. The `?source=claude-code` query parameter on the server URL is a fixed channel label for aggregate usage counts.

- Tool calls send event planning details: city, date, event type, roles, headcount, and hours. Ten of the 12 tools are read-only.
- `plan_staffing` and `save_staffing_plan` may save the plan for about 30 days so it can be resumed. Saved plans exclude names, email addresses, phone numbers, companies, and free-text contact details.
- `request_quote` accepts only a saved plan ID plus optional fixed attribution labels. It returns a link to a form on `https://mcp.tempguru.co/request-quote`. It does not collect or transmit contact details, and it does not create a lead.
- The buyer opens that form, reviews the plan, enters their own contact details, and submits it. Only that website submission creates a lead and a TG reference.

The skills tell Claude not to collect contact details in chat. When the MCP tools are unavailable, they give the user links instead: the web form at `https://tempguru.co/get-staffing`, TempGuru's email and phone, and TempGuru's Event Staffing Planner GPT on chatgpt.com. Claude does not call any of those.

## Privacy and support

- Privacy policy: https://tempguru.co/privacy-policy
- Documentation: https://tempguru.co/ai-agents
- Support: megan@tempguru.co or (904) 206-8953

TempGuru is Temporary Assistance Guru, Inc. On U.S. orders, workers are W-2 employees of the assigned vetted local partner agency. Canadian orders are employed locally under Canadian rules.

## License

MIT. See the `license` field in `.claude-plugin/plugin.json` and the repository `LICENSE`.
