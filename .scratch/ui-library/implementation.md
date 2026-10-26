# Local UI Library Implementation Plan

> Execute inline in this checkout. The user's `implement` instruction supersedes the earlier planning-only stage and requests action without another approval round. No automatic commits or deployment.

**Goal:** A local-only gallery of the real website components with visual editing and browser-saved design drafts.

**Architecture:** Development-only `/ui-library` route outside authenticated dashboard providers. A three-column editor (component navigation, preview canvas, appearance inspector) hosts a same-origin isolated preview frame so responsive widths, theme tokens and portalled dialogs work without restyling the editor or operational pages. The frame renders imported production components using synthetic fixtures and blocks API requests; local changes are validated and stored only in the browser. No new dependencies.

**Design:** Searchable categories cover primitives, feedback, navigation, data/charts and workflow panels. All-view groups previews; individual selections expose component-specific size, spacing, radius, background, text and border overrides alongside shared theme controls. Light/dark, density, desktop/tablet/mobile widths and reset are immediate. State examples and local actions are interactive. No publication workflow. Existing wrappers/controllers with no standalone visual surface are documented as such.

**Constraints:** Preserve existing production defaults; gate both editor and preview with server `NODE_ENV` checks. Development middleware access must not weaken other route auth. Preview callbacks operate only on fixture state. Validate localStorage and message inputs; restrict editable CSS properties and values. No raw CSS or executable configuration.

## Tasks

- [x] 1. Add and run failing tests for validated draft settings, restricted CSS generation and development route access. Implement the small settings model and dev-only routes/middleware.
- [x] 2. Build the inspector/gallery shell and isolated frame with local persistence and accessible controls. Cover corrupt/unknown saved values, reset and theme isolation.
- [x] 3. Inventory/import existing visual components, supply deterministic fixtures and safe local actions. Include dialogs, dropdowns, tables, charts, review/ticket panels, shell and feedback states. Document source paths and nonvisual controller coverage.
- [x] 4. Verify type checking, settings/access tests and existing relevant checks; review final diff and update documentation.

Hydrated browser checks were attempted but blocked by Work's disabled local browser setting. They remain unverified; no screenshot was fabricated. HTTP checks confirmed both routes return 200 and only the development preview gets same-origin frame permissions. Seven settings/access/network tests, 22 inventory/render checks, six existing History checks and 13 station-review checks passed, as did TypeScript. Expected Recharts SSR dimension warnings remain. Independent review found and verified fixes for sidebar storage isolation, portalled styles and sample mutation completion; no remaining important blockers reported.

## Progress and rulings

- User specified both gallery and visual editor, strictly for local designing. Routine design/technical choices above are implementation defaults, not claimed prior user decisions.
- Use iframe isolation rather than copying component markup or mutating the main app's theme. This keeps portals and responsive breakpoints faithful while drafts remain sandboxed.
- Stay in the shared checkout with existing uncommitted planning files; no automatic commit, push, migration or skill installation.
- Shared primitive appearance uses inert data-ui hooks; CSS overrides exist only in the preview document. Chart override variables retain the original production colors as fallbacks.
- Routine choices made during implementation: development-only Next route, 20 grouped specimens covering every visual module, isolated frame, browser drafts, appearance-only controls and explicit local ticket response fixtures. These implement the user request without claiming prior approval of each technical detail.
