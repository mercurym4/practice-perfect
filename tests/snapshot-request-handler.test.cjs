'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createSnapshotHandler, resolveSnapshotRoute, MAX_URL_LENGTH, MAX_FILE_BYTES} =
  require('./snapshot-request-handler.cjs');
// Independent frozen fixture list, not an implementation-exported allowlist.
const PATHS = [
  "about.html",
  "analytics.js",
  "approved-green.css",
  "assets/library/about/about-growth-dashboard.webp",
  "assets/library/about/executive-boardroom.webp",
  "assets/library/about/leadership-workshop.webp",
  "assets/library/general/practice-perfect-analytics-workspace.webp",
  "assets/library/general/practice-perfect-office-growth-dashboard.webp",
  "assets/library/general/practice-perfect-performance-dashboard.webp",
  "assets/library/heroes/home-growth-hero.webp",
  "assets/library/heroes/practice-perfect-boardroom-hero.webp",
  "assets/library/heroes/services-growth-hero.webp",
  "assets/library/home/approved-monitor-workspace.png",
  "assets/library/home/approved-mountain-cta.png",
  "assets/library/home/approved-office-hero.png",
  "assets/library/home/opportunity-to-measurable-growth-dashboard.png",
  "assets/library/logos/practice-perfect-logo.png",
  "assets/library/logos/practice-perfect-logo.svg",
  "assets/library/masters/approved-green-services-reference.png",
  "assets/library/masters/opportunity-to-measurable-growth-reference.png",
  "assets/library/masters/practice-perfect-analytics-workspace-master.png",
  "assets/library/masters/practice-perfect-analytics-workspace-master.webp",
  "assets/library/masters/practice-perfect-boardroom-master.png",
  "assets/library/masters/practice-perfect-boardroom-master.webp",
  "assets/library/masters/practice-perfect-logo-master.png",
  "assets/library/masters/practice-perfect-office-growth-dashboard-master.png",
  "assets/library/masters/practice-perfect-office-growth-dashboard-master.webp",
  "assets/library/masters/practice-perfect-performance-dashboard-master.webp",
  "assets/library/masters/services-monitor-sharp-v2.png",
  "assets/library/our-system/growth-system-dashboard.webp",
  "assets/library/pricing/scalable-growth-path.webp",
  "assets/library/services/analytics-workspace.webp",
  "assets/library/services/approved-monitor-reference.png",
  "assets/library/services/approved-mountain-reference.png",
  "assets/library/services/approved-office-reference.png",
  "assets/library/services/monitor-sharp-v2-1288.webp",
  "assets/library/services/monitor-sharp-v2-390.webp",
  "assets/library/services/monitor-sharp-v2-780.webp",
  "assets/library/what-we-fix/revenue-diagnostics.webp",
  "assets/services-analytics-workspace-green.webp",
  "assets/services-dashboard-visual.webp",
  "assets/services-office-banner.webp",
  "assets/services-office-sharp-final.webp",
  "contact-form.js",
  "contact.html",
  "enhancements.css",
  "hero-office.svg",
  "home-reference.css",
  "homepage.css",
  "index.html",
  "logo.png",
  "logo.svg",
  "our-system.html",
  "pricing-dashboard.css",
  "pricing.html",
  "resources.css",
  "resources.html",
  "resources/debt-defense-marketing-fit.html",
  "resources/focused-practice-growth-support.html",
  "resources/law-firm-intake-kpis.html",
  "resources/paid-traffic-client-conversations.html",
  "resources/personal-injury-lead-quality.html",
  "resources/practice-growth-feels-stuck.html",
  "resources/practice-search-visibility.html",
  "resources/sales-intake-leadership-support.html",
  "resources/website-losing-client-confidence.html",
  "robots.txt",
  "service-detail.css",
  "services-reference.css",
  "services.html",
  "services/debt-defense-direct-mail.html",
  "services/fractional-sales-leadership.html",
  "services/law-firm-intake-consulting.html",
  "services/pi-mva-lead-generation.html",
  "services/ppc-marketing.html",
  "services/practice-growth-audit.html",
  "services/revenue-growth-sprint.html",
  "services/seo-marketing.html",
  "services/website-audit-overhaul.html",
  "services/website-design.html",
  "sitemap.xml",
  "styles.css",
  "what-we-fix.html"
];
function fixture(extra = false, override) {
  const calls = [];
  const snapshot = {paths: Object.freeze(extra ? [...PATHS, 'mobile-menu.js'] : [...PATHS]),
    read(path) { calls.push(path); return override ? override(path) : Buffer.from(path); }};
  return {snapshot, calls, handler: createSnapshotHandler(snapshot)};
}
function response() {
  return {headersSent: false, status: null, headers: null, body: null,
    writeHead(status, headers) { this.status = status; this.headers = headers; this.headersSent = true; },
    end(body) { this.body = body; }};
}
function invoke(handler, url, method = 'GET') {
  const res = response(); handler({url, method}, res); return res;
}
test('all 83 exact files and 27 clean HTML aliases resolve through the closed inventory', () => {
  const {handler} = fixture();
  let html = 0;
  for (const path of PATHS) {
    const result = invoke(handler, '/' + path);
    assert.equal(result.status, 200, path);
    if (path.endsWith('.html')) {
      html++;
      assert.equal(invoke(handler, '/' + path.slice(0, -5)).status, 200, path);
    }
  }
  assert.equal(html, 27);
});
test('root resolves index and route results are frozen', () => {
  const route = resolveSnapshotRoute('/');
  assert.deepEqual(route, {status: 200, path: 'index.html', kind: 'file'});
  assert.equal(Object.isFrozen(route), true);
});
test('exact84 optional mobile menu admitted but absent baseline does not serve it', () => {
  assert.equal(invoke(fixture().handler, '/mobile-menu.js').status, 404);
  assert.equal(invoke(fixture(true).handler, '/mobile-menu.js').status, 200);
  assert.equal(resolveSnapshotRoute('/mobile-menu.js', true).path, 'mobile-menu.js');
});
test('bounded printable query ignored without reflection', () => {
  const {handler} = fixture();
  const result = invoke(handler, '/styles.css?v=1&next=%2f..%2f&x=?');
  assert.equal(result.status, 200);
  assert.equal(result.body.toString(), 'styles.css');
  assert.doesNotMatch(JSON.stringify(result.headers), /next|v=1/);
});
test('path validation happens before query handling and without URL normalization', () => {
  for (const url of ['/x/../index.html?v=1', '/%69ndex.html?v=1',
    '//index.html?v=1', '/a\\index.html?v=1']) {
    assert.equal(resolveSnapshotRoute(url).status, 400, url);
  }
});
const malformed = ['', 'https://practiceperfect.us/index.html', 'http:/index.html',
  'index.html', '//index.html', '///', '/a/../index.html', '/./index.html',
  '/index.html/.', '/index.html/..', '/a//b', '/%2e%2e/index.html',
  '/%252e/index.html', '/index%2ehtml', '/index.html%00', '/%2findex.html',
  '/\\index.html', '/index.html\\x', '/index.html\0', '/index.html\r\nX:1',
  '/index.html\n', '/index.html\t', '/index.html ', '/café', '/😀',
  '/index.html#fragment', '/index.html?q=\r', '/index.html?q=é'];
for (const [i, url] of malformed.entries()) {
  test('malformed request-target refusal ' + i, () => {
    const {handler, calls} = fixture();
    assert.equal(invoke(handler, url).status, 400);
    assert.equal(calls.length, 0);
  });
}
test('nonstring targets refused', () => {
  for (const value of [undefined, null, 12, {}, [], Buffer.from('/')]) {
    assert.equal(resolveSnapshotRoute(value).status, 400);
  }
});
test('URL length exact boundary and over budget', () => {
  const prefix = '/index.html?';
  assert.equal(resolveSnapshotRoute(prefix + 'x'.repeat(MAX_URL_LENGTH - prefix.length)).status, 200);
  assert.equal(resolveSnapshotRoute(prefix + 'x'.repeat(MAX_URL_LENGTH - prefix.length + 1)).status, 400);
});
test('unknown/public near misses do not receive a catchall', () => {
  const {handler, calls} = fixture();
  for (const path of ['/missing', '/index', '/Index.html', '/contact/', '/assets/',
    '/styles', '/foo.js', '/.git/config', '/docs/approved-project-state.md',
    '/tests/main-snapshot-contract.cjs', '/scripts/export_main_snapshot.py',
    '/api/contact', '/api/contact?x=1', '/README.md', '/services-green.html',
    '/preview.html', '/assets/library/README.md', '/favicon.ico/']) {
    const expected = path === '/index' ? 200 : 404;
    assert.equal(invoke(handler, path).status, expected, path);
  }
  assert.deepEqual(calls, ['index.html']);
});
test('favicon explicitly empty 204, including HEAD, without snapshot read', () => {
  const {handler, calls} = fixture();
  for (const method of ['GET', 'HEAD']) {
    const res = invoke(handler, '/favicon.ico?x=1', method);
    assert.equal(res.status, 204);
    assert.equal(res.headers['Content-Length'], '0');
    assert.equal(res.body?.length || 0, 0);
  }
  assert.equal(calls.length, 0);
});
test('GET/HEAD status and all headers match but HEAD is bodyless', () => {
  const {handler} = fixture();
  for (const path of ['/', '/missing', '/%2e', '/analytics.js', '/favicon.ico']) {
    const get = invoke(handler, path), head = invoke(handler, path, 'HEAD');
    assert.equal(head.status, get.status, path);
    assert.deepEqual(head.headers, get.headers, path);
    assert.equal(head.body, undefined, path);
  }
});
test('only exact GET and HEAD allowed; rejected methods cannot invoke reader', () => {
  const {handler, calls} = fixture();
  for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS', 'TRACE', 'CONNECT',
    'get', 'head', '', undefined, null, {}, 'GET\r\nX:1']) {
    const res = response(); handler({url: '/', method}, res);
    assert.equal(res.status, 405);
    assert.equal(res.headers.Allow, 'GET, HEAD');
    assert.equal(res.body.toString(), 'Method not allowed\n');
  }
  assert.equal(calls.length, 0);
});
test('fixed MIME types and byte lengths, including binary, are exact', () => {
  const samples = {'/index.html':'text/html; charset=utf-8',
    '/styles.css':'text/css; charset=utf-8', '/mobile-menu.js':'application/javascript; charset=utf-8',
    '/logo.svg':'image/svg+xml', '/logo.png':'image/png',
    '/assets/services-dashboard-visual.webp':'image/webp',
    '/robots.txt':'text/plain; charset=utf-8', '/sitemap.xml':'application/xml; charset=utf-8'};
  const bytes = Buffer.from([0, 128, 255, 10]);
  const {handler} = fixture(true, () => bytes);
  for (const [path, type] of Object.entries(samples)) {
    const res = invoke(handler, path);
    assert.equal(res.headers['Content-Type'], type);
    assert.equal(res.headers['Content-Length'], '4');
    assert.equal(res.headers['Cache-Control'], 'no-store');
    assert.equal(res.headers['X-Content-Type-Options'], 'nosniff');
    assert.deepEqual(res.body, bytes);
  }
});
test('all error replies have constant security headers and never reflect target', () => {
  const {handler} = fixture();
  for (const [url, method] of [['/private-secret', 'GET'], ['/bad%secret', 'GET'], ['/', 'POST']]) {
    const res = invoke(handler, url, method);
    assert.equal(res.headers['Cache-Control'], 'no-store');
    assert.equal(res.headers['X-Content-Type-Options'], 'nosniff');
    assert.equal(Number(res.headers['Content-Length']), res.body.length);
    assert.doesNotMatch(res.body.toString() + JSON.stringify(res.headers), /private-secret|bad%secret/);
  }
});
test('side-effecting analytics/contact scripts are EMPTY JS without reader invocation', () => {
  const {handler, calls} = fixture(false, () => { throw new Error('must not be read'); });
  for (const path of ['/analytics.js', '/contact-form.js?version=1']) {
    const res = invoke(handler, path);
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 0);
    assert.equal(res.headers['Content-Length'], '0');
    assert.equal(res.headers['Content-Type'], 'application/javascript; charset=utf-8');
  }
  assert.equal(calls.length, 0);
});
test('snapshot interface rejects unfrozen/missing/duplicate/additional/substituted paths', () => {
  for (const snapshot of [null, [], {}, {paths:PATHS, read(){}},
    {paths:Object.freeze(PATHS.slice(1)), read(){}},
    {paths:Object.freeze([...PATHS, 'private-secret']), read(){}},
    {paths:Object.freeze([...PATHS.slice(1), PATHS[1]]), read(){}},
    {paths:Object.freeze([...PATHS, 'mobile-menu.js', 'extra']), read(){}},
    {paths:Object.freeze([...PATHS]), read:null},
    {paths:Object.freeze(Array(83)), read(){}},
    {get paths(){throw new Error('secret');}, read(){}}]) {
    assert.throws(() => createSnapshotHandler(snapshot), /^Error: Snapshot request adapter refused$/);
  }
});
test('valid path order need not match but duplicates or nonstrings refuse', () => {
  const paths = Object.freeze([...PATHS].reverse());
  assert.equal(invoke(createSnapshotHandler({paths, read: () => Buffer.alloc(0)}), '/').status, 200);
  for (const replacement of [undefined, {}, 1, null]) {
    const bad = [...PATHS]; bad[0] = replacement;
    assert.throws(() => createSnapshotHandler({paths:Object.freeze(bad), read(){}}));
  }
});
test('a forged frozen-array iterator cannot hide substituted paths', () => {
  const paths = [...PATHS]; paths[0] = 'private-secret.txt';
  paths[Symbol.iterator] = function* () {};
  assert.throws(() => createSnapshotHandler({paths:Object.freeze(paths), read(){}}), /adapter refused/);
  const valid = [...PATHS]; valid[Symbol.iterator] = function* () { yield 'private.txt'; };
  const handler = createSnapshotHandler({paths:Object.freeze(valid), read: () => Buffer.alloc(0)});
  assert.equal(invoke(handler, '/private.txt').status, 404);
  assert.equal(invoke(handler, '/').status, 200);
});
test('interface and returned buffers are captured/copied against caller mutation', () => {
  const original = Buffer.from('safe');
  const {snapshot, handler} = fixture(false, () => original);
  snapshot.read = () => Buffer.from('replacement');
  snapshot.paths = Object.freeze([...PATHS, 'private.txt']);
  const first = invoke(handler, '/');
  first.body.fill(0);
  assert.equal(original.toString(), 'safe');
  assert.equal(invoke(handler, '/').body.toString(), 'safe');
  assert.equal(invoke(handler, '/private.txt').status, 404);
});
test('read failures and invalid return types are generic500, bodyless for HEAD', () => {
  for (const override of [() => {throw new Error('secret-path-token');},
    () => 'secret-string', () => new Uint8Array([1]), () => null,
    () => Buffer.alloc(MAX_FILE_BYTES + 1), () => Promise.resolve(Buffer.from('x'))]) {
    const {handler} = fixture(false, override);
    const get = invoke(handler, '/'), head = invoke(handler, '/', 'HEAD');
    assert.equal(get.status, 500);
    assert.equal(get.body.toString(), 'Internal error\n');
    assert.equal(head.status, 500);
    assert.equal(head.body, undefined);
    assert.deepEqual(get.headers, head.headers);
  }
});
test('maximum file bytes admitted exactly', () => {
  const {handler} = fixture(false, () => Buffer.alloc(MAX_FILE_BYTES));
  assert.equal(invoke(handler, '/logo.png').body.length, MAX_FILE_BYTES);
});
test('overridden function bind cannot escape the generic factory boundary', () => {
  function read() { return Buffer.from('safe'); }
  Object.defineProperty(read, 'bind', {get() { throw new Error('secret-bind-token'); }});
  const handler = createSnapshotHandler({paths:Object.freeze([...PATHS]), read});
  assert.equal(invoke(handler, '/').body.toString(), 'safe');
});
test('HEAD URL getter exception remains a generic bodyless error', () => {
  const {handler, calls} = fixture();
  const req = {method:'HEAD', get url() { throw new Error('secret-url-token'); }};
  const res = response(); handler(req, res);
  assert.equal(res.status, 500);
  assert.equal(res.body, undefined);
  assert.equal(res.headers['Content-Length'], String(Buffer.byteLength('Internal error\n')));
  assert.equal(calls.length, 0);
});
test('route helper rejects invalid inclusion flags without interpreting truthiness', () => {
  for (const value of [1, 'true', null, {}, []]) {
    assert.throws(() => resolveSnapshotRoute('/', value), /adapter refused/);
  }
});
test('frozen exports and route helper do not expose allowlist mutation', () => {
  const exported = require('./snapshot-request-handler.cjs');
  assert.equal(Object.isFrozen(exported), true);
  assert.equal(exported.PATHS, undefined);
  assert.equal(resolveSnapshotRoute('/docs/private.md', true).status, 404);
});

