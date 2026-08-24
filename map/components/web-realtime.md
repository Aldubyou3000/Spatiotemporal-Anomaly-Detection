# Component: Web real-time (`web/src/components/providers/RealtimeProvider.tsx`, `web/src/hooks/useRealtimeSync.ts`)

The browser half of the SSE contract. Mounts exactly one `EventSource` to `GET /api/events` inside the dashboard layout and translates incoming signals into SWR cache revalidations. See [api-realtime.md](./api-realtime.md) for the backend half.

## What it does
- `RealtimeProvider` is mounted **once**, inside `SWRConfig`, in `app/(dashboard)/layout.tsx`.
- `useRealtimeSync` opens the `EventSource` (cookie auth, `withCredentials`), parses each `{resource, action, id, ts}` signal, and calls SWR's `globalMutate` with a **key matcher** that revalidates matching cache keys via the normal authenticated fetch path.
- Resource → key matchers mirror SWR key conventions:
  - `tickets` → any key with `key[0] === "/api/tickets"`
  - `reports`, `technicians`, `audit` → analogous matchers
- The `audit` resource is debounced ~1.5s client-side to absorb bursts (the Audit page revalidates once after a batch, not once per row).

## Depends on
- `swr` (`globalMutate`, `useSWRConfig`)
- Browser `EventSource` API
- Backend `GET /api/events` (cookie auth)

## Depends on it (reverse)
- Every SWR hook benefits transitively — no hook imports this directly. The provider is the only mount point.
- `app/(dashboard)/layout.tsx` mounts the provider.

## Key invariants (do not break)
- **One EventSource.** Mounting a second one (e.g. per-page) doubles the connection and the revalidation work. The provider must be at the layout level, not the page level.
- **Matchers mirror cache keys.** Adding a new live resource on the backend (`_AUDIT_RESOURCE_MAP`) without a matching client matcher means the signal fires but nothing happens. There is no compile-time check — PR review must cover both sides.
- Signals are advisory — the browser re-fetches real data over the authenticated path. The SSE stream itself carries no business data, so even a fully compromised stream can't leak rows the analyst couldn't already fetch.
- The browser **never** talks to Supabase. The EventSource connects only to FastAPI.

## Open questions / debt
- Reconnection behavior relies on the browser's default `EventSource` retry. If the API is down, the dashboard silently goes stale until reconnect. No user-visible "disconnected" indicator exists.
- Only the `audit` resource is debounced. A sustained burst of ticket mutations would revalidate ticket lists on every signal.
