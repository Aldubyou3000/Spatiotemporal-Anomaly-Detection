"""Review summaries must not turn agreement into a fault diagnosis."""
import sys
import unittest
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.services.zones_service import _compute_station_health, _compute_stuck_at_zero


IDS = ["A", "B", "C", "D"]
NEIGHBORS = {s: [{"neighbor_id": n} for n in IDS if n != s] for s in IDS}


def readings(values, dates=None):
    dates = dates if dates is not None else pd.date_range("2023-01-01", periods=len(values))
    return pd.DataFrame([
        {"station_id": s, "date": d, "rainfall": value if s == "A" else 20.0,
         "latitude": 14.6, "longitude": 121.0}
        for d, value in zip(dates, values) for s in IDS
    ])


def high(df, flags=None):
    return {h.station_id: h for h in _compute_station_health(df, NEIGHBORS, flags or {}, "rainfall")}


class StationReviewTests(unittest.TestCase):
    def test_identical_readings_do_not_warn(self):
        for h in high(readings([20] * 6)).values():
            self.assertEqual((h.status, h.bias_ratio, h.top_rate), ("normal", 1.0, 0.0))

    def test_tied_highest_does_not_count_as_strictly_highest(self):
        df = readings([30] * 6)
        df.loc[df.station_id == "B", "rainfall"] = 30
        a = high(df)["A"]
        self.assertEqual((a.status, a.top_rate), ("watch", 0.0))

    def test_strictly_highest_still_raises_warning(self):
        a = high(readings([21] * 6))["A"]
        self.assertEqual((a.status, a.top_rate), ("suspect", 1.0))

    def test_average_warning_without_highest_frequency_warning(self):
        a = high(readings([30, 18] * 3))["A"]
        self.assertEqual((a.status, a.bias_ratio, a.top_rate), ("watch", 1.2, 0.5))

    def test_flagged_day_remains_even_without_overall_warning(self):
        df = readings([20] * 6)
        a = high(df, {"A": [{"date": "2023-01-01", "rainfall": 20}]})["A"]
        self.assertEqual((a.status, a.times_flagged), ("normal", 1))

    def test_fewer_than_five_rainy_days_is_insufficient(self):
        self.assertEqual(high(readings([20] * 4))["A"].status, "insufficient_data")

    def test_large_flagged_peak_warns_even_with_limited_data(self):
        a = high(readings([300]), {"A": [{"date": "2023-01-01", "rainfall": 300}]})["A"]
        self.assertEqual((a.status, a.peak_rainfall, a.bias_ratio), ("suspect", 300, None))

    def test_individual_low_events_remain_without_overall_warning(self):
        low, summaries, keys = _compute_stuck_at_zero(readings([0, 20, 0, 20, 20, 20, 20, 20, 20, 20]), NEIGHBORS, "rainfall")
        a = next(h for h in low if h.station_id == "A")
        self.assertEqual((a.status, len(a.events), a.zero_rate, a.max_zero_streak), ("normal", 2, 0.2, 1))
        self.assertEqual(summaries[0].stuck_count, 2)
        self.assertEqual(len(keys), 2)

    def test_run_counts_assessed_rainy_days_not_calendar_days(self):
        dates = ["2023-01-01", "2023-01-10", "2023-02-01", "2023-02-10", "2023-03-01"]
        low, _, _ = _compute_stuck_at_zero(readings([0, 0, 0, 20, 20], dates), NEIGHBORS, "rainfall")
        a = next(h for h in low if h.station_id == "A")
        self.assertEqual(a.max_zero_streak, 3)

    def test_missing_neighbor_days_are_not_assessed(self):
        df = readings([20] * 6)
        df = df[df.station_id != "D"]
        self.assertEqual(high(df)["A"].rain_days, 0)
        self.assertEqual(high(df)["A"].status, "insufficient_data")


if __name__ == "__main__":
    unittest.main()
