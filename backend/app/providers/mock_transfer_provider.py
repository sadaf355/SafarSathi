from __future__ import annotations

from datetime import datetime

from app.providers.base import ProviderFailureError, CancellationPolicy, ProviderAlternative, TransferProvider

_CATALOGUE: dict[str, list[ProviderAlternative]] = {
    "Leh (IXL)": [
        ProviderAlternative(
            id="transfer-mmt",
            provider="MakeMyTrip Transfers",
            confirmation_hint="MMT-TR-882",
            origin="Leh (IXL)",
            destination="Hotel",
            departure=datetime(2025, 9, 12, 11, 50),
            arrival=datetime(2025, 9, 12, 12, 30),
            cost=1200,
            tier="standard",
            refundable=True,
            refund_percentage=0.5,
            cancellation_deadline_hours=2,
        ),
        ProviderAlternative(
            id="transfer-local-taxi",
            provider="Leh Local Taxi Union",
            confirmation_hint="LLT-119",
            origin="Leh (IXL)",
            destination="Hotel",
            departure=datetime(2025, 9, 12, 11, 50),
            arrival=datetime(2025, 9, 12, 12, 30),
            cost=900,
            tier="standard",
            refundable=False,
            refund_percentage=0.0,
            cancellation_deadline_hours=0,
        ),
    ],
}


class MockTransferProvider(TransferProvider):

    def __init__(self, failure_mode: str | None = None):
        """failure_mode is injectable for resilience tests: ``timeout`` raises
        ProviderFailureError and ``empty`` makes search return no alternatives."""
        if failure_mode not in (None, "timeout", "empty"):
            raise ValueError("failure_mode must be None, 'timeout', or 'empty'")
        self.failure_mode = failure_mode

    def _maybe_fail(self) -> None:
        if self.failure_mode == "timeout":
            raise ProviderFailureError(self.__class__.__name__, "provider request timed out", "timeout")

    def search(self, location: str, date: str) -> list[ProviderAlternative]:
        self._maybe_fail()
        if self.failure_mode == "empty":
            return []
        return list(_CATALOGUE.get(location, []))

    def get_alternatives(self, location: str, after: datetime) -> list[ProviderAlternative]:
        self._maybe_fail()
        if self.failure_mode == "empty":
            return []
        return [o for o in _CATALOGUE.get(location, []) if o.departure >= after]

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
            "Free cancellation up to 2h before pickup." if booking.refundable else "Non-refundable.",
        )
