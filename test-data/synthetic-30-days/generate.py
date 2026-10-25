"""Rebuild HMDAS-format synthetic uploads and the independent scenario answer key."""
import csv
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parent
# Locations copied from the supplied HMDAS headers; all rainfall is invented.
STATIONS = {
    "SyntheticMandaluyong": ("121.033882", "14.577789", "Value [mm]"),
    "SyntheticMarikinaYouthCamp": ("121.091599", "14.63888", "Value [mm]"),
    "SyntheticNapindanII": ("121.066597", "14.55848", "Total [mm]"),
    "SyntheticValenzuelaNHS": ("120.984734", "14.672812", "Value [mm]"),
}


def generate():
    with (ROOT / "daily_plan.csv").open(newline="", encoding="utf-8-sig") as stream:
        plan = list(csv.DictReader(stream))
    expected_dates = [date(2023, 9, 1) + timedelta(days=i) for i in range(30)]
    if [date.fromisoformat(row["date"]) for row in plan] != expected_dates:
        raise ValueError("Keep all 30 dates in September 2023, in order, without duplicates.")
    for row in plan:
        for station in STATIONS:
            value = Decimal(row[station])
            if not value.is_finite() or value < 0 or value != value.quantize(Decimal("0.1")):
                raise ValueError(f"{row['date']} {station}: use a non-negative number with at most one decimal.")
        for field in ("expected_high_station", "expected_low_station"):
            if row[field] and row[field] not in STATIONS:
                raise ValueError(f"Unknown expected station: {row[field]}")
        if row["expected_high_station"] and row["expected_high_station"] == row["expected_low_station"]:
            raise ValueError("A station cannot be both high and low on the same day.")

    uploads = ROOT / "upload"
    uploads.mkdir(exist_ok=True)
    for station, (longitude, latitude, value_header) in STATIONS.items():
        path = uploads / f"SYNTHETIC-{station}_Hourly_Rainfall_01Sep2023_30Sep2023.csv"
        with path.open("w", newline="", encoding="utf-8") as stream:
            writer = csv.writer(stream)
            for label, value in (
                ("Station Site", "SYNTHETIC CONTROLLED TEST"), ("Station Name", station),
                ("Parameter Name", "Rainfall"), ("Time series Unit", "mm"),
                ("Longitude", longitude), ("Latitude", latitude),
            ):
                writer.writerow([f"{label}:\t{value}", "", ""])
            writer.writerow(["Date", "Time", value_header])
            for row in plan:
                # Distribute integer tenths over six hours without changing the daily total.
                tenths = int(Decimal(row[station]) * 10)
                quotient, remainder = divmod(tenths, 6)
                hourly = [0] * 24
                for index, hour in enumerate(range(12, 18)):
                    hourly[hour] = quotient + (index < remainder)
                for hour, value in enumerate(hourly):
                    writer.writerow([date.fromisoformat(row["date"]).strftime("%m/%d/%Y"),
                                     f"{hour}:00", f"{Decimal(value) / 10:.1f}"])
        # Self-check saved artifacts, independent of the detection algorithm.
        with path.open(newline="", encoding="utf-8") as stream:
            saved = list(csv.reader(stream))[7:]
        assert len(saved) == 720, f"Wrong hourly row count: {path.name}"
        assert len({(r[0], r[1]) for r in saved}) == 720, "Duplicate timestamp"
        for index, row in enumerate(plan):
            hours = saved[index * 24:(index + 1) * 24]
            assert [r[1] for r in hours] == [f"{h}:00" for h in range(24)]
            assert all(r[0] == expected_dates[index].strftime("%m/%d/%Y") for r in hours)
            assert sum(Decimal(r[2]) for r in hours) == Decimal(row[station]), "Daily total mismatch"

    with (ROOT / "answer_key.csv").open("w", newline="", encoding="utf-8") as stream:
        writer = csv.writer(stream)
        writer.writerow(["date", "station_id", "expected_daily_mm", "expected_high_flag",
                         "expected_low_flag", "expected_label", "scenario"])
        for row in plan:
            for station in STATIONS:
                high = station == row["expected_high_station"]
                low = station == row["expected_low_station"]
                writer.writerow([row["date"], station, row[station], str(high).lower(),
                                 str(low).lower(), "high" if high else "low" if low else "normal", row["scenario"]])
    high_count = sum(bool(row["expected_high_station"]) for row in plan)
    low_count = sum(bool(row["expected_low_station"]) for row in plan)
    print(f"Created 4 uploads: 720 hourly rows each, 120 station-days total. "
          f"Scenario labels: {high_count} high, {low_count} low, {120 - high_count - low_count} normal. "
          "Saved-file timestamps and daily sums checked. Detection has not been run.")


if __name__ == "__main__":
    generate()
