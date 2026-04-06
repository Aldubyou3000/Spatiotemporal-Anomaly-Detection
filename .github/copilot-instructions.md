# Spatiotemporal Anomaly Detection - Development Guide

## Project Overview

**AWS Quality Control Pipeline** — A Streamlit web application for automated weather station (AWS) data quality control and anomaly detection using multiple spatial analysis methods.

**Purpose**: Detect anomalies in weather station sensor data through three complementary algorithms deployed across different geographic zones.

**Stack**: Python 3.8+, Streamlit, Pandas, NumPy, scikit-learn, Plotly, Folium

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

### Key Files for Understanding

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

---

## Notes for AI Assistants

- **PROTOTYPE STATUS**: This is a prototype application for AWS quality control — features and architecture may evolve
- **Always work from `prototypes/` directory** when editing Python files or running Streamlit
- **Three zones only**: Project uses Zones A (interpolation), B (haversine), and C (LOF) — no new zones planned
- **Zone implementations are self-contained** — changes to zone_a don't affect zones b/c
- **CSV data is ephemeral** in Streamlit — uploaded files aren't persisted unless explicitly saved
- **Map visualization requires** valid latitude/longitude columns; test data is pre-validated
- **No testing framework detected** — add unit tests in `tests/` folder if extending with significant new logic
- **Temperature utility is centralized** in `utils/temperature.py` — all temperature logic changes should go there
- **Use `prepare_display_data()` consistently** — it's cached and handles all conversions; don't bypass it with direct calls
- **Streamlit widgets use `key=` pattern** — never use manual `st.session_state` assignment with widgets (causes double-click bugs)
- **No Kelvin support** — only Celsius/Fahrenheit/Original; any new formats need centralized utility updates first
