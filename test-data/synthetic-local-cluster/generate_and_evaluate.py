"""Build a declared synthetic fixture, then evaluate the unchanged application pipeline."""
import csv
import hashlib
import json
import platform
import random
import sys
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from importlib.metadata import version
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[1]
START = date(2023, 9, 1)
SEED = 20261027
# Hypothetical sites, not the locations or identities of actual PAGASA AWS.
STATIONS = {
    "SyntheticQCA01": (14.650, 121.050), "SyntheticQCA02": (14.650, 121.054),
    "SyntheticQCA03": (14.654, 121.050), "SyntheticQCA04": (14.654, 121.054),
    "SyntheticQCB01": (14.650, 121.075), "SyntheticQCB02": (14.650, 121.079),
    "SyntheticQCB03": (14.654, 121.075), "SyntheticQCB04": (14.654, 121.079),
}
RAIN = [0, .4, 2, 14, 18, 25, 65, 8, 12, 22, 32, 0, 48, 15, 4,
        80, 18, 6, 24, 42, 55, 7, 16, 0, 28, 35, 12, 60, 21, 10]
# Labels come from declared sensor interventions, not a LOF score or its thresholds.
FAULTS = {
    (4, "SyntheticQCA01"): ("high", "add", 80, "gross_overreport"),
    (7, "SyntheticQCB02"): ("high", "add", 100, "gross_overreport"),
    (13, "SyntheticQCA03"): ("high", "add", 120, "gross_overreport"),
    (16, "SyntheticQCB04"): ("high", "multiply", 1.3, "progressive_overreport"),
    (17, "SyntheticQCB04"): ("high", "multiply", 1.6, "progressive_overreport"),
    (18, "SyntheticQCB04"): ("high", "multiply", 2.0, "progressive_overreport"),
    (23, "SyntheticQCA02"): ("high", "add", 60, "gross_overreport"),
    (28, "SyntheticQCB01"): ("high", "add", 110, "gross_overreport"),
    (6, "SyntheticQCA02"): ("low", "set", 0, "zero_reading_fault"),
    (10, "SyntheticQCA04"): ("low", "set", 0, "two_day_stuck_zero"),
    (11, "SyntheticQCA04"): ("low", "set", 0, "two_day_stuck_zero"),
    (15, "SyntheticQCB03"): ("low", "set", 0, "zero_fault_on_light_rain"),
    (20, "SyntheticQCB02"): ("low", "multiply", .2, "partial_underreport"),
    (25, "SyntheticQCA01"): ("low", "set", 0, "two_simultaneous_zero_faults"),
    (25, "SyntheticQCA02"): ("low", "set", 0, "two_simultaneous_zero_faults"),
    (27, "SyntheticQCB04"): ("low", "set", 0, "zero_reading_fault"),
}
VALID_WEATHER = {
    (9, "SyntheticQCA01"): ("add", 25, "valid_localized_shower"),
    (18, "SyntheticQCB02"): ("add", 30, "valid_localized_shower"),
    (21, "SyntheticQCA04"): ("set", 0, "valid_localized_dry_patch"),
}


def write_csv(path, rows):
    with path.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def change(value, operation, amount):
    return round(value + amount if operation == "add" else
                 value * amount if operation == "multiply" else amount, 1)


def build():
    rng = random.Random(SEED)
    plan = []
    for day, regional in enumerate(RAIN, 1):
        for station in STATIONS:
            baseline = round(regional * rng.uniform(.85, 1.15) *
                             (1.05 if "QCB" in station else 1), 1)
            scenario = "shared_dry" if regional == 0 else "shared_rain_with_variation"
            if (day, station) in VALID_WEATHER:
                operation, amount, scenario = VALID_WEATHER[day, station]
                baseline = change(baseline, operation, amount)
            observed, label = baseline, "normal"
            if (day, station) in FAULTS:
                label, operation, amount, scenario = FAULTS[day, station]
                observed = change(baseline, operation, amount)
                assert observed != baseline
            plan.append(dict(date=(START + timedelta(days=day - 1)).isoformat(),
                             station_id=station, baseline_mm=baseline,
                             observed_mm=observed, expected_label=label, scenario=scenario))
    assert len(plan) == 240
    assert {label: sum(r["expected_label"] == label for r in plan)
            for label in ("normal", "high", "low")} == {"normal": 224, "high": 8, "low": 8}
    write_csv(ROOT / "daily_plan.csv", plan)
    write_csv(ROOT / "stations.csv", [dict(station_id=s, latitude=lat, longitude=lon,
              provenance="hypothetical location; not an actual AWS") for s, (lat, lon) in STATIONS.items()])
    write_csv(ROOT / "answer_key.csv", [dict(date=r["date"], station_id=r["station_id"],
              expected_daily_mm=r["observed_mm"], baseline_mm=r["baseline_mm"],
              expected_high_flag=int(r["expected_label"] == "high"),
              expected_low_flag=int(r["expected_label"] == "low"),
              expected_label=r["expected_label"], scenario=r["scenario"]) for r in plan])
    uploads = ROOT / "upload"
    uploads.mkdir(exist_ok=True)
    for station, (lat, lon) in STATIONS.items():
        path = uploads / f"SYNTHETIC-{station}_01Sep2023_30Sep2023.csv"
        with path.open("w", newline="", encoding="utf-8") as stream:
            writer = csv.writer(stream)
            for label, value in [("Station Site", "SYNTHETIC LOCAL CLUSTER TEST"),
                                 ("Station Name", station), ("Parameter Name", "Rainfall"),
                                 ("Time series Unit", "mm"), ("Longitude", lon), ("Latitude", lat)]:
                # The existing HMDAS parser expects a quoted metadata cell followed by two empty cells.
                stream.write(f'"{label}:\t{value}",,\n')
            writer.writerow(["Date", "Time", "Value [mm]"])
            days = [r for r in plan if r["station_id"] == station]
            for index, row in enumerate(days):
                tenths = int(Decimal(str(row["observed_mm"])) * 10)
                weights = [1, 2, 4, 5, 3, 1]
                parts = [tenths * weight // sum(weights) for weight in weights]
                order = sorted(range(6), key=lambda i: -(tenths * weights[i] % sum(weights)))
                for i in order[:tenths - sum(parts)]:
                    parts[i] += 1
                hourly = [0] * 24
                start_hour = index * 3 % 19
                hourly[start_hour:start_hour + 6] = parts
                for hour, value in enumerate(hourly):
                    writer.writerow([date.fromisoformat(row["date"]).strftime("%m/%d/%Y"),
                                     f"{hour:02}:00", f"{Decimal(value) / 10:.1f}"])
        # Read saved uploads back: check every timestamp and exact decimal daily sum.
        with path.open(newline="", encoding="utf-8") as stream:
            saved = list(csv.reader(stream))[7:]
        assert len(saved) == 720
        for index, row in enumerate(days):
            hours = saved[index * 24:(index + 1) * 24]
            assert [r[:2] for r in hours] == [[date.fromisoformat(row["date"]).strftime("%m/%d/%Y"),
                                             f"{hour:02}:00"] for hour in range(24)]
            assert sum(Decimal(r[2]) for r in hours) == Decimal(str(row["observed_mm"]))
    return sorted(uploads.glob("*.csv"))


def metrics(truth, predictions):
    assert len(truth) == len(predictions)
    tp = sum(t and p for t, p in zip(truth, predictions))
    fn = sum(t and not p for t, p in zip(truth, predictions))
    fp = sum(not t and p for t, p in zip(truth, predictions))
    tn = sum(not t and not p for t, p in zip(truth, predictions))
    def divide(a, b):
        return a / b if b else None
    return dict(TP=tp, FN=fn, FP=fp, TN=tn, precision=divide(tp, tp + fp),
                recall=divide(tp, tp + fn), f1=divide(2 * tp, 2 * tp + fp + fn),
                accuracy=divide(tp + tn, len(truth)))


def evaluate(uploads):
    sys.path.insert(0, str(REPO / "api"))
    from app.services.zones_service import run_pipeline_multi
    from app.zones.zone_b import haversine_distance
    from app.zones import zone_c

    # Hand-calculated metric checks; this must not assume the detector performs well.
    check = metrics([True, True, False, False], [True, False, True, False])
    assert check == dict(TP=1, FN=1, FP=1, TN=1, precision=.5, recall=.5, f1=.5, accuracy=.5)
    assert metrics([False], [False])["recall"] is None
    assert metrics([], [])["accuracy"] is None
    result = run_pipeline_multi([(p.name, p.read_bytes()) for p in uploads])
    output = ROOT / "evidence"
    output.mkdir(exist_ok=True)
    (output / "pipeline_result.json").write_text(
        result.model_dump_json(indent=2, exclude={"raw_preview"}), encoding="utf-8")
    predictions = [r.model_dump(mode="json") for r in result.flagged_data]
    write_csv(output / "predictions.csv", predictions)
    assert result.quality_report.rows_excluded == result.quality_report.rows_filled == 0
    assert result.quality_report.stations_excluded == 0
    lookup = {(r["station_id"], r["date"]): r for r in predictions}
    with (ROOT / "answer_key.csv").open(newline="", encoding="utf-8") as stream:
        key = list(csv.DictReader(stream))
    expected_keys = {(r["station_id"], r["date"]) for r in key}
    assert len(lookup) == len(predictions) == len(expected_keys) == len(key) == 240
    assert set(lookup) == expected_keys
    pairs = []
    for actual in key:
        predicted = lookup[(actual["station_id"], actual["date"])]
        assert predicted["lof_score"] is not None, "Unassessed row cannot count as normal"
        assert abs(predicted["rainfall"] - float(actual["expected_daily_mm"])) < 1e-8
        high = predicted["is_anomaly"]
        low = predicted["is_low_anomaly"] or predicted["is_dry_stuck"]
        assert not (high and low), "Ambiguous direction must be reported explicitly"
        truth = actual["expected_label"] != "normal"
        flag = high or low
        pairs.append(dict(**actual, predicted_daily_mm=predicted["rainfall"],
                          lof_score=predicted["lof_score"], predicted_high_flag=int(high),
                          predicted_low_flag=int(low), is_dry_stuck=int(predicted["is_dry_stuck"]),
                          predicted_label="high" if high else "low" if low else "normal",
                          binary_outcome="TP" if truth and flag else "FN" if truth else "FP" if flag else "TN"))
    write_csv(output / "comparison.csv", pairs)
    write_csv(output / "errors.csv", [r for r in pairs if r["expected_label"] != r["predicted_label"]]
              or [dict(note="No direction or binary errors in this run")])
    measures = {"combined": metrics([r["expected_label"] != "normal" for r in pairs],
                                    [r["predicted_label"] != "normal" for r in pairs])}
    for direction in ("high", "low"):
        measures[direction] = metrics([r["expected_label"] == direction for r in pairs],
                                      [r["predicted_label"] == direction for r in pairs])
    labels = ["normal", "high", "low"]
    measures["direction_matrix"] = {t: {p: sum(r["expected_label"] == t and r["predicted_label"] == p
                                      for r in pairs) for p in labels} for t in labels}
    neighbors = [dict(station_id=s, neighbor_id=n.neighbor_id, distance_km=n.distance_km)
                 for s, entries in result.neighbors.items() for n in entries]
    assert len(neighbors) == 24
    assert all(r["distance_km"] < 1 for r in neighbors)
    assert all(r["station_id"][:12] == r["neighbor_id"][:12] for r in neighbors)
    distances = [dict(station_id=a, other_station_id=b,
                     distance_km=round(haversine_distance(*STATIONS[a], *STATIONS[b]), 4))
                 for i, a in enumerate(STATIONS) for b in list(STATIONS)[i + 1:]]
    assert max(r["distance_km"] for r in distances) < 4
    write_csv(output / "neighbors.csv", neighbors)
    write_csv(output / "pairwise_distances.csv", distances)
    (output / "metrics.json").write_text(json.dumps(measures, indent=2), encoding="utf-8")
    sources = [Path(__file__), ROOT / "daily_plan.csv", ROOT / "answer_key.csv", ROOT / "stations.csv", *uploads,
               *[REPO / "api/app" / name for name in ["zones/zone_a.py", "zones/zone_b.py", "zones/zone_c.py",
                  "services/zones_service.py", "services/hmdas_converter.py", "schemas/zones.py"]]]
    manifest = dict(executed_at_utc=datetime.now(timezone.utc).isoformat(), seed=SEED,
                    python=platform.python_version(), packages={p: version(p) for p in ["numpy", "pandas", "scikit-learn", "pydantic"]},
                    invocation="api/.venv/Scripts/python.exe test-data/synthetic-local-cluster/generate_and_evaluate.py",
                    execution="Fresh Python process; one direct run_pipeline_multi call; no HTTP or database writes",
                    lof_rng="Application module default_rng(0), first pipeline call in this process",
                    thresholds={n: getattr(zone_c, n) for n in ["MIN_STATIONS_PER_DAY", "ANOMALY_THRESHOLD",
                                "MIN_ANOMALY_RAINFALL_MM", "LOW_MAX_RAIN_MM", "LOW_MIN_MEDIAN_MM", "LOW_RATIO"]},
                    sha256={p.relative_to(REPO).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
                            for p in [*sources, *sorted(output.glob("*.csv")), output / "pipeline_result.json", output / "metrics.json"]})
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    report = ["# Controlled local-cluster evaluation", "",
              "All sites and measurements are synthetic. This is a development functional test, not real-data validation.", "",
              "Eight hypothetical QC-area sites; September 1-30, 2023 for every station; 5,760 hourly inputs; "
              "240 assessed station-days. Labels: 8 high faults, 8 low faults, 224 valid readings. "
              "No interpolated or excluded rows. The existing fixture and application algorithms were not changed.", "",
              "## Confusion matrices", "", "Rows are actual labels; columns are system predictions."]
    for name in ("combined", "high", "low"):
        m = measures[name]
        report += ["", f"### {name.title()}", "", "| Actual / predicted | Positive | Negative |",
                   "|---|---:|---:|", f"| Positive | {m['TP']} TP | {m['FN']} FN |",
                   f"| Negative | {m['FP']} FP | {m['TN']} TN |", "",
                   "; ".join(f"{n}: {m[n]:.2%}" if m[n] is not None else f"{n}: N/A"
                             for n in ("precision", "recall", "f1", "accuracy")) + "."]
    report += ["", "## Direction-aware results", "", "| Actual / predicted | Normal | High | Low |",
               "|---|---:|---:|---:|"]
    report += [f"| {t.title()} | " + " | ".join(str(measures["direction_matrix"][t][p]) for p in labels) + " |" for t in labels]
    report += ["", "## Errors and interpretation", "",
               "These are exact paired results, not a comparison of aggregate alert counts. "
               "The combined matrix counts either flag direction as positive; the separate and three-class matrices expose wrong directions. "
               "High flags combine LOF and rainfall gates; low flags use rules, so combined scores are not LOF-only performance.", "",
               "| Date | Station | Scenario | Actual | Predicted | Outcome |", "|---|---|---|---|---|---|"]
    report += [f"| {r['date']} | {r['station_id']} | {r['scenario']} | {r['expected_label']} | {r['predicted_label']} | {r['binary_outcome']} |"
               for r in pairs if r["expected_label"] != r["predicted_label"]]
    combined = measures["combined"]
    report += ["", f"Of 16 injected fault readings, {combined['TP']} were detected and {combined['FN']} were missed. "
               f"Of 224 valid readings, {combined['FP']} raised false alarms and {combined['TN']} remained unflagged. "
               "Because 224 of 240 readings are normal, an always-normal baseline already achieves 93.33% accuracy "
               "while detecting no faults; interpret the reported accuracy alongside precision and recall.", "",
               "Missed fault scenarios in this run: " + ", ".join(sorted({r["scenario"] for r in pairs
                   if r["binary_outcome"] == "FN"}) or ["none"]) + ". "
               "False-alarm scenarios: " + ", ".join(sorted({r["scenario"] for r in pairs
                   if r["binary_outcome"] == "FP"}) or ["none"]) + ". "
               "The low rule's 1 mm ceiling limits partial-underreport detection. "
               "Spatial disagreement alone does not establish a sensor malfunction.", "",
               "## Evidence and limitations", "",
               "Inputs are in ../upload; labels and baseline truth are in ../answer_key.csv and ../daily_plan.csv. "
               "comparison.csv contains all 240 matched readings, including normal controls. predictions.csv and pipeline_result.json "
               "retain actual service output (only raw_preview is omitted from JSON; the hourly CSVs preserve inputs). "
               "neighbors.csv and pairwise_distances.csv verify the spatial layout. manifest.json records versions, thresholds, seed and SHA-256 hashes.", "",
               "Labels were written from the declared fault/weather scenarios before executing the detector. "
               "Normal localized showers and a dry patch are valid by construction, even if flagged. "
               "The scenarios were designed with knowledge of the existing system and are not an independent holdout or expert-labeled historical evaluation. "
               "The simple six-hour rainfall profiles are not calibrated meteorological simulations. "
               "This fixture deliberately has complete coverage; missing-data behavior requires separate tests. "
               "Repeated UI runs can have different near-boundary LOF scores because the application's jitter generator advances. "
               "Do not generalize these percentages to PAGASA data, real sensor faults, or all Quezon City AWS.", ""]
    (output / "RESULTS.md").write_text("\n".join(report), encoding="utf-8")
    print(json.dumps(measures, indent=2))
    print(f"Evidence: {output}")


if __name__ == "__main__":
    evaluate(build())
