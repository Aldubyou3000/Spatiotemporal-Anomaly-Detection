"""Test frozen synthetic inputs without rewriting their measurements or reference labels."""
import csv
import hashlib
import io
import json
import os
import subprocess
import sys
import time
import traceback
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

from generate_and_evaluate import ROOT, REPO, metrics, write_csv

sys.path.insert(0, str(REPO / "api"))
from app.services.zones_service import run_pipeline_multi, ZoneProcessingError

OUT = ROOT / "evidence/extended"
FILES = [(p.name, p.read_bytes()) for p in sorted((ROOT / "upload").glob("*.csv"))]


def saved_result(result):
    return result.model_dump(mode="json", exclude={"raw_preview", "cleaned_data"})


def flags(result):
    return {(r["station_id"], r["date"]): (r["is_anomaly"], r["is_low_anomaly"], r["is_dry_stuck"])
            for r in result["flagged_data"]}


def modify(files, index, transform):
    changed = list(files)
    name, contents = changed[index]
    lines = contents.decode().splitlines()
    rows = list(csv.reader(lines[7:]))
    transform(rows)
    stream = io.StringIO(newline="")
    csv.writer(stream).writerows(rows)
    changed[index] = (name, ("\n".join(lines[:7]) + "\n" + stream.getvalue()).encode())
    return changed


def main():
    OUT.mkdir(exist_ok=True)
    checks = []

    def check(name, function):
        start = time.perf_counter()
        try:
            detail = function()
            record = dict(name=name, status="PASS", seconds=round(time.perf_counter() - start, 3), detail=detail)
        except Exception:
            record = dict(name=name, status="FAIL", seconds=round(time.perf_counter() - start, 3), error=traceback.format_exc())
        checks.append(record)
        (OUT / "checks.json").write_text(json.dumps(checks, indent=2), encoding="utf-8")
        print(f"{record['status']}: {name}", flush=True)

    def integrity():
        manifest = json.loads((ROOT / "evidence/manifest.json").read_text())
        for name, expected in manifest["sha256"].items():
            assert hashlib.sha256((REPO / name).read_bytes()).hexdigest() == expected, name
        assert len(FILES) == 8
        return dict(hashes_verified=len(manifest["sha256"]), upload_files=len(FILES))

    check("Original evidence hashes and eight upload files", integrity)
    if checks[-1]["status"] == "FAIL":
        raise RuntimeError("Original evidence changed; preserve and review it before running more tests")
    baseline = json.loads((ROOT / "evidence/pipeline_result.json").read_text())
    pairs = list(csv.DictReader((ROOT / "evidence/comparison.csv").open(newline="", encoding="utf-8")))

    def independent_metrics():
        from sklearn.metrics import confusion_matrix, precision_score, recall_score, f1_score, accuracy_score
        recorded = json.loads((ROOT / "evidence/metrics.json").read_text())
        for direction in ("combined", "high", "low"):
            truth = [r["expected_label"] != "normal" if direction == "combined" else r["expected_label"] == direction for r in pairs]
            predictions = [r["predicted_label"] != "normal" if direction == "combined" else r["predicted_label"] == direction for r in pairs]
            calculated = recorded[direction]
            assert confusion_matrix(truth, predictions, labels=[True, False]).ravel().tolist() == [calculated[k] for k in ("TP", "FN", "FP", "TN")]
            for key, function in [("precision", precision_score), ("recall", recall_score), ("f1", f1_score), ("accuracy", accuracy_score)]:
                assert abs(function(truth, predictions) - calculated[key]) < 1e-12
        assert metrics([True], [False])["precision"] is None
        assert metrics([False], [False])["recall"] is None
        assert metrics([], [])["accuracy"] is None
        write_csv(OUT / "metrics_summary.csv", [dict(evaluation=d, **recorded[d]) for d in ("combined", "high", "low")])
        for dimension, filename in [("station_id", "by_station.csv"), ("scenario", "by_scenario.csv")]:
            grouped = defaultdict(list)
            for r in pairs:
                grouped[r[dimension]].append(r)
            write_csv(OUT / filename, [dict(group=group, observations=len(rows),
                      **metrics([r["expected_label"] != "normal" for r in rows], [r["predicted_label"] != "normal" for r in rows]))
                      for group, rows in sorted(grouped.items())])
        return dict(matrices_verified=3, compared_metrics=12, undefined_denominators="N/A, never forced to zero")

    check("Independent sklearn matrix/metric calculations and subgroup breakdowns", independent_metrics)
    stability = []
    for index in range(3):
        def fresh(index=index):
            start = time.perf_counter()
            process = subprocess.run([sys.executable, str(Path(__file__).resolve()), "--fresh"], capture_output=True, text=True, timeout=180)
            (OUT / f"fresh_{index + 1}.stderr.txt").write_text(process.stderr, encoding="utf-8")
            assert process.returncode == 0, process.stderr
            result = json.loads(process.stdout)
            (OUT / f"fresh_{index + 1}.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
            row = dict(run=f"fresh_{index + 1}", seconds=round(time.perf_counter() - start, 3),
                       changed_flags=sum(flags(result)[key] != value for key, value in flags(baseline).items()),
                       changed_scores=sum(a["lof_score"] != b["lof_score"] for a, b in zip(result["flagged_data"], baseline["flagged_data"])))
            stability.append(row)
            assert row["changed_flags"] == row["changed_scores"] == 0
            return row
        check(f"Fresh-process reproducibility {index + 1}/3", fresh)
    for index in range(3):
        def warm(index=index):
            start = time.perf_counter()
            result = saved_result(run_pipeline_multi(FILES))
            (OUT / f"same_process_{index + 1}.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
            row = dict(run=f"same_process_{index + 1}", seconds=round(time.perf_counter() - start, 3),
                       changed_flags=sum(flags(result)[key] != value for key, value in flags(baseline).items()),
                       changed_scores=sum(a["lof_score"] != b["lof_score"] for a, b in zip(result["flagged_data"], baseline["flagged_data"])))
            stability.append(row)
            # Score changes are permitted: the application's seeded jitter advances across calls.
            return row
        check(f"Same-process jitter observation {index + 1}/3", warm)
    write_csv(OUT / "repeatability.csv", stability)

    def reversed_order():
        process = subprocess.run([sys.executable, str(Path(__file__).resolve()), "--fresh", "--reverse"], capture_output=True, text=True, timeout=180)
        assert process.returncode == 0, process.stderr
        result = json.loads(process.stdout)
        (OUT / "reversed_upload.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
        assert flags(result) == flags(baseline)
        assert [r["lof_score"] for r in result["flagged_data"]] == [r["lof_score"] for r in baseline["flagged_data"]]
        return dict(changed_flags=0, changed_scores=0)
    check("Reversed upload order in a fresh process", reversed_order)

    def quality_case(name, files, total=None, assessed=None, filled=0, excluded=0, duplicates=0, reject=False, no_flags=False):
        def run():
            hashes = {n: hashlib.sha256(b).hexdigest() for n, b in files}
            try:
                result = run_pipeline_multi(files)
            except ZoneProcessingError as exc:
                assert reject, str(exc)
                detail = dict(rejected=True, reason=str(exc), input_sha256=hashes)
            else:
                assert not reject, "Invalid input was accepted"
                actual_assessed = sum(r.lof_score is not None for r in result.flagged_data)
                unassessed_flags = sum((r.is_anomaly or r.is_low_anomaly or r.is_dry_stuck)
                                      for r in result.flagged_data if r.lof_score is None)
                report = result.quality_report
                assert len(result.flagged_data) == total
                assert actual_assessed == assessed
                assert report.rows_filled == filled
                assert report.rows_excluded == excluded
                assert report.exclusion_details.hourly_duplicates == duplicates
                assert unassessed_flags == 0
                if no_flags:
                    assert not any(r.is_anomaly or r.is_low_anomaly or r.is_dry_stuck for r in result.flagged_data)
                detail = dict(daily_rows=total, assessed=actual_assessed, unassessed=total - actual_assessed,
                              unassessed_flags=unassessed_flags, quality=report.model_dump(), input_sha256=hashes)
            (OUT / f"quality_{name}.json").write_text(json.dumps(detail, indent=2), encoding="utf-8")
            return detail
        check(name, run)

    def set_value(rows, value):
        rows[10][2] = value
    quality_case("isolated_missing_hour", modify(FILES, 0, lambda r: set_value(r, "NULL")), 240, 240, filled=1)
    quality_case("two_missing_hours", modify(FILES, 0, lambda r: (set_value(r, "NULL"), r[11].__setitem__(2, "NULL"))), 239, 236, excluded=1)
    quality_case("absent_hourly_timestamp", modify(FILES, 0, lambda r: r.pop(10)), 239, 236, excluded=1)
    quality_case("duplicate_timestamp", modify(FILES, 0, lambda r: r.insert(11, list(r[10]))), 240, 240, duplicates=1)
    for name, value in [("negative_rainfall", "-1"), ("infinite_rainfall", "inf")]:
        quality_case(name, modify(FILES, 0, lambda r, value=value: set_value(r, value)), reject=True)
    quality_case("malformed_timestamp", modify(FILES, 0, lambda r: r[10].__setitem__(0, "99/99/2023")), reject=True)
    quality_case("three_stations_only", FILES[:3], 90, 0, no_flags=True)
    def shift_dates(rows):
        for row in rows:
            row[0] = (datetime.strptime(row[0], "%m/%d/%Y") + timedelta(days=31)).strftime("%m/%d/%Y")
    quality_case("nonoverlapping_station_dates", modify(FILES, 3, shift_dates), 240, 120)
    for name, value in [("all_dry_control", "0.0"), ("uniform_heavy_rain_control", "2.5")]:
        changed = FILES
        def replace_values(rows, value=value):
            for row in rows:
                row[2] = value
        for index in range(8):
            changed = modify(changed, index, replace_values)
        quality_case(name, changed, 240, 240, no_flags=True)

    def http_tests():
        for key in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY", "SUPABASE_JWT_SECRET"):
            os.environ.setdefault(key, "http://127.0.0.1:1" if key == "SUPABASE_URL" else "test")
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        from app.routers import zones
        app = FastAPI()
        app.include_router(zones.router)
        actor = dict(id="18eb498a-e434-4818-bbf6-e541353a4225", username="synthetic_test", full_name="Synthetic Test",
                     email="synthetic@example.com", role="analyst")
        app.dependency_overrides[zones.require_analyst_or_bearer] = lambda: actor
        files = [("files", (n, b, "text/csv")) for n, b in FILES]
        requests = []
        with patch.object(zones.limiter, "enabled", False), patch.object(zones, "try_save_run", side_effect=AssertionError("Unexpected database save")):
            with TestClient(app) as client:
                response = client.post("/api/zones/process", files=files)
                assert response.status_code == 200, response.text
                sync = response.json()
                assert flags(sync) == flags(baseline)
                assert sync["history_saved"] is False
                requests.append(dict(case="synchronous multipart upload", status=200, daily_rows=len(sync["flagged_data"])))
                response = client.post("/api/zones/process?async=true", files=files)
                assert response.status_code == 202, response.text
                job_id = response.json()["job_id"]
                deadline = time.perf_counter() + 90
                polls = 0
                while time.perf_counter() < deadline:
                    response = client.get(f"/api/zones/jobs/{job_id}")
                    assert response.status_code == 200, response.text
                    body = response.json()
                    polls += 1
                    if body["status"] != "processing":
                        break
                    time.sleep(.05)
                assert body["status"] == "done", body
                assert flags(body["result"]) == flags(baseline)
                (OUT / "http_async_result.json").write_text(json.dumps(body, indent=2), encoding="utf-8")
                requests.append(dict(case="async upload and owner polling", status=202, final_status="done", polls=polls))
                for case, name, contents, expected, headers in [
                    ("non-CSV", "bad.txt", b"not csv", 415, {}),
                    ("empty CSV", "empty.csv", b"", 400, {}),
                    ("oversized content length", FILES[0][0], FILES[0][1], 413, {"content-length": str(20 * 1024 * 1024 + 1)}),
                    ("malformed CSV", "bad.csv", b"unusable\ndata", 422, {}),
                ]:
                    response = client.post("/api/zones/process", files=[("files", (name, contents, "text/csv"))], headers=headers)
                    assert response.status_code == expected, (case, response.status_code, response.text)
                    requests.append(dict(case=case, status=response.status_code))
                response = client.post("/api/zones/process")
                assert response.status_code == 422
                requests.append(dict(case="missing files", status=422))
        (OUT / "http_checks.json").write_text(json.dumps(requests, indent=2), encoding="utf-8")
        return dict(assertions=len(requests), authentication="synthetic dependency override", limiter="disabled only in this local test",
                    scope="actual router and pipeline; no deployment, real login or persistence")
    check("Local HTTP multipart, asynchronous polling and upload validation", http_tests)

    def backend_regressions():
        process = subprocess.run([sys.executable, "-m", "unittest", "discover", "-s", "api/tests", "-v"],
                                 cwd=REPO, capture_output=True, text=True, timeout=300)
        (OUT / "backend_tests.txt").write_text(process.stdout + "\n" + process.stderr, encoding="utf-8")
        assert process.returncode == 0, process.stderr[-5000:]
        import re
        count = re.search(r"Ran (\d+) tests", process.stderr)
        assert count
        return dict(tests=int(count[1]), status="OK", external_services="existing mocked tests; no real database writes")
    check("Complete existing backend regression suite", backend_regressions)
    summary = dict(completed_at_utc=datetime.now(timezone.utc).isoformat(),
                   passed=sum(r["status"] == "PASS" for r in checks), failed=sum(r["status"] == "FAIL" for r in checks),
                   checks=checks, repeatability=stability,
                   limitation="Synthetic development evaluation; not independent historical labels or production browser/authentication validation")
    (OUT / "testing_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    sources = [Path(__file__), ROOT / "generate_and_evaluate.py", ROOT / "answer_key.csv", *[ROOT / "upload" / n for n, _ in FILES]]
    hashes = {p.relative_to(REPO).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
              for p in [*sources, *sorted(OUT.glob("*.json")), *sorted(OUT.glob("*.csv")), OUT / "backend_tests.txt"]}
    (OUT / "sha256.json").write_text(json.dumps(hashes, indent=2), encoding="utf-8")
    print(f"Extended checks: {summary['passed']} passed; {summary['failed']} failed", flush=True)
    if summary["failed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    if "--fresh" in sys.argv:
        result = run_pipeline_multi(list(reversed(FILES)) if "--reverse" in sys.argv else FILES)
        print(json.dumps(saved_result(result)))
    else:
        main()
