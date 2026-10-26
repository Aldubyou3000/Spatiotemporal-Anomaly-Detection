# Controlled local-cluster evaluation

All sites and measurements are synthetic. This is a development functional test, not real-data validation.

Eight hypothetical QC-area sites; September 1-30, 2023 for every station; 5,760 hourly inputs; 240 assessed station-days. Labels: 8 high faults, 8 low faults, 224 valid readings. No interpolated or excluded rows. The existing fixture and application algorithms were not changed.

## Confusion matrices

Rows are actual labels; columns are system predictions.

### Combined

| Actual / predicted | Positive | Negative |
|---|---:|---:|
| Positive | 12 TP | 4 FN |
| Negative | 7 FP | 217 TN |

precision: 63.16%; recall: 75.00%; f1: 68.57%; accuracy: 95.42%.

### High

| Actual / predicted | Positive | Negative |
|---|---:|---:|
| Positive | 6 TP | 2 FN |
| Negative | 6 FP | 226 TN |

precision: 50.00%; recall: 75.00%; f1: 60.00%; accuracy: 96.67%.

### Low

| Actual / predicted | Positive | Negative |
|---|---:|---:|
| Positive | 6 TP | 2 FN |
| Negative | 1 FP | 231 TN |

precision: 85.71%; recall: 75.00%; f1: 80.00%; accuracy: 98.75%.

## Direction-aware results

| Actual / predicted | Normal | High | Low |
|---|---:|---:|---:|
| Normal | 217 | 6 | 1 |
| High | 2 | 6 | 0 |
| Low | 2 | 0 | 6 |

## Errors and interpretation

These are exact paired results, not a comparison of aggregate alert counts. The combined matrix counts either flag direction as positive; the separate and three-class matrices expose wrong directions. High flags combine LOF and rainfall gates; low flags use rules, so combined scores are not LOF-only performance.

| Date | Station | Scenario | Actual | Predicted | Outcome |
|---|---|---|---|---|---|
| 2023-09-09 | SyntheticQCA01 | valid_localized_shower | normal | high | FP |
| 2023-09-15 | SyntheticQCB03 | zero_fault_on_light_rain | low | normal | FN |
| 2023-09-16 | SyntheticQCB04 | progressive_overreport | high | normal | FN |
| 2023-09-17 | SyntheticQCA02 | shared_rain_with_variation | normal | high | FP |
| 2023-09-18 | SyntheticQCB02 | valid_localized_shower | normal | high | FP |
| 2023-09-18 | SyntheticQCB04 | progressive_overreport | high | normal | FN |
| 2023-09-19 | SyntheticQCB03 | shared_rain_with_variation | normal | high | FP |
| 2023-09-20 | SyntheticQCA03 | shared_rain_with_variation | normal | high | FP |
| 2023-09-20 | SyntheticQCB02 | partial_underreport | low | normal | FN |
| 2023-09-21 | SyntheticQCA04 | valid_localized_dry_patch | normal | low | FP |
| 2023-09-29 | SyntheticQCA01 | shared_rain_with_variation | normal | high | FP |

Of 16 injected fault readings, 12 were detected and 4 were missed. Of 224 valid readings, 7 raised false alarms and 217 remained unflagged. Because 224 of 240 readings are normal, an always-normal baseline already achieves 93.33% accuracy while detecting no faults; interpret the reported accuracy alongside precision and recall.

Missed fault scenarios in this run: partial_underreport, progressive_overreport, zero_fault_on_light_rain. False-alarm scenarios: shared_rain_with_variation, valid_localized_dry_patch, valid_localized_shower. The low rule's 1 mm ceiling limits partial-underreport detection. Spatial disagreement alone does not establish a sensor malfunction.

## Evidence and limitations

Inputs are in ../upload; labels and baseline truth are in ../answer_key.csv and ../daily_plan.csv. comparison.csv contains all 240 matched readings, including normal controls. predictions.csv and pipeline_result.json retain actual service output (only raw_preview is omitted from JSON; the hourly CSVs preserve inputs). neighbors.csv and pairwise_distances.csv verify the spatial layout. manifest.json records versions, thresholds, seed and SHA-256 hashes.

Labels were written from the declared fault/weather scenarios before executing the detector. Normal localized showers and a dry patch are valid by construction, even if flagged. The scenarios were designed with knowledge of the existing system and are not an independent holdout or expert-labeled historical evaluation. The simple six-hour rainfall profiles are not calibrated meteorological simulations. This fixture deliberately has complete coverage; missing-data behavior requires separate tests. Repeated UI runs can have different near-boundary LOF scores because the application's jitter generator advances. Do not generalize these percentages to PAGASA data, real sensor faults, or all Quezon City AWS.
