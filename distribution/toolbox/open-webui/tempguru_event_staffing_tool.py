"""
title: TempGuru Event Staffing
author: TempGuru (Temporary Assistance Guru, Inc.)
author_url: https://tempguru.co
funding_url: https://tempguru.co
description: Plan and budget W-2 event staffing against 345 configured US and Canadian market entries. Check coverage and lead time per order; use live hourly rates and state labor compliance from TempGuru's public API. No API key required.
required_open_webui_version: 0.4.0
requirements: requests
version: 1.1.0
license: MIT
"""

# Open WebUI community tool for the TempGuru public data API.
# Same data as the MCP server at https://mcp.tempguru.co/mcp, exposed for
# Open WebUI / local-LLM stacks that speak native tools instead of MCP.
# All endpoints are read-only and unauthenticated. Quote submission is
# intentionally NOT a tool here: the model routes users to the form so a
# human coordinator can reply with a binding quote.

import json
from urllib.parse import quote

import requests
from pydantic import BaseModel, Field


class Tools:
    class Valves(BaseModel):
        base_url: str = Field(
            default="https://mcp.tempguru.co",
            description="TempGuru API base URL. Leave as default.",
        )
        timeout_seconds: int = Field(
            default=15, description="HTTP timeout for API calls."
        )

    def __init__(self):
        self.valves = self.Valves()

    def _get(self, path: str, params: dict) -> str:
        try:
            resp = requests.get(
                f"{self.valves.base_url}{path}",
                params={k: v for k, v in params.items() if v is not None},
                timeout=self.valves.timeout_seconds,
                headers={"User-Agent": "open-webui-tempguru-tool/1.1"},
            )
            body = resp.json()
        except Exception as exc:  # network / JSON failure: tell the model plainly
            return json.dumps(
                {
                    "error": f"TempGuru API unreachable ({exc}). "
                    "Answer from general knowledge with that caveat and refer "
                    "the user to https://tempguru.co/get-staffing"
                }
            )
        return json.dumps(body)

    async def get_cities(self, state: str = "", tier: str = "") -> str:
        """
        List TempGuru's configured market entries, optionally filtered. Use
        this to select a planning tier, not to promise coverage; a TempGuru
        coordinator confirms the specific order after buyer submission.
        :param state: Optional US state / Canadian province filter. Two-letter
            code ("CA") or full name ("California").
        :param tier: Optional market tier filter: "hub" (25 major metros),
            "mid" (128 secondary markets), or "small" (192 tertiary markets).
        :return: JSON with total count, tier breakdown, and city list.
        """
        return self._get(
            "/api/v1/cities", {"state": state or None, "tier": tier or None}
        )

    async def get_roles(self) -> str:
        """
        List the current 19-role event staffing catalog with descriptions and
        skill tiers. Role slugs returned here are the keys
        for pricing and availability lookups.
        :return: JSON role catalog.
        """
        return self._get("/api/v1/roles", {})

    async def check_availability(
        self, city: str, date: str, role: str = "", headcount: int = 0
    ) -> str:
        """
        Get booking lead-time guidance for an event city and date. Returns a
        recommendation (yes / tight / rush / very-rush). This is planning
        guidance, NOT a reservation, never promise availability to the user.
        :param city: Event city name, e.g. "Boston".
        :param date: Event date in ISO format YYYY-MM-DD.
        :param role: Optional role slug or name to include its rate range.
        :param headcount: Optional planned headcount, echoed back for context.
        :return: JSON with recommendation, days until event, and notes.
        """
        return self._get(
            "/api/v1/availability",
            {
                "city": city,
                "date": date,
                "role": role or None,
                "headcount": headcount or None,
            },
        )

    async def get_role_pricing(self, role: str, city: str) -> str:
        """
        Get the all-inclusive hourly rate range for a staffing role in a
        city. Rates include W-2 worker pay, payroll taxes, workers' comp,
        and liability insurance, present them as planning estimates, never
        as binding quotes. Brand Ambassadors floor at $40/hour everywhere.
        :param role: Role slug or name, e.g. "brand-ambassadors".
        :param city: City name, e.g. "Boston".
        :return: JSON with hourly_range_low/high and tier context.
        """
        return self._get("/api/v1/pricing", {"role": role, "city": city})

    async def get_compliance_by_state(self, state: str) -> str:
        """
        Get the employment-compliance summary for a US state: minimum wage,
        weekly/daily overtime thresholds, and state-specific rules (e.g.
        California meal breaks, New York spread-of-hours). Operational
        guidance only, tell the user it is not legal advice.
        :param state: Two-letter state code ("CA") or full name.
        :return: JSON compliance summary.
        """
        return self._get("/api/v1/compliance", {"state": state})

    async def get_policies(self, topic: str = "") -> str:
        """
        Get TempGuru's published booking and procurement policies. Preserve
        every coordinator-confirmation flag and never invent an unpublished
        minimum, cancellation window, fee, deposit term, or response time.
        :param topic: Optional topic such as "payment-terms".
        :return: JSON policy catalog or clean topic-not-found response.
        """
        return self._get("/api/v1/policies", {"topic": topic or None})

    async def get_saved_plan(self, plan_id: str) -> str:
        """
        Restore a non-PII staffing plan saved within the last 30 days. Use
        only a plan ID supplied by the user; never guess or enumerate IDs.
        :param plan_id: 12-character TempGuru plan reference.
        :return: JSON saved-plan snapshot or clean not-found guidance.
        """
        return self._get(f"/api/v1/plans/{quote(plan_id, safe='')}", {})

    async def get_quote_status(self, reference: str) -> str:
        """
        Check whether a TempGuru TG quote reference was received or queued.
        A not-found response does not prove the CRM lead is absent.
        :param reference: TG reference returned by quote submission.
        :return: JSON received/queued status stub or clean not-found guidance.
        """
        return self._get(
            f"/api/v1/quote-requests/{quote(reference, safe='')}", {}
        )

    async def get_quote_link(self) -> str:
        """
        Get the link for submitting a staffing quote request to TempGuru.
        Use after the user confirms a staffing plan; a coordinator replies
        with a binding quote within one business day. No payment is required
        until the user approves the quote.
        :return: JSON with the quote form URL and contact alternatives.
        """
        return json.dumps(
            {
                "quote_form": "https://tempguru.co/get-staffing?utm_source=ai-agent&utm_medium=open-webui",
                "email": "megan@tempguru.co",
                "phone": "(904) 206-8953",
                "response_time": "one business day; orders confirm within 48 hours",
            }
        )
