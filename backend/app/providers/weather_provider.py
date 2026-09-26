"""Open-Meteo weather provider used by the backend risk engine.

The frontend weather service and this provider intentionally use the same
Open-Meteo hourly fields.  Keeping the server-side calculation here means the
risk engine can score the weather at the actual itinerary coordinates and
scheduled hour instead of inferring weather risk from time of day.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any

import httpx


@dataclass(frozen=True)
class WeatherSnapshot:
    temperature: float
    precipitation_probability: int
    wind_speed: float
    weather_code: int
    label: str
    fetched_at: datetime

    @property
    def risk_percent(self) -> int:
        """Convert the live weather signal into a deterministic 0-100 risk."""
        code_risk = {
            0: 0,
            1: 8,
            2: 12,
            3: 18,
            45: 25,
            48: 28,
            51: 32,
            53: 38,
            55: 45,
            56: 48,
            57: 55,
            61: 45,
            63: 55,
            65: 68,
            66: 58,
            67: 72,
            71: 55,
            73: 65,
            75: 78,
            77: 60,
            80: 48,
            81: 58,
            82: 72,
            85: 65,
            86: 78,
            95: 82,
            96: 90,
            99: 95,
        }.get(self.weather_code, 25)
        precipitation_risk = self.precipitation_probability * 0.55
        wind_risk = min(max((self.wind_speed - 20) * 2.0, 0.0), 100.0) * 0.15
        return int(round(min(100.0, max(0.0, code_risk * 0.30 + precipitation_risk + wind_risk))))


class OpenMeteoWeatherProvider:
    """Small cached Open-Meteo client with injectable HTTP transport for tests."""

    FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
    ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
    _cache: dict[str, tuple[WeatherSnapshot, datetime]] = {}

    def __init__(self, client: httpx.Client | None = None, timeout_seconds: float = 5.0):
        self._client = client
        self.timeout_seconds = timeout_seconds
        self._cache: dict[str, tuple[WeatherSnapshot, datetime]] = {}

    @staticmethod
    def _label(code: int) -> str:
        if code == 0:
            return "Clear sky"
        if code in (1, 2):
            return "Partly cloudy"
        if code == 3:
            return "Overcast"
        if code in (45, 48):
            return "Fog"
        if code in (51, 53, 55, 56, 57):
            return "Light rain"
        if code in (61, 63, 65, 66, 67, 80, 81, 82):
            return "Rain showers"
        if code in (71, 73, 75, 77, 85, 86):
            return "Snow showers"
        if code in (95, 96, 99):
            return "Thunderstorm"
        return "Changing conditions"

    @staticmethod
    def _cache_key(lat: float, lng: float, moment: datetime) -> str:
        return f"{lat:.2f},{lng:.2f},{moment:%Y-%m-%d-%H}"

    def _request(self, url: str, params: dict[str, Any]) -> dict[str, Any]:
        if self._client is not None:
            response = self._client.get(url, params=params, timeout=self.timeout_seconds)
        else:
            response = httpx.get(url, params=params, timeout=self.timeout_seconds)
        response.raise_for_status()
        data = response.json()
        if not isinstance(data, dict) or not data.get("hourly"):
            raise ValueError("Open-Meteo returned no hourly weather data")
        return data

    def get_snapshot(self, lat: float, lng: float, moment: datetime) -> WeatherSnapshot:
        key = self._cache_key(lat, lng, moment)
        cached = self._cache.get(key)
        if cached and cached[1] > datetime.utcnow():
            return cached[0]

        day = moment.date()
        # Forecast data is the live path for current/future itinerary dates. For
        # seeded/demo trips in the past, Open-Meteo's archive endpoint supplies the
        # same hourly fields without pretending that an old date is a forecast.
        today = date.today()
        is_forecast = day >= today
        url = self.FORECAST_URL if is_forecast else self.ARCHIVE_URL
        params: dict[str, Any] = {
            "latitude": lat,
            "longitude": lng,
            "hourly": "temperature_2m,precipitation_probability,weather_code,wind_speed_10m",
            "start_date": day.isoformat(),
            "end_date": day.isoformat(),
            "timezone": "auto",
        }
        if is_forecast:
            params["forecast_days"] = 16

        data = self._request(url, params)
        hourly = data["hourly"]
        times = hourly.get("time") or []
        if not times:
            raise ValueError("Open-Meteo returned an empty hourly timeline")

        # Open-Meteo returns local-time hourly strings when timezone=auto. Match the
        # requested scheduled hour, with nearest-hour fallback for unusual inputs.
        target = moment.replace(minute=0, second=0, microsecond=0)
        parsed_times: list[datetime] = []
        for raw in times:
            try:
                parsed_times.append(datetime.fromisoformat(str(raw).replace("Z", "+00:00")).replace(tzinfo=None))
            except ValueError:
                parsed_times.append(datetime.combine(day, datetime.min.time()))
        index = min(range(len(parsed_times)), key=lambda i: abs(parsed_times[i] - target))

        def value(name: str, default: float = 0.0) -> float:
            values = hourly.get(name) or []
            raw = values[index] if index < len(values) else default
            return float(raw if raw is not None else default)

        snapshot = WeatherSnapshot(
            temperature=value("temperature_2m"),
            precipitation_probability=int(round(value("precipitation_probability"))),
            wind_speed=value("wind_speed_10m"),
            weather_code=int(round(value("weather_code"))),
            label=self._label(int(round(value("weather_code")))),
            fetched_at=datetime.utcnow(),
        )
        self._cache[key] = (snapshot, datetime.utcnow() + timedelta(minutes=10))
        return snapshot
