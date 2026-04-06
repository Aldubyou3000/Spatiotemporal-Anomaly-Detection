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
│   └── unit_converter.py # Unit conversion functions (C ↔ F)
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

1. **[streamlit_app.py](../prototypes/streamlit_app.py)** — UI layout, zone imports, data upload flow, display format selector
2. **[utils/unit_detector.py](../prototypes/utils/unit_detector.py)** — Auto-detection of temperature format (Celsius/Fahrenheit)
3. **[utils/unit_converter.py](../prototypes/utils/unit_converter.py)** — Temperature conversion utilities (C ↔ F with 1 decimal precision)
4. **[zone/ folder](../prototypes/zone/)** — Algorithm implementations (reference when adding new analyses)
5. **[requirements.txt](../requirements.txt)** — Dependency versions
6. **[SETUP.md](../prototypes/SETUP.md)** — User installation instructions and unit support guide

---

## Development Conventions

### Adding New Temperature Formats

If extending beyond Celsius/Fahrenheit:

1. Update detection ranges in `unit_detector.py`:
   - Add new format detection logic in `detect_temperature_format()`
   - Update range thresholds if needed for new regions

2. Add conversion formulas in `unit_converter.py`:
   - Add `(to_unit, from_unit)` cases to `convert_temperature()`
   - Maintain 1 decimal rounding for consistency

3. Update UI in `streamlit_app.py`:
   - Add new option to radio button `options=['Original', 'Celsius', 'Fahrenheit', 'Kelvin']`
   - Update `convert_dataframe_for_display()` with new format logic

4. Document in [SETUP.md](../prototypes/SETUP.md):
   - Add new format to "Display Format Options" section
   - Include detection range example

### Data Quality Standards

- **Temperature precision**: 1 decimal place (e.g., 28.5°C, 83.3°F)
- **Humidity range**: 0-100% (validated in `unit_detector.py`)
- **Interpolation**: Zone A rounds to 1 decimal to prevent floating-point bloat
- **Conversions**: Use centered rounding (round to nearest 0.1) for consistency

### Unit Support & Display Format

The app supports **multi-format temperature display** with automatic format detection:

**Auto-Detection Logic** (`unit_detector.py`):
- Celsius: Detects values 0-50 as Celsius (tropical weather range)
- Fahrenheit: Detects values 32-122 as Fahrenheit
- Ambiguous: If detection uncertain, prompts user to confirm

**Display Format Options** (sidebar selector):
- **Original**: Show in source format
- **Celsius**: Convert all to °C (if source is °F)
- **Fahrenheit**: Convert all to °F (if source is °C)

**Conversion Implementation** (`unit_converter.py`):
- Formulas: `F = (C × 1.8) + 32` and `C = (F - 32) × 5/9`
- Precision: All values rounded to 1 decimal place (industry standard)
- Applied to: Charts, dataframe displays, metrics, CSV downloads

**Session State Persistence**:
- User's display preference stored in `st.session_state.display_temp_unit`
- Persists across all interactions in same session
- Resets to 'Original' on new file upload

**Important**: 
- Temperature converted only for display/export, NOT for zone processing
- Zone A rounds interpolated values to 1 decimal (prevents excess decimals)
- Original data retained internally for lossless round-trip conversions

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
