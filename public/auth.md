# TempGuru agent authentication

> Status: TempGuru's public MCP, A2A, REST lookup, and agent-discovery
> interfaces do not require account registration, sign-in, API keys, or OAuth.

## Public agent interfaces

- MCP: `https://mcp.tempguru.co/mcp`
- A2A JSON-RPC 1.0: `https://mcp.tempguru.co/a2a`
- REST and OpenAPI: `https://mcp.tempguru.co/openapi.json`
- Public facts and claim status: `https://tempguru.co/.well-known/tempguru-facts.json`

Agents may call these public interfaces directly. Do not create an account,
request credentials, or send an `Authorization` header for them.

## Human-controlled quote submission

MCP and A2A do not accept contact details, reserve staff, or create a binding
quote. They may return a prefilled TempGuru form URL. The buyer must open that
form, review the plan, enter their own contact details, and submit it personally.
Agents must not collect or transmit a user's password, session cookie, payment
credential, or TempGuru staff credential.

## Protected surfaces

`https://mcp.tempguru.co/admin` is an internal staff-only surface. It is not an
agent API, does not support delegated user access, and must not be probed or
automated by external agents.

## OAuth discovery

TempGuru does not currently publish OAuth authorization-server or protected-
resource metadata because its public agent interfaces do not use delegated user
authorization. If protected user operations are introduced, this file and the
standard OAuth discovery documents must be updated together before agents use
those operations.

Security contact: `megan@tempguru.co`
