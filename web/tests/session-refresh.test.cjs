const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

test('realtime recovery and concurrent REST 401s share one cookie rotation', async () => {
  const filename = path.join(__dirname, '../src/lib/api/client.ts');
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const mod = { exports: {} };
  let finishRefresh;
  let refreshCalls = 0;
  const counts = new Map();
  const fakeFetch = async (url) => {
    const pathname = new URL(url).pathname;
    if (pathname === '/api/auth/refresh') {
      refreshCalls++;
      return new Promise(resolve => { finishRefresh = () => resolve({ ok: true }); });
    }
    const count = (counts.get(pathname) || 0) + 1;
    counts.set(pathname, count);
    return { status: count === 1 ? 401 : 200, ok: count > 1, json: async () => ({ ok: true }) };
  };
  new Function('exports', 'fetch', code)(mod.exports, fakeFetch);
  assert.equal(typeof mod.exports.refreshSession, 'function');
  const recovery = mod.exports.refreshSession();
  const reads = ['/api/history', '/api/tickets'].map(p => mod.exports.apiClient.get(p));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(refreshCalls, 1);
  finishRefresh();
  assert.equal(await recovery, true);
  assert.deepEqual(await Promise.all(reads), [{ ok: true }, { ok: true }]);
  const next = mod.exports.refreshSession();
  assert.equal(refreshCalls, 2, 'a settled refresh must not remain cached');
  finishRefresh();
  assert.equal(await next, true);
});
