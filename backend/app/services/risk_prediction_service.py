"""Background risk prediction.

Every RISK_PREDICTION_INTERVAL_MINUTES the scheduler re-scores weather and
connection-buffer risk for trips that haven't finished yet, stores the result
as RiskSnapshot rows (one trip-level row plus one per risky booking), and
raises a notification the first time a booking crosses into high risk - so
travelers hear about a looming problem before it becomes a disruption.

Disabled by default (RISK_PREDICTION_ENABLED=false). One cycle's failure on a
single trip is logged and skipped; it never stops the other trips or the loop.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import date, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.enums import NotificationCategory, NotificationSeverity, RiskLevel, SnapshotType, TripStatus
from app.models.notification import Notification
from app.models.risk import RiskSnapshot
from app.models.trip import Trip
from app.services.risk_service import get_risk_analysis

logger = logging.getLogger("triprescue.risk_prediction")

_DATE_FORMATS = ("%Y-%m-%d", "%d %b %Y", "%d %B %Y", "%b %d %Y", "%d/%m/%Y")


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(value.strip(), fmt).date()
        except ValueError:
            continue
    return None


def is_active(trip: Trip, today: date | None = None) -> bool:
    """Trips still worth monitoring: not ended more than a day ago. Trips whose
    end date can't be parsed are kept (better an extra check than a missed one)."""
    today = today or date.today()
    end = _parse_date(trip.end_date)
    return end is None or end >= today - timedelta(days=1)


def _level(value: str) -> RiskLevel:
    return RiskLevel(value) if value in RiskLevel._value2member_map_ else RiskLevel.MEDIUM


def predict_trip(db: Session, trip: Trip) -> int:
    """Re-score one trip and persist its snapshots. Returns new high-risk alerts raised."""
    previous_high = set(
        db.scalars(
            select(RiskSnapshot.node_id).where(
                RiskSnapshot.trip_id == trip.id, RiskSnapshot.risk_level == RiskLevel.HIGH, RiskSnapshot.node_id.is_not(None)
            )
        )
    )
    analysis = get_risk_analysis(db, trip.id)
    db.execute(delete(RiskSnapshot).where(RiskSnapshot.trip_id == trip.id))

    score = analysis.score
    resilience = score.trip_resilience
    db.add(
        RiskSnapshot(
            trip_id=trip.id,
            snapshot_type=SnapshotType.TRIP,
            risk_type="trip",
            risk_level=RiskLevel.LOW if resilience >= 70 else RiskLevel.MEDIUM if resilience >= 45 else RiskLevel.HIGH,
            risk_percent=100 - resilience,
            reason=f"Resilience {resilience}/100",
            contributing_factors=[
                {"factor": "connection", "score": score.connection_risk},
                {"factor": "schedule", "score": score.schedule_risk},
                {"factor": "vendor", "score": score.vendor_risk},
                {"factor": "weather", "score": score.weather_risk},
            ],
            recommendation="",
        )
    )

    raised = 0
    for card in analysis.cards:
        level = _level(card.risk_level)
        db.add(
            RiskSnapshot(
                trip_id=trip.id,
                node_id=card.node_id,
                snapshot_type=SnapshotType.NODE,
                risk_type=card.risk_type,
                risk_level=level,
                risk_percent=card.risk_percent,
                reason=card.historical_risk,
                contributing_factors=[{"buffer": card.buffer}] if card.buffer else [],
                recommendation=card.recommendation,
            )
        )
        if level == RiskLevel.HIGH and card.node_id not in previous_high and trip.status == TripStatus.OPERATIONAL:
            db.add(
                Notification(
                    trip_id=trip.id,
                    severity=NotificationSeverity.MEDIUM,
                    category=NotificationCategory.RISK,
                    title=f"Rising risk: {card.node_label}",
                    message=f"{card.risk_type} risk is now {card.risk_percent}%. {card.recommendation}",
                )
            )
            raised += 1
    db.commit()
    return raised


def run_risk_prediction_cycle(db: Session, today: date | None = None) -> dict:
    """Scan active trips once. Returns counters for logging/tests."""
    trips = [t for t in db.scalars(select(Trip)) if is_active(t, today)]
    summary = {"scanned": len(trips), "updated": 0, "alerts": 0, "failed": 0}
    for trip in trips:
        try:
            summary["alerts"] += predict_trip(db, trip)
            summary["updated"] += 1
        except Exception:
            db.rollback()
            summary["failed"] += 1
            logger.warning("Risk prediction failed for trip %s", trip.id, exc_info=True)
    logger.info("Risk prediction cycle complete", extra=summary)
    return summary


async def risk_prediction_loop(session_factory, interval_minutes: int, stop: asyncio.Event) -> None:
    """Run cycles until `stop` is set. The DB work happens in a worker thread so
    the event loop keeps serving requests."""
    interval = max(1, interval_minutes) * 60

    def one_cycle() -> None:
        db = session_factory()
        try:
            run_risk_prediction_cycle(db)
        finally:
            db.close()

    while not stop.is_set():
        try:
            await asyncio.to_thread(one_cycle)
        except Exception:
            logger.warning("Risk prediction cycle crashed", exc_info=True)
        try:
            await asyncio.wait_for(stop.wait(), timeout=interval)
        except asyncio.TimeoutError:
            continue
