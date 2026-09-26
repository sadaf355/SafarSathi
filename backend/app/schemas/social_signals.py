from typing import Literal

from app.schemas.base import CamelModel

SignalType = Literal["airport_congestion", "road_waterlogging", "transit_strike", "weather_warning", "crowd_surge", "all_clear"]
Urgency = Literal["low", "medium", "high", "critical"]


class SocialSignalOut(CamelModel):
    id: str
    type: SignalType
    location: str
    lat: float | None = None
    lng: float | None = None
    node_ids: list[str] = []
    urgency: Urgency
    sentiment: float  # -1.0 (distressed) .. +1.0 (positive)
    intensity: float  # 0..1, used to weight Digital Twin confidence
    text: str
    minutes_ago: int
    # Signals are synthesized from live weather at each trip hub - there is no
    # crowd-report data feed connected - and are always labelled as such.
    source: Literal["simulated"] = "simulated"


class SocialSignalsOut(CamelModel):
    trip_id: str
    signals: list[SocialSignalOut]
    overall_sentiment: float
    summary: str
