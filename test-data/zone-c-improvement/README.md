# Zone C improvement evidence

Read `RESULTS.md` for the before/after comparison. `comparison.json` includes separate high and low metrics; `development_comparison.csv` and `validation_comparison.csv` retain every paired label. The `*_changed.csv` files expose all changed classifications, including new false alarms. The original synthetic fixture, labels and reports were not overwritten.

The reported 22.7 mm reading against 18.2/18.0/19.7 mm is no longer flagged. High alerts retain LOF and add a difference of at least 5 mm and 30 percent of the neighbor-only median. Partial-low screening requires a reading above 1 mm but below one quarter of a wet-neighbor median, with at least a 10 mm shortfall. The settings are empirical development choices, not rainfall-frequency standards. The detector remains a review screen.

## What was compared

- `baseline_zone_c.py` is a read-only archive of the former production source (SHA-256 `488f2e53cec3ba398cc15217a87f4a5b2ed3f68528bd17197b4c408f73084241`). It is imported only by the manual comparison, never by production.
- `selection-first.json` records a stricter rejected trial. The final development comparison considered 5/10 mm and 30/50 percent tolerances with and without partial-low screening. Eligibility required preserving every previously detected development fault, not merely offsetting a new miss with a new detection.
- `selection.json` freezes the selected 5 mm/30 percent plus partial-low rule. Its `validation_evaluated=false` describes the state **at selection time**. Subsequent acceptance results are in `comparison.json`.
- The validation CSV/key were created and hashed before candidate selection. They cover eight hypothetical sites over 60 matching daily dates, 1 October to 29 November 2023, with seed 20261028: 480 observations, 12 injected high faults, 16 injected low faults and 452 normal readings. They contain valid localized weather as well as faults. No settings were tuned on the measured validation outcomes.
- Daily validation input exercises the actual conversion/Zone A/B/C service path. Existing hourly quality regressions separately verify the original 3,029 actual daily totals, 319 partial-day exclusions and 127 hourly estimates.

## Reproduce

From the repository root:

```powershell
api/.venv/Scripts/python.exe test-data/zone-c-improvement/evaluate.py
api/.venv/Scripts/python.exe -m unittest discover -s api/tests -v
```

`--select` is the development-stage command that recreates the declared synthetic validation files and selection record; retain the original evidence before rerunning it for a changed experiment. The default command verifies the frozen input hashes, compares archived and current detectors through the actual service, and writes new comparison evidence here. It does not overwrite the older evaluation package or save to a database.

`api/tests/test_zone_c.py` covers the reported case, magnitude/ratio boundaries, severe partial deficits, finite tied/dry results, exact repeat/order determinism, insufficient neighbors, unchanged input frames, the rainfall alias, parameter validation, response counts and local sync/async multipart routes. Authentication is overridden only in local route tests; real authentication, production deployment and browser behavior are not certified.

## RIDF reference and remaining errors

Tests use the supplied Science Garden sheet's 24-hour depths (159.4/249.4/308.9/495.3 mm) and a 600 mm coherent-storm case. The same tests retain gross-disagreement flags at 120 and 600 mm. The purpose is to ensure those frequency depths are not mistaken for universal sensor-error limits. No return periods are assigned to fictional stations, and no mm/hour intensity is compared with daily depth.

Development: TP 12 -> 13, FN 4 -> 3, FP 7 -> 3, TN 217 -> 221. Validation: TP 19 -> 24, FN 9 -> 4, FP 13 -> 11, TN 439 -> 441. The low extension catches five additional validation faults but adds four low false alarms (2 -> 6). Improved overall precision/recall does not remove that tradeoff.

The scenarios are synthetic and authored with knowledge of the detector, even though validation measurements and outcomes were kept separate from selection. They are not expert-labeled historical data or a meteorological calibration. Valid local weather can still be flagged; small faults can remain undetected. Existing History runs retain their earlier result/algorithm version. A fresh processing run is required to see the update.
