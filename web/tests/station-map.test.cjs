const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');

function harness(selectedStationId, highlightedStationIds) {
  const effects = [], refs = [], frames = new Map(), markers = [], calls = [], tiles = [];
  let frameId = 0, observer, zoom = 7, removed = false, options, refCursor = 0;
  const map = {
    invalidateSize: opts => { assert.equal(removed, false, 'removed maps must never receive resize work'); calls.push(['measure', opts]); },
    fitBounds: (_bounds, opts) => { calls.push(['fit', opts]); zoom = 10; },
    // Simulate the old mismatch: 40px total padding returns a higher zoom than 40px per side.
    getBoundsZoom: () => 11,
    setMinZoom: value => { calls.push(['min', value]); if (value > zoom) { calls.push(['implicitZoom', value]); zoom = value; } },
    getZoom: () => zoom, setMaxBounds() {}, remove: () => { removed = true; },
  };
  const L = {
    map: (_container, opts) => { removed = false; options = opts; return map; },
    tileLayer: (url, options) => { tiles.push({ url, options }); return { addTo() { return this; }, remove() {} }; },
    circleMarker: (_point, opts) => {
      const marker = { options: opts, addTo() { return this; }, bindPopup() {}, bindTooltip(text, options) { this.tooltip = { text, options }; }, getTooltip() { return this.tooltip; }, openTooltip() { this.tooltipOpen = true; }, closeTooltip() { this.tooltipOpen = false; }, bringToFront() {}, setStyle(style) { Object.assign(this.options, style); }, remove() { this.removed = true; } };
      markers.push(marker); return marker;
    },
    latLngBounds: () => { const points = []; return { extend: p => points.push(p), isValid: () => points.length > 0, pad() { return this; } }; },
    point: (x, y) => ({ x, y }),
  };
  const globals = ['window', 'document', 'ResizeObserver', 'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle'];
  const previous = Object.fromEntries(globals.map(name => [name, global[name]]));
  global.window = {}; global.document = { documentElement: {} };
  global.getComputedStyle = () => ({ getPropertyValue: name => ({ '--brand': '#1E6FD9', '--on-brand-soft': '#123E75', '--text-secondary': '#3C4043', '--danger': '#DC2626', '--success': '#16A34A' })[name] || '#DC2626' });
  global.requestAnimationFrame = callback => { const id = ++frameId; frames.set(id, callback); return id; };
  global.cancelAnimationFrame = id => frames.delete(id);
  global.ResizeObserver = class { constructor(callback) { observer = callback; } observe() {} disconnect() { calls.push(['disconnect']); } };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/components/zones/StationMap.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => name === 'react' ? { ...React, useEffect: fn => effects.push(fn), useMemo: fn => fn(), useRef: value => { const i = refCursor++; return refs[i] ??= { current: value }; } }
    : name === 'leaflet' ? { __esModule: true, default: L }
    : name.endsWith('.css') ? {}
    : name === '@/lib/stationReview' ? { REVIEW_STATUS: { normal: { label: 'No overall warning' } } }
    : name === '@/context/ThemeContext' ? { useTheme: () => ({ theme: 'light' }) } : require(name), mod, mod.exports);
  let props = { selectedStationId, highlightedStationIds, stations: [
    { station_id: 'Flagged', latitude: 14.6, longitude: 121, anomaly_count: 4, total_readings: 30 },
    { station_id: 'Typical', latitude: 14.7, longitude: 121.1, anomaly_count: 0, total_readings: 30 },
  ] };
  const render = next => { props = { ...props, ...next }; effects.length = 0; refCursor = 0; mod.exports.StationMap(props); };
  render();
  refs[0].current = {};
  let cleanup = effects[0](); effects[1](); effects[2]();
  return { options: () => options, calls, markers, frames, tiles, render, select: () => effects[3](), resize: () => observer(), updateStations: () => effects[2](), cleanup: () => cleanup(),
    remount() { cleanup(); cleanup = effects[0](); effects[1](); effects[2](); effects[3](); },
    close() { for (const name of globals) { if (previous[name] === undefined) delete global[name]; else global[name] = previous[name]; } },
  };
}

test('station selection highlights its marker without refitting or enlarging circles', () => {
  const h = harness('Typical');
  try {
    const fits = h.calls.filter(call => call[0] === 'fit').length;
    h.select();
    assert.equal(h.markers[3].options.weight, 4);
    assert.equal(h.markers[2].options.weight, 3);
    assert.deepEqual(h.markers.map(marker => marker.options.radius), [20, 14, 10, 5]);
    assert.equal(h.calls.filter(call => call[0] === 'fit').length, fits);
  } finally { h.cleanup(); h.close(); }
});

test('neighbor emphasis changes outlines without changing fill colors or zoom', () => {
  const h = harness('Typical', ['Flagged']);
  try {
    const fits = h.calls.filter(call => call[0] === 'fit').length;
    const fills = h.markers.map(marker => marker.options.fillColor);
    h.select();
    assert.equal(h.markers[2].options.color, '#3C4043', 'neighbors must not look like blue selections');
    assert.equal(h.markers[3].options.weight, 4);
    assert.deepEqual(h.markers.map(marker => marker.options.fillColor), fills);
    assert.deepEqual(h.markers.map(marker => marker.options.radius), [20, 14, 10, 5]);
    assert.equal(h.calls.filter(call => call[0] === 'fit').length, fits);
  } finally { h.cleanup(); h.close(); }
});

test('rapid station changes and clearing selection restore every previous outline', () => {
  const h = harness('Flagged', ['Typical']);
  try {
    const fits = h.calls.filter(call => call[0] === 'fit').length;
    h.select();
    assert.equal(h.markers[2].options.color, '#1E6FD9');
    h.render({ selectedStationId: 'Typical', highlightedStationIds: [] }); h.select();
    assert.equal(h.markers[2].options.color, '#ffffff');
    assert.equal(h.markers[2].options.weight, 3);
    assert.equal(h.markers[3].options.color, '#1E6FD9');
    h.render({ selectedStationId: undefined, highlightedStationIds: [] }); h.select();
    assert.equal(h.markers[3].options.color, '#ffffff');
    assert.equal(h.markers[3].options.weight, 2);
    assert.equal(h.calls.filter(call => call[0] === 'fit').length, fits);
    assert.deepEqual(h.markers.map(marker => marker.options.radius), [20, 14, 10, 5]);
  } finally { h.cleanup(); h.close(); }
});

test('reading-total updates preserve the viewport; moved station coordinates refit it', () => {
  const h = harness();
  try {
    h.render({ stations: [
      { station_id: 'Typical', latitude: 14.7, longitude: 121.1, anomaly_count: 1, total_readings: 31 },
      { station_id: 'Flagged', latitude: 14.6, longitude: 121, anomaly_count: 5, total_readings: 31 },
    ] });
    h.updateStations(); h.select();
    assert.equal(h.calls.filter(call => call[0] === 'fit').length, 1, 'metadata and station order must not reset pan/zoom');
    h.render({ stations: [{ station_id: 'Flagged', latitude: 15, longitude: 122, anomaly_count: 5, total_readings: 31 }] });
    h.updateStations();
    assert.equal(h.calls.filter(call => call[0] === 'fit').length, 2);
  } finally { h.cleanup(); h.close(); }
});

test('development effect remount fits the new map and restores its current selection', () => {
  const h = harness('Typical', ['Flagged']);
  try {
    h.select(); h.remount();
    assert.equal(h.calls.filter(call => call[0] === 'fit').length, 2);
    assert.equal(h.markers.at(-1).options.color, '#1E6FD9');
    assert.equal(h.markers.at(-2).options.color, '#3C4043');
    assert.equal(h.markers.at(-1).options.radius, 5);
  } finally { h.cleanup(); h.close(); }
});

test('station bounds use a single measured fit without a second implicit zoom', () => {
  const h = harness();
  try {
    assert.equal(h.options().zoomAnimation, false);
    assert.equal(h.options().markerZoomAnimation, false);
    assert.equal(h.calls[0][0], 'measure');
    assert.equal(h.calls.find(call => call[0] === 'fit')[1].animate, false);
    assert.deepEqual(h.calls.filter(call => call[0] === 'min').at(-1), ['min', 10]);
    assert.equal(h.calls.some(call => call[0] === 'implicitZoom'), false);
    assert.deepEqual(h.markers.map(marker => marker.options.radius), [20, 14, 10, 5]);
    assert.ok(h.markers.slice(0, 2).every(marker => marker.options.className === 'station-map-halo'), 'only flagged halos should pulse');
    assert.ok(h.markers.slice(2).every(marker => !marker.options.className), 'station dots must stay still');
  } finally { h.cleanup(); h.close(); }
});

test('station updates replace marker layers without changing their pixel radii', () => {
  const h = harness();
  try {
    h.updateStations();
    assert.ok(h.markers.slice(0, 4).every(marker => marker.removed));
    assert.deepEqual(h.markers.slice(4).map(marker => marker.options.radius), [20, 14, 10, 5]);
    assert.equal(h.calls.some(call => call[0] === 'implicitZoom'), false);
  } finally { h.cleanup(); h.close(); }
});

test('rapid resize and tab unmount cancel queued work for the removed map', () => {
  const h = harness();
  try {
    h.resize(); h.resize();
    assert.equal(h.frames.size, 1, 'resize work is coalesced');
    h.cleanup();
    assert.equal(h.frames.size, 0);
    assert.ok(h.calls.some(call => call[0] === 'disconnect'));
  } finally { h.close(); }
});

test('map retains neutral permanent station names and fits closer to station bounds', () => {
  const h = harness('Typical');
  try {
    assert.equal(h.markers[2].tooltip.options.permanent, true);
    assert.equal(h.markers[2].tooltip.text, 'Flagged');
    assert.equal(h.markers[3].tooltip.text, 'Typical');
    h.select();
    assert.deepEqual(h.calls.find(call => call[0] === 'fit')[1].padding, [24, 24]);
    assert.equal(h.calls.find(call => call[0] === 'fit')[1].maxZoom, 12);
    assert.equal(h.markers[3].tooltip.options.permanent, true);
  } finally { h.cleanup(); h.close(); }
});

test('light map uses the simpler colored basemap with its provider attribution', () => {
  const h = harness();
  try {
    for (const tile of h.tiles) {
      assert.match(tile.url, /tiles.stadiamaps.com\/tiles\/alidade_bright\//);
      assert.match(tile.options.attribution, /Stadia Maps/);
      assert.match(tile.options.attribution, /OpenMapTiles/);
      assert.match(tile.options.attribution, /OpenStreetMap/);
    }
  } finally { h.cleanup(); h.close(); }
});
