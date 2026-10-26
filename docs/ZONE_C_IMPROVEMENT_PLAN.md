# Zone C improvement plan

## Objective and scope

Resolve the reported high false alarm at 22.7 mm against 18.2, 18.0 and 19.7 mm, reduce nuisance alerts, and investigate partial underreporting. The user's 27 October 2026 request explicitly authorizes improving Zone C, overriding the earlier frozen-Zone-C constraint for this task. Zone A, Zone B, API authentication, persistence, mobile code and existing saved results remain unchanged.

Rainfall disagreement identifies candidates for review, not verified instrument faults. The same observable rainfall values can result from valid local weather or a faulty instrument. No method using only these values can guarantee both zero false alarms and zero missed faults.

## Preserve the baseline

Archive the current Zone C source and SHA-256 before editing. Preserve all existing synthetic inputs, answer keys, outputs, confusion matrices and Word/PDF reports as historical baseline evidence. Save new comparison results separately; do not overwrite old evaluation records or change their labels.

## Candidates to compare on the existing development fixture

1. Baseline: current LOF/high and near-zero/low rules.
2. High tolerance: retain LOF and the existing high gates, additionally require own rainfall minus the median of the other reporting neighbors to exceed both an absolute and relative tolerance. Compare a small development grid of 5/10 mm and 30/50 percent. These are provisional engineering tolerances, not PAGASA/WMO standards or RIDF-derived quantities. Equal-boundary behavior is explicit.
3. High tolerance plus partial-low screening: retain existing near-zero events and additionally screen a reading above 1 mm but below 25 percent of its neighbors' median when that median is at least 10 mm and the shortfall is at least 10 mm. This tests severe partial underreporting without changing the near-zero gates or treating the result as a confirmed fault.

The first 10 mm/50 percent trial removed four false alarms but also lost a previously detected moderate high fault; the added partial-low rule caught a different fault. Its selection record is preserved as selection-first.json. Before evaluating the separate validation data, compare the declared small grid and explicitly require every previously detected development fault to remain detected. Do not merely offset a newly missed fault with a different newly detected one.

Select the smallest candidate that improves development F1/precision without losing the baseline's detected development faults. Freeze the chosen rule before evaluating the separate validation fixture. Do not tune its constants on validation outcomes.

Replace process-global random jitter with deterministic tie handling and canonical group ordering, keeping the same small perturbation scale. Repeated requests and input permutations must not change scores or classifications. Keep the LOF scoring direction and public function signature unchanged.

## Separate validation designed before candidate selection

Create a deterministic, separately labeled October-November 2023 synthetic series for eight hypothetical neighboring sites. Include ordinary variation, wet/dry days, obvious high errors, moderate biases, zero faults, partial low faults, valid localized showers/dry patches and simultaneous faults. Labels derive from declared interventions rather than detector thresholds. Save the fixture before running candidate selection. This is an unseen synthetic validation series, not independent meteorological or expert validation.

Report baseline and selected-candidate matrices separately for development and validation, including high, low and combined classifications, precision, recall, F1 and accuracy. Record every changed flag. Acceptance requires the exact reported case to stop flagging, obvious gross-error controls to remain detected, lower development false positives, and improved validation precision/F1 without lower aggregate validation recall. If those conditions fail, report the failure rather than silently altering the validation set.

## RIDF reference

Use the supplied Science Garden sheet as test context. Its 24-hour depths include 159.4, 249.4, 308.9 and 495.3 mm. Include coherent rainfall near and above those values as valid extreme-weather controls; include sensor errors below and above them. Never treat these depths as physical ceilings, universal AWS limits, ground-truth labels, or directly comparable to mm/hour intensities. Do not assign return periods to fixed calendar-day output without confirming the source accumulation window.

## Required checks and integration

- Regression for the screenshot, high/low tolerance boundaries, dry/tied readings, RIDF-scale coherent storms, isolated gross errors, partial deficits, insufficient neighbors and missing comparison days.
- Determinism across repeated calls and shuffled rows; finite scores; input immutability; meaningful errors for invalid parameters.
- Existing backend suite, original hourly/daily quality guarantees and actual-dataset daily-total checks.
- End-to-end API response counts, flagged rows, low-review union and anomaly summaries agree. Existing raw near-zero screening must not reintroduce a high false alarm.
- Update detection documentation, historical-evidence instructions and architecture map. No dependency or database migration is planned.

## Evidence and limitations

Record old/new source hashes, rule-selection results, fixed validation seed/scenarios and changed classifications. Keep raw measurements and original answer keys intact. Any measured improvement is limited to these synthetic scenarios; actual PAGASA sensor-error accuracy still needs independent reference labels.
