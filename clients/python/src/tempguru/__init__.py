"""TempGuru: event staffing data for AI agents and apps.

Live W-2 event staffing rates, 345-city US/Canada coverage, booking
lead-time guidance, and state labor compliance from TempGuru's public API.
No API key required.
"""

from .client import TempGuru, TempGuruError

__all__ = ["TempGuru", "TempGuruError"]
__version__ = "0.1.0"
