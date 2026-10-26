# Synthetic local-cluster rainfall test

**Historical baseline evidence:** the retained predictions/reports below precede the 27 October 2026 Zone C update. Keep them unchanged for comparison. Running the old generator now executes the current detector and overwrites this directory's generated evidence; do not do that to reproduce the old results. Use `../zone-c-improvement/evaluate.py` to compare the archived and current detectors without overwriting this baseline. Original source-hash checks in the old extended runner intentionally identify the changed Zone C version.

All eight stations, coordinates and measurements are hypothetical. The coordinates describe a compact QC-area test layout, not verified AWS sites or municipal boundaries. No PAGASA measurements or real station identities are claimed. The HMDAS portal was used only to understand station/data categories; no coordinates or observations were copied from its markers.

## Use in the application

Upload **all eight CSV files in `upload/` together** in a fresh Zones run. Do not upload the answer key, plan, evidence CSVs or real observations alongside them. Every station covers exactly **September 1-30, 2023**, with all 24 hourly timestamps each day: 720 readings per station, 5,760 total hourly readings, and 240 daily results. Times are a shared local observation clock, with no timezone conversion.

The sites form two small neighboring quartets. Each station has its three closest neighbors within its own quartet; the saved distances and actual pipeline selections are in `evidence/`. The eight-station layout makes geographic neighbor selection meaningful, unlike an exactly four-station test where every station uses all other stations. Compact placement is a declared test condition, not evidence that real neighboring stations must receive identical rainfall.

## What is being tested

- Shared dry, light, moderate and heavy rain with station variation.
- Five gross overreport events and three progressively stronger overreport days.
- Zero-reading faults, a two-day stuck-zero event, partial underreporting, and two simultaneous zero faults.
- Valid localized showers and a valid dry patch, which deliberately challenge false-alarm handling.

`daily_plan.csv` records the valid baseline, observed sensor value, scenario and expected label for every station-day. `answer_key.csv` contains **8 high faults, 8 low faults and 224 normal readings**, specified from the interventions before detection is executed. A fault label means a deliberately injected measurement error, including small faults the current detector may miss. Normal weather differences remain normal regardless of detector output. No answer is changed to make the system pass.

Daily totals are spread over a simple six-hour profile whose start time varies by date, with exact 0.1 mm accounting. This exercises hourly ingestion and daily aggregation; it is not a realistic hourly storm model. No missing hours, duplicate timestamps or interpolation cases are mixed into this fixture.

## Reproduce the evidence

From the repository root, in a **fresh Python process**:

```powershell
api/.venv/Scripts/python.exe test-data/synthetic-local-cluster/generate_and_evaluate.py
```

This overwrites this fixture's generated inputs and evidence only. Preserve a copy of an evaluated version before changing the script. The existing `synthetic-30-days/` fixture is untouched. The script uses the existing Python dependencies and calls the actual `run_pipeline_multi` service once, including the HMDAS converter and frozen Zone A/B/C algorithms. No servers, credentials, database writes, application changes or threshold tuning are involved.

Saved-file checks verify every timestamp and daily sum. Evaluation checks cover exact station/date joins, no duplicate or unassessed results, matching daily rainfall, retained coverage, compact neighbor groups and hand-calculated confusion-matrix examples. Checks validate the evaluation process; they do not require perfect detector scores.

Read **`evidence/RESULTS.md`** for measured combined/high/low matrices, metrics and every misclassification. `comparison.csv` contains all paired results; `errors.csv` lists disagreements; `predictions.csv` and `pipeline_result.json` preserve service output; `manifest.json` records input/source/output hashes and execution settings. Low predictions include `is_low_anomaly OR is_dry_stuck`, matching the application review flag semantics. High predictions use `is_anomaly`; the combined prediction is their union. High and low matrices are each one-versus-rest; the three-class table also exposes wrong-direction flags.

## Thesis use

Suggested method description: "A controlled synthetic functional evaluation used eight hypothetical nearby station locations with synchronized hourly rainfall records for September 1-30, 2023. Predefined sensor interventions provided reference labels for 240 station-day observations. Predictions from the unchanged processing pipeline were joined to the reference labels by station identifier and date to compute combined and direction-specific confusion matrices, precision, recall, F1-score and accuracy."

These scenarios were designed with knowledge of the current algorithm. They are development tests, not a blinded holdout or independent expert validation. State that all readings are synthetic and report errors without adjusting the labels or selecting only successful cases. Actual historical-data accuracy and real faulty-sensor diagnoses require separate independent evidence. The manuscript's historical-data evaluation plan is not fulfilled by this fixture alone.

## Complete controlled testing package

Start with `evidence/extended/CONTROLLED_TEST_REPORT.pdf` for all matrices, measured metrics, testing outcomes, scope limitations and suggested Results and Discussion text. The four `matrix_*.png` figures are ready to insert into a document; the matching SVGs preserve vector graphics. `FINAL_REPORT.md` is the plain-text report. Original results remain in `evidence/RESULTS.md`.

The extended run preserves the original inputs and answer key. Reproduce it with:

```powershell
api/.venv/Scripts/python.exe test-data/synthetic-local-cluster/run_extended_testing.py
```

It verifies original hashes, independently cross-checks metrics against scikit-learn, exports station/scenario breakdowns, repeats three fresh-process and three same-process runs, reverses upload order, and tests 11 separate quality/control variants. These cover missing hours, missing timestamps, duplicates, negative/infinite rainfall, malformed dates, insufficient stations, nonoverlapping dates, all-dry data and shared heavy rainfall. Separate local HTTP checks cover synchronous multipart upload, asynchronous polling and five input-validation cases. Authentication is overridden with a synthetic analyst and rate limiting is disabled only inside those route tests; real authentication and production/browser behavior are not validated. The existing backend suite runs separately, with its full log saved.

`evidence/extended/testing_summary.json` records pass/fail outcomes, `repeatability.csv` distinguishes changed flags from changed scores, and `by_station.csv`/`by_scenario.csv` retain breakdowns. Blank CSV metrics mean undefined (N/A), not zero. The per-variant JSON files retain observed coverage and exact input hashes; the mutation code and original files reproduce those variants without contaminating the primary confusion matrix. Quality-case assertions are checks of documented behavior, not extra labeled detection observations. Fresh-run seconds include process startup and local machine overhead; they are not a production performance benchmark.

Render the PDF and figures using the Codex bundled runtime, which already supplies ReportLab and Poppler:

```powershell
& "$env:USERPROFILE/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe" test-data/synthetic-local-cluster/render_report.py
```

No algorithm, threshold or original fixture changes are required. Keep the complete evidence package together; the report alone does not replace its source predictions and reference labels. Passing engineering checks does not imply perfect anomaly detection or externally validated labels.

## Editable IMRaD document

`evidence/extended/Rainfall_Anomaly_Evaluation_IMRaD.docx` reorganizes the completed evaluation into Introduction, Methods, Results and Discussion. All four confusion matrices and the supporting metric, quality, HTTP and error tables are editable Word tables. Methods contains the dataset design, reference labels, processing rules and formulas; Results contains observations and counts; Discussion contains interpretation, limitations and further validation. The document is an evaluation report rather than a rewrite of the full thesis. The measured predictions and labels are unchanged.

The shorter `evidence/extended/Rainfall_Anomaly_Evaluation_IMRaD_Simple.docx` is the current plain-language version. It retains the four IMRaD sections, one combined confusion matrix, a performance table, and a short interpretation of errors and synthetic-data limitations. Detailed matrices and engineering evidence remain in the earlier report and evidence files.

`build_imrad_docx.py` now reproduces this simplified version from the saved evidence using the bundled Python runtime and python-docx. It checks section order, two editable tables and retained metric values. The original detailed document is preserved. Official school-specific formatting and final Word pagination need checking in Word because this environment has no document layout engine.
