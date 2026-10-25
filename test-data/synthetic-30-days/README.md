# One-month controlled rainfall test

**Synthetic rainfall, September 1–30, 2023.** Four fictional stations use the locations from the four supplied HMDAS CSV headers. These are invented measurements, not PAGASA observations.

## Use

1. Upload **all four CSVs inside `upload/` together**, in a fresh run. Do not combine them with the real dataset.
2. Compare the daily results with `answer_key.csv`, using both date and station ID.
3. The original scenario plan expects **6 high flags, 6 low flags, and 108 unflagged station-days**. Record any extra or missed flags as test results. Do not change the answer key to match the detector.

The uploads preserve the current six metadata rows, `Date,Time,Value [mm]` layout (`Total [mm]` for Napindan), MM/DD/YYYY dates, and hourly measurements in mm. Each station has 720 readings, including zeros: no missing hours or duplicates. Zone A should retain 120 daily rows with no interpolated hours or incomplete days. Zone B has four stations available every day.

## Edit

Open `daily_plan.csv` in Excel or a text editor. The four station columns are **daily rainfall totals in mm**. Edit these totals and the expected high/low station names to define your own cases. Blank expected station names mean no flag of that type is intended that day. Save as CSV, then regenerate from the repository root:

```powershell
api/.venv/Scripts/python.exe test-data/synthetic-30-days/generate.py
```

Regeneration overwrites the four synthetic upload files and the answer key. It preserves the editable plan. Rainfall is distributed across 12:00–17:00, with all other hours zero; this simple pattern is for daily comparisons, not realistic storm simulation. You can also edit hourly upload values directly, but then update the daily totals and answer key yourself. Regeneration replaces those direct hourly edits.

## Cases included

| Case | Dates in September | Intended result |
| --- | --- | --- |
| One station much higher | 4, 9, 13, 18, 27 | High flag on the named station |
| One station at 0–1 mm while neighbors report rain | 6, 11, 15, 21, 25, 29 | Low flag on the named station |
| One station at 10 mm while neighbors are dry | 23 | High flag at the current minimum rainfall boundary |
| One station at 5 mm while neighbors are dry | 19 | No high flag: below the 10 mm minimum |
| All stations report similar heavy rainfall | 7, 16, 22, 30 | No flags just because rainfall is heavy |
| Dry, light, or similar moderate rainfall | Remaining dates | No flags |

## Evaluate

The answer key is specified by the scenarios, independently of LOF output. It has one row per station-day, including normal controls. High and low flags are separate columns so a flag in the wrong direction is a mismatch.

- **Correct detection (TP):** an intended flag was found in the correct direction.
- **False alarm (FP):** the system flagged a reading that should not have that flag.
- **Missed detection (FN):** the system missed an intended flag.
- **Precision:** TP / (TP + FP).
- **Recall:** TP / (TP + FN).

Calculate high and low results separately; use `n/a` when a denominator is zero. For overall accuracy, compare the complete pair of expected high/low flags on each of the 120 station-days, then divide matching rows by 120. The two directions and the normal controls matter, not only the final count.

This is a small, deliberately clear functional test. It supports claims about these controlled cases, not a real-world accuracy percentage or proof of faulty sensors. Missing data, station exclusion, subtle differences, multiple simultaneous faults, and broader weather patterns need separate tests. Editing the plan creates a new test version; retain a copy of the original for comparisons.
