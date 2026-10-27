const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');

const original = { run_id: 'run-1', history_saved: false, processed_at: '2026-10-25', cleaned_data: [], flagged_data: [], summary: { total_stations: 4 } };
const files = [{ name: 'station.csv', size: 100 }];
const component = name => ({ [name]: () => null })[name];
function find(node, match) {
  if (!node || typeof node !== 'object') return null;
  if (match(node)) return node;
  for (const child of React.Children.toArray([node.props?.children, node.props?.actions])) {
    const found = find(child, match); if (found) return found;
  }
  return null;
}
const named = (tree, name) => find(tree, node => node.type?.name === name);
const contains = (node, text) => React.Children.toArray(node.props?.children).some(child => typeof child === 'string' && child.includes(text));
const button = (tree, text) => find(tree, node => node.type?.name === 'Button' && (contains(node, text) || node.props['aria-label']?.includes(text)));

function harness(initial = {}) {
  const values = [], refs = []; let cursor = 0, refCursor = 0;
  const calls = [], requests = [], effects = [];
  const state = { files: [...files], running: false, progress: null, result: null, reviews: {}, error: null, configOpen: false, abortRef: { current: null }, leaveRequest: null, saveRequest: null, ...initial };
  for (const field of ['files', 'running', 'progress', 'result', 'error', 'configOpen']) state[`set${field[0].toUpperCase()}${field.slice(1)}`] = value => { state[field] = value; calls.push(field); };
  state.guardUnsaved = proceed => { if (state.result && !state.result.history_saved) state.leaveRequest = { proceed }; else proceed(); };
  state.requestSave = afterSave => { state.saveRequest = { afterSave }; };
  state.resetSession = () => { state.abortRef.current?.abort(); state.abortRef.current = null; Object.assign(state, { result: null, files: [], reviews: {}, running: false, progress: null, error: null }); };
  const react = { ...React,
    useState: initialValue => { const index = cursor++; if (!(index in values)) values[index] = typeof initialValue === 'function' ? initialValue() : initialValue;
      return [values[index], value => { values[index] = typeof value === 'function' ? value(values[index]) : value; }]; },
    useRef: value => { const index = refCursor++; return refs[index] ?? (refs[index] = { current: value }); },
    useEffect: effect => effects.push(effect),
  };
  const source = fs.readFileSync(path.join(__dirname, '../src/app/(dashboard)/zones/page.tsx'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const mod = { exports: {} };
  const req = name => name === 'react' ? react
    : name === '@/context/ZonesContext' ? { useZones: () => state }
    : name === '@/context/AuthContext' ? { useAuth: () => ({ loading: false }) }
    : name === '@/hooks/useTechnicians' ? { useTicketTechnicians: () => ({ technicians: [] }) }
    : name === '@/hooks/useHistory' ? { useHistoryReviews: () => ({ ready: true, reviews: {}, saving: false }), invalidateHistory: async () => {} }
    : name === '@/components/ui/Toast' ? { useToast: () => ({ success: (...args) => calls.push(['success', ...args]), error: (...args) => calls.push(['error', ...args]) }) }
    : name === '@/lib/api/zones' ? { zonesApi: { process: (input, options) => new Promise((resolve, reject) => requests.push({ input, options, resolve, reject })) } }
    : name.endsWith('.css') ? { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) }
    : name.startsWith('@/components/') ? { [name.split('/').at(-1)]: component(name.split('/').at(-1)) }
    : require(name);
  new Function('require', 'module', 'exports', code)(req, mod, mod.exports);
  const render = () => { cursor = 0; refCursor = 0; return mod.exports.default(); };
  const configuration = tree => { const dialog = named(tree, 'ConfigurationDialog'); return dialog?.props.children ?? named(tree, 'RunConfiguration'); };
  return { state, calls, requests, refs, effects, render, configuration, configurationTree: tree => { const config = configuration(tree); return config.type(config.props); } };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('configuration explains the next step and enables processing only after file selection', () => {
  const h = harness({ files: [] });
  let config = h.configurationTree(h.render());
  assert.equal(button(config, 'Run detection').props.disabled, true);
  assert.ok(find(config, node => node.type === 'p' && contains(node, 'Select at least one CSV file')));
  assert.equal(find(config, node => node.type === 'details'), null);
  assert.ok(named(find(config, node => node.props?.['aria-label'] === 'How detection works'), 'PipelineDiagram'));
  h.state.files = files;
  config = h.configurationTree(h.render());
  assert.equal(button(config, 'Run detection').props.disabled, false);
  assert.ok(find(config, node => node.type === 'p' && contains(node, 'Results open here')));
  assert.equal(h.requests.length, 0);
});

test('setup, processing and results replace each other in one workspace', async () => {
  const h = harness();
  let tree = h.render();
  assert.ok(named(tree, 'RunConfiguration'));
  assert.equal(named(tree, 'CurrentResults'), null);
  assert.equal(named(tree, 'PipelineDiagram'), null);
  button(h.configurationTree(tree), 'Run detection').props.onClick();
  assert.equal(h.requests.length, 1);
  tree = h.render();
  assert.ok(named(tree, 'PipelineDiagram')?.props.running);
  assert.ok(button(find(tree, node => node.props?.['aria-label'] === 'Detection process'), 'Stop'));
  assert.equal(button(named(tree, 'Header'), 'Stop'), null);
  assert.equal(named(tree, 'RunConfiguration'), null);
  assert.equal(named(tree, 'CurrentResults'), null);
  h.requests[0].resolve(original); await settle();
  tree = h.render();
  const results = named(tree, 'CurrentResults');
  assert.ok(results);
  assert.equal(named(tree, 'PipelineDiagram'), null);
  assert.equal(named(tree, 'RunConfiguration'), null);
  assert.equal(named(results.type(results.props), 'ZoneResults').props.fitViewport, true);
  assert.equal(named(tree, 'RunSaveStatus').props.compact, true);
});

test('opening and closing configuration preserves the result component, run and reviews', () => {
  const reviews = { reading: { note: 'Keep this note' } };
  const h = harness({ result: original, reviews });
  const before = named(h.render(), 'CurrentResults');
  button(h.render(), 'Run configuration').props.onClick();
  let tree = h.render();
  const after = named(tree, 'CurrentResults');
  assert.equal(after.type, before.type); assert.equal(after.key, before.key);
  assert.equal(after.props.result, before.props.result);
  assert.ok(named(tree, 'ConfigurationDialog'));
  const oldDocument = global.document;
  global.document = { querySelector: () => null };
  let focused = 0; h.refs[0].current = { focus: () => focused++ };
  try { named(tree, 'ConfigurationDialog').props.onClose(); }
  finally { global.document = oldDocument; }
  assert.equal(named(h.render(), 'ConfigurationDialog'), null);
  assert.equal(h.state.result, original); assert.equal(h.state.reviews, reviews);
  assert.equal(h.requests.length, 0); assert.equal(focused, 1);
});

test('configuration traps keyboard focus and defers to nested confirmations', () => {
  const h = harness({ result: original, configOpen: true });
  const configuration = named(h.render(), 'ConfigurationDialog');
  configuration.type(configuration.props);
  const listeners = new Map(); let confirming = false;
  const oldDocument = global.document;
  const doc = { activeElement: null, querySelector: () => confirming ? {} : null,
    addEventListener: (name, callback) => listeners.set(name, callback), removeEventListener: name => listeners.delete(name) };
  const first = { focus: () => { doc.activeElement = first; }, getClientRects: () => [1] };
  const last = { focus: () => { doc.activeElement = last; }, getClientRects: () => [1] };
  h.refs[1].current = { closest: () => ({ querySelector: () => first, querySelectorAll: () => [first, last] }) };
  global.document = doc;
  try {
    const cleanup = h.effects.at(-1)();
    assert.equal(doc.activeElement, first);
    let prevented = 0;
    listeners.get('keydown')({ key: 'Tab', shiftKey: true, preventDefault: () => prevented++ });
    assert.equal(doc.activeElement, last);
    listeners.get('keydown')({ key: 'Tab', shiftKey: false, preventDefault: () => prevented++ });
    assert.equal(doc.activeElement, first); assert.equal(prevented, 2);
    confirming = true;
    configuration.props.onClose(); assert.equal(h.state.configOpen, true);
    listeners.get('keydown')({ key: 'Tab', shiftKey: true, preventDefault: () => prevented++ });
    assert.equal(prevented, 2);
    cleanup(); assert.equal(listeners.size, 0);
  } finally { global.document = oldDocument; }
});

test('file changes and reruns wait for the unsaved-run decision', () => {
  const h = harness({ result: original, configOpen: true });
  let tree = h.render();
  const upload = named(h.configurationTree(tree), 'FileUpload');
  const replacement = [{ name: 'other.csv', size: 200 }];
  upload.props.onFilesChange(replacement);
  assert.equal(h.state.result, original); assert.equal(h.state.files[0].name, 'station.csv');
  assert.equal(named(h.render(), 'ConfigurationDialog'), null, 'the loss confirmation owns the dialog layer');
  h.state.leaveRequest = null; // Keep working.
  assert.ok(named(h.render(), 'ConfigurationDialog'));
  button(h.configurationTree(h.render()), 'Run again').props.onClick();
  assert.equal(h.requests.length, 0);
  h.state.leaveRequest = null; // Cancel rerun.
  upload.props.onFilesChange(replacement);
  const proceed = h.state.leaveRequest.proceed; h.state.leaveRequest = null; proceed();
  assert.equal(h.state.result, null); assert.equal(h.state.files, replacement);
  assert.ok(named(h.render(), 'RunConfiguration'));
});

test('save coordination stays visible and ticket creation waits for save acknowledgment', () => {
  const h = harness({ result: original, configOpen: true });
  named(h.render(), 'RunSaveStatus').props.onSave();
  assert.ok(h.state.saveRequest); assert.equal(named(h.render(), 'ConfigurationDialog'), null);
  assert.equal(h.state.result, original);
  h.state.saveRequest = null; // Failed or cancelled save leaves the run intact.
  assert.ok(named(h.render(), 'ConfigurationDialog'));
  named(h.render(), 'CurrentResults').props.onCreateTicket('Station A', '2023-01-01');
  assert.equal(named(h.render(), 'CreateTicketModal'), null);
  h.state.result = { ...original, history_saved: true }; h.state.saveRequest.afterSave(); h.state.saveRequest = null;
  const ticket = named(h.render(), 'CreateTicketModal');
  assert.equal(ticket.props.stationId, 'Station A'); assert.equal(ticket.props.runId, 'run-1');
});

test('an approved rerun replaces the old run once and keeps its inputs', async () => {
  const h = harness({ result: original, configOpen: true });
  button(h.configurationTree(h.render()), 'Run again').props.onClick();
  assert.equal(h.requests.length, 0);
  const proceed = h.state.leaveRequest.proceed; h.state.leaveRequest = null; proceed();
  assert.equal(h.requests.length, 1); assert.equal(h.state.result, null);
  assert.equal(h.state.configOpen, false); assert.equal(h.state.running, true);
  assert.equal(h.requests[0].input[0].name, 'station.csv');
  h.requests[0].resolve({ ...original, run_id: 'replacement' }); await settle();
  assert.equal(h.state.result.run_id, 'replacement');
});

test('Stop and replacement runs ignore late responses from the old controller', async () => {
  const h = harness();
  button(h.configurationTree(h.render()), 'Run detection').props.onClick();
  h.requests[0].options.onProgress({stage:'zone_b',station_ids:['Station A']});
  assert.equal(named(h.render(),'PipelineDiagram').props.progress.stage,'zone_b');
  button(h.render(), 'Stop').props.onClick();
  const confirm = find(h.render(), node => node.props?.title === 'Stop process?');
  confirm.props.onConfirm();
  assert.equal(h.requests[0].options.signal.aborted, true);
  assert.equal(h.state.running, false); assert.equal(h.state.files.length, 1);
  assert.equal(h.state.progress,null);
  button(h.configurationTree(h.render()), 'Run detection').props.onClick();
  const currentController = h.state.abortRef.current;
  h.requests[0].options.onProgress({stage:'zone_c',station_ids:['Old station']});
  assert.equal(h.state.progress.stage,'preparing');
  h.requests[1].options.onProgress({stage:'zone_a',station_ids:['New station']});
  assert.equal(h.state.progress.station_ids[0],'New station');
  h.requests[0].resolve(original); await settle();
  assert.equal(h.state.result, null); assert.equal(h.state.running, true);
  assert.equal(h.state.abortRef.current, currentController);
  h.requests[1].resolve({ ...original, run_id: 'run-2' }); await settle();
  assert.equal(h.state.result.run_id, 'run-2'); assert.equal(h.state.running, false);
});

test('processing errors return to setup with files and retry available; Reset stays confirmed', async () => {
  const h = harness();
  button(h.configurationTree(h.render()), 'Run detection').props.onClick();
  h.requests[0].reject(new Error('Invalid station file')); await settle();
  assert.equal(h.state.running, false); assert.equal(h.state.files.length, 1);
  const config = h.configurationTree(h.render());
  assert.ok(find(config, node => node.props?.role === 'alert'));
  assert.ok(button(config, 'Run detection'));
  button(h.render(), 'Reset').props.onClick();
  const confirm = find(h.render(), node => node.props?.title === 'Reset process?');
  assert.ok(confirm); assert.equal(h.state.files.length, 1);
  confirm.props.onCancel(); assert.equal(h.state.files.length, 1);
  button(h.render(), 'Reset').props.onClick();
  find(h.render(), node => node.props?.title === 'Reset process?').props.onConfirm();
  assert.equal(h.state.files.length, 0); assert.equal(h.state.error, null);
});


test('an upload timeout does not encourage blindly starting a duplicate job', async () => {
  const h=harness();
  button(h.configurationTree(h.render()),'Run detection').props.onClick();
  h.requests[0].reject(new Error('Request timed out'));await settle();
  assert.equal(h.state.error,'Request timed out');
  assert.doesNotMatch(h.state.error,/usually instant|again right now|was waking up/);
});
