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
cd api
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2 — Web dashboard
cd web && npm run dev

# Terminal 3 — Mobile app
cd App && npm start
```

See [Team Setup](#team-setup) for full onboarding (dependencies, env files, migrations, and optional ngrok for mobile Google OAuth).

---

## Team Setup

### Prerequisites

- Git
- Python (recommended: 3.10+)
- Node.js 20 LTS + npm
- Expo Go (optional, for basic mobile testing)
- ngrok (required only for mobile Google OAuth)
- Access to Supabase project dashboard (URL, keys, SQL editor)

Quick version check (PowerShell):

```powershell
python --version
node --version
npm --version
```

### 1) Install Dependencies

From repository root:

```powershell
# API
cd api
python -m venv .venv
# If script execution is blocked in PowerShell, run this once per terminal:
# Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned
.\.venv\Scripts\Activate.ps1
pip install --upgrade pip
pip install -r requirements.txt

# Web
cd ..\web
npm install

# Mobile
cd ..\App
npm install
```

### 2) Configure Environment Files

#### API env (`api/.env`)

Create `api/.env`, then fill all required values:

Minimum required:

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_ANON_KEY=
SUPABASE_JWT_SECRET=
JWT_SECRET=
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7
ALLOWED_ORIGINS=http://localhost:3000
DEV_MODE=true
CSRF_SECRET=
COOKIE_SECURE=false
COOKIE_SAMESITE=lax
GOOGLE_OAUTH_ENABLED=false
OAUTH_REDIRECT_BASE=http://localhost:8000
MOBILE_OAUTH_REDIRECT_BASE=
WEB_APP_URL=http://localhost:3000
```

#### Web env (`web/.env.local`)

Create `web/.env.local` with:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

#### Mobile env (`App/.env`)

Use your PC LAN IP, not localhost:

Create `App/.env` with:

```env
EXPO_PUBLIC_API_URL=http://<YOUR_PC_LAN_IP>:8000
```

Find LAN IP in PowerShell:

```powershell
ipconfig | Select-String "IPv4"
```

### 3) Apply Database Migrations (Manual)

If your Supabase environment is already initialized by your team, skip this step. Run these only for a fresh/uninitialized database environment.

Run SQL files in Supabase SQL editor, in order:

1. `docs/migrations/0001_security_hardening.sql`
2. `docs/migrations/0002_audit_log_full.sql`
3. `docs/migrations/0003_ticket_number.sql`
4. `docs/migrations/0004_report_follow_up_notes.sql`
5. `docs/migrations/0005_lockdown_rpc_grants.sql`

There is no automated migration runner in this repo.

### 4) Start Servers and Tools

Open 3 terminals (4 if using ngrok):

```powershell
# Terminal 1: API
cd api
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2: Web
cd web
npm run dev

# Terminal 3: Mobile
cd App
npm start
```

Optional (Terminal 4) for mobile Google OAuth:

```powershell
& "$env:LOCALAPPDATA\ngrok\ngrok.exe" http --url=configure-phoenix-rival.ngrok-free.dev 8000
```
or

ngrok http --url=configure-phoenix-rival.ngrok-free.dev 8000

If `ngrok` is already on your PATH, `ngrok http --url=configure-phoenix-rival.ngrok-free.dev 8000`
works too. Bind to the static domain with `--url=<bare-hostname>` (no `https://`) so the tunnel
matches the domain baked into `api/.env` (`MOBILE_OAUTH_REDIRECT_BASE`), `App/.env`
(`EXPO_PUBLIC_API_URL`), and Supabase's Redirect URLs. Plain `ngrok http 8000` would mint a random
ephemeral URL that silently breaks Google sign-in. Full flow is documented in
[docs/NGROK_GOOGLE_SIGNIN_GUIDE.md](docs/NGROK_GOOGLE_SIGNIN_GUIDE.md).

### 5) Verify Local Setup

- API health: open `http://localhost:8000/docs`
- Web dashboard: open `http://localhost:3000`
- Mobile app: run on Expo Go or device/emulator on the same WiFi
- Real-time: update a ticket/report in one client and confirm another client refreshes automatically

### Common Setup Notes

- API must run with one worker only (no `--workers`) because SSE broker is in-process.
- Phone testing requires same WiFi and LAN API URL in `App/.env`.
- Mobile Google OAuth requires HTTPS callback host (ngrok) and a development/production build (not Expo Go).
- If schema-related errors appear, re-check migration order and confirm all migration files were executed.

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
