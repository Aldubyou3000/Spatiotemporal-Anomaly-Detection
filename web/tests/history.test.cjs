const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function load(source, overrides) {
  const filename = path.resolve(__dirname, "../src", source);
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const mod = { exports: {} };
  new Function("require", "exports", "module", code)((name) => overrides[name] ?? require(name), mod.exports, mod);
  return mod.exports;
}
const helpers = load("lib/anomalyReview.ts", {});
const key = '["A","2023-01-01"]';
const stored = { station_id: "A", date: "2023-01-01", status: "anomaly", note: "", reviewer_id: "old", reviewed_by: "Old analyst", reviewed_at: "2026-10-24T00:00:00Z", revision: 3 };

test("results prefetch starts immediately and shares one request across repeated intent", async () => {
  // Exercise SWR's real browser preloader; its Node/server implementation is a no-op.
  const internalFile = require.resolve("swr/_internal");
  const internalRequire = require("node:module").createRequire(internalFile);
  const browser = { exports: {} };
  new Function("require", "exports", "module", fs.readFileSync(internalFile, "utf8"))((name) => {
    const value = internalRequire(name);
    return name.startsWith("./config-context") ? { ...value, IS_SERVER: false } : value;
  }, browser.exports, browser);
  let calls = 0;
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const { usePrefetchHistoryResults } = load("hooks/useHistory.ts", {
    swr: { ...require("swr"), preload: browser.exports.preload, useSWRConfig: () => ({ cache: new Map() }) },
    "@/lib/api/history": { historyApi: { results: id => { calls++; assert.equal(id, "prefetch-regression"); return pending; } } },
    "@/lib/anomalyReview": helpers,
  });
  assert.equal(typeof usePrefetchHistoryResults, "function");
  const prefetch = usePrefetchHistoryResults("prefetch-regression");
  const first = prefetch();
  const repeated = prefetch();
  assert.equal(calls, 1, "start the read in the event handler, without waiting for a page state update");
  assert.equal(first, repeated, "hover, focus and navigation must share the pending read");
  finish({ run_id: "prefetch-regression" });
  assert.equal((await first).run_id, "prefetch-regression");
});

test("returning to cached immutable results does not download the snapshot again", async () => {
  const swr = require("swr");
  const cached = { run_id: "cached-run", history_saved: true };
  const cache = new Map([[swr.unstable_serialize(["/api/history/cached-run/results"]), { data: cached }]]);
  const { usePrefetchHistoryResults } = load("hooks/useHistory.ts", {
    swr: { ...swr, useSWRConfig: () => ({ cache }), preload: () => { throw new Error("must not prefetch cached results"); } },
    "@/lib/api/history": { historyApi: { results: () => { throw new Error("must not read cached results"); } } },
    "@/lib/anomalyReview": helpers,
  });
  assert.equal(typeof usePrefetchHistoryResults, "function");
  assert.equal(await usePrefetchHistoryResults("cached-run")(), cached);
});

test("opening a listed run seeds its own summary cache without replacing a fresher summary", async () => {
  const cached = new Map();
  const requests = [];
  const hooks = load("hooks/useHistory.ts", {
    swr: { __esModule: true, default: (key, fetcher, options) => { requests.push({ key, options }); return { data: undefined }; },
      useSWRConfig: () => ({ mutate: async (key, update, options) => {
        assert.equal(options.revalidate, false);
        const id = JSON.stringify(key); cached.set(id, update(cached.get(id)));
      } }) },
    "@/lib/api/history": { historyApi: {} }, "@/lib/anomalyReview": helpers,
  });
  const list = hooks.useHistoryList({});
  list.selectRun({ id: "A", reviewed_count: 1 });
  list.selectRun({ id: "B", reviewed_count: 2 });
  list.selectRun({ id: "A", reviewed_count: 0 });
  assert.equal(cached.get('["/api/history/A"]').reviewed_count, 1);
  assert.equal(cached.get('["/api/history/B"]').reviewed_count, 2);
  hooks.useHistoryRun("A");
  assert.equal(requests.at(-1).options.revalidateOnMount, true, "cached summaries must still refresh live counts");
});

test("history prefetch is opt-in, shares the results key, and can skip empty tickets", () => {
  const keys = [];
  const hooks = load("hooks/useHistory.ts", {
    swr: { __esModule: true, default: key => { keys.push(key); return {}; } },
    "@/lib/api/history": { historyApi: {} }, "@/lib/anomalyReview": helpers,
  });
  hooks.useHistoryResults("A", false);
  hooks.useHistoryResults("A", true);
  hooks.useHistoryResults("A");
  hooks.useHistoryTickets("A", 0, false);
  hooks.useHistoryTickets("B", 20);
  assert.deepEqual(keys, [null, ["/api/history/A/results"], ["/api/history/A/results"], null, ["/api/history/B/tickets", 20]]);
});
function harness(data, write) {
  let cache = data;
  let reloads = 0;
  const mutate = async (update) => { if (update) cache = update(cache); else reloads++; return cache; };
  const hook = load("hooks/useHistory.ts", {
    react: { useEffect: () => {}, useMemo: (fn) => fn(), useRef: (value) => ({ current: value }), useState: (value) => [value, () => {}] },
    swr: { __esModule: true, default: () => ({ data: cache, error: null, isLoading: false, mutate }), mutate: async () => {} },
    "@/lib/api/history": { historyApi: { review: write } },
    "@/lib/anomalyReview": helpers,
  }).useHistoryReviews("run-1");
  return { hook, cache: () => cache, reloads: () => reloads };
}

test("saved reviews retain server attribution and revisions, including undo tombstones", async () => {
  let sent;
  const response = { ...stored, status: "not_anomaly", reviewer_id: "server-user", reviewed_by: "Server Analyst", revision: 4 };
  const h = harness([stored, { ...stored, station_id: "B", status: null, revision: 2 }], async (id, body) => { sent = { id, body }; return response; });
  assert.equal(Object.keys(h.hook.reviews).length, 1);
  const saved = await h.hook.saveReview(key, { ...stored, status: "not_anomaly", reviewer_id: "client-name" });
  assert.equal(sent.id, "run-1");
  assert.equal(sent.body.expected_revision, 3);
  assert.equal(sent.body.status, "not_anomaly");
  assert.equal(sent.body.reviewer_id, undefined);
  assert.equal(saved.reviewer_id, "server-user");
  assert.equal(h.cache().find((row) => helpers.readingKey(row) === key).revision, 4);
  assert.equal(h.cache().find((row) => row.station_id === "B").revision, 2);
});

test("failed review save leaves the previous decision intact and reloads authoritative reviews", async () => {
  const h = harness([stored], async () => { throw new Error("Decision changed elsewhere"); });
  await assert.rejects(h.hook.saveReview(key, { ...stored, status: "not_anomaly" }), /changed elsewhere/);
  assert.deepEqual(h.cache(), [stored]);
  assert.equal(h.reloads(), 1);
});

test("review save waits for persistence and blocks double submissions", async () => {
  let resolve;
  const h = harness([stored], () => new Promise((done) => { resolve = done; }));
  const pending = h.hook.saveReview(key, stored);
  await assert.rejects(h.hook.saveReview(key, stored), /wait/);
  assert.equal(h.cache()[0].revision, 3);
  resolve({ ...stored, revision: 4 });
  await pending;
  assert.equal(h.cache()[0].revision, 4);
});

test("undo uses the current revision and retains the server tombstone for later decisions", async () => {
  let sent;
  const h = harness([stored], async (_id, body) => { sent = body; return { ...stored, status: null, note: "", revision: 4 }; });
  assert.equal(await h.hook.saveReview(key, null), null);
  assert.equal(sent.status, null);
  assert.equal(sent.expected_revision, 3);
  assert.equal(h.cache()[0].revision, 4);
});

test("review controls cannot save before saved decisions have loaded", async () => {
  const h = harness(undefined, async () => { throw new Error("must not call server"); });
  assert.equal(h.hook.ready, false);
  await assert.rejects(h.hook.saveReview(key, stored), /Load the saved reviews/);
});

test("a late save retry cannot restore a run after reset or replace a newer result", () => {
  let call = 0;
  const cells = [[], false, { result: { run_id: "new-run" }, reviews: {} }, null, true];
  const stateReact = {
    createContext: () => ({ Provider: "provider" }), useEffect: () => {}, useRef: (value) => ({ current: value }),
    useState: (initial) => { const index = call++; if (index >= cells.length) cells[index] = initial;
      return [cells[index], (update) => { cells[index] = typeof update === "function" ? update(cells[index]) : update; }]; },
  };
  const { ZonesProvider } = load("context/ZonesContext.tsx", { react: stateReact, "@/lib/anomalyReview": helpers });
  const value = ZonesProvider({ children: null }).props.value;
  value.setResult({ run_id: "old-run", history_saved: true }, "old-run");
  assert.equal(cells[2].result.run_id, "new-run");
  value.resetSession();
  value.setResult({ run_id: "new-run", history_saved: true }, "new-run");
  assert.equal(cells[2].result, null);
});

test("explicit save sends the analyst's title and rejects a server-side save failure", async () => {
  const calls = [];
  const stateReact = { useState: (value) => [value, () => {}], useRef: (value) => ({ current: value }), useCallback: (fn) => fn };
  const { useSaveHistoryRun } = load("hooks/useHistory.ts", {
    react: stateReact,
    swr: { mutate: async () => {} },
    "@/lib/api/history": { historyApi: { saveRun: async (id, title) => {
      calls.push({ id, title }); return calls.length === 1 ? { run_id: id, history_saved: true, history_title: title } : { history_saved: false, history_error: "Storage unavailable" };
    } } },
    "@/lib/anomalyReview": helpers,
  });
  const state = useSaveHistoryRun();
  assert.equal(calls.length, 0, "mounting must not save a run");
  assert.equal((await state.save("run-1", "  October review  ")).history_title, "October review");
  assert.deepEqual(calls[0], { id: "run-1", title: "October review" });
  await assert.rejects(state.save("run-1", "Retry title"), /Storage unavailable/);
});

test("unsaved runs wait for a leave choice while saved runs continue immediately", () => {
  let cursor = 0;
  const cells = [[], false, { result: { run_id: "run-1", history_saved: false }, reviews: {} }, null, true];
  const stateReact = {
    createContext: () => ({ Provider: "provider" }), useEffect: () => {}, useRef: (value) => ({ current: value }),
    useState: (initial) => { const index = cursor++; if (!(index in cells)) cells[index] = initial;
      return [cells[index], (update) => { cells[index] = typeof update === "function" ? update(cells[index]) : update; }]; },
  };
  const { ZonesProvider } = load("context/ZonesContext.tsx", { react: stateReact, "@/lib/anomalyReview": helpers });
  function render() { cursor = 0; return ZonesProvider({ children: null }).props.value; }
  let continued = 0;
  render().guardUnsaved(() => continued++);
  assert.equal(continued, 0);
  assert.ok(render().leaveRequest);
  render().cancelLeave();
  assert.equal(render().leaveRequest, null);
  assert.equal(continued, 0);
  render().guardUnsaved(() => continued++, { allowContinue: true });
  assert.equal(render().leaveRequest.allowContinue, true, "navigation can offer a non-destructive continue option");
  render().cancelLeave();
  render().guardUnsaved(() => continued++);
  assert.equal(render().leaveRequest.allowContinue, undefined, "file replacement and reset still require saving or discarding");
  render().cancelLeave();
  render().requestSave(() => continued++);
  assert.equal(continued, 0, "opening Save must not perform the pending navigation or ticket action");
  render().cancelSave();
  assert.equal(render().saveRequest, null);
  render().setResult({ run_id: "run-1", history_saved: true });
  render().guardUnsaved(() => continued++);
  assert.equal(continued, 1);
});
