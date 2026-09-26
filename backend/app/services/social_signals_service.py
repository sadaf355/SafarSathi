"""Ground-level crowd & social signals for the hubs on a trip.

There is no crowd-report data feed connected to Safar Sathi, so these signals
are *synthesized* from real inputs - the live Open-Meteo conditions at each hub
(or a Digital Twin scenario) and the bookings scheduled there - using simple,
documented rules. Every signal is labelled source="simulated" and the UI says
so. Output is deterministic for the same inputs, so the ticker is stable
between polls and the twin's confidence scoring is reproducible.

Signal intensity (0..1) feeds the Digital Twin: corroborating ground signals
at a booking's location raise its failure probability and narrow the
uncertainty band.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.engines.digital_twin_engine import WeatherScenario
from app.repositories.node_repository import NodeRepository
from app.schemas.social_signals import SocialSignalOut, SocialSignalsOut
from app.services import weather_service
from app.services.trip_service import get_trip


@dataclass(frozen=True)
class HubConditions:
    rainfall_mm: float
    wind_kmh: float
    visibility_m: float
    temperature_c: float


def _stable(*parts: object) -> float:
    digest = hashlib.sha256("|".join(map(str, parts)).encode()).hexdigest()
    return int(digest[:8], 16) / 0xFFFFFFFF


def _hubs(nodes: list) -> list[dict]:
    """One hub per distinct location that has coordinates."""
    coords = weather_service.node_coordinates(nodes)
    hubs: dict[str, dict] = {}
    for n in nodes:
        if weather_service.category_of(n) == "connection" or n.id not in coords:
            continue
        name = (n.location or n.title).split(" T")[0]
        hub = hubs.setdefault(name, {"name": name, "lat": coords[n.id][0], "lng": coords[n.id][1], "nodes": [], "airport": False})
        hub["nodes"].append(n.id)
        hub["airport"] = hub["airport"] or weather_service.category_of(n) in ("flight", "return") or "(" in (n.location or "")
    return list(hubs.values())


def _urgency(intensity: float) -> str:
    return "critical" if intensity >= 0.85 else "high" if intensity >= 0.6 else "medium" if intensity >= 0.35 else "low"


def signals_for_conditions(hub: dict, c: HubConditions, salt: str, storm_hours: float = 0) -> list[SocialSignalOut]:
    name = hub["name"]
    place = f"{name} airport" if hub["airport"] else name
    jitter = _stable(salt, name)
    minutes_ago = 3 + int(jitter * 40)
    out: list[tuple[str, float, float, str]] = []  # type, intensity, sentiment, text

    if c.rainfall_mm >= 20:
        intensity = min(1.0, c.rainfall_mm / 70)
        extra = 20 + int(c.rainfall_mm * 0.8)
        out.append(("road_waterlogging", intensity, -0.3 - 0.6 * intensity,
                    f"Heavy waterlogging reported near {place} approach roads; cabs taking +{extra} min alternate routes."))
    if c.visibility_m < 1000:
        intensity = min(1.0, (1000 - c.visibility_m) / 900)
        wait = 25 + int(intensity * 70)
        out.append(("airport_congestion" if hub["airport"] else "weather_warning", intensity, -0.2 - 0.6 * intensity,
                    f"Fog holds at {place}: departures queueing, security waits around {wait} min." if hub["airport"]
                    else f"Dense fog around {name}; visibility near {int(c.visibility_m)} m on highways."))
    if c.wind_kmh >= 50:
        intensity = min(1.0, (c.wind_kmh - 40) / 70)
        out.append(("weather_warning", intensity, -0.3 - 0.5 * intensity,
                    f"Gale warning for {name}: {int(c.wind_kmh)} km/h gusts, boat rides and outdoor tours suspended."))
    if c.temperature_c >= 42:
        intensity = min(1.0, (c.temperature_c - 40) / 8)
        out.append(("weather_warning", intensity, -0.2 - 0.4 * intensity,
                    f"Heat advisory in {name} ({c.temperature_c:.0f} °C): sightseeing crowds shifting to early morning."))
    stressed = [o for o in out if o[1] >= 0.5]
    if hub["airport"] and stressed:
        intensity = min(1.0, max(o[1] for o in stressed) * 0.85)
        out.append(("crowd_surge", intensity, -0.25 - 0.4 * intensity,
                    f"Crowds building at {place} departures as delayed flights stack up; rebooking desks busy."))
    if storm_hours >= 8 and stressed:
        out.append(("transit_strike", 0.55, -0.5,
                    f"Cab aggregators around {name} pausing airport runs until the storm passes; expect surge pricing."))
    if not out:
        out.append(("all_clear", 0.05, 0.45, f"Traffic flowing normally around {place}; no ground disruptions reported."))

    return [
        SocialSignalOut(
            id=f"sig-{hashlib.sha1(f'{salt}{name}{kind}'.encode()).hexdigest()[:10]}",
            type=kind, location=name, lat=hub["lat"], lng=hub["lng"], node_ids=list(hub["nodes"]),
            urgency=_urgency(intensity), sentiment=round(max(-1.0, min(1.0, sentiment)), 2),
            intensity=round(intensity, 2), text=text, minutes_ago=minutes_ago + i * 7,
        )
        for i, (kind, intensity, sentiment, text) in enumerate(out)
    ]


def _summarize(trip_id: str, signals: list[SocialSignalOut]) -> SocialSignalsOut:
    overall = round(sum(s.sentiment for s in signals) / len(signals), 2) if signals else 0.0
    worst = max(signals, key=lambda s: s.intensity, default=None)
    if worst is None or worst.type == "all_clear":
        summary = "Ground conditions look normal across your trip."
    else:
        summary = f"{len([s for s in signals if s.type != 'all_clear'])} ground report(s); most urgent: {worst.text}"
    order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    return SocialSignalsOut(trip_id=trip_id, signals=sorted(signals, key=lambda s: (order[s.urgency], s.minutes_ago)),
                            overall_sentiment=overall, summary=summary)


def trip_signals(db: Session, trip_id: str, traveler_id: str | None = None) -> SocialSignalsOut:
    """Signals from the live weather at each hub right now."""
    get_trip(db, trip_id, traveler_id)
    nodes = NodeRepository(db).list_for_trip(trip_id)
    signals: list[SocialSignalOut] = []
    for hub in _hubs(nodes):
        now = weather_service.get_forecast(hub["lat"], hub["lng"]).current
        conditions = HubConditions(now.rainfall_mm, now.wind_speed_kmh, now.visibility_m, now.temperature_c)
        signals += signals_for_conditions(hub, conditions, salt=f"{trip_id}:{now.time:%Y%m%d%H}")
    return _summarize(trip_id, signals)


def scenario_signals(trip_id: str, nodes: list, scenario: WeatherScenario) -> SocialSignalsOut:
    """Signals the Digital Twin expects under a what-if weather scenario."""
    conditions = HubConditions(scenario.rainfall_mm_per_hour, scenario.wind_speed_kmh, scenario.visibility_meters, scenario.temperature_celsius)
    affected = None
    if scenario.affected_node_id:
        target = next((n for n in nodes if n.id == scenario.affected_node_id), None)
        affected = (target.location or target.title).split(" T")[0] if target else None
    signals: list[SocialSignalOut] = []
    for hub in _hubs(nodes):
        if affected and hub["name"] != affected:
            continue
        signals += signals_for_conditions(hub, conditions, salt=f"{trip_id}:{scenario.name}", storm_hours=scenario.storm_duration_hours)
    return _summarize(trip_id, signals)


def intensity_by_node(signals: SocialSignalsOut) -> dict[str, float]:
    """Strongest signal touching each booking (0..1)."""
    out: dict[str, float] = {}
    for s in signals.signals:
        if s.type == "all_clear":
            continue
        for nid in s.node_ids:
            out[nid] = max(out.get(nid, 0.0), s.intensity)
    return out
