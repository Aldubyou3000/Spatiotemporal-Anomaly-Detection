# Component: API core (`api/app/core/`)

Cross-cutting infrastructure shared by every router and service: config, auth guards, JWT/fingerprint crypto, brute-force lockout, and DB error translation. The lowest layer — depends only on `config.py` within itself and on `audit_service` (lazily, to avoid a circular import).

## Files

| File | Purpose |
|------|---------|
| `config.py` | `Settings` (Pydantic BaseSettings) → `settings` singleton. Env vars, derived OAuth callback URLs, `allowed_origins_list`, and **`assert_production_safe()`** — the fail-closed startup guard. |
| `dependencies.py` | FastAPI `Depends()` callables: `get_supabase()` (thread-safe singleton), `get_current_user` (cookie + fingerprint), `get_mobile_user` (Bearer), `require_analyst`, `require_technician_mobile`. Also `_client_ip` / `_client_ua` — **the canonical IP extractor**; never re-inline `X-Forwarded-For` parsing in a router. |
| `security.py` | `verify_supabase_token()` (HS256 + ES256/RS256 via JWKS, audience-verified), `make_session_fingerprint` / `verify_session_fingerprint` (HMAC of User-Agent only — IP intentionally excluded for mobile handoff). |
| `lockout.py` | In-process brute-force tracker: 5 failed attempts / 5 min window → 15-min lockout. Thread-safe in-memory store; Redis is the documented prod swap. |
| `errors.py` | `friendly_db_error()` — maps Postgres SQLSTATE / constraint names to user-safe messages, never leaks raw DB text. |

## Depends on
- `config.py` (everyone)
- `security.py` ← `dependencies.py`
- `audit_service` ← `dependencies.py` (lazy import inside `get_current_user` for the hijack-attempt log; lazy because `audit_service` itself imports `config`)
- `supabase-py`, `pyjwt`, `pydantic-settings`

## Depends on it (reverse)
- **Every router** uses `require_analyst` / `get_current_user` / `get_mobile_user` / `get_supabase` / `_client_ip`.
- **Every service** that writes to DB uses `get_supabase()` (via the router's `sb` argument) or `settings`.
- `auth_service` uses `lockout`, `security`, `config`.
- `main.py` uses `settings`, `get_supabase`.

## Key invariants
- `get_supabase()` returns a module-level singleton guarded by a lock — never replace it during operation; the client reconnects internally.
- `_verify_and_load_profile()` is shared by cookie and Bearer paths → identical verification regardless of transport. Disabled accounts (`is_active=false`) are rejected here (403).
- Session fingerprint is **UA-only by design**. Changing it to include IP would break mobile sessions on every cellular handoff.

## Open questions / debt
- `lockout.py` state is in-memory → lost on every restart and not shared across workers (though the one-worker constraint limits the impact). Documented prod path is Redis.
- `assert_production_safe()` is a hard gate — if a new prod-required setting is added, it must be added to the guard too or it silently ships insecure.
