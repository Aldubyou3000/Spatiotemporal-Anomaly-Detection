# Shared-Candidates (Rule of 3)

Behavior duplicated across 3+ components that should be extracted into a shared utility, service, or backend process. Reviewed each session; promoted to an actual refactor when the list grows or duplication causes bugs.

Format per entry: **Pattern** → where it appears (3+ places) → what extraction would look like.

---

## Active candidates

### 1. Signed-URL helper (`_signed_urls_batch` / `_signed_url`)
**Appears in**:
- `api/app/routers/mobile.py` (defined here — ` _signed_urls_batch` + single `_signed_url`)
- `api/app/routers/tickets.py` — `from .mobile import _signed_urls_batch` (was `_signed_url`, corrected 2026-08-31)
- `api/app/routers/reports.py` — `from .mobile import _signed_urls_batch` (was top-level `_signed_url` dead import, fixed 2026-08-31)

**Problem**: Two analyst-facing routers import a private helper from the technician router. Couples unrelated routers and creates a misleading "mobile owns this" signal. The `tickets` import was mixing top-level + lazy inner import; `reports` had a dead top-level `_signed_url` while using batch locally.

**Extraction**: Move to `api/app/core/storage.py` (or `services/storage_service.py`) as a public `signed_urls_batch(...)` / `signed_url(...)`. Update the three import sites. The underscore-prefixed private name becoming public is the signal that it's shared.

---

### 2. Client IP / User-Agent extraction
**Appears in**:
- `api/app/core/dependencies.py` — `_client_ip`, `_client_ua` (canonical)
- `api/app/routers/auth.py` — extracts forwarded-IP inline in places
- `api/app/routers/mobile.py` — same
- Several other routers pass `request` through to compute IP for audit

**Status**: Mostly centralized already — CLAUDE.md flags `_client_ip(request)` as the one to use. Re-check that no router re-inlines `X-Forwarded-For` parsing. If any do, route them through `_client_ip` / `_client_ua`.

---

### 3. Token storage / refresh-on-401 (cross-surface, conceptual duplication)
**Appears in**:
- `web/src/lib/api/client.ts` — 401 → silent refresh → retry (web, cookies)
- `App/services/api.ts` — 401 → refresh → retry (mobile, SecureStore + Bearer)
- Both implement: expiry detection, single-flight refresh, retry-on-success

**Note**: These are deliberately separate because the auth transports differ (cookie vs Bearer). Not a candidate to merge — but worth a shared doc/comment block in both pointing at each other, since the *strategy* is identical even if the mechanics differ. Flag if a third surface is ever added.

---

### 4. Ticket status label/color/sort logic
**Appears in**:
- `web/src/lib/ticketStatus.ts` — canonical (web)
- `App/constants/ticketStatus.ts` — parallel (mobile)
- Backend Pydantic enum (implicit, via `status` field values)

**Status**: Web side is explicitly the single source of truth within the web app. The mobile app re-declares equivalent labels. If they drift the technician sees one wording and the analyst another. Low-priority unless UI wording diverges — at minimum, add a cross-reference comment in both files.

---

### 5. Vercel same-origin `apiBase()` helper
**Appears in**:
- `web/src/lib/api/client.ts:7` `apiBase()` / `DIRECT_BASE` + `setDirectToken`/`getDirectToken`
- `web/src/hooks/useRealtimeSync.ts:7` same `apiBase()` copy
- `web/src/lib/api/tickets.ts:88`, `web/src/lib/api/audit.ts:85` inline `vercel.app ? window.location.origin : BASE_URL`
- `web/src/app/(auth)/login/page.tsx:11` same inline `apiBase()`

**Problem**: 5 copies of `hostname.endsWith("vercel.app") ? window.location.origin : BASE_URL`. Drift already (client has `DIRECT_BASE`+token store, others inline). If the proxy host changes (e.g., `vercel.app` → custom domain) all 5 must be updated.

**Extraction**: `web/src/lib/apiBase.ts` → `export function apiBase(): string` + `export function directBase(): string` + token helpers. All 5 import from there.

---

## Resolved

*2026-08-31 dead-code pass* — not an extraction but a pruning: removed truly dead imports/exports that were inflating the candidate surface — `reports.py` dead `_signed_url`, `zones.py` dead `require_analyst`, `audit_service` dead `datetime`/`timezone`/`settings`, `events_service` dead `Any`, `zone_a` dead `numpy`, `web` dead `papaparse`/`next-themes`/`react-leaflet` deps, `App` dead `expo-blur`/`expo-print`/`expo-symbols` deps (+ wired `buffer` polyfill + `react-native-url-polyfill`). These are logged here so future lint doesn't re-flag them as candidates.
