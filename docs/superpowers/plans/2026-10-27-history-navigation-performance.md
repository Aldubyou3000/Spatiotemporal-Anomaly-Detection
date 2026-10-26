# History navigation performance implementation plan

**Goal:** Remove the measured History navigation stall, keep saved-run data correct, and add a regression check that detects the cause.

**Architecture:** Retain Next.js routing, provider-scoped SWR, FastAPI authentication and immutable saved snapshots. Determine the slow boundary using cold/warm page-stream timings and production output before changing it. Changes must address measured work; a loading indicator alone does not count as the performance fix.

**Tech stack:** Next.js 15.5.18, React 19, SWR 2.4, FastAPI, existing Node/unittest checks. No new dependencies.

**Authorization:** The user requested thorough analysis, a plan, then implementation in this session. Preserve existing uncommitted work and make no commits or deployment changes.

## Evidence and constraints

- Existing development trace contains History summary/results requests lasting approximately 12.5 seconds. Compilation spans are substantially shorter, so the trace alone does not identify the cause.
- Read-only live service timings: summaries 0.138–0.157 s; results 0.398–0.629 s; reviews 0.267–0.283 s. Results include 1,091–3,029 daily rows, 1,000 preview rows, and 0.61–1.44 MB JSON.
- Current warm page-shell RSC requests complete in approximately 0.2 s. Reproduce cold navigation and investigate the difference.
- List clicks already seed summary SWR data; full results prefetch begins on summary-link hover/focus. Results import the complete results UI, including charting, and mount the hidden Data panel immediately.
- Browser automation is unavailable in this session. Use isolated HTTP/stream and real render tests, and state remaining visual/browser limitations.
- Preserve auth, CSRF, live counts/reviews, undo revisions, CSV contents, all result tabs, algorithms and the Expo app. No migration.

## Approaches considered

1. Add a loading screen only: improves feedback but does not remove the stall; insufficient alone.
2. Change database queries/cache mutable counts: the measured database work does not explain the stall and caching could hide live decisions; reject without new evidence.
3. Isolate the slow page/render/bundle boundary, remove its blocking work, and use existing SWR/loading mechanisms for navigation: selected approach, conditional on the reproduction.

## Task 1 — Confirm the slow boundary

- [ ] Run the existing History tests and record any baseline failures.
- [ ] Create a temporary isolated snapshot of the current web sources and reuse installed dependencies; keep its build output separate from the running development server.
- [ ] Measure cold and warm summary/results HTML and RSC streams: time to headers, first body data, completion, payload size and status. Include the router-state headers used during real navigation.
- [ ] Compare a production build and inspect generated bundles/module boundaries. Identify the exact cause or narrow it with a controlled one-variable experiment before implementation.
- [ ] Record the diagnosis and selected fix here.

## Task 2 — Fix and protect the demonstrated cause

- [ ] Write and run a failing regression reproducing the blocked navigation or unnecessary initial work. Exercise the real component/HTTP boundary; avoid tests that only grep source.
- [ ] Implement the smallest complete fix in the responsible routing/component/config layer. Share the fix with active Zones results only when they use that same layer.
- [ ] Verify the test passes and retained summary-cache, cross-run isolation, review revisions, exports and tab behavior remain correct.
- [ ] If independent download/render overhead is material, measure it separately before including an additional optimization.

## Task 3 — Verify and document

- [ ] Repeat cold/warm HTTP/stream measurements against the isolated fixed app and compare with the baseline.
- [ ] Run all existing frontend checks, TypeScript and a production build; run backend tests if backend code changes.
- [ ] Obtain an independent code review of this task's changes and resolve material findings.
- [ ] Update the affected architecture map pages, check shared candidates/orphans and append map/log.md. Document the real bug and prevention in docs/KNOWN_BUGS_AND_FIXES.md.
- [ ] Report measured improvement, regression coverage and any verification limits. Do not promise that all future network/server delays are impossible.

## Execution record

- Baseline test runner: `node --test` was blocked by sandbox child-process restrictions (EPERM); use direct existing test-file invocations or an approved test run. This is an execution restriction, not a failing application assertion.

### Verified implementation and limits
- Existing baseline History checks passed; new render/cache checks failed before fixes and pass after. Independent review found a cached-prefetch repeat download, fixed with provider-cache lookup.
- Isolated production build succeeded: History results first-load JS ~299 kB before / ~148 kB after; deferred imports move work until needed, not eliminate it.
- A separate regression proved both SSE subscriptions disappear on the first idle heartbeat. Moved the timeout to the broker queue read; repeated idle heartbeats, later delivery, sanitized mobile data, shutdown and cleanup now pass. SSE uses the existing single-flight session refresh. Shared change is 21 insertions / 36 deletions.
- Final checks: 118 frontend tests, 54 backend tests and TypeScript pass. No migration or pipeline algorithm changes.
- Eight warm route probes after stopping duplicate profiling servers: 0.22–0.73 seconds. Earlier isolated development probes still hit ~12.5 seconds, including with the smaller bundle; exact trigger unconfirmed. No unsupported cache-corruption or database diagnosis. Browser end-to-end verification unavailable.

- Isolated production snapshot: 12 RSC page-shell requests returned HTTP 200 in 0.006-0.121 s (median 0.009 s). This excludes browser rendering and authenticated API reads. Independent review approved heartbeat/refresh changes; diagnostic servers stopped and temporary build artifacts removed.
