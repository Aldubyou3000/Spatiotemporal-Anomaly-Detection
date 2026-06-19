# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## System Overview

Three servers must run simultaneously. Start in this order: **API → Web → App**.

**Architecture**: Two frontends (Next.js analyst dashboard + Expo mobile technician app) both talk exclusively to a FastAPI backend. No frontend ever calls Supabase directly.

```
Next.js (web/)      Expo (App/)
       ↓                  ↓
       └──── FastAPI (api/) ────┘
                   ↓
            Supabase (PostgreSQL + Auth + Storage)
```

---

## Running Each Component

### API (FastAPI) — Terminal 1
```powershell
cd api
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
`--host 0.0.0.0` is required — the mobile app connects over WiFi.

### Web Dashboard (Next.js) — Terminal 2
```powershell
cd web
npm run dev
# http://localhost:3000
```

### Mobile App (Expo) — Terminal 3
```powershell
cd App
npm start
# Press w for browser, or scan QR with Expo Go on phone (same WiFi as PC)
```

---

## Installing Dependencies

```powershell
cd api && pip install -r requirements.txt
cd web && npm install
cd App && npm install
```

---

## Type Checking

```powershell
# Web — fast type-only check (no emit)
cd web && npx tsc --noEmit

# Web — full production build (also catches type errors)
cd web && npm run build

# API — no dedicated lint; Pydantic v2 validates schemas at runtime
# App — TypeScript checked by Expo bundler on npm start
```

No automated test suites exist in any component. All testing is currently manual.

---

## Phone Testing

The phone cannot reach `localhost`. `App/.env` is pre-configured with `http://192.168.100.10:8000`.

- PC and phone must be on the **same WiFi**
- If PC IP changes: `ipconfig | Select-String "IPv4"`, then update `App/.env` and restart Expo

---

## Architecture: Backend (`api/`)

Strict layer separation — never bypass it:

| Layer | Responsibility |
|-------|---------------|
| `routers/` | HTTP only: parse request → call service → return response |
| `services/` | Business logic: Supabase calls, zone orchestration, rule enforcement |
| `schemas/` | Pydantic models for all request/response shapes |
| `core/` | Config (`config.py`), JWT (`security.py`), auth guards (`dependencies.py`) |
| `zones/` | Pure data processing — untouched, no HTTP, no DB calls |
| `routers/mobile.py` | Technician-only endpoints — Bearer token auth, all `/api/mobile/` routes |
| `routers/mobile_events.py` | SSE for mobile — `GET /api/mobile/events`, Bearer-auth; proxies the same in-process broker but strips entity IDs and forwards only `tickets`/`reports` signals (no analyst-only resources leak to mobile) |
| `routers/audit.py` | Audit log endpoints — paginated query, stats, chain-hash integrity, CSV export |
| `routers/events.py` | SSE real-time stream — `GET /api/events`, cookie-auth, pushes invalidation signals |

Zone pipeline execution order: `zone_a.py` → `zone_b.py` → `zone_c.py`

- **Zone A**: Downmaps hourly→daily, linear interpolation for single-day gaps only, excludes stations with gaps ≥2 days or <2 valid readings
- **Zone B**: Haversine distance grouping (1–50 km threshold), adds `neighbor_group_id`
- **Zone C**: LOF anomaly detection (RobustScaler, 1D rainfall feature, threshold=1.5)

The `zones/` directory is a copy of `prototypes/zone/` — **do not modify the algorithms**.

Zone pipeline is CPU-bound; call `zones_service.run_pipeline()` via `fastapi.concurrency.run_in_threadpool` to keep the event loop responsive.

### Auth Flow
1. Login → FastAPI verifies with Supabase Auth → issues JWT access token (30 min) + refresh token (7 days)
2. **Web dashboard**: tokens stored in **httpOnly cookies** (`get_current_user` dependency reads `Cookie: access_token`)
3. **Mobile app**: tokens stored in `SecureStore`; every request sends `Authorization: Bearer <token>` (`get_mobile_user` / `require_technician_mobile` dependencies)
4. Refresh rotates on every use; expiry → redirect to login
5. Role enforcement: `analyst` (pipeline, tickets, reports, manage technicians) vs `technician` (view/update assigned tickets, submit reports, upload photos)

---

## Architecture: Web Frontend (`web/src/`)

### Route & Layout structure

```
app/(auth)/login/       — Login page (no sidebar)
app/(dashboard)/        — All protected pages; layout wraps AuthProvider → ZonesProvider → SWRConfig → Sidebar + Header
  zones/                — Pipeline page (primary feature)
  tickets/              — Split-view ticket board
  reports/              — Inspection report review
  technicians/          — Team management
  audit/                — Audit log
```

### Layer rules

| Layer | Responsibility |
|-------|---------------|
| `app/(dashboard)/` | Pages: compose components, own page-level UI state, call hooks |
| `components/ui/` | Shared primitives — props-only, no API calls |
| `components/dashboard/` | Shell: `Sidebar`, `Header`, `PageTransition` |
| `components/zones/` | Zone-specific widgets |
| `components/tickets/` | `TicketDetailBody` — shared detail view used by both tickets and reports pages; `TicketActionDock` — collapsible bottom panel (assignment management + review slot); `ReviewPanel` — analyst approve/follow-up decision surface mounted inside the dock |
| `context/` | Global state that must survive navigation |
| `hooks/` | SWR data-fetching hooks — one file per domain; pages must use these, not raw `lib/api/` |
| `lib/api/` | Raw fetch wrappers — one file per domain, all go through `client.ts` |
| `types/` | TypeScript interfaces mirroring backend Pydantic schemas |
| `lib/ticketStatus.ts` | Single source of truth for ticket status/priority labels, badge tones, sort order, and the `TERMINAL`/`NEEDS_REVIEW` sets — import from here, never re-declare inline |

Always use `@/` path aliases. Never call `lib/api/` directly from components — use hooks or page-level handlers.

### Data fetching — SWR (`hooks/`)

All server data is fetched via SWR hooks in `web/src/hooks/`. Never add `useEffect`+`useState` fetch patterns to pages — use or extend these hooks instead:

| Hook file | Exports |
|-----------|---------|
| `useTickets.ts` | `useTicketList`, `useTicketDetail`, `useTicketReport`, `useTicketAttachments`, `invalidateTicketLists` |
| `useTechnicians.ts` | `useTicketTechnicians` (summary, shared key across Tickets + Zones pages), `useTechnicianProfiles` (full profiles for Technicians page) |
| `useReports.ts` | `useReports` (includes `optimisticApprove`) |
| `useAuditLogs.ts` | `useAuditLogs` (paginated), `useAuditStats` |

Global SWR config lives in the dashboard layout (`app/(dashboard)/layout.tsx`): `revalidateOnFocus: false`, `keepPreviousData: true`, `revalidateIfStale: true`, `dedupingInterval: 4000`. This means stale data renders instantly on tab revisit while SWR revalidates silently in the background — never add a full-page loading spinner gated on data re-fetch.

Mutations follow this pattern: call the API directly → call `mutate()` or `invalidateTicketLists()` to update the cache → no manual `setState` for server data.

Loading state convention: `isLoading` (true only on first load, no cache yet) drives skeleton rows; `isValidating` (true during any background revalidation) spins the Refresh button icon only. Never block the UI on `isValidating`.

### Real-time updates (SSE)

The dashboard auto-updates live — there are no manual "Refresh" buttons. `RealtimeProvider` (mounted once in the dashboard layout, inside `SWRConfig`) opens a single `EventSource` to `GET /api/events` via `useRealtimeSync` (`hooks/useRealtimeSync.ts`). The backend pushes tiny invalidation **signals** (`{resource, action, id}`), never full rows; the hook reacts by calling SWR `globalMutate(keyMatcher)` to revalidate the matching cache keys through the normal authenticated fetch path. So a change made by any analyst (or a mobile technician) refreshes every open view within ~1 s.

- Signals are emitted from **one hook inside `audit.log(...)`** (`services/events_service.py` → `publish_from_audit`), so every audited mutation — web and mobile — fans out automatically. To make a new resource live, add it to the audit→signal map in `events_service.py` and a matcher in `useRealtimeSync.ts`; do **not** add per-route publish calls.
- Resource → key matchers mirror the existing key conventions (e.g. `tickets` signal matches any key with `key[0] === "/api/tickets"`, exactly like `invalidateTicketLists`). The `audit` resource is debounced ~1.5 s client-side to absorb bursts.
- The browser still never talks to Supabase — it only connects to the FastAPI SSE endpoint (cookie auth; `EventSource` sends cookies with `withCredentials`).
- **Single-worker constraint:** the event broker is in-process, so the API must run **one uvicorn worker / one replica** (matches the documented launch command — no `--workers`). With multiple workers a client on worker A misses events from a mutation served by worker B. Upgrade path (not built): a Redis pub/sub backplane — only `events_service.py` changes; the SSE endpoint and frontend stay identical.

### Context providers

| Context | What it holds |
|---------|--------------|
| `AuthContext` | `user`, `loading`, `logout()` — redirects to `/login` on failure |
| `ThemeContext` | `theme`, `setTheme()` — persisted to `localStorage`, written to `data-theme` on `<html>` |
| `ZonesContext` | All zones pipeline state: `file`, `contamination`, `running`, `progress`, `activeStage`, `result`, `error`, `configOpen`, `resetSession()` — lives in dashboard layout so state survives tab navigation. Pipeline results are local computation, not server data — do not replace with SWR. |

### Shared UI components (`components/ui/`)

- **`Button`** — variants: `primary | secondary | ghost | danger`; sizes: `sm | md | lg | icon`; `loading` prop shows spinner
- **`Modal`** — portalled dialog shell; props: `title`, `subtitle`, `onClose`; pair with `ModalFooter` for form modals
- **`ConfirmDialog`** — blocking confirm modal; props: `title`, `message`, `confirmLabel`, `isDangerous`, `onConfirm`, `onCancel`; auto-focuses confirm button, handles Escape key
- **`Badge`** — tones: `neutral | brand | success | warning | danger | info | accent | teal`; optional `dot`
- **`Input`** — label, hint, error states; 34px height
- **`Card` / `CardHeader` / `CardBody` / `CardFooter`** — surface card with dividers
- **`Tabs` / `TabsList` / `Tab` / `TabPanel`** — context-based tab system

All destructive or consequential actions must use `ConfirmDialog` before executing. Currently guarded: logout, ticket status advancement, technician reassignment on ticket, report approval.

### CSS design system (`globals.css`)

All visual values come from CSS custom properties — never hardcode colors or sizes. Key token groups: `--brand*`, `--surface*`, `--text*`, `--border*`, `--shadow-*`, `--r-*`, `--font-*`, `--duration-*`, `--ease-*`.

**Density** is controlled via `data-density="compact|roomy"` on `<html>`; `--row-h`, `--pad-x`, `--pad-y`, `--gap-card`, `--gap-section`, and font sizes all respond automatically.

**Shared utility classes** — use these instead of inline hover handlers:

| Class | Use |
|-------|-----|
| `.nav-item` / `.nav-item__icon` | Sidebar nav links; add `data-active="true"` for brand highlight + left accent stripe |
| `.nav-icon-btn` | Collapsed sidebar icon-only buttons |
| `.topbar-btn` | Small 30×30 icon buttons in header/toolbars |
| `.user-chip` | Pill-shaped user avatar trigger |
| `.menu-item` / `.menu-item--danger` | Dropdown menu rows |
| `.card-toggle` | Full-width collapsible card header |
| `.export-btn` / `.export-btn--primary` | Small inline action buttons (tab bars, filter rows) |
| `.list-row` | Clickable rows in split-view panels; add `data-selected="true"` for selection state |
| `.photo-thumb` | Image thumbnails with CSS hover scale |

**Prefer CSS classes over `onMouseEnter`/`onMouseLeave` for hover background changes** — use the utility classes above when they fit. Inline hover handlers are acceptable only for tones that vary per-instance (e.g. danger vs. brand colour) that can't be expressed with a static class.

**Animations** defined in globals: `animate-fade-in-up`, `animate-scale-in`, `animate-fade-in`, `animate-slide-in-right`; `.stagger > *` for cascading list entrances.

**Portal dropdowns** — any dropdown that lives inside an `overflow: hidden` ancestor (e.g. the ticket detail panel) must render via `createPortal(…, document.body)` with `position: fixed` coordinates derived from `getBoundingClientRect()`. Use `bottom: window.innerHeight - rect.top + 6` to open upward, or `top: rect.bottom + 6` to open downward. See `ReviewPanel.tsx` (`AddTechPicker`) and `TicketActionDock.tsx` for the established pattern.

---

## Architecture: Mobile App (`App/`)

File-based routing via Expo Router. Screens live in `app/`; tabs under `app/(tabs)/`.

- Global state in `context/AppContext.tsx` — auth, theme, profile
- API calls in `services/api.ts` — wraps all `/api/mobile/` endpoints with auto token-refresh
- Tokens: `SecureStore` on native, `localStorage` on web (platform-branched in `services/api.ts`)
- Theme preference persisted via `SecureStore` (native) / `localStorage` (web)
- **Expo v55.0.26 is pinned** — do not upgrade to v56+

---

## Key Constraints

- **Expo v55.0.26 pinned** — breaking changes in v56+
- **Next.js 15 / React 19** — web dashboard
- **SWR 2.4+** — data fetching layer for web dashboard; cache is module-level, survives `PageTransition` remounts
- **pandas 2.2.0+** required — `interpolate(limit_area='inside')` parameter
- **scikit-learn 1.4.0+** required — LOF API changed in earlier versions
- Zone algorithms (`zone_a.py`, `zone_b.py`, `zone_c.py`) must remain untouched
- Ticket lifecycle: `assigned → in-progress → pending_review → verified` (analyst can also send back to `follow_up` from `pending_review`, or `cancelled` from `assigned`)
- CSV upload max: 20 MB
- Rate limits: 120/min global, 10/min on `/api/auth/login`, 30/min on `/api/auth/refresh`
- **API runs ONE uvicorn worker** — the real-time SSE broker is in-process (do not add `--workers`; see Real-time updates). Redis pub/sub is the documented multi-worker upgrade path.

---

## Environment Variables

**`api/.env`** — all secrets, never exposed to browser:
```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_ANON_KEY=
SUPABASE_JWT_SECRET=
JWT_SECRET=
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7
ALLOWED_ORIGINS=http://localhost:3000
DEV_MODE=true
```

`DEV_MODE=true` (default) widens CORS to all `localhost` and `192.168.x.x` origins — set `false` in production.

**`web/.env.local`** — Next.js only gets the API URL:
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

**`App/.env`** — Expo uses PC's LAN IP (not localhost):
```
EXPO_PUBLIC_API_URL=http://192.168.100.10:8000
```

---

## Database Migrations

SQL migrations live in `docs/migrations/`, numbered sequentially (`0001_…`, `0002_…`). **There is no automated migration runner** — each file is **applied by hand in the Supabase SQL editor**, in order. Write them to be idempotent (guard with `IF NOT EXISTS` / `DO $$ … $$` blocks) and safe to re-run, matching the existing files. After adding a migration, the schema change does not take effect until someone runs it in Supabase — code that depends on a new column/table will fail with a Supabase error until then (e.g. "column does not exist"). Flag this to the user when a change requires a migration.

---

## Reference

`prototypes/` is kept for reference only — the `zones/` algorithms there are the source of truth for `api/app/zones/`. When editing `api/` or `web/`, do not touch `prototypes/` or the Expo app (unless the task explicitly targets `App/`).
