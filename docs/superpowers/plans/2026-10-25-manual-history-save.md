# Manual History save and titles

User-approved flow: processing produces a temporary result; analyst chooses Save to History, enters/edits a title, then saves once. Reviews save automatically after that. Ticket creation offers the same save step when needed. Reset, rerun, file replacement and internal navigation offer Save, Discard or Keep working for unsaved runs; browser unload retains its native warning.

- [x] API: stop automatic history writes; require trimmed title (1–120 characters) on explicit authenticated save, retain original result and idempotent run identity. Add migration 0009 for titles without changing already-applied 0008. Tests cover no auto-save, validation, ownership, retry/title retention.
- [x] Web: shared title modal, neutral Not saved / Saved status, save-before-ticket, central unsaved-run confirmation and navigation guard. Use existing theme/primitives and preserve existing review/export behavior.
- [x] History: title as the main list/detail heading and searchable text; filename fallback for older records.
- [x] Verify affected tests, TypeScript/build, update setup docs and architecture map. Do not apply migrations, deploy or commit as part of this change.

Temporary preview data remains in the existing API job store; API restart/expiry can remove unsaved data. No permanent records are created without the analyst's save action.

Checks so far: backend 43/43, frontend 30/30, TypeScript and production build passed. Follow-up title RPC uses an explicit third argument to require migration 0009 and prevent silently dropping titles on an older schema. Neither migration has been applied by this task.

Final targeted History suite passed after the explicit RPC argument change (19 checks). No frozen Zone/Expo files changed; no schema migrations, commits or deployment executed. Live browser/database verification remains pending.
