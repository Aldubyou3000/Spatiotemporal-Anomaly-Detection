"""Zone C screening regressions; synthetic fault flags are not sensor diagnoses."""
import sys
import time
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.zones.zone_c import zone_c_lof_anomaly_detection
from app.services.zones_service import run_pipeline

IDS = ["A", "B", "C", "D"]
NEIGHBORS = {s: [{"neighbor_id": n, "distance_km": .5} for n in IDS if n != s] for s in IDS}


def frame(values, day="2023-09-29"):
    return pd.DataFrame([dict(station_id=s, date=pd.Timestamp(day), rainfall=value,
                             latitude=14.65, longitude=121.05 + index * .004)
                         for index, (s, value) in enumerate(zip(IDS, values))])


def detect(values):
    return zone_c_lof_anomaly_detection(frame(values), NEIGHBORS, n_neighbors=3)[0].set_index("station_id")


class ZoneCScreeningTests(unittest.TestCase):
    def test_reported_22_7_reading_is_not_flagged(self):
        rows = detect([22.7, 18.2, 18.0, 19.7])
        self.assertFalse(rows.is_anomaly.any())
        self.assertFalse(rows.is_low_anomaly.any())

    def test_partial_underreport_above_one_mm_is_reviewed(self):
        rows = detect([9.4, 47, 45, 49])
        self.assertTrue(rows.loc["A", "is_low_anomaly"])
        self.assertFalse(rows.loc["A", "is_anomaly"])

    def test_absolute_and_relative_high_boundaries(self):
        for values, expected in [([15, 10, 10, 10], True), ([14.9, 10, 10, 10], False),
                                 ([26, 20, 20, 20], True), ([25.9, 20, 20, 20], False),
                                 ([10, 0, 0, 0], True), ([9.9, 0, 0, 0], False)]:
            with self.subTest(values=values):
                self.assertEqual(bool(detect(values).loc["A", "is_anomaly"]), expected)

    def test_low_ratio_and_deficit_boundaries(self):
        for values, expected in [([5, 20, 20, 20], False), ([4.9, 20, 20, 20], True),
                                 ([2, 12, 12, 12], True), ([2.1, 12, 12, 12], False),
                                 ([1, 10, 10, 10], True), ([0, 9, 9, 9], False)]:
            with self.subTest(values=values):
                self.assertEqual(bool(detect(values).loc["A", "is_low_anomaly"]), expected)

    def test_ridf_scale_coherent_storms_are_not_fault_cutoffs(self):
        # Magnitudes from the user's Science Garden 24-hour sheet, plus a value above its 100-year estimate.
        for rainfall in [159.4, 249.4, 308.9, 495.3, 600]:
            with self.subTest(rainfall=rainfall):
                rows = detect([rainfall * .98, rainfall, rainfall * .99, rainfall * 1.02])
                self.assertFalse(rows.is_anomaly.any())
                self.assertFalse(rows.is_low_anomaly.any())

    def test_gross_disagreement_is_reviewed_below_and_above_ridf(self):
        for rainfall in [120, 600]:
            with self.subTest(rainfall=rainfall):
                self.assertTrue(detect([rainfall, 20, 20, 20]).loc["A", "is_anomaly"])

    def test_dry_and_equal_readings_have_finite_scores_and_no_flags(self):
        for value in [0, .1, 20, 600]:
            rows = detect([value] * 4)
            self.assertTrue(np.isfinite(rows.lof_score).all())
            self.assertFalse(rows.is_anomaly.any())
            self.assertFalse(rows.is_low_anomaly.any())

    def test_repeated_calls_and_row_order_are_identical(self):
        source = pd.concat([frame([120, 20, 20, 20]), frame([0, 18, 18, 18], "2023-09-30")], ignore_index=True)
        original = source.copy(deep=True)
        def result(data):
            return zone_c_lof_anomaly_detection(data, NEIGHBORS, n_neighbors=3)[0].sort_values(["station_id", "date"]).reset_index(drop=True)
        first = result(source)
        pd.testing.assert_frame_equal(first, result(source), check_exact=True)
        pd.testing.assert_frame_equal(first, result(source.sample(frac=1, random_state=42)), check_exact=True)
        pd.testing.assert_frame_equal(source, original)

    def test_missing_neighbors_are_unassessed(self):
        rows = zone_c_lof_anomaly_detection(frame([120, 20, 20]), NEIGHBORS, n_neighbors=3)[0]
        self.assertTrue(rows.lof_score.isna().all())
        self.assertFalse(rows.is_anomaly.any())
        self.assertFalse(rows.is_low_anomaly.any())

    def test_rainfall_alias_and_empty_data_remain_supported(self):
        source = frame([120, 20, 20, 20]).rename(columns={"rainfall": "rainfall_mm"})
        rows, _ = zone_c_lof_anomaly_detection(source, NEIGHBORS, n_neighbors=3)
        self.assertTrue(rows.loc[0, "is_anomaly"])
        empty, summary = zone_c_lof_anomaly_detection(source.iloc[:0], NEIGHBORS, n_neighbors=3)
        self.assertTrue(empty.empty)
        self.assertEqual(summary, {})

    def test_invalid_neighbor_parameters_are_rejected_clearly(self):
        for value in [True, 0, 1, -1, 2.5, "3"]:
            with self.subTest(value=value), self.assertRaisesRegex(ValueError, "n_neighbors"):
                zone_c_lof_anomaly_detection(frame([120, 20, 20, 20]), NEIGHBORS, n_neighbors=value)
        with self.assertRaisesRegex(ValueError, "neighbors"):
            zone_c_lof_anomaly_detection(frame([120, 20, 20, 20]), {})

    def test_pipeline_counts_and_dry_flags_do_not_reintroduce_the_high_false_alarm(self):
        source = pd.concat([frame([22.7, 18.2, 18, 19.7], "2023-09-26"),
                            frame([9.4, 47, 45, 49], "2023-09-27"),
                            frame([120, 20, 20, 20], "2023-09-28"),
                            frame([0, 20, 20, 20], "2023-09-29")], ignore_index=True)
        result = run_pipeline(source.to_csv(index=False).encode())
        lookup = {(r.station_id, str(r.date)): r for r in result.flagged_data}
        reported = lookup[("A", "2023-09-26")]
        self.assertFalse(reported.is_anomaly or reported.is_low_anomaly or reported.is_dry_stuck)
        self.assertTrue(lookup[("A", "2023-09-27")].is_low_anomaly)
        self.assertFalse(lookup[("A", "2023-09-27")].is_dry_stuck)
        self.assertEqual(result.summary.total_high_anomalies, 1)
        self.assertEqual(result.summary.total_low_anomalies, 2)
        self.assertEqual(result.summary.total_anomalies, 3)
        self.assertEqual(sum(bool(r.is_anomaly or r.is_low_anomaly or r.is_dry_stuck) for r in result.flagged_data), 3)
        self.assertEqual(sum(s.anomaly_count for s in result.anomaly_summary), 3)
        self.assertEqual(sum(not e.is_low for s in result.anomaly_summary for e in s.events), 1)
        self.assertEqual(sum(e.is_low for s in result.anomaly_summary for e in s.events), 2)

    def test_sync_and_async_http_results_use_the_new_rules(self):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        from app.routers import zones
        app = FastAPI()
        app.include_router(zones.router)
        actor = dict(id="18eb498a-e434-4818-bbf6-e541353a4225", username="synthetic", full_name="Synthetic Test",
                     email="synthetic@example.com", role="analyst")
        app.dependency_overrides[zones.require_analyst_or_bearer] = lambda: actor
        source = pd.concat([frame([22.7, 18.2, 18, 19.7], "2023-09-26"),
                            frame([9.4, 47, 45, 49], "2023-09-27")], ignore_index=True)
        uploads = [("files", ("controlled.csv", source.to_csv(index=False).encode(), "text/csv"))]
        created = []
        try:
            with patch.object(zones.limiter, "enabled", False), patch.object(zones, "try_save_run", side_effect=AssertionError("Unexpected save")):
                with TestClient(app) as client:
                    sync = client.post("/api/zones/process", files=uploads)
                    self.assertEqual(sync.status_code, 200, sync.text)
                    body = sync.json()
                    created.append(body["run_id"])
                    self.assertEqual(body["summary"]["total_high_anomalies"], 0)
                    self.assertEqual(body["summary"]["total_low_anomalies"], 1)
                    accepted = client.post("/api/zones/process?async=true", files=uploads)
                    self.assertEqual(accepted.status_code, 202, accepted.text)
                    job = accepted.json()["job_id"]
                    created.append(job)
                    deadline = time.monotonic() + 30
                    while time.monotonic() < deadline:
                        response = client.get(f"/api/zones/jobs/{job}")
                        self.assertEqual(response.status_code, 200)
                        progress = response.json()
                        if progress["status"] != "processing":
                            break
                        time.sleep(.02)
                    self.assertEqual(progress["status"], "done", progress)
                    self.assertEqual(body["flagged_data"], progress["result"]["flagged_data"])
        finally:
            with zones._jobs_lock:
                for job in created:
                    zones._jobs.pop(job, None)


if __name__ == "__main__":
    unittest.main()
