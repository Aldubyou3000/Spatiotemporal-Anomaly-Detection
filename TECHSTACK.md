# Tech Stack — Spatiotemporal Anomaly Detection System

**Last updated**: 2026-05-27
**Status**: Migration complete — Streamlit replaced by Next.js + FastAPI

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
| Technology | Purpose |
|-----------|---------|
| **Next.js 15** | Framework — routing, pages, layouts |
| **React 19** | UI — components, state, interactivity |
| **TypeScript** | Type safety — same language as Expo app |
| **Tailwind CSS** | Styling |

### Backend API
| Technology | Purpose |
|-----------|---------|
| **FastAPI** | REST API framework |
| **Python** | Language — reuses existing zone processing code as-is |
| **Pydantic v2** | Request and response validation (built into FastAPI) |
| **Supabase Python SDK** | Database, auth, and storage — server-side only |

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

### Mobile App (Existing — Untouched)
| Technology | Purpose |
|-----------|---------|
| **Expo v55** | Mobile framework |
| **React Native** | Mobile UI |
| **TypeScript** | Type safety |
| **Expo Router** | File-based navigation |

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
│   │   ├── layout.tsx                ← Auth guard + sidebar shell
│   │   ├── zones/page.tsx            ← Upload + pipeline results (tabs)
│   │   ├── tickets/page.tsx          ← Ticket board
│   │   ├── reports/page.tsx          ← Inspection reports + approval
│   │   └── technicians/page.tsx      ← Manage technician accounts
│   ├── layout.tsx                    ← Root layout
│   ├── globals.css
│   └── page.tsx                      ← Redirects to /zones or /login
│
├── components/
│   ├── ui/                           ← Generic components (Badge, Button, Card, etc.)
│   ├── dashboard/                    ← Shell components (Sidebar, Header)
│   └── zones/                        ← Pipeline result tabs (OverviewTab, StationMap, etc.)
│
├── context/
│   ├── AuthContext.tsx
│   └── ThemeContext.tsx
│
├── lib/
│   ├── api/                          ← One file per domain; all go through client.ts
│   │   ├── client.ts                 ← Base fetch: auto-refresh on 401, credentials: include
│   │   ├── auth.ts
│   │   ├── zones.ts
│   │   ├── tickets.ts
│   │   ├── reports.ts
│   │   └── technicians.ts
│   ├── cn.ts                         ← Tailwind class merging
│   └── csv.ts
│
├── middleware.ts                     ← Cookie-based route guard
└── types/                            ← TypeScript interfaces mirroring backend schemas
```

---

### Backend API (`api/`)

Routers handle HTTP only — parse the request, call a service, return the response. Services handle business logic and know nothing about HTTP.

```
api/app/
├── main.py                           ← FastAPI app: routers, CORS, rate limiting, security headers
│
├── core/
│   ├── config.py                     ← Env vars via Pydantic BaseSettings
│   ├── security.py                   ← JWT verification (Supabase tokens)
│   └── dependencies.py               ← Depends(): get_current_user (cookie), get_mobile_user (Bearer)
│
├── routers/                          ← HTTP only — no business logic
│   ├── auth.py                       ← POST /api/auth/login|logout|refresh, GET /api/auth/me
│   ├── zones.py                      ← POST /api/zones/process, GET /api/zones/{id}
│   ├── tickets.py                    ← CRUD /api/tickets
│   ├── reports.py                    ← /api/reports — submit, approve
│   ├── technicians.py                ← /api/technicians
│   └── mobile.py                     ← /api/mobile/* — technician Bearer-auth endpoints
│
├── services/                         ← Business logic — Supabase calls, zone orchestration
│   ├── auth_service.py
│   ├── zones_service.py              ← run_pipeline() — call via run_in_threadpool
│   ├── tickets_service.py
│   ├── reports_service.py
│   └── technicians_service.py
│
├── schemas/                          ← Pydantic v2 request/response models
│   ├── auth.py
│   ├── zones.py
│   ├── tickets.py
│   ├── reports.py
│   └── technicians.py
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
page.tsx     → Composes components, handles page-level state
components/  → UI building blocks — receive props, emit events, no direct API calls
hooks/       → Data fetching and mutation — calls lib/api/, returns state to components
lib/api/     → Raw API calls — one function per endpoint, returns typed data
types/       → TypeScript interfaces — shared across components, hooks, and api calls
```

---

## API Endpoints

### Auth
```
POST   /api/auth/login                { username, password } → { access_token, user }
GET    /api/auth/me                   → Current user profile
POST   /api/auth/logout
POST   /api/auth/refresh              { refresh_token } → { access_token }
```

### Zones Processing
```
POST   /api/zones/process             { file: CSV, contamination? } → ProcessResult (synchronous)
```

### Tickets
```
GET    /api/tickets                   → Paginated list (status/priority/station_id filters)
GET    /api/tickets/{id}              → Single ticket with attachments
POST   /api/tickets                   → Create (analyst only)
PATCH  /api/tickets/{id}              → Update status, technician, or fields
GET    /api/tickets/{id}/pdf          → Stream PDF report
GET    /api/tickets/{id}/attachments  → List CSV attachments
POST   /api/tickets/{id}/attachments  → Upload CSV attachment
```

### Reports
```
GET    /api/reports                   → All reports (analyst only)
GET    /api/reports/{id}              → Single report
PATCH  /api/reports/{id}/approve      → Approve report, mark ticket verified (analyst only)
```

### Technicians
```
GET    /api/technicians               → List technician accounts
POST   /api/technicians               → Create technician account (analyst only)
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
GET    /api/mobile/tickets/{id}/pdf
POST   /api/mobile/reports            → Submit inspection report
GET    /api/mobile/reports/{id}/photos
POST   /api/mobile/reports/{id}/photos → Upload inspection photo
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
JWT_SECRET=
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7
ALLOWED_ORIGINS=https://your-nextjs-domain.vercel.app
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
- **Ticket state machine**: `assigned → in-progress → completed → verified` — enforced in both API and mobile app
- **Token auth**: Analyst uses httpOnly cookies (30-min access, 7-day refresh). Technician uses Bearer tokens in SecureStore (native) or localStorage (web).
