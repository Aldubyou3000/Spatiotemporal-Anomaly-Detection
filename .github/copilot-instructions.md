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

Each zone is self-contained and plugged into the main Streamlit UI. New algorithms should follow this pattern.

### Directory Structure

```
prototypes/               # Main application code
├── streamlit_app.py      # Streamlit UI entry point (import all zones here)
├── zone/                 # Zone algorithm implementations
│   ├── __init__.py
│   ├── zone_a.py
│   ├── zone_b.py
│   └── zone_c.py
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

1. **[streamlit_app.py](../prototypes/streamlit_app.py)** — UI layout, zone imports, data upload flow
2. **[zone/ folder](../prototypes/zone/)** — Algorithm implementations (reference when adding new analyses)
3. **[requirements.txt](../requirements.txt)** — Dependency versions
4. **[SETUP.md](../prototypes/SETUP.md)** — User installation instructions

---

## Development Conventions

### Adding New Algorithms

1. Create `zone_d.py` (follow zone_a/b/c naming)
2. Implement function that accepts DataFrame, returns processed results
3. Import function in [streamlit_app.py](../prototypes/streamlit_app.py) (see existing imports)
4. Add UI tab in Streamlit app to expose the feature

### Data Format

Input CSV expected to have columns:
- `latitude`, `longitude` (for spatial operations)
- `timestamp` (for time-series operations)
- Sensor measurement columns (temp, pressure, humidity, etc.)

Test data: [qc_aws_dummy_data.csv](../prototypes/qc_aws_dummy_data.csv)

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
| Add new zone algorithm | Create `zone_d.py`, follow `zone_a.py` pattern, import in `streamlit_app.py` |
| Update dependencies | Edit [requirements.txt](../requirements.txt) then `pip install -r requirements.txt` |
| Test with fresh data | Upload CSV in Streamlit UI or replace [qc_aws_dummy_data.csv](../prototypes/qc_aws_dummy_data.csv) |
| Debug zone logic | Add `st.write(df.head())` in `streamlit_app.py` zone section, then re-run app |
| Deploy to Heroku | Git push to Heroku remote (uses [Procfile](../Procfile) automatically) |

---

## Notes for AI Assistants

- **Always work from `prototypes/` directory** when editing Python files or running Streamlit
- **Zone implementations are self-contained** — changes to zone_a don't affect zones b/c
- **CSV data is ephemeral** in Streamlit — uploaded files aren't persisted unless explicitly saved
- **Map visualization requires** valid latitude/longitude columns; test data is pre-validated
- **No testing framework detected** — add unit tests in `tests/` folder if extending with significant new logic
