const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');

const component = name => ({ [name]: () => null })[name];
function find(node, match) {
  if (!node || typeof node !== 'object') return null;
  if (match(node)) return node;
  for (const child of React.Children.toArray(node.props?.children)) {
    const result = find(child, match); if (result) return result;
  }
  return null;
}
function harness(save = async id => ({ run_id: id, history_saved: true })) {
  const result = { run_id: 'run-1', history_saved: false, processed_at: '2026-10-25', summary: {} };
  const files = [{ name: 'Rainfall.csv' }], reviews = { example: { note: 'Retained review' } };
  const state = { result, files, reviews, leaveRequest: null, saveRequest: null };
  const navigations = [], listeners = new Map(); let resets = 0, effects = [], savedError = null;
  state.guardUnsaved = (proceed, options) => { state.leaveRequest = { proceed, ...options }; };
  state.cancelLeave = () => { state.leaveRequest = null; };
  state.requestSave = afterSave => { state.saveRequest = { afterSave }; };
  state.cancelSave = () => { state.saveRequest = null; };
  state.setResult = (next, expectedId) => { if (state.result?.run_id === expectedId) state.result = next; };
  state.resetSession = () => { resets++; Object.assign(state, { result: null, files: [], reviews: {} }); };
  const source = fs.readFileSync(path.join(__dirname, '../src/components/history/RunSaveController.tsx'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const mod = { exports: {} };
  const req = name => name === 'react' ? { ...React, useRef: value => ({ current: value }), useEffect: effect => effects.push(effect) }
    : name === '@/context/ZonesContext' ? { useZones: () => state }
    : name === 'next/navigation' ? { useRouter: () => ({ push: value => navigations.push(value) }) }
    : name === '@/hooks/useHistory' ? { useSaveHistoryRun: () => ({ save: async (...args) => { try { return await save(...args); } catch (error) { savedError = error.message; throw error; } }, saving: false, error: savedError, clearError() {} }) }
    : name === '@/components/ui/Toast' ? { useToast: () => ({ success() {} }) }
    : name.startsWith('@/components/ui/') ? Object.fromEntries([name.split('/').at(-1), 'ModalFooter'].map(name => [name, component(name)]))
    : require(name);
  new Function('require', 'module', 'exports', code)(req, mod, mod.exports);
  const originalDocument = global.document, originalWindow = global.window, originalElement = global.Element;
  class LinkElement {
    constructor(href, attributes = {}) { this.href = href; this.attributes = attributes; this.target = attributes.target; }
    closest() { return this; }
    hasAttribute(name) { return name in this.attributes; }
  }
  global.Element = LinkElement;
  global.document = { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) };
  global.window = { location: { href: 'http://localhost:3000/zones', origin: 'http://localhost:3000', pathname: '/zones', search: '' } };
  function render() { effects = []; return mod.exports.RunSaveController(); }
  render(); const cleanups = effects.map(effect => effect());
  return { state, result, files, reviews, navigations, resets: () => resets, render,
    navigate(pathname) { global.window.location.pathname = pathname; global.window.location.href = `http://localhost:3000${pathname}`; },
    click(href, attributes, eventProps) {
      const event = { button: 0, target: new LinkElement(href, attributes), prevented: false, preventDefault() { this.prevented = true; }, ...eventProps };
      listeners.get('click')(event); return event;
    },
    close() {
      for (const cleanup of cleanups) cleanup?.();
      global.document = originalDocument; global.window = originalWindow; global.Element = originalElement;
    },
  };
}

test('workspace navigation reminds, then continues without saving or clearing the current run', () => {
  const h = harness();
  try {
    assert.equal(h.click('http://localhost:3000/history?search=rain').prevented, true);
    assert.equal(h.navigations.length, 0);
    const reminder = find(h.render(), node => node.props?.title === 'Save this run?');
    assert.equal(reminder.props.confirmLabel, 'Don’t save'); assert.equal(reminder.props.cancelLabel, 'Cancel'); assert.equal(reminder.props.isDangerous, false);
    reminder.props.onConfirm();
    assert.deepEqual(h.navigations, ['/history?search=rain']);
    assert.equal(h.resets(), 0); assert.equal(h.state.result, h.result);
    assert.equal(h.state.files, h.files); assert.equal(h.state.reviews, h.reviews);
    assert.equal(h.state.saveRequest, null);
  } finally { h.close(); }
});

test('an unsaved Zones run does not interrupt navigation on History or other dashboard tabs', () => {
  const h = harness();
  try {
    h.click('http://localhost:3000/history');
    find(h.render(), node => node.props?.title === 'Save this run?').props.onConfirm();
    for (const pathname of ['/history', '/history/saved-run', '/tickets', '/reports', '/technicians', '/audit']) {
      h.navigate(pathname);
      assert.equal(h.click('http://localhost:3000/history/another-run/results').prevented, false, pathname);
      assert.equal(h.state.leaveRequest, null, 'no repeated reminder away from Zones');
    }
    assert.equal(h.state.result, h.result); assert.equal(h.resets(), 0);
    h.navigate('/zones');
    assert.equal(h.click('http://localhost:3000/history').prevented, true, 'returning to Zones restores its leave reminder');
  } finally { h.close(); }
});

test('Cancel stops navigation; Save waits for success before continuing', async () => {
  let acknowledge;
  const h = harness(() => new Promise(resolve => { acknowledge = resolve; }));
  try {
    h.click('http://localhost:3000/tickets');
    find(h.render(), node => node.props?.title === 'Save this run?').props.onCancel();
    assert.equal(h.navigations.length, 0); assert.equal(h.state.result, h.result);
    h.click('http://localhost:3000/tickets');
    find(h.render(), node => node.props?.title === 'Save this run?').props.extraAction.props.onClick();
    const modal = find(h.render(), node => node.type?.name === 'SaveRunModal');
    modal.props.onSave('Rainfall review');
    assert.equal(h.navigations.length, 0);
    acknowledge({ ...h.result, history_saved: true });
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(h.navigations, ['/tickets']); assert.equal(h.resets(), 0);
    assert.equal(h.state.result.history_saved, true);
  } finally { h.close(); }
});

test('failed saving leaves navigation pending and the unsaved run intact', async () => {
  const h = harness(async () => { throw new Error('Storage unavailable'); });
  try {
    h.click('http://localhost:3000/audit');
    find(h.render(), node => node.props?.title === 'Save this run?').props.extraAction.props.onClick();
    find(h.render(), node => node.type?.name === 'SaveRunModal').props.onSave('Rainfall');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.navigations.length, 0); assert.equal(h.state.result, h.result);
    const modal = find(h.render(), node => node.type?.name === 'SaveRunModal');
    assert.equal(modal.props.error, 'Storage unavailable'); assert.ok(h.state.saveRequest);
  } finally { h.close(); }
});

test('leaving the shared workspace retains the destructive warning', () => {
  const h = harness();
  try {
    h.click('http://localhost:3000/ui-library');
    const reminder = find(h.render(), node => node.props?.title === 'Save this run?');
    assert.equal(reminder.props.confirmLabel, 'Discard'); assert.equal(reminder.props.isDangerous, true);
    reminder.props.onConfirm();
    assert.equal(h.resets(), 1); assert.equal(h.state.result, null);
    assert.deepEqual(h.navigations, ['/ui-library']);
  } finally { h.close(); }
});

test('modified, external, download and same-page links keep their normal behavior', () => {
  const h = harness();
  try {
    for (const [href, attributes, props] of [
      ['https://example.invalid/'], ['http://localhost:3000/zones#report'],
      ['http://localhost:3000/history', {}, { ctrlKey: true }], ['http://localhost:3000/history', { target: '_blank' }],
      ['http://localhost:3000/api/export', { download: '' }],
    ]) assert.equal(h.click(href, attributes, props).prevented, false);
    assert.equal(h.state.leaveRequest, null); assert.equal(h.resets(), 0);
  } finally { h.close(); }
});
