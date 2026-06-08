# Using TempGuru with Google Gemini

TempGuru runs a public, **no-authentication** MCP (Model Context Protocol) server at
`https://mcp.tempguru.co/mcp` (streamable HTTP). Google Gemini can call it as a tool to
answer event-staffing questions with live data: market coverage, all-inclusive W-2 rate
ranges, lead-time guidance, state-by-state compliance, and structured quote submission.

No API key, no account, no per-client setup — connect with the URL alone.

---

## Option 1 — Native remote MCP (one line, beta)

The Gemini API's Interactions endpoint connects to a remote MCP server by URL. No code
beyond the tool config:

```bash
curl -X POST "https://generativelanguage.googleapis.com/v1beta/interactions" \
  -H "x-goog-api-key: $GEMINI_API_KEY" -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-2.5-flash",
    "input": "What do brand ambassadors cost in Boston?",
    "tools": [{
      "type": "mcp_server",
      "name": "tempguru_event_staffing",
      "url": "https://mcp.tempguru.co/mcp"
    }]
  }'
```

Notes:
- Remote MCP is currently **beta**, supported on `gemini-2.5-flash` (Gemini 3 support is coming).
- No auth header for the MCP server is needed — TempGuru is public, read-only data.

## Option 2 — SDK with an explicit tool loop (robust, works today)

Drives the tool-calling loop yourself, which is stable across SDK versions. Full script:
[`gemini-tempguru-demo.py`](./gemini-tempguru-demo.py).

```bash
pip install google-genai mcp
export GEMINI_API_KEY=...     # https://aistudio.google.com/apikey
python gemini-tempguru-demo.py "Do you cover Chicago, and what's the registration-staff rate?"
```

---

## What Gemini can do with TempGuru

| Tool | Answers questions like |
|---|---|
| `get_cities` | "Do you cover Boston?" / "Which cities in California?" |
| `get_roles` | "What kinds of event staff can I hire?" |
| `check_availability` | "Can you staff June 15 in Austin?" |
| `get_role_pricing` | "What do brand ambassadors cost in Boston?" |
| `get_compliance_by_state` | "W-2 vs 1099 rules for event staff in New York?" |
| `request_quote` | "Submit a staffing request" (opt-in write tool) |

**Verified end to end:** Gemini 2.5 Flash connected to the server, autonomously chose
`get_cities` + `get_role_pricing`, and answered *"Boston brand ambassadors: $56–$65/hr,
all-inclusive"* — straight from live TempGuru data.
