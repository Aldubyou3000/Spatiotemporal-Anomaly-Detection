# AWS Sentinel UI Library

Labels: wayfinder:map
Status: implemented

## Destination

A local-only design playground combining a gallery of the actual AWS Sentinel website components with a visual appearance editor. Implemented at `/ui-library` in development; see [the user guide](../../docs/UI_LIBRARY.md) and [implementation record](implementation.md).

## Notes

- Confirmed by the user: include both the component gallery and on-page customization controls.
- User clarification: this is only for local designing and will not be deployed. Do not add a production publication workflow or ask the user deployment/storage architecture questions for this playground.
- The user explicitly requested `implement` after clarifying local-only scope, ending the planning-only stage. Remaining proposed decision tickets are historical planning prompts; implementation choices and verification are recorded in implementation.md.
- Track decisions locally using `.scratch/<effort>/issues/NN-<slug>.md`; no repository tracker configuration was present. The local tracker supports dependency lines rather than native blocking relationships. Run `/setup-matt-pocock-skills` if a permanent repository tracker preference is wanted.
- Read `map/index.md`, `map/components/web-pages-components.md` and `map/components/web-shell.md` before implementation investigation. `map/` is the existing architecture map, separate from this decision map.
- Use the user-invoked `C:/Users/lynni/.codex/skills/wayfinder/SKILL.md`. Its missing local dependencies were read from the author's upstream sources: [grilling](https://github.com/mattpocock/skills/blob/main/skills/productivity/grilling/SKILL.md) and [domain-modeling](https://github.com/mattpocock/skills/blob/main/skills/engineering/domain-modeling/SKILL.md). Read them again when working a decision ticket; do not assume they are installed locally. The prototype skill must be available before working a prototype ticket.
- Existing foundations: real components in `web/src/components/`; shared light/dark and density tokens in `web/src/app/globals.css`; theme preferences in `ThemeContext`. Some appearance values are component-local inline styles, so changing theme tokens alone does not necessarily customize every component.
- Preserve the shared source used by Zones, History, Tickets, Technicians and Audit. Gallery examples must not submit operational decisions or other production mutations.
- The user's recommendation preferences: keep changes small, reuse existing components, explain choices briefly, and preserve accessibility. Do not infer approval of a recommended answer from elapsed time.
- The open child tickets are the frontier/index; keep their detailed questions and future resolutions in their own files. No external research ticket is needed for the currently visible questions.

## Decisions so far

- [How do previewed styles become saved website styles?](issues/01-saving-and-publishing.md): Local design drafts; no publishing, deployment or required export/apply workflow.

## Not yet specified

- What remaining component-local styling needs a shared styling contract, once the editor's supported appearance controls are agreed.
- Which composed page patterns need their own editable previews after component coverage is settled.

## Out of scope

- The Expo technician application; this request targets the website.
- Rainfall algorithms, ticket business rules, authentication redesign, and editing operational records through the gallery.
- Arbitrary user-authored executable code; the requested visual editor concerns appearance.
- Deployment, shared design publication and database-backed theme administration.
