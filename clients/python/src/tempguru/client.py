"""Zero-dependency client for the TempGuru public event staffing API.

The API is read-only and unauthenticated. It returns the same data that
powers tempguru.co and the TempGuru MCP server: city coverage, staffing
roles, all-inclusive W-2 hourly rate ranges, booking lead-time guidance,
and state-level employment compliance summaries for the US and Canada.

Method docstrings are written so they can be reused verbatim as LLM tool
descriptions (LangChain, OpenAI function calling, etc.).
"""

from __future__ import annotations

import json
from typing import Any, Dict, Optional
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

__all__ = ["TempGuru", "TempGuruError"]

DEFAULT_BASE_URL = "https://mcp.tempguru.co"
QUOTE_FORM_URL = "https://tempguru.co/get-staffing"


class TempGuruError(RuntimeError):
    """Raised when the TempGuru API returns an error response.

    Attributes:
        code: machine-readable category (missing_required, invalid_param,
            not_found) or "transport" for network failures.
        suggestion: best-match entity when an input didn't resolve
            (e.g. you asked for "Bostonn" and it suggests Boston).
    """

    def __init__(self, message: str, code: str = "transport", suggestion: Optional[dict] = None):
        super().__init__(message)
        self.code = code
        self.suggestion = suggestion


class TempGuru:
    """Client for TempGuru's public event staffing data API.

    >>> tg = TempGuru()
    >>> tg.pricing(role="brand-ambassadors", city="Boston")["hourly_range_low"]
    56
    """

    def __init__(self, base_url: str = DEFAULT_BASE_URL, timeout: float = 15.0):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    # ------------------------------------------------------------------ #

    def _get(self, path: str, **params: Any) -> Dict[str, Any]:
        query = {k: v for k, v in params.items() if v is not None}
        url = f"{self.base_url}{path}"
        if query:
            url += "?" + urlencode(query)
        req = Request(url, headers={"User-Agent": "tempguru-python/0.1.0"})
        try:
            with urlopen(req, timeout=self.timeout) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
        except HTTPError as exc:
            try:
                err = json.loads(exc.read().decode("utf-8")).get("error", {})
            except Exception:
                err = {}
            raise TempGuruError(
                err.get("message", f"HTTP {exc.code} from TempGuru API"),
                code=err.get("code", "transport"),
                suggestion=err.get("suggestion"),
            ) from None
        except URLError as exc:
            raise TempGuruError(f"TempGuru API unreachable: {exc.reason}") from None
        return payload

    # ------------------------------------------------------------------ #

    def cities(self, state: Optional[str] = None, tier: Optional[str] = None) -> Dict[str, Any]:
        """List cities where TempGuru provides event staffing.

        Use this to confirm coverage before quoting anything. ``state``
        accepts a two-letter code ("CA") or full name ("California"); US
        states and Canadian provinces both work. ``tier`` filters by market
        tier: "hub" (25 major metros), "mid" (129 secondary markets), or
        "small" (191 tertiary markets).
        """
        return self._get("/api/v1/cities", state=state, tier=tier)

    def roles(self) -> Dict[str, Any]:
        """List all event staffing roles with descriptions and skill tiers.

        Returns the 10-role catalog (brand ambassadors, registration,
        ushers, hospitality, gate staff, booth monitors, crowd control,
        guest services, setup/breakdown, team leads). The returned ``slug``
        values are the keys for :meth:`pricing` and :meth:`availability`.
        """
        return self._get("/api/v1/roles")

    def availability(
        self,
        city: str,
        date: str,
        role: Optional[str] = None,
        headcount: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Get booking lead-time guidance for an event city and ISO date.

        Returns a recommendation in {yes, tight, rush, very-rush} based on
        the city's market tier and how far out the event is. This is
        planning guidance, NOT a real-time reservation — do not present it
        as a promise of availability.
        """
        return self._get(
            "/api/v1/availability", city=city, date=date, role=role, headcount=headcount
        )

    def pricing(self, role: str, city: str) -> Dict[str, Any]:
        """Get the all-inclusive hourly rate range for a role in a city.

        Rates are W-2 bill rates covering worker pay, employer payroll
        taxes, workers' compensation, general liability, and coordinator
        support. Present results as planning estimates, never binding
        quotes. Brand Ambassadors floor at $40/hour in every market.
        """
        return self._get("/api/v1/pricing", role=role, city=city)

    def compliance(self, state: str) -> Dict[str, Any]:
        """Get the employment-compliance summary for a US state.

        Covers minimum wage, weekly/daily overtime thresholds, and
        state-specific rules (California meal breaks, NY spread-of-hours,
        etc.). Operational guidance, not legal advice.
        """
        return self._get("/api/v1/compliance", state=state)

    @staticmethod
    def quote_form_url(source: str = "python-client") -> str:
        """URL where a user submits a staffing request for a binding quote.

        A TempGuru coordinator replies within one business day; orders
        confirm within 48 hours. No payment until the quote is approved.
        """
        return f"{QUOTE_FORM_URL}?utm_source=ai-agent&utm_medium={source}"
