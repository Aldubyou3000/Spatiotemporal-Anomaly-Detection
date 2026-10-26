const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { test } = require("node:test");
const ts = require("typescript");
function load(file, dependencies = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, "../src", file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 }
  }).outputText;
  const mod = { exports: {} };
  new Function("require", "module", "exports", code)(name => dependencies[name], mod, mod.exports);
  return mod.exports;
}
const { matchesSearch, matchesTicketSearch } = load("lib/search.ts");
test("search trims, ignores station separators and matches words across fields", () => {
  assert.ok(matchesSearch(["Marikina_Youth_Camp_1", "2023-12-31"], "  MARIKINA youth 2023-12  "));
  assert.ok(matchesSearch(["Lynn Rocamora", "analyst@example.com"], "lynn example.com"));
  assert.ok(matchesSearch(["Mandaluyong", 16.5], "16.5"));
  assert.ok(matchesSearch([null, undefined], "  "));
  assert.equal(matchesSearch(["Napindan_II", "2023-12-31"], "valenzuela"), false);
  assert.equal(matchesSearch(["Lynn"], "nobody lynn"), false);
});
test("prefix search excludes letters inside station names", () => {
  for (const query of ["n", "N", " nap ", "Napindan II"]) {
    assert.ok(matchesSearch(["Napindan_II", "2023-12-31", 12.5], query));
    assert.equal(matchesSearch(["Mandaluyong", "2023-12-31", 12.5], query), false);
  }
  assert.equal(matchesSearch(["Mandaluyong"], "andal"), false);
  assert.equal(matchesSearch(["Napindan_II"], "pindan"), false);
  assert.ok(matchesSearch(["Mandaluyong"], "man"));
});
test("ticket letters and numbers follow Zones prefix rules", () => {
  const ticket = { ticket_number: 24, title: "Inspect rainfall", station_id: "Napindan_II", technicians: [{ full_name: "Lynn Rocamora" }] };
  for (const query of ["2", "24", "TKT-2", "TKT #2", "#2", "n", "NAP", "2 nap", "lynn"]) {
    assert.ok(matchesTicketSearch(ticket, query), query);
  }
  for (const query of ["4", "25", "pindan", "man", "TKT-4"]) {
    assert.equal(matchesTicketSearch(ticket, query), false, query);
  }
  assert.ok(matchesSearch([16.5], "16"));
  assert.equal(matchesSearch([16.5], "6"), false);
});
test("search skips unused fields for blank queries and early prefix matches", () => {
  const unused = { toString() { throw new Error("unneeded field was normalized"); } };
  assert.ok(matchesSearch([unused], "   "));
  assert.ok(matchesSearch(["Napindan_II", unused], "n"));
  const ticket = { get ticket_number() { throw new Error("blank search inspected ticket"); } };
  assert.ok(matchesTicketSearch(ticket, "  "));
});
test("ticket list searches can reach records beyond the first API page", async () => {
  const calls = [];
  const rows = Array.from({ length: 125 }, (_, id) => ({ id: String(id), title: id === 124 ? "Find this older ticket" : "Ticket" }));
  const { ticketsApi } = load("lib/api/tickets.ts", { "./client": { apiClient: { get: async (url, { params }) => {
    calls.push(params);
    return { items: rows.slice(params.offset, params.offset + params.limit), total: rows.length };
  } } } });
  const result = await ticketsApi.listAll({ status: "assigned" });
  assert.equal(result.items.length, 125);
  assert.ok(result.items.some(row => matchesSearch([row.title], "older ticket")));
  assert.deepEqual(calls.map(call => [call.status, call.offset, call.limit]), [["assigned", 0, 100], ["assigned", 100, 100]]);
});
test("ticket pagination stops on an empty page and propagates request failures", async () => {
  let calls = 0;
  const { ticketsApi } = load("lib/api/tickets.ts", { "./client": { apiClient: { get: async () => {
    calls++;
    return { items: [], total: 200 };
  } } } });
  assert.equal((await ticketsApi.listAll()).items.length, 0);
  assert.equal(calls, 1);
  ticketsApi.list = async () => { throw new Error("offline"); };
  await assert.rejects(ticketsApi.listAll(), /offline/);
});
