# Spatiotemporal Anomaly Detection

Rainfall anomaly detection system with an analyst web dashboard and a field technician mobile app.

---

## Architecture

```
Next.js (web/)      Expo (App/)
       ↓                  ↓
       └──── FastAPI (api/) ────┘
                   ↓
            Supabase (PostgreSQL + Auth + Storage)
```

No frontend ever calls Supabase directly — all data flows through the FastAPI backend.

---

## Quick Start

Requires three terminals running simultaneously, started in this order:

```powershell
# Terminal 1 — API
cd api && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2 — Web dashboard
cd web && npm run dev

# Terminal 3 — Mobile app
cd App && npm start
```

See [CLAUDE.md](CLAUDE.md) for full setup, environment variables, and architecture details.

---

## Components

| Component | Stack | Users | URL |
|-----------|-------|-------|-----|
| `api/` | FastAPI + Python | — | `localhost:8000` |
| `web/` | Next.js 15 + Tailwind | Data analysts | `localhost:3000` |
| `App/` | Expo v55 + React Native | Field technicians | `localhost:8081` / Expo Go |
| `prototypes/` | Reference only | — | — |

---

## What It Does

1. **Analyst** uploads a rainfall station CSV to the web dashboard
2. The **zone pipeline** (A → B → C) cleans data, groups stations by proximity, and flags anomalies via LOF
3. Analyst creates a **maintenance ticket** from a flagged station and assigns it to a technician
4. **Technician** receives the ticket in the mobile app, submits an inspection report with photos
5. Analyst reviews and **approves** the report, closing the ticket as verified
