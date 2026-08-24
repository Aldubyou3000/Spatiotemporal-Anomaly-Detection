# Component: API audit log (`services/audit_service.py`, `routers/audit.py`, `schemas/audit.py`)

Append-only, SHA-256 hash-chained, tamper-evident audit log. Writes through the service-role key (bypasses RLS — the `audit_log` table is deny-all to anon/authed roles). This is **the** integration point for real-time: a single hook inside `log()` fans out SSE signals for every mutation in the system.

## What it does
- `audit.log(event, user_id, entity_type, entity_id, old_value, new_value, ip, user_agent, success, meta)` — the universal mutation recorder. Called from every router that mutates state (web and mobile).
- Writes go through a **background thread queue** so request latency is unaffected by DB write speed.
- Each entry hashes its own content + the previous entry's hash (`_prev_hash`, `_chain_lock`); the chain root is rehydrated from the last row on startup so integrity survives restarts.
- Sensitive fields (`credential`, `user_agent`) are truncated/sanitized before storage.
- `routers/audit.py` endpoints: `GET /api/audit` (paginated, filterable), `GET /api/audit/stats`, `GET /api/audit/integrity` (chain verification), `GET /api/audit/export` (CSV).
- `audit.session_hijack_attempt(...)` — specialized recorder for fingerprint mismatches.

## Files
| File | Role |
|------|------|
| `services/audit_service.py` | `AuditService` singleton instance `audit`; `AuditEvent` constant catalogue (all event names live here — import from here, never hardcode strings); `_writer` (the background queue consumer); `_chain_lock`/`_prev_hash` (chain state). |
| `routers/audit.py` | HTTP: paginated query, stats, integrity check, CSV export. |
| `schemas/audit.py` | Pydantic models for log rows, stats, integrity result. |

## Depends on
- `core/config.py` → `settings`
- `services/events_service.py` → `publish_from_audit` (the single real-time hook)
- `supabase-py` (service-role writes, bypass RLS)

## Depends on it (reverse)
- **Every router** that mutates state calls `audit.log(...)`. This is the rule that makes the whole system auditable.
- `core/dependencies.py` calls `audit.session_hijack_attempt` (lazy import to avoid the circular: `audit_service` → `config`; `dependencies` → `audit_service`).
- `main.py` startup rehydrates `_prev_hash` and logs `SYSTEM_STARTUP`.
- `routers/audit.py` is consumed by `web/src/app/(dashboard)/audit/page.tsx` → `useAuditLogs.ts`.

## Key invariants
- **Event names are constants in `AuditEvent`.** Never hardcode audit event strings elsewhere.
- The real-time fan-out is wired **here** (in `log()`), not per-router. Adding a new live resource means extending `events_service._AUDIT_RESOURCE_MAP`, not adding publish calls. See [api-realtime.md](./api-realtime.md).
- Chain hash is SHA-256; integrity is verifiable via `GET /api/audit/integrity`.
- The background writer is joined on shutdown (`_writer.shutdown()` + `join(timeout=10)`) so the queue drains.

## Open questions / debt
- Chain state is in-memory (`_prev_hash`) and rehydrated from the DB on startup. If two workers ever run (multi-worker upgrade), they would each maintain their own `_prev_hash` and fork the chain. Tied to the one-worker constraint.
- `audit.log()` is fire-and-forget — a background-writer failure logs but does not surface to the caller. Acceptable for audit (the mutation already succeeded) but means a silently-dropped audit row is possible.
