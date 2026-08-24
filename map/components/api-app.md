# Component: API app entry (`api/app/main.py`)

The FastAPI application object. Uvicorn imports it (`uvicorn app.main:app`); nothing else in the repo imports this module.

## What it does
- Constructs the FastAPI app, mounts all routers, wires middleware (CORS, security headers, rate-limit exception handler, catch-all 500 sanitizer).
- Calls `settings.assert_production_safe()` **before** the app is built — fail-closed on insecure prod config.
- `startup`: captures the event loop into `events_service` (so threadpool producers can bridge to SSE), rehydrates the audit chain hash from the last row, logs `SYSTEM_STARTUP`.
- `shutdown`: closes SSE streams cleanly, drains the audit background-writer queue.
- Exposes `GET /health`.

## Depends on
- `core/config.py` → `settings`
- `routers/` — all 9 routers (`auth, zones, tickets, reports, technicians, mobile, mobile_events, audit, events`)
- `services/events_service.py` → `init_loop`, `shutdown`
- `services/audit_service.py` → `audit`, `AuditEvent`, `_writer`, `_chain_lock`, `_prev_hash` (rehydrate)
- `core/dependencies.py` → `get_supabase` (startup rehydrate)
- `slowapi` (rate limiting), `fastapi`

## Depends on it (reverse)
- Uvicorn CLI only. No code imports `app.main`.

## Key invariants
- **One worker** — see [api-realtime.md](./api-realtime.md). The startup loop-capture and in-process broker both assume a single process.
- CORS regex widens to `localhost`/`192.168.*` **only** when `dev_mode=True`.
- The catch-all 500 handler returns a generic `{"detail": "Internal server error"}` — raw exceptions never reach the response. `friendly_db_error()` (`core/errors.py`) handles the translated cases.

## Open questions / debt
- Uses deprecated `@app.on_event("startup"/"shutdown")` — FastAPI now prefers `lifespan` context managers. Not broken; will need migration on a future FastAPI upgrade.
- CSP is permissive (`default-src 'none'`) because the API serves no HTML — note in the file if that ever changes.
