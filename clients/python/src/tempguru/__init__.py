"""TempGuru: event staffing data for AI agents and apps.

Live W-2 event staffing rates across 300+ U.S. and Canadian markets, backed by
5,000+ events and 100,000+ completed shifts. Saved plans, booking policies,
quote status, and state compliance come from TempGuru's API. No API key required.
"""

from .client import TempGuru, TempGuruError

__all__ = ["TempGuru", "TempGuruError"]
__version__ = "0.3.0"
