# Tech Stack — Spatiotemporal Anomaly Detection System

**Last updated**: 2026-05-26
**Status**: Planned migration — Streamlit → Next.js + FastAPI

---

## Overview

Two frontends, one backend, one database.

| System | Users | Status |
|--------|-------|--------|
| Web Dashboard (`web/`) | Data Analysts | Migrating from Streamlit → Next.js |
| Mobile App (`App/`) | Field Technicians | Expo (React Native) — untouched |
| Backend API (`api/`) | Serves both frontends | New: FastAPI |

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
├── TECHSTACK.md          ← This document
├── CLAUDE.md             ← Codebase instructions for Claude Code
├── RUNNING.md            ← How to start each service
└── TICKETING_SYSTEM_DESIGN.md
```

---

### Web Frontend (`web/`)

The `src/` wrapper keeps source code separate from config files at the root. Route groups `(auth)` and `(dashboard)` apply different layouts to different pages without adding URL segments — login gets a plain centered layout, everything else gets the sidebar dashboard layout.

```
web/
├── src/
│   ├── app/                          ← Next.js App Router
│   │   ├── (auth)/                   ← Route group: plain layout, no sidebar
│   │   │   ├── layout.tsx            ← Centered card layout for login
│   │   │   └── login/
│   │   │       └── page.tsx
│   │   ├── (dashboard)/              ← Route group: protected, with sidebar
│   │   │   ├── layout.tsx            ← Auth guard + sidebar shell
│   │   │   ├── zones/
│   │   │   │   ├── page.tsx          ← Upload form
│   │   │   │   └── [sessionId]/
│   │   │   │       └── page.tsx      ← Pipeline results (tabs: overview, raw,
│   │   │   │                             cleaned, neighbors, anomalies, create ticket)
│   │   │   └── tickets/
│   │   │       └── page.tsx          ← Ticket board + inspection reports + manage technicians
│   │   ├── layout.tsx                ← Root layout (fonts, global providers)
│   │   ├── globals.css
│   │   └── page.tsx                  ← Redirects to /zones or /login
│   │
│   ├── components/
│   │   ├── ui/                       ← Generic, domain-agnostic components
│   │   │   ├── Badge.tsx             ← Status and priority badges
│   │   │   ├── Button.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── DataTable.tsx         ← Paginated table
│   │   │   ├── EmptyState.tsx
│   │   │   └── Modal.tsx
│   │   ├── layout/                   ← App shell components
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Header.tsx
│   │   │   └── NavLink.tsx
│   │   ├── zones/                    ← Zones page components
│   │   │   ├── UploadForm.tsx
│   │   │   ├── PipelineResults.tsx   ← Tab container after processing
│   │   │   ├── OverviewTab.tsx       ← Stats grid + map + CSV downloads
│   │   │   ├── StationMap.tsx        ← Leaflet map
│   │   │   ├── AnomalyChart.tsx      ← Per-station bar chart
│   │   │   ├── NeighborGroups.tsx
│   │   │   └── CreateTicketForm.tsx
│   │   ├── tickets/                  ← Tickets page components
│   │   │   ├── TicketCard.tsx
│   │   │   ├── TicketBoard.tsx
│   │   │   ├── StatusFilter.tsx
│   │   │   └── StatusControls.tsx
│   │   ├── reports/                  ← Inspection reports components
│   │   │   ├── ReportCard.tsx
│   │   │   ├── ApproveForm.tsx
│   │   │   └── PhotoViewer.tsx
│   │   └── technicians/              ← Manage technicians components
│   │       ├── TechnicianList.tsx
│   │       └── CreateTechnicianForm.tsx
│   │
│   ├── hooks/                        ← Custom React hooks (one per domain)
│   │   ├── useAuth.ts
│   │   ├── useZones.ts
│   │   ├── useTickets.ts
│   │   ├── useReports.ts
│   │   └── useTechnicians.ts
│   │
│   ├── lib/
│   │   ├── api/                      ← All FastAPI calls — split by domain
│   │   │   ├── client.ts             ← Base fetch wrapper: attaches auth token, handles errors
│   │   │   ├── auth.ts               ← login(), logout(), getMe()
│   │   │   ├── zones.ts              ← processFile(), getResults()
│   │   │   ├── tickets.ts            ← getTickets(), updateStatus(), createTicket()
│   │   │   ├── reports.ts            ← getReports(), approveReport()
│   │   │   └── technicians.ts        ← getTechnicians(), createTechnician()
│   │   └── utils/
│   │       ├── formatters.ts         ← Date and number formatting
│   │       └── cn.ts                 ← Tailwind class merging utility
│   │
│   └── types/                        ← TypeScript types — mirrors backend schemas
│       ├── auth.ts
│       ├── zones.ts
│       ├── tickets.ts
│       ├── reports.ts
│       └── technicians.ts
│
├── public/
├── .env.local
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

### Backend API (`api/`)

Routers handle HTTP only — parse the request, call a service, return the response. Services handle business logic and know nothing about HTTP. Schemas define the shape of data going in and out. This separation means each layer can be changed or tested independently.

```
api/
├── app/
│   ├── __init__.py
│   ├── main.py                       ← FastAPI app: registers routers, middleware, CORS
│   │
│   ├── core/                         ← Infrastructure — config, security, shared dependencies
│   │   ├── __init__.py
│   │   ├── config.py                 ← All env vars via Pydantic BaseSettings
│   │   ├── security.py               ← JWT creation and verification
│   │   └── dependencies.py           ← FastAPI Depends() — auth guard, role checks
│   │
│   ├── routers/                      ← HTTP layer only — no business logic here
│   │   ├── __init__.py
│   │   ├── auth.py                   ← POST /api/auth/login, GET /api/auth/me
│   │   ├── zones.py                  ← POST /api/zones/process, GET /api/zones/{id}
│   │   ├── tickets.py                ← GET/POST /api/tickets, PATCH /api/tickets/{id}
│   │   ├── reports.py                ← GET/POST /api/reports, PATCH /api/reports/{id}/approve
│   │   └── technicians.py            ← GET/POST /api/technicians
│   │
│   ├── services/                     ← Business logic — no HTTP, no request/response objects
│   │   ├── __init__.py
│   │   ├── auth_service.py           ← Verify credentials, issue tokens
│   │   ├── zone_service.py           ← Orchestrate zone_a → zone_b → zone_c
│   │   ├── ticket_service.py         ← Create, update, validate ticket transitions
│   │   ├── report_service.py         ← Submit and approve reports
│   │   └── technician_service.py     ← Create and list technician accounts
│   │
│   ├── schemas/                      ← Pydantic models — request and response shapes
│   │   ├── __init__.py
│   │   ├── auth.py                   ← LoginRequest, TokenResponse, UserProfile
│   │   ├── zones.py                  ← ProcessResponse, SessionResult, AnomalySummary
│   │   ├── tickets.py                ← TicketCreate, TicketResponse, TicketStatusUpdate
│   │   ├── reports.py                ← ReportCreate, ReportResponse, ApproveRequest
│   │   └── technicians.py            ← TechnicianCreate, TechnicianResponse
│   │
│   └── zones/                        ← Existing zone processing code — untouched
│       ├── __init__.py
│       ├── zone_a.py
│       ├── zone_b.py
│       └── zone_c.py
│
├── .env
├── .env.example
└── requirements.txt
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
POST   /api/zones/process             { file: CSV } → { session_id }
GET    /api/zones/{session_id}        → Full pipeline results
POST   /api/zones/{session_id}/ticket → Create ticket from anomaly
```

### Tickets
```
GET    /api/tickets                   → Paginated list, filterable by status
GET    /api/tickets/{id}              → Single ticket with report and attachments
POST   /api/tickets                   → Create (analyst only)
PATCH  /api/tickets/{id}/status       → Update status
```

### Reports
```
GET    /api/reports                   → Pending reports awaiting approval
GET    /api/reports/{id}              → Single report with photos
POST   /api/reports                   → Submit report (technician only)
PATCH  /api/reports/{id}/approve      → Approve report (analyst only)
```

### Technicians
```
GET    /api/technicians               → List all technician accounts
POST   /api/technicians               → Create technician account (analyst only)
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

| Phase | What Gets Built | Status |
|-------|-----------------|--------|
| **1** | Next.js + FastAPI projects scaffolded, login working end-to-end | ✅ Complete |
| **2** | Zones pipeline in FastAPI, full results UI in Next.js (all tabs, maps, charts) | ✅ Complete |
| **3** | Ticket board in Next.js, ticket CRUD in FastAPI, PDF export | ✅ Complete |
| **4** | Inspection reports, report approval, manage technicians, create ticket from zones | ✅ Complete |
| **5** | Feature parity verified, Streamlit shut down | ✅ Complete |

**Migration complete.** All Streamlit pages have been replicated in the Next.js dashboard and mobile app. Streamlit and prototypes/ have been removed.

---

## Architecture Guarantees

These architectural decisions are enforced throughout the codebase:

- **No frontend → Supabase**: All frontends (Next.js, Expo) communicate exclusively through FastAPI. The backend owns all Supabase interaction.
- **Zone processing untouched**: `zone_a.py`, `zone_b.py`, `zone_c.py` in `api/app/zones/` are exact copies from prototypes. Algorithms must not change.
- **Strict layer separation** (backend): Routers (HTTP only) → Services (business logic) → Schemas (Pydantic) → Zones (pure data processing)
- **Ticket state machine**: `assigned → in-progress → completed → verified` — enforced in both API and mobile app
- **Token auth**: Analyst uses httpOnly cookies (30-min access, 7-day refresh). Technician uses Bearer tokens in SecureStore (native) or localStorage (web).
