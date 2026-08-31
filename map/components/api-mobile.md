# Component: API mobile (`routers/mobile.py`, `routers/mobile_events.py`)

Technician-facing endpoints under `/api/mobile/*`. Bearer token auth. Parallel to the analyst routers but scoped to the authenticated technician's own data. Also the home of `_signed_url`, a helper imported by the analyst routers (shared-candidate).

## What it does
- Auth: `POST /api/mobile/auth/login|refresh|logout`, `GET /api/mobile/auth/me`. Returns access + refresh tokens in the body (mobile stores in SecureStore).
- Mobile OAuth: `GET /api/mobile/auth/oauth/google/start?return_url=…` → 302; `GET /api/mobile/auth/oauth/google/callback/{state}` → deep-links tokens back via `spatiotemporal://`.
- Tickets: `GET /api/mobile/tickets` (own only), `GET /api/mobile/tickets/{id}`, `PATCH .../status`, attachments, `report-id`, `follow-up-context`, `pdf`.
- Reports: `POST /api/mobile/reports` (submit), `GET .../photos`, `POST .../photos` (upload).
- Activity: `GET /api/mobile/activity` (technician's own audit feed, ticket events only).
- SSE: `GET /api/mobile/events` — content-free nudges (see [api-realtime.md](./api-realtime.md)).

## Depends on
- `core/dependencies.py` → `get_mobile_user`, `require_technician_mobile`, `get_supabase`, `_client_ip`
- `services/audit_service.py` → `audit` (mobile-prefixed events: `MOBILE_LOGIN_*`, `MOBILE_LOGOUT`)
- `services/auth_service.py` → OAuth helpers shared with web auth
- `schemas/auth.py`, `schemas/tickets.py`, `schemas/reports.py`
- `services/events_service.py` → `project_for_mobile` (mobile_events.py)

## Depends on it (reverse)
- `App/services/api.ts` — wraps every `/api/mobile/*` endpoint with Bearer auth + auto-refresh
- `App/hooks/useTickets.ts`, `useRealtimeSync.ts`, `useUnseenActivity.ts`, `useActivitySeen.ts`
- **Analyst routers** `routers/tickets.py` and `routers/reports.py` import `_signed_urls_batch` from here — see [shared-candidates.md](../shared-candidates.md) §1. Top-level `_signed_url` import in `reports.py` was dead and is now ` _signed_urls_batch`.

## Key invariants
- **Membership check is the data boundary.** Every ticket/report endpoint filters to the authenticated technician's assignments; the SSE stream is additionally projected to content-free nudges.
- Mobile OAuth requires the API reachable over **HTTPS** (Chrome blocks `http://` LAN redirects mid-flow) and a real dev/prod build (Expo Go can't register the `spatiotemporal://` deep link). `_mobile_oauth_callback_url()` derives the callback from **X-Forwarded-Host** (trusted-host allowlist, fail-closed to `MOBILE_OAUTH_REDIRECT_BASE`) so the browser never navigates to the shared `onrender.com` host — Chrome Safe Browsing blocks it and the flow hangs. EAS builds send the OAuth browser to the first-party Vercel proxy (`EXPO_PUBLIC_OAUTH_URL` → `…vercel.app` → `/api/*` rewrite → Render).
- `state` in the URL **path** (`…/callback/{state}`), same as web OAuth — Supabase allowlist glob limitation.

## Open questions / debt
- `_signed_url` being defined here but imported by analyst routers is the top shared-candidate. Extraction target: `core/storage.py`.
- `GET /api/mobile/tickets/{id}/attachments` is listed twice in TECHSTACK.md's endpoint table — verify there isn't a duplicate route registration.
- Mobile login emits `MOBILE_LOGIN_*` audit events distinct from web's `LOGIN_*`. The real-time map treats neither as a data-resource signal (auth events only produce the generic `audit` signal), so they don't drive dashboard data refresh — correct, since auth changes aren't shared data.
