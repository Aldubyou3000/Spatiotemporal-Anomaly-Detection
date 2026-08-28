# Map Session Log

Append-only. One entry per mapping session. Format:

```
## [YYYY-MM-DD] <action> | <what>
```

Where `<action>` ∈ `created` | `updated` | `linted` | `queried` | `refactored`.

Recent activity:

```bash
grep "^## \[" map/log.md | tail -5
```

---

## [2026-07-06] created | Initial map build from full codebase scan

Walked `api/`, `web/`, `App/`, `docs/` and root config. Wrote overview + 14 component pages (api: main, core, auth, zones, tickets, reports, technicians, audit, realtime, mobile; web: shell, state, pages, components; mobile: shell; cross: db-schema, infra-config). Surfaced 4 rule-of-3 candidates (signed-url helper, IP extraction, token-refresh strategy, ticket-status labels). Flagged orphans: dead `start.sh`/`Procfile` referencing nonexistent `prototypes/`, stray `api/=4.0.0` file, `uvicorn.log`, empty `test.md`, `debug_tickets.py` scratch script. Noted doc/repo drift: `prototypes/` described as source of truth but absent from `main`. Noted data-layer asymmetry: web uses SWR, mobile uses React Query (docs only mention SWR). Updated CLAUDE.md with a map-navigation header.

## [2026-08-21] updated | Stale references cleanup + zone source-of-truth fix

Deleted `Procfile` (referenced non-existent `prototypes/streamlit_app.py`). Updated 6 map pages: removed `Procfile` from orphans (now resolved), updated `start.sh` to single stale entry, fixed `overview.md` and `api-zones.md` to declare `api/app/zones/` as canonical source of truth (no other copy exists), updated `infra-config.md` root files table, added resolved entries for `Procfile` and `prototypes/` to `orphans.md`. Verified all 17 component pages against current codebase — no missing files or new components discovered. All routers, services, schemas, hooks, pages, and components match their map entries.
## [2026-08-21] updated | Header text-size picker: M is now a hard default — removed localStorage persistence (ui-text-size) from Header.tsx and the layout.tsx no-flash bootstrap; picker still works per-session, every load resets to M (globals.css root tokens).
## [2026-08-21] updated | Header text-size picker hidden behind SHOW_TEXT_SIZE_PICKER=false in Header.tsx (buggy per user report); code kept + type-checked, UI pinned to M via globals.css root tokens; comment block explains restore path for future AI models.
## [2026-08-28] deployed | Vercel Hobby proxy + Render Free live — fix CSP (allow unsafe-inline), SameSite Partitioned→Lax first-party via vercel.app/api/* rewrite, middleware skip /api/*, zones 4-file direct Bearer bypass (25-45s LOF on 0.1 CPU), zone_c ANOMALY_THRESHOLD 1.5→2.0, tiles OSM/Esri free, StationMap flagged 10px+dual halo+red labels, push bf810a8
## [2026-08-28] updated | Map refresh — overview, api-core/auth/zones, web-shell/state/pages, infra-config, shared-candidates (apiBase dup), orphans (GoogleIcon/Select resolved) for deployed state
