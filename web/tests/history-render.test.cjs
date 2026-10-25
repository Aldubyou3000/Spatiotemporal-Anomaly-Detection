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
  useHistoryList: () => ({ data: { items: [run], total: 1 }, mutate: () => {} }),
  useHistoryRun: () => ({ data: run, mutate: () => {} }),
  useHistoryTickets: () => ({ data: { items: [ticket], total: 1 }, mutate: () => {} }),
};
const cache = new Map();
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
    : name === "next/navigation" ? { useParams: () => ({ id: run.id }), usePathname: () => "/history" }
    : name.startsWith("@/") ? load(name.slice(2))
    : name.startsWith(".") ? load(path.relative(path.resolve(__dirname, "../src"), path.resolve(path.dirname(file), name))) : require(name);
  new Function("require", "module", "exports", code)(req, mod, mod.exports);
  return mod.exports;
}
const List = load("app/(dashboard)/history/page").default;
const Detail = load("app/(dashboard)/history/[id]/page").default;
const { ToastProvider } = load("components/ui/Toast");
const render = (Component) => renderToStaticMarkup(React.createElement(ToastProvider, null, React.createElement(Component)));

test("history keeps a multi-file processing run in a single row with review and ticket counts", () => {
  const html = render(List);
  assert.equal((html.match(/class="runRow"/g) ?? []).length, 1);
  assert.match(html, /HMDAS-ScienceGarden.csv/);
  assert.match(html, /2 files/);
  assert.match(html, /Analyst One/);
  assert.match(html, /18 of 75/);
  assert.match(html, /57 remaining/);
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
  const mark = find(first, (node) => node.props?.children?.[1] === " Mark as not anomaly");
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
