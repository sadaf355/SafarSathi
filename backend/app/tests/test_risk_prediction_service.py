import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database.base import Base
from app.database.seed import seed_if_empty
from app.models.enums import ActivityType, NotificationCategory
from app.repositories.activity_repository import ActivityRepository
from app.repositories.risk_snapshot_repository import RiskSnapshotRepository
from app.schemas.risk import RiskAnalysisOut, RiskCardOut
from app.services import risk_prediction_service
from app.services.risk_prediction_service import run_risk_prediction_cycle


@pytest.fixture()
def db():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()

    seed_if_empty(session)

    yield session
    session.close()


def test_risk_prediction_cycle_baseline_and_card_worsening(db, monkeypatch):
    trip_id = "trip-ladakh-2025"

    # 1. Run baseline cycle
    notifs_baseline = run_risk_prediction_cycle(db)
    assert notifs_baseline == []

    snapshot_repo = RiskSnapshotRepository(db)
    snapshots = snapshot_repo.latest_for_trip(trip_id)
    assert len(snapshots) > 0

    # 2. Mock get_risk_analysis to simulate increased card risk (+20%)
    real_get_risk_analysis = risk_prediction_service.get_risk_analysis
    base_analysis = real_get_risk_analysis(db, trip_id)

    worsened_cards = [c.model_copy() for c in base_analysis.cards]
    if worsened_cards:
        worsened_cards[0].risk_percent += 20
    else:
        worsened_cards.append(
            RiskCardOut(
                node_id="bom-del",
                node_label="Mumbai → Delhi",
                risk_type="HIGH CONNECTION RISK",
                risk_level="high",
                risk_percent=75,
                historical_risk="Elevated",
                downstream_impact=3,
                recommendation="Monitor flight status",
            )
        )

    worsened_analysis = RiskAnalysisOut(
        score=base_analysis.score,
        cards=worsened_cards,
        alerts=base_analysis.alerts,
    )

    def mock_get_risk_analysis(session, tid):
        if tid == trip_id:
            return worsened_analysis
        return real_get_risk_analysis(session, tid)

    monkeypatch.setattr(risk_prediction_service, "get_risk_analysis", mock_get_risk_analysis)

    # 3. Run cycle again -> expect Notification created for worsening
    notifs_worsened = run_risk_prediction_cycle(db)
    assert len(notifs_worsened) == 1
    notif = notifs_worsened[0]
    assert notif.trip_id == trip_id
    assert notif.category == NotificationCategory.RISK
    assert "increased" in notif.message.lower() or "new risk" in notif.message.lower()

    # 4. Assert ActivityEvent was created
    act_repo = ActivityRepository(db)
    events = act_repo.list_for_trip(trip_id)
    monitoring_events = [
        e for e in events if e.type == ActivityType.MONITORING and "Elevated risk detected" in e.message
    ]
    assert len(monitoring_events) >= 1


def test_risk_prediction_cycle_weather_worsening(db, monkeypatch):
    trip_id = "trip-ladakh-2025"

    # Baseline cycle
    run_risk_prediction_cycle(db)

    real_get_risk_analysis = risk_prediction_service.get_risk_analysis
    base_analysis = real_get_risk_analysis(db, trip_id)

    # Increase weather risk score by 20 points
    new_score = base_analysis.score.model_copy()
    new_score.weather_risk += 20

    worsened_analysis = RiskAnalysisOut(
        score=new_score,
        cards=base_analysis.cards,
        alerts=base_analysis.alerts,
    )

    monkeypatch.setattr(
        risk_prediction_service,
        "get_risk_analysis",
        lambda session, tid: worsened_analysis if tid == trip_id else real_get_risk_analysis(session, tid),
    )

    notifs = run_risk_prediction_cycle(db)
    assert len(notifs) == 1
    assert "weather risk increased" in notifs[0].message.lower()
