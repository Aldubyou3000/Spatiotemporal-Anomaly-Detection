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
- `/api/*` **skipped entirely** (`pathname.startsWith("/api/") → NextResponse.next()`) — API is proxied via `next.config.ts:45` rewrites; FastAPI does auth/CSRF itself (`get_current_user`, `_require_csrf`). Skipping avoids the stale redirect→405 that broke login.
- `PUBLIC_PATHS = ["/login"]` — always allowed.
- No `access_token` cookie → redirect to `/login` (pages only).

Note: in deployed Vercel `vercel.app/api/*` is same-origin (first-party) so `Lax` cookies are sent; direct `onrender.com` fallback for zones 4-file uses `Bearer`.

## Depends on
- `context/AuthContext.tsx`, `context/ZonesContext.tsx`
- `components/providers/RealtimeProvider.tsx`
- `components/ui/Toast.tsx` (ToastProvider)
- `components/dashboard/Sidebar.tsx`, `PageTransition.tsx`
- `swr`

## Depends on it (reverse)
- All `(dashboard)/*` page components render inside this layout.
- `middleware.ts` is invoked by the Next.js runtime.

Spacing primitives (2026-10-25): globals.css defines stable --space-1/2/4/6/8 values of 4/8/16/24/32px. Zones workspace, FileUpload and PipelineDiagram use them for a consistent spacing scale across setup, processing, configuration dialog and gallery. Existing --pad-*, --gap-* and --row-h density behavior for other consumers remains; the new primitives themselves do not vary by density or theme. Reference: [Carbon spacing](https://www.carbondesignsystem.com/building-blocks/foundations/spacing/overview).

## Key invariants
- `/ui-library` and `/ui-library/preview` are standalone development-only routes with server notFound guards. Middleware bypasses auth only for those development paths; the real dashboard remains protected. The editor never mounts AuthProvider/RealtimeProvider/ZonesProvider. Its same-origin preview frame uses fixture contexts and an independent cache; see docs/UI_LIBRARY.md and web-pages-components.md.
- Next headers allow SAMEORIGIN framing only for the exact development preview route. Production and other pages keep DENY / frame-ancestors none.
- Provider order is load-bearing. Changing it can break real-time (RealtimeProvider outside SWRConfig) or auth gating (AuthProvider must be outermost so context is available to all descendants).
- `globals.css` is the single source for the design system — never hardcode colors/sizes. Density via `data-density` on `<html>`. See CLAUDE.md "CSS design system" for the token groups and shared utility classes.

## Open questions / debt
- The shell uses `overflow: hidden` on the root flex container — portal dropdowns inside the ticket detail panel must render via `createPortal(..., document.body)` with `position: fixed`. Established pattern in `ReviewPanel.tsx` (`AddTechPicker`) and `TicketActionDock.tsx`. Easy to get wrong when adding a new dropdown.

## History route (2026-10-25)
Added protected /history, /history/[id] and /history/[id]/results pages and a History sidebar item. Existing dashboard providers/auth middleware cover them. Tickets wraps its search-param consumer in Suspense for direct links from History. No additional provider was added.

## Save controller (2026-10-25)
One RunSaveController is mounted inside ToastProvider, reusing ZonesContext state. It guards unsaved internal anchor navigation and coordinates save/discard modals across dashboard routes. No second context/provider or transport was introduced.

## Compact page chrome (2026-10-25)
The shared Header renders only its sticky topbar, with an h1 styled as the existing breadcrumb title, optional page actions and theme/account controls. Removed the separate title/description strip on every dashboard page. New Technician and audit Export stay available in the topbar; the layout/provider stack is unchanged.

## Flat surface theme (2026-10-25)
The shell now uses a plain tinted canvas, including Sidebar/Header, with separate white work surfaces in light mode and clearer surface levels in dark mode. Removed the decorative grid and translucent header blur. Shared elevation tokens are none; buttons, docks, dialogs and lightbox no longer add raw decorative shadows. Keyboard focus uses a visible brand outline instead of a shadow ring; autofill inset painting is retained for browser color correction. `web/tests/surface-theme.test.cjs` checks canvas separation, normal/supporting text contrast and disabled elevation in both themes. Provider/auth behavior is unchanged.

Line reduction (2026-10-25): removed the Sidebar footer divider and the account-menu heading divider; shared tabs retain only the active underline rather than a full-width baseline. Keyboard outlines, floating menu edges and control boundaries remain. Structural grouping uses surfaces and spacing; no global border-token suppression.

Navigation/content separation (2026-10-25): dashboard main now uses `dashboard-workspace`, an inset rounded work surface beside the pale navigation canvas, inspired by the supplied Gmail reference. Header shares the work surface. Below 768px the workspace removes its margin/corners for usable mobile width. PageTransition/provider order and scrolling stay intact. The UI Library shell specimen uses the same class. Light-mode brand-soft is stronger, and input/textarea placeholders use readable muted text at full opacity.

Background-color reservation (2026-10-25): light-mode --bg/--bg-app remain blue-gray exclusively for the shell/preview canvas. Content --surface is white; --surface-alt, --surface-sunken and --surface-muted are neutral gray, so content fields, queues, toolbars and metadata no longer resemble the shell background. Brand action/selection colors remain separate. Existing theme contrast checks pass.

Scrollbar styling (2026-10-25): shared CSS uses a 12px lane with an 8px visible rounded thumb, transparent track/corner, inset track ends and shorter visible thumb ends. WebKit scrollbar buttons are hidden at zero size. Standard scrollbar properties reset to auto inside the supported-part selector so Chromium actually applies the custom parts; other browsers use native-width colored scrollbars. Thumb length remains proportional to content; no custom scrolling logic. Size/insets use shared --scrollbar-* tokens and existing theme text colors. Review-specific thin overrides are removed.

Header surface composition (2026-10-25): Header accepts an optional background, defaulting to --surface for existing callers. Tickets passes --surface-alt to match its neutral split-view parent, avoiding a white header strip above the gray gutter.

Google reference color (2026-10-25; supersedes neutral alt background above): sampled the supplied screenshot's pale background as #F8FAFD and applied it to light --surface-alt. The shell remains #E9EEF6 and panels stay white. Shared content backdrops, including Tickets and result tabs, inherit the exact reference tone; sunken control surfaces remain neutral gray.

Header leading navigation (2026-10-25): optional leading content renders before the Workspace breadcrumb, vertically centered without changing existing callers. Saved History results uses it for the Run summary link.

Contextual history breadcrumb (2026-10-25): Header also accepts a parent node, retaining Workspace by default. Saved-run summary/results pass a clickable History parent and the opened run title; the current heading exposes aria-current and its full title when truncated. The results leading link is now an arrow-only button with an accessible Back to run summary label.

Scrollbar color refinement (2026-10-25): dedicated --scrollbar-thumb/--scrollbar-thumb-hover tokens use softer neutral grays in light/dark themes instead of text colors. Both native fallback and custom parts use them. Scrollbar geometry is unchanged per the user's clarification.

Saved-results overflow ownership (2026-10-25): only the History saved-results page uses a flex/overflow-hidden page class; other History pages retain scrolling. Its header remains outside the flexible results body. See web-pages-components.md for nested viewport sizing and table-dialog behavior; provider/layout order is unchanged.

Zones viewport composition (2026-10-25): Zones now also uses constrained flex sizing and fitViewport results. Its page-scoped Header styling wraps compact actions when needed and keeps the header below modal layers; other pages retain their Header defaults. Setup/processing/dialog bodies can scroll internally, while the result workspace has no outer page scroller. Global providers/save controller remain unchanged.

Neutral pearl colors (2026-10-26; supersedes Google reference values): light --bg/--bg-app use #E8EAED, --surface-alt #F1F3F5, --surface #FFFFFF, --surface-sunken/--brand-softer #F6F7F9. Shared text and borders are neutral grays. Selected fills use stronger #C7DAF7 with #123E75 foreground; primary brand/status colors remain. User requested colors only: no selection marker, layout, geometry, shadow, behavior or dark-theme edits. Existing consumers and default UI Library previews inherit the shared tokens. Four light/dark contrast/surface checks and CSS parsing passed; live browser appearance was not checked.

Nested surface sequence (2026-10-26): dashboard-workspace and Header's default background now use --surface-alt, matching the Tickets reference's lighter workspace inside the --bg shell. Content panes retain --surface. Explicit Header backgrounds remain supported. Shared default ownership covers dashboard pages and the UI Library shell without page-specific patches. This changes background assignments only; no dimensions, scrolling, highlights or markup changed. History's inbox explicitly uses --surface so its saved-run list stays white on the lighter parent. Theme values themselves are unchanged.

Sidebar icons and toggle geometry (2026-10-26): navigation now uses installed Lucide Layers2/Clock3/Inbox/UserRound/FileCheck2 at 20px with a consistent 2.5 stroke; collapse/expand uses simple 18px chevrons. Collapsed rail is 64px with 40px icon buttons, expanded width stays 248px. Both branches render the original SentinelMark at 36px in a 40px brand row with matching x/y anchoring. Fixed-width inner layouts prevent the collapsed logo recentering through the animated outer width. Collapsed links and the expand button now have accessible names; current routes expose aria-current in both modes. Large Overview metric icons and brand geometry are untouched. TypeScript, 26 gallery checks and an assert-based SSR check of both modes passed; live transition playback remains unverified.

## Shared navigation canvas (2026-10-26)
Header now defaults to --bg, matching Sidebar. dashboard-workspace is the unrounded shell canvas; dashboard-content owns the rounded --surface-alt work area below Header. All dashboard page bodies and the UI Library shell specimen use this class. Tickets no longer overrides the header/outer page to a content color. Existing action handlers, provider order and per-page overflow rules remain intact. Mobile keeps edge-to-edge content.

Navigation alignment correction (2026-10-26): removed dashboard-workspace's leftover top margin after separating Header from the content surface. The 62px Header now starts at the same top edge as Sidebar, aligning its center with the sidebar brand row instead of sitting one gap-card lower. Side/bottom gutters, content corners and mobile rules remain. Shared shell specimen inherits the correction.


Search focus ownership (2026-10-26): globals.css data-search-field rule gives the full control one inset focus outline and suppresses nested input outlines despite the global important focus rule. Other controls retain normal focus behavior.


Map visual hierarchy (2026-10-26): globals.css scopes a light-theme filter to .station-map .leaflet-tile-pane, with neutral station-label styling. Dark tiles and marker/status colors remain unfiltered.


Basemap style instead of color filter (2026-10-26): removed the station-map tile-pane saturation filter. StationMap now requests a simpler colored light basemap; station label CSS remains shared.
