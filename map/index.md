# Map Index

Catalog of every page in the map. **Read this first** for any task, then jump to only the component page(s) that matter. One line per page.

How to see recent map activity:
```bash
grep "^## \[" map/log.md | tail -5
```

---

## Top-level

- [overview.md](./overview.md) — High-level architecture: layers, entry points, request/data flow, real-time contract, auth model, key invariants.
- [shared-candidates.md](./shared-candidates.md) — Behavior duplicated 3+ places that should be extracted (rule-of-3). Reviewed each session.
- [orphans.md](./orphans.md) — Files with no inbound references (dead code candidates / map gaps / external entry points).
- [log.md](./log.md) — Append-only session log.

## Component pages (`components/`)

### Backend (`api/`)
- [api-app.md](./components/api-app.md) — `app/main.py`: FastAPI app, router wiring, middleware, startup/shutdown, the production-safe guard.
- [api-core.md](./components/api-core.md) — `app/core/`: config, auth dependencies, JWT/fingerprint crypto, lockout, DB error translation. The lowest layer.
- [api-auth.md](./components/api-auth.md) — `routers/auth.py` + `services/auth_service.py`: web password + Google OAuth (server-side PKCE), httpOnly cookies, CSRF.
- [api-zones.md](./components/api-zones.md) — `routers/zones.py` + `services/zones_service.py` + `hmdas_converter.py` + frozen `zones/`: the CSV→clean→group→LOF pipeline.
- [api-tickets.md](./components/api-tickets.md) — `routers/tickets.py` + `services/tickets_service.py`: ticket CRUD, multi-tech assignment, follow-up, cancel, attachments, PDF.
- [api-reports.md](./components/api-reports.md) — `routers/reports.py` + `services/reports_service.py`: analyst report review + approve (verifies parent ticket).
- [api-technicians.md](./components/api-technicians.md) — `routers/technicians.py` + `services/technicians_service.py`: analyst-only technician account management.
- [api-audit.md](./components/api-audit.md) — `services/audit_service.py` + `routers/audit.py`: append-only SHA-256 chain log; **the** real-time integration point (`log()` fans out SSE signals).
- [api-realtime.md](./components/api-realtime.md) — `services/events_service.py` + `events.py` + `mobile_events.py`: in-process SSE broker, the one producer hook, mobile projection boundary.
- [api-mobile.md](./components/api-mobile.md) — `routers/mobile.py` + `mobile_events.py`: technician Bearer-auth endpoints under `/api/mobile/*`; home of `_signed_url` (shared-candidate).

### Web frontend (`web/`)
- [web-shell.md](./components/web-shell.md) — `app/` + `middleware.ts`: route groups, dashboard layout provider stack, cookie route guard, CSRF double-submit.
- [web-state.md](./components/web-state.md) — `context/`, `hooks/`, `lib/api/`, `types/`, `lib/ticketStatus.ts`: SWR data layer + canonical presentation. **Pages use hooks, never `lib/api/` directly.**
- [web-realtime.md](./components/web-realtime.md) — `components/providers/RealtimeProvider.tsx` + `hooks/useRealtimeSync.ts`: the single `EventSource` → SWR `globalMutate` matcher bridge.
- [web-pages-components.md](./components/web-pages-components.md) — `(dashboard)/*` pages + `components/` (ui, dashboard, zones, tickets, providers): feature pages and props-only building blocks.

### Mobile app (`App/`)
- [mobile-shell.md](./components/mobile-shell.md) — `app/`, `context/AppContext.tsx`, `services/api.ts`, `hooks/`, `lib/`, `constants/`: Expo shell. **Uses React Query 5 (not SWR).** Persisted cache, Bearer auth, `react-native-sse` real-time.

### Cross-cutting
- [db-schema.md](./components/db-schema.md) — `docs/migrations/` + Supabase: tables referenced in code, the 5 hand-applied SQL migrations, RLS/app-layer role agreement.
- [infra-config.md](./components/infra-config.md) — Root configs, env files, launch order, dependency pins, `.mcp.json`, type-check/test commands.

---

## Navigation rules (for future sessions)

- **Before editing a component**: read its page here first.
- **After editing**: update that page (and any pages it now affects), re-check rule-of-3, update orphans if references changed, append a `log.md` entry.
- **When asked "what touches X"**: answer from the dependency sections of the relevant pages before re-searching the repo.
- **When starting servers**: API → Web → App (in order). Optionally run `ngrok http 8000` for mobile Google OAuth (HTTPS callback required — see `docs/NGROK_GOOGLE_SIGNIN_GUIDE.md`).
- See `CLAUDE.md` (repo root) for the map-of-the-map policy.
