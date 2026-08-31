# Component: Infrastructure & configuration (repo root, `api/.env`, `web/.env.local`, `App/.env`, `.mcp.json`)

Root-level deploy/config surface: how the three processes are launched, what environment each needs, and the MCP integrations wired into the dev environment.

## Launch
- `README.md` "Quick Start" / "Team Setup" is the canonical runbook. Three terminals, started **API → Web → App**:
  - API: `cd api && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload` — **one worker, no `--workers`** (in-process SSE broker — see [api-realtime.md](./api-realtime.md))
  - Web: `cd web && npm run dev` (`next dev --turbopack`) — in prod, `web/next.config.ts:45` rewrites `/api/*` → `https://spatiotemporal-api.onrender.com` (first-party cookies on `vercel.app`)
  - App: `cd App && npm start` (Expo)
- Optional 4th terminal: `ngrok http 8000` for mobile Google OAuth (HTTPS callback required). Guide at `docs/NGROK_GOOGLE_SIGNIN_GUIDE.md`.
- Deployed: Vercel Hobby `web` + Render Free `api` (see overview). 4-file pipeline direct-bypasses Vercel via `Bearer` to avoid 30s edge timeout.

## Environment files
| File | Holds | Owner |
|------|-------|-------|
| `api/.env` | All secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_JWT_SECRET`, `JWT_SECRET`, `JWT_ALGORITHM`, token lifetimes, `ALLOWED_ORIGINS`, `DEV_MODE`, `CSRF_SECRET`, `COOKIE_SECURE`, `COOKIE_SAMESITE` (`lax` via proxy, `none`+`Partitioned` for direct), `GOOGLE_OAUTH_ENABLED`, `OAUTH_REDIRECT_BASE` (`https://spatiotemporal-anomaly-detection.vercel.app` via proxy), `MOBILE_OAUTH_REDIRECT_BASE`, `WEB_APP_URL`, lockout params | Server only — never sent to browser |
| `web/.env.local` | `NEXT_PUBLIC_API_URL` (bake drives `next.config.ts:45` rewrite destination) + `NEXT_PUBLIC_GOOGLE_OAUTH` flag; `NEXT_PUBLIC_CARTO_KEY` not needed — tiles are OSM/Esri free | Next.js |
| `App/.env` | `EXPO_PUBLIC_API_URL` (PC LAN IP, not localhost; prod `https://spatiotemporal-api.onrender.com` for direct zones `Bearer`) + `EXPO_PUBLIC_OAUTH_URL` (first-party OAuth origin; blank → falls back to API_URL) | Expo |

`App/eas.json` bakes `EXPO_PUBLIC_API_URL` (Render) and `EXPO_PUBLIC_OAUTH_URL` (`https://spatiotemporal-anomaly-detection.vercel.app`) into EAS builds — `.env` is **not** read for EAS. Mobile Google OAuth uses `EXPO_PUBLIC_OAUTH_URL` so the browser lands on the first-party Vercel host, avoiding Chrome Safe Browsing on the shared `onrender.com` host.

`DEV_MODE=true` widens CORS to all `localhost`/`192.168.x.x` origins. `settings.assert_production_safe()` (see [api-core.md](./api-core.md)) refuses to boot when `DEV_MODE=false` if any config is still dev-grade: default/short `CSRF_SECRET`, `COOKIE_SECURE=false`, localhost/LAN in `ALLOWED_ORIGINS`, `WEB_APP_URL` on `http://` while OAuth is enabled.

Note: `api/.env.example` was deleted in the working tree (per `git status`) — there's no committed template. `README.md` carries the minimum-required env list inline.

## Root files (status as of mapping)
| File | Status | Note |
|------|--------|------|
| `.mcp.json` | Active | Supabase MCP (http) + Railway MCP (stdio) for the dev agent |
| `start.sh` | **Stale — see [orphans.md](../orphans.md)** | References deleted `prototypes/streamlit_app.py` |
| `Procfile` | **Deleted** (2026-08-21) | Was stale; referenced non-existent `prototypes/streamlit_app.py` |
| `.gitignore` | Active | Does **not** ignore `*.log` (so `api/uvicorn.log` is tracked) |
| `skills-lock.json`, `.claude/`, `.obsidian/` | Tooling state | Claude Code / Obsidian — not application code |
| `REDESIGN_PLAN.md`, `test.md` | Scratch / planning | `test.md` is empty and tracked (orphan) |

## Dependency manifests
| Surface | File | Pins to know |
|---------|------|--------------|
| API | `api/requirements.txt` | `fastapi>=0.115`, `pandas>=2.2.0`, `scikit-learn>=1.4.0` (LOF / `interpolate(limit_area=...)` API), `reportlab>=4`, `slowapi`, `PyJWT[crypto]>=2.8` |
| Web | `web/package.json` | `next` 15.5.18, `react` 19.1.0, `swr` ^2.4, `leaflet`, `recharts`. `react-leaflet`/`papaparse`/`next-themes` removed (dead). Tailwind v4 is in devDeps but the design system is CSS custom properties (see [web-shell.md](./web-shell.md)) — Tailwind is not the styling mechanism. |
| App | `App/package.json` | **`expo` ~55.0.26 pinned** (do not upgrade to 56+), `react-native` 0.83.6, `@tanstack/react-query` ^5.101 (not SWR!), `react-native-sse`, `expo-router` ~55, `buffer` ^6.0.3 (Node polyfill for `crypto-browserify`). `expo-blur`/`expo-print`/`expo-symbols` removed (dead). `react-native-url-polyfill` now wired via `App/app/_layout.tsx:1`. |

## Type checking / tests
- Web: `npx tsc --noEmit` or `npm run build` (also catches type errors).
- API: no dedicated lint; Pydantic v2 validates schemas at runtime.
- App: Expo bundler checks TS on `npm start`.
- **No automated test suites** in any component — all testing is manual.

## Open questions / debt
- `*.log` not in `.gitignore` → `api/uvicorn.log` ships in the repo.
- `api/=4.0.0` stray file (pip-output artifact) — see [orphans.md](../orphans.md).
- No CI workflow directory in scope (`.github/` exists but contents not audited in this pass — worth a look).
- `web/.env.local.example` is not present either; the only env documentation lives in README/CLAUDE.
