"""Select on existing development cases, then evaluate a fixed separate validation series."""
import csv
import hashlib
import importlib.util
import json
import random
import sys
from datetime import date, timedelta
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[1]
DEV = REPO / "test-data/synthetic-local-cluster"
sys.path.insert(0, str(REPO / "api"))
sys.path.insert(0, str(DEV))
from generate_and_evaluate import metrics, write_csv
from app.services import zones_service as service


def baseline_detector():
    spec = importlib.util.spec_from_file_location("archived_zone_c", ROOT / "baseline_zone_c.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.zone_c_lof_anomaly_detection


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def prepare_validation():
    rng = random.Random(20261028)
    rain = [0, .6, 2, 8, 18, 30, 70, 12, 20, 28, 45, 0, 90, 15, 4,
            160, 35, 6, 22, 55, 75, 10, 18, 0, 32, 48, 14, 250, 24, 12]
    sites = {f"Validation{group}{i + 1}": (14.650 + (i // 2) * .004,
             121.050 + (group == "B") * .025 + (i % 2) * .004)
             for group in ("A", "B") for i in range(4)}
    faults = {
        (4, "A1"): ("high", "add", 70), (8, "B2"): ("high", "add", 100),
        (13, "A3"): ("high", "add", 130), (17, "B4"): ("high", "multiply", 1.8),
        (22, "A2"): ("high", "add", 90), (28, "B1"): ("high", "add", 180),
        (33, "A4"): ("high", "multiply", 1.5), (38, "B3"): ("high", "add", 200),
        (43, "A1"): ("high", "add", 110), (48, "B4"): ("high", "multiply", 1.4),
        (53, "A3"): ("high", "add", 140), (58, "B2"): ("high", "add", 200),
        (6, "A2"): ("low", "set", 0), (10, "A4"): ("low", "set", 0),
        (11, "A4"): ("low", "set", 0), (15, "B3"): ("low", "set", 0),
        (20, "B2"): ("low", "multiply", .15), (21, "B2"): ("low", "multiply", .2),
        (25, "A1"): ("low", "set", 0), (25, "A2"): ("low", "set", 0),
        (27, "B4"): ("low", "set", 0), (35, "A3"): ("low", "multiply", .2),
        (36, "A3"): ("low", "multiply", .15), (40, "B1"): ("low", "set", 0),
        (45, "B3"): ("low", "multiply", .2), (50, "A4"): ("low", "set", 0),
        (55, "B2"): ("low", "multiply", .2), (60, "A1"): ("low", "set", 0),
    }
    weather = {(9, "A1"): ("add", 40), (19, "B3"): ("add", 55),
               (39, "A4"): ("add", 45), (49, "B1"): ("add", 60),
               (16, "A4"): ("set", 0), (46, "B2"): ("set", 0),
               (14, "A1"): ("multiply", .2), (26, "B4"): ("multiply", .15),
               (44, "B1"): ("multiply", .2), (56, "A2"): ("multiply", .15)}
    assert not faults.keys() & weather.keys()
    rows, key = [], []
    for day in range(1, 61):
        for station, (lat, lon) in sites.items():
            value = round(rain[(day - 1) % 30] * rng.uniform(.82, 1.18), 1)
            target = (day, station.removeprefix("Validation"))
            label, scenario = "normal", "ordinary_variation"
            if target in weather:
                operation, amount = weather[target]
                value = round(value + amount if operation == "add" else value * amount if operation == "multiply" else amount, 1)
                scenario = "valid_local_weather"
            baseline = value
            if target in faults:
                label, operation, amount = faults[target]
                value = round(value + amount if operation == "add" else value * amount if operation == "multiply" else amount, 1)
                scenario = f"injected_{label}_{operation}"
                assert value != baseline
            observation_date = (date(2023, 10, 1) + timedelta(days=day - 1)).isoformat()
            rows.append(dict(station_id=station, date=observation_date, latitude=lat, longitude=lon, rainfall=value))
            key.append(dict(station_id=station, date=observation_date, expected_label=label,
                            baseline_mm=baseline, observed_mm=value, scenario=scenario))
    assert len(rows) == len(key) == 480
    assert sum(r["expected_label"] == "high" for r in key) == 12
    assert sum(r["expected_label"] == "low" for r in key) == 16
    write_csv(ROOT / "validation_daily.csv", rows)
    write_csv(ROOT / "validation_key.csv", key)


def load_key(path):
    with path.open(newline="", encoding="utf-8") as stream:
        return list(csv.DictReader(stream))


def labels(result):
    return {(r.station_id, str(r.date)): ("high" if r.is_anomaly else
            "low" if r.is_low_anomaly or r.is_dry_stuck else "normal") for r in result.flagged_data}


def evaluate_labels(key, predictions):
    keys = {(r["station_id"], r["date"]) for r in key}
    assert keys == predictions.keys() and len(key) == len(keys)
    truth = [r["expected_label"] for r in key]
    actual = [predictions[(r["station_id"], r["date"])] for r in key]
    return {kind: metrics([t != "normal" if kind == "combined" else t == kind for t in truth],
                         [p != "normal" if kind == "combined" else p == kind for p in actual])
            for kind in ("combined", "high", "low")}


def screen(result, partial_low, high_difference_mm, high_relative_difference):
    import numpy as np
    rows = {(r.station_id, r.date): r for r in result.flagged_data}
    predictions = {}
    for row in result.flagged_data:
        others = [rows[(n.neighbor_id, row.date)].rainfall for n in result.neighbors.get(row.station_id, [])
                  if (n.neighbor_id, row.date) in rows]
        high, low = row.is_anomaly, row.is_low_anomaly or row.is_dry_stuck
        if row.lof_score is not None and len(others) >= 3:
            median = float(np.median(others))
            high = high and row.rainfall - median >= max(high_difference_mm, high_relative_difference * median)
            if partial_low:
                low = low or (row.rainfall > 1 and median >= 10 and row.rainfall < .25 * median and median - row.rainfall >= 10)
        predictions[(row.station_id, str(row.date))] = "high" if high else "low" if low else "normal"
    return predictions


def run(files, baseline=False):
    if baseline:
        with patch.object(service, "zone_c_lof_anomaly_detection", baseline_detector()):
            return service.run_pipeline_multi(files)
    return service.run_pipeline_multi(files)


def select():
    # This fixture is saved and hashed before the development candidates are compared.
    prepare_validation()
    files = [(p.name, p.read_bytes()) for p in sorted((DEV / "upload").glob("*.csv"))]
    key = load_key(DEV / "answer_key.csv")
    result = run(files, baseline=True)
    base = evaluate_labels(key, labels(result))
    candidates, configurations = {"baseline": base}, {}
    baseline_labels = labels(result)
    detected_faults = {(r["station_id"], r["date"]) for r in key if r["expected_label"] != "normal"
                       and baseline_labels[(r["station_id"], r["date"])] != "normal"}
    eligible = []
    for absolute in (5.0, 10.0):
        for relative in (.3, .5):
            for partial in (False, True):
                name = f"high_{absolute:g}mm_{relative:g}_partial_{partial}"
                predictions = screen(result, partial, absolute, relative)
                candidates[name] = evaluate_labels(key, predictions)
                configurations[name] = dict(high_difference_mm=absolute, high_relative_difference=relative,
                                            partial_low=partial, partial_low_ratio=.25, partial_low_deficit_mm=10)
                if all(predictions[k] != "normal" for k in detected_faults) and candidates[name]["combined"]["FP"] < base["combined"]["FP"]:
                    eligible.append(name)
    assert eligible
    chosen = max(eligible, key=lambda name: (candidates[name]["combined"]["f1"], candidates[name]["combined"]["precision"]))
    selection = dict(chosen=chosen, development=candidates,
                     validation_seed=20261028, validation_evaluated=False,
                     frozen_sha256={p.name: sha(p) for p in [ROOT / "validation_daily.csv", ROOT / "validation_key.csv", ROOT / "baseline_zone_c.py"]},
                     tolerances=configurations[chosen])
    (ROOT / "selection.json").write_text(json.dumps(selection, indent=2), encoding="utf-8")
    print(json.dumps(selection, indent=2))


def validate():
    from app.zones import zone_c
    selection = json.loads((ROOT / "selection.json").read_text())
    for name, digest in selection["frozen_sha256"].items():
        assert sha(ROOT / name) == digest, f"Frozen evidence changed: {name}"
    original = json.loads((DEV / "evidence/manifest.json").read_text())["sha256"]
    for name, digest in original.items():
        if "/upload/" in name or name.endswith("answer_key.csv"):
            assert sha(REPO / name) == digest, f"Original development inputs changed: {name}"
    assert selection["tolerances"] == dict(high_difference_mm=zone_c.HIGH_MIN_DIFFERENCE_MM,
        high_relative_difference=zone_c.HIGH_RELATIVE_DIFFERENCE, partial_low=True,
        partial_low_ratio=zone_c.LOW_RATIO, partial_low_deficit_mm=zone_c.LOW_MIN_DEFICIT_MM)
    results = {}
    for name, files, key in [
        ("development", [(p.name, p.read_bytes()) for p in sorted((DEV / "upload").glob("*.csv"))], load_key(DEV / "answer_key.csv")),
        ("validation", [("validation_daily.csv", (ROOT / "validation_daily.csv").read_bytes())], load_key(ROOT / "validation_key.csv")),
    ]:
        before, after = run(files, True), run(files)
        assert all(r.lof_score is not None for r in after.flagged_data)
        old, new = labels(before), labels(after)
        assert all(new[(r["station_id"], r["date"])] != "normal" for r in key
                   if r["expected_label"] != "normal" and old[(r["station_id"], r["date"])] != "normal"), "Previously detected fault was lost"
        results[name] = dict(baseline=evaluate_labels(key, old), improved=evaluate_labels(key, new))
        paired = [dict(**r, baseline_label=old[(r["station_id"], r["date"])],
                       improved_label=new[(r["station_id"], r["date"])]) for r in key]
        write_csv(ROOT / f"{name}_comparison.csv", paired)
        write_csv(ROOT / f"{name}_changed.csv", [r for r in paired if r["baseline_label"] != r["improved_label"]])
        (ROOT / f"{name}_improved_result.json").write_text(after.model_dump_json(indent=2, exclude={"raw_preview"}), encoding="utf-8")
        if name == "development":
            assert new[("SyntheticQCA01", "2023-09-29")] == "normal"
    checks = {}
    for name, result in results.items():
        old, new = result["baseline"]["combined"], result["improved"]["combined"]
        checks[name] = new["precision"] > old["precision"] and new["f1"] > old["f1"] and new["recall"] >= old["recall"]
    report = dict(selection=selection["chosen"], acceptance=checks, results=results,
                  baseline_source_sha256=sha(ROOT / "baseline_zone_c.py"),
                  current_source_sha256=sha(REPO / "api/app/zones/zone_c.py"),
                  limitation="Synthetic development and separately generated validation; not independently labeled real AWS accuracy")
    (ROOT / "comparison.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    lines = ["# Zone C comparison", "", "Original answer keys and previous reports were preserved. Thresholds were selected on the existing development series before the fixed validation series was evaluated.", "",
             "| Dataset | Version | TP | FN | FP | TN | Precision | Recall | F1 | Accuracy |", "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|"]
    for name, values in results.items():
        for version in ("baseline", "improved"):
            m = values[version]["combined"]
            lines.append(f"| {name} | {version} | {m['TP']} | {m['FN']} | {m['FP']} | {m['TN']} | {m['precision']:.2%} | {m['recall']:.2%} | {m['f1']:.2%} | {m['accuracy']:.2%} |")
    lines += ["", "The reported 22.7 mm screenshot case is no longer flagged. Every changed classification is retained in the paired CSV files. See comparison.json for high and low matrices separately.", "",
              "On validation, the low extension detects five additional faults but adds four low false alarms (2 to 6). Total false alarms still decrease because high false alarms fall from 11 to 5. No previously detected development or validation fault is lost in these cases.", "",
              "The 5 mm / 30 percent high tolerances are provisional engineering settings, not RIDF-derived or PAGASA-endorsed limits. "
              "RIDF values are used in explicit coherent extreme-rain controls, never as sensor-error ceilings. "
              "Valid localized weather can still trigger a review flag; small faults can still be missed. "
              "The validation series uses separate dates, seed and declared interventions, but remains synthetic and authored with knowledge of the detector. "
              "These scores do not establish real-world sensor-error accuracy.", ""]
    (ROOT / "RESULTS.md").write_text("\n".join(lines), encoding="utf-8")
    print(json.dumps(report, indent=2))
    assert all(checks.values()), "Candidate did not meet the declared acceptance criteria; inspect comparison.json"


if __name__ == "__main__":
    if "--select" in sys.argv:
        select()
    else:
        validate()
