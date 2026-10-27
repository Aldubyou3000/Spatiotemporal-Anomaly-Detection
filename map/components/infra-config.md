# Component: Infrastructure & configuration (repo root, `api/.env`, `web/.env.local`, `App/.env`, `.mcp.json`)

Root-level deploy/config surface: how the three processes are launched, what environment each needs, and the MCP integrations wired into the dev environment.

## Launch
- `README.md` "Quick Start" / "Team Setup" is the canonical runbook. Three terminals, started **API → Web → App**:
  - API: `cd api && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload` — **one worker, no `--workers`** (in-process SSE broker — see [api-realtime.md](./api-realtime.md))
  - Web: `cd web && npm run dev` (`next dev --turbopack`) — in prod, `web/next.config.ts:45` rewrites `/api/*` → `https://spatiotemporal-api.onrender.com` (first-party cookies on `vercel.app`)
  - App: `cd App && npm start` (Expo)
- Optional 4th terminal: `ngrok http 8000` for mobile Google OAuth (HTTPS callback required). Guide at `docs/NGROK_GOOGLE_SIGNIN_GUIDE.md`.
- Deployed: Vercel Hobby `web` + Render Free `api` (see overview). 4-file pipeline direct-bypasses Vercel via `Bearer` to avoid 30s edge timeout.

### Windows: website only (two terminals)
Use the actual checkout at `C:\Users\lynni\Repository\Spatiotemporal-Anomaly-Detection`, not the Desktop copy shown in the failed startup screenshot. Paste each command on its own line. Calling the virtual environment's Python directly avoids needing PowerShell activation.

Terminal 1 — API:
```powershell
cd C:\Users\lynni\Repository\Spatiotemporal-Anomaly-Detection\api
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Terminal 2 — dashboard:
```powershell
cd C:\Users\lynni\Repository\Spatiotemporal-Anomaly-Detection\web
npm run dev
```

Open `http://localhost:3000`; keep both terminals open and use Ctrl+C in each to stop. Expo and ngrok are unnecessary for the local website. Ngrok is needed for the documented mobile Google OAuth dev flow. `No module named 'app'` usually means uvicorn started outside `api/`; a missing `api` path means the wrong checkout. The virtual environment interpreter exists here; these commands were documented, not run during this map refresh. Another PC needs its own virtual environment/dependencies.

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
| `start.sh` | **Absent** (checked 2026-10-24) | Earlier map described a stale Streamlit launcher; no longer present |
| `Procfile` | **Deleted** (2026-08-21) | Was stale; referenced non-existent `prototypes/streamlit_app.py` |
| `.gitignore` | Active | Does **not** ignore `*.log`; `api/uvicorn.log` is currently absent. Ignores `api/.oauth_states.json`. |
| `skills-lock.json`, `.claude/`, `.obsidian/` | Tooling state | Claude Code / Obsidian — not application code |
| `REDESIGN_PLAN.md` | Scratch / planning | Earlier `test.md` is currently absent |
| `USB_SETUP_GUIDE.md`, `api/scripts/reset_ticketing.py`, `docs/RESET_TICKETING.sql` | Local, untracked tools/docs | Transfer instructions and explicitly invoked ticket reset tools; not application startup dependencies. Reset tools were not executed or audited in this refresh. |

## Dependency manifests
| Surface | File | Pins to know |
|---------|------|--------------|
| API | `api/requirements.txt` | `fastapi>=0.115`, `pandas>=2.2.0`, `scikit-learn>=1.4.0` (LOF / `interpolate(limit_area=...)` API), `reportlab>=4`, `slowapi`, `PyJWT[crypto]>=2.8` |
| Web | `web/package.json` | `next` 15.5.18, `react` 19.1.0, `swr` ^2.4, `leaflet`, `recharts`. `react-leaflet`/`papaparse`/`next-themes` removed (dead). Tailwind v4 is in devDeps but the design system is CSS custom properties (see [web-shell.md](./web-shell.md)) — Tailwind is not the styling mechanism. |
| App | `App/package.json` | **`expo` ~55.0.26 pinned** (do not upgrade to 56+), `react-native` 0.83.6, `@tanstack/react-query` ^5.101 (not SWR!), `react-native-sse`, `expo-router` ~55, `buffer` ^6.0.3 (Node polyfill for `crypto-browserify`). `expo-blur`/`expo-print`/`expo-symbols` removed (dead). `react-native-url-polyfill` now wired via `App/app/_layout.tsx:1`. |

## Type checking / tests
- UI Library removed (2026-10-27): no design routes, auth bypass or frame-header exception. From `web/`, `node tests/components-render.test.cjs` retains feature render regressions; `node tests/web-security.test.cjs` verifies page auth/API passthrough and framing in development and production. Shared data lives in `tests/fixtures.ts`; gallery-only tests and setup docs were removed.
- Web: `npx tsc --noEmit` or `npm run build` (also catches type errors).
- API: no dedicated lint; Pydantic v2 validates schemas at runtime.
- App: Expo bundler checks TS on `npm start`.
- API daily-quality regression suite: from the repository root, `api/.venv/Scripts/python.exe -m unittest discover -s api/tests -v`. Uses stdlib unittest, with independent validation of the tracked HMDAS CSV dataset; no database or running server required. Web/App otherwise rely on type checks and manual testing.
- Web checks: from `web/`, `node tests/station-review.test.cjs` (thirteen rendering/wording/chart-label checks) and `node tests/anomaly-review.test.cjs` (five review/export checks). Synthetic fixture regeneration/self-check: from the root, `api/.venv/Scripts/python.exe test-data/synthetic-30-days/generate.py`; this overwrites generated fixture files but does not run the detector. The earlier 2026-10-24 map-only refresh ran no application checks; the subsequent human-review implementation ran both web suites, TypeScript and an isolated synthetic browser preview.

## Open questions / debt
- `*.log` is not ignored, but the previously mapped `api/uvicorn.log` and `api/=4.0.0` artifacts are absent; do not schedule deletion based on old map entries.
- `.github/` exists but contains no files in this checkout (checked 2026-10-24); no CI workflow was found.
- `web/.env.local.example` is not present either; the only env documentation lives in README/CLAUDE.

## History setup and verification (2026-10-25)
Apply docs/migrations/0008_processing_history.sql before deploying API and web together; see docs/PROCESSING_HISTORY.md. No env/dependency/launch changes. Backend tests include test_history.py; frontend adds history.test.cjs (save/concurrency/undo behavior) and history-render.test.cjs (real page rendering). Production build attempt hit sandbox spawn EPERM; automatic approval for an outside-sandbox retry could not complete due account usage limit. Browser visual check was unavailable because local browser use is disabled in Work settings.

Final History verification: the approved retry and final production rebuild both passed after usage resumed. TypeScript passed; 39 backend and 27 frontend checks passed. Browser settings still prevent visual QA; SQL migration/live Supabase round trip remain unverified.

## Manual save update (2026-10-25)
Migration 0009_history_titles.sql must follow 0008 before deploying updated API/web. Processing no longer needs History tables until the analyst explicitly saves. Full setup/preview retention behavior is documented in docs/PROCESSING_HISTORY.md. Local browser preview remains disabled by Work settings.

## Supabase MCP connection (2026-10-25)
User installed/authorized the Supabase plugin in Codex. MCP project listing and a read-only History SQL query succeeded against `Spatiotemporal Anomaly Detection` (`dygsorinzcxaolapswal`), matching the API's configured Supabase host. This connection uses the plugin; no `.mcp.json` or Codex configuration file was changed. History tables/view are live; this check does not establish a full save/review/ticket workflow test.


Stadia light basemap (2026-10-26): StationMap light tiles use Alidade Bright. Localhost/127.0.0.1 needs no authentication; non-loopback LAN hosts and deployment must be authorized through Stadia (domain authentication for hosted sites or provider API-key setup for LAN). Local unauthenticated requests have rate limits. Official references: https://docs.stadiamaps.com/authentication and https://docs.stadiamaps.com/map-styles/alidade-bright/ .

Local speed checks (2026-10-27): use npm run dev for editing. To compare with Vercel on the same port, stop the web process with Ctrl+C, run npm run build once, then npm start. Development output is isolated in web/.next-dev; production build/start retain web/.next, so a build cannot clear a running dev server's manifests. Both generated directories are ignored by Git. Next retains the dev types include, but tsconfig excludes .next-dev from globbing to prevent stale dev validators breaking a production build after route removal. next-env.d.ts still references route declarations directly; generated page-export validation uses fresh .next types during production builds. Avoid concurrent writers to the same output (two builds or two dev servers), and stop a production server before rebuilding its .next. API stays on port 8000 in its own terminal; Expo is optional for website-only use. Regression: node tests/web-security.test.cjs from web/.

Deployed map correction (2026-10-27; supersedes Stadia guidance): light tiles again use https://tile.openstreetmap.org/{z}/{x}/{y}.png, with visible OpenStreetMap attribution. No provider API key or domain authorization is required. Existing strict-origin-when-cross-origin referrer policy and browser caching meet normal web tile requirements. Dark Esri tiles unchanged.

## Byte-stable evaluation evidence (2026-10-27)
Root .gitattributes preserves exact bytes in the two synthetic/Zone C evidence directories, including CRLF CSV uploads used by SHA-256 manifests. The evaluation PDF is explicitly binary to prevent Windows autocrlf from damaging its offsets. Current Zone C source, its test and the implementation plan use explicit LF endings so their recorded hashes survive checkout. Rules are scoped to this evaluation; existing dashboard edits remain outside its commit. Git staging was checked against working-file bytes; no application behavior or dependency changed.

Detection resource control (2026-10-28): requirements explicitly lists threadpoolctl>=3.1.0, already required/installed by scikit-learn. Service scopes single-thread native math to the existing Zone C call; no worker count, environment variable, database migration or hosting plan change. Web and API both need deployment for the complete polling/resource fix. Vercel MCP is connected: team/project and the READY production deployment at f5803af were verified; a recent 15-minute Zones runtime-log query returned no matching entries. Render management access is pending, so backend production logs and resource timing remain unverified.

Render verification (2026-10-28): workspace tea-da688ov10e5c73eh7om0 and single Singapore Free API srv-da68b3nqj5pc73eslg30 confirmed by user/discovery. Live source is f5803af; auto-deploy on main is enabled. Native metrics show CPU capped at0.15 and reaching that limit during the21:30–21:35UTC processing window, with memory around244MB of536.9MB. Upload was accepted21:29:54UTC and polling stopped21:33:56UTC while CPU remained busy afterward; no OOM/restart event was returned for that window. Recent direct uploads also returned401. Status-based upload fallback now clears a rejected cached direct token and uses the existing cookie/refresh path; added red/green regression. Router/service diagnostic loggers now inherit Uvicorn's configured INFO handlers so job start/done and stage-memory records appear in production. No hosting-plan or worker-count changes.

Vercel build failure resolved in source (2026-10-28): authenticated CLI fallback retrieved dpl_FFJzEKU1Kcvac8r98KMrQ2mLEGPk logs;36errors originated in generated next/font/google Roboto query resolution. Include the existing bundled fonts/root-layout fix as a focused follow-up. CLI remained authorized despite connector removal; Render deployment status is still unconfirmed.
