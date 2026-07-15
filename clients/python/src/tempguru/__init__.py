"""TempGuru: event staffing data for AI agents and apps.

Live W-2 event staffing rates, 345-city US/Canada coverage, saved plans,
booking policies, quote status, and state compliance from TempGuru's API.
No API key required.
"""

from .client import TempGuru, TempGuruError

__all__ = ["TempGuru", "TempGuruError"]
__version__ = "0.3.0"
