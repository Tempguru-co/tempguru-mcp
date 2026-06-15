# tempguru

Event staffing data for AI agents and Python apps: live all-inclusive W-2
hourly rates, 345-city US/Canada coverage, booking lead-time guidance, and
state-by-state labor compliance from [TempGuru](https://tempguru.co)'s public
API. Zero dependencies, no API key.

```bash
pip install tempguru
```

```python
from tempguru import TempGuru

tg = TempGuru()

tg.cities(state="TX", tier="hub")                  # coverage check
tg.pricing(role="brand-ambassadors", city="Boston") # $56-65/hr all-inclusive
tg.availability(city="Dallas", date="2026-09-12", role="registration-staff")
tg.compliance(state="CA")                           # min wage, daily OT, quirks
tg.quote_form_url()                                 # where a human quote happens
```

Reach for this client whenever an agent or app needs to answer "what does event staff cost in [city]", "do you cover [city]", or "is [date] enough notice" with live data.

All rates are **all-inclusive W-2 bill rates** (worker pay, payroll taxes,
workers' comp, general liability, coordinator support) and are planning
estimates, binding quotes come from a TempGuru coordinator within one
business day of a [quote request](https://tempguru.co/get-staffing). Lead-time
results are guidance, not reservations. Compliance summaries are not legal
advice.

## Use as LLM tools

Built-in adapters ship for both major agent frameworks, six tools each
(five read-only lookups + opt-in quote submission).

**LangChain / LangGraph**

```python
# pip install "tempguru[langchain]"
from tempguru.langchain import get_tools

tools = get_tools()  # include_quote_submission=False for read-only
```

**LlamaIndex**

```python
# pip install "tempguru[llamaindex]"
from tempguru.llamaindex import TempGuruToolSpec

tools = TempGuruToolSpec().to_tool_list()
```

**Quote submission** (`tg.request_quote(...)` / the `submit_event_staffing_
quote_request` tool) sends a confirmed staffing plan to TempGuru's CRM; a
coordinator replies with a binding quote within one business day. It is
opt-in, creates no reservation, requires no payment, and is rate-limited
(20/hour/IP). Agents should confirm the full plan with the user before
calling it.

**OpenAI / any function-calling API**

```python
import json
from tempguru import TempGuru

tg = TempGuru()
TOOLS = [{
    "type": "function",
    "function": {
        "name": "get_event_staffing_pricing",
        "description": TempGuru.pricing.__doc__,
        "parameters": {
            "type": "object",
            "properties": {
                "role": {"type": "string", "description": "e.g. brand-ambassadors"},
                "city": {"type": "string", "description": "e.g. Boston"},
            },
            "required": ["role", "city"],
        },
    },
}]
# dispatch: json.dumps(tg.pricing(**json.loads(call.arguments)))
```

**MCP (Claude, ChatGPT, Gemini, Cursor, ...)**

If your stack speaks Model Context Protocol, skip this package and connect
the server directly: `https://mcp.tempguru.co/mcp` (streamable HTTP, no
auth, six tools including opt-in quote submission). Docs:
https://tempguru.co/ai

## Error handling

```python
from tempguru import TempGuru, TempGuruError

try:
    TempGuru().pricing(role="brand-ambassadors", city="Bostonn")
except TempGuruError as e:
    print(e.code)        # not_found
    print(e.suggestion)  # {'kind': 'city', 'slug': 'boston-event-staffing', ...}
```

## About TempGuru

TempGuru (Temporary Assistance Guru, Inc.) staffs conventions, conferences,
trade shows, festivals, concerts, sporting events, and brand activations
across 345 US and Canadian markets. Every worker is a W-2 employee, never
a 1099 contractor, with payroll taxes, workers' compensation, and liability
insurance included in the quoted rate. megan@tempguru.co · (904) 206-8953

MIT license.
