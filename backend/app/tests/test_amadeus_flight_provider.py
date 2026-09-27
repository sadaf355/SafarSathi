"""AmadeusFlightProvider against a faked Amadeus API (httpx.MockTransport) -
no real network access. Live offers are tagged source="live"; every failure
mode degrades to the simulated catalogue instead of failing recovery."""

from datetime import datetime

import httpx
import pytest

from app.providers.amadeus_flight_provider import AmadeusFlightProvider
from app.providers.base import FlightProvider, ProviderAlternative

BASE_URL = "https://test.api.amadeus.com"


def _segment(carrier, number, dep_code, dep_at, arr_code, arr_at):
    return {
        "carrierCode": carrier,
        "number": number,
        "departure": {"iataCode": dep_code, "at": dep_at},
        "arrival": {"iataCode": arr_code, "at": arr_at},
    }


def _offer(offer_id, segments, total, cabin="ECONOMY", key="grandTotal"):
    return {
        "id": offer_id,
        "itineraries": [{"segments": segments}],
        "price": {"currency": "INR", key: total},
        "travelerPricings": [{"fareDetailsBySegment": [{"cabin": cabin} for _ in segments]}],
    }


DIRECT = _offer("1", [_segment("AI", "445", "DEL", "2025-09-12T12:30:00", "IXL", "2025-09-12T13:45:00")], "17000.00", "BUSINESS")
CONNECTING = _offer(
    "2",
    [
        _segment("6E", "2011", "DEL", "2025-09-12T09:00:00", "SXR", "2025-09-12T10:30:00"),
        _segment("6E", "2123", "SXR", "2025-09-12T11:30:00", "IXL", "2025-09-12T12:20:00"),
    ],
    "9800.50",
    key="total",  # some responses only carry "total"
)


class FakeAmadeus:
    """Routes token and flight-offer requests; records what it received."""

    def __init__(self, offers=None, offers_response=None, token_response=None):
        self.offers = offers if offers is not None else [DIRECT, CONNECTING]
        self.offers_response = offers_response
        self.token_response = token_response
        self.token_calls = 0
        self.search_requests: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        if request.url.path == "/v1/security/oauth2/token":
            self.token_calls += 1
            if self.token_response is not None:
                return self.token_response
            body = request.content.decode()
            assert "grant_type=client_credentials" in body and "client_id=test-id" in body
            return httpx.Response(200, json={"access_token": "tok-123", "expires_in": 1799})
        if request.url.path == "/v2/shopping/flight-offers":
            self.search_requests.append(request)
            assert request.headers["Authorization"] == "Bearer tok-123"
            if self.offers_response is not None:
                return self.offers_response
            return httpx.Response(200, json={"data": self.offers, "dictionaries": {"carriers": {"AI": "AIR INDIA"}}})
        return httpx.Response(404)


class RecordingFallback(FlightProvider):
    """Stands in for the simulated catalogue so fallbacks are observable."""

    SIMULATED = ProviderAlternative(
        id="sim-1", provider="Simulated", confirmation_hint="SIM-1", origin="DEL", destination="IXL",
        departure=datetime(2025, 9, 12, 15, 0), arrival=datetime(2025, 9, 12, 16, 15), cost=9000.0, tier="standard",
        refundable=False, refund_percentage=0.0, cancellation_deadline_hours=24,
    )

    def __init__(self):
        self.calls = 0

    def search(self, origin, destination, date):
        self.calls += 1
        return [self.SIMULATED]

    def get_alternatives(self, origin, destination, after, exclude_confirmation=None):
        self.calls += 1
        return [self.SIMULATED]

    def get_booking(self, confirmation):
        return None

    def get_cancellation_policy(self, confirmation):
        raise NotImplementedError


def _provider(handler, fallback=None, client_id="test-id") -> AmadeusFlightProvider:
    return AmadeusFlightProvider(
        client_id, "test-secret", BASE_URL, fallback=fallback or RecordingFallback(),
        http_client=httpx.Client(transport=httpx.MockTransport(handler)),
    )


def test_search_maps_offers_to_live_alternatives():
    fake = FakeAmadeus()
    results = _provider(fake).search("DEL", "IXL", "2025-09-12")

    params = fake.search_requests[0].url.params
    assert (params["originLocationCode"], params["destinationLocationCode"]) == ("DEL", "IXL")
    assert params["departureDate"] == "2025-09-12" and params["currencyCode"] == "INR"

    direct, connecting = results
    assert direct.provider == "Air India" and direct.confirmation_hint == "AI-445"
    assert direct.tier == "premium" and direct.cost == 17000.0 and direct.source == "live"
    # Connection: departure from the first segment, arrival from the last; "total" accepted.
    assert connecting.departure == datetime(2025, 9, 12, 9, 0)
    assert connecting.arrival == datetime(2025, 9, 12, 12, 20)
    assert connecting.cost == 9800.5 and connecting.tier == "standard"


def test_token_is_cached_and_refetched_after_expiry():
    fake = FakeAmadeus()
    provider = _provider(fake)
    provider.search("DEL", "IXL", "2025-09-12")
    provider.search("DEL", "IXL", "2025-09-13")
    assert fake.token_calls == 1

    provider._token_expires_at = 0.0  # simulate the cached token lapsing
    provider.search("DEL", "IXL", "2025-09-12")
    assert fake.token_calls == 2


def test_get_alternatives_filters_sorts_and_excludes_current_flight():
    results = _provider(FakeAmadeus()).get_alternatives("DEL", "IXL", datetime(2025, 9, 12, 8, 0), exclude_confirmation="AI-445")
    assert [r.confirmation_hint for r in results] == ["6E-2011"]


def test_get_alternatives_drops_flights_departing_before_earliest_time():
    results = _provider(FakeAmadeus()).get_alternatives("DEL", "IXL", datetime(2025, 9, 12, 10, 0))
    assert [r.confirmation_hint for r in results] == ["AI-445"]


def test_unbounded_earliest_time_makes_no_live_request():
    fake, fallback = FakeAmadeus(), RecordingFallback()
    _provider(fake, fallback).get_alternatives("DEL", "IXL", datetime.max)
    assert fake.search_requests == [] and fake.token_calls == 0
    assert fallback.calls == 1


@pytest.mark.parametrize(
    "fake",
    [
        FakeAmadeus(offers_response=httpx.Response(500, text="boom")),
        FakeAmadeus(token_response=httpx.Response(500, text="boom")),
        FakeAmadeus(token_response=httpx.Response(401, json={"error": "invalid_client"})),
        FakeAmadeus(offers_response=httpx.Response(200, text="<html>not json</html>")),
        FakeAmadeus(offers_response=httpx.Response(200, json={"data": [{"id": "1"}]})),
        FakeAmadeus(token_response=httpx.Response(200, json={"no_token": True})),
        FakeAmadeus(offers=[]),
    ],
    ids=["search-500", "token-500", "token-401", "non-json", "unparseable-offers", "malformed-token", "no-offers"],
)
def test_api_failures_fall_back_to_simulated_flights(fake):
    fallback = RecordingFallback()
    results = _provider(fake, fallback).get_alternatives("DEL", "IXL", datetime(2025, 9, 12, 8, 0))
    assert results == [RecordingFallback.SIMULATED]
    assert fallback.calls == 1


@pytest.mark.parametrize("error", [httpx.ReadTimeout, httpx.ConnectError])
def test_network_errors_fall_back_to_simulated_flights(error):
    def handler(request: httpx.Request) -> httpx.Response:
        raise error("down", request=request)

    assert _provider(handler).search("DEL", "IXL", "2025-09-12") == [RecordingFallback.SIMULATED]


def test_rate_limit_pauses_live_calls():
    fake = FakeAmadeus(offers_response=httpx.Response(429, json={}))
    provider = _provider(fake)
    provider.get_alternatives("DEL", "IXL", datetime(2025, 9, 12, 8, 0))
    calls = len(fake.search_requests)
    provider.get_alternatives("DEL", "IXL", datetime(2025, 9, 12, 8, 0))
    assert len(fake.search_requests) == calls  # cooling down: no new live request


def test_unconfigured_provider_never_touches_the_network():
    fake = FakeAmadeus()
    _provider(fake, client_id=None).get_alternatives("DEL", "IXL", datetime(2025, 9, 12, 8, 0))
    assert fake.token_calls == 0 and fake.search_requests == []


def test_one_malformed_offer_does_not_discard_the_rest():
    results = _provider(FakeAmadeus(offers=[{"id": "broken"}, DIRECT])).search("DEL", "IXL", "2025-09-12")
    assert [r.confirmation_hint for r in results] == ["AI-445"]
