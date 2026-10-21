// Run from web/: node tests/station-review.test.cjs
const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

// Use the installed compiler to exercise the actual TS helpers and components without a test dependency.
const cache = new Map();
function load(source) {
  const base = path.resolve(__dirname, "../src", source);
  const file = [base, `${base}.ts`, `${base}.tsx`].find((p) => fs.existsSync(p));
  if (cache.has(file)) return cache.get(file).exports;
  const mod = { exports: {} };
  cache.set(file, mod);
  const compiled = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2017 },
  }).outputText;
  const localRequire = (name) => name === "next/dynamic" ? () => () => null
    : name.startsWith("@/") ? load(name.slice(2))
    : name.startsWith(".") ? load(path.relative(path.resolve(__dirname, "../src"), path.resolve(path.dirname(file), name))) : require(name);
  new Function("require", "module", "exports", compiled)(localRequire, mod, mod.exports);
  return mod.exports;
}

const { REVIEW_STATUS, overallReviewStatus, highReview, lowReview } = load("lib/stationReview");
const { OverviewTab } = load("components/zones/OverviewTab");
const high = { station_id: "ExampleStation", latitude: 14.6, longitude: 121, status: "normal", bias_ratio: 1, rain_days: 20, top_rate: 0.2, times_flagged: 12, median_group_size: 4, peak_rainfall: 70, peak_date: "2023-01-01" };
const low = { ...high, zero_rate: 0.1, max_zero_streak: 2, events: [{ date: "2023-01-02", rainfall: 0, group_median: 20 }, { date: "2023-01-04", rainfall: 1, group_median: 20 }] };
function fixture(h = high, l = low) {
  return {
    station_health: [h], station_stuck_health: [l], dry_stuck_summary: [{ station_id: high.station_id, stuck_count: l.events.length, events: l.events }],
    anomaly_summary: [{ station_id: high.station_id, latitude: 14.6, longitude: 121, anomaly_count: 12, events: Array.from({ length: 12 }, () => ({ is_low: false })) }],
    flagged_data: [{ station_id: high.station_id, latitude: 14.6, longitude: 121, is_anomaly: true }],
    summary: { total_rows: 100, total_stations: 1, total_anomalies: 14, anomalous_stations: 1, anomaly_rate: 14, processing_time_seconds: 1 },
    quality_report: { total_input_rows: 100, total_input_stations: 1, stations_excluded: 0, rows_excluded: 0, rows_filled: 0, exclusion_details: {} },
  };
}

test("normal is neutral and missing assessments never imply reliability", () => {
  assert.equal(REVIEW_STATUS.normal.tone, "neutral");
  assert.equal(overallReviewStatus("normal", "normal"), "normal");
  assert.equal(overallReviewStatus("normal", undefined), "insufficient_data");
  assert.equal(overallReviewStatus(undefined, undefined), "insufficient_data");
  assert.equal(overallReviewStatus("watch", "normal"), "watch");
  assert.equal(overallReviewStatus("normal", "suspect"), "suspect");
});

test("wording distinguishes low recorded rain, missing data, and assessed-day runs", () => {
  assert.match(lowReview(low).tip, /0–1 mm on 2 of 20/);
  assert.match(lowReview(low).tip, /separated by dry days or gaps/);
  assert.match(lowReview(low).tip, /not missing measurements/);
  assert.match(highReview({ ...high, bias_ratio: null, rain_days: 1, status: "suspect", peak_rainfall: 300 }).detail, /300.0 mm/);
  assert.match(highReview(null).title, /Not enough data/);
  assert.doesNotMatch(JSON.stringify([highReview(high), lowReview(low)]), /Reliable|No drift|no reading/);
});

test("overview keeps flags visible alongside a neutral overall summary", () => {
  const html = renderToStaticMarkup(React.createElement(OverviewTab, { result: fixture() }));
  const card = html.slice(html.indexOf('aria-label="Station Review Summary"'));
  assert.match(card, /12 high/);
  assert.match(card, /2 low/);
  assert.match(card, /Flagged days still need review/);
  assert.match(card, /No overall warning/);
  assert.doesNotMatch(card, /Reliable|No drift|sensor fault, not just weather/);
});

test("overview reports limited data without an all-reliable success message", () => {
  const insufficient = { ...high, status: "insufficient_data", bias_ratio: null, top_rate: null, rain_days: 0 };
  const html = renderToStaticMarkup(React.createElement(OverviewTab, { result: fixture(insufficient, { ...low, ...insufficient, events: [], zero_rate: null }) }));
  assert.match(html, /1 with limited data/);
  assert.doesNotMatch(html, /All .*reliable|All sensors look consistent/);
});

test("anomaly report explains zero-neighbor rainfall instead of switching to a huge LOF number", () => {
  const { AnomalyReportTab } = load("components/zones/AnomalyReportTab");
  const { ThemeProvider } = load("context/ThemeContext");
  const result = fixture();
  result.neighbors = { ExampleStation: ["B", "C", "D"].map((neighbor_id) => ({ neighbor_id, distance_km: 1 })) };
  result.anomaly_summary[0].events = [{ date: "2023-01-01", rainfall: 70, lof_score: -30623.9, is_low: false }];
  result.flagged_data = ["ExampleStation", "B", "C", "D"].map((station_id) => ({ station_id, date: "2023-01-01", rainfall: station_id === "ExampleStation" ? 70 : 0, is_anomaly: station_id === "ExampleStation" }));
  const html = renderToStaticMarkup(React.createElement(ThemeProvider, null, React.createElement(AnomalyReportTab, { result })));
  assert.match(html, /Nearby typical rainfall: 0 mm/);
  assert.match(html, /No overall warning for high readings/);
  assert.match(html, /Review the flagged days below/);
  assert.doesNotMatch(html, /LOF -30623|Reliable|No drift/);
});

test("station guide stays compact with evidence in tooltips", () => {
  const html = renderToStaticMarkup(React.createElement(OverviewTab, { result: fixture({ ...high, status: "watch", bias_ratio: 1.26 }) }));
  const card = html.slice(html.indexOf('aria-label="Station Review Summary"'));
  const visible = card.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
  assert.match(visible, /Averages 26% higher/);
  assert.doesNotMatch(visible, /Average comparison|Highest in the group|How to read this summary|rainy days assessed/);
  assert.ok(visible.split(" ").length < 85, "guide uses a short row rather than an article");
  assert.match(card, /title="[^"]*Highest in the group/);
});

test("mixed warnings retain the peak and low-reading reason without repeating paragraphs", () => {
  const h = { ...high, status: "suspect", bias_ratio: 1.13, peak_rainfall: 775.5 };
  const l = { ...low, status: "watch" };
  const html = renderToStaticMarkup(React.createElement(OverviewTab, { result: fixture(h, l) }));
  const card = html.slice(html.indexOf('aria-label="Station Review Summary"'));
  const visible = card.replace(/<[^>]*>/g, " ");
  assert.match(visible, /775.5 mm/);
  assert.match(visible, /0–1 mm on 2 rainy days/);
  assert.doesNotMatch(visible, /High readings|Low readings|Longest low-reading run/);
});

test("warning rows stay visible while other stations are behind the compact toggle", () => {
  const result = fixture({ ...high, status: "watch" });
  result.station_health.push({ ...high, station_id: "OtherStation" });
  result.station_stuck_health.push({ ...low, station_id: "OtherStation" });
  const html = renderToStaticMarkup(React.createElement(OverviewTab, { result }));
  const card = html.slice(html.indexOf('aria-label="Station Review Summary"'));
  assert.match(card, /ExampleStation/);
  assert.doesNotMatch(card, /OtherStation/);
  assert.match(card, /aria-expanded="false"/);
  assert.match(card, /Show 1 other station/);
});
