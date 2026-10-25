"""Saved history must preserve evidence and authenticate every review."""
import sys
import os
import json
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
for key, value in {"SUPABASE_URL": "http://127.0.0.1:1", "SUPABASE_SERVICE_ROLE_KEY": "test", "SUPABASE_ANON_KEY": "test", "SUPABASE_JWT_SECRET": "test"}.items():
    os.environ.setdefault(key, value)
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError
import httpx
from postgrest import SyncPostgrestClient
from app.schemas.auth import UserProfile
from app.schemas.zones import ProcessResult
from app.services import history_service as history
from app.schemas.history import ReviewChange


USER = UserProfile(id="18eb498a-e434-4818-bbf6-e541353a4225", username="analyst", full_name="Analyst One", email="a@example.com", role="analyst")
RUN = "38eb498a-e434-4818-bbf6-e541353a4225"


def result():
    return ProcessResult.model_validate({
        "summary": {"total_rows": 2, "total_stations": 1, "total_anomalies": 1, "anomaly_rate": 50, "anomalous_stations": 1, "processing_time_seconds": 1},
        "quality_report": {"total_input_rows": 2, "total_input_stations": 1, "rows_excluded": 0, "stations_excluded": 0, "exclusion_details": {}, "summary_text": ""},
        "cleaned_data": [], "flagged_data": [
            {"station_id": "A", "date": "2023-01-01", "latitude": 14, "longitude": 121, "rainfall": 30, "is_anomaly": True, "lof_score": -3},
            {"station_id": "A", "date": "2023-01-02", "latitude": 14, "longitude": 121, "rainfall": 0, "is_anomaly": False},
        ], "neighbors": {}, "anomaly_summary": [], "processed_at": "2026-10-25T00:00:00Z",
    })


class HistoryTests(unittest.TestCase):
    def test_snapshot_preserves_flags_and_fingerprints_each_source(self):
        sb = MagicMock()
        original = result()
        before = original.model_dump(mode="json")
        with patch.object(history.audit, "log"):
            history.save_run(sb, RUN, original, history.describe_files([("A.csv", b"one"), ("B.csv", b"two")]), USER, "Station review")
        call = sb.rpc.call_args
        self.assertEqual(call.args[0], "save_processing_run")
        body = call.args[1]["p_run"]
        self.assertEqual(len(body["files"]), 2)
        self.assertNotEqual(body["files"][0]["sha256"], body["files"][1]["sha256"])
        self.assertEqual(body["processed_by"], USER.id)
        self.assertEqual(call.args[1]["p_result"]["flagged_data"], before["flagged_data"])
        self.assertEqual(original.model_dump(mode="json"), before)

    def test_storage_failure_keeps_result_and_marks_it_unsaved(self):
        original = result()
        with self.assertLogs("history", level="ERROR"), patch.object(history, "get_supabase", side_effect=RuntimeError("secret database detail")):
            updated = history.try_save_run(RUN, original, history.describe_files([("A.csv", b"one")]), USER, "Station review")
        self.assertFalse(updated.history_saved)
        self.assertEqual(updated.run_id, RUN)
        self.assertEqual(updated.flagged_data, original.flagged_data)
        self.assertNotIn("secret", updated.history_error)

    def test_only_flagged_station_dates_can_be_reviewed_or_linked_as_readings(self):
        sb = MagicMock()
        query = sb.table.return_value.select.return_value.eq.return_value
        def contains(column, values):
            self.assertEqual(column, "flagged_readings")
            rows = [{"id": RUN}] if json.loads(values) == [{"station_id": "A", "date": "2023-01-01"}] else []
            query.limit.return_value.execute.return_value.data = rows
            return query
        query.contains.side_effect = contains
        history.validate_reading(sb, RUN, "A", "2023-01-01")
        for station, day in [("A", "2023-01-02"), ("B", "2023-01-01")]:
            with self.assertRaises(HTTPException) as caught:
                history.validate_reading(sb, RUN, station, day)
            self.assertEqual(caught.exception.status_code, 422)

    def test_review_uses_authenticated_actor_and_revision_not_client_metadata(self):
        sb = MagicMock()
        sb.rpc.return_value.execute.return_value.data = {"revision": 2, "status": "anomaly"}
        body = ReviewChange(station_id="A", date="2023-01-01", status="anomaly", note="  checked  ", expected_revision=1)
        with patch.object(history, "validate_reading"), patch.object(history.audit, "log"):
            history.save_review(sb, RUN, body, USER)
        params = sb.rpc.call_args.args[1]
        self.assertEqual(params["p_reviewer_id"], USER.id)
        self.assertEqual(params["p_expected_revision"], 1)
        self.assertEqual(params["p_note"], "checked")
        self.assertNotIn("reviewed_at", params)

    def test_stale_review_is_rejected(self):
        sb = MagicMock()
        sb.rpc.return_value.execute.return_value.data = {"conflict": True}
        with patch.object(history, "validate_reading"):
            with self.assertRaises(HTTPException) as caught:
                history.save_review(sb, RUN, ReviewChange(station_id="A", date="2023-01-01", status=None), USER)
        self.assertEqual(caught.exception.status_code, 409)

    def test_ticket_cannot_link_to_a_different_station_in_run(self):
        sb = MagicMock()
        sb.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [{"station_ids": ["A"]}]
        with self.assertRaises(HTTPException) as caught:
            history.validate_ticket_link(sb, RUN, "B", None)
        self.assertEqual(caught.exception.status_code, 422)

    def test_caller_cannot_forge_reviewer_or_submit_an_invalid_decision(self):
        for extras in [{"reviewer_id": "forged"}, {"reviewed_at": "2020-01-01"}, {"status": "safe"}, {"note": "x" * 1001}]:
            with self.assertRaises(ValidationError):
                ReviewChange.model_validate({"station_id": "A", "date": "2023-01-01", "status": "anomaly", **extras})

    def test_zero_flags_are_still_saved(self):
        sb = MagicMock()
        original = result()
        original.flagged_data[0].is_anomaly = False
        with patch.object(history.audit, "log"):
            history.save_run(sb, RUN, original, history.describe_files([("A.csv", b"one")]), USER, "Station review")
        self.assertEqual(sb.rpc.call_args.args[1]["p_run"]["flagged_count"], 0)

    def test_retry_uses_same_run_identity_without_changing_snapshot(self):
        sb = MagicMock()
        sb.rpc.return_value.execute.return_value.data = False  # already inserted transactionally
        with patch.object(history.audit, "log") as log:
            history.save_run(sb, RUN, result(), history.describe_files([("A.csv", b"one")]), USER, "Station review")
        self.assertEqual(sb.rpc.call_args.args[1]["p_run"]["id"], RUN)
        log.assert_not_called()

    def test_history_endpoints_reject_technicians_and_anonymous_callers(self):
        from app.routers.history import router
        from app.core.dependencies import get_current_user
        app = FastAPI()
        app.include_router(router)
        client = TestClient(app)
        self.assertEqual(client.get("/api/history").status_code, 401)
        app.dependency_overrides[get_current_user] = lambda: {"role": "technician"}
        self.assertEqual(client.get("/api/history").status_code, 403)
        self.assertEqual(client.patch(f"/api/history/{RUN}/reviews", json={"station_id": "A", "date": "2023-01-01", "status": "anomaly"}).status_code, 403)

    def test_review_endpoint_normalizes_authenticated_profile(self):
        from app.routers import history as router_module
        from app.core.dependencies import require_analyst
        app = FastAPI()
        app.include_router(router_module.router)
        app.dependency_overrides[require_analyst] = lambda: USER.model_dump()
        saved = {"station_id": "A", "date": "2023-01-01", "status": "anomaly", "note": "", "reviewer_id": USER.id,
                 "reviewed_by": USER.full_name, "reviewed_at": "2026-10-25T00:00:00Z", "revision": 1}
        with patch.object(router_module, "get_supabase"), patch.object(history, "save_review", return_value=saved) as save:
            client = TestClient(app, cookies={"csrf_token": "test-csrf"})
            response = client.patch(f"/api/history/{RUN}/reviews", headers={"X-CSRF-Token": "test-csrf"}, json={"station_id": "A", "date": "2023-01-01", "status": "anomaly"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(save.call_args.args[3].id, USER.id)

    def test_review_endpoint_encodes_jsonb_with_real_postgrest_client(self):
        from app.routers import history as router_module
        from app.core.dependencies import require_analyst
        station = 'Station "North", {A}'
        saved = {"station_id": station, "date": "2023-01-01", "status": "anomaly", "note": "checked",
                 "reviewer_id": USER.id, "reviewed_by": USER.full_name, "reviewed_at": "2026-10-25T00:00:00Z", "revision": 1}
        requests = []

        def respond(request):
            requests.append(request)
            if request.method == "GET":
                predicate = request.url.params["flagged_readings"]
                self.assertTrue(predicate.startswith("cs."))
                self.assertEqual(json.loads(predicate[3:]), [{"station_id": station, "date": "2023-01-01"}])
                return httpx.Response(200, json=[{"id": RUN}])
            self.assertEqual(request.url.path, "/rpc/save_processing_review")
            self.assertEqual(json.loads(request.content)["p_station_id"], station)
            return httpx.Response(200, json=saved)

        app = FastAPI()
        app.include_router(router_module.router)
        app.dependency_overrides[require_analyst] = lambda: USER.model_dump()
        with httpx.Client(transport=httpx.MockTransport(respond)) as transport:
            sb = SyncPostgrestClient("http://database.test", http_client=transport)
            with patch.object(router_module, "get_supabase", return_value=sb), patch.object(history.audit, "log"):
                response = TestClient(app, cookies={"csrf_token": "test"}).patch(
                    f"/api/history/{RUN}/reviews", headers={"X-CSRF-Token": "test"},
                    json={"station_id": station, "date": "2023-01-01", "status": "anomaly", "note": "checked"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), saved)
        self.assertEqual(len(requests), 2)

    def test_cookie_review_write_requires_matching_csrf_token(self):
        from app.routers import history as router_module
        from app.core.dependencies import require_analyst
        app = FastAPI()
        app.include_router(router_module.router)
        app.dependency_overrides[require_analyst] = lambda: USER.model_dump()
        with patch.object(router_module, "get_supabase"), patch.object(history, "save_review") as save:
            response = TestClient(app, raise_server_exceptions=False).patch(f"/api/history/{RUN}/reviews", json={"station_id": "A", "date": "2023-01-01", "status": "anomaly"})
        self.assertEqual(response.status_code, 403)
        save.assert_not_called()

    def test_follow_up_ticket_keeps_latest_submitted_inspection_visible(self):
        from app.services import tickets_service
        sb = MagicMock()
        batch = sb.table.return_value.select.return_value.in_.return_value.not_.is_.return_value.order.return_value.range.return_value.execute
        batch.return_value.data = [{"id": "prior-report", "ticket_id": "ticket-1", "is_active": False, "submitted_at": "2026-10-24T00:00:00Z"}]
        with patch.object(history, "get_run"), patch.object(tickets_service, "list_tickets", return_value={"items": [{"id": "ticket-1"}], "total": 1}):
            response = history.linked_tickets(sb, RUN, 20, 0)
        self.assertIsNotNone(response["items"][0]["inspection"])
        self.assertEqual(response["items"][0]["inspection"]["id"], "prior-report")

    def test_processing_is_temporary_and_never_saves_to_history_automatically(self):
        from app.routers import zones
        actor = USER
        payload = [("A.csv", b"one")]
        zones._jobs[RUN] = {"status": "processing", "user_id": actor.id, "user": actor, "files": history.describe_files(payload)}
        try:
            with patch.object(zones, "run_pipeline_multi", return_value=result()), patch.object(zones, "try_save_run") as save:
                zones._run_job(RUN, payload, actor)
            save.assert_not_called()
            self.assertEqual(zones._jobs[RUN]["status"], "done")
            self.assertFalse(zones._jobs[RUN]["result"]["history_saved"])
            self.assertEqual(zones._jobs[RUN]["result"]["run_id"], RUN)
            self.assertIsNone(zones._jobs[RUN]["result"]["history_error"])
            self.assertEqual(zones._jobs[RUN]["files"], history.describe_files(payload))
            self.assertNotIn("payload", zones._jobs[RUN])
        finally:
            zones._jobs.pop(RUN, None)

    def test_manual_save_title_is_trimmed_and_required(self):
        from app.schemas import history as schemas
        self.assertTrue(hasattr(schemas, "SaveRunRequest"), "explicit saves need a validated title")
        self.assertEqual(schemas.SaveRunRequest(title="  October station review  ").title, "October station review")
        for title in ["", "   ", "x" * 121]:
            with self.assertRaises(ValidationError):
                schemas.SaveRunRequest(title=title)

    def test_manual_save_records_title_without_changing_original_readings(self):
        sb = MagicMock()
        with patch.object(history.audit, "log"):
            history.save_run(sb, RUN, result(), history.describe_files([("A.csv", b"one")]), USER, "October review")
        params = sb.rpc.call_args.args[1]
        self.assertEqual(params["p_run"]["title"], "October review")
        self.assertEqual(params["p_title"], "October review")
        self.assertIn("October review", params["p_run"]["search_text"])
        self.assertEqual(params["p_result"]["history_title"], "October review")

    def test_explicit_save_uses_original_server_result_and_submitted_title(self):
        from app.routers import zones
        from app.core.dependencies import require_analyst_or_bearer
        app = FastAPI()
        app.state.limiter = zones.limiter
        app.include_router(zones.router)
        app.dependency_overrides[require_analyst_or_bearer] = lambda: USER.model_dump()
        payload = [("A.csv", b"one")]
        zones._jobs[RUN] = {"status": "done", "user_id": USER.id, "user": USER, "files": history.describe_files(payload), "result": result().model_copy(update={"run_id": RUN}).model_dump(mode="json")}
        try:
            saved = result().model_copy(update={"run_id": RUN, "history_saved": True})
            with patch.object(zones, "try_save_run", return_value=saved) as save:
                client = TestClient(app, cookies={"csrf_token": "test-csrf"})
                response = client.post(f"/api/zones/jobs/{RUN}/save", headers={"X-CSRF-Token": "test-csrf"}, json={"title": "October review"})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(save.call_args.args[-1], "October review")
            self.assertEqual(save.call_args.args[1].flagged_data, result().flagged_data)
            self.assertNotIn("files", zones._jobs[RUN])
        finally:
            zones._jobs.pop(RUN, None)

    def test_retry_returns_the_original_saved_title_if_the_first_acknowledgment_was_lost(self):
        sb = MagicMock()
        sb.rpc.return_value.execute.return_value.data = False
        original = result().model_copy(update={"run_id": RUN, "history_saved": True, "history_title": "First title"})
        with patch.object(history, "get_supabase", return_value=sb), patch.object(history, "get_result", return_value=original), patch.object(history.audit, "log"):
            saved = history.try_save_run(RUN, result(), history.describe_files([("A.csv", b"one")]), USER, "Different retry title")
        self.assertEqual(saved.history_title, "First title")

    def test_history_events_do_not_leak_to_mobile(self):
        from app.services.events_service import _resources_for, project_for_mobile
        self.assertEqual(_resources_for("processing_review_saved", "processing_run"), ("history",))
        self.assertIsNone(project_for_mobile({"resource": "history", "id": RUN}))


if __name__ == "__main__":
    unittest.main()
