# Component: Mobile app shell & data (`App/app/`, `App/context/`, `App/services/`, `App/hooks/`, `App/lib/`, `App/constants/`)

The Expo 55 (pinned) field-technician app. **Uses TanStack React Query 5 — not SWR** (the web app uses SWR; do not assume parity). File-based routing via Expo Router; screens under `app/`, tabs under `app/(tabs)/`.

## Structure
```
app/
├── _layout.tsx              Root: PersistQueryClientProvider → AppProvider → AppRoot (login gate)
├── (tabs)/
│   ├── _layout.tsx          Tab bar
│   ├── index.tsx            Dashboard (assigned tickets)
│   ├── activity.tsx         Technician's own audit feed
│   └── profile.tsx          Profile + theme + logout
├── ticket/[id].tsx          Ticket detail (slide-from-right)
├── report.tsx               Inspection report submission (fade)
├── oauth-callback.tsx       Deep-link landing (invisible; tokens captured in api.ts)
├── +html.tsx, +not-found.tsx
context/AppContext.tsx       Auth, theme, profile; mounts useRealtimeSync
services/api.ts              All /api/mobile/* calls; SecureStore (native) / localStorage (web); auto-refresh
hooks/                       useTickets, useRealtimeSync, useActivitySeen, useUnseenActivity, useTheme, useReducedMotion
lib/                         queryClient, persistedQueryClient, activitySeen, tourTargets, tutorialSeen
constants/                   Colors, Motion, activityEvents, icons, tabBar, theme, ticketStatus, tourSteps
components/                  19 RN components (Button, Card, BottomSheet, TicketDetailSheet, SpotlightTour, …)
```

## Data layer (React Query, persisted)
- `lib/queryClient.ts`: `staleTime: 30s`, `gcTime: 5 min`, **`retry: false`** (so 401 surfaces immediately → login screen), `refetchOnWindowFocus: false`.
- `lib/persistedQueryClient.ts` + `app/_layout.tsx`: `PersistQueryClientProvider` with `maxAge` = 7 days (matches refresh-token lifetime). **Persists only two keys to disk**: `['/api/mobile/tickets']` (list) and `['/api/mobile/activity']`. Detail/report/photo/attachment queries are memory-only → fast cold start, small AsyncStorage.
- Query keys are arrays mirroring URL paths: `['/api/mobile/tickets']`, `['/api/mobile/tickets', id]`, nested sub-resources (`report`, `attachments`, `photos`) under the ticket prefix so one prefix-invalidation refreshes list + all open details.

## Auth & API client (`services/api.ts`)
- `EXPO_PUBLIC_API_URL` → `API_URL`. Loud-fails if a native build points at `localhost` (unreachable from a device).
- Tokens: `SecureStore` (native) / `localStorage` (web). Every request sends `Authorization: Bearer <access>`.
- Auto-refresh on 401 with single-flight, retry once. Parallel strategy to `web/src/lib/api/client.ts` (cookie vs Bearer — see [shared-candidates.md](../shared-candidates.md) §3).
- Google OAuth: opens `WebBrowser.openAuthSessionAsync`; the `spatiotemporal://` deep link returns tokens, captured here. Requires a real dev/prod build (Expo Go can't register the scheme) and HTTPS-reachable API.

## Real-time (`hooks/useRealtimeSync.ts`)
- Opens ONE `react-native-sse` connection to `GET /api/mobile/events` (Bearer in `Authorization` header — never in URL). Calls `onNudge()` on each content-free signal.
- On 401/403: refresh + reconnect. On foreground (`AppState` active): treat as a nudge.
- **Web is a no-op** — browser `EventSource` can't set headers and tokens never go in URLs; web falls back to focus + AppState refetch.
- Mounted once via `AppContext`.

## Activity / unseen-state
- `hooks/useActivitySeen.ts` + `lib/activitySeen.ts`: tracks last-seen timestamp for the activity feed.
- `hooks/useUnseenActivity.ts`: drives the activity-tab badge count.
- `constants/activityEvents.ts`: which audit events show up in the technician's feed.

## Presentation constants
- `constants/ticketStatus.ts`: mobile's single source of truth for status labels/colors/icons. **Mirrors `web/src/lib/ticketStatus.ts`** (explicitly so — the docstring says it replaced drifted local maps). See [shared-candidates.md](../shared-candidates.md) §4.
- `constants/theme.ts`: `palette`, `getTheme(isDarkMode)`, `lightStatus`/`StatusHues`.
- `constants/Motion.ts`: `duration`, `ease`, `spring`, `stagger` — shared animation tokens.
- `constants/tourSteps.ts`, `lib/tourTargets.ts`, `lib/tutorialSeen.ts`: spotlight onboarding tour.

## Depends on
- `@tanstack/react-query`, `@tanstack/react-query-persist-client`, `@tanstack/query-async-storage-persister`
- `expo-router`, `expo-secure-store`, `expo-web-browser`, `expo-linking`, `expo-file-system`, `expo-image-picker`, `expo-print`, `react-native-sse`, `react-native-reanimated`, `react-native-gesture-handler`
- Backend `/api/mobile/*` (see [api-mobile.md](./api-mobile.md))

## Depends on it (reverse)
- Screens are route leaves. `AppContext` is the only global store; everything else reads from it or React Query.

## Key invariants
- **Expo v55.0.26 pinned** — do not upgrade to v56+ (documented breaking changes).
- **Persistence scope is fixed** at two list keys. Adding a third persisted key bloats AsyncStorage and slows cold start — confirm it's worth it before extending `shouldDehydrateQuery`.
- **Query keys nest under the ticket prefix** for one-shot invalidation. A flat key would force per-query refetches.
- **Web platform is a fallback** — real-time is no-op there; password login works in Expo Go but Google OAuth doesn't.

## Open questions / debt
- 19 components live in one flat `components/` dir. No subfolders yet — split when a clear domain grouping emerges (e.g. `components/tickets/`).
- `package.json` `name` is `"parongs"` (likely a dev handle) — harmless but worth knowing.
- `gitignore.txt` exists alongside `.gitignore` (App/) — the `.txt` variant may be stale.
