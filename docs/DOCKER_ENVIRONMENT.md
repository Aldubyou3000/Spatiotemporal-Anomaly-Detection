# Docker Environment — Dependencies & Stack Manifest

**System**: Spatiotemporal Anomaly Detection — FastAPI + Next.js + Expo, backed by Supabase.
**Last updated**: 2026-07-08
**Purpose**: The single source of truth for *everything* Docker needs to build and run this system, so you and your groupmate can run it identically on any machine.

> For the step-by-step rollout (what to do in what order, who/what does each task), see **[DOCKER_PLAN.md](DOCKER_PLAN.md)**. This file is the *what*; that file is the *when/how*.

---

## 1. What Gets Containerized

This is the most important table in the doc. Docker does **not** run the entire system.

| Component | Docker? | Why |
|-----------|---------|-----|
| `api/` — FastAPI | ✅ **Yes** | Server app, runs great in a container |
| `web/` — Next.js | ✅ **Yes** | Server app (SSR + static), runs great in a container |
| `App/` — Expo (React Native) | ❌ **No** | Needs a phone/emulator + native modules. Run on the **host** machine. |
| Supabase (Postgres + Auth + Storage) | ❌ **No** | Cloud-hosted. Never local. Reach it over the network. |
| ngrok (mobile Google OAuth) | ⚠️ Optional | Either run on host, or an opt-in compose sidecar (see §10) |

**Result: two containers** (`api`, `web`) talk to **one cloud database** (Supabase). The mobile app runs on the host and points at the API over `localhost`.

---

## 2. Host Prerequisites

Install these **on your computer** before `docker compose up`:

| Tool | Version | Why | How to verify |
|------|---------|-----|---------------|
| **Docker Desktop** (WSL2 backend on Windows) | latest | Runs the containers | `docker --version` and `docker compose version` |
| **Git** | latest | Clone the repo | `git --version` |
| *(optional)* **Node.js 20 LTS + npm** | 20.x | Only needed if you'll run the Expo mobile app on this host | `node --version` |
| *(optional)* **ngrok** | latest | Only for mobile Google sign-in testing | `ngrok version` |
| *(optional)* **Expo Go** (phone) or a **dev build** | — | Mobile testing | scan QR / install APK |

> Docker and Git are mandatory. Everything in the "optional" rows only matters if you're testing the mobile app. If you only care about the web dashboard, you don't need Node, ngrok, or a phone.

---

## 3. Base Images

| Service | Image | Notes |
|---------|-------|-------|
| `api` | `python:3.12-slim` | Slim Debian; pandas/numpy/scikit-learn installed via pip. `-slim` (not `-alpine`) because scientific wheels on Alpine need a full toolchain and are painful. |
| `web` | `node:20-alpine` | Alpine is fine for Node; small image. |
| `ngrok` *(optional)* | `ngrok/ngrok:latest` | Only when the `oauth` profile is enabled. |

**Why these versions**: Python 3.12 matches the FastAPI/scikit-learn stack cleanly; Node 20 LTS matches the README requirement. There is no `.python-version` or `.nvmrc` in the repo — these images become the project's pinned language versions.

---

## 4. Python Dependencies (api/)

Source of truth: `api/requirements.txt`. Versions below are the **pinned floors** from that file plus the **hard constraints** documented in `CLAUDE.md`.

| Package | Floor | Why / constraint |
|---------|-------|------------------|
| `fastapi` | `>=0.115.0` | Web framework |
| `uvicorn[standard]` | `>=0.30.0` | ASGI server. **Must run ONE worker** — see §9. |
| `python-multipart` | `>=0.0.9` | Form/file (CSV) uploads |
| `supabase` | `>=2.0.0` | DB / Auth / Storage — server-side only |
| `python-dotenv` | `>=1.0.0` | `.env` loading |
| `pydantic-settings` | `>=2.0.0` | Typed config (`core/config.py`) |
| `PyJWT[crypto]` | `>=2.8.0` | JWT verification, session fingerprinting |
| `slowapi` | `>=0.1.9` | Rate limiting (120/min global, 10/min login) |
| `pandas` | **`>=2.2.0`** | ⚠️ **Hard floor** — Zone A uses `interpolate(limit_area='inside')`. Do not downgrade. |
| `numpy` | `>=1.26.0` | Numerical backend for pandas/sklearn |
| `scikit-learn` | **`>=1.4.0`** | ⚠️ **Hard floor** — Zone C LOF API changed in earlier versions. Do not downgrade. |
| `reportlab` | `>=4.0.0` | PDF report generation |

> **Image size note**: `pandas` + `numpy` + `scikit-learn` make the `api` image large (~600–900 MB). This is expected and unavoidable for this app. Don't try to strip them to save space — they're load-bearing.

---

## 5. Node Dependencies

### 5a. Web frontend (`web/package.json`)

| Package | Version | Purpose |
|---------|---------|---------|
| `next` | 15.5.18 | Framework (App Router, Turbopack) |
| `react` / `react-dom` | 19.1.0 | UI |
| `swr` | ^2.4.1 | Data fetching / cache |
| `leaflet` | ^1.9.4 | Station maps |
| `react-leaflet` | ^5.0.0 | React bindings for Leaflet |
| `recharts` | ^3.8.1 | Charts |
| `papaparse` | ^5.5.3 | Client-side CSV parsing |
| `lucide-react` | ^1.16.0 | Icons |
| `next-themes` | ^0.4.6 | Theme switching |
| `tailwindcss` | ^4 | **CSS framework — Tailwind v4** (CSS-first, `@import "tailwindcss"`) |
| `@tailwindcss/postcss` | ^4 | Tailwind v4 PostCSS plugin |
| `typescript` | ^5 | Type checking |

### 5b. Mobile app (`App/package.json`) — runs on host, listed for reference

Expo **v55.0.26 is pinned — do not upgrade to v56+** (breaking changes). Key SDKs: `expo-router`, `expo-secure-store`, `expo-image-picker`, `react-native-sse` (SSE on mobile), `@tanstack/react-query`, `expo-print`, `expo-file-system`, `expo-web-browser`. Full list in `App/package.json`.

> The Expo app is **not** installed by Docker. If you work on mobile, run `cd App && npm install` on your host.

---

## 6. Environment Variables

Docker injects these via `env_file` (or `environment:` in compose). They map 1:1 to the `.env` files you already use.

### 6a. `api/` — `api/.env` (all secrets, never sent to browser)

| Variable | Dev value (Docker) | Notes |
|----------|--------------------|-------|
| `SUPABASE_URL` | *(from Supabase dashboard)* | Cloud project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | *(secret)* | Server-side only |
| `SUPABASE_ANON_KEY` | *(secret)* | |
| `SUPABASE_JWT_SECRET` | *(secret)* | |
| `JWT_SECRET` | *(generate)* | App's own JWT signing secret |
| `JWT_ALGORITHM` | `HS256` | |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `30` | |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `7` | |
| `ALLOWED_ORIGINS` | `http://localhost:3000` | The web container's exposed port, as the **browser** sees it |
| `DEV_MODE` | `true` | Widens CORS to `localhost`/`192.168.x.x`. `false` in prod (then `assert_production_safe()` enforces hardening). |
| `CSRF_SECRET` | *(32+ char random)* | `python -c "import secrets;print(secrets.token_hex(32))"` |
| `COOKIE_SECURE` | `false` | `true` only behind HTTPS in prod |
| `COOKIE_SAMESITE` | `lax` | `strict` in prod |
| `GOOGLE_OAUTH_ENABLED` | `false` / `true` | Web Google sign-in |
| `OAUTH_REDIRECT_BASE` | `http://localhost:8000` | Web callback base — the **browser-facing** API URL |
| `MOBILE_OAUTH_REDIRECT_BASE` | *(ngrok https URL or blank)* | Phone callback base; blank → falls back to `OAUTH_REDIRECT_BASE` |
| `WEB_APP_URL` | `http://localhost:3000` | Where the browser lands after OAuth callback |

### 6b. `web/` — `web/.env.local`

| Variable | Dev value (Docker) | Notes |
|----------|--------------------|-------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | ⚠️ **Must stay `localhost:8000`**, not the compose service name. This value is inlined into JS that runs in the **browser**, which can't resolve the internal Docker network. |
| `NEXT_PUBLIC_GOOGLE_OAUTH` | `true` / `false` | Shows the "Continue with Google" button |

### 6c. `App/` — `App/.env` (runs on host, not Docker)

| Variable | Value | Notes |
|----------|-------|-------|
| `EXPO_PUBLIC_API_URL` | `http://<HOST_LAN_IP>:8000` *or* ngrok URL | The phone reaches the host over WiFi, never `localhost`. For Google sign-in on mobile, must be the **https ngrok URL**. |

### 🚨 The Docker networking gotcha (read this)

The `api` and `web` containers talk to each other over the **compose network** using service names (e.g. `http://api:8000`). But the **browser** and the **phone** are not on that network — they reach the API via the **host's published ports**. So:

- The `web` container's server-side fetch *could* use `http://api:8000`, but the browser-inlined `NEXT_PUBLIC_API_URL` **must** be `http://localhost:8000`. Simplest rule: keep `NEXT_PUBLIC_API_URL=http://localhost:8000` in dev. It works for both the browser and for any server components because the port is published to the host.
- The phone's `EXPO_PUBLIC_API_URL` must be the host LAN IP (or ngrok), never a compose service name.

---

## 7. Ports

| Port | Service | Exposed to host? |
|------|---------|------------------|
| `8000` | api (FastAPI, `/docs` for Swagger) | ✅ |
| `3000` | web (Next.js) | ✅ |
| `8081`, `19000`, `19006` | Expo (Metro) | ✅ — but runs on **host**, not in compose |
| `4040` | ngrok dashboard *(optional)* | ✅ — only with `oauth` profile |

---

## 8. Volumes & Hot-Reload (Dev)

For a fast dev loop, the dev compose mounts source code so changes hot-reload without rebuilds:

| Service | Mount | Effect |
|---------|-------|--------|
| `api` | `./api:/app` (or `./api/app`) | `uvicorn --reload` picks up Python changes |
| `web` | `./web/src:/app/src` + named volume for `.next` cache | Turbopack HMR on JS/CSS changes |

Things to **exclude** via `.dockerignore` (don't mount these into the container): `.venv/`, `node_modules/`, `__pycache__/`, `.next/` (except the cache volume), `.git/`, `.env*` (env comes from compose, not the mounted file).

---

## 9. Hard Constraints (Don't Break These)

These come from `CLAUDE.md` and must be preserved by any Docker setup:

1. **One uvicorn worker, always.** The real-time SSE broker is **in-process**. Never add `--workers` / multiple replicas — a client on worker A would miss events emitted on worker B. The documented multi-worker upgrade path is Redis pub/sub (changes only `events_service.py`), but that is **not** built today.
2. **pandas ≥ 2.2.0** — Zone A `interpolate(limit_area='inside')`.
3. **scikit-learn ≥ 1.4.0** — Zone C LOF API.
4. **Zone algorithms untouched** — `zone_a.py`, `zone_b.py`, `zone_c.py` in `api/app/zones/` are the canonical source of truth. Don't modify.
5. **No frontend → Supabase.** All Supabase traffic goes through FastAPI, even in containers.
6. **`assert_production_safe()` startup guard.** When `DEV_MODE=false`, the API refuses to boot unless `CSRF_SECRET` is strong, `COOKIE_SECURE=true`, `ALLOWED_ORIGINS` has no localhost/LAN, etc. Flip `DEV_MODE` only after configuring everything (production hardening — see plan Phase 4).

---

## 10. External Services (Manual, Non-Docker)

These are **not** containerized. You configure them once in their respective dashboards:

| Service | What you get from it | Where to configure |
|---------|---------------------|--------------------|
| **Supabase project** | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_JWT_SECRET` | Supabase dashboard → Project Settings → API |
| **Supabase Auth (Google OAuth)** | Google client ID/secret wired in | Supabase dashboard → Authentication → Providers → Google. Client ID/secret live **in Supabase**, not in our `.env`. |
| **Supabase Redirect URLs** | OAuth callback allowlist | Supabase dashboard → Authentication → URL Configuration. Must include `<API_BASE>/api/auth/oauth/google/callback` and `<NGROK_URL>/api/mobile/auth/oauth/google/callback/**` (note the `/**` glob). |
| **ngrok static domain** *(mobile OAuth only)* | One permanent `https://*.ngrok-free.dev` URL | ngrok dashboard → Domains. See [NGROK_GOOGLE_SIGNIN_GUIDE.md](NGROK_GOOGLE_SIGNIN_GUIDE.md). |

---

## 11. Database Migrations (Manual, Non-Docker)

There is **no automated migration runner**. The five SQL files in `docs/migrations/` are applied **by hand, in order, in the Supabase SQL editor**. This does not change under Docker — Supabase is cloud.

1. `0001_security_hardening.sql`
2. `0002_audit_log_full.sql`
3. `0003_ticket_number.sql`
4. `0004_report_follow_up_notes.sql`
5. `0005_lockdown_rpc_grants.sql`

> Migrations are idempotent (`IF NOT EXISTS` / `DO $$ … $$`), so re-running is safe. If your Supabase project is already initialized by your team, skip this.

---

## 12. Quick Reference — Dev Run (the goal of all the above)

After the plan's Phase 1 is implemented, the entire dev environment boots with:

```bash
cp .env.docker.example .env.docker   # fill in Supabase keys + secrets
docker compose up --build            # api on :8000, web on :3000
```

Then on the host (if testing mobile):

```bash
cd App && npm install && npx expo start   # phone points at host LAN IP or ngrok
```

This is the end state. How to get there, step by step, is in **[DOCKER_PLAN.md](DOCKER_PLAN.md)**.
