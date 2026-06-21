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
| `api/` | FastAPI + Python + Supabase | — | `localhost:8000` |
| `web/` | Next.js 15 + React 19 + SWR (CSS design system, no Tailwind) | Data analysts | `localhost:3000` |
| `App/` | Expo v55 (pinned) + React Native | Field technicians | `localhost:8081` / Expo Go |
| `prototypes/` | Reference only — original Streamlit + zone algorithms | — | — |

---

## What It Does

1. **Analyst** uploads a rainfall station CSV to the web dashboard
2. The **zone pipeline** (A → B → C) cleans data, groups stations by proximity, and flags anomalies via LOF
3. Analyst creates a **maintenance ticket** from a flagged station and assigns it to one or more technicians
4. **Technician** receives the ticket in the mobile app, submits an inspection report with photos
5. Analyst reviews and **approves** the report (or sends it back for follow-up), closing the ticket as verified

Both dashboards update **live** over Server-Sent Events — no manual refresh. Every mutation is recorded in a tamper-evident **audit log**. Sign-in supports password and **Google OAuth** (web + mobile).

---

## Key Features

- **Real-time sync** — a single SSE stream pushes invalidation signals so any change shows up everywhere within ~1s
- **Audit log** — append-only, SHA-256 hash-chained, integrity-verifiable, CSV-exportable
- **Security hardening** — httpOnly cookies + CSRF, session fingerprinting, account lockout, rate limiting, a startup guard that refuses unsafe production config
- **Google OAuth** — server-side PKCE for both frontends (mobile requires an HTTPS tunnel in dev — see [docs/NGROK_GOOGLE_SIGNIN_GUIDE.md](docs/NGROK_GOOGLE_SIGNIN_GUIDE.md))

---

## Documentation

- [CLAUDE.md](CLAUDE.md) — full architecture, setup, env vars, constraints
- [TECHSTACK.md](TECHSTACK.md) — stack, folder structure, API endpoints, security
- [docs/KNOWN_BUGS_AND_FIXES.md](docs/KNOWN_BUGS_AND_FIXES.md) — bugs hit in development and how they were fixed
- [docs/NGROK_GOOGLE_SIGNIN_GUIDE.md](docs/NGROK_GOOGLE_SIGNIN_GUIDE.md) — mobile Google sign-in setup
