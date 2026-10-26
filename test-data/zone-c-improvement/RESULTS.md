# Zone C comparison

Original answer keys and previous reports were preserved. Thresholds were selected on the existing development series before the fixed validation series was evaluated.

| Dataset | Version | TP | FN | FP | TN | Precision | Recall | F1 | Accuracy |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| development | baseline | 12 | 4 | 7 | 217 | 63.16% | 75.00% | 68.57% | 95.42% |
| development | improved | 13 | 3 | 3 | 221 | 81.25% | 81.25% | 81.25% | 97.50% |
| validation | baseline | 19 | 9 | 13 | 439 | 59.38% | 67.86% | 63.33% | 95.42% |
| validation | improved | 24 | 4 | 11 | 441 | 68.57% | 85.71% | 76.19% | 96.88% |

The reported 22.7 mm screenshot case is no longer flagged. Every changed classification is retained in the paired CSV files. See comparison.json for high and low matrices separately.

On validation, the low extension detects five additional faults but adds four low false alarms (2 to 6). Total false alarms still decrease because high false alarms fall from 11 to 5. No previously detected development or validation fault is lost in these cases.

The 5 mm / 30 percent high tolerances are provisional engineering settings, not RIDF-derived or PAGASA-endorsed limits. RIDF values are used in explicit coherent extreme-rain controls, never as sensor-error ceilings. Valid localized weather can still trigger a review flag; small faults can still be missed. The validation series uses separate dates, seed and declared interventions, but remains synthetic and authored with knowledge of the detector. These scores do not establish real-world sensor-error accuracy.
