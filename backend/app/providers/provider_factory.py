"""Chooses the live or mock provider implementation from Settings.

Live mode needs both `PROVIDER_MODE=live` and Amadeus credentials; anything
less falls back to the mock catalogue, so a half-configured deployment keeps
working on demo data rather than failing every recovery request.
"""

from __future__ import annotations

from app.config import get_settings
from app.providers.base import FlightProvider
from app.providers.mock_flight_provider import MockFlightProvider


def get_flight_provider() -> FlightProvider:
    settings = get_settings()
    if settings.provider_mode == "live" and settings.amadeus_client_id and settings.amadeus_client_secret:
        # Imported here, not top-level, so this module doesn't hard-fail to
        # import before amadeus_flight_provider.py exists.
        from app.providers.amadeus_flight_provider import AmadeusFlightProvider

        return AmadeusFlightProvider(settings.amadeus_client_id, settings.amadeus_client_secret, settings.amadeus_base_url)
    return MockFlightProvider()
