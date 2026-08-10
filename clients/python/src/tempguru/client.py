"""Zero-dependency client for the TempGuru public event staffing API.

The API is unauthenticated. Eight read operations return the same data that
powers tempguru.co and the TempGuru MCP server; one opt-in write operation
submits a confirmed quote request for human review.

Method docstrings are written so they can be reused verbatim as LLM tool
descriptions (LangChain, OpenAI function calling, etc.).
"""

from __future__ import annotations

import json
from typing import Any, Dict, Optional
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

__all__ = ["TempGuru", "TempGuruError"]

_VERSION = "0.3.0"
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

    def _request(self, req: Request) -> Dict[str, Any]:
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

    def _get(self, path: str, **params: Any) -> Dict[str, Any]:
        query = {k: v for k, v in params.items() if v is not None}
        url = f"{self.base_url}{path}"
        if query:
            url += "?" + urlencode(query)
        return self._request(
            Request(url, headers={"User-Agent": f"tempguru-python/{_VERSION}"})
        )

    def _post(self, path: str, body: Dict[str, Any]) -> Dict[str, Any]:
        return self._request(
            Request(
                f"{self.base_url}{path}",
                data=json.dumps(body).encode("utf-8"),
                headers={
                    "User-Agent": f"tempguru-python/{_VERSION}",
                    "Content-Type": "application/json",
                },
                method="POST",
            )
        )

    # ------------------------------------------------------------------ #

    def cities(self, state: Optional[str] = None, tier: Optional[str] = None) -> Dict[str, Any]:
        """List TempGuru's configured market entries.

        Use this to select a planning tier, not to promise order coverage;
        a TempGuru coordinator confirms the specific order. ``state``
        accepts a two-letter code ("CA") or full name ("California"); US
        states and Canadian provinces both work. ``tier`` filters by market
        tier: "hub" (25 major metros), "mid" (128 secondary markets), or
        "small" (192 tertiary markets).
        """
        return self._get("/api/v1/cities", state=state, tier=tier)

    def roles(self) -> Dict[str, Any]:
        """List all event staffing roles with descriptions and skill tiers.

        Returns the current 19-role catalog. The returned ``slug``
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
        planning guidance, NOT a real-time reservation, do not present it
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

    def policies(self, topic: Optional[str] = None) -> Dict[str, Any]:
        """Get published booking and procurement policies.

        Optionally filter to one topic such as ``payment-terms`` or
        ``cancellation-rescheduling``. Values TempGuru has not published are
        explicitly marked for coordinator confirmation; never infer them.
        """
        return self._get("/api/v1/policies", topic=topic)

    def plan(self, plan_id: str) -> Dict[str, Any]:
        """Restore a non-PII staffing plan saved within the last 30 days.

        Use only a ``plan_id`` returned by ``plan_staffing``; never guess or
        enumerate plan IDs. A clean ``plan_found: false`` response means the
        plan is absent or expired.
        """
        return self._get(f"/api/v1/plans/{quote(plan_id, safe='')}")

    def quote_status(self, reference: str) -> Dict[str, Any]:
        """Check whether a TG quote reference was received or queued.

        Version 1 reports only ``received`` and ``queued``. A clean
        ``quote_found: false`` response does not prove the CRM lead is absent.
        """
        return self._get(f"/api/v1/quote-requests/{quote(reference, safe='')}")

    def request_quote(
        self,
        *,
        contact_name: str,
        contact_email: str,
        company: str,
        event_name: str,
        event_type: str,
        city: str,
        event_dates: str,
        roles: list,
        contact_phone: Optional[str] = None,
        budget_range: Optional[str] = None,
        attire: Optional[str] = None,
        special_requirements: Optional[str] = None,
        compliance_notes: Optional[str] = None,
        source_platform: Optional[str] = None,
        skill_version: Optional[str] = None,
        plan_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Submit a staffing request to TempGuru for a human-reviewed quote.

        OPT-IN WRITE: this sends the contact and event details to TempGuru's
        CRM so a coordinator can respond within one business day. Confirm the
        full plan with the user before calling. It creates no reservation,
        forms no contract, and requires no payment until the user approves
        the quote.

        ``event_type`` is one of: trade-show, conference, festival, concert,
        sporting-event, corporate, brand-activation, other. ``roles`` is a
        list of dicts like ``{"role": "brand-ambassadors", "headcount": 10,
        "shifts": "3 days x 8h"}`` (``shifts`` optional). ``event_dates`` is
        human-readable, e.g. ``"June 15-17, 2026"``.

        Pass ``plan_id`` when resuming a saved plan, plus ``source_platform``
        and ``skill_version`` for attribution. Returns ``{"submitted": true,
        "deal_name": ..., "reference": ..., "next_steps": [...]}``
        on success. Raises :class:`TempGuruError` on validation failure or
        rate limiting (the endpoint allows 20 submissions/hour per IP).
        """
        body: Dict[str, Any] = {
            "contact_name": contact_name,
            "contact_email": contact_email,
            "company": company,
            "event_name": event_name,
            "event_type": event_type,
            "city": city,
            "event_dates": event_dates,
            "roles": roles,
        }
        for key, value in {
            "contact_phone": contact_phone,
            "budget_range": budget_range,
            "attire": attire,
            "special_requirements": special_requirements,
            "compliance_notes": compliance_notes,
            "source_platform": source_platform,
            "skill_version": skill_version,
            "plan_id": plan_id,
        }.items():
            if value is not None:
                body[key] = value
        return self._post("/api/v1/quote-requests", body)

    @staticmethod
    def quote_form_url(source: str = "python-client") -> str:
        """URL where a user submits a staffing request for a binding quote.

        A TempGuru coordinator replies within one business day; orders
        confirm within 48 hours. No payment until the quote is approved.
        """
        return f"{QUOTE_FORM_URL}?utm_source=ai-agent&utm_medium={source}"
