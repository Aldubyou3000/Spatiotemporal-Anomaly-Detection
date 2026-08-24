# Shared-Candidates (Rule of 3)

Behavior duplicated across 3+ components that should be extracted into a shared utility, service, or backend process. Reviewed each session; promoted to an actual refactor when the list grows or duplication causes bugs.

Format per entry: **Pattern** → where it appears (3+ places) → what extraction would look like.

---

## Active candidates

### 1. Signed-URL helper (`_signed_url`)
**Appears in**:
- `api/app/routers/mobile.py` (defined here)
- `api/app/routers/tickets.py` — `from .mobile import _signed_url`
- `api/app/routers/reports.py` — `from .mobile import _signed_url`

**Problem**: Two analyst-facing routers import a private helper from the technician router. Couples unrelated routers and creates a misleading "mobile owns this" signal.

**Extraction**: Move to `api/app/core/storage.py` (or `services/storage_service.py`) as a public `signed_url(...)`. Update the three import sites. The underscore-prefixed private name becoming public is the signal that it's shared.

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

## Resolved

(none yet — entries move here when extracted)
