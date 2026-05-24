# Spatiotemporal Anomaly Detection — Dual-Project Guide

This workspace contains **two independent projects**: a Python Streamlit backend for anomaly detection + a React Native Expo mobile app for field technician inspections. This guide helps AI agents understand the overall architecture and pick the right project to work on.

---

## Quick Start

### Streamlit Backend (Anomaly Detection Pipeline)
```bash
cd prototypes
pip install -r ../requirements.txt
streamlit run streamlit_app.py
# Opens http://localhost:8501
```

### Expo Mobile App (Field Inspection Client)
```bash
cd App
npm install
npm run start
# Scan QR with Expo Go or open in browser
```

---

## Project Structure

```
Spatiotemporal-Anomaly-Detection/
├── .github/copilot-instructions.md    ← Detailed Streamlit guide
├── AGENTS.md                           ← This file (architecture overview)
├── Procfile                            ← Heroku deployment (Streamlit only)
├── requirements.txt                    ← Python dependencies
├── start.sh                            ← Local startup script
│
├── prototypes/                         ← **Streamlit Backend**
│   ├── streamlit_app.py               ← Main UI entry point
│   ├── zone/                          ← Core algorithms
│   │   ├── zone_a.py                  ← Data cleaning & interpolation
│   │   ├── zone_b.py                  ← Neighbor identification (Haversine)
│   │   └── zone_c.py                  ← Anomaly detection (LOF)
│   ├── utils/                         ← Shared utilities
│   ├── qc_aws_dummy_data.csv          ← Test dataset
│   └── SCHEMA.md                      ← Data contracts between zones
│
└── App/                                ← **Expo React Native App**
    ├── package.json                   ← Node dependencies
    ├── app.json                       ← Expo configuration
    ├── AGENTS.md                      ← Expo-specific conventions
    ├── SUPABASE_README.md             ← Backend integration guide
    ├── app/                           ← Main app screens
    │   ├── (tabs)/                    ← Tab-based navigation
    │   │   ├── index.tsx              ← Dashboard
    │   │   ├── profile.tsx            ← Technician profile
    │   │   └── ticket-detail.tsx      ← Inspection form
    │   └── report.tsx                 ← Report submission modal
    ├── components/                    ← Reusable UI components
    ├── context/                       ← AppContext (state management)
    ├── services/                      ← API integration (mockApi.ts)
    └── constants/                     ← Theme colors, storage keys
```

---

## Architecture Overview

### Two Separate Projects (Currently Decoupled)

| Aspect | Streamlit Backend | Expo Mobile App |
|--------|-------------------|-----------------|
| **Language** | Python 3.8+ | TypeScript / React Native |
| **Framework** | Streamlit 1.32+ | Expo v55 / React Navigation |
| **Purpose** | Detect rainfall anomalies | Field technician inspections |
| **Backend** | Local data processing | Supabase (not yet wired) |
| **UI Pattern** | Web dashboard | Mobile/web tabs + modals |
| **Deployment** | Heroku (Procfile) | Expo Go client |

### Future Integration (Planned, Not Yet Implemented)

```
Streamlit (detects anomalies)
    ↓
Supabase (writes maintenance tickets)
    ↓
Expo App (displays tickets to technician)
    ↓
Supabase (receives inspection reports)
    ↓
Streamlit Dashboard (shows verification status)
```

**Current status**: Mock data only; real Supabase integration not yet connected.

---

## When to Work on Each Project

### Choose **Streamlit** (`prototypes/`) if you're working on:
- 🔍 Data validation, cleaning, interpolation (Zone A)
- 📊 Anomaly detection algorithms (Zone C)
- 🗺️ Geographic neighbor identification (Zone B)
- 📈 Dashboard visualizations (maps, charts)
- 🧪 Data quality reports
- ⚙️ CSV upload/download workflows

**Start here**: [.github/copilot-instructions.md](.github/copilot-instructions.md)

### Choose **Expo App** (`App/`) if you're working on:
- 📱 Mobile UI screens (dashboard, ticket detail, profile)
- 🎯 Technician workflow (create/edit inspections)
- 📸 Photo capture and form submission
- 🔐 Authentication and session management
- 🎨 Dark/light theme support
- 🔗 Supabase integration (when ready)

**Start here**: [App/AGENTS.md](App/AGENTS.md)

---

## Key Dependencies & Version Constraints

### Python (Streamlit Backend)
- **streamlit 1.32.0+** — Required for stable session state
- **scikit-learn 1.4.0+** — LOF API compatibility
- **pandas 2.2.0+** — `interpolate(limit_area='inside')` parameter

### Node.js (Expo App)
- **Expo 55.0.26** (pinned; breaking changes in v56+)
- **React 19.2.0** (ESM-only)
- **React Native 0.83.6**
- **TypeScript 5.3.3** (strict mode)

---

## Development Conventions

### File Naming
- **Python modules**: `snake_case` (zone_a.py, temperature.py)
- **React components**: `PascalCase` (Button.tsx, Card.tsx)
- **React services/utils**: `camelCase` (mockApi.ts, appContext.ts)

### Code Organization
- **Zone isolation**: Each zone (A, B, C) is self-contained; no cross-zone dependencies
- **Path aliases**: Use `@/` in Expo app (e.g., `@/components/Button`)
- **Centralized utilities**: Temperature conversion in `prototypes/utils/temperature.py`
- **State management**: Streamlit uses session state; Expo uses AppContext

### Git Workflow
- Branch naming: `feature/feature-name` or `fix/bug-description`
- Commit messages: Clear, present-tense (e.g., "Add Zone A gap detection")
- One project per PR when possible (separate Streamlit/Expo changes)

---

## Common Development Tasks

### Run Tests / Validation
```bash
# Streamlit backend
cd prototypes
streamlit run streamlit_app.py  # Manual UI testing (no automated tests yet)

# Expo app
cd App
npm run start                    # Runs dev server
npm run web                      # Opens in browser
```

### Install Dependencies
```bash
# Python
cd prototypes
pip install -r requirements.txt  # or pip install -e .

# Node.js
cd App
npm install
npm update expo                  # Update Expo CLI if needed
```

### Environment Variables
```bash
# Expo app (.env in App/ directory) — NOT YET SET
EXPO_PUBLIC_SUPABASE_URL=your_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_key

# Streamlit backend uses no env vars (local processing)
```

### Build for Production
```bash
# Streamlit: Deploy to Heroku via Procfile
git push heroku main

# Expo: Build standalone APK/IPA
cd App
eas build --platform ios/android  # Requires EAS account
```

---

## Common Pitfalls & Solutions

### ❌ Streamlit Widget Glitches
❌ **Wrong**: Manually assign to `st.session_state` inside widget call
✅ **Right**: Use `key='variable_name'` parameter

### ❌ Expo Navigation Not Working
❌ **Wrong**: Import screens directly; forget file-based routing
✅ **Right**: Use Expo Router file-based routing in `app/` directory

### ❌ Data Not Matching Between Projects
❌ **Wrong**: Hardcode data in Expo; ignore Supabase schema
✅ **Right**: Define Supabase schema once in `SUPABASE_README.md`; use it in both projects

### ❌ Version Mismatch Errors
❌ **Wrong**: Install latest versions of all deps
✅ **Right**: Respect pinned versions in `package.json` and `requirements.txt`

---

## Documentation by Topic

### Backend (Streamlit)
- [System Scope & Limitations](.github/copilot-instructions.md#system-scope--limitations)
- [Zone A: Data Cleaning](.github/copilot-instructions.md#zone-a-data-cleaning)
- [Zone B: Neighbor Identification](.github/copilot-instructions.md#zone-b-neighbor-identification)
- [Zone C: Anomaly Detection](.github/copilot-instructions.md#zone-c-anomaly-detection)
- [Data Contracts](prototypes/SCHEMA.md)

### Frontend (Expo)
- [Expo Setup & Conventions](App/AGENTS.md)
- [Supabase Integration](App/SUPABASE_README.md)

### Deployment
- [Procfile](Procfile) — Heroku config for Streamlit backend

---

## Getting Help

- **Streamlit questions**: Check [.github/copilot-instructions.md](.github/copilot-instructions.md) first
- **Expo questions**: Check [App/AGENTS.md](App/AGENTS.md) first
- **Data schema questions**: See [prototypes/SCHEMA.md](prototypes/SCHEMA.md)
- **Supabase integration**: See [App/SUPABASE_README.md](App/SUPABASE_README.md)
- **General Python**: Follow [PEP 8](https://pep8.org/)
- **General TypeScript**: Use [React Native docs](https://reactnative.dev/) and [Expo docs](https://docs.expo.dev/versions/v55.0.0/)
