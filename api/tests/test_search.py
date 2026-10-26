"""Audit search must query all records and share its filters with export."""
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
for key in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY", "SUPABASE_JWT_SECRET"):
    os.environ.setdefault(key, "http://127.0.0.1:1" if key == "SUPABASE_URL" else "test")
import httpx
from postgrest import SyncPostgrestClient
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.routers import audit
from app.core.dependencies import require_analyst

class AuditSearchTests(unittest.TestCase):
    def test_search_count_pagination_and_export_use_same_filters(self):
        requests = []
        def respond(request):
            requests.append(request)
            return httpx.Response(200, json=[], headers={"content-range": "*/1234"})
        app = FastAPI()
        app.include_router(audit.router)
        app.dependency_overrides[require_analyst] = lambda: {"id": "analyst"}
        with httpx.Client(transport=httpx.MockTransport(respond)) as transport:
            sb = SyncPostgrestClient("http://database.test", http_client=transport)
            with patch.object(audit, "get_supabase", return_value=sb):
                client = TestClient(app)
                response = client.get("/api/audit", params={"search": " Lynn ", "event": "login_success", "success": "true", "offset": 50})
                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual(response.json()["total"], 1234)
                listing = requests[-1]
                self.assertIn('actor_name.ilike."%Lynn%"', listing.url.params["or"])
                self.assertIn('actor_email.ilike."%Lynn%"', listing.url.params["or"])
                self.assertIn('ip.ilike."%Lynn%"', listing.url.params["or"])
                self.assertEqual(listing.url.params["offset"], "50")
                self.assertIn("count=exact", listing.headers["prefer"])
                self.assertEqual(client.get("/api/audit/export", params={"search": " Lynn ", "event": "login_success", "success": "true"}).status_code, 200)
                for key in ("or", "event", "success"):
                    self.assertEqual(listing.url.params[key], requests[-1].url.params[key])
                self.assertEqual(client.get("/api/audit", params={"search": "x" * 201}).status_code, 422)

    def test_search_quotes_special_filter_characters(self):
        requests = []
        def respond(request):
            requests.append(request)
            return httpx.Response(200, json=[])
        with httpx.Client(transport=httpx.MockTransport(respond)) as transport:
            sb = SyncPostgrestClient("http://database.test", http_client=transport)
            audit._build_query(sb, event=None, user_id=None, entity_type=None, entity_id=None,
                ip=None, success=None, from_dt=None, to_dt=None, search='name",event.eq.hidden%_').execute()
        expression = requests[0].url.params["or"]
        self.assertIn(r'name\",event.eq.hidden', expression)
        self.assertIn(r'\\%\\_', expression)

if __name__ == "__main__":
    unittest.main()
