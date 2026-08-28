# Architecture Overview

**System**: Spatiotemporal Anomaly Detection — rainfall anomaly detection for PAGASA.
**Style**: Layered monolith, single repo, three deployable surfaces sharing one backend.
**One-line rule**: No frontend ever calls Supabase directly — all data flows through FastAPI.

---

## Surfaces (entry points)

| Surface       | Users                 | Path   | Stack                                                    | Data layer                           |
| ------------- | --------------------- | ------ | -------------------------------------------------------- | ------------------------------------ |
| Web dashboard | Analysts              | `web/` | Next.js 15 + React 19 + **SWR**                          | `lib/api/*` → FastAPI                |
| Mobile app    | Field technicians     | `App/` | Expo 55 (pinned) + React Native 0.83 + **React Query 5** | `services/api.ts` → FastAPI          |
| Backend API   | Serves both frontends | `api/` | FastAPI + Pydantic v2 + Supabase SDK                     | Supabase (Postgres + Auth + Storage) |

> **Data-layer asymmetry to remember:** the web app uses **SWR**, the mobile app uses **TanStack React Query** (with persistence). TECHSTACK.md/CLAUDE.md only mention SWR for the dashboard, which is correct — but do not assume parity. Each has its own cache, key conventions, and invalidation strategy.

---

## Backend layers (`api/app/`)

Strict top-to-bottom separation; never bypass it:

```
routers/   HTTP only: parse request → call service → return response
services/  Business logic: Supabase calls, zone orchestration, rule enforcement, audit logging
schemas/   Pydantic v2 request/response models
core/      Config, JWT, auth dependencies, lockout, error translation
zones/     Pure data-processing functions — UNTOUCHED (copy of original prototype code)
```

Two cross-cutting services touch almost every mutation:
- **`audit_service.py`** — every meaningful mutation calls `audit.log(...)`. Append-only, SHA-256 chain, background-writer, bypasses RLS via service-role key.
- **`events_service.py`** — the real-time broker. It has a single hook inside `audit.log()` (`publish_from_audit`) that translates each audit event into invalidation signals fanned out to all connected SSE clients. **This is why the audit layer is the only place real-time is wired** — adding per-router publish calls is explicitly discouraged.

---

## Request / data flow

### Web analyst mutation (e.g. approve a report)
1. Browser → `PATCH /api/reports/{id}/approve` (cookie + `X-CSRF-Token` header)
2. `routers/reports.py` → `require_analyst` dependency (`core/dependencies.py`) verifies cookie + session fingerprint
3. `reports_service.approve_report()` updates Supabase, calls `audit.log(REPORT_APPROVED, ...)`
4. `audit.log()` enqueues to background writer **and** calls `events_service.publish_from_audit(...)`
5. Broker fans `{resource: "reports"|"tickets"|"audit", ...}` to every subscriber queue
6. `GET /api/events` SSE generators stream the signal to each connected browser
7. `useRealtimeSync` (`web/src/hooks/`) matches the resource to SWR cache keys → revalidates via the normal authenticated fetch path
8. Every open analyst view refreshes within ~1s. No manual refresh.

### Mobile technician mutation (e.g. submit report)
Same path, but: Bearer token auth (`get_mobile_user`), routes under `/api/mobile/*`, and the technician's own SSE stream at `/api/mobile/events` receives only a **content-free nudge** (`{resource}` only — no id, no action). `events_service.project_for_mobile()` is the security boundary that strips entity IDs and analyst-only resources.

### Zone pipeline run
1. Analyst uploads CSV → `POST /api/zones/process`
2. `routers/zones.py` calls `zones_service.run_pipeline_multi()` via `fastapi.concurrency.run_in_threadpool` (CPU-bound — must not block the event loop)
3. Optional pre-step: `hmdas_converter` reformats PAGASA/HMDAS exports into the combined frame
4. `zones_service` runs `zone_a → zone_b → zone_c` (clean → group by Haversine → LOF anomaly detection) and returns a `ProcessResult` synchronously

---

## Real-time design contract (do not break)

- Signals are **advisory**, never full rows: `{resource, action, id, ts}`
- The audit→signal map lives in **one place**: `events_service._AUDIT_RESOURCE_MAP` (+ `_resources_for()` for file/photo routing). New live resources are added there, not via per-route publish calls.
- Web key matchers live in `web/src/hooks/useRealtimeSync.ts` and mirror the SWR key conventions (e.g. `tickets` → any key whose `key[0] === "/api/tickets"`).
- Mobile SSE is intentionally content-free — widening it is a security change.
- The broker is **in-process** → API must run **one uvicorn worker / one replica**. Redis pub/sub is the documented multi-worker upgrade path (only `events_service.py` changes).

---

## Auth model (two parallel mechanisms)

| Surface | Token transport | Storage | Auth dependency | Fingerprint |
|---------|----------------|---------|-----------------|-------------|
| Web | httpOnly cookies (access 30m / refresh 7d) + CSRF double-submit — `SameSite=Lax` first-party via `vercel.app/api/*` rewrite proxy (`next.config.ts`); `Partitioned` added when `SameSite=None` for direct cross-site fallback | Browser cookie jar (`vercel.app` first-party) | `get_current_user` / `require_analyst` (and `get_current_user_or_bearer` / `require_analyst_or_bearer` for `/api/zones/process` which also accepts `Bearer` for direct Render upload) | HMAC(UA) in opaque cookie, rotated on login/refresh |
| Mobile | `Authorization: Bearer <token>` | `SecureStore` (native) / `localStorage` (web) | `get_mobile_user` / `require_technician_mobile` | none (IP excluded by design — cellular handoff) |

Web `POST /api/auth/login` now returns `access_token` in JSON as well as cookies; web stores it in `sessionStorage` as `direct_access_token` for the zones 4-file direct bypass (`web/src/lib/api/client.ts` + `zones.ts`). Google OAuth runs a **server-side PKCE** flow for both, with `state` carried in the URL **path** (not query — Supabase allowlist glob limitation). Mobile OAuth requires an HTTPS-reachable API (ngrok in dev) and a real dev/prod build (Expo Go can't register the `spatiotemporal://` deep link).

Deployed: `web` on Vercel Hobby (`https://spatiotemporal-anomaly-detection.vercel.app`) proxied `/api/*` → `api` on Render Free (`https://spatiotemporal-api.onrender.com`, one worker, `512 MB/0.1 CPU`, sleeps 15m). `NEXT_PUBLIC_API_URL` bake drives the rewrite destination; `middleware.ts` skips `/api/*` (pages only). 4-file LOF (2.1 MB, 100k rows, `ANOMALY_THRESHOLD=2.0`) bypasses the Vercel 30s edge timeout by going direct to Render with `Bearer`.

---

## Key invariants

- **Zone algorithms (`zone_a/b/c.py`) are frozen** — the canonical source of truth is `api/app/zones/`. No other copy exists. Do not modify (threshold `ANOMALY_THRESHOLD` in `zone_c.py:35` is 2.0 in current deployed tuning — was 1.5).
- **Expo v55.0.26 is pinned** — do not upgrade to v56+.
- **API runs one worker** — see Real-time design contract. Render Free sleeps 15m (50s cold start); Vercel rewrites timeout ~30s for proxied `POST /api/zones/process` — 4-file pipeline uses direct `Bearer` bypass.
- **Ticket lifecycle**: `assigned → in-progress → pending_review → verified`; analyst can branch to `follow_up` (from `pending_review`) or `cancelled` (from `assigned`). Enforced in API + mobile app; canonical labels/colors in `web/src/lib/ticketStatus.ts`.
- **CSV upload max**: 20 MB (`routers/zones.py:24`). Vercel body cap 4.5 MB applies only when proxied; 4-file 2.1 MB fits but times out via proxy — use direct path.
- **Rate limits**: 120/min global, 10/min `/api/auth/login`, 30/min `/api/auth/refresh`.
- **Map tiles**: `StationMap.tsx:26-27` now `tile.openstreetmap.org` (light) + `server.arcgisonline.com/.../World_Dark_Gray_Base` (dark) — free, no API key (was `basemaps.cartocdn.com` Voyager which now watermarks without `?key=`).

---

## Pages in this map

See [index.md](./index.md). Start there for any task; read only the component page(s) relevant to the work.
