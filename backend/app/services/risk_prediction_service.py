from datetime import datetime

from sqlalchemy.orm import Session

from app.models.activity import ActivityEvent
from app.models.enums import (
    ActivityType,
    NotificationCategory,
    NotificationSeverity,
    RiskLevel,
    SnapshotType,
)
from app.models.notification import Notification
from app.models.risk import RiskSnapshot
from app.repositories.activity_repository import ActivityRepository, NotificationRepository
from app.repositories.risk_snapshot_repository import RiskSnapshotRepository
from app.repositories.trip_repository import TripRepository
from app.services.risk_service import get_risk_analysis


def run_risk_prediction_cycle(db: Session, trip_id: str | None = None) -> list[Notification]:
    trip_repo = TripRepository(db)
    snapshot_repo = RiskSnapshotRepository(db)
    notification_repo = NotificationRepository(db)
    activity_repo = ActivityRepository(db)

    if trip_id is not None:
        target_trip = trip_repo.get(trip_id)
        active_trips = [target_trip] if target_trip is not None else []
    else:
        active_trips = trip_repo.list_active()

    all_notifications: list[Notification] = []

    for trip in active_trips:
        analysis = get_risk_analysis(db, trip.id)
        last_snapshots = snapshot_repo.latest_for_trip(trip.id)

        last_node_snaps: dict[tuple[str, str], RiskSnapshot] = {
            (s.node_id, s.risk_type): s
            for s in last_snapshots
            if s.node_id is not None
        }

        last_weather_snap = next(
            (s for s in last_snapshots if s.snapshot_type == SnapshotType.TRIP and s.risk_type == "weather_risk"),
            None,
        )

        has_prior_snapshots = len(last_snapshots) > 0
        worsened_reasons: list[str] = []
        is_high_severity = False

        if has_prior_snapshots:
            for card in analysis.cards:
                key = (card.node_id, card.risk_type)
                prior_snap = last_node_snaps.get(key)

                if prior_snap is None:
                    worsened_reasons.append(
                        f"{card.node_label}: new risk card ({card.risk_type}, {card.risk_percent}%)"
                    )
                    if card.risk_percent >= 50 or card.risk_level.lower() == "high":
                        is_high_severity = True
                elif card.risk_percent - prior_snap.risk_percent >= 10:
                    diff = card.risk_percent - prior_snap.risk_percent
                    worsened_reasons.append(
                        f"{card.node_label}: {card.risk_type} increased by {diff}% (now {card.risk_percent}%)"
                    )
                    if card.risk_percent >= 50 or card.risk_level.lower() == "high":
                        is_high_severity = True

            if last_weather_snap is not None:
                weather_diff = analysis.score.weather_risk - last_weather_snap.risk_percent
                if weather_diff >= 15:
                    worsened_reasons.append(
                        f"Overall weather risk increased by {weather_diff}% (now {analysis.score.weather_risk}%)"
                    )
                    if analysis.score.weather_risk >= 50:
                        is_high_severity = True

        if worsened_reasons:
            summary = "; ".join(worsened_reasons)
            severity = NotificationSeverity.HIGH if is_high_severity else NotificationSeverity.MEDIUM

            notification = Notification(
                trip_id=trip.id,
                severity=severity,
                category=NotificationCategory.RISK,
                title="Risk level increased",
                message=summary,
                timestamp=datetime.utcnow(),
            )
            notification_repo.add(notification)
            all_notifications.append(notification)

            activity_repo.add(
                ActivityEvent(
                    trip_id=trip.id,
                    type=ActivityType.MONITORING,
                    message="Elevated risk detected",
                    detail=summary,
                    timestamp=datetime.utcnow(),
                )
            )

        now = datetime.utcnow()
        new_snapshots: list[RiskSnapshot] = []

        for card in analysis.cards:
            level_str = card.risk_level.lower()
            level_enum = (
                RiskLevel(level_str)
                if level_str in RiskLevel._value2member_map_
                else RiskLevel.LOW
            )

            new_snapshots.append(
                RiskSnapshot(
                    trip_id=trip.id,
                    node_id=card.node_id,
                    snapshot_type=SnapshotType.NODE,
                    risk_type=card.risk_type,
                    risk_level=level_enum,
                    risk_percent=card.risk_percent,
                    reason=card.node_label,
                    recommendation=card.recommendation or "",
                    created_at=now,
                )
            )

        w_score = analysis.score.weather_risk
        w_level = RiskLevel.HIGH if w_score >= 60 else (RiskLevel.MEDIUM if w_score >= 30 else RiskLevel.LOW)
        new_snapshots.append(
            RiskSnapshot(
                trip_id=trip.id,
                node_id=None,
                snapshot_type=SnapshotType.TRIP,
                risk_type="weather_risk",
                risk_level=w_level,
                risk_percent=w_score,
                reason="Trip weather risk score",
                recommendation="",
                created_at=now,
            )
        )

        snapshot_repo.save_batch(new_snapshots)

    db.commit()
    return all_notifications
