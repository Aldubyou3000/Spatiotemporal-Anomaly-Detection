# Component: Web state & data (`web/src/context/`, `web/src/hooks/`, `web/src/lib/api/`, `web/src/types/`, `web/src/lib/`)

The data layer for the analyst dashboard: React Context for cross-navigation state, **SWR** for all server data, raw fetch wrappers under `lib/api/`, and the canonical presentation modules. Layer rule: **pages call hooks, never `lib/api/` directly**.

## Context providers (`web/src/context/`)
| Context | Holds | Notes |
|---------|-------|-------|
| `AuthContext.tsx` | `user`, `loading`, `logout()` — redirects to `/login` on failure | Outermost in dashboard layout |
| `ThemeContext.tsx` | `theme`, `setTheme()` — persisted to `localStorage`, written to `data-theme` on `<html>` | |
| `ZonesContext.tsx` | All pipeline state: `file`, `contamination`, `running`, `progress`, `activeStage`, `result`, `error`, `configOpen`, `resetSession()` | **Local computation, not server data** — do not SWR-ify |

## SWR hooks (`web/src/hooks/`)
One file per domain. Cache keys are the contract — matchers in `useRealtimeSync` mirror them.

| Hook file | Exports | Key conventions |
|-----------|---------|-----------------|
| `useTickets.ts` | `useTicketList`, `useTicketDetail`, `useTicketReport`, `useTicketAttachments`, `invalidateTicketLists` | List key `/api/tickets`; detail `/api/tickets/{id}`; etc. |
| `useTechnicians.ts` | `useTicketTechnicians` (summary, **shared key** across Tickets + Zones), `useTechnicianProfiles` (full, Technicians page) | |
| `useReports.ts` | `useReports` (incl. `optimisticApprove`) | |
| `useAuditLogs.ts` | `useAuditLogs` (paginated), `useAuditStats` | |
| `useRealtimeSync.ts` | Mounts the single `EventSource` → `globalMutate(keyMatcher)` | See [web-realtime.md](./web-realtime.md) |

Mutation pattern: call API directly → `mutate()` or `invalidateTicketLists()` → no manual `setState` for server data.

## Raw fetch wrappers (`web/src/lib/api/`)
One file per domain (`auth`, `zones`, `tickets`, `reports`, `technicians`, `audit`), **all through `client.ts`**:
- `client.ts` — base fetch: `credentials: "include"`, sends `X-CSRF-Token` from the `csrf_token` cookie on mutations, **silent refresh on 401** (single-flight, retry once), then throws. Parallel to `App/services/api.ts` on mobile (cookie vs Bearer — see [shared-candidates.md](../shared-candidates.md) §3).
- `cn.ts` — classname joiner.

## Types (`web/src/types/`)
TypeScript interfaces mirroring backend Pydantic schemas (`auth`, `tickets`, `reports`, `technicians`, `zones`). Shared across components, hooks, and api.

## Canonical presentation (`web/src/lib/`)
| File | Role |
|------|------|
| `ticketStatus.ts` | **Single source of truth** for ticket status/priority labels, badge tones, sort order, `TERMINAL`/`NEEDS_REVIEW` sets. Import from here, never re-declare inline. Parallel exists at `App/constants/ticketStatus.ts` (see [shared-candidates.md](../shared-candidates.md) §4). |
| `csv.ts` | CSV helpers (likely for client-side preview/parse). |
| `technicianWorkload.ts` | Workload signal computation for badges. |

## Depends on
- `swr`
- Backend `/api/*` endpoints (each hook maps to one domain router)
- `components/providers/RealtimeProvider` (consumes `useRealtimeSync`)

## Depends on it (reverse)
- Every `(dashboard)` page composes hooks + components from these modules.
- `lib/ticketStatus.ts` is imported by the Tickets page, Reports page, and `TicketDetailBody`/`TicketActionDock`.

## Key invariants
- **Pages use hooks, not `lib/api/`.** Bypassing hooks breaks real-time (the SSE matcher won't know the cache key) and optimistic update patterns.
- **Cache keys are the real-time contract.** Adding a new SWR key requires a matching matcher in `useRealtimeSync.ts` or live updates silently miss it.
- `useTicketTechnicians` deliberately shares one SWR key across the Tickets and Zones pages — don't fork the key or the workload badges on Zones and the assignment dropdown on Tickets will disagree.

## Open questions / debt
- `useRealtimeSync` debounces the `audit` resource ~1.5s client-side to absorb bursts. Other resources are not debounced — a rapid burst of ticket updates could trigger many revalidations. Currently fine given low concurrency.
