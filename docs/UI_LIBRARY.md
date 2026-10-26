# Local UI Library

Start the website with `cd web` then `npm run dev`. Open **http://localhost:3000/ui-library**. The design playground does not require the API or an analyst login.

## Designing

- Browse all components together or search/select one in the left navigation.
- Use **Shared theme** for colors, typeface, text scale, corners, spacing and density. Light and dark colors are edited separately.
- Use **Component** to override the selected component's background, text/border color, height, padding, corners or text size. Shared primitives (Button, Input, Select, Badge, Card and Tab) update everywhere they appear in the preview, including composed interfaces. Reset removes these overrides.
- The desktop, tablet and mobile controls change the preview frame's viewport. If a chosen canvas is wider than the available space, scroll the canvas horizontally.
- Dropdowns, modals, toasts, file selection, tables and review/Undo use the existing website components. Workflow examples use synthetic data and local callbacks/responses. Map tiles still need an internet connection. Choosing a CSV keeps it in browser memory; it is not uploaded.
- Drafts are stored under `aws-sentinel-ui-library-v1` in this browser. Refresh restores the design. **Reset current styles** resets the selected component in Component mode; in Shared theme mode it resets the full draft. The preview sidebar uses its own `aws-sentinel-ui-library-sidebar` preference.

The preview is isolated in a same-origin frame. Draft styles do not change the operational website or source defaults. This is a local designing tool; there is no publish/deploy step. Nonvisual workflow controllers are documented with the visual components they orchestrate instead of running navigation or authentication flows.

The default theme uses a plain tinted canvas, contrasting work surfaces and dividers instead of elevation shadows. The all-components gallery shares one work surface; selected specimens preview directly on the canvas. Existing saved color overrides still apply: reset the full draft in Shared theme to see the current website defaults.

Panel outlines and repeated section rules are intentionally minimized. Borders remain for controls, floating menus, data rows and useful state cues; spacing and surface colors separate most sections.

## Development boundaries

- Both `/ui-library` and `/ui-library/preview` call `notFound()` outside development. Only those development paths bypass the dashboard cookie guard.
- The exact preview route has development-only SAMEORIGIN / `frame-ancestors 'self'` response headers. Other routes and production retain the normal frame protection.
- The preview substitutes fixture data for SWR fetchers. Its fetch boundary handles only explicit sample ticket endpoints locally and rejects all other `/api/` requests, including requests to the configured external API URL. Preview links do not navigate away.
- Settings restoration and generated CSS accept only known component keys, allowed properties, bounded numbers, known typefaces and six-digit hex colors. No arbitrary CSS or code is accepted.
- The catalogue lists source paths for every existing visual component module in `ui/`, `dashboard/`, `history/`, `zones/` and `tickets/`. Add new visual components to `components/design/library.ts` and their live specimen to `Specimens.tsx`; the inventory test flags omissions.

## Checks

From `web/`:

```powershell
node node_modules/typescript/bin/tsc --noEmit
node tests/ui-library.test.cjs
node tests/ui-library-render.test.cjs
node tests/history-render.test.cjs
node tests/station-review.test.cjs
node tests/surface-theme.test.cjs
```

The render checks exercise real components with fixture data but do not replace a hydrated browser check. Recharts emits expected dimension warnings when server-rendered without a viewport.
