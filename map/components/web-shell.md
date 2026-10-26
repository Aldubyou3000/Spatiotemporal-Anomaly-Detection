# Component: Web shell & layout (`web/src/app/`, `web/src/middleware.ts`)

Sidebar hierarchy refinement (2026-10-26): navigation labels use --font-xs (14px) and both modes use 18px icons instead of 20px. The 44px logo, 16px bold app name, matching icon/text colors and existing row hit areas remain unchanged. This makes navigation visually subordinate to branding without reducing click targets.

Sidebar proportions and icon color (2026-10-26): both sidebar modes now render the original mark at 44px wide (previously 36px), preserving its aspect ratio and the 40px brand row. Expanded nav icons inherit their label color; collapsed icons use the same primary/selected text tokens. Hover resets and chevrons also use primary text rather than muted gray. Existing navigation, status badges and sidebar dimensions remain intact.

Sidebar label cleanup (2026-10-26): removed the expanded sidebar's Workspace section label at user request. Navigation follows the brand row directly; links, branding and collapse behavior are unchanged.

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
- The development-only UI Library and preview routes were removed on 2026-10-27. Middleware has no library auth bypass; `/login` and backend-authenticated `/api/*` retain their existing handling.
- Every page uses DENY / frame-ancestors none in development and production; there is no preview framing exception.
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


Zones-ready navigation (2026-10-26): private WorkspaceSidebar reads the existing ZonesContext inside dashboard providers and passes resultsReady = result present and not running to Sidebar. Expanded Zones shows a shared success Badge (Ready); collapsed Zones uses a success dot with an explicit accessible/tooltip label. Reset/rerun hides it; tab navigation retains it. UI Library shell supplies the prop as fixture data without mounting operational providers.


Shared field chrome (2026-10-26): globals.css owns neutral surface-sunken fill, 34px height, r-md corners, border, spacing and a single focus outline for data-search-field/data-filter-field. Nested inputs are transparent and do not draw duplicate outlines. Page CSS owns placement/width only.


Shared table heading primitive (2026-10-26): globals.css .table-heading supplies neutral surface, consistent height, readable labels and one boundary for semantic tr headers and grid/flex list headers. Child th inherit typography with column-aligned insets; DataTable overrides only its existing narrower cell padding.


History detail canvas (2026-10-26): existing dashboard-content surface is applied to the full workspace instead of the width-limited content column. Shared Header/sidebar tokens and other pages remain unchanged.


Back-button refinement (2026-10-26): topbar-btn--back removes boxed borders, uses a 36px circular hit area and stronger neutral icon with subtle surface hover. Header leading gap reduces to space-2 when navigation is present; ordinary headers retain space-4. Summary/results back links use the modifier, preserving accessible names and targets.

## Approved Roboto typography (2026-10-26)
Root layout now loads Roboto 400/500/600/700 through next/font/google and retains JetBrains Mono for actual code. Removed Geist, unused Fraunces and .font-display. globals.css owns --font-ui and a rem scale: 16px body/control, 14px supporting, 18/20px headings, 28px metrics at default browser sizing. Density changes spacing only. Secondary/muted/tertiary roles are stronger in both themes; --brand-text is separate from filled brand backgrounds. Shared controls grow with text; logo geometry and neutral pearl surfaces stay intact. Login scopes its fixed light/dark panels to corresponding themes for readable captions, placeholders and autofill. TypeScript/contrast/component checks passed. Initial production build completed; final build compiled/typechecked but page-data collection reported missing generated route modules (both files existed afterward). Cause unconfirmed; process inspection denied. Live browser/zoom appearance remains unverified because UI automation ended on URL-policy confidence; no more UI inputs were attempted.

Sidebar text refinement (2026-10-26): expanded navigation labels, Workspace label and brand subtitle now use the primary --text role instead of secondary/muted gray. The inactive hover reset uses the same primary role. Active blue text/fill, Ready status, icon colors and geometry retain their existing styling; dark mode inherits its primary text token. No new primitive or orphan reference.

Map glow styling (2026-10-26): globals.css adds scoped station-map-halo keyframes and local --map-glow-blur/duration values. Only halo opacity/filter animate; the existing Leaflet transition/zoom suppression remains. Reduced-motion disables the decorative pulse while retaining the halo.


Sidebar branding cleanup (2026-10-26): expanded brand row retains SentinelMark and AWS Sentinel, removing the Anomaly detector subtitle. Collapsed sidebar retains its logo and descriptive tooltip. Workspace section label remains removed; geometry/navigation/status/collapse behavior stays intact.


Tickets dock cleanup (2026-10-26): removed unused dock-nudge/review-pulse/dock-ping/avatar-pop keyframes and dock-handle/arrow/icon selectors after the shared dock stopped using decorative attention animations. Global entrance, spinner and station-map-glow animations remain. Ticket-only selection is scoped in Tickets.module.css; global list-row styling is retained for other consumers.

Sidebar logo anchoring (2026-10-27): expanded and collapsed logo slots are both 44 by 40px at a fixed 12px left/top inset. Removed expanded-only 2px row padding; collapsed brand uses a fixed left inset rather than centering in a differently sized slot. Toggle/navigation/tooltips and logo geometry retained.

Sidebar toggle icons (2026-10-27): replaced lone chevrons with existing Lucide PanelLeftOpen/PanelLeftClose icons and matching native title hints. Existing button geometry, accessible labels and collapse state remain intact.
