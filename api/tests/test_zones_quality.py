"""Run with: api/.venv/Scripts/python.exe -m unittest discover -s api/tests -v"""
import csv
import io
import sys
import unittest
from unittest.mock import patch
from collections import defaultdict
from datetime import datetime, timedelta
from decimal import Decimal, ROUND_HALF_EVEN
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.zones_service import (
    ZoneProcessingError,
    _clean_daily_readings,
    _normalize_quality_report,
    run_pipeline,
    run_pipeline_multi,
)


def hourly(station="A", days=3):
    return pd.DataFrame({
        "station_id": station,
        "date": pd.date_range("2023-01-01", periods=24 * days, freq="h"),
        "latitude": 14.6,
        "longitude": 121.0,
        "rainfall": 1.0,
    })


class DailyQualityTests(unittest.TestCase):
    def test_complete_dry_days_are_valid(self):
        raw = hourly()
        raw["rainfall"] = 0.0
        cleaned, report = _clean_daily_readings(raw)
        self.assertEqual(cleaned.rainfall.tolist(), [0.0] * 3)
        self.assertFalse(cleaned.interpolated_flag.any())
        self.assertEqual(report["exclusion_details"]["incomplete_days"], 0)

    def test_single_hour_is_filled_and_reported(self):
        raw = hourly()
        raw.loc[[9, 10, 11], "rainfall"] = [2.0, np.nan, 6.0]
        cleaned, report = _clean_daily_readings(raw)
        self.assertEqual(cleaned.rainfall.tolist(), [33.0, 24.0, 24.0])
        self.assertEqual(cleaned.interpolated_flag.tolist(), [True, False, False])
        self.assertEqual(report["rows_filled"], 1)
        self.assertEqual(_normalize_quality_report(report).rows_filled, 1)

    def test_multi_hour_gap_excludes_the_day(self):
        raw = hourly()
        raw.loc[[10, 11], "rainfall"] = np.nan
        cleaned, report = _clean_daily_readings(raw)
        self.assertEqual(cleaned.date.dt.day.tolist(), [2, 3])
        self.assertEqual(report["rows_excluded"], 1)
        self.assertEqual(report["rows_filled"], 0)
        self.assertEqual(_normalize_quality_report(report).exclusion_details.incomplete_days, 1)

    def test_absent_timestamp_excludes_the_day(self):
        cleaned, report = _clean_daily_readings(hourly().drop(index=10))
        self.assertEqual(cleaned.date.dt.day.tolist(), [2, 3])
        self.assertEqual(report["exclusion_details"]["incomplete_days"], 1)
        self.assertEqual(report["rows_filled"], 0)

    def test_edge_gaps_are_not_extrapolated(self):
        raw = hourly(days=4)
        raw.loc[[0, len(raw) - 1], "rainfall"] = np.nan
        cleaned, report = _clean_daily_readings(raw)
        self.assertEqual(cleaned.date.dt.day.tolist(), [2, 3])
        self.assertEqual(report["exclusion_details"]["incomplete_days"], 2)
        self.assertEqual(report["rows_filled"], 0)

    def test_duplicate_or_extra_subhour_cannot_replace_a_missing_hour(self):
        raw = hourly()
        duplicate = raw.iloc[[9]].copy()
        duplicate["date"] += pd.Timedelta(minutes=30)
        raw = pd.concat([raw.drop(index=10), duplicate], ignore_index=True)
        cleaned, report = _clean_daily_readings(raw)
        self.assertEqual(cleaned.date.dt.day.tolist(), [2, 3])
        self.assertEqual(report["exclusion_details"]["incomplete_days"], 1)

    def test_duplicates_and_unsorted_input_do_not_inflate_totals(self):
        raw = hourly()
        duplicate = raw.iloc[[9]].copy()
        duplicate["rainfall"] = 999.0
        raw = pd.concat([raw, duplicate], ignore_index=True)
        cleaned, report = _clean_daily_readings(raw)
        self.assertEqual(cleaned.rainfall.tolist(), [24.0] * 3)
        self.assertEqual(_normalize_quality_report(report, hourly_duplicates=2).exclusion_details.hourly_duplicates, 3)
        shuffled, _ = _clean_daily_readings(hourly().sample(frac=1, random_state=1))
        self.assertEqual(shuffled.rainfall.tolist(), [24.0] * 3)

    def test_station_minimum_is_rechecked_after_completeness(self):
        short = hourly("B", days=2).drop(index=10)
        empty = hourly("C")
        empty["rainfall"] = np.nan
        raw = pd.concat([hourly(), short, empty], ignore_index=True)
        cleaned, report = _clean_daily_readings(raw)
        self.assertEqual(cleaned.station_id.unique().tolist(), ["A"])
        self.assertEqual(report["stations_excluded"], 2)
        self.assertEqual(report["exclusion_details"]["zero_valid_stations"], 1)
        self.assertEqual(report["exclusion_details"]["insufficient_readings_stations"], 1)

    def test_daily_input_is_not_interpolated(self):
        raw = hourly().iloc[[0, 24, 48]].copy()
        raw.loc[24, "rainfall"] = np.nan
        cleaned, report = _clean_daily_readings(raw)
        self.assertEqual(cleaned.date.dt.day.tolist(), [1, 3])
        self.assertFalse(cleaned.interpolated_flag.any())
        self.assertEqual(report["rows_filled"], 0)

    def test_daily_and_hourly_stations_can_be_uploaded_together(self):
        daily = hourly("B").iloc[[0, 24, 48]].copy()
        cleaned, _ = _clean_daily_readings(pd.concat([hourly(), daily], ignore_index=True))
        self.assertEqual(cleaned.groupby("station_id").size().to_dict(), {"A": 3, "B": 3})

    def test_invalid_rainfall_is_rejected_before_aggregation(self):
        for value in [-1.0, np.inf, -np.inf]:
            with self.subTest(value=value):
                raw = hourly()
                raw.loc[10, "rainfall"] = value
                with self.assertRaisesRegex(ZoneProcessingError, "finite and non-negative"):
                    _clean_daily_readings(raw)

    def test_no_complete_data_has_a_clear_error(self):
        for raw in [hourly(days=1), hourly().iloc[[1, 25, 49]], hourly().assign(rainfall=np.nan)]:
            with self.subTest(rows=len(raw)):
                with self.assertRaisesRegex(ZoneProcessingError, "two usable days"):
                    _clean_daily_readings(raw)

    def test_single_and_multi_file_paths_use_the_same_quality_checks(self):
        raw = hourly()
        raw.loc[[10, 11], "rainfall"] = np.nan
        content = raw.to_csv(index=False).encode()
        for result in [run_pipeline(content), run_pipeline_multi([("combined.csv", content)])]:
            self.assertEqual(result.summary.total_rows, 2)
            self.assertEqual(result.quality_report.exclusion_details.incomplete_days, 1)
            self.assertTrue(all(row.date.day in (2, 3) for row in result.flagged_data))


class ActualDatasetTests(unittest.TestCase):
    def test_actual_outputs_against_independent_csv_and_decimal_reference(self):
        root = Path(__file__).resolve().parents[2] / "test-data/HMDAS-S0526010/Rainfall"
        paths = sorted(root.glob("*.csv"))
        self.assertEqual(len(paths), 4)
        daily = defaultdict(list)
        estimated = set()
        filled = 0
        for path in paths:
            rows = list(csv.reader(io.StringIO(path.read_text(encoding="utf-8-sig"))))
            name = rows[1][0].split("\t", 1)[1].strip()
            station = "".join(name.split())
            readings = [
                (datetime.strptime(row[0].replace("-", "/") + " " + row[1], "%m/%d/%Y %H:%M"),
                 None if row[2] == "NULL" else Decimal(row[2]))
                for row in rows[7:]
            ]
            for i, (timestamp, value) in enumerate(readings):
                key = (station, timestamp.date())
                if value is None and 0 < i < len(readings) - 1:
                    before, after = readings[i - 1], readings[i + 1]
                    if before[1] is not None and after[1] is not None and timestamp - before[0] == after[0] - timestamp == timedelta(hours=1):
                        value = (before[1] + after[1]) / Decimal(2)
                        filled += 1
                        estimated.add(key)
                if value is not None:
                    daily[key].append(value)
        expected = {
            key: float(sum(values, Decimal(0)).quantize(Decimal("0.1"), rounding=ROUND_HALF_EVEN))
            for key, values in daily.items() if len(values) == 24
        }
        result = run_pipeline_multi([(p.name, p.read_bytes()) for p in paths])
        actual = {(row.station_id, row.date): row.rainfall for row in result.cleaned_data}
        self.assertEqual(actual, expected)
        self.assertEqual(len(actual), 3029)
        self.assertEqual(len(result.flagged_data), len(expected))
        self.assertTrue(all((row.station_id, row.date) in expected for row in result.flagged_data))
        self.assertEqual(result.quality_report.rows_filled, filled)
        self.assertEqual(filled, 127)
        self.assertEqual(result.quality_report.rows_excluded, 319)
        self.assertEqual(result.quality_report.exclusion_details.incomplete_days, 319)
        self.assertEqual(result.quality_report.exclusion_details.multi_hour_gaps, 9023)
        self.assertEqual(result.quality_report.exclusion_details.hourly_starts_with_nan, 19600)
        for row in result.cleaned_data:
            self.assertEqual(row.interpolated_flag, (row.station_id, row.date) in estimated)
        self.assertNotIn(("Mandaluyong", datetime(2021, 3, 28).date()), actual)
        print(f"\nActual dataset verified: {len(actual)} complete daily totals; 319 partial days excluded; {filled} hours filled.")


class PipelineProgressTests(unittest.TestCase):
    def test_progress_reports_real_zone_boundaries_and_station_ids(self):
        from app.services import zones_service as service
        csv_text = "station_id,date,latitude,longitude,rainfall\n" + "".join(
            f"{station},2023-01-{day:02d},14.6,121.0,{day + index}\n"
            for index, station in enumerate(["A", "B", "C", "D"]) for day in [1, 2, 3]
        )
        events = []
        clean, group, detect = service._clean_daily_readings, service.zone_b_haversine_grouping, service.zone_c_lof_anomaly_detection
        def checked(stage, function):
            def run(*args, **kwargs):
                self.assertEqual(events[-1].stage, stage)
                return function(*args, **kwargs)
            return run
        with patch.object(service, "_clean_daily_readings", side_effect=checked("zone_a", clean)), \
             patch.object(service, "zone_b_haversine_grouping", side_effect=checked("zone_b", group)), \
             patch.object(service, "zone_c_lof_anomaly_detection", side_effect=checked("zone_c", detect)):
            output = run_pipeline_multi([("stations.csv", csv_text.encode())], on_progress=events.append)
        self.assertEqual([event.stage for event in events], ["preparing", "zone_a", "zone_b", "zone_c", "finalizing"])
        self.assertEqual(events[0].station_ids, [])
        self.assertTrue(all(event.station_ids == ["A", "B", "C", "D"] for event in events[1:]))
        self.assertEqual(output.summary.total_rows, 12)


if __name__ == "__main__":
    unittest.main()
