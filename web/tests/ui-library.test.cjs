const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function load(source, overrides = {}) {
  const filename = path.join(__dirname, '../src', source);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => overrides[name] ?? require(name), mod, mod.exports);
  return mod.exports;
}
test('drafts restore supported settings and discard untrusted values', () => {
  const { readDraft } = load('components/design/library.ts');
  const draft = readDraft({ version: 1, theme: 'dark', density: 'roomy', viewport: 'mobile', tokens: {
    light: { '--brand': '#123456', '--surface': 'url(https://evil.invalid)', '--font-base': '999px', '--unknown': 'red' }, dark: { '--brand': '#abcdef' },
  }, components: { buttons: { radius: 12, background: '#123456', height: 400, padding: '0; } body {display:none}' }, unknown: { radius: 1 } } });
  assert.equal(draft.theme, 'dark');
  assert.equal(draft.viewport, 'mobile');
  assert.deepEqual(draft.tokens.light, { '--brand': '#123456' });
  assert.deepEqual(draft.components, { buttons: { radius: 12, background: '#123456' } });
  assert.equal(readDraft(null).theme, 'light');
  assert.equal(readDraft({ version: 999, theme: 'dark' }).theme, 'light');
});
test('preview CSS is limited to registered specimens and generated from validated values', () => {
  const { readDraft, previewCss } = load('components/design/library.ts');
  const css = previewCss(readDraft({ version: 1, theme: 'light', tokens: { light: { '--brand': '#123456' } }, components: { buttons: { height: 42, radius: 14 } } }));
  assert.match(css, /--brand:#123456/);
  assert.match(css, /data-ui="button"/);
  assert.match(css, /height:42px !important/);
  assert.match(css, /border-radius:14px !important/);
  assert.doesNotMatch(css, /url\(|@import|javascript:/);
});
test('portal appearance changes also apply when browsing all components', () => {
  const { readDraft, previewCss } = load('components/design/library.ts');
  const css = previewCss(readDraft({ version: 1, components: { notifications: { radius: 18 }, dialogs: { background: '#123456' } } }));
  assert.match(css, /\.toast\{border-radius:18px !important\}/);
  assert.match(css, /\[role="dialog"\]>div\{background-color:#123456 !important\}/);
  assert.doesNotMatch(css, /data-gallery-selection/);
});
test('preview actions never send operational API requests, including absolute API URLs', async () => {
  const { previewFetch } = load('components/design/library.ts');
  const calls = [];
  const fetcher = previewFetch(async (...args) => { calls.push(args); return new Response('sample'); }, 'http://localhost:3000/ui-library/preview');
  for (const target of ['/api/tickets', 'http://localhost:8000/api/history/sample/reviews', new Request('http://localhost:8000/api/tickets')]) {
    await assert.rejects(fetcher(target, { method: 'POST' }), /No website data is changed/);
  }
  assert.equal(calls.length, 0);
  await fetcher('/_next/static/sample.js');
  assert.equal(calls.length, 1);
});
test('ticket workflow sample responses complete locally without calling the network', async () => {
  const { createFixtureApi } = load('components/design/fixtures.ts');
  const { previewFetch } = load('components/design/library.ts');
  const fetcher = previewFetch(async()=>{ throw new Error('Network must not be used'); }, 'http://localhost:3000', createFixtureApi());
  const created = await fetcher('http://localhost:8000/api/tickets', {method:'POST',body:JSON.stringify({title:'Sample creation',station_id:'Example'})});
  assert.equal((await created.json()).title, 'Sample creation');
  const removed = await fetcher('http://localhost:8000/api/tickets/design-ticket/technicians/design-tech', {method:'DELETE'});
  assert.equal((await removed.json()).technicians.length, 0);
  const assigned = await fetcher('http://localhost:8000/api/tickets/design-ticket/technicians', {method:'POST',body:JSON.stringify({technician_ids:['design-tech']})});
  assert.equal((await assigned.json()).technicians[0].id, 'design-tech');
  await assert.rejects(fetcher('http://localhost:8000/api/tickets/real-ticket', {method:'DELETE'}), /No website data is changed/);
});
test('library access is development-only and does not bypass dashboard authentication', () => {
  const original = process.env.NODE_ENV;
  const responses = { next: () => 'next', redirect: () => 'login' };
  try {
    for (const environment of ['development', 'production']) {
      process.env.NODE_ENV = environment;
      const { middleware } = load('middleware.ts', { 'next/server': { NextResponse: responses } });
      const request = pathname => ({ nextUrl: { pathname }, cookies: { has: () => false }, url: 'http://localhost:3000' + pathname });
      assert.equal(middleware(request('/ui-library')), environment === 'development' ? 'next' : 'login');
      assert.equal(middleware(request('/ui-library/preview')), environment === 'development' ? 'next' : 'login');
      assert.equal(middleware(request('/zones')), 'login');
      assert.equal(middleware(request('/ui-library-other')), 'login');
    }
  } finally { process.env.NODE_ENV = original; }
  for (const file of ['app/ui-library/page.tsx', 'app/ui-library/preview/page.tsx']) {
    assert.match(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), /process\.env\.NODE_ENV !== "development"/);
    assert.match(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), /notFound\(\)/);
  }
});
test('the development preview can be framed locally while other pages retain frame protection', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../next.config.ts'), 'utf8');
  const code = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  const original = process.env.NODE_ENV;
  try {
    for (const mode of ['development','production']) {
      process.env.NODE_ENV = mode;
      const mod = {exports:{}};
      new Function('module','exports',code)(mod,mod.exports);
      const config = mod.exports.default;
      const rules = await config.headers();
      const global = rules.find(rule=>rule.source==='/:path*');
      assert.equal(global.headers.find(h=>h.key==='X-Frame-Options').value,'DENY');
      const preview = rules.find(rule=>rule.source==='/ui-library/preview');
      if (mode === 'development') {
        assert.ok(preview, 'missing development-only preview frame headers');
        assert.equal(preview.headers.find(h=>h.key==='X-Frame-Options').value,'SAMEORIGIN');
        assert.match(preview.headers.find(h=>h.key==='Content-Security-Policy').value,/frame-ancestors 'self'/);
      } else assert.equal(preview, undefined);
    }
  } finally { process.env.NODE_ENV = original; }
});
