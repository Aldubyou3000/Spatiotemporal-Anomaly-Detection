# Component: API auth (`routers/auth.py`, `services/auth_service.py`, `schemas/auth.py`)

Password + Google OAuth (server-side PKCE) for the **web** analyst dashboard. Mobile has its own parallel endpoints under `routers/mobile.py`. Issues httpOnly cookies (access 30m, refresh 7d), CSRF cookie, and a session-fingerprint cookie. On Vercel (`vercel.app/api/*` rewrite) cookies are **first-party `Lax` on `vercel.app`**; when `COOKIE_SAMESITE=none` they gain `Partitioned` (`auth.py:67`) for third-party fallback. `POST /api/auth/login` now also returns `access_token`/`refresh_token` in JSON for the zones 4-file direct `Bearer` bypass.

## What it does
- `POST /api/auth/login` — verify credentials against Supabase Auth, enforce `lockout`, issue cookie triplet + CSRF **and** return `access_token`/`refresh_token` in JSON for the web’s `sessionStorage` `direct_access_token` (used by `zones` direct bypass). Also logs `LOGIN_SUCCESS`/`LOGIN_FAILED`/`LOGIN_LOCKED`.
- `GET /api/auth/me` — current profile via cookie (`get_current_user`). `GET /api/auth/direct-token` also requires that cookie and returns its access token so Google OAuth users can seed the direct-upload token store.
- `POST /api/auth/logout`, `POST /api/auth/refresh` — rotate tokens; refresh rotates the refresh token itself (anti-reuse); `logout` also clears `direct_access_token` on the web.
- Google OAuth: `GET /api/auth/oauth/google/start` → 302 to Google; `GET /api/auth/oauth/google/callback/{state}` → exchange, enforce analyst role, set cookies, redirect to `WEB_APP_URL` (`/zones`). Web flow now goes through `vercel.app/api/...` rewrite so `OAUTH_REDIRECT_BASE` is `https://spatiotemporal-anomaly-detection.vercel.app` (first-party).

## Depends on
- `core/dependencies.py` → `get_supabase`, `get_current_user`, `_client_ip`, `_client_ua`
- `core/security.py` → `verify_supabase_token`, `make_session_fingerprint`
- `core/lockout.py` → `lockout`
- `core/config.py` → `settings`
- `services/audit_service.py` → `audit`
- `schemas/auth.py`
- `supabase-py` (creates a short-lived client with `ClientOptions` for PKCE exchange)

## Depends on it (reverse)
- `web/src/lib/api/auth.ts` → `useAuth`/`AuthContext` (cookie-based, credentials: include)
- `web/src/middleware.ts` — guards all non-login routes on the presence of the `access_token` cookie
- Real-time: every successful login emits an `audit` SSE signal (via the audit hook), so the Audit page live-refreshes

## Key invariants
- `state` lives in the URL **path** (`…/callback/{state}`), never a query param — Supabase's `…/callback/**` allowlist glob doesn't reliably span a literal `?`. Same rule applies to mobile OAuth.
- The PKCE verifier is held **server-side** keyed by `state`; the client never sees it. `_oauth_state_put/pop` prefer Supabase `oauth_states` (migration 0007), then fall back to `api/.oauth_states.json` and process memory. TTL is 600 seconds; fallback stores are capped at 1,000 entries. Failed state lookups have a per-IP cooldown.
- Refresh tokens rotate on every use → old refresh tokens are immediately invalid.
- CSRF: double-submit cookie pattern. The `csrf_token` cookie is readable; mutations must echo it in `X-CSRF-Token`. Login itself is CSRF-exempt (no prior session).

## Open questions / debt
- OAuth state is no longer memory-only. Database-backed state survives worker restarts; the local file fallback is intended for development reloads and is ignored by Git. Deployment filesystem persistence and live migration application have not been checked; do not treat that fallback as durable deployment storage.
- `assert_production_safe()` blocks `WEB_APP_URL` on `http://` when OAuth is enabled — easy to forget when flipping `DEV_MODE`.
