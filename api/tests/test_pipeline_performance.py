"""Resource limits must change throughput, never detection results."""
import sys
import time
import unittest
from contextlib import nullcontext
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Lock
from unittest.mock import patch

import pandas as pd
from threadpoolctl import threadpool_info

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.services import zones_service as service


def payload():
    return pd.DataFrame([
        {"station_id": station, "date": f"2023-01-{day:02}",
         "latitude": 14.6 + i * .01, "longitude": 121 + i * .01,
         "rainfall": (60 if day == 4 and i == 0 else (0 if day == 8 and i == 1 else 20 + i + day % 3))}
        for day in range(1, 13) for i, station in enumerate("ABCD")
    ]).to_csv(index=False).encode()


def facts(result):
    value = result.model_dump(exclude={"processed_at"})
    value["summary"].pop("processing_time_seconds")
    return value


class PipelinePerformanceTests(unittest.TestCase):
    def test_native_limits_preserve_every_score_and_flag(self):
        data = payload()
        with patch.object(service, "threadpool_limits", return_value=nullcontext()):
            expected = service.run_pipeline(data)
        detector = service.zone_c_lof_anomaly_detection
        before = threadpool_info()
        def limited(*args, **kwargs):
            self.assertTrue(all(pool["num_threads"] == 1 for pool in threadpool_info()))
            return detector(*args, **kwargs)
        with patch.object(service, "zone_c_lof_anomaly_detection", side_effect=limited):
            actual = service.run_pipeline(data)
        self.assertEqual(facts(actual), facts(expected))
        self.assertEqual(threadpool_info(), before)

    def test_concurrent_jobs_do_not_overlap_native_limit_scopes(self):
        detector = service.zone_c_lof_anomaly_detection
        active = 0
        maximum = 0
        guard = Lock()
        def limited(*args, **kwargs):
            nonlocal active, maximum
            with guard:
                active += 1
                maximum = max(maximum, active)
            try:
                time.sleep(.03)
                self.assertTrue(all(pool["num_threads"] == 1 for pool in threadpool_info()))
                return detector(*args, **kwargs)
            finally:
                with guard:
                    active -= 1
        with patch.object(service, "zone_c_lof_anomaly_detection", side_effect=limited):
            with ThreadPoolExecutor(max_workers=2) as workers:
                outputs = list(workers.map(service.run_pipeline, [payload(), payload()]))
        self.assertEqual(maximum, 1)
        self.assertEqual(facts(outputs[0]), facts(outputs[1]))

    def test_failed_detection_restores_limits_and_releases_the_scope(self):
        before = threadpool_info()
        with patch.object(service, "zone_c_lof_anomaly_detection", side_effect=RuntimeError("test failure")):
            with self.assertRaisesRegex(RuntimeError, "test failure"):
                service.run_pipeline(payload())
        self.assertEqual(threadpool_info(), before)
        self.assertEqual(service.run_pipeline(payload()).summary.total_stations, 4)
