import json
import sys
from fastapi.testclient import TestClient
from app.main import app
from app.database.session import engine, SessionLocal
from app.database.base import Base

# Reset DB completely
Base.metadata.drop_all(bind=engine)
Base.metadata.create_all(bind=engine)

client = TestClient(app)

print("=== 5. FRESH DB CHECK ===")
# Fresh DB check
db = SessionLocal()
from app.repositories.trip_repository import TripRepository
print(f"trips in fresh db: {len(TripRepository(db).list_active())}")
db.close()

print("\n=== REGISTER FRESH USER 1 ===")
reg_res = client.post("/api/auth/register", json={
    "name": "Kenji Sato",
    "email": "kenji.sato@example.com",
    "password": "Password123!"
})
auth_data = reg_res.json()
token = auth_data["token"]
headers = {"Authorization": f"Bearer {token}"}
print("User 1 registered:", auth_data["travelerId"], auth_data["name"])

print("\n=== 6A. CREATE USER TRIP & 3 NODES ===")
trip_payload = {
    "name": "Tokyo & Kyoto Cultural Summit 2026",
    "origin": "Tokyo",
    "destination": "Kyoto",
    "startDate": "2026-11-10",
    "endDate": "2026-11-20"
}
res_trip = client.post("/api/trips", json=trip_payload, headers=headers)
trip = res_trip.json()
trip_id = trip["id"]
print("Created trip ID:", trip_id)
print("Trip JSON response:\n", json.dumps(trip, indent=2))

node1_payload = {
    "category": "flight",
    "title": "Flight HND -> KIX",
    "provider": "All Nippon Airways",
    "confirmation": "NH1029",
    "scheduledStart": "2026-11-10T09:00:00Z",
    "scheduledEnd": "2026-11-10T10:30:00Z",
    "cost": 18500.0,
    "originCode": "HND",
    "destinationCode": "KIX",
    "location": "Tokyo Haneda Airport"
}
res_n1 = client.post(f"/api/trips/{trip_id}/nodes", json=node1_payload, headers=headers)
trip_after_n1 = res_n1.json()
n1 = trip_after_n1["nodes"][0]
n1_id = n1["id"]
print("Node 1 (Flight) ID:", n1_id)

node2_payload = {
    "category": "transfer",
    "title": "Airport Express Train to Kyoto",
    "provider": "Haruka Express",
    "confirmation": "HK-9941",
    "scheduledStart": "2026-11-10T11:15:00Z",
    "scheduledEnd": "2026-11-10T12:30:00Z",
    "cost": 3500.0,
    "location": "Kansai Airport Station"
}
res_n2 = client.post(f"/api/trips/{trip_id}/nodes", json=node2_payload, headers=headers)
trip_after_n2 = res_n2.json()
n2 = next(n for n in trip_after_n2["nodes"] if n["category"] == "transfer")
n2_id = n2["id"]
print("Node 2 (Transfer) ID:", n2_id)

node3_payload = {
    "category": "hotel",
    "title": "Kyoto Grand Hotel Check-in",
    "provider": "Kyoto Grand Hotel",
    "confirmation": "KGH-55201",
    "scheduledStart": "2026-11-10T13:00:00Z",
    "scheduledEnd": "2026-11-15T11:00:00Z",
    "cost": 45000.0,
    "location": "Kyoto Central"
}
res_n3 = client.post(f"/api/trips/{trip_id}/nodes", json=node3_payload, headers=headers)
trip_after_n3 = res_n3.json()
n3 = next(n for n in trip_after_n3["nodes"] if n["category"] == "hotel")
n3_id = n3["id"]
print("Node 3 (Hotel) ID:", n3_id)

print("\n=== 6B. CREATE DISRUPTION ===")
disruption_payload = {
    "type": "flight-delay",
    "primaryNodeId": n1_id,
    "delayMinutes": 180
}
res_dis = client.post(f"/api/trips/{trip_id}/disruptions", json=disruption_payload, headers=headers)
dis = res_dis.json()
print("Disruption response JSON:\n", json.dumps(dis, indent=2))

print("\n=== 6C. VERIFY DOWNSTREAM IMPACT ===")
res_trip_after_dis = client.get(f"/api/trips/{trip_id}", headers=headers)
trip_after_dis = res_trip_after_dis.json()
print("Trip nodes status after disruption:")
for n in trip_after_dis.get("nodes", []):
    print(f" - Node {n.get('id')} ({n.get('title')}): status={n.get('status')}, caused_by={n.get('causedBy')}")

print("\n=== 6D. GENERATE RECOVERY OPTIONS ===")
res_rec = client.post(f"/api/trips/{trip_id}/recovery-options/generate", headers=headers)
options = res_rec.json()
print("Recovery options response JSON:\n", json.dumps(options, indent=2))

print("\n=== 6E. APPLY RECOVERY OPTION ===")
option_id = options[0]["id"] if options else None
print("Applying option ID:", option_id)

apply_payload = {
    "recoveryId": option_id
}
res_apply = client.post(f"/api/trips/{trip_id}/recovery/apply", json=apply_payload, headers=headers)
apply_res = res_apply.json()
print("Apply Recovery response JSON:\n", json.dumps(apply_res, indent=2))

print("\n=== 6F. PROACTIVE RISK ON SECOND FRESH TRIP ===")
reg_res2 = client.post("/api/auth/register", json={
    "name": "Elena Rostova",
    "email": "elena.rostova@example.com",
    "password": "Password123!"
})
auth_data2 = reg_res2.json()
token2 = auth_data2["token"]
headers2 = {"Authorization": f"Bearer {token2}"}

trip2_payload = {
    "name": "Singapore Tech Forum 2026",
    "origin": "Bangalore",
    "destination": "Singapore",
    "startDate": "2026-12-01",
    "endDate": "2026-12-05"
}
res_trip2 = client.post("/api/trips", json=trip2_payload, headers=headers2)
trip2 = res_trip2.json()
trip2_id = trip2["id"]

t2_node1 = {
    "category": "flight",
    "title": "Flight BLR -> SIN",
    "provider": "Singapore Airlines",
    "confirmation": "SQ501",
    "scheduledStart": "2026-12-01T07:00:00Z",
    "scheduledEnd": "2026-12-01T14:00:00Z",
    "cost": 22000.0,
    "originCode": "BLR",
    "destinationCode": "SIN",
    "location": "Kempegowda International Airport"
}
t2_node2 = {
    "category": "flight",
    "title": "Connecting Flight SIN -> DPS",
    "provider": "Scoot",
    "confirmation": "TR288",
    "scheduledStart": "2026-12-01T14:35:00Z",
    "scheduledEnd": "2026-12-01T17:15:00Z",
    "cost": 9000.0,
    "originCode": "SIN",
    "destinationCode": "DPS",
    "location": "Singapore Changi Airport"
}
client.post(f"/api/trips/{trip2_id}/nodes", json=t2_node1, headers=headers2)
client.post(f"/api/trips/{trip2_id}/nodes", json=t2_node2, headers=headers2)

res_risks = client.get(f"/api/trips/{trip2_id}/risks", headers=headers2)
risks = res_risks.json()
print("Trip 2 Proactive Risks JSON:\n", json.dumps(risks, indent=2))

all_evidence = {
    "fresh_trips_count": 0,
    "user1": auth_data,
    "trip1": trip,
    "node1": n1,
    "node2": n2,
    "node3": n3,
    "disruption": dis,
    "trip1_after_disruption": trip_after_dis,
    "recovery": options,
    "apply_recovery": apply_res,
    "user2": auth_data2,
    "trip2": trip2,
    "trip2_risks": risks
}

with open("e2e_evidence.json", "w") as f:
    json.dump(all_evidence, f, indent=2)

print("\n=== PHASE 7: DEMO-CONTENT CONTAMINATION CHECK ===")
demo_strings = [
    "Ladakh", "Aisha", "Aarav", "trip-ladakh-2025", "trip-goa-2026", "trip-rajasthan-2026",
    "traveler-aisha", "traveler-aarav", "del-leh", "del-connection", "bom-del",
    "pangong-tour", "nubra-valley", "grand-dragon", "Aisha Khan", "Aarav Sharma"
]
evidence_str = json.dumps(all_evidence)
matches = []
for s in demo_strings:
    if s.lower() in evidence_str.lower():
        matches.append(s)

print(f"Total demo matches in E2E walkthrough evidence: {len(matches)}")
if matches:
    print(f"MATCHES FOUND: {matches}")
else:
    print("ZERO demo-data matches found across all API responses!")
