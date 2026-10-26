const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function load(file, overrides = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => overrides[name] ?? require(name), mod, mod.exports);
  return mod.exports;
}

test('development output stays separate from production build and start output', () => {
  const original = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'development';
    const devDir = load('next.config.ts').default.distDir ?? '.next';
    process.env.NODE_ENV = 'production';
    const productionDir = load('next.config.ts').default.distDir ?? '.next';
    assert.equal(productionDir, '.next');
    assert.ok(devDir && devDir !== productionDir && !devDir.startsWith(productionDir + '/'));
    assert.ok(fs.readFileSync(path.join(__dirname, '..', '.gitignore'), 'utf8').includes('/' + devDir + '/'));
    const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'tsconfig.json'), 'utf8'));
    assert.ok(config.include.includes(devDir + '/types/**/*.ts'));
    assert.ok(config.exclude.includes(devDir), 'stale dev validators must not enter production type checking');
  } finally { process.env.NODE_ENV = original; }
});

test('page authentication and API passthrough work in development and production without library exceptions', () => {
  const original = process.env.NODE_ENV;
  try {
    for (const mode of ['development', 'production']) {
      process.env.NODE_ENV = mode;
      const { middleware } = load('src/middleware.ts', { 'next/server': { NextResponse: { next: () => 'next', redirect: () => 'login' } } });
      const request = (pathname, authenticated = false) => ({ nextUrl: { pathname }, cookies: { has: () => authenticated }, url: 'http://localhost:3000' + pathname });
      for (const pathname of ['/zones', '/history', '/tickets', '/reports', '/technicians', '/audit', '/ui-library', '/ui-library/preview']) {
        assert.equal(middleware(request(pathname)), 'login', mode + ': ' + pathname);
        assert.equal(middleware(request(pathname, true)), 'next', mode + ': ' + pathname);
      }
      for (const pathname of ['/login', '/api/auth/login', '/api/events']) assert.equal(middleware(request(pathname)), 'next');
    }
  } finally { process.env.NODE_ENV = original; }
});

test('every page retains frame protection in development and production', async () => {
  const original = process.env.NODE_ENV;
  try {
    for (const mode of ['development', 'production']) {
      process.env.NODE_ENV = mode;
      const rules = await load('next.config.ts').default.headers();
      assert.deepEqual(rules.map(rule => rule.source), ['/:path*']);
      const headers = rules[0].headers;
      assert.equal(headers.find(header => header.key === 'X-Frame-Options').value, 'DENY');
      assert.match(headers.find(header => header.key === 'Content-Security-Policy').value, /frame-ancestors 'none'/);
    }
  } finally { process.env.NODE_ENV = original; }
});
