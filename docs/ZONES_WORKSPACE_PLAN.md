# Zones workspace plan

Status: implemented 2026-10-25. Setup, processing and viewport-contained results now replace one another. Configuration reopens in a focused dialog with the report retained underneath. The following sections record the accepted design and its boundaries.

Implementation verification: TypeScript, eight new Zones workflow/keyboard tests and the existing History/review/library/theme suites pass (74 checks total). The tests cover view transitions, stable result identity while inspecting configuration, guarded changes/reruns, save-before-ticket creation, keyboard containment, Stop/late-response safety and error/reset paths. Hydrated browser geometry remains unverified because local browser automation is disabled. No live processing, database mutation or deployment was performed for verification.

Header refinement after implementation: file count is a compact badge, Reset is an accessible icon button, and the idle Not saved copy is screen-reader-only beside the primary Save to History action. Existing saved-title links and save dialogs remain.

Navigation refinement: the save reminder now allows Continue without saving for dashboard tab navigation, retaining the current run/files/reviews in ZonesContext. Destructive replacements still require save/discard; refresh/closing the workspace is not persistence.

## Outcome

Zones stays the place to upload files and run the A/B/C pipeline. After completion it gives results the same viewport-contained workspace as opened History results, without leaving setup/process/status panels stacked above them. Configuration remains discoverable and accessible.

## Proposed interaction

| State | Main workspace | Persistent actions |
| --- | --- | --- |
| Setup: no result and not running | One configuration surface containing FileUpload and Run process. File list scrolls inside its bounded area. Short process explanation/help, without a second large idle pipeline panel or redundant No results yet card. | Existing header/account controls; Run process within setup. Reset only when meaningful. |
| Running | Existing PipelineDiagram becomes the primary content. It replaces setup rather than sitting below it. Remove duplicate RunningSkeleton. Do not present its timed visual stage as backend progress or invent a percent/ETA. | Processing status and Stop, with existing confirmation. Upload/rerun controls remain unavailable while running. |
| Results | ZoneResults with fitViewport enabled. Keep tab navigation, bounded active content, equal review panels, compact progress/filter row and bottom footer. Long lists/evidence/tab content scroll internally; full flagged table opens in the existing dialog. | Compact Run configuration, Save to History or saved-state link, and Reset. Current file count may appear within the configuration button; no separate configuration/status card. |

Opening Run configuration in results shows a wide existing Modal with the current file list, upload controls, Run again and optional collapsed Process details. It is an overlay: closing it without changing files or rerunning returns to the identical result, active tab, selected reading and note. Keep CurrentResults mounted under the dialog. Configuration remains the full primary surface in setup, rather than becoming a hidden-only feature.

Use one configuration component/content block from both setup and dialog. Use the actual existing controls and handlers; do not duplicate processing or persistence state. Keep the three pipeline stages visible while running; after success move their explanatory content to Process details and rely on Overview for final counts.

Save is always visible in the result toolbar. Keep the brief Not saved label and actual Save to History button, rather than a full-width instruction row. Reuse requestSave and RunSaveController. Save failure stays in its existing form and does not switch views or clear the run. Saved state uses the saved title and a History link. CSV export stays in the shared bottom-right footer.

## State and safety

- Derive the main view from existing running/result values; do not add another durable state that can contradict them. Config-dialog visibility is presentation state only.
- Merely inspecting configuration must not call setResult(null), reset reviews, request save or start a run.
- Actual file additions/removals retain handleFilesChange/guardUnsaved. If approved they invalidate the old result exactly as today and reveal setup; dismissing the guard retains the current result/files. Do not imply file edits are staged when the current handlers apply them immediately.
- Run again retains guardUnsaved. Close the configuration dialog only when the approved operation begins. Starting a replacement run intentionally clears the previous result/reviews, as today; saved records remain in History.
- Reset retains existing confirmation/loss wording and returns to setup only after confirmation.
- Stop still aborts the browser request, not the backend job. Preserve abort-controller identity checks so late completion/error cannot resurrect a stopped/reset/replaced run. Return to setup with files retained.
- Processing failure returns to setup with files and inline error retained; retry stays available. Error messages must not be hidden in a closed dialog.
- Preserve save-before-ticket creation, review loading/errors/retry/locking, unsaved navigation/beforeunload protection, and server revision behavior.
- Keep ZonesProvider as the source of files/result/reviews/running across navigation. Do not change API, algorithms, migrations, or automatic-save semantics.

## Implementation boundaries

1. Refactor web/src/app/(dashboard)/zones/page.tsx into mutually exclusive setup/running/results compositions. Extract only the existing configuration markup needed in both setup and dialog. Remove pipelineRef/scrollIntoView and redundant empty/running placeholder panels when their replacement is in place.
2. Use a bounded flex page/body with min-height:0 through every intermediary. Pass fitViewport through CurrentResults to ZoneResults; preserve mounted identity when opening configuration/saving. Reuse Header actions for compact result controls and existing Modal for configuration. Keep popovers portalled.
3. Adapt RunSaveStatus only as needed for compact composition, preserving its existing gallery specimen and default callers. Avoid a second save controller or raw fetch pattern.
4. Match existing white working surfaces on #F8FAFD content backdrop. No shadows or repeated parent/child frames. Keep all relevant actions visible without an outer page scrollbar at ordinary desktop sizes. On narrow/short screens bound dialog/tab content and allow internal scrolling so controls/data remain reachable.
5. Update architecture maps/library specimens if component boundaries change. Check shared candidates/orphans.

## Verification and acceptance

- Desktop at 1280x720, 1440x900 and a shorter window: no outer Zones scrollbar in results, review actions and CSV footer remain visible, equal queue/detail bottoms. Check all five result tabs; raw/cleaned/overview/neighbors retain access through internal content scrolling.
- Open/close configuration repeatedly while a note is dirty: active tab, selection, note and review state are retained. Escape/close restore trigger focus. Small-screen configuration remains fully accessible.
- New unsaved run: cancelled file-change/rerun/reset leaves the run intact. Save/discard branches execute once. Failed save keeps the pending action unexecuted and the error visible.
- Running success/error/Stop/reset/navigation return to the correct view, without scrollIntoView or late response updates. No duplicate processing request or pipeline timer.
- Save to History and ticket creation still use their existing coordination. Saved reviews and Undo retain version safety.
- Run TypeScript and existing history/station-review/anomaly-review/library checks. Add focused interaction tests for configuration close retaining results, guarded replacements and lifecycle transitions; do not add tests that only mirror CSS declarations.
- Hydrated browser geometry/keyboard verification is required to claim the viewport layout visually confirmed. Browser automation has been disabled in this session, so record that limitation if still unavailable at implementation time.

## Alternatives considered

Setup refinement implemented (2026-10-25): use one centered form instead of separate Upload station data / Start detection cards. Keep the drop target compact, display accepted formats/columns/size clearly, and place the normal-width Run action beside next-step guidance below it. Pipeline explanations remain permanently visible in How detection works; its disclosure toggle was removed. The setup and results dialog share this composition; FileUpload's library example inherits its updated presentation. Existing file validation, guards and processing behavior are unchanged.

Hierarchy refinement implemented: use the Rainfall detection heading, native Browse/Add files buttons in a compact upload row, two lines of supporting format guidance, three plain process steps in one quiet band, and a larger Run detection action. No additional settings, switches or panels. The process preview always uses idle steps; running and completed counters retain their operational presentation.

Processing refinement implemented: align the processing surface and heading with setup, use the same plain steps and one indeterminate bar. Remove timed stage-completion simulation and colored cards; completion uses actual returned counts. Retain Stop and all request-lifecycle guards. The frontend does not claim a percentage or active stage without API evidence.

Surface simplification implemented: setup/processing now sit directly on the dashboard's existing work surface without a nested pale body and rounded white card. Process steps use spacing instead of another tinted panel. Selected files use a plain summary and unboxed list; retain the dashed empty drop target, drag highlight and useful row separators. File validation, confirmations and bounded scrolling remain unchanged.

User outline clarification: restore the single pale parent panel below the header and a single white centered setup/processing panel inside it. Keep the simplified inner file list and process steps. These two structural surfaces use existing tokens, with no shadows or extra inner cards.

Reference-guided refinement (2026-10-25): keep the two surfaces, improve card insets and section spacing, place the file list immediately after its summary, group Add files/Remove all together and move technical format notes below the list. Use density-aware file rows and sentence-case process labels. Removal confirmations, file limits, drag/drop, result transitions and save guards stay intact.

References used for that refinement:
- [Material color roles](https://m3.material.io/m3/pages/color-roles?s=m3): surface roles provide container hierarchy. Applied through the existing pale workspace and white form, without adding more surface levels.
- [Carbon file uploader](https://www.carbondesignsystem.com/building-blocks/core/components/file-uploader/guidelines): concise file actions, aligned stacked files, helper descriptions and filename truncation with hover disclosure. Kept Run detection as the primary action.
- [Carbon forms](https://www.carbondesignsystem.com/building-blocks/core/patterns/forms): logical grouping, related task sections and sentence-style labels. Applied to spacing and process text; no new fields or toggles.
- [GOV.UK file upload](https://design-system.service.gov.uk/components/file-upload/): explicit native-button file selection alongside drag/drop. Retained the existing accessible Browse/Add files buttons.

Scene-specific revision after screenshot review: earlier spacing-only refinements were visible in the screenshot but insufficient. Setup now separates the task area (upload/files) from a slim process explanation in one white panel, with a full-width action footer. The available container width controls stacking, preserving the result dialog and expanded-sidebar layouts. Processing uses a narrower status panel and stacked steps. Zone A/B/C receive green/amber/red identity labels; these do not indicate stage completion. Browse is the primary empty-state action, and Run takes primary emphasis after selection.

Spacing standardization: use shared 4/8/16/24/32px primitives, consistent with [Carbon's spacing scale](https://www.carbondesignsystem.com/building-blocks/foundations/spacing/overview). Apply 32px desktop workspace inset, 24px content padding/section spacing, 16px group gaps and 8px control/related-text gaps. Mobile uses 16px panel padding. Existing row-height density still sets minimum file-row/action height; spacing no longer changes unpredictably with radius or density values.

Footer placement correction: place Run controls and any pipeline error inside the upload task column, directly after FileUpload. This prevents a taller guide from adding blank space before the footer. Retain the 24px content-to-footer gap and independent guide column; on small layouts the guide follows the complete upload task.

Processing feedback correction: a reduced-motion preference must not make activity look stalled. Both preferences now sweep; reduced motion slows the sweep to 2.4 seconds after a fixed-position opacity pulse still looked stationary. Browser computed transforms confirmed movement under reduced motion. Stop belongs beside the processing panel title and retains its existing confirmation/abort behavior.

Real-stage extension: async job polling now includes preparing/Zone A/Zone B/Zone C/finalizing and actual station IDs from the orchestration service. The processing list reflects completed/current/waiting states and puts station chips under the active stage. Stations participate in a shared comparison set; no fictional per-station sequence or percentage is presented. Fast stages can finish between polling snapshots. Existing synchronous fallback, request cancellation, owner authorization and save behavior remain. Frozen algorithms are unchanged. References: [Carbon progress indicator](https://www.carbondesignsystem.com/building-blocks/core/components/progress-indicator/code) and [PatternFly progress stepper](https://www.patternfly.org/components/progress-stepper/html/).

Additional scene-specific references:
- [Atlassian empty states](https://atlassian.design/components/empty-state): use a primary action for the best next step. Applied to Browse before files are selected and Run after selection.
- [Atlassian panel footer](https://atlassian.design/components/panel/usage): group task actions in a clear footer with primary action at the right. Applied to the configuration action row.
- [Material progress indicators](https://m2.material.io/components/progress-indicators): overall indeterminate progress when progress cannot be measured. Kept one bar without simulated stage completion or percentages.
- [Carbon loading patterns](https://www.carbondesignsystem.com/building-blocks/core/patterns/loading): indicate the scope of ongoing processing. Applied through the compact status surface rather than a blocked dashboard overlay; other dashboard navigation stays available.
- [Cloudscape create resource](https://cloudscape.design/patterns/resource-management/create/): a single-page flow suits simple to medium configuration. Kept this workflow on one page with no wizard.

Keeping everything collapsed above results still reserves rows and leaves users managing stacked content. A permanent configuration side panel would squeeze maps/charts and create a third pane beside the review queue/detail. A separate route would introduce navigation and duplicate state handling. The setup-to-results workspace with an on-demand configuration dialog reuses the existing model and keeps the full results width.
