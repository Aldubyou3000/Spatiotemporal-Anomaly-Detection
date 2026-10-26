const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
function Button() { return null; }

function harness() {
  const refs = [], effects = [], listeners = new Set();
  const beforeDocument = global.document, beforeElement = global.HTMLElement;
  class Element {
    constructor() { this.isConnected = true; }
    focus() { global.document.activeElement = this; }
    getClientRects() { return [1]; }
  }
  const trigger = new Element();
  global.HTMLElement = Element;
  global.document = { activeElement: trigger, addEventListener: (_type, fn) => listeners.add(fn), removeEventListener: (_type, fn) => listeners.delete(fn) };
  const source = fs.readFileSync(path.join(__dirname, '../src/components/ui/ConfirmDialog.tsx'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => name === 'react' ? { ...React, useRef: () => { const ref = { current: null }; refs.push(ref); return ref; }, useEffect: fn => effects.push(fn) }
    : name === 'react-dom' ? { createPortal: node => node }
    : name === '@/components/ui/Button' ? { Button }
    : name.endsWith('.css') ? { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) } : require(name), mod, mod.exports);
  return { render: props => mod.exports.ConfirmDialog({ title: 'Save this run?', message: 'Save to keep this run.', ...props }), refs, effects, listeners, trigger, Element,
    close() { global.document = beforeDocument; global.HTMLElement = beforeElement; } };
}
function find(node, match) {
  if (!node || typeof node !== 'object') return null;
  if (match(node)) return node;
  for (const child of React.Children.toArray(node.props?.children)) { const value = find(child, match); if (value) return value; }
  return null;
}

test('three-way save dialog has one primary action and concise actions in a shared footer', () => {
  const h = harness(); const calls = [];
  try {
    const tree = h.render({ cancelLabel: 'Cancel', confirmLabel: 'Don’t save', onCancel: () => calls.push('cancel'), onConfirm: () => calls.push('continue'), extraAction: React.createElement(Button, { variant: 'primary', onClick: () => calls.push('save') }, 'Save') });
    assert.equal(tree.props.role, 'dialog'); assert.equal(tree.props['aria-describedby'], 'confirm-dialog-message');
    const footer = find(tree, node => node.props?.className === 'footer');
    const buttons = React.Children.toArray(footer.props.children);
    assert.deepEqual(buttons.map(button => button.props.children), ['Cancel', 'Don’t save', 'Save']);
    assert.deepEqual(buttons.map(button => button.props.variant), ['ghost', 'secondary', 'primary']);
    buttons.forEach(button => button.props.onClick());
    assert.deepEqual(calls, ['cancel', 'continue', 'save']);
  } finally { h.close(); }
});

test('ordinary destructive confirmation retains its danger action', () => {
  const h = harness();
  try {
    const tree = h.render({ isDangerous: true, confirmLabel: 'Delete', onCancel() {}, onConfirm() {} });
    const footer = find(tree, node => node.props?.className === 'footer');
    assert.deepEqual(React.Children.toArray(footer.props.children).map(button => button.props.variant), ['ghost', 'danger']);
  } finally { h.close(); }
});

test('keyboard defaults to Cancel for three-way decisions, traps focus and restores the trigger', () => {
  const h = harness(); let cancelled = 0;
  try {
    h.render({ onCancel: () => cancelled++, onConfirm() {}, extraAction: React.createElement(Button, { variant: 'primary' }, 'Save') });
    const confirm = new h.Element(), cancel = new h.Element(), save = new h.Element();
    h.refs[0].current = confirm; h.refs[1].current = cancel;
    h.refs[2].current = { querySelectorAll: () => [cancel, confirm, save] };
    const cleanups = h.effects.map(effect => effect());
    assert.equal(global.document.activeElement, cancel);
    let prevented = 0;
    for (const fn of h.listeners) fn({ key: 'Tab', shiftKey: true, preventDefault: () => prevented++ });
    assert.equal(global.document.activeElement, save);
    for (const fn of h.listeners) fn({ key: 'Tab', shiftKey: false, preventDefault: () => prevented++ });
    assert.equal(global.document.activeElement, cancel); assert.equal(prevented, 2);
    for (const fn of h.listeners) fn({ key: 'Escape' });
    assert.equal(cancelled, 1);
    cleanups.forEach(cleanup => cleanup());
    assert.equal(global.document.activeElement, h.trigger); assert.equal(h.listeners.size, 0);
  } finally { h.close(); }
});
