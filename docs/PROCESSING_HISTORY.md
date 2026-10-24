# Processing History

History is a separate analyst sidebar page. Processing creates a temporary preview. A permanent run is created only when the analyst selects **Save to History**, enters a title and saves. Files processed together belong to the same run. Failed processing requests do not create completed history records.

## Required database setup

1. Apply the earlier numbered migrations first.
2. Open `docs/migrations/0008_processing_history.sql` in the Supabase SQL editor and run the whole file. It is transactional and safe to rerun.
3. Run `docs/migrations/0009_history_titles.sql` after 0008. If 0008 was already applied, run only 0009. This adds titles and the explicit titled-save RPC.
4. Deploy/restart the API and web dashboard together after the migrations succeed.

The migration adds `processing_runs`, `processing_run_results`, `processing_reviews`, a service-role-only `processing_history` view, atomic save functions, `tickets.run_id` / `reading_date`, and `inspection_reports.approved_by`. Browser and mobile clients have no direct access to the new tables or functions. All History routes require an analyst session. Review writes use the existing CSRF double-submit guard.

**Apply both migrations before deploying this code.** Ticket queries and report approvals also use the new columns. Until setup is complete, runs can still be previewed, but manual saving will fail, and ticket/report operations using missing columns will fail.

## Analyst workflow

- Process files in Zones. Results display **Not saved**, with a **Save to History** button. Previewing and downloading the output does not create a History record.
- Choose **Save to History**, edit the suggested title (1–120 characters), then save. Titles do not have to be unique. Older untitled records use the source filename as their display name.
- Unsaved runs offer Save, Discard or Keep working before reset, rerun, file replacement or an internal navigation link. Browser refresh/close uses the browser’s native unsaved warning. Browser back/forward may change the dashboard route while preserving the active run in context.
- After saving, review flagged readings as usual; subsequent review decisions save automatically. Decisions save before the UI advances; reviewer identity and time come from the server. Original rainfall and detection flags remain unchanged.
- Open History to search by title, filename, station or processor and filter by processing date (Asia/Manila). One row shows review progress and current ticket counts.
- Open a run for the source file list, rainfall period, cleaning summary, review totals and related tickets. **Open results** reuses the normal results tabs, charts, review controls and CSV exports. Browsing saved results does not replace the current Zones workspace.
- Create a ticket from a flagged reading to attach its exact run, station and date. If the run is unsaved, the title/save dialog opens first; cancelling or a failed save does not create a ticket. The station is fixed for that ticket. Related tickets open directly in Tickets, with a link back to the source run.
- History distinguishes assigned technicians from the technician who submitted the latest inspection report. Follow-up tickets retain their latest submitted report even before a new round is submitted. Report submission dates are labelled as submission dates; the system does not record a separate field inspection date.
- New report approvals record the approving analyst. Older approvals keep an unknown approver rather than inferring one.

## Retention and failures

Snapshots contain the processing output, including cleaned/detected readings, neighbor groups, quality counts, station summaries and the existing capped raw preview. Source filenames, sizes and SHA-256 hashes identify the inputs. Original upload bytes are not stored as an additional permanent copy; retain the source CSVs separately if needed.

Reviews live separately from original results. Each reading has a revision counter; stale writes return HTTP 409 and reload current decisions. Opening confirmation captures the current save handler/revision so a later live update cannot silently change the decision’s baseline; in-progress note drafts are preserved. Undo records a new authenticated revision. Downloads include current saved decisions; exports wait for review loading/saving to finish.

If a manual save fails, the dialog retains its title and shows the error; results remain visible and downloadable. Retry uses the original server-held result and the same run ID, without rerunning detection or creating another entry. A lost save acknowledgment followed by a retry returns the original saved title. Unsaved previews use the existing temporary job store, with one-hour opportunistic expiry and a 50-job limit; API restart or cleanup can remove their save data. The store retains file metadata/hashes rather than raw upload bytes after processing. Successful saved runs survive restarts; the in-progress processing jobs still use the existing in-process job store.

Past browser-only runs and unlinked tickets are not backfilled. Running the same files again creates a new run. There is no delete/archive UI in this first version.

## Verification

From the repository root:

```powershell
.\api\.venv\Scripts\python.exe -m unittest discover -s api/tests -v
```

From `web/`:

```powershell
node tests/anomaly-review.test.cjs
node tests/station-review.test.cjs
node tests/history.test.cjs
node tests/history-render.test.cjs
npx tsc --noEmit
npm run build
```

The automated tests use isolated API/database mocks and rendered components. They do not apply SQL to Supabase. After applying the migration, manually verify processing (confirm no History entry) → Save to History with title → refresh → History → review → CSV, plus ticket creation, inspection submission and approval. Also check two analysts attempting to review the same reading.
