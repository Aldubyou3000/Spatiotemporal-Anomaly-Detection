# Tech Stack — Spatiotemporal Anomaly Detection System

**Last updated**: 2026-06-21
**Status**: Migration complete — Streamlit replaced by Next.js + FastAPI. Google OAuth, audit log, and real-time SSE added post-migration.

---

## Overview

Two frontends, one backend, one database.

| System | Users | Status |
|--------|-------|--------|
| Web Dashboard (`web/`) | Data Analysts | Next.js — live |
| Mobile App (`App/`) | Field Technicians | Expo (React Native) — live |
| Backend API (`api/`) | Serves both frontends | FastAPI — live |

**Core rule:** No frontend ever talks to Supabase directly. All data flows through FastAPI only.

---

## Architecture

```
Web Browser (Analyst)          Mobile App (Technician)
        ↓                                ↓
    Next.js                      Expo (React Native)
        ↓                                ↓
        └──────────── FastAPI ───────────┘
                          ↓
                      Supabase
             (PostgreSQL + Auth + Storage)
```

---

## Tech Stack

### Web Frontend
| Technology | Version | Purpose |
|-----------|---------|---------|
| **Next.js** | 15.5.18 | Framework — App Router, layouts, route groups |
| **React** | 19.1.0 | UI — components, state, interactivity |
| **TypeScript** | — | Type safety across all layers |
| **SWR** | 2.4+ | Data fetching — stale-while-revalidate, cache survives navigation |
| **CSS custom properties** | — | Design system via `globals.css` — no Tailwind |

### Backend API
| Technology | Purpose |
|-----------|---------|
| **FastAPI** | REST API framework |
| **Python** | Language — reuses existing zone processing code as-is |
| **Pydantic v2** | Request and response validation (built into FastAPI) |
| **Supabase Python SDK** | Database, auth, and storage — server-side only |
| **Server-Sent Events** | Real-time push to the web dashboard (`GET /api/events`); in-process broker, stdlib only — see single-worker note below |
| **slowapi** | Per-route rate limiting (120/min global, 10/min login, 30/min refresh) |
| **Server-side PKCE OAuth** | Google sign-in for web + mobile — verifier kept server-side, `state` in URL path; Google client ID/secret live in the Supabase dashboard |

### Security Layers (backend)
| Mechanism | Purpose |
|-----------|---------|
| **httpOnly cookies + CSRF double-submit** | Web session tokens unreadable by JS; `X-CSRF-Token` header echoes a readable `csrf_token` cookie on mutations |
| **Session fingerprinting** | HMAC of (IP, User-Agent) bound to the session, rotated on every login/refresh (anti-fixation) |
| **Account lockout** | 5 failed attempts in 5 min → 15 min lockout |
| **Append-only audit log** | Every mutation logged with a SHA-256 hash chain; tamper-evident, integrity-verifiable |
| **`assert_production_safe()`** | Startup guard that refuses to boot with dev-grade config when `DEV_MODE=false` |

### Zone Processing (Existing — Untouched)
| File | Purpose |
|------|---------|
| `zone_a.py` | Data cleaning and interpolation |
| `zone_b.py` | Neighbor identification via Haversine distance |
| `zone_c.py` | Anomaly detection via LOF algorithm |

### Database & Services
| Technology | Purpose |
|-----------|---------|
| **Supabase PostgreSQL** | Main database |
| **Supabase Auth** | User authentication |
| **Supabase Storage** | File storage — CSV uploads and inspection photos |

### Mobile App
| Technology | Version | Purpose |
|-----------|---------|---------|
| **Expo** | 55.0.26 (pinned) | Mobile framework — do not upgrade to v56+ |
| **React Native** | — | Mobile UI |
| **TypeScript** | — | Type safety |
| **Expo Router** | — | File-based navigation |

---

## Folder Structure

### Repository Root
```
Spatiotemporal-Anomaly-Detection/
├── web/                  ← Next.js frontend (analyst dashboard)
├── api/                  ← FastAPI backend
├── App/                  ← Expo mobile app (field technician)
├── prototypes/           ← Reference only — original Streamlit + zone algorithms
├── README.md             ← Project overview and quick start
├── CLAUDE.md             ← Codebase instructions for Claude Code
└── TECHSTACK.md          ← This document
```

---

### Web Frontend (`web/`)

Route groups `(auth)` and `(dashboard)` apply different layouts without adding URL segments — login gets a plain centered layout, everything else gets the sidebar dashboard layout.

```
web/src/
├── app/
│   ├── (auth)/login/page.tsx         ← Login page
│   ├── (dashboard)/
│   │   ├── layout.tsx                ← AuthProvider → ZonesProvider → SWRConfig → RealtimeProvider → sidebar shell
│   │   ├── zones/page.tsx            ← Upload + pipeline results (tabs)
│   │   ├── tickets/page.tsx          ← Split-view ticket board
│   │   ├── reports/page.tsx          ← Inspection reports + approval
│   │   ├── technicians/page.tsx      ← Manage technician accounts
│   │   └── audit/page.tsx            ← Audit log with filters + integrity check
│   ├── layout.tsx                    ← Root layout (ThemeProvider)
│   ├── globals.css                   ← CSS design system — all tokens live here
│   └── page.tsx                      ← Redirects to /zones or /login
│
├── components/
│   ├── ui/                           ← Generic primitives (Badge, Button, Card, Modal, ConfirmDialog, Tabs…)
│   ├── dashboard/                    ← Shell components (Sidebar, Header, PageTransition)
│   ├── providers/                    ← RealtimeProvider (mounts the SSE EventSource once)
│   ├── zones/                        ← Pipeline result tabs (OverviewTab, StationMap, etc.)
│   └── tickets/                      ← TicketDetailBody (shared between tickets + reports); TicketActionDock (assignment + review slot); ReviewPanel (approve/follow-up decision)
│
├── context/
│   ├── AuthContext.tsx               ← user, loading, logout()
│   ├── ThemeContext.tsx              ← theme, setTheme() — persisted to localStorage
│   └── ZonesContext.tsx              ← Pipeline session state (file, result, progress…)
│
├── hooks/                            ← SWR data-fetching hooks — pages use these, not lib/api directly
│   ├── useTickets.ts                 ← useTicketList, useTicketDetail, useTicketReport, useTicketAttachments, invalidateTicketLists
│   ├── useTechnicians.ts             ← useTicketTechnicians, useTechnicianProfiles
│   ├── useReports.ts                 ← useReports (with optimisticApprove)
│   ├── useAuditLogs.ts              ← useAuditLogs (paginated), useAuditStats
│   └── useRealtimeSync.ts            ← Single EventSource → SWR cache invalidation (real-time)
│
├── lib/
│   ├── api/                          ← Raw fetch wrappers — one file per domain, all through client.ts
│   │   ├── client.ts                 ← Base fetch: auto-refresh on 401, CSRF, credentials: include
│   │   ├── auth.ts
│   │   ├── zones.ts
│   │   ├── tickets.ts
│   │   ├── reports.ts
│   │   ├── technicians.ts
│   │   └── audit.ts
│   └── cn.ts
│
├── middleware.ts                     ← Cookie-based route guard
└── types/                            ← TypeScript interfaces mirroring backend Pydantic schemas
```

---

### Backend API (`api/`)

Routers handle HTTP only — parse the request, call a service, return the response. Services handle business logic and know nothing about HTTP.

```
api/app/
├── main.py                           ← FastAPI app: routers, CORS, rate limiting, security headers
│
├── core/
│   ├── config.py                     ← Env vars via Pydantic BaseSettings + assert_production_safe()
│   ├── security.py                   ← JWT verification, session fingerprint HMAC
│   ├── errors.py                     ← friendly_db_error() — translates Postgres codes, never leaks raw DB text
│   └── dependencies.py               ← Depends(): get_current_user (cookie), get_mobile_user (Bearer), _client_ip()
│
├── routers/                          ← HTTP only — no business logic
│   ├── auth.py                       ← POST /api/auth/login|logout|refresh, GET /api/auth/me
│   ├── zones.py                      ← POST /api/zones/process, GET /api/zones/{id}
│   ├── tickets.py                    ← CRUD /api/tickets + assign/follow-up/cancel/report/pdf
│   ├── reports.py                    ← /api/reports — list, approve, photos
│   ├── technicians.py                ← /api/technicians — list, create, toggle-active
│   ├── mobile.py                     ← /api/mobile/* — technician Bearer-auth endpoints
│   ├── audit.py                      ← /api/audit — log, stats, integrity, CSV export
│   ├── events.py                     ← GET /api/events — SSE real-time stream (cookie auth)
│   └── mobile_events.py              ← GET /api/mobile/events — SSE for mobile (Bearer auth); same broker, strips entity IDs, forwards tickets/reports only
│
├── services/                         ← Business logic — Supabase calls, zone orchestration
│   ├── auth_service.py
│   ├── zones_service.py              ← run_pipeline() — call via run_in_threadpool
│   ├── tickets_service.py
│   ├── reports_service.py
│   ├── technicians_service.py
│   ├── audit_service.py              ← Append-only audit log — background writer, SHA-256 chain
│   └── events_service.py             ← In-process pub/sub broker feeding the SSE stream
│
├── schemas/                          ← Pydantic v2 request/response models
│   ├── auth.py
│   ├── zones.py
│   ├── tickets.py
│   ├── reports.py
│   ├── technicians.py
│   └── audit.py
│
└── zones/                            ← Zone algorithms — do not modify
    ├── zone_a.py
    ├── zone_b.py
    └── zone_c.py
```

---

## Separation of Concerns

This is the rule that keeps the codebase maintainable long-term.

### Backend layers (top to bottom)
```
Router       → Receives HTTP request, validates input, calls service, returns response
Service      → Business logic — talks to Supabase, calls zone processing, enforces rules
Schema       → Defines the shape of data in and out (Pydantic models)
Core         → Config, security, shared dependencies used across all layers
zones/       → Pure data processing functions — no HTTP, no database, no side effects
```

### Frontend layers
```
page.tsx     → Composes components, owns page-level UI state, calls hooks
components/  → UI building blocks — receive props, emit events, no direct API calls
hooks/       → SWR data fetching — call lib/api/, cache results, expose mutate()
lib/api/     → Raw fetch calls — one function per endpoint, returns typed data
types/       → TypeScript interfaces — shared across components, hooks, and api
```

---

## API Endpoints

### Auth (web — httpOnly cookies; tokens never in the response body)
```
POST   /api/auth/login                { credential, password } → { user }  (sets access/refresh/csrf cookies)
GET    /api/auth/me                   → Current user profile
POST   /api/auth/logout               → Clears auth cookies
POST   /api/auth/refresh              → Rotates tokens from the refresh cookie (no body)
GET    /api/auth/oauth/google/start         → 302 to Google (server-side PKCE)
GET    /api/auth/oauth/google/callback/{state} → Exchanges code, gates analyst role, sets cookies, lands on /zones
```

### Mobile OAuth (Google sign-in for technicians)
```
GET    /api/mobile/auth/oauth/google/start?return_url=…      → 302 to Google
GET    /api/mobile/auth/oauth/google/callback/{state}        → Deep-links tokens back to the app (spatiotemporal://)
```
`state` is carried in the URL **path** (`…/callback/{state}`), never a query param — Supabase's `…/callback/**` allowlist glob does not reliably span a literal `?`. Mobile OAuth requires the API to be reachable over **HTTPS** (an ngrok tunnel in dev; Chrome blocks `http://` LAN redirects mid-flow) and a real dev/prod build (Expo Go can't register the `spatiotemporal://` deep link).

### Zones Processing
```
POST   /api/zones/process             { file: CSV, contamination? } → ProcessResult (synchronous)
```

### Tickets (analyst — all require analyst role)
```
GET    /api/tickets                          → Paginated list (status/priority/station_id filters)
GET    /api/tickets/technicians              → Technician summary for assignment dropdowns
POST   /api/tickets                          → Create (multi-technician assignment)
GET    /api/tickets/{id}                      → Single ticket detail
PATCH  /api/tickets/{id}                      → Update status, technician, or fields
POST   /api/tickets/{id}/technicians          → Add technician(s) to a ticket
DELETE /api/tickets/{id}/technicians/{userId} → Remove (soft-delete) a technician
POST   /api/tickets/{id}/follow-up            → Send back for re-visit (notes required)
POST   /api/tickets/{id}/cancel               → Cancel (only from assigned; reason required)
GET    /api/tickets/{id}/report               → Active inspection report (with photos)
GET    /api/tickets/{id}/attachments          → List file attachments
POST   /api/tickets/{id}/attachments          → Upload file attachment (≤20 MB)
GET    /api/tickets/{id}/pdf                   → Stream PDF report
```

### Reports
```
GET    /api/reports                   → All reports grouped by status (analyst only)
GET    /api/reports/{id}              → Single report
GET    /api/reports/{id}/photos       → Inspection photos (fresh signed URLs)
PATCH  /api/reports/{id}/approve      → Approve report, mark ticket verified (analyst only)
```

### Technicians
```
GET    /api/technicians                        → List technician accounts
POST   /api/technicians                        → Create technician account (analyst only)
PATCH  /api/technicians/{id}/toggle-active      → Enable / disable an account (API exists; not exposed in analyst UI — admin-only operation)
```

### Audit Log
```
GET    /api/audit                     → Paginated log (event/user/entity/ip/success filters)
GET    /api/audit/stats               → Event counts + failure rates (top 6)
GET    /api/audit/integrity           → Chain-hash integrity verification
GET    /api/audit/export              → CSV export with same filters
```

### Real-time (SSE)
```
GET    /api/events                    → Server-Sent Events stream (cookie auth); pushes
                                         {resource, action, id} invalidation signals so the
                                         dashboard auto-updates. In-process broker fed from
                                         audit.log() → run ONE worker (no --workers); Redis
                                         pub/sub is the multi-worker upgrade path.
```

### Mobile (technician Bearer auth — all under `/api/mobile/`)
```
POST   /api/mobile/auth/login         → Returns access + refresh tokens
POST   /api/mobile/auth/refresh
POST   /api/mobile/auth/logout
GET    /api/mobile/auth/me
GET    /api/mobile/tickets            → Tickets assigned to authenticated technician
GET    /api/mobile/tickets/{id}
PATCH  /api/mobile/tickets/{id}/status → Set in-progress or completed
GET    /api/mobile/tickets/{id}/attachments
GET    /api/mobile/tickets/{id}/report-id
GET    /api/mobile/tickets/{id}/follow-up-context → Prior rounds + analyst instructions for re-visit
GET    /api/mobile/tickets/{id}/attachments
GET    /api/mobile/tickets/{id}/pdf
POST   /api/mobile/reports            → Submit inspection report
GET    /api/mobile/reports/{id}/photos
POST   /api/mobile/reports/{id}/photos → Upload inspection photo
GET    /api/mobile/activity           → Technician's own audit feed (ticket events only)
GET    /api/mobile/events             → SSE stream (Bearer auth); content-free nudge triggering refetch
```

---

## Authentication Flow

```
1. User submits login → POST /api/auth/login
2. FastAPI verifies credentials with Supabase Auth
3. FastAPI issues JWT access token (30 min) + refresh token (7 days)
4. Tokens stored in httpOnly cookies — never localStorage, never visible to JavaScript
5. Every request includes the access token automatically via cookie
6. FastAPI verifies token on every protected endpoint before doing anything
7. Token expires → browser silently calls POST /api/auth/refresh
8. Refresh token rotates on every use — old tokens become invalid immediately
9. Refresh token expires → user is redirected to login
```

A session fingerprint (HMAC of IP + User-Agent) and CSRF token are issued alongside the cookies and regenerated on every login and refresh (anti-fixation). **Google sign-in** is an alternative entry point: `…/oauth/google/start` runs a server-side PKCE round-trip and, on success, issues the exact same session (cookies for web, deep-linked tokens for mobile).

---

## Security Rules

### CORS
```python
allow_origins=["https://your-nextjs-domain.vercel.app"]  # no wildcard *
allow_methods=["GET", "POST", "PATCH", "DELETE"]
allow_headers=["Authorization", "Content-Type"]
allow_credentials=True
```

### Environment Variables

**`web/.env.local`** — Next.js only gets the API address. Nothing else.
```
NEXT_PUBLIC_API_URL=https://your-fastapi-domain.railway.app
```

**`api/.env`** — All secrets stay server-side. Never sent to the browser.
```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_ANON_KEY=
SUPABASE_JWT_SECRET=
JWT_SECRET=
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7
ALLOWED_ORIGINS=https://your-nextjs-domain.vercel.app
DEV_MODE=true
# Security — hardened for production (assert_production_safe() enforces these when DEV_MODE=false)
CSRF_SECRET=                 # 32+ char random; secrets.token_hex(32)
COOKIE_SECURE=false          # true in production
COOKIE_SAMESITE=lax          # strict in production
# Google OAuth (client ID/secret live in the Supabase dashboard)
GOOGLE_OAUTH_ENABLED=false
OAUTH_REDIRECT_BASE=http://localhost:8000        # web callback base
MOBILE_OAUTH_REDIRECT_BASE=                       # https tunnel/host base for phone
WEB_APP_URL=http://localhost:3000                 # where the browser lands after callback
```

**`App/.env`** — Expo gets the API URL only (the LAN IP, or an https tunnel for OAuth).
```
EXPO_PUBLIC_API_URL=http://192.168.100.10:8000    # or https://<your>.ngrok-free.dev for mobile Google sign-in
```

### File Uploads
CSV files upload to FastAPI first. FastAPI validates file type, size, and auth before passing to Supabase Storage. The browser never has a Supabase storage URL or key.

### Role-Based Access
- `analyst` — run pipeline, create tickets, approve reports, manage technicians
- `technician` — view assigned tickets, submit reports

Enforced in two places: FastAPI `dependencies.py` (application level) and Supabase RLS policies (database level).

---

## Migration Status

**Migration complete.** All five phases delivered. Streamlit shut down; `prototypes/` kept as reference only.

| Phase | What Was Built |
|-------|----------------|
| 1 | Next.js + FastAPI scaffold, login end-to-end |
| 2 | Zones pipeline in FastAPI, full results UI in Next.js |
| 3 | Ticket board, CRUD, PDF export |
| 4 | Inspection reports, approval, manage technicians |
| 5 | Feature parity verified, Streamlit shut down |

---

## Architecture Guarantees

These architectural decisions are enforced throughout the codebase:

- **No frontend → Supabase**: All frontends (Next.js, Expo) communicate exclusively through FastAPI. The backend owns all Supabase interaction.
- **Zone processing untouched**: `zone_a.py`, `zone_b.py`, `zone_c.py` in `api/app/zones/` are exact copies from prototypes. Algorithms must not change.
- **Strict layer separation** (backend): Routers (HTTP only) → Services (business logic) → Schemas (Pydantic) → Zones (pure data processing)
- **Ticket state machine**: `assigned → in-progress → pending_review → verified`; analyst can also branch to `follow_up` (from `pending_review`) or `cancelled` (from `assigned`) — enforced in both API and mobile app
- **Token auth**: Analyst uses httpOnly cookies (30-min access, 7-day refresh). Technician uses Bearer tokens in SecureStore (native) or localStorage (web).
- **Real-time over SSE**: the dashboard auto-updates via a single `EventSource` to `/api/events`, fed by an in-process broker hooked into `audit.log()`. The mobile app has a parallel SSE endpoint at `/api/mobile/events` (Bearer auth, content-free nudges only). The browser still never touches Supabase. Because the broker is in-process, the API must run **one uvicorn worker / one replica** (Redis pub/sub is the documented multi-worker upgrade path).
