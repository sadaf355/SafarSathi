FLIGHT_NODE = {
    "id": "del-leh",
    "title": "Delhi to Leh",
    "label": "DEL-IXL",
    "provider": "IndiGo",
    "category": "flight",
}


def test_extract_disruption_report_with_delay_and_matching_node(client):
    resp = client.post(
        "/api/assistant/extract-disruption",
        json={
            "tripId": "trip-ladakh-2025",
            "message": "My Delhi to Leh flight got delayed by 3 hours",
            "nodes": [FLIGHT_NODE],
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["type"] == "flight-delay"
    assert body["delayMinutes"] == 180
    assert body["nodeId"] == "del-leh"
    assert body["source"] == "fallback"  # no ANTHROPIC_API_KEY set in tests


def test_extract_disruption_report_detects_weather_disruption(client):
    resp = client.post(
        "/api/assistant/extract-disruption",
        json={
            "tripId": "trip-ladakh-2025",
            "message": "There is a huge storm at the airport right now",
            "nodes": [FLIGHT_NODE],
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["type"] == "weather-disruption"
    assert body["source"] == "fallback"


def test_extract_disruption_report_detects_cancellation(client):
    resp = client.post(
        "/api/assistant/extract-disruption",
        json={
            "tripId": "trip-ladakh-2025",
            "message": "They just told me they cancel my flight",
            "nodes": [FLIGHT_NODE],
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["type"] == "flight-cancellation"
    assert body["source"] == "fallback"


def test_extract_disruption_report_defaults_delay_when_no_duration_mentioned(client):
    resp = client.post(
        "/api/assistant/extract-disruption",
        json={
            "tripId": "trip-ladakh-2025",
            "message": "My flight got delayed",
            "nodes": [FLIGHT_NODE],
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["delayMinutes"] == 180
    assert body["source"] == "fallback"


def test_extract_disruption_report_rejects_empty_message(client):
    resp = client.post(
        "/api/assistant/extract-disruption",
        json={"tripId": "trip-ladakh-2025", "message": "   ", "nodes": [FLIGHT_NODE]},
    )
    assert resp.status_code == 422


def test_extract_disruption_report_returns_null_node_id_when_no_node_matches(client):
    resp = client.post(
        "/api/assistant/extract-disruption",
        json={
            "tripId": "trip-ladakh-2025",
            "message": "Something unrelated to any booking happened, delayed by 45 minutes",
            "nodes": [FLIGHT_NODE],
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["nodeId"] is None
    assert body["source"] == "fallback"
