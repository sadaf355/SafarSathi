from __future__ import annotations

from datetime import datetime

from app.providers.base import ProviderFailureError, CancellationPolicy, HotelProvider, ProviderAlternative

_CATALOGUE: dict[str, list[ProviderAlternative]] = {
    "Leh": [
        ProviderAlternative(
            id="hotel-grand-dragon",
            provider="Grand Dragon Ladakh",
            confirmation_hint="GDL-8843",
            origin="Leh",
            destination="Leh",
            departure=datetime(2025, 9, 12, 13, 0),
            arrival=datetime(2025, 9, 16, 11, 0),
            cost=14400,
            tier="standard",
            refundable=True,
            refund_percentage=0.75,
            cancellation_deadline_hours=48,
        ),
        ProviderAlternative(
            id="hotel-lchang-nang",
            provider="The Lchang Nang Retreat",
            confirmation_hint="LNR-2291",
            origin="Leh",
            destination="Leh",
            departure=datetime(2025, 9, 12, 13, 0),
            arrival=datetime(2025, 9, 16, 11, 0),
            cost=16800,
            tier="premium",
            refundable=True,
            refund_percentage=0.9,
            cancellation_deadline_hours=24,
        ),
    ],
}


class MockHotelProvider(HotelProvider):

    def __init__(self, failure_mode: str | None = None):
        """failure_mode is injectable for resilience tests: ``timeout`` raises
        ProviderFailureError and ``empty`` makes search return no alternatives."""
        if failure_mode not in (None, "timeout", "empty"):
            raise ValueError("failure_mode must be None, 'timeout', or 'empty'")
        self.failure_mode = failure_mode

    def _maybe_fail(self) -> None:
        if self.failure_mode == "timeout":
            raise ProviderFailureError(self.__class__.__name__, "provider request timed out", "timeout")

    def search(self, location: str, check_in: str) -> list[ProviderAlternative]:
        self._maybe_fail()
        if self.failure_mode == "empty":
            return []
        return list(_CATALOGUE.get(location, []))

    def get_alternatives(self, location: str, check_in: datetime) -> list[ProviderAlternative]:
        self._maybe_fail()
        if self.failure_mode == "empty":
            return []
        return [o for o in _CATALOGUE.get(location, []) if o.departure >= check_in]

    def get_booking(self, confirmation: str) -> ProviderAlternative | None:
        for options in _CATALOGUE.values():
            for option in options:
                if option.confirmation_hint == confirmation:
                    return option
        return None

    def get_cancellation_policy(self, confirmation: str) -> CancellationPolicy:
        booking = self.get_booking(confirmation)
        if not booking:
            return CancellationPolicy(False, 0.0, 0, "Unknown booking.")
        return CancellationPolicy(
            booking.refundable,
            booking.refund_percentage,
            booking.cancellation_deadline_hours,
            f"Free change up to {booking.cancellation_deadline_hours}h before check-in.",
        )
