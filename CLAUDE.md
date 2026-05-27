# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## System Overview

Three servers must run simultaneously. Start in this order: **API → Web → App**.

**Architecture**: Two frontends (Next.js analyst dashboard + Expo mobile technician app) both talk exclusively to a FastAPI backend. No frontend ever calls Supabase directly.

```
Next.js (web/)      Expo (App/)
       ↓                  ↓
       └──── FastAPI (api/) ────┘
                   ↓
            Supabase (PostgreSQL + Auth + Storage)
```

---

## Running Each Component

### API (FastAPI) — Terminal 1
```powershell
cd api
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
`--host 0.0.0.0` is required — the mobile app connects over WiFi.

### Web Dashboard (Next.js) — Terminal 2
```powershell
cd web
npm run dev
# http://localhost:3000
```

### Mobile App (Expo) — Terminal 3
```powershell
cd App
npm start
# Press w for browser, or scan QR with Expo Go on phone (same WiFi as PC)
```

---

## Installing Dependencies

```powershell
cd api && pip install -r requirements.txt
cd web && npm install
cd App && npm install
```

---

## Type Checking & Linting

```powershell
# Web — TypeScript errors surface in build
cd web && npm run build

# API — no dedicated lint command; Pydantic v2 validates schemas at runtime
# App — TypeScript checked by Expo bundler on npm start
```

No automated test suites exist in any component. All testing is currently manual.

---

## Phone Testing

The phone cannot reach `localhost`. `App/.env` is pre-configured with `http://192.168.100.10:8000`.

- PC and phone must be on the **same WiFi**
- If PC IP changes: `ipconfig | Select-String "IPv4"`, then update `App/.env` and restart Expo

---

## Architecture: Backend (`api/`)

Strict layer separation — never bypass it:

| Layer | Responsibility |
|-------|---------------|
| `routers/` | HTTP only: parse request → call service → return response |
| `services/` | Business logic: Supabase calls, zone orchestration, rule enforcement |
| `schemas/` | Pydantic models for all request/response shapes |
| `core/` | Config (`config.py`), JWT (`security.py`), auth guards (`dependencies.py`) |
| `zones/` | Pure data processing — untouched, no HTTP, no DB calls |
| `routers/mobile.py` | Technician-only endpoints — Bearer token auth, all `/api/mobile/` routes |

Zone pipeline execution order: `zone_a.py` → `zone_b.py` → `zone_c.py`

- **Zone A**: Downmaps hourly→daily, linear interpolation for single-day gaps only, excludes stations with gaps ≥2 days or <2 valid readings
- **Zone B**: Haversine distance grouping (1–50 km threshold), adds `neighbor_group_id`
- **Zone C**: LOF anomaly detection (RobustScaler, 1D rainfall feature, threshold=1.5)

The `zones/` directory is a copy of `prototypes/zone/` — **do not modify the algorithms**.

Zone pipeline is CPU-bound; call `zones_service.run_pipeline()` via `fastapi.concurrency.run_in_threadpool` to keep the event loop responsive.

### Auth Flow
1. Login → FastAPI verifies with Supabase Auth → issues JWT access token (30 min) + refresh token (7 days)
2. **Web dashboard**: tokens stored in **httpOnly cookies** (`get_current_user` dependency reads `Cookie: access_token`)
3. **Mobile app**: tokens stored in `SecureStore`; every request sends `Authorization: Bearer <token>` (`get_mobile_user` / `require_technician_mobile` dependencies)
4. Refresh rotates on every use; expiry → redirect to login
5. Role enforcement: `analyst` (pipeline, tickets, reports, manage technicians) vs `technician` (view/update assigned tickets, submit reports, upload photos)

---

## Architecture: Web Frontend (`web/src/`)

| Layer | Responsibility |
|-------|---------------|
| `app/(dashboard)/` | Protected pages with sidebar — compose components, handle page state |
| `app/(auth)/` | Login — no sidebar, centered layout |
| `components/` | UI building blocks — receive props, emit events, no direct API calls |
| `hooks/` | Data fetching/mutation — calls `lib/api/`, returns state |
| `lib/api/` | Raw API calls — one file per domain, all calls go through `client.ts` |
| `types/` | TypeScript interfaces mirroring backend Pydantic schemas |

Always use `@/` path aliases for imports. Never put API calls in components — use hooks.

---

## Architecture: Mobile App (`App/`)

File-based routing via Expo Router. Screens live in `app/`; tabs under `app/(tabs)/`.

- Global state in `context/AppContext.tsx` — auth, theme, profile
- API calls in `services/api.ts` — wraps all `/api/mobile/` endpoints with auto token-refresh
- Tokens: `SecureStore` on native, `localStorage` on web (platform-branched in `services/api.ts`)
- Theme preference persisted via `SecureStore` (native) / `localStorage` (web)
- **Expo v55.0.26 is pinned** — do not upgrade to v56+

---

## Key Constraints

- **Expo v55.0.26 pinned** — breaking changes in v56+
- **pandas 2.2.0+** required — `interpolate(limit_area='inside')` parameter
- **scikit-learn 1.4.0+** required — LOF API changed in earlier versions
- Zone algorithms (`zone_a.py`, `zone_b.py`, `zone_c.py`) must remain untouched
- Supabase DB schema unchanged during migration (no new tables/columns)
- Ticket lifecycle: `assigned → in-progress → completed → verified`
- CSV upload max: 20 MB
- Rate limits: 120/min global, 10/min on `/api/auth/login`, 30/min on `/api/auth/refresh`

---

## Environment Variables

**`api/.env`** — all secrets, never exposed to browser:
```
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
```

`DEV_MODE=true` (default) widens CORS to all `localhost` and `192.168.x.x` origins — set `false` in production.

**`web/.env.local`** — Next.js only gets the API URL:
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

**`App/.env`** — Expo uses PC's LAN IP (not localhost):
```
EXPO_PUBLIC_API_URL=http://192.168.100.10:8000
```

---

## Migration Status

The system migrated from Streamlit → Next.js + FastAPI. Streamlit has been shut down (Phase 5 complete).

| Phase | Status |
|-------|--------|
| 1 — Login, auth, project scaffold | Complete |
| 2 — Zones pipeline + results UI | Complete |
| 3 — Ticket board, CRUD, PDF export | Complete |
| 4 — Reports, approval, manage technicians | Complete |
| 5 — Feature parity verified, Streamlit shut down | Complete |

`prototypes/` is kept for reference only — the `zones/` algorithms there are the source of truth for `api/app/zones/`. When editing `api/` or `web/`, do not touch `prototypes/` or the Expo app (unless the task explicitly targets `App/`).
