#!/usr/bin/env python3
"""
Demo: use TempGuru's event-staffing MCP server as a tool inside Google Gemini.

TempGuru runs a public, no-auth, streamable-HTTP MCP server at
https://mcp.tempguru.co/mcp with tools for market coverage, all-inclusive W-2
rate ranges, lead-time guidance, and state-by-state compliance. This script
wires those tools into Gemini and lets the model call them to answer a real
event-staffing question with live data.

Setup:
    python3 -m venv .venv && source .venv/bin/activate
    pip install google-genai mcp
    export GEMINI_API_KEY=...        # get one at https://aistudio.google.com/apikey

Run:
    python gemini-tempguru-demo.py
    python gemini-tempguru-demo.py "What do registration staff cost in Chicago?"

Notes:
    - Uses gemini-2.5-flash. Remote MCP is in beta; Gemini 3 support is coming.
    - This drives the tool-calling loop explicitly (list tools -> let Gemini
      pick -> call the MCP tool -> feed the result back -> final answer).
      Google's one-line native "mcp_server" tool type does the same thing.
"""
import asyncio
import os
import sys

from google import genai
from google.genai import types
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

MCP_URL = "https://mcp.tempguru.co/mcp"
MODEL = "gemini-2.5-flash"
# Read-only catalog lookups. request_quote is also read-only, but it requires a
# saved plan_id and returns a buyer-operated form, so it is outside this
# pricing-and-coverage demo.
READ_TOOLS = {
    "get_cities", "get_roles", "check_availability",
    "get_role_pricing", "get_compliance_by_state",
}
_GEMINI_KEYS = {"type", "description", "properties", "items", "required", "enum", "nullable"}


def to_gemini_schema(schema):
    """Recursively drop JSON-Schema keys that Gemini's function schema rejects
    (e.g. exclusiveMinimum, additionalProperties, $schema)."""
    if not isinstance(schema, dict):
        return {"type": "object"}
    out = {}
    for k, v in schema.items():
        if k not in _GEMINI_KEYS:
            continue
        if k == "properties" and isinstance(v, dict):
            out[k] = {pk: to_gemini_schema(pv) for pk, pv in v.items()}
        elif k == "items" and isinstance(v, dict):
            out[k] = to_gemini_schema(v)
        else:
            out[k] = v
    out.setdefault("type", "object")
    return out


async def ask(question: str):
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        sys.exit("Set GEMINI_API_KEY (get one at https://aistudio.google.com/apikey)")

    client = genai.Client(api_key=api_key)
    async with streamablehttp_client(MCP_URL) as (read, write, _):
        async with ClientSession(read, write) as session:
            await session.initialize()
            tools = (await session.list_tools()).tools
            decls = [
                types.FunctionDeclaration(
                    name=t.name,
                    description=(t.description or "")[:700],
                    parameters=to_gemini_schema(t.inputSchema),
                )
                for t in tools if t.name in READ_TOOLS
            ]
            cfg = types.GenerateContentConfig(
                temperature=0, tools=[types.Tool(function_declarations=decls)]
            )
            contents = [types.Content(role="user", parts=[types.Part(text=question)])]

            # Agentic loop: let Gemini call TempGuru tools (possibly across several
            # rounds) until it produces a text answer instead of another tool call.
            for _ in range(8):
                r = await client.aio.models.generate_content(model=MODEL, contents=contents, config=cfg)
                turn = r.candidates[0].content
                calls = [p.function_call for p in turn.parts if getattr(p, "function_call", None)]
                if not calls:
                    answer = "".join(p.text for p in turn.parts if getattr(p, "text", None))
                    print("\n" + answer.strip())
                    return
                print("Gemini called:", [(c.name, dict(c.args)) for c in calls])
                contents.append(turn)
                results = []
                for c in calls:
                    res = await session.call_tool(c.name, dict(c.args))
                    text = res.content[0].text if res.content else "{}"
                    results.append(types.Part.from_function_response(name=c.name, response={"result": text[:4000]}))
                contents.append(types.Content(role="user", parts=results))
            print("(stopped after the maximum number of tool rounds)")


if __name__ == "__main__":
    q = sys.argv[1] if len(sys.argv) > 1 else (
        "Does TempGuru staff events in Boston, and what is the all-inclusive "
        "hourly rate for brand ambassadors there?"
    )
    asyncio.run(ask(q))
