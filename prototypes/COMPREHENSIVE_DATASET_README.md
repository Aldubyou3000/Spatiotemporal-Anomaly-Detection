# Comprehensive Dummy Dataset Documentation

## Overview

**File**: `qc_aws_dummy_data_comprehensive.csv`

**Size**: 100,000 rows covering 14 weather stations across 3 years (2023-2025) with realistic data quality issues.

**Purpose**: Comprehensive testing of all Zone A features including edge cases, exclusions, gaps, and data quality scenarios.

---

## Dataset Characteristics

| Metric | Value |
|--------|-------|
| Total rows | 100,000 |
| Unique stations | 14 |
| Date range | 2023-01-01 to 2025-12-31 |
| Missing temperatures | 33,708 (33.7%) |
| Missing humidity | 33,708 (33.7%) |
| Missing coordinates | 6,666 rows |
| Expected output (after Zone A) | ~68,000 rows (31.9% reduction) |

---

## Station Breakdown & Test Categories

### Clean Data Stations
These stations will pass through Zone A with minimal exclusion:

| Station ID | Type | Rows | Valid % | Test Purpose |
|------------|------|------|---------|--------------|
| AWS_001 | Full | 6,666 | 100% | Baseline: complete, valid data |
| AWS_013 | Normal | 6,666 | 100% | Clean time-series with seasonal patterns |
| AWS_007 | No coords | 6,666 | 100% | Valid readings, missing lat/lon (should keep) |

**Expected behavior**: Retained as-is (100%), no interpolation needed.

---

### Single-Day Gap Stations  
These have 1-day gaps that should be **filled by interpolation**:

| Station ID | Type | Rows | Valid % | Gap Pattern |
|------------|------|------|---------|-------------|
| AWS_002 | 1-day gaps | 6,666 | 90% | Every 10th reading is NaN (1-day gap, should fill) |

**Expected behavior**: 
- Input: 6,666 rows (600 with 1-day gaps)
- Output: ~6,665 rows (NaN filled, interpolated_flag=True for ~600 rows)

---

### Multi-Day Gap Stations
These have 2+ day gaps that should be **excluded**:

| Station ID | Type | Rows | Valid % | Gap Pattern |
|------------|------|------|---------|-------------|
| AWS_003 | 2-day gaps | 6,666 | 90% | Every 20th-21st readings are NaN (2-day gap, exclude) |
| AWS_010 | Mixed gaps | 6,666 | 86.7% | Mix of 1-day (fill) and 2-day (exclude) gaps |
| AWS_012 | Edge + gaps | 6,666 | 60% | Start NaN + end NaN + 2-day gaps in middle |

**Expected behavior**:
- Rows in ≥2-day gaps excluded
- Rows at series start (before valid data) excluded
- Rows at series end (after valid data) excluded  
- Remaining 1-day gaps filled

---

### Partial/Sparse Data Stations

| Station ID | Type | Rows | Valid % | Behavior |
|------------|------|------|---------|---------|
| AWS_004 | Partial | 6,666 | 49.7% | ~50% random NaN (high missingness but kept) |
| AWS_008 | Start NaN | 6,666 | 75% | First 25% is NaN (series edge excluded) |
| AWS_009 | End NaN | 6,666 | 75% | Last 25% is NaN (series edge excluded) |
| AWS_014 | Sparse | 13,208 | 33.3% | Very sparse: 2-3 year gaps, many 2+ day sequences |

**Expected behavior**:
- AWS_004: Keeps valid data, excludes NaN rows
- AWS_008: Excludes first ~1,667 rows (series start NaN), keeps rest
- AWS_009: Excludes last ~1,667 rows (series end NaN), keeps rest
- AWS_014: Heavy exclusion due to large gap sequences

---

### Exclusion Stations  
These should be **excluded entirely** (0 output rows):

| Station ID | Type | Rows | Valid % | Reason |
|------------|------|------|---------|--------|
| AWS_005 | Zero valid | 6,666 | 0% | All NaN (0% valid) → EXCLUDED |
| AWS_006 | One reading | 6,666 | 0.01% | Only 1 valid reading (<2 threshold) → EXCLUDED |

**Expected behavior**: Entire stations removed (0 rows in output).

---

### Special Test Cases

| Station ID | Type | Rows | Test Purpose |
|------------|------|------|--------------|
| AWS_011 | Duplicates | 6,800 | Has duplicate (station_id + date) rows for dedup testing |

---

## Zone A Processing Results (100k → 68k rows)

**Expected Output**:
- Total rows: ~68,091 (31.9% reduction)
- Stations retained: 12 (AWS_005, AWS_006 excluded)
- Temperature NaN: 0 (all filled or excluded)
- Humidity NaN: 0 (all filled or excluded)

**Exclusion Breakdown**:
- Rows in ≥2-day gaps: ~15,660
- Rows at series start: ~2,779
- Rows at series end: ~2,782
- Duplicate rows: ~134
- Stations: 2 (AWS_005: 0%, AWS_006: <2 readings)

**Interpolation**:
- Rows filled: ~1,934 (2.8% of output)
- Rows original: ~66,157 (97.2% of output)

---

## How to Use This Dataset

### Basic Test (Zone A Processing)

```python
import pandas as pd
from zone.zone_a import process_zone_a

# Load comprehensive dataset
raw = pd.read_csv('qc_aws_dummy_data_comprehensive.csv')

# Run Zone A
cleaned, report = process_zone_a(raw)

print(f"Input: {len(raw)} rows")
print(f"Output: {len(cleaned)} rows")
print(report['summary_text'])
```

### Expected Output

```
Input: 100,000 rows
Output: 68,091 rows
Processed 100000 rows from 14 station(s). Output: 68091 rows from 12 station(s). 
Excluded: 2 station(s) (1 with 0% valid, 1 with <2 readings), 15660 rows (gaps ≥2 days), 
2779 rows (series start NaN), 2782 rows (series end NaN), 134 duplicate(s).
```

### Integration Testing (Zone A → Zone B → Zone C)

```python
from zone.zone_a import process_zone_a
from zone.zone_b import zone_b_haversine_grouping  # or equivalent
from zone.zone_c import zone_c_lof_anomaly  # or equivalent

# Zone A
cleaned, report_a = process_zone_a(raw)

# Zone B (add neighbor_group_id)
grouped = zone_b_haversine_grouping(cleaned, distance_threshold=10)

# Zone C (add LOF scores)
anomalies = zone_c_lof_anomaly(grouped, mode='spatial')

print(f"Final output: {len(anomalies)} rows with anomaly detection")
```

### Performance Testing

This 100k-row dataset is suitable for:
- Performance benchmarking (how fast does Zone A process 100k rows?)
- Memory usage testing
- Streamlit UI responsiveness testing
- Full pipeline integration testing

---

## Test Checklist

Use this checklist to verify Zone A correctness against comprehensive dataset:

### Data Exclusion Tests
- [ ] AWS_005 (0% valid) - entire station excluded
- [ ] AWS_006 (<2 readings) - entire station excluded
- [ ] AWS_003 (2-day gaps) - rows with ≥2-day gaps excluded
- [ ] AWS_008 (series start NaN) - leading NaN rows excluded
- [ ] AWS_009 (series end NaN) - trailing NaN rows excluded
- [ ] AWS_011 (duplicates) - duplicate rows removed

### Data Filling Tests
- [ ] AWS_002 (1-day gaps) - single-day gaps filled
- [ ] interpolated_flag column - True only for filled rows
- [ ] Numeric precision - all values exactly 1 decimal

### Data Quality Tests
- [ ] No NaN in temperature or humidity in output
- [ ] All original columns preserved
- [ ] interpolated_flag column added
- [ ] Coordinates preserved where available
- [ ] Dates valid and in order per station

### Report Validation
- [ ] Quality report structure correct
- [ ] Exclusion counts accurate
- [ ] Summary text populated
- [ ] All required fields present

---

## Comparison: Small vs. Comprehensive Dataset

| Aspect | Small (240 rows) | Comprehensive (100k rows) |
|--------|------------------|--------------------------|
| File | `qc_aws_dummy_data.csv` | `qc_aws_dummy_data_comprehensive.csv` |
| Stations | 8 | 14 |
| Date range | 1 month | 3 years |
| Purpose | Quick validation | Full integration testing |
| Test coverage | Basic | All edge cases |
| Processing time | <1s | ~5-10s |

---

## Notes

1. **Date range**: Extends beyond 2025 (generated automatically). Real data will be 2023-2025.
2. **Station IDs**: AWS_001 through AWS_015 (AWS_015 not used; 14 stations actually generated).
3. **Missing data**: 33.7% of temperature/humidity is missing (realistic for field data).
4. **Coordinate coverage**: 6,666 rows missing coordinates (tests NaN handling).
5. **Variability**: Includes seasonal patterns and realistic temperature ranges (20-35°C typical).

---

## Future Uses

- **Regression testing**: Verify Zone A changes don't break expected behavior
- **Performance profiling**: Measure processing time for 100k rows
- **UI testing**: Load comprehensive dataset in Streamlit for UI responsiveness
- **Accuracy validation**: Compare Zone A output against manual verification
- **Documentation**: Use as example for production data ingestion

