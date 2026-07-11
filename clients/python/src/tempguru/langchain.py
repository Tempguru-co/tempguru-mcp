"""LangChain tools for TempGuru event staffing data.

Requires the optional extra::

    pip install "tempguru[langchain]"

Usage::

    from tempguru.langchain import get_tools
    tools = get_tools()  # pass to any LangChain/LangGraph agent

If your stack speaks MCP, you can skip this module and connect the server
directly with ``langchain-mcp-adapters`` at ``https://mcp.tempguru.co/mcp``.
"""

from __future__ import annotations

from typing import List, Optional

from .client import TempGuru

try:
    from langchain_core.tools import tool as _tool
except ImportError as _exc:  # pragma: no cover
    raise ImportError(
        "tempguru.langchain requires langchain-core. "
        'Install with: pip install "tempguru[langchain]"'
    ) from _exc


def get_tools(
    client: Optional[TempGuru] = None,
    include_quote_submission: bool = True,
) -> List:
    """Build the TempGuru tool list for a LangChain or LangGraph agent.

    Eight read-only tools, plus (by default) the opt-in quote
    submission tool. Set ``include_quote_submission=False`` for a strictly
    read-only toolset.
    """
    tg = client or TempGuru()

    @_tool
    def event_staffing_cities(state: str = "", tier: str = "") -> dict:
        """List the 345 US and Canadian cities where TempGuru provides W-2
        event staffing. Use this to confirm coverage before quoting anything.
        Optional filters: state (two-letter code like 'CA' or full name),
        tier ('hub' = 25 major metros, 'mid' = 128 secondary markets,
        'small' = 192 tertiary markets)."""
        return tg.cities(state=state or None, tier=tier or None)

    @_tool
    def event_staffing_roles() -> dict:
        """List the current 19-role event staffing catalog with descriptions
        and skill tiers. The returned
        slugs are the keys for the pricing and availability tools."""
        return tg.roles()

    @_tool
    def event_staffing_availability(
        city: str, date: str, role: str = "", headcount: int = 0
    ) -> dict:
        """Get booking lead-time guidance for hiring temporary event staff
        in a city on an ISO date (YYYY-MM-DD). Returns a recommendation
        (yes / tight / rush / very-rush). Planning guidance only, NOT a
        reservation, never promise availability to the user."""
        return tg.availability(
            city=city, date=date, role=role or None, headcount=headcount or None
        )

    @_tool
    def event_staffing_pricing(role: str, city: str) -> dict:
        """Get the all-inclusive W-2 hourly rate range for an event staffing
        role in a US or Canadian city (worker pay, payroll taxes, workers'
        comp, and liability insurance included). Present results as planning
        estimates, never binding quotes. Brand Ambassadors floor at $40/hour
        in every market."""
        return tg.pricing(role=role, city=city)

    @_tool
    def event_staffing_state_compliance(state: str) -> dict:
        """Get the employment-compliance summary for a US state: minimum
        wage, weekly/daily overtime thresholds, and state-specific rules
        relevant to temporary event staff (e.g. California daily overtime
        and meal breaks). Operational guidance, not legal advice."""
        return tg.compliance(state=state)

    @_tool
    def event_staffing_policies(topic: str = "") -> dict:
        """Get published TempGuru booking and procurement policies. Pass an
        optional topic such as payment-terms or cancellation-rescheduling.
        Preserve every confirm_with_coordinator flag; never invent a missing
        minimum, cancellation window, fee, deposit term, or response time."""
        return tg.policies(topic=topic or None)

    @_tool
    def restore_event_staffing_plan(plan_id: str) -> dict:
        """Restore a non-PII staffing plan saved for 30 days. Use only a
        plan_id supplied by the user or returned by TempGuru; never guess or
        enumerate IDs. Review the restored plan before quote submission."""
        return tg.plan(plan_id=plan_id)

    @_tool
    def event_staffing_quote_status(reference: str) -> dict:
        """Check whether a TempGuru TG quote reference was received by the
        CRM or durably queued. Version 1 does not expose quote_sent or won;
        a not-found response does not prove the CRM lead is absent."""
        return tg.quote_status(reference=reference)

    tools = [
        event_staffing_cities,
        event_staffing_roles,
        event_staffing_availability,
        event_staffing_pricing,
        event_staffing_state_compliance,
        event_staffing_policies,
        restore_event_staffing_plan,
        event_staffing_quote_status,
    ]

    if include_quote_submission:

        @_tool
        def submit_event_staffing_quote_request(
            contact_name: str,
            contact_email: str,
            company: str,
            event_name: str,
            event_type: str,
            city: str,
            event_dates: str,
            roles: list,
            contact_phone: str = "",
            budget_range: str = "",
            attire: str = "",
            special_requirements: str = "",
            compliance_notes: str = "",
            plan_id: str = "",
            skill_version: str = "",
        ) -> dict:
            """Submit a confirmed event staffing plan to TempGuru for a
            human-reviewed quote (response within one business day). OPT-IN
            WRITE: confirm the full plan with the user first and call at
            most once. Creates no reservation, requires no payment.
            event_type: trade-show | conference | festival | concert |
            sporting-event | corporate | brand-activation | other.
            roles: list of {"role": str, "headcount": int, "shifts": str?}.
            event_dates: human-readable, e.g. 'June 15-17, 2026'."""
            return tg.request_quote(
                contact_name=contact_name,
                contact_email=contact_email,
                company=company,
                event_name=event_name,
                event_type=event_type,
                city=city,
                event_dates=event_dates,
                roles=roles,
                contact_phone=contact_phone or None,
                budget_range=budget_range or None,
                attire=attire or None,
                special_requirements=special_requirements or None,
                compliance_notes=compliance_notes or None,
                source_platform="langchain",
                skill_version=skill_version or None,
                plan_id=plan_id or None,
            )

        tools.append(submit_event_staffing_quote_request)

    return tools
