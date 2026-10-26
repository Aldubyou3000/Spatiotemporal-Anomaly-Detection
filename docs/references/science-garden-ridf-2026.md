# Science Garden rainfall frequency reference

Source: user-provided image of a PAGASA Rainfall Intensity Duration Frequency analysis sheet, retained unchanged as `science-garden-ridf-2026.png`. The sheet identifies Science Garden station 98430, longitude 121.044587 and latitude 14.644836, a 45-year record, and release date 28 May 2026. The image has not been independently authenticated against an agency-issued original.

Selected entries transcribed from the **24-hour precipitation depth** column in the upper table:

| Return period in years | Precipitation depth in mm |
|---|---:|
| 2 | 159.4 |
| 5 | 249.4 |
| 10 | 308.9 |
| 100 | 495.3 |

These are frequency estimates for a specified duration and location, not a maximum permitted rainfall or a sensor accuracy threshold. A valid storm can exceed a listed depth. A faulty reading can fall below it. The lower table contains equivalent average intensity in mm/hour; those numbers must not be compared directly with daily depth in mm.

## Use in the anomaly detection work

- Use this sheet as station-specific rainfall rarity context when reviewing an unusually large reading, separately from neighbor disagreement and suspected measurement faults.
- Match the duration and units. The pipeline produces calendar-day totals; confirm the source sheet's accumulation window and any fixed-day versus moving-24-hour treatment with PAGASA before assigning formal return periods to those totals.
- Do not transfer Science Garden's values to all stations as universal limits without a justified applicability assessment.
- Do not use the 2-year depth of 159.4 mm to suppress every smaller anomaly or to establish that the 22.7 mm example is normal. Its false-positive label comes from the synthetic scenario's predefined answer key, not this sheet.
- Keep the existing measurements, labels, baseline flags and evaluation results unchanged. Any future extra review rule must be evaluated on separate cases, including valid extreme rainfall and below-RIDF sensor faults.

Definition reference: [NOAA HDSC glossary](https://www.weather.gov/owp/hdsc_glossary) describes precipitation frequency in relation to magnitude, duration, location and recurrence. NOAA definitions support the interpretation of frequency concepts; they do not authenticate or replace the PAGASA values above.
