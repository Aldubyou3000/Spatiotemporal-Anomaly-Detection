// Run from web/: node --test tests/*.test.cjs
const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const file = path.resolve(__dirname, "../src/lib/anomalyReview.ts");
const mod = { exports: {} };
if (fs.existsSync(file)) {
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  new Function("exports", "require", "module", code)(mod.exports, require, mod);
}
const { readingKey, flaggedReadings, exportReviewedReadings, nextPendingReading } = mod.exports;
const high = { station_id: "A", date: "2023-09-01", rainfall: 100, is_anomaly: true, is_low_anomaly: false, is_dry_stuck: false, lof_score: -8 };
const low = { ...high, station_id: "B", rainfall: 0, is_anomaly: false, is_low_anomaly: true };
const normal = { ...high, station_id: "C", rainfall: 20, is_anomaly: false };

test("review identity separates stations and dates even with punctuation in station IDs", () => {
  assert.equal(typeof readingKey, "function", "a shared station/date identity is required");
  assert.notEqual(readingKey(high), readingKey({ ...high, station_id: "B" }));
  assert.notEqual(readingKey(high), readingKey({ ...high, date: "2023-09-02" }));
  assert.notEqual(readingKey({ station_id: "A|B", date: "C" }), readingKey({ station_id: "A", date: "B|C" }));
});

test("review queue includes high and low flags, retains zero rain, and excludes unflagged readings", () => {
  assert.equal(typeof flaggedReadings, "function", "the queue must include both directions");
  const legacyLow = { ...low, date: "2023-09-02", is_low_anomaly: false, is_dry_stuck: true };
  const rows = flaggedReadings([high, low, normal, legacyLow]);
  assert.deepEqual(rows.map((r) => [r.station_id, r.date, r.rainfall]), [["B", "2023-09-02", 0], ["A", "2023-09-01", 100], ["B", "2023-09-01", 0]]);
});

test("CSV preserves dismissed system flags and includes pending and unflagged rows distinctly", () => {
  assert.equal(typeof exportReviewedReadings, "function", "downloads need analyst review metadata");
  const rows = [high, low, normal];
  const before = JSON.stringify(rows);
  const reviews = { '["A","2023-09-01"]': { status: "not_anomaly", note: "Nearby storm confirmed", reviewed_by: "Analyst One", reviewer_id: "user-1", reviewed_at: "2026-10-24T01:00:00Z" } };
  const exported = exportReviewedReadings(rows, reviews);
  assert.equal(exported.length, 3);
  assert.equal(exported[0].is_anomaly, true);
  assert.equal(exported[0].lof_score, -8);
  assert.equal(exported[0].review_status, "not_anomaly");
  assert.equal(exported[0].review_note, "Nearby storm confirmed");
  assert.equal(exported[0].reviewed_by, "Analyst One");
  assert.equal(exported[0].reviewer_id, "user-1");
  assert.equal(exported[0].reviewed_at, "2026-10-24T01:00:00Z");
  assert.equal(exported[1].review_status, "needs_review");
  assert.equal(exported[2].review_status, "not_flagged");
  assert.equal(JSON.stringify(rows), before, "review must not rewrite detector output");
  assert.equal(exportReviewedReadings([normal], reviews)[0].review_note, "");
});

test("Next pending skips reviewed readings, wraps, and stops when all have decisions", () => {
  assert.equal(typeof nextPendingReading, "function", "pending navigation is required");
  const rows = [high, low];
  const reviews = { '["A","2023-09-01"]': { status: "anomaly" } };
  assert.equal(nextPendingReading(rows, reviews, '["A","2023-09-01"]'), '["B","2023-09-01"]');
  assert.equal(nextPendingReading(rows, {}, '["B","2023-09-01"]'), '["A","2023-09-01"]');
  assert.equal(nextPendingReading(rows, { ...reviews, '["B","2023-09-01"]': { status: "not_anomaly" } }, '["B","2023-09-01"]'), null);
  assert.equal(nextPendingReading([], {}, ""), null);
});

test("downloaded review notes remain spreadsheet text, including formula-like notes and multiline explanations", () => {
  const csvFile = path.resolve(__dirname, "../src/lib/csv.ts");
  const csvModule = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(csvFile, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  new Function("exports", "require", "module", code)(csvModule.exports, require, csvModule);
  const csv = csvModule.exports.toCsv([{ review_note: '=HYPERLINK("https://example.com")', rainfall: -1 }, { review_note: "Storm, confirmed\nby analyst", rainfall: 0 }]);
  assert.ok(csv.includes('"\'=HYPERLINK(""https://example.com"")"'), "formula-like notes must export as text");
  assert.ok(csv.includes('"Storm, confirmed\nby analyst"'));
  assert.ok(csv.includes(",-1\n"), "numeric rainfall must remain numeric");
});
