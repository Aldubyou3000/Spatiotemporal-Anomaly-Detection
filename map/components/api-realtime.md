# Component: API real-time (`services/events_service.py`, `routers/events.py`, `routers/mobile_events.py`)

In-process async pub/sub broker feeding two Server-Sent Events endpoints (web cookie-auth, mobile Bearer-auth). One hook inside `audit.log()` is the only producer wiring needed system-wide.

## What it does
- `events_service.subscribe()` — async generator yielding `{resource, action, id, ts}` signals; one bounded queue per SSE client; drop-oldest on a full queue.
- `events_service.publish(event)` — thread-safe entry point. Bridges from threadpool threads to the loop via `loop.call_soon_threadsafe` (the loop is captured at startup by `init_loop()`).
- `events_service.publish_from_audit(...)` — **the** single hook called from `audit.log()`. Translates an audit event into one or more resource signals via `_AUDIT_RESOURCE_MAP` (and `_resources_for()` for file/photo routing by `entity_type`). Always also emits an `audit` signal.
- `events_service.project_for_mobile(event)` — security boundary: strips to a content-free nudge `{resource}` for the technician stream. Only `tickets` and `reports` resources are forwarded; `technicians` and `audit` are analyst-only and never reach mobile.
- `GET /api/events` (cookie auth) — full signals including `id`.
- `GET /api/mobile/events` (Bearer auth) — projected, content-free nudges only.

## Files
| File | Role |
|------|------|
| `services/events_service.py` | The broker: lifecycle (`init_loop`, `shutdown`), subscribe/publish, `_AUDIT_RESOURCE_MAP`, `project_for_mobile`. Heavily commented — read the module docstring before editing. |
| `routers/events.py` | Web SSE endpoint, cookie auth. Streams full signals. |
| `routers/mobile_events.py` | Mobile SSE endpoint, Bearer auth. Applies `project_for_mobile` per event. |

## Depends on
- `core/dependencies.py` → `get_current_user` (events.py), `get_mobile_user`/`require_technician_mobile` (mobile_events.py)
- `services/events_service.py` (both routers)
- `services/audit_service.py` → `audit` (the hook is called from inside `audit.log`, so `audit_service` imports `events_service`, not the reverse)

## Depends on it (reverse)
- `web/src/hooks/useRealtimeSync.ts` → `RealtimeProvider` (single `EventSource` mounted in the dashboard layout) → SWR `globalMutate` with key matchers
- `App/hooks/useRealtimeSync.ts` → mounted in `AppContext` → React Query `invalidateQueries`
- `main.py` startup/shutdown (`init_loop`, `shutdown`)

## Key invariants (do not break)
- **Signals are advisory, never full rows.** `{resource, action, id, ts}` for web; `{resource}` for mobile. The frontend re-fetches via the normal authenticated path.
- **One producer hook.** All fan-out flows through `publish_from_audit`. To add a live resource: (1) map its audit event → resource in `_AUDIT_RESOURCE_MAP`, (2) add a key matcher in `useRealtimeSync.ts` (web) and/or invalidate the right query key (mobile). Do **not** add per-router publish calls.
- **One worker.** The broker fans out within a single uvicorn process only. Multi-worker would split subscribers across processes. Redis pub/sub is the documented upgrade — only this module changes.
- **Mobile stream carries nothing sensitive.** `project_for_mobile` is the no-leak guarantee; widening it is a security change.

## Open questions / debt
- The drop-oldest queue policy means a slow client can miss intermediate signals — acceptable because signals are idempotent ("latest state wins" via revalidation), but worth understanding before debugging "why didn't the dashboard update instantly."
- `_AUDIT_RESOURCE_MAP` and the web key matchers in `useRealtimeSync.ts` are coupled by convention. If a new resource is added to the map but not to the matcher, the signal fires but nothing happens on the client. There's no compile-time check.
