const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const cache = new Map();
let hookOverride;
function load(source) {
  const base = path.resolve(__dirname, '../src', source);
  const file = [base, `${base}.ts`, `${base}.tsx`].find(fs.existsSync);
  if (cache.has(file)) return cache.get(file).exports;
  const mod = { exports: {} }; cache.set(file, mod);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  new Function('require', 'module', 'exports', code)(name => name === 'react' ? hookOverride || React
    : name === 'next/dynamic' ? () => function MapStub() { return React.createElement('div', { 'data-map': true }); }
    : name.endsWith('.css') ? { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) }
    : name.startsWith('@/') ? load(name.slice(2)) : require(name), mod, mod.exports);
  return mod.exports;
}
function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const child of React.Children.toArray(node.props?.children)) {
    const found = find(child, predicate); if (found) return found;
  }
  return null;
}

test('overview exposes four related sections and keeps warning and quality guidance discoverable', () => {
  const { OverviewTab } = load('components/zones/OverviewTab');
  const { result } = load('components/design/fixtures');
  const html = renderToStaticMarkup(React.createElement(OverviewTab, { result }));
  assert.match(html, /role="tab"[^>]*aria-selected="true"[^>]*>Overview/);
  assert.match(html, /Station summary/);
  assert.match(html, /Data quality/);
  assert.match(html, /Nearby stations/);
  assert.match(html, /aria-label="\d+ station warnings"/);
  assert.match(html, /aria-label="Run details"/);
  assert.doesNotMatch(html, /Review data quality|View station summary/);
  assert.equal((html.match(/data-map="true"/g) || []).length, 1);
  assert.equal((html.match(/role="tabpanel"[^>]*hidden=""/g) || []).length, 3);
});

test('section changes leave the map outside the tabs and station selection reaches it', () => {
  cache.clear();
  const values = []; let cursor = 0;
  hookOverride = { ...React, useMemo: fn => fn(), useState: initial => {
    const index = cursor++;
    if (!(index in values)) values[index] = initial;
    return [values[index], next => { values[index] = next; }];
  } };
  try {
    const { OverviewTab } = load('components/zones/OverviewTab');
    const { result } = load('components/design/fixtures');
    const render = () => { cursor = 0; return OverviewTab({ result }); };
    const first = render();
    const map = find(first, n => n.type?.name === 'MapStub');
    const tabs = find(first, n => n.type?.name === 'Tabs');
    assert.equal(find(tabs, n => n.type?.name === 'MapStub'), null);
    tabs.props.onValueChange('stations');
    const second = render();
    assert.equal(find(second, n => n.type?.name === 'MapStub').type, map.type);
    const summary = find(second, n => n.type?.name === 'StationReviewCard');
    summary.props.onSelectStation(result.flagged_data[0].station_id);
    assert.equal(find(render(), n => n.type?.name === 'MapStub').props.selectedStationId, result.flagged_data[0].station_id);
    tabs.props.onValueChange('neighbors');
    const nearby = find(render(), n => n.type?.name === 'NeighborGroupsTab');
    const station = Object.keys(result.neighbors).at(-1);
    nearby.props.onSelectStation(station);
    const selected = render();
    assert.equal(find(selected, n => n.type?.name === 'MapStub').props.selectedStationId, station);
    assert.deepEqual(find(selected, n => n.type?.name === 'MapStub').props.highlightedStationIds, result.neighbors[station].map(n => n.neighbor_id));
    tabs.props.onValueChange('overview');
    assert.deepEqual(find(render(), n => n.type?.name === 'MapStub').props.highlightedStationIds, []);
  } finally { hookOverride = undefined; cache.clear(); }
});

test('nearby station panel shows distances in order and handles empty neighbor lists', () => {
  const { NeighborGroupsTab } = load('components/zones/NeighborGroupsTab');
  const neighbors = { A: [{ neighbor_id: 'C', distance_km: 9 }, { neighbor_id: 'B', distance_km: 2 }], D: [] };
  const html = renderToStaticMarkup(React.createElement(NeighborGroupsTab, { neighbors, selectedStationId: 'A' }));
  const text = html.replace(/<[^>]*>/g, '');
  assert.ok(text.indexOf('2.00 km') < text.indexOf('9.00 km'));
  assert.match(html, /Selected station/);
  assert.match(renderToStaticMarkup(React.createElement(NeighborGroupsTab, { neighbors, selectedStationId: 'D' })), /No nearby comparison stations/);
  assert.match(renderToStaticMarkup(React.createElement(NeighborGroupsTab, { neighbors: {} })), /No nearby station data/);
});

test('an empty run retains navigation and an honest empty station summary', () => {
  const { OverviewTab } = load('components/zones/OverviewTab');
  const { result } = load('components/design/fixtures');
  const html = renderToStaticMarkup(React.createElement(OverviewTab, { result: {
    ...result, flagged_data: [], station_health: [], station_stuck_health: [],
  } }));
  assert.match(html, /No stations to assess/);
  assert.match(html, /aria-label="0 station warnings"/);
  assert.match(html, /0 stations/);
});

test('data quality leads with affected checks and can reveal zero-count checks', () => {
  cache.clear();
  const values = []; let cursor = 0;
  hookOverride = { ...React, useMemo: fn => fn(), useState: initial => {
    const index = cursor++;
    if (!(index in values)) values[index] = initial;
    return [values[index], next => { values[index] = typeof next === 'function' ? next(values[index]) : next; }];
  } };
  try {
    const { OverviewTab } = load('components/zones/OverviewTab');
    const { result } = load('components/design/fixtures');
    const quality = { ...result.quality_report, rows_filled: 127,
      exclusion_details: Object.fromEntries(Object.keys(result.quality_report.exclusion_details).map(key => [key, 0])) };
    quality.exclusion_details.multi_hour_gaps = 9023;
    quality.exclusion_details.incomplete_days = 319;
    const render = () => {
      cursor = 0;
      const tree = OverviewTab({ result: { ...result, quality_report: quality } });
      const card = find(tree, node => node.type?.name === 'QualityReportCard');
      return card.type(card.props);
    };
    const initial = render();
    const html = renderToStaticMarkup(initial);
    assert.match(html, /9,023/);
    assert.match(html, /319/);
    assert.match(html, /127/);
    assert.match(html, /Missing 2\+ hours/);
    assert.doesNotMatch(html, /Duplicate hour/);
    const toggle = find(initial, node => node.props?.['aria-expanded'] === false);
    assert.ok(toggle, 'one disclosure reveals checks with no findings');
    toggle.props.onClick();
    const expanded = renderToStaticMarkup(render());
    assert.match(expanded, /Duplicate hour/);
    assert.match(expanded, /aria-expanded="true"/);
  } finally { hookOverride = undefined; cache.clear(); }
});

test('interpolation-only quality keeps the fill count visible without reporting exclusions', () => {
  const { OverviewTab } = load('components/zones/OverviewTab');
  const { result } = load('components/design/fixtures');
  const quality = { ...result.quality_report, rows_filled: 12, stations_excluded: 0, rows_excluded: 0,
    exclusion_details: Object.fromEntries(Object.keys(result.quality_report.exclusion_details).map(key => [key, 0])) };
  const html = renderToStaticMarkup(React.createElement(OverviewTab, { result: { ...result, quality_report: quality } }));
  assert.match(html, /No exclusions recorded/);
  assert.match(html, /12 hourly gaps filled/);
  assert.doesNotMatch(html, /All stations passed quality checks/);
});
