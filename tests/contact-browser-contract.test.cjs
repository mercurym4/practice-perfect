'use strict';
/* Pure fixture guard tests only. No browser API is started by this test file. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const fixture = require('./contact-browser-recovery.cjs');
const { MANIFEST, ORIGIN, ENTRY, SYNTHETIC, SCENARIOS, gitBlobSha, readFrozenSources,
  validateSources, routeDecision, expectedAbort, createRouteHandler, scenarioPlan, runContactRecovery } = fixture;
const sources = () => readFrozenSources(path.resolve(__dirname, '..'));

test('six actual contact assets bind exact byte buffers to frozen repository blobs', () => {
  const input = sources();
  assert.equal(MANIFEST.length, 6);
  assert.equal(validateSources(input).size, 6);
  for (const item of MANIFEST) assert.equal(gitBlobSha(input[item.file]), item.sha);
});

test('source guard rejects changed bytes, wrong types, missing and extra routes before execution', () => {
  const input = sources();
  assert.throws(() => validateSources({ ...input, 'contact-form.js': Buffer.from('throw Error()') }), /Frozen source mismatch/);
  assert.throws(() => validateSources({ ...input, 'contact-form.js': input['contact-form.js'].toString() }), /byte buffers/);
  const missing = { ...input }; delete missing['contact.html'];
  assert.throws(() => validateSources(missing), /Exact source manifest/);
  assert.throws(() => validateSources({ ...input, 'extra.js': Buffer.from('') }), /Exact source manifest/);
  assert.throws(() => validateSources(Object.assign(Object.create(null), input)), /plain source map/);
});

test('exact source route, GET and resource-type tuples are the sole fulfilled set', () => {
  for (const item of MANIFEST) {
    assert.equal(routeDecision({ url: ORIGIN + item.route, method: 'GET', type: item.type }), item);
    for (const method of ['POST', 'PUT', 'HEAD', 'OPTIONS'])
      assert.equal(routeDecision({ url: ORIGIN + item.route, method, type: item.type }), null);
    assert.equal(routeDecision({ url: ORIGIN + item.route, method: 'GET', type: 'fetch' }), null);
  }
});

test('query, fragment, credential, alternate origin, encoded and traversal paths fail closed', () => {
  for (const url of [ENTRY + '?x=1', ENTRY + '#x', ENTRY + '/', ORIGIN + '/contact.html',
    'http://pp-contact.invalid/contact', 'https://evil.invalid/contact',
    'https://pp-contact.invalid.evil.invalid/contact', 'https://user@pp-contact.invalid/contact',
    ORIGIN + '/%63ontact', ORIGIN + '/a/../contact', 'data:text/html,fixture', 'file:///contact'])
    assert.equal(routeDecision({ url, method: 'GET', type: 'document' }), null, url);
  assert.equal(routeDecision(null), null);
});

test('API, analytics, font, unknown static and websocket URLs never receive source bytes', () => {
  for (const url of [ORIGIN + '/api/contact', ORIGIN + '/analytics.js', ORIGIN + '/unknown.js',
    'https://fonts.googleapis.com/css2?family=Inter', 'https://fonts.gstatic.com/font.woff2',
    'wss://pp-contact.invalid/socket'])
    for (const method of ['GET', 'POST']) assert.equal(routeDecision({ url, method, type: 'fetch' }), null);
});

test('routing fulfills exact byte copies even after a caller mutates its original buffer', async () => {
  const input = sources();
  const original = Buffer.from(input['contact-form.js']);
  const { handler, counts } = createRouteHandler(input);
  input['contact-form.js'].fill(0);
  let options;
  await handler({ request: () => ({ url: () => ORIGIN + '/contact-form.js', method: () => 'GET', resourceType: () => 'script' }),
    fulfill: async value => { options = value; }, abort: () => assert.fail('Exact asset must not abort') });
  assert.deepEqual(options.body, original);
  assert.equal(options.contentType, 'text/javascript');
  assert.equal(options.status, 200);
  assert.match(options.headers['content-security-policy'], /connect-src 'none'/);
  assert.match(options.headers['content-security-policy'], /form-action 'none'/);
  assert.equal(options.headers['cache-control'], 'no-store');
  assert.deepEqual(counts, { fulfilled: 1, aborted: 0, unexpected: 0, assets: { '/contact-form.js': 1 } });
});

test('closed handler aborts rather than continues or falls back, counts unexpected API use', async () => {
  const { handler, counts } = createRouteHandler(sources());
  for (const url of [ORIGIN + '/api/contact', 'https://fonts.googleapis.com/font', ORIGIN + '/analytics.js']) {
    let aborted;
    await handler({ request: () => ({ url: () => url, method: () => 'POST', resourceType: () => 'fetch' }),
      abort: async value => { aborted = value; }, fulfill: () => assert.fail('Unknown request must not fulfill'),
      continue: () => assert.fail('No live continuation permitted'), fallback: () => assert.fail('No fallback permitted') });
    assert.equal(aborted, 'blockedbyclient');
  }
  assert.deepEqual(counts, { fulfilled: 0, aborted: 3, unexpected: 3, assets: {} });
});

test('only precise optional analytics, font CSS and favicon GET requests are expected aborts', () => {
  const requests = [
    { url: ORIGIN + '/analytics.js', type: 'script' },
    { url: ORIGIN + '/favicon.ico', type: 'image' },
    { url: 'https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Inter:wght@400;500;600;700;800&display=swap', type: 'stylesheet' }
  ];
  for (const request of requests) {
    assert.equal(expectedAbort({ ...request, method: 'GET' }), true);
    assert.equal(expectedAbort({ ...request, method: 'POST' }), false);
    assert.equal(expectedAbort({ ...request, url: request.url + '&extra=1', method: 'GET' }), false);
    assert.equal(expectedAbort({ ...request, type: 'fetch', method: 'GET' }), false);
  }
  assert.equal(expectedAbort(null), false);
});

test('scenario response plans are bounded, synthetic and reject unknown cases', () => {
  assert.equal(SCENARIOS.length, 10);
  assert.deepEqual(scenarioPlan('stalled-fetch'), ['fetch-pending', 'accepted']);
  assert.deepEqual(scenarioPlan('stalled-body'), ['body-pending', 'accepted']);
  assert.deepEqual(scenarioPlan('malformed-success'), ['malformed']);
  assert.deepEqual(scenarioPlan('private-error'), ['private']);
  assert.deepEqual(scenarioPlan('late-fetch-retry'), ['fetch-pending', 'accepted']);
  assert.deepEqual(scenarioPlan('late-body-retry'), ['body-pending', 'accepted']);
  assert.deepEqual(scenarioPlan('late-fetch-accepted-retry'), ['fetch-pending', 'accepted']);
  assert.deepEqual(scenarioPlan('late-body-accepted-retry'), ['body-pending', 'accepted']);
  assert.deepEqual(scenarioPlan('accepted-dedup'), ['accepted', 'accepted']);
  assert.throws(() => scenarioPlan('live-provider'), /Unknown scenario/);
});

test('synthetic payload contains no real recipient or free-form execution configuration', () => {
  assert.equal(new URL('mailto:' + SYNTHETIC.email).pathname.split('@')[1], 'pp-contact.invalid');
  assert.equal(SYNTHETIC.website, '');
  assert.deepEqual(Object.keys(SYNTHETIC).sort(), ['website', 'first_name', 'last_name', 'email', 'company', 'interest', 'message'].sort());
  assert.equal(Object.isFrozen(SYNTHETIC), true);
  assert.equal(Object.isFrozen(MANIFEST), true);
  assert.equal(MANIFEST.every(Object.isFrozen), true);
});

test('module is export-only, has no Playwright dependency import or direct CLI entrypoint', () => {
  const source = fs.readFileSync(path.join(__dirname, 'contact-browser-recovery.cjs'), 'utf8');
  assert.doesNotMatch(source, /require\(['"](?:playwright|puppeteer)/);
  assert.doesNotMatch(source, /(?:chromium|firefox|webkit)\.launch\s*\(/);
  assert.doesNotMatch(source, /createServer\s*\(/);
  assert.doesNotMatch(source, /route\.(?:continue|fallback)\s*\(/);
  assert.doesNotMatch(source, /dispatchEvent\s*\(|\.submit\s*\(/);
  assert.doesNotMatch(source, /require\.main|process\.argv|process\.env/);
});

test('wrong source fails before any supplied Browser call', async () => {
  let calls = 0;
  const browser = { newContext() { calls++; throw Error('Should not execute'); } };
  const input = sources(); input['contact.html'] = Buffer.from('wrong');
  await assert.rejects(runContactRecovery(browser, input), /Frozen source mismatch/);
  assert.equal(calls, 0);
  await assert.rejects(runContactRecovery(null, sources()), /admitted Browser/);
});

test('pure adapter failure proves owned-context cleanup and route-before-navigation order', async () => {
  const order = [];
  const browser = { async newContext(options) {
    assert.equal(options.offline, true);
    assert.equal(options.serviceWorkers, 'block');
    assert.equal(options.acceptDownloads, false);
    order.push('context');
    return { async route(pattern, handler) { assert.equal(pattern, '**/*'); assert.equal(typeof handler, 'function'); order.push('route'); },
      async addInitScript(script, args) { assert.equal(typeof script, 'function'); assert.deepEqual(args.expected, SYNTHETIC); order.push('init'); },
      async newPage() { order.push('page'); return { setDefaultTimeout() {},
        async goto(url) { assert.equal(url, ENTRY); order.push('navigation-attempt'); throw Error('Synthetic setup stop; no browser'); } }; },
      async close() { order.push('close-original-context'); } };
  } };
  await assert.rejects(runContactRecovery(browser, sources()), /Synthetic setup stop/);
  assert.deepEqual(order, ['context', 'route', 'init', 'page', 'navigation-attempt', 'close-original-context']);
});

// Capture and serialize the actual fixture init function via a fake adapter. This
// checks the transport guard itself, NOT DOM/native browser or site behavior.
async function isolatedTransport() {
  let captured, closed = false;
  const browser = { async newContext() { return {
    async route() {},
    async addInitScript(script, args) { captured = { script, args }; throw Error('Pure capture stop'); },
    async close() { closed = true; }
  }; } };
  await assert.rejects(runContactRecovery(browser, sources()), /Pure capture stop/);
  assert.equal(closed, true);
  const window = {};
  const navigator = {};
  class Form { reset() {} }
  class Xhr { open() {} }
  class Signal {}
  const install = vm.runInNewContext(`(${captured.script.toString()})`, {
    window, navigator, HTMLFormElement: Form, XMLHttpRequest: Xhr, AbortSignal: Signal
  });
  install(captured.args);
  return { window, navigator, Xhr, Signal, state: window.__ppRecovery };
}

test('actual serialized fixture guard counts denied transport constructors and methods', async () => {
  const { window, navigator, Xhr, state } = await isolatedTransport();
  for (const name of ['WebSocket', 'EventSource', 'Worker', 'SharedWorker', 'RTCPeerConnection', 'webkitRTCPeerConnection'])
    assert.throws(() => new window[name]('https://blocked.invalid'), /Offline fixture blocked transport/);
  assert.throws(() => navigator.sendBeacon('https://blocked.invalid'), /Offline fixture blocked transport/);
  assert.throws(() => new Xhr().open('GET', 'https://blocked.invalid'), /Offline fixture blocked transport/);
  assert.equal(state.rejected, 8, 'A nonconstructable arrow would miss constructor attempts');
});

test('actual serialized fetch guard counts malformed, non-synthetic and excess requests', async () => {
  const { window, Signal, state } = await isolatedTransport();
  const valid = () => ({ method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(SYNTHETIC), signal: new Signal() });
  await assert.rejects(window.fetch('/api/contact', { ...valid(), body: 'not-json' }), /Synthetic body required/);
  await assert.rejects(window.fetch('https://blocked.invalid/api/contact', valid()), /Unexpected synthetic request/);
  await assert.rejects(window.fetch('/api/contact', { ...valid(), method: 'GET' }), /Unexpected synthetic request/);
  await assert.rejects(window.fetch('/api/contact', { ...valid(), headers: {} }), /Unexpected synthetic request/);
  await assert.rejects(window.fetch('/api/contact', { ...valid(), signal: {} }), /Unexpected synthetic request/);
  await assert.rejects(window.fetch('/api/contact', { ...valid(), body: JSON.stringify({ ...SYNTHETIC, email: 'other@pp-contact.invalid' }) }), /Unexpected synthetic request/);
  await assert.rejects(window.fetch('/api/contact', { ...valid(), body: JSON.stringify({ ...SYNTHETIC, extra: '' }) }), /Unexpected synthetic request/);
  await assert.rejects(window.fetch('/api/contact', { ...valid(), body: '[]' }), /Unexpected synthetic request/);
  assert.equal(state.rejected, 8);
  assert.equal(state.calls.length, 0);
  for (let count = 0; count < 2; count++) {
    const response = await window.fetch('/api/contact', valid());
    assert.equal(response.ok, true);
    assert.equal((await response.json()).ok, true);
  }
  await assert.rejects(window.fetch('/api/contact', valid()), /No automatic resend permitted/);
  assert.equal(state.calls.length, 3);
  assert.equal(state.rejected, 9);
  assert.equal(JSON.stringify(state.calls).includes(SYNTHETIC.email), false, 'Audit calls carry keys, not field values');
});
