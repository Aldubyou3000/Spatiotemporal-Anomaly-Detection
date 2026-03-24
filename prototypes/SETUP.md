# AWS Quality Control Pipeline - Setup Guide

## Overview

Automated Weather Station (AWS) data quality control and anomaly detection system using linear interpolation, spatial grouping, and Local Outlier Factor (LOF) algorithm.

---

## System Requirements

- Python 3.8 or higher
- Internet connection (for initial package downloads)

---

## Installation

### Step 1: Install Dependencies

Run this command in your terminal:

```bash
pip install pandas numpy scikit-learn streamlit plotly
```

**If you get errors with `pip`, use this instead:**

```bash
python -m pip install pandas numpy scikit-learn streamlit plotly
```

**If still having issues (Windows users):**

```bash
python -m pip install pandas numpy scikit-learn streamlit plotly --user
```

---

## Running the System

### Option 1: Streamlit Web App (Interactive UI)

Navigate to the prototypes folder, then run:

```bash
cd prototypes
streamlit run streamlit_app.py
```

**Or using `python -m`:**

```bash
cd prototypes
python -m streamlit run streamlit_app.py
```

The app will open in your browser at `http://localhost:8501`

Press `Ctrl+C` to stop the server.

---

### Option 2: Console Version (Command Line)

Navigate to the prototypes folder, then run:

```bash
cd prototypes
python zone_flow_demo.py
```

This runs the pipeline automatically and saves results to CSV files.

---

## Project Structure

```
prototypes/
├── zone/
│   ├── __init__.py
│   ├── zone_a.py          # Linear interpolation (missing data cleanup)
│   ├── zone_b.py          # Haversine grouping (find nearby stations)
│   └── zone_c.py          # LOF anomaly detection
├── qc_aws_dummy_data.csv  # Sample dataset
├── zone_flow_demo.py      # Console runner
└── streamlit_app.py       # Web UI
```

---

## Dependencies Explained

| Package        | Purpose                                           |
| -------------- | ------------------------------------------------- |
| `pandas`       | Data manipulation and CSV processing              |
| `numpy`        | Numerical operations                              |
| `scikit-learn` | Machine learning (LOF algorithm + StandardScaler) |
| `streamlit`    | Web UI framework                                  |
| `plotly`       | Interactive charts and visualization              |

---

## Troubleshooting

### Problem: `pip: command not found`

**Solution:** Use `python -m pip` instead of `pip`

### Problem: `ModuleNotFoundError: No module named 'streamlit'`

**Solution:** Install missing package:

```bash
python -m pip install streamlit --user
```

### Problem: `[WinError 32] The process cannot access the file`

**Solution:** Close all Python processes, IDEs, and Jupyter notebooks, then try again.

### Problem: Can't find CSV file

**Solution:** Make sure you're in the `prototypes/` directory when running the app.

---

## Quick Start

1. Install dependencies:

   ```bash
   python -m pip install pandas numpy scikit-learn streamlit plotly
   ```

2. Navigate to the project folder:

   ```bash
   cd prototypes
   ```

3. Run the web app:

   ```bash
   python -m streamlit run streamlit_app.py
   ```

4. In the browser:
   - Click "Load Sample Data"
   - Click "Run Pipeline"
   - View results in tabs

---

## Support

For issues with the pipeline, check that:

- All dependencies are installed correctly
- You're running commands from the `prototypes/` directory
- CSV file has the required columns: `station_id`, `date`, `latitude`, `longitude`, `temperature`, `humidity`
