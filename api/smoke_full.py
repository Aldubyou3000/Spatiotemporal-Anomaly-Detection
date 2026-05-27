"""End-to-end smoke test of the ticket system.

Verifies (web side):
  - analyst login → cookie set
  - GET /api/tickets returns 200
  - GET /api/tickets/technicians returns 200
  - POST /api/tickets → 201, returns ticket detail
  - PATCH /api/tickets/{id} → 200, updates status
  - GET /api/tickets/{id} → 200

Usage: python smoke_full.py <analyst_username_or_email> <password>
"""
import sys
import json
import requests

BASE = "http://localhost:8000"


def step(n, label):
    print(f"\n[{n}] {label}")


def main(credential: str, password: str) -> int:
    s = requests.Session()

    step(1, "POST /api/auth/login")
    r = s.post(f"{BASE}/api/auth/login", json={"credential": credential, "password": password})
    print(f"    status: {r.status_code}")
    if r.status_code != 200:
        print(f"    body: {r.text[:400]}")
        return 1
    cookies = dict(s.cookies)
    print(f"    cookies: {list(cookies.keys())}")
    if "access_token" not in cookies:
        print("    FAIL: no access_token cookie set")
        return 1

    step(2, "GET /api/auth/me")
    r = s.get(f"{BASE}/api/auth/me")
    print(f"    status: {r.status_code}")
    if r.status_code != 200:
        print(f"    body: {r.text[:400]}")
        return 1
    me = r.json()
    print(f"    role={me.get('role')} id={me.get('id')}")

    step(3, "GET /api/tickets")
    r = s.get(f"{BASE}/api/tickets")
    print(f"    status: {r.status_code}")
    print(f"    cors-origin: {r.headers.get('access-control-allow-origin')}")
    if r.status_code != 200:
        print(f"    body: {r.text[:400]}")
        return 1
    data = r.json()
    print(f"    total: {data.get('total')}")

    step(4, "GET /api/tickets/technicians")
    r = s.get(f"{BASE}/api/tickets/technicians")
    print(f"    status: {r.status_code}")
    if r.status_code != 200:
        print(f"    body: {r.text[:400]}")
        return 1
    techs = r.json()
    print(f"    technicians: {len(techs)}")
    if not techs:
        print("    WARN: no active technicians -- can't create ticket")
        return 1
    tech_id = techs[0]["id"]

    step(5, f"POST /api/tickets (assigning to technician {tech_id})")
    body = {
        "title": "Smoke test ticket",
        "description": "Created by smoke_full.py",
        "station_id": "QC_AWS_TEST",
        "priority": "medium",
        "anomaly_zone": "C",
        "technician_id": tech_id,
    }
    r = s.post(f"{BASE}/api/tickets", json=body)
    print(f"    status: {r.status_code}")
    if r.status_code not in (200, 201):
        print(f"    body: {r.text[:400]}")
        return 1
    new_ticket = r.json()
    print(f"    ticket_id: {new_ticket['id']}")
    print(f"    status: {new_ticket['status']}")
    print(f"    technician: {new_ticket.get('technician')}")
    ticket_id = new_ticket["id"]

    step(6, f"GET /api/tickets/{ticket_id}")
    r = s.get(f"{BASE}/api/tickets/{ticket_id}")
    print(f"    status: {r.status_code}")
    if r.status_code != 200:
        print(f"    body: {r.text[:400]}")
        return 1

    step(7, f"PATCH /api/tickets/{ticket_id} (assigned -> in-progress)")
    r = s.patch(f"{BASE}/api/tickets/{ticket_id}", json={"status": "in-progress"})
    print(f"    status: {r.status_code}")
    if r.status_code != 200:
        print(f"    body: {r.text[:400]}")
        return 1
    print(f"    status now: {r.json()['status']}")

    step(8, "Clean up - delete the test ticket")
    # No DELETE endpoint exists; the smoke ticket will remain in the DB.
    # User can clean up via Supabase MCP if needed.
    print("    (no DELETE endpoint - leaving the smoke ticket in place)")
    print(f"    Smoke ticket ID for cleanup: {ticket_id}")

    print("\nOK: Full ticket flow works end-to-end.")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python smoke_full.py <credential> <password>")
        sys.exit(2)
    sys.exit(main(sys.argv[1], sys.argv[2]))
