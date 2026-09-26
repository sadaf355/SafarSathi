"""Live flight alternatives from the Amadeus Self-Service Flight Offers API.

Used when PROVIDER_MODE=live and AMADEUS_CLIENT_ID/SECRET are set. Every call
degrades gracefully to the simulated catalogue (MockFlightProvider) instead
of failing a recovery request: missing credentials, auth errors, timeouts,
HTTP errors, rate limits (429 pauses live calls for a cool-down) and empty
results all fall back. Live options are tagged source="live" so the UI can
tell travelers which prices are real.
"""

from __future__ import annotations

import logging
import threading
import time
from datetime import datetime, timedelta

import httpx

from app.providers.base import CancellationPolicy, FlightProvider, ProviderAlternative
from app.providers.mock_flight_provider import MockFlightProvider

logger = logging.getLogger("triprescue.providers.amadeus")

PREMIUM_CABINS = {"BUSINESS", "FIRST", "PREMIUM_ECONOMY"}
RATE_LIMIT_COOLDOWN_SECONDS = 60


class AmadeusFlightProvider(FlightProvider):
    def __init__(
        self,
        client_id: str | None,
        client_secret: str | None,
        base_url: str = "https://test.api.amadeus.com",
        timeout_seconds: float = 6.0,
        fallback: FlightProvider | None = None,
        http_client: httpx.Client | None = None,
    ):
        self.client_id = client_id
        self.client_secret = client_secret
        self.base_url = base_url.rstrip("/")
        self.fallback = fallback or MockFlightProvider()
        self._http = http_client or httpx.Client(timeout=timeout_seconds)
        self._token: str | None = None
        self._token_expires_at = 0.0
        self._paused_until = 0.0
        self._lock = threading.Lock()

    @property
    def configured(self) -> bool:
        return bool(self.client_id and self.client_secret)

    # ---- API plumbing ---------------------------------------------------------------

    def _access_token(self) -> str:
        with self._lock:
            if self._token and time.monotonic() < self._token_expires_at - 30:
                return self._token
            resp = self._http.post(
                f"{self.base_url}/v1/security/oauth2/token",
                data={"grant_type": "client_credentials", "client_id": self.client_id, "client_secret": self.client_secret},
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            resp.raise_for_status()
            body = resp.json()
            self._token = body["access_token"]
            self._token_expires_at = time.monotonic() + float(body.get("expires_in", 1799))
            return self._token

    def _search_live(self, origin: str, destination: str, day: datetime) -> list[ProviderAlternative]:
        resp = self._http.get(
            f"{self.base_url}/v2/shopping/flight-offers",
            params={
                "originLocationCode": origin,
                "destinationLocationCode": destination,
                "departureDate": day.strftime("%Y-%m-%d"),
                "adults": 1,
                "currencyCode": "INR",
                "max": 15,
            },
            headers={"Authorization": f"Bearer {self._access_token()}"},
        )
        if resp.status_code == 429:
            self._paused_until = time.monotonic() + RATE_LIMIT_COOLDOWN_SECONDS
            raise RuntimeError("Amadeus rate limit reached")
        resp.raise_for_status()
        return self.parse_offers(resp.json(), origin, destination)

    @staticmethod
    def parse_offers(payload: dict, origin: str, destination: str) -> list[ProviderAlternative]:
        carriers = (payload.get("dictionaries") or {}).get("carriers") or {}
        options: list[ProviderAlternative] = []
        for offer in payload.get("data") or []:
            try:
                segments = offer["itineraries"][0]["segments"]
                first, last = segments[0], segments[-1]
                code = f"{first['carrierCode']}-{first['number']}"
                cabin = (
                    offer.get("travelerPricings", [{}])[0].get("fareDetailsBySegment", [{}])[0].get("cabin", "ECONOMY")
                )
                options.append(
                    ProviderAlternative(
                        id=f"amadeus-{offer.get('id', code)}",
                        provider=carriers.get(first["carrierCode"], first["carrierCode"]).title(),
                        confirmation_hint=code,
                        origin=origin,
                        destination=destination,
                        departure=datetime.fromisoformat(first["departure"]["at"]),
                        arrival=datetime.fromisoformat(last["arrival"]["at"]),
                        cost=float(offer["price"]["grandTotal"]),
                        tier="premium" if cabin in PREMIUM_CABINS else "standard",
                        # Self-service offers don't expose refund rules; assume the strict case.
                        refundable=False,
                        refund_percentage=0.0,
                        cancellation_deadline_hours=24,
                        source="live",
                    )
                )
            except (KeyError, IndexError, TypeError, ValueError):
                continue  # skip malformed offers, keep the rest
        return options

    # ---- FlightProvider ----------------------------------------------------------------

    def _live_or_none(self, origin: str, destination: str, after: datetime) -> list[ProviderAlternative] | None:
        if not self.configured or not origin or not destination:
            return None
        if time.monotonic() < self._paused_until:
            logger.info("Amadeus paused after rate limit; using simulated flights")
            return None
        try:
            found = self._search_live(origin, destination, after)
            if len([o for o in found if o.departure >= after]) < 2:
                found += self._search_live(origin, destination, after + timedelta(days=1))
            return found
        except Exception as exc:
            logger.warning("Amadeus flight search failed (%s); falling back to simulated flights", exc)
            return None

    def search(self, origin: str, destination: str, date: str) -> list[ProviderAlternative]:
        live = self._live_or_none(origin, destination, datetime.fromisoformat(date))
        return live if live else self.fallback.search(origin, destination, date)

    def get_alternatives(
        self, origin: str, destination: str, after: datetime, exclude_confirmation: str | None = None
    ) -> list[ProviderAlternative]:
        live = self._live_or_none(origin, destination, after)
        if live:
            options = sorted(
                (o for o in live if o.departure >= after and o.confirmation_hint != exclude_confirmation),
                key=lambda o: o.departure,
            )
            if options:
                return options[:6]
        return self.fallback.get_alternatives(origin, destination, after, exclude_confirmation)

    def get_booking(self, confirmation: str) -> ProviderAlternative | None:
        # Order retrieval needs the Amadeus booking APIs, which self-service keys don't include.
        return self.fallback.get_booking(confirmation)

    def get_cancellation_policy(self, confirmation: str) -> CancellationPolicy:
        return self.fallback.get_cancellation_policy(confirmation)
