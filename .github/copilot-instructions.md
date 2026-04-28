# Spatiotemporal Anomaly Detection - Development Guide

## Project Overview

**AWS Quality Control Pipeline** — A Streamlit web application for automated weather station (AWS) data quality control and anomaly detection using multiple spatial analysis methods.

**Purpose**: Detect anomalies in weather station sensor data through three complementary algorithms deployed across different geographic zones.

**Stack**: Python 3.8+, Streamlit, Pandas, NumPy, scikit-learn, Plotly, Folium

---

## System Scope & Limitations

### Scope of the System

**Zone A (Data Cleaning):**
- Linear interpolation to fill ONLY single-day gaps with valid data on both sides (limit=1 day)
- Aggressive exclusion strategy: removes any data with gaps ≥2 days, NaN at series edges, or insufficient valid readings
- Validates temperature and humidity are within physical ranges (temp: -50°C to 60°C, humidity: 0–100%)
- Checks for required columns (station_id, date, latitude, longitude, temperature, humidity)
- Detects and removes duplicate station_id + date combinations
- Handles all missing value formats (NaN, 'NA', 'null', empty cells)
- Tracks which values were interpolated vs. measured via `interpolated_flag` column
- Flags stations with missing coordinates
- Monitors rounding precision (1 decimal place)
- **Exclusion rules** (data is REMOVED, not flagged, to ensure downstream accuracy):
  - Stations with 0% valid data (no salvageable data)
  - Stations with <2 valid readings (insufficient for statistical analysis)
  - Gaps ≥2 consecutive days (too risky to interpolate; likely sensor failure)
  - Series starting with NaN (no backward extrapolation/synthetic data)
  - Series ending with NaN (no forward extrapolation/synthetic data)
- **Quality philosophy:** Smaller dataset of trusted data > larger dataset contaminated by missing values. Ensures LOF anomaly detection receives only high-confidence input.

**Why Exclude Instead of Flag?**
- **Flagged data still contaminates LOF:** Marking bad data as "flagged" doesn't prevent LOF from treating it as input. Anomalies detected in flagged rows are unreliable (false positives).
- **Aggressive exclusion ensures accuracy:** Only clean, verified data reaches Zones B & C. Anomalies detected in remaining rows are trustworthy and defensible for research publication.
- **Scientific reproducibility:** Clear exclusion criteria (0%, <2, gap≥2, edge NaN) are transparent and auditable. Peer reviewers can verify the methodology.
- **Minimum viable dataset:** Losing 10-20% of records (typically removed by aggressive cleaning) is acceptable; the remaining 80-90% is high-confidence.

**Zones B & C:**
- Haversine distance calculation for geographic neighbors (1–50 km threshold, tunable)
- Local Outlier Factor (LOF) anomaly detection using 2D feature space (temperature + humidity)
- Supports global mode (all data) and spatial-context mode (station + neighbors only)

**Dashboard:**
- CSV upload and download with configurable parameters
- Temperature display format switching (Original/Celsius/Fahrenheit)
- Auto-detection of input temperature format (C or F)
- Folium maps for station locations and neighbor groupings
- Plotly charts for time-series with anomaly overlay
- Quality metrics (total records, stations, missing values, anomaly rate)

### Limitations of the System

**Zone A Limitations:**
- Linear interpolation assumes smooth temperature change; cannot capture sudden weather events (monsoons, fronts)
- Aggressive exclusion reduces dataset size (typically 10–20% of input records removed)
- Rounding to 1 decimal place may introduce cumulative precision loss in calculations
- No retroactive validation against PAGASA or other reference data

**Data NOT Handled:**
- Wind speed, wind direction, atmospheric pressure
- Time zone normalization (assumes input is pre-standardized to UTC)
- Sensor calibration history, replacement dates, or maintenance records
- PAGASA validation or ground-truth comparison with external reference data
- Data outside specified date ranges (no date enforcement)
- Geographic boundaries for Quezon City (no enforcement)
- Negative temperature support (< -50°C or > 60°C rejected by validation)

**System Constraints:**
- Single CSV file per session (no batch processing)
- Session data not persisted (lost on browser close)
- No user authentication
- Cannot predict or forecast weather
- No sensor metadata integration
- Maps display static renders (may slow with 1000+ stations)
- No data revision history

### FOR THE DEVELOPER

Some scope and limitation might changes since this is still a prototype of the project system.

---

## Architecture

### Zone-Based Algorithm Structure

Three independent implementations for different geospatial analysis approaches:

- **Zone A** (`zone_a.py`): **Linear Interpolation** — Fill gaps in time-series sensor readings
- **Zone B** (`zone_b.py`): **Haversine Grouping** — Cluster nearby stations using geographic distance
- **Zone C** (`zone_c.py`): **LOF Anomaly Detection** — Local Outlier Factor for multivariate anomalies

Each zone is self-contained and plugged into the main Streamlit UI. **Note**: This project uses only Zones A, B, and C; no additional zone algorithms are planned.

### Directory Structure

```
prototypes/               # Main application code
├── streamlit_app.py      # Streamlit UI entry point (import all zones here)
├── utils/                # Utility modules for data processing
│   ├── __init__.py
│   ├── unit_detector.py  # Auto-detect temperature format (C/F)
│   ├── unit_converter.py # Low-level conversion (C ↔ F formulas)
│   └── temperature.py    # CENTRALIZED: All temperature display logic (conversions, labels, caching)
├── zone/                 # Zone algorithm implementations
│   ├── __init__.py
│   ├── zone_a.py         # Linear interpolation (with 1-decimal rounding)
│   ├── zone_b.py         # Haversine grouping
│   └── zone_c.py         # LOF anomaly detection
├── qc_aws_dummy_data.csv # Test dataset
└── SETUP.md              # User-facing setup guide
```

---

## Running & Developing

### Start the App

From project root:

```bash
cd prototypes
streamlit run streamlit_app.py
```

Opens on `http://localhost:8501`

### Install Dependencies

```bash
pip install -r requirements.txt
```

**Note**: Windows users may need: `python -m pip install ... --user`

### Version Constraints
- **streamlit 1.32.0+** — Required for stable session state (double-click bug fixed in 1.32)
- **scikit-learn 1.4.0+** — LOF API changed; prior versions have incompatible parameters
- **pandas 2.2.0+** — `interpolate(limit_area='inside')` parameter required

---

## IMPLEMENTATION STATUS

### Zone A: Data Cleaning & Interpolation (✅ COMPLETE)

**Status**: Fully implemented, tested, and production-ready (630 lines)

**Completed Features**:
1. ✅ Input validation: Required columns, data types, ranges, date parsing
2. ✅ Duplicate detection/removal: (station_id + date) combinations
3. ✅ Station-level filtering: 0% valid stations, <2 valid readings
4. ✅ Row-level gap detection: Marks gaps ≥2 consecutive days for exclusion
5. ✅ Series edge filtering: Excludes rows where series starts/ends with NaN
6. ✅ Single-day gap filling: Linear interpolation with limit=1, limit_area='inside'
7. ✅ Numeric rounding: All values rounded to exactly 1 decimal place
8. ✅ Interpolated flag tracking: `interpolated_flag` column indicates filled vs. measured
9. ✅ Quality report generation: Comprehensive audit trail with 11-field spec (matches SCHEMA.md)
10. ✅ Error handling: Clear, user-friendly validation error messages

**Test Results** (against 100k-row comprehensive dataset):
- Input: 100,000 rows, 14 stations, 33.7% missing values
- Output: 68,091 rows, 12 stations, 0% missing values
- Data reduction: 31.9% (aggressive exclusion working correctly)
- Rows interpolated: 1,934 (2.8% of output data)
- All numeric values: exactly 1 decimal precision
- Stations excluded: 2 (1 with 0% valid data, 1 with <2 readings)

**API**: `process_zone_a(raw_data: pd.DataFrame) → Tuple[pd.DataFrame, Dict[str, Any]]`

### Zones B & C: Haversine Grouping & LOF Anomaly (✅ WORKING)

**Status**: Implemented and integrated; requires contamination calibration for production accuracy

**Zone B**: Haversine distance calculation, neighbor grouping (default 10km, tunable 1-50km)

**Zone C**: LOF anomaly detection with dual-mode (global/spatial), contamination parameter for calibration

### Supporting Infrastructure (✅ COMPLETE)

**Test Dataset**: `qc_aws_dummy_data_comprehensive.csv` (100k rows, 14 stations, 3-year span)
- Covers all Zone A edge cases: gaps, edge NaN, <2 readings, 0% valid, duplicates
- Designed for integration testing; ready for upload to Streamlit UI

**Streamlit UI Enhancements**:
- ✅ Fixed: Folium map NaN coordinate handling (gracefully filters invalid coordinates)
- ✅ Added: Processing time elapsed display (metric shows total pipeline runtime)
- ✅ Working: Timer for all three zones; accurate measurement

**Documentation**:
- ✅ SCHEMA.md: Explicit data contracts for all zones
- ✅ PROJECT_CONTEXT_PROMPT.md: Comprehensive project state for external AI
- ✅ COMPREHENSIVE_DATASET_README.md: Test dataset documentation and integration guide
- ✅ This file (copilot-instructions.md): Updated with completion status

---

## Key Files for Understanding

1. **[streamlit_app.py](../prototypes/streamlit_app.py)** — UI layout, zone imports, data upload flow, sidebar configuration
2. **[utils/temperature.py](../prototypes/utils/temperature.py)** — **CENTRALIZED**: All temperature conversions, labels, and display data preparation (`convert_temp()`, `convert_temp_series()`, `convert_dataframe_for_display()`, `get_temp_label()`, `get_temp_symbol()`)
3. **[utils/unit_detector.py](../prototypes/utils/unit_detector.py)** — Auto-detection of temperature format (Celsius/Fahrenheit)
4. **[utils/unit_converter.py](../prototypes/utils/unit_converter.py)** — Low-level temperature conversion formulas (C ↔ F with 1 decimal precision)
5. **[zone/ folder](../prototypes/zone/)** — Algorithm implementations (reference when adding new analyses)
6. **[requirements.txt](../requirements.txt)** — Dependency versions
7. **[SETUP.md](../prototypes/SETUP.md)** — User installation instructions and unit support guide

---

## Development Conventions

### Centralized Temperature Logic (utils/temperature.py)

**CRITICAL**: All temperature-related display logic is centralized in `utils/temperature.py`. This is the single source of truth.

**Functions available:**
- `convert_temp(value, detected_unit, display_unit)` — Convert single temperature value
- `convert_temp_series(series, detected_unit, display_unit)` — Convert pandas Series of temperatures
- `convert_dataframe_for_display(df, detected_unit, display_unit)` — Convert entire DataFrame for display
- `get_temp_label(display_unit, detected_unit)` — Get label like "Temperature (°F)" for charts
- `get_temp_symbol(display_unit, detected_unit)` — Get short symbol like "°C" for metrics
- `prepare_display_data(display_unit)` — **Main entry point** with @st.cache_data caching

**Key Pattern in streamlit_app.py:**
```python
# Called once per render (cached)
display_data = prepare_display_data(st.session_state.display_temp_unit)

# Then reuse display_data throughout entire app
st.dataframe(display_data['cleaned_data'])  # Pre-converted
temp_label = display_data['temp_label']     # Pre-generated label
temp_symbol = display_data['temp_symbol']   # Pre-generated symbol
```

**Why centralize?** 
- Changes to temperature handling only require editing 1 file (utils/temperature.py)
- No scattered conversion logic means no duplication/bugs
- Caching with @st.cache_data improves app performance
- Single source of truth for labels, symbols, and conversions

### Adding New Temperature Formats

If extending beyond Celsius/Fahrenheit:

1. Add conversion formula in `unit_converter.py`:
   - Add new `(to_unit, from_unit)` case to `convert_temperature()` function
   - Maintain 1 decimal rounding for consistency

2. Update `unit_detector.py`:
   - Add detection range for new format in `detect_temperature_format()`

3. Update `utils/temperature.py` (centralized):
   - Add new format handling in `convert_temp()`, `convert_temp_series()` functions
   - Add label/symbol logic in `get_temp_label()` and `get_temp_symbol()`
   - **Do NOT scatter conversion logic elsewhere**

4. Update UI in `streamlit_app.py`:
   - Add new option to radio button: `options=['Original', 'Celsius', 'Fahrenheit', 'NewFormat']`
   - **Use proper Streamlit widget pattern** (see next section)

5. Document in [SETUP.md](../prototypes/SETUP.md):
   - Add new format to "Display Format Options" section

### Streamlit Widget Patterns & Session State Management

**CRITICAL PATTERN FOR RADIO BUTTONS & CONTROLLED WIDGETS:**

✅ **CORRECT (use `key=` parameter):**
```python
st.radio(
    "Show temperature in:",
    options=['Original', 'Celsius', 'Fahrenheit'],
    key='display_temp_unit',  # Tells Streamlit to auto-sync with session state
    help="Choose format"
)
```

❌ **WRONG (manual assignment creates bugs):**
```python
# This causes double-click glitching! Don't do this:
st.session_state.display_temp_unit = st.radio(
    "Show temperature in:",
    options=['Original', 'Celsius', 'Fahrenheit'],
    index=current_index  # Without key, index can cause state conflicts
)
```

**Why?** When you use `key='display_temp_unit'`:
- Streamlit **automatically** syncs widget value with `st.session_state['display_temp_unit']`
- Widget state updates correctly on first click (no double-click needed)
- No manual assignment required
- Initialization happens automatically from session state

**Session State Initialization Pattern:**
```python
# Do this at TOP of app, before sidebar
if 'display_temp_unit' not in st.session_state:
    st.session_state.display_temp_unit = 'Original'

# Then in sidebar (no manual assignment):
st.radio(..., key='display_temp_unit')  # Will use initialized value
```

**Then access it anywhere:**
```python
display_data = prepare_display_data(st.session_state.display_temp_unit)
```

### Common Streamlit Pitfalls (Lessons Learned)

1. **Widget Glitching / Double-Click Bug**
   - **Symptom**: Radio button reverts on first click, requires second click to stick
   - **Cause**: Missing `key=` parameter + manual `st.session_state` assignment
   - **Fix**: Use `key='widget_name'` and remove manual assignment

2. **Index Out of Sync**
   - **Symptom**: Widget shows different value than actual session state
   - **Cause**: Calculating `index=` parameter while also manually assigning to session state
   - **Fix**: Use `key=` parameter; let Streamlit manage the index

3. **Cache Data Invalidation**
   - **Symptom**: `@st.cache_data` function doesn't update when parameters change
   - **Cause**: Function parameters don't match the cached state
   - **Fix**: Ensure function parameter (e.g., `display_unit`) is the actual changing value

4. **Session State Not Persisting**
   - **Symptom**: User's selection resets on every page rerenderSymptom**: User's selection resets   
   - **Cause**: Not initializing session state before using it
   - **Fix**: Always initialize `if 'key' not in st.session_state:` at app startup

### Data Quality Standards

- **Temperature precision**: 1 decimal place (e.g., 28.5°C, 83.3°F)
- **Humidity range**: 0-100% (validated in `unit_detector.py`)
- **Interpolation**: Zone A rounds to 1 decimal to prevent floating-point bloat
- **Conversions**: Using centralized functions in `utils/temperature.py` (all round to nearest 0.1)

### Unit Support & Display Format (Centralized Pattern)

The app supports **multi-format temperature display** with automatic format detection and centralized logic.

**Auto-Detection Logic** (`unit_detector.py`):
- Celsius: Detects values 0-50 as Celsius (tropical weather range)
- Fahrenheit: Detects values 32-122 as Fahrenheit
- Ambiguous: If detection uncertain, prompts user to confirm

**Display Format Options** (sidebar selector):
- **Original**: Show in source format (no conversion, handled by centralized logic)
- **Celsius**: Convert all to °C (if source is °F)
- **Fahrenheit**: Convert all to °F (if source is °C)

**Conversion Implementation** (now centralized in `utils/temperature.py`):
- Use `convert_temp()`, `convert_temp_series()`, `convert_dataframe_for_display()` functions
- All functions handle 'Original' unit correctly (skip conversion)
- Formulas: `F = (C × 1.8) + 32` and `C = (F - 32) × 5/9`
- Precision: All values rounded to 1 decimal place (via `unit_converter.py`)

**Session State Persistence**:
- User's display preference stored in `st.session_state.display_temp_unit`
- Controlled via radio button with `key='display_temp_unit'`
- Persists across all interactions in same session
- Resets to 'Original' on new file upload

**Important**:
- Temperature converted only for display/export, NOT for zone processing
- Zone A rounds interpolated values to 1 decimal (prevents excess decimals)
- Original data retained internally for lossless round-trip conversions
- All label/symbol generation centralized in `utils/temperature.py`
- No hardcoded "°C", "°F" strings exist outside of utility functions

### UI Patterns

- Streamlit sidebar for zone/mode selection
- Plotly charts for time-series and scatter analysis
- Folium maps for geographic visualization
- CSV download buttons for processed results

---

## Deployment

**Platform**: Heroku (see [Procfile](../Procfile) and [start.sh](../start.sh))

**Build command**: 
```bash
cd prototypes && streamlit run streamlit_app.py --server.port=$PORT --server.address=0.0.0.0
```

Ensure dependencies are in [requirements.txt](../requirements.txt) before deploying.

---

## Common Tasks

| Task | Command/Location |
|------|------------------|
| Add new temperature format | Update `unit_detector.py`, `unit_converter.py`, sidebar options, and `SETUP.md` |
| Update dependencies | Edit [requirements.txt](../requirements.txt) then `pip install -r requirements.txt` |
| Test with fresh data | Upload CSV in Streamlit UI or replace [qc_aws_dummy_data.csv](../prototypes/qc_aws_dummy_data.csv) |
| Test unit detection | Run `detect_csv_units()` on sample data to verify range thresholds |
| Debug unit conversions | Use `convert_temperature()` in Python REPL with test values |
| Debug zone logic | Add `st.write(df.head())` in `streamlit_app.py` zone section, then re-run app |
| Deploy to Heroku | Git push to Heroku remote (uses [Procfile](../Procfile) automatically) |
| Test Zone A exclusion | Manually verify CSV with gaps ≥2 days, edge NaN, <2 readings are removed (once implemented) |

---

## Testing Notes

⚠️ **No automated tests currently exist.** Testing is manual:
- Upload test CSV via Streamlit UI
- Verify output in "View Processed Data" tab
- Check chart anomaly overlays visually
- Export CSV and inspect columns

**Manual test data scenarios** (add to test suite when building):
- 1-day gap (should fill)
- 2-day gap (should exclude)
- Series starts/ends with NaN (should exclude)
- Station with <2 readings (should exclude)
- 0% valid station (should exclude completely)
- Temperature format: detect C vs F
- Temperature conversion: C ↔ F round-trip accuracy

---

## Notes for AI Assistants

- **PROTOTYPE STATUS**: This is a prototype application for AWS quality control — features and architecture may evolve. Zone A now production-ready; Zones B & C require contamination calibration.
- **Always work from `prototypes/` directory** when editing Python files or running Streamlit
- **Three zones only**: Project uses Zones A (interpolation), B (haversine), and C (LOF) — no new zones planned
- **Zone implementations are self-contained** — changes to zone_a don't affect zones b/c; each can be tested independently
- **CSV data is ephemeral** in Streamlit — uploaded files aren't persisted unless explicitly saved
- **Map visualization requires** valid latitude/longitude columns; Folium now filters NaN coordinates gracefully
- **No automated testing framework** — add to `tests/` folder if extending. Manual test scenarios documented in Testing Notes.
- **Temperature utility is centralized** in `utils/temperature.py` — all temperature logic changes should go there
- **Use `prepare_display_data()` consistently** — it's cached and handles all conversions; don't bypass it with direct calls
- **Streamlit widgets use `key=` pattern** — never use manual `st.session_state` assignment with widgets (causes double-click bugs)
- **No Kelvin support** — only Celsius/Fahrenheit/Original; any new formats need centralized utility updates first
- **Zone A output guaranteed**: 0 NaN values, 1 decimal precision, complete audit trail via quality_report dict
- **Contamination parameter**: Critical for LOF accuracy. Must be calibrated to your company's actual anomaly rate for 80%+ employee accuracy matching

---

## Next AI Agent Actions (Recommended Priority)

**High Priority (Immediate):**
1. **Full pipeline integration testing** — Upload comprehensive 100k-row dataset via Streamlit UI; verify Zones A→B→C data flow end-to-end
2. **Contamination calibration** — Obtain sample employee manual findings; calculate matching contamination value; validate system accuracy
3. **Production testing** — Test with real AWS station data when available; verify timer accuracy on realistic dataset sizes

**Medium Priority:**
4. **Add automated test suite** — Set up pytest for unit/integration tests covering all Zone A scenarios (gaps, edge NaN, <2 readings, etc.)
5. **Create Heroku deployment guide** — Document steps for production deployment and configuration
6. **Extend documentation** — Add user manual, troubleshooting guide, FAQ for Streamlit UI operators

**Low Priority (Evolution):**
7. **Add dataset versioning** — Track processing history, allow reprocessing with parameter changes
8. **Extend export formats** — Support Parquet, SQL database export in addition to CSV
9. **Add data comparison tool** — Side-by-side comparison of raw vs. cleaned data with filtering by exclusion reason

---
