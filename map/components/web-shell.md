# Component: Web shell & layout (`web/src/app/`, `web/src/middleware.ts`)

The Next.js 15 App Router entry surface: route groups, the dashboard shell, and the cookie-based route guard. Everything analysts see flows through this skeleton.

## Structure
```
app/
├── layout.tsx                 Root layout (ThemeProvider)
├── page.tsx                   Redirects to /zones or /login
├── globals.css                CSS design system — all tokens live here
├── (auth)/login/page.tsx      Login (plain centered layout)
├── (auth)/layout.tsx
└── (dashboard)/
    ├── layout.tsx             Provider stack + shell (the key file)
    ├── zones/page.tsx
    ├── tickets/page.tsx
    ├── reports/page.tsx
    ├── technicians/page.tsx
    └── audit/page.tsx
```

Route groups `(auth)` and `(dashboard)` apply different layouts without adding URL segments.

## Dashboard layout provider stack (`app/(dashboard)/layout.tsx`)
Order matters — outer wraps inner:

```
AuthProvider → ZonesProvider → SWRConfig → RealtimeProvider → ToastProvider → shell
```

- `SWRConfig` global defaults: `revalidateOnFocus: false`, `keepPreviousData: true`, `revalidateIfStale: true`, `dedupingInterval: 4000`, `errorRetryCount: 3`. **Never block UI on `isValidating`** — `isLoading` (first load, no cache) drives skeletons; `isValidating` only spins the Refresh icon.
- `RealtimeProvider` must be inside `SWRConfig` (it calls `globalMutate`).
- `ZonesProvider` holds **local pipeline state, not server data** — do not replace with SWR.

## Middleware (`web/src/middleware.ts`)
Cookie-based route guard invoked by Next.js by file location (no inbound code import):
- `PUBLIC_PATHS = ["/login"]` — always allowed.
- No `access_token` cookie → redirect to `/login`.
- CSRF double-submit check for mutating methods (`POST`/`PATCH`/`DELETE`/`PUT`) on `/api/*` paths — except `/api/auth/login` and `/api/mobile/auth/login` (no prior session). Header `X-CSRF-Token` must equal `csrf_token` cookie.
- Note: only applies to same-origin API routes proxied through Next.js; direct-to-backend calls (`:8000`) are validated by FastAPI's `_require_csrf` instead.

## Depends on
- `context/AuthContext.tsx`, `context/ZonesContext.tsx`
- `components/providers/RealtimeProvider.tsx`
- `components/ui/Toast.tsx` (ToastProvider)
- `components/dashboard/Sidebar.tsx`, `PageTransition.tsx`
- `swr`

## Depends on it (reverse)
- All `(dashboard)/*` page components render inside this layout.
- `middleware.ts` is invoked by the Next.js runtime.

## Key invariants
- Provider order is load-bearing. Changing it can break real-time (RealtimeProvider outside SWRConfig) or auth gating (AuthProvider must be outermost so context is available to all descendants).
- `globals.css` is the single source for the design system — never hardcode colors/sizes. Density via `data-density` on `<html>`. See CLAUDE.md "CSS design system" for the token groups and shared utility classes.

## Open questions / debt
- The shell uses `overflow: hidden` on the root flex container — portal dropdowns inside the ticket detail panel must render via `createPortal(..., document.body)` with `position: fixed`. Established pattern in `ReviewPanel.tsx` (`AddTechPicker`) and `TicketActionDock.tsx`. Easy to get wrong when adding a new dropdown.
