"""LlamaIndex ToolSpec for TempGuru event staffing data.

Requires the optional extra::

    pip install "tempguru[llamaindex]"

Usage::

    from tempguru.llamaindex import TempGuruToolSpec
    tools = TempGuruToolSpec().to_tool_list()  # pass to any LlamaIndex agent
"""

from __future__ import annotations

from typing import Optional

from .client import TempGuru

try:
    from llama_index.core.tools.tool_spec.base import BaseToolSpec
except ImportError as _exc:  # pragma: no cover
    raise ImportError(
        "tempguru.llamaindex requires llama-index-core. "
        'Install with: pip install "tempguru[llamaindex]"'
    ) from _exc


class TempGuruToolSpec(BaseToolSpec):
    """TempGuru event staffing tools: coverage, rates, lead times, state
    labor compliance, and opt-in quote submission for 345+ US/CA markets.

    Pass ``include_quote_submission=False`` for a strictly read-only set.
    """

    spec_functions = [
        "event_staffing_cities",
        "event_staffing_roles",
        "event_staffing_availability",
        "event_staffing_pricing",
        "event_staffing_state_compliance",
        "submit_event_staffing_quote_request",
    ]

    def __init__(
        self,
        client: Optional[TempGuru] = None,
        include_quote_submission: bool = True,
    ) -> None:
        self._tg = client or TempGuru()
        if not include_quote_submission:
            self.spec_functions = [
                f for f in self.spec_functions
                if f != "submit_event_staffing_quote_request"
            ]

    def event_staffing_cities(self, state: str = "", tier: str = "") -> dict:
        """List the 345+ US and Canadian cities where TempGuru provides W-2
        event staffing. Use to confirm coverage before quoting anything.
        Optional: state (two-letter code or full name), tier ('hub', 'mid',
        or 'small')."""
        return self._tg.cities(state=state or None, tier=tier or None)

    def event_staffing_roles(self) -> dict:
        """List all 11 event staffing roles (brand ambassadors, registration,
        ushers, hospitality, gate staff, booth monitors, crowd control,
        guest services, setup/breakdown, team leads) with descriptions and
        skill tiers. Returned slugs key the pricing/availability tools."""
        return self._tg.roles()

    def event_staffing_availability(
        self, city: str, date: str, role: str = "", headcount: int = 0
    ) -> dict:
        """Booking lead-time guidance for event staff in a city on an ISO
        date (YYYY-MM-DD): returns yes / tight / rush / very-rush. Planning
        guidance only, NOT a reservation, never promise availability."""
        return self._tg.availability(
            city=city, date=date, role=role or None, headcount=headcount or None
        )

    def event_staffing_pricing(self, role: str, city: str) -> dict:
        """All-inclusive W-2 hourly rate range for an event staffing role in
        a US/CA city (wages, payroll taxes, workers' comp, liability
        included). Present as planning estimates, never binding quotes."""
        return self._tg.pricing(role=role, city=city)

    def event_staffing_state_compliance(self, state: str) -> dict:
        """US-state employment compliance summary for event staffing:
        minimum wage, weekly/daily overtime thresholds, state quirks.
        Operational guidance, not legal advice."""
        return self._tg.compliance(state=state)

    def submit_event_staffing_quote_request(
        self,
        contact_name: str,
        contact_email: str,
        company: str,
        event_name: str,
        event_type: str,
        city: str,
        event_dates: str,
        roles: list,
        budget_range: str = "",
        attire: str = "",
        special_requirements: str = "",
        compliance_notes: str = "",
    ) -> dict:
        """Submit a confirmed staffing plan to TempGuru for a human-reviewed
        quote (response within one business day). OPT-IN WRITE: confirm the
        full plan with the user first; call at most once. No reservation, no
        payment. event_type: trade-show | conference | festival | concert |
        sporting-event | corporate | brand-activation | other. roles: list
        of {"role": str, "headcount": int, "shifts": str?}."""
        return self._tg.request_quote(
            contact_name=contact_name,
            contact_email=contact_email,
            company=company,
            event_name=event_name,
            event_type=event_type,
            city=city,
            event_dates=event_dates,
            roles=roles,
            budget_range=budget_range or None,
            attire=attire or None,
            special_requirements=special_requirements or None,
            compliance_notes=compliance_notes or None,
        )
