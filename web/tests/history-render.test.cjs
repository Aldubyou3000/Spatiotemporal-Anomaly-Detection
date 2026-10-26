const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { test } = require("node:test");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const run = {
  id: "38eb498a-e434-4818-bbf6-e541353a4225", processed_by_name: "Analyst One", processed_at: "2026-10-25T01:30:00Z",
  files: [{ name: "HMDAS-ScienceGarden.csv", size: 108000, sha256: "abcd" }, { name: "HMDAS-Mandaluyong.csv", size: 95000, sha256: "efgh" }],
  station_ids: ["ScienceGarden", "Mandaluyong", "NapindanII", "MarikinaYouthCamp"],
  summary: { total_stations: 4, total_rows: 3029, total_high_anomalies: 49, total_low_anomalies: 26, date_range_start: "2022-07-10", date_range_end: "2023-12-31" },
  quality_report: { stations_excluded: 0, rows_excluded: 319, rows_filled: 127, summary_text: "319 incomplete daily totals excluded. 127 isolated hours estimated." },
  flagged_count: 75, reviewed_count: 18, confirmed_count: 6, dismissed_count: 12, open_tickets: 2, verified_tickets: 1, cancelled_tickets: 0, algorithm_version: "a6b723ce1904b568",
};
const ticket = { id: "t-1", ticket_number: 27, title: "Check unusual rainfall", station_id: "ScienceGarden", reading_date: "2023-10-22", status: "follow_up",
  technicians: [{ full_name: "Assigned Technician" }], inspection: { submitted_at: "2026-10-25T03:00:00Z", profiles: { full_name: "Inspecting Technician" }, round: 1, analyst_approved_at: null } };
const hooks = {
  useHistoryList: () => ({ data: { items: [run], total: 1 }, mutate: () => {}, selectRun: () => {} }),
  useHistoryRun: () => ({ data: run, mutate: () => {} }),
  useHistoryResults: () => ({}),
  usePrefetchHistoryResults: () => () => Promise.resolve(),
  useHistoryTickets: () => ({ data: { items: [ticket], total: 1 }, mutate: () => {} }),
};
const cache = new Map();
const navigation = { prefetch: () => {} };
let reactOverride;
function load(source) {
  const base = path.resolve(__dirname, "../src", source);
  const file = [base, `${base}.ts`, `${base}.tsx`].find(fs.existsSync);
  if (cache.has(file)) return cache.get(file).exports;
  const mod = { exports: {} }; cache.set(file, mod);
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), { fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2017 } }).outputText;
  const req = (name) => name === "react" && reactOverride ? reactOverride
    : name === "@/components/ui/Toast" && reactOverride ? { useToast: () => ({ success: () => {}, error: () => {} }) }
    : name.endsWith(".css") ? { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) }
    : name === "@/hooks/useHistory" ? hooks
    : name === "@/context/AuthContext" ? { useAuth: () => ({ user: { full_name: "Analyst One", username: "analyst" }, logout: () => {} }) }
    : name === "@/context/ThemeContext" ? { useTheme: () => ({ theme: "light", setTheme: () => {} }) }
    : name === "next/navigation" ? { useParams: () => ({ id: run.id }), usePathname: () => "/history", useRouter: () => navigation }
    : name.startsWith("@/") ? load(name.slice(2))
    : name.startsWith(".") ? load(path.relative(path.resolve(__dirname, "../src"), path.resolve(path.dirname(file), name))) : require(name);
  new Function("require", "module", "exports", code)(req, mod, mod.exports);
  return mod.exports;
}
const List = load("app/(dashboard)/history/page").default;
const Detail = load("app/(dashboard)/history/[id]/page").default;
const { ToastProvider } = load("components/ui/Toast");
const render = (Component) => renderToStaticMarkup(React.createElement(ToastProvider, null, React.createElement(Component)));

test("opening saved results does not initialize the results workspace or ticket dialog before data loads", () => {
  cache.clear();
  try {
    load("app/(dashboard)/history/[id]/results/page");
    const initialized = [...cache.keys()].map(file => path.relative(path.resolve(__dirname, "../src"), file).replaceAll("\\", "/"));
    assert.ok(!initialized.includes("components/zones/ZoneResults.tsx"), "the route must load independently of the charting workspace");
    assert.ok(!initialized.includes("components/zones/CreateTicketModal.tsx"), "opening results must not initialize an unused ticket dialog");
  } finally { cache.clear(); }
});

test("the initial readings review does not render the hidden Data table", () => {
  cache.clear();
  try {
    const { ZoneResults } = load("components/zones/ZoneResults");
    const { result } = load("../tests/fixtures");
    const html = renderToStaticMarkup(React.createElement(ToastProvider, null,
      React.createElement(ZoneResults, { result, defaultTab: "anomalies" })));
    assert.match(html, /Review Readings/);
    assert.equal(/<table\b/.test(html), false, "the full Data table should mount only after its first visit");
  } finally { cache.clear(); }
});

test("opening review does not build CSV exports for every daily reading", () => {
  cache.clear();
  let exportReads = 0;
  reactOverride = { ...React, useMemo: fn => fn(), useState: initial => [typeof initial === "function" ? initial() : initial, () => {}] };
  try {
    const { ZoneResults } = load("components/zones/ZoneResults");
    const { result } = load("../tests/fixtures");
    const normal = { ...result.flagged_data[0], is_anomaly: false, is_low_anomaly: false, is_dry_stuck: false };
    Object.defineProperty(normal, "station_id", { enumerable: true, get() { exportReads++; return "Normal station"; } });
    ZoneResults({ result: { ...result, flagged_data: [normal] }, defaultTab: "anomalies" });
    assert.equal(exportReads, 0, "normal daily rows should be converted only when exporting results");
  } finally { reactOverride = undefined; cache.clear(); }
});

test("Data defaults to Cleaned and preserves search and cleaned filters across version changes", () => {
  cache.clear();
  const states = { results: [], table: [] }; let scope = "results", cursor = 0;
  reactOverride = { ...React, useMemo: fn => fn(), useState: initial => {
    const values = states[scope], index = cursor++;
    if (!(index in values)) values[index] = typeof initial === "function" ? initial() : initial;
    return [values[index], next => { values[index] = typeof next === "function" ? next(values[index]) : next; }];
  } };
  function find(node, match) {
    if (!node || typeof node !== "object") return null;
    if (match(node)) return node;
    for (const child of React.Children.toArray(node.props?.children)) { const found = find(child, match); if (found) return found; }
    return null;
  }
  try {
    const { ZoneResults } = load("components/zones/ZoneResults");
    const { result } = load("../tests/fixtures");
    const renderResults = () => { scope = "results"; cursor = 0; return ZoneResults({ result, defaultTab: "data" }); };
    const tableElement = tree => find(tree, n => n.type?.name === "DataTable");
    const renderTable = tree => { scope = "table"; cursor = 0; const el = tableElement(tree); return el.type(el.props); };
    let tree = renderResults();
    assert.ok(find(tree, n => n.type?.name === "Tab" && n.props.value === "data"));
    assert.equal(find(tree, n => n.type?.name === "Tab" && n.props.value === "neighbors"), null);
    assert.equal(find(tree, n => n.type?.name === "Tab" && ["raw", "cleaned"].includes(n.props.value)), null);
    assert.equal(tableElement(tree).props.data, result.cleaned_data);
    assert.equal(find(tree, n => n.type?.name === "TabPanel" && n.props.value === "data").props.keepMounted, true);
    let table = renderTable(tree);
    find(table, n => n.type === "input" && n.props["aria-label"] === "Search table").props.onChange({ target: { value: "station" } });
    find(table, n => n.type?.name === "Select").props.onChange("true");
    find(tree, n => n.type === "button" && n.props.children === "Raw").props.onClick();
    tree = renderResults(); table = renderTable(tree);
    assert.equal(tableElement(tree).props.data, result.raw_preview);
    assert.equal(tableElement(tree).props.filterFields, undefined);
    assert.equal(find(table, n => n.type === "input" && n.props["aria-label"] === "Search table").props.value, "station");
    find(table, n => n.type === "input" && n.props["aria-label"] === "Search table").props.onChange({ target: { value: "" } });
    table = renderTable(tree);
    assert.equal(find(table, n => n.type?.name === "Button" && n.props.children === "Clear filters"), null, "inactive cleaned filter must not show a filtered raw state");
    find(tree, n => n.type === "button" && n.props.children === "Cleaned").props.onClick();
    tree = renderResults(); table = renderTable(tree);
    assert.equal(find(table, n => n.type?.name === "Select").props.value, "true");
  } finally { reactOverride = undefined; cache.clear(); }
});

test("review opens the flagged Data view and keeps exports out of review", () => {
  cache.clear();
  let cursor = 0; const values = [];
  reactOverride = { ...React, useMemo: fn => fn(), useState: initial => {
    const i = cursor++;
    if (!(i in values)) values[i] = initial;
    return [values[i], next => { values[i] = next; }];
  } };
  function find(node, match) {
    if (!node || typeof node !== "object") return null;
    if (match(node)) return node;
    for (const child of React.Children.toArray(node.props?.children)) { const found = find(child, match); if (found) return found; }
    return null;
  }
  try {
    const { ZoneResults } = load("components/zones/ZoneResults");
    const { result: fixture } = load("../tests/fixtures");
    const high = { station_id: "A", date: "2023-01-01", rainfall: 30, is_anomaly: true };
    const low = { station_id: "B", date: "2023-01-01", rainfall: 0, is_anomaly: false, is_low_anomaly: true };
    const normal = { station_id: "C", date: "2023-01-01", rainfall: 3, is_anomaly: false };
    const result = { ...fixture, flagged_data: [high, low, normal] };
    const reviews = { '["A","2023-01-01"]': { status: "anomaly" } };
    for (const fitViewport of [true, false]) {
      values.length = 0;
      const render = () => { cursor = 0; return ZoneResults({ result, reviews, fitViewport, defaultTab: "anomalies" }); };
      let tree = render();
      assert.equal(find(tree, n => n.type?.name === "ExportMenu"), null);
      assert.equal(find(tree, n => n.type?.name === "FullAnomalyTable"), null);
      find(tree, n => n.type?.name === "AnomalyReportTab").props.onOpenData();
      tree = render();
      assert.equal(find(tree, n => n.type?.name === "Tabs").props.value, "data");
      assert.ok(find(tree, n => n.type?.name === "ExportMenu"));
      const table = find(tree, n => n.type?.name === "DataTable");
      assert.deepEqual(table.props.data.map(row => row.station_id), ["A", "B"]);
      assert.equal(table.props.data[0].review_status, "anomaly");
      assert.equal(table.props.data[1].review_status, "needs_review");
      assert.equal(table.props.filterFields[0].key, "review_status");
    }
  } finally { reactOverride = undefined; cache.clear(); }
});
test("history keeps a multi-file processing run in a single row with review and ticket counts", () => {
  const html = render(List);
  assert.equal((html.match(/class="runRow"/g) ?? []).length, 1);
  assert.match(html, /HMDAS-ScienceGarden.csv/);
  assert.match(html, /2 files/);
  assert.match(html, /Analyst One/);
  assert.match(html, /18 of 75/);
  assert.match(html, /57 remaining/);
  assert.match(html, /<progress[^>]*value="18"[^>]*max="75"[^>]*aria-label="18 of 75 readings reviewed"/);
  assert.match(html, /<label data-filter-field="true"><span>From<\/span><input[^>]*aria-label="Processed from"/);
  assert.match(html, /<label data-filter-field="true"><span>To<\/span><input[^>]*aria-label="Processed to"/);
  assert.match(html, new RegExp(`/history/${run.id}`));
});

test("History displays the analyst title while keeping older records readable by filename", () => {
  run.title = "October rainfall validation";
  try {
    const html = render(List);
    assert.match(html, /title="October rainfall validation"/);
    assert.match(html, /<strong>October rainfall validation<\/strong>/);
    assert.match(render(Detail), /<h2>October rainfall validation<\/h2>/);
  } finally { delete run.title; }
  assert.match(render(List), /HMDAS-ScienceGarden.csv/);
});

test("run details distinguish assigned technicians from inspection submitters and link to the exact ticket", () => {
  const html = render(Detail);
  assert.match(html, /Assigned Technician/);
  assert.match(html, /Inspecting Technician/);
  assert.match(html, /Submitted/);
  assert.match(html, /Revisit Needed/);
  assert.match(html, /\/tickets\?ticket=t-1/);
  assert.match(html, /Files and processing details/);
  assert.match(html, new RegExp(`/history/${run.id}/results`));
});

test("an open review confirmation keeps the save handler and note from before another analyst's update", async () => {
  const cells = []; let cursor = 0;
  reactOverride = {
    ...React, useEffect: () => {}, useMemo: (fn) => fn(), useRef: (value) => ({ current: value }),
    useState: (initial) => { const index = cursor++; if (!(index in cells)) cells[index] = typeof initial === "function" ? initial() : initial;
      return [cells[index], (update) => { cells[index] = typeof update === "function" ? update(cells[index]) : update; }]; },
  };
  const { AnomalyReportTab } = load("components/zones/AnomalyReportTab");
  const row = { station_id: "A", date: "2023-01-01", rainfall: 30, is_anomaly: true };
  const base = { status: "anomaly", note: "First inspection", reviewer_id: "one", reviewed_by: "One", reviewed_at: "2026-10-25", revision: 1 };
  cells[1] = "all"; // The analyst is reviewing an existing decision in All.
  function find(node, match) {
    if (!node || typeof node !== "object") return null;
    if (match(node)) return node;
    for (const child of React.Children.toArray(node.props?.children)) { const found = find(child, match); if (found) return found; }
    return null;
  }
  const report = AnomalyReportTab({ result: { flagged_data: [row] }, reviews: { '["A","2023-01-01"]': base } });
  const actions = find(report, (node) => node.type?.name === "ReviewActions");
  assert.ok(actions);
  cells.length = 0; cursor = 0;
  const calls = [];
  const originalSave = async (_key, review) => { calls.push([1, review.note]); };
  const newerSave = async (_key, review) => { calls.push([2, review.note]); };
  const props = { ...actions.props, reviewer: { id: "u1", full_name: "Analyst", username: "analyst" }, onReview: originalSave };
  const first = actions.type(props);
  const mark = find(first, (node) => node.props?.children?.[1] === " Not anomaly");
  assert.ok(mark);
  mark.props.onClick();
  cursor = 0;
  const updated = actions.type({ ...props, review: { ...base, revision: 2 }, onReview: newerSave });
  const confirmation = find(updated, (node) => node.props?.confirmLabel === "Mark as not anomaly");
  assert.ok(confirmation);
  await confirmation.props.onConfirm();
  assert.deepEqual(calls, [[1, "First inspection"]], "the confirmed action must not switch to the handler for an unseen revision");
  reactOverride = undefined;
});

test("reading evidence switches views while retaining the selected reading and review controls", () => {
  const cells = []; let cursor = 0;
  const reportPath = path.resolve(__dirname, "../src/components/zones/AnomalyReportTab.tsx");
  cache.delete(reportPath);
  reactOverride = {
    ...React, useEffect: () => {}, useMemo: (fn) => fn(), useRef: (value) => ({ current: value }),
    useState: (initial) => { const index = cursor++; if (!(index in cells)) cells[index] = typeof initial === "function" ? initial() : initial;
      return [cells[index], (update) => { cells[index] = typeof update === "function" ? update(cells[index]) : update; }]; },
  };
  function find(node, match) {
    if (!node || typeof node !== "object") return null;
    if (match(node)) return node;
    for (const child of React.Children.toArray(node.props?.children)) { const found = find(child, match); if (found) return found; }
    return null;
  }
  try {
    const { AnomalyReportTab } = load("components/zones/AnomalyReportTab");
    const row = { station_id: "A", date: "2023-01-01", rainfall: 30, is_anomaly: true };
    const renderReport = () => { cursor = 0; return AnomalyReportTab({ result: { flagged_data: [row] } }); };
    let report = renderReport();
    const reviewKey = find(report, (node) => node.type?.name === "ReviewActions").key;
    assert.ok(find(report, (node) => node.type?.name === "DateComparisonChart"));
    for (const [label, chart, detailsVisible] of [
      ["Show rainfall history", "StationChart", false],
      ["Show detection details", null, true],
      ["Show bar graph", "DateComparisonChart", false],
    ]) {
      find(report, (node) => node.props?.["aria-label"] === label).props.onClick();
      report = renderReport();
      assert.equal(find(report, (node) => node.props?.hidden !== undefined).props.hidden, !detailsVisible);
      assert.equal(!!find(report, (node) => node.type?.name === "StationChart"), chart === "StationChart");
      assert.equal(!!find(report, (node) => node.type?.name === "DateComparisonChart"), chart === "DateComparisonChart");
      assert.equal(find(report, (node) => node.type?.name === "ReviewActions").key, reviewKey);
      assert.equal(find(report, (node) => node.props?.["aria-label"] === label).props["aria-pressed"], true);
    }
  } finally { reactOverride = undefined; cache.delete(reportPath); }
});

test("live reviews retain the initial reading and its mounted note editor", () => {
  const cells = []; let cursor = 0; let effects = [];
  const reportPath = path.resolve(__dirname, "../src/components/zones/AnomalyReportTab.tsx");
  cache.delete(reportPath);
  reactOverride = {
    ...React, useMemo: (fn) => fn(), useRef: () => ({ current: null }), useEffect: (fn) => effects.push(fn),
    useState: (initial) => { const index = cursor++; if (!(index in cells)) cells[index] = typeof initial === "function" ? initial() : initial;
      return [cells[index], (update) => { cells[index] = typeof update === "function" ? update(cells[index]) : update; }]; },
  };
  function findActions(node) {
    if (!node || typeof node !== "object") return null;
    if (node.type?.name === "ReviewActions") return node;
    for (const child of React.Children.toArray(node.props?.children)) { const found = findActions(child); if (found) return found; }
    return null;
  }
  try {
    const { AnomalyReportTab } = load("components/zones/AnomalyReportTab");
    const rows = ["A", "B"].map((station_id) => ({ station_id, date: "2023-01-01", rainfall: 30, is_anomaly: true }));
    const render = (reviews) => {
      cursor = 0; effects = [];
      const report = AnomalyReportTab({ result: { flagged_data: rows }, reviews });
      effects.forEach((effect) => effect());
      return findActions(report);
    };
    const initial = render({});
    const updated = render({ '["A","2023-01-01"]': { status: "anomaly", note: "Updated by another analyst", revision: 1 } });
    assert.equal(initial.props.row.station_id, "A");
    assert.equal(updated.props.row.station_id, "A");
    assert.equal(updated.key, initial.key, "a live update must not unmount the editor and discard its draft");
    assert.equal(updated.props.review.status, "anomaly");
  } finally { reactOverride = undefined; cache.delete(reportPath); }
});

test("review actions explain an unsaved run and keep both judgments neutral and unavailable until saved", () => {
  const reportPath = path.resolve(__dirname, "../src/components/zones/AnomalyReportTab.tsx");
  cache.delete(reportPath);
  const cells = []; let cursor = 0;
  reactOverride = { ...React, useEffect() {}, useMemo: fn => fn(), useRef: value => ({ current: value }),
    useState: initial => { const i = cursor++; if (!(i in cells)) cells[i] = typeof initial === "function" ? initial() : initial;
      return [cells[i], value => { cells[i] = typeof value === "function" ? value(cells[i]) : value; }]; } };
  const find = (node, match) => {
    if (!node || typeof node !== "object") return null;
    if (match(node)) return node;
    for (const child of React.Children.toArray(node.props?.children)) { const found = find(child, match); if (found) return found; }
    return null;
  };
  try {
    const { AnomalyReportTab } = load("components/zones/AnomalyReportTab");
    const result = { run_id: "new-run", history_saved: false, flagged_data: [{ station_id: "A", date: "2023-01-01", rainfall: 30, is_anomaly: true }] };
    const reviewer = { id: "one", full_name: "Analyst", username: "analyst" };
    let saveRequests = 0;
    const report = AnomalyReportTab({ result, reviewer, onSaveRun: () => { saveRequests++; } });
    const actions = find(report, node => node.type?.name === "ReviewActions");
    cells.length = 0; cursor = 0;
    let body = actions.type(actions.props);
    assert.ok(find(body, node => node.type === "p" && node.props.children === "Save this run to enable reviews."));
    find(body, node => node.props?.children?.[1] === " Save to History").props.onClick();
    assert.equal(saveRequests, 1);
    for (const label of [" Anomaly", " Not anomaly"]) {
      const button = find(body, node => node.props?.children?.[1] === label);
      assert.equal(button.props.variant, "secondary");
      assert.equal(button.props.disabled, true);
    }
    cursor = 0;
    body = actions.type({ ...actions.props, requiresSave: false, onReview: async () => {} });
    assert.equal(find(body, node => node.props?.children?.[1] === " Anomaly").props.disabled, false);
    assert.equal(find(body, node => node.props?.children?.[1] === " Save to History"), null);
    assert.equal(find(body, node => node.type === "p" && node.props.children === "Save this run to enable reviews."), null);
    assert.ok(find(body, node => node.type === "p" && node.props.children === "Choose a decision, then confirm."), "guidance uses the same header slot after saving");
    cursor = 0;
    body = actions.type({ ...actions.props, requiresSave: false, onReview: async () => {}, busy: true });
    assert.ok(find(body, node => node.type === "p" && node.props.children === "Saving review…"));
  } finally { reactOverride = undefined; cache.delete(reportPath); }
});

test("Reviewed and All show status badges while Needs review stays compact", () => {
  const reportPath = path.resolve(__dirname, "../src/components/zones/AnomalyReportTab.tsx");
  cache.delete(reportPath);
  const cells = []; let cursor = 0;
  reactOverride = { ...React, useEffect() {}, useMemo: fn => fn(), useRef: value => ({ current: value }),
    useState: initial => { const i = cursor++; if (!(i in cells)) cells[i] = typeof initial === "function" ? initial() : initial;
      return [cells[i], value => { cells[i] = typeof value === "function" ? value(cells[i]) : value; }]; } };
  function all(node, match) {
    if (!node || typeof node !== "object") return [];
    return [...(match(node) ? [node] : []), ...React.Children.toArray(node.props?.children).flatMap(child => all(child, match))];
  }
  try {
    const { AnomalyReportTab } = load("components/zones/AnomalyReportTab");
    const result = { flagged_data: ["A", "B"].map(station_id => ({ station_id, date: "2023-01-01", rainfall: 30, is_anomaly: true })) };
    const reviews = {};
    const render = () => { cursor = 0; return AnomalyReportTab({ result, reviews }); };
    let tree = render();
    const queue = () => all(tree, node => node.props?.className === "queueList")[0];
    assert.equal(all(queue(), node => node.type?.name === "ReviewBadge").length, 0);
    assert.equal(all(queue(), node => node.props?.className === "sr-only" && node.props.children === "Needs review").length, 2);
    const { readingKey } = load("lib/anomalyReview");
    reviews[readingKey(result.flagged_data[0])] = { status: "anomaly", note: "", reviewed_by: "Analyst", reviewer_id: "analyst", reviewed_at: "2026-10-26T00:00:00Z" };
    all(tree, node => node.type === "button" && node.props.children?.[0] === "Reviewed")[0].props.onClick();
    tree = render();
    const reviewedBadges = all(queue(), node => node.type?.name === "ReviewBadge");
    assert.equal(reviewedBadges.length, 1);
    assert.equal(reviewedBadges[0].props.review.status, "anomaly");
    all(tree, node => node.type === "button" && node.props.children?.[0] === "All")[0].props.onClick();
    tree = render();
    const mixedBadges = all(queue(), node => node.type?.name === "ReviewBadge");
    assert.equal(mixedBadges.length, 2);
    assert.equal(mixedBadges.filter(node => !node.props.review).length, 1);
    assert.equal(mixedBadges.filter(node => node.props.review?.status === "anomaly").length, 1);
  } finally { reactOverride = undefined; cache.delete(reportPath); }
});

test("Data exports remain neutral and results are unavailable while reviews load or save", () => {
  const source = path.resolve(__dirname, "../src/components/zones/ZoneResults.tsx");
  cache.delete(source);
  reactOverride = { ...React, useMemo: fn => fn(), useState: initial => [initial, () => {}] };
  function find(node) {
    if (!node || typeof node !== "object") return null;
    if (node.type === "button" && node.props.children === "Results with reviews CSV") return node;
    for (const child of React.Children.toArray(node.props?.children)) { const found = find(child); if (found) return found; }
    return null;
  }
  try {
    const { ZoneResults } = load("components/zones/ZoneResults");
    const { result: fixture } = load("../tests/fixtures");
    const high = { station_id: "A", date: "2023-01-01", rainfall: 30, is_anomaly: true };
    const low = { station_id: "B", date: "2023-01-01", rainfall: 0, is_anomaly: false, is_low_anomaly: true };
    const result = { ...fixture, run_id: "saved-run", history_saved: true, flagged_data: [high, low] };
    const highReview = { '["A","2023-01-01"]': { status: "anomaly" } };
    const complete = { ...highReview, '["B","2023-01-01"]': { status: "not_anomaly" } };
    for (const [props, primary, disabled] of [
      [{ reviews: {} }, false, false],
      [{ reviews: highReview }, false, false],
      [{ reviews: complete }, true, false],
      [{ reviews: complete, reviewBusy: true }, false, true],
      [{ reviews: complete, reviewsReady: false }, false, true],
      [{ result: { ...result, history_saved: false }, reviews: complete }, false, false],
      [{ result: { ...result, run_id: undefined, history_saved: false }, reviews: complete }, true, false],
      [{ result: { ...result, flagged_data: [] }, reviews: complete }, false, false],
    ]) {
      const button = find(ZoneResults({ result, ...props, defaultTab: "data" }));
      assert.equal(button.props.className, "menu-item");
      assert.equal(button.props.disabled, disabled);
    }
  } finally { reactOverride = undefined; cache.delete(source); }
});


test("routine review save feedback stays out of layout while errors stay visible", () => {
  cache.clear();
  const { ReviewSaveStatus } = load("components/history/ReviewSaveStatus");
  const base = { ready: true, saving: false, error: null, saveError: null, retry() {} };
  for (const state of [base, { ...base, saving: true }, { ...base, ready: false }]) {
    const tree = ReviewSaveStatus({ state });
    assert.equal(tree.props.className, "sr-only", "save transitions must not insert a row above results");
    assert.equal(tree.props.role, "status");
  }
  const failed = ReviewSaveStatus({ state: { ...base, saveError: "Review was not saved." } });
  assert.equal(failed.props.className, "saveWarning");
  assert.match(renderToStaticMarkup(failed), /Review was not saved/);
  const loadError = ReviewSaveStatus({ state: { ...base, error: new Error("offline") } });
  assert.match(renderToStaticMarkup(loadError), /Retry/);
});


test("History applies search automatically and preserves sorting through filters and pagination", t => {
  cache.clear();
  const values = []; let cursor = 0, lastDeps, effect, cleanup, requested;
  const previousHook = hooks.useHistoryList;
  t.mock.timers.enable({ apis: ["setTimeout"] });
  reactOverride = { ...React,
    useState(initial) { const index = cursor++; if (!(index in values)) values[index] = initial;
      return [values[index], next => { values[index] = typeof next === "function" ? next(values[index]) : next; }]; },
    useEffect(fn, deps) { if (!lastDeps || deps.some((value, i) => value !== lastDeps[i])) { effect = fn; lastDeps = deps; } },
  };
  hooks.useHistoryList = filters => { requested = filters; return previousHook(); };
  const find = (node, match) => {
    if (!node || typeof node !== "object") return null;
    if (match(node)) return node;
    for (const child of React.Children.toArray(node.props?.children)) { const found = find(child, match); if (found) return found; }
    return null;
  };
  try {
    const Page = load("app/(dashboard)/history/page").default;
    const renderPage = () => { cursor = 0; const tree = Page(); if (effect) { cleanup?.(); cleanup = effect(); effect = null; } return tree; };
    let tree = renderPage();
    assert.equal(find(tree, n => n.props?.type === "submit"), null);
    find(tree, n => n.props?.["aria-label"] === "Search saved runs").props.onChange({ target: { value: "rain" } });
    renderPage(); t.mock.timers.tick(299);
    assert.equal(requested.search, "");
    t.mock.timers.tick(1); tree = renderPage();
    assert.equal(requested.search, "rain");
    find(tree, n => n.props?.["aria-label"] === "Processed from").props.onChange({ target: { value: "2026-10-01" } });
    tree = renderPage(); assert.equal(requested.start, "2026-10-01");
    find(tree, n => n.type?.name === "HistoryPagination").props.onChange(20);
    tree = renderPage(); assert.equal(requested.offset, 20);
    find(tree, n => n.props?.ariaLabel === "Sort saved runs").props.onChange("oldest");
    tree = renderPage(); assert.equal(requested.sort, "oldest"); assert.equal(requested.offset, 0);
    assert.equal(requested.start, "2026-10-01");
    find(tree, n => n.props?.["aria-label"] === "Search saved runs").props.onChange({ target: { value: "rainfall" } });
    renderPage(); t.mock.timers.tick(300); tree = renderPage();
    assert.equal(requested.search, "rainfall"); assert.equal(requested.sort, "oldest");
    find(tree, n => n.props?.type === "button" && React.Children.toArray(n.props.children).includes(" Clear")).props.onClick();
    tree = renderPage();
    assert.equal(requested.search, ""); assert.equal(requested.start, ""); assert.equal(requested.sort, "oldest");
  } finally { cleanup?.(); hooks.useHistoryList = previousHook; reactOverride = undefined; cache.clear(); }
});


test("Data search finds numeric values beyond the current page and combines words with filters", () => {
  cache.clear();
  let cursor = 0; const values = [];
  reactOverride = { ...React, useMemo: fn => fn(), useState(initial) {
    const index = cursor++;
    if (!(index in values)) values[index] = typeof initial === "function" ? initial() : initial;
    return [values[index], next => { values[index] = typeof next === "function" ? next(values[index]) : next; }];
  } };
  const find = (node, match) => {
    if (!node || typeof node !== "object") return null;
    if (match(node)) return node;
    for (const child of React.Children.toArray(node.props?.children)) { const found = find(child, match); if (found) return found; }
    return null;
  };
  try {
    const { DataTable } = load("components/zones/DataTable");
    const data = Array.from({ length: 25 }, (_, i) => ({ station: "Mandaluyong", date: "2023-12-31", rainfall: i === 24 ? 775.5 : i, flag: i === 24 ? "high" : "low" }));
    const props = { data, columns: ["station", "date", "rainfall"].map(key => ({ key, header: key })), filterFields: [{ key: "flag", label: "Flag", options: [] }] };
    const renderTable = () => { cursor = 0; return DataTable(props); };
    let tree = renderTable();
    find(tree, n => n.props?.["aria-label"] === "Search table").props.onChange({ target: { value: " mandaluyong 775.5 " } });
    tree = renderTable();
    assert.match(renderToStaticMarkup(tree), /775.5/);
    assert.match(renderToStaticMarkup(tree), /1–1 of 1 rows/);
    find(tree, n => n.type?.name === "Select").props.onChange("low");
    tree = renderTable(); assert.match(renderToStaticMarkup(tree), /0 rows/);
    find(tree, n => n.props?.children === "Clear filters").props.onClick();
    tree = renderTable(); assert.match(renderToStaticMarkup(tree), /1–10 of 25 rows/);
    data.push({ station: "Napindan_II", date: "2023-12-31", rainfall: 42, flag: "low" });
    find(tree, n => n.props?.["aria-label"] === "Search table").props.onChange({ target: { value: "N" } });
    tree = renderTable();
    const markup = renderToStaticMarkup(tree);
    assert.match(markup, /Napindan_II/);
    assert.doesNotMatch(markup, />Mandaluyong</);
    assert.match(markup, /1–1 of 1 rows/);
    assert.equal(data[0].station, "Mandaluyong", "search must not reorder source data");
    find(tree, n => n.props?.["aria-label"] === "Search table").props.onChange({ target: { value: "" } });
    tree = renderTable(); assert.doesNotMatch(renderToStaticMarkup(tree), /Napindan_II/);

  } finally { reactOverride = undefined; cache.clear(); }
});

test("saved summaries show cached data during refresh, skip empty tickets, and prefetch only on intent", () => {
  cache.clear();
  const original = { ...hooks };
  let cursor = 0; const states = [], reads = [], routes = [];
  const originalPrefetch = navigation.prefetch;
  navigation.prefetch = route => routes.push(route);
  reactOverride = { ...React, useState(initial) {
    const index = cursor++;
    if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
    return [states[index], next => { states[index] = typeof next === "function" ? next(states[index]) : next; }];
  } };
  const find = (node, match) => {
    if (!node || typeof node !== "object") return null;
    if (match(node)) return node;
    for (const child of React.Children.toArray(node.props?.children)) { const found = find(child, match); if (found) return found; }
    return null;
  };
  hooks.useHistoryRun = () => ({ data: { ...run, open_tickets: 0, verified_tickets: 0, cancelled_tickets: 0 }, isLoading: true });
  hooks.useHistoryTickets = (id, offset, enabled) => { reads.push({ resource: "tickets", enabled }); return {}; };
  hooks.usePrefetchHistoryResults = id => () => { reads.push({ resource: "results", id }); return Promise.resolve(); };
  try {
    const Page = load("app/(dashboard)/history/[id]/page").default;
    const renderPage = () => { cursor = 0; return Page(); };
    let tree = renderPage();
    assert.ok(find(tree, n => n.props?.href === `/history/${run.id}/results`), "cached summary is visible during revalidation");
    assert.deepEqual(reads, [{ resource: "tickets", enabled: false }]);
    assert.deepEqual(routes, []);
    find(tree, n => n.props?.href === `/history/${run.id}/results`).props.onFocus();
    assert.deepEqual(reads.at(-1), { resource: "results", id: run.id }, "prefetch must start before another render or navigation");
    assert.deepEqual(routes, [`/history/${run.id}/results`]);
    tree = renderPage();
    hooks.useHistoryRun = () => ({ data: run });
    renderPage();
    assert.equal(reads.at(-1).enabled, true, "linked tickets are still fetched when present");
  } finally { Object.assign(hooks, original); navigation.prefetch = originalPrefetch; reactOverride = undefined; cache.clear(); }
});
