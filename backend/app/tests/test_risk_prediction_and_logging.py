"""Background risk prediction cycle, structured logging and Sentry init."""

import asyncio
import json
import logging
from datetime import date, datetime

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core import logging as app_logging
from app.database.base import Base
from app.database.seed import seed_if_empty
from app.models.enums import SnapshotType
from app.models.notification import Notification
from app.models.risk import RiskSnapshot
from app.providers.weather_provider import WeatherSnapshot
from app.services import risk_prediction_service, risk_service


@pytest.fixture()
def session_factory(monkeypatch):
    # No network: every weather lookup returns calm conditions.
    monkeypatch.setattr(risk_service._weather_provider, "get_snapshot", lambda lat, lng, moment: WeatherSnapshot(
        temperature=24.0, precipitation_probability=5, wind_speed=8.0, weather_code=1, label="Clear", fetched_at=datetime.now()))
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(bind=engine)
    factory = sessionmaker(bind=engine)
    db = factory()
    seed_if_empty(db)
    db.close()
    return factory


def test_cycle_snapshots_active_trips_only(session_factory):
    db = session_factory()
    # Seeded trips run Sep 2025 - Feb 2026: on 1 Jan 2026 Ladakh has ended, Goa and Rajasthan haven't.
    summary = risk_prediction_service.run_risk_prediction_cycle(db, today=date(2026, 1, 1))
    assert summary == {"scanned": 2, "updated": 2, "alerts": summary["alerts"], "failed": 0}
    trip_rows = db.scalars(select(RiskSnapshot).where(RiskSnapshot.snapshot_type == SnapshotType.TRIP)).all()
    assert sorted(r.trip_id for r in trip_rows) == ["trip-goa-2026", "trip-rajasthan-2026"]


def test_cycle_replaces_previous_snapshots_and_alerts_once(session_factory):
    db = session_factory()
    risk_prediction_service.run_risk_prediction_cycle(db, today=date(2025, 1, 1))
    first = db.query(RiskSnapshot).count()
    first_alerts = db.query(Notification).filter(Notification.title.like("Rising risk:%")).count()
    risk_prediction_service.run_risk_prediction_cycle(db, today=date(2025, 1, 1))
    assert db.query(RiskSnapshot).count() == first  # replaced, not duplicated
    assert db.query(Notification).filter(Notification.title.like("Rising risk:%")).count() == first_alerts


def test_one_failing_trip_does_not_stop_the_cycle(session_factory, monkeypatch):
    real = risk_prediction_service.predict_trip

    def flaky(db, trip):
        if trip.id == "trip-goa-2026":
            raise RuntimeError("boom")
        return real(db, trip)

    monkeypatch.setattr(risk_prediction_service, "predict_trip", flaky)
    summary = risk_prediction_service.run_risk_prediction_cycle(session_factory(), today=date(2025, 1, 1))
    assert summary["failed"] == 1 and summary["updated"] == 2


def test_loop_runs_and_stops_gracefully(session_factory, monkeypatch):
    calls = []
    monkeypatch.setattr(risk_prediction_service, "run_risk_prediction_cycle", lambda db, today=None: calls.append(1))

    async def scenario():
        stop = asyncio.Event()
        task = asyncio.create_task(risk_prediction_service.risk_prediction_loop(session_factory, 1, stop))
        await asyncio.sleep(0.2)
        stop.set()
        await asyncio.wait_for(task, timeout=2)

    asyncio.run(scenario())
    assert calls == [1]


def test_json_logging_includes_request_id_and_extras(capsys):
    app_logging.configure_logging("json", "INFO")
    token = app_logging.request_id_var.set("req_test123")
    try:
        logging.getLogger("triprescue.test").info("hello", extra={"trip_id": "t1"})
    finally:
        app_logging.request_id_var.reset(token)
        app_logging.configure_logging("console", "INFO")
    line = [l for l in capsys.readouterr().out.splitlines() if '"hello"' in l][0]
    record = json.loads(line)
    assert record["request_id"] == "req_test123" and record["trip_id"] == "t1" and record["level"] == "INFO"


def test_request_id_header_round_trips(client):
    resp = client.get("/api/health", headers={"X-Request-ID": "req_abc"})
    assert resp.headers["X-Request-ID"] == "req_abc"


def test_sentry_is_optional():
    assert app_logging.init_sentry(None, "test") is False
    assert app_logging.init_sentry("not-a-dsn", "test") is False  # bad DSN is logged, not raised
