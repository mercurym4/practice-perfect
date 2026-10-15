/* PP-WEB-29 SOURCE FIXTURE ONLY. No CLI, launch, server, or dependency import.
 * An independently admitted runner supplies Browser and an exact-source checkout.
 * Native DOM/constraint validation is exercised; fetch/body are browser-local fakes.
 * Offline routing is defense in depth, NOT an OS/network-namespace enclosure claim.
 */
'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ASSET_BASELINE_REVISION = 'bb227a3151479110ce601afd719d925063f2ce7d';
const ORIGIN = 'https://pp-contact.invalid';
const ENTRY = `${ORIGIN}/contact`;
const FALLBACK = 'Your request could not be confirmed. Please try again or email mike@practiceperfect.us directly.';
const SUCCESS = 'Thank you. Your strategy-call request has been sent. We’ll follow up using the email you provided.';
const BUTTON = 'Request a Strategy Call →';
const SYNTHETIC = Object.freeze({ website: '', first_name: 'Synthetic', last_name: 'Fixture',
  email: 'browser-fixture@pp-contact.invalid', company: 'Synthetic Fixture',
  interest: 'Revenue Growth Sprint', message: 'Synthetic offline fixture only.' });
const MANIFEST = Object.freeze([
  Object.freeze({ file: 'contact.html', route: '/contact', type: 'document', mime: 'text/html', sha: '62b6ff4155538ba1897f3853fb719d97037409e0' }),
  Object.freeze({ file: 'contact-form.js', route: '/contact-form.js', type: 'script', mime: 'text/javascript', sha: '9e25ab032521575570567e2414cdfd7530ed5979' }),
  Object.freeze({ file: 'mobile-menu.js', route: '/mobile-menu.js', type: 'script', mime: 'text/javascript', sha: 'd735442cbc2f74b448ab941d03e07ff0fa894822' }),
  Object.freeze({ file: 'styles.css', route: '/styles.css', type: 'stylesheet', mime: 'text/css', sha: '6857ee97cf7658665de5796282c6dd6003262fc0' }),
  Object.freeze({ file: 'enhancements.css', route: '/enhancements.css', type: 'stylesheet', mime: 'text/css', sha: '7ae6600533e749d7307b273c585a04a538fe02f3' }),
  Object.freeze({ file: 'assets/library/logos/practice-perfect-logo.svg', route: '/assets/library/logos/practice-perfect-logo.svg', type: 'image', mime: 'image/svg+xml', sha: '999490570956b7717a8a8c26026916129ddbd6eb' })
]);
const SCENARIOS = Object.freeze(['native-validation', 'stalled-fetch', 'stalled-body',
  'malformed-success', 'private-error', 'accepted-dedup', 'late-fetch-retry', 'late-body-retry',
  'late-fetch-accepted-retry', 'late-body-accepted-retry']);

function gitBlobSha(bytes) {
  assert.ok(Buffer.isBuffer(bytes), 'Sources must be exact byte buffers');
  return crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}

// No arbitrary extra routes or executable bytes. Return private byte copies so
// mutation of caller buffers after validation cannot change fulfilled source.
function validateSources(input) {
  assert.ok(input && Object.getPrototypeOf(input) === Object.prototype, 'Expected plain source map');
  assert.deepEqual(Object.keys(input).sort(), MANIFEST.map(item => item.file).sort(), 'Exact source manifest required');
  const sources = new Map();
  for (const item of MANIFEST) {
    assert.equal(gitBlobSha(input[item.file]), item.sha, `Frozen source mismatch: ${item.file}`);
    sources.set(item.route, Buffer.from(input[item.file]));
  }
  return sources;
}

function readFrozenSources(checkout) {
  assert.equal(typeof checkout, 'string');
  const source = Object.fromEntries(MANIFEST.map(item => [item.file, fs.readFileSync(path.join(checkout, item.file))]));
  validateSources(source);
  return source;
}

function routeDecision(request) {
  if (!request || request.method !== 'GET') return null;
  return MANIFEST.find(item => request.url === ORIGIN + item.route && request.type === item.type) || null;
}

function expectedAbort(request) {
  if (!request || request.method !== 'GET') return false;
  return (request.url === ORIGIN + '/analytics.js' && request.type === 'script') ||
    (request.url === ORIGIN + '/favicon.ico' && ['image', 'other'].includes(request.type)) ||
    (request.url === 'https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Inter:wght@400;500;600;700;800&display=swap' && request.type === 'stylesheet');
}

function createRouteHandler(input) {
  const sources = validateSources(input);
  const counts = { fulfilled: 0, aborted: 0, unexpected: 0, assets: {} };
  const handler = async route => {
    const request = route.request();
    const details = { url: request.url(), method: request.method(), type: request.resourceType() };
    const item = routeDecision(details);
    if (!item) {
      counts.aborted++;
      // Only the exact approved HTML's external-font/analytics/favicon requests
      // may be expected aborts. All other paths, methods and types fail the case.
      if (!expectedAbort(details)) counts.unexpected++;
      return route.abort('blockedbyclient');
    }
    counts.fulfilled++;
    counts.assets[item.route] = (counts.assets[item.route] || 0) + 1;
    return route.fulfill({ status: 200, contentType: item.mime, body: sources.get(item.route),
      headers: { 'cache-control': 'no-store', 'content-security-policy':
        "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'" } });
  };
  return { handler, counts };
}

function scenarioPlan(name) {
  assert.ok(SCENARIOS.includes(name), 'Unknown scenario');
  if (name === 'stalled-fetch' || name.startsWith('late-fetch-')) return ['fetch-pending', 'accepted'];
  if (name === 'stalled-body' || name.startsWith('late-body-')) return ['body-pending', 'accepted'];
  if (name === 'malformed-success') return ['malformed'];
  if (name === 'private-error') return ['private'];
  return ['accepted', 'accepted'];
}

// Serialized by addInitScript; deliberately self-contained, no production handler
// copy. This is transport simulation only; form events/validation remain native.
function installTransport({ plans, expected }) {
  const state = { calls: [], events: [], signals: [], resets: 0, rejected: 0 };
  const pending = [];
  const permitted = new Set(Object.keys(expected));
  const response = (mode) => ({ ok: mode !== 'private', json: async () => mode === 'malformed'
    ? { ok: 'false', requestId: 'synthetic-request' }
    : mode === 'private' ? { error: 'Synthetic provider detail browser-fixture@pp-contact.invalid' }
      : { ok: true, requestId: 'synthetic-request' } });
  Object.defineProperty(window, '__ppRecovery', { value: state });
  state.release = (index, privateError = false) => {
    if (!pending[index]) throw new Error('No pending synthetic response');
    pending[index](privateError ? response('private') : response('accepted'));
    pending[index] = null;
  };
  window.va = (type, payload) => state.events.push({ type, payload });
  const nativeReset = HTMLFormElement.prototype.reset;
  HTMLFormElement.prototype.reset = function () {
    if (this.id === 'strategy-call-form') state.resets++;
    return nativeReset.call(this);
  };
  function deny() { state.rejected++; throw new Error('Offline fixture blocked transport'); }
  for (const name of ['WebSocket', 'EventSource', 'Worker', 'SharedWorker', 'RTCPeerConnection', 'webkitRTCPeerConnection']) {
    Object.defineProperty(window, name, { value: deny, configurable: true });
  }
  navigator.sendBeacon = deny;
  XMLHttpRequest.prototype.open = deny;
  window.fetch = (input, options = {}) => {
    let body;
    try { body = JSON.parse(options.body); } catch (_) { state.rejected++; return Promise.reject(new Error('Synthetic body required')); }
    const valid = input === '/api/contact' && options.method === 'POST' &&
      options.headers?.['Content-Type'] === 'application/json' && options.signal instanceof AbortSignal &&
      body && typeof body === 'object' && Object.keys(body).length === permitted.size &&
      Object.keys(body).every(key => permitted.has(key) && body[key] === expected[key]);
    if (!valid) { state.rejected++; return Promise.reject(new Error('Unexpected synthetic request')); }
    const index = state.calls.length;
    state.calls.push({ url: input, method: options.method, keys: Object.keys(body).sort() });
    state.signals.push(options.signal);
    const mode = plans[index];
    if (!mode) { state.rejected++; return Promise.reject(new Error('No automatic resend permitted')); }
    if (mode === 'fetch-pending') return new Promise(resolve => { pending[index] = resolve; });
    if (mode === 'body-pending') return Promise.resolve({ ok: true,
      json: () => new Promise(resolve => { pending[index] = value => value.json().then(resolve); }) });
    return Promise.resolve(response(mode));
  };
}

async function snapshot(page) {
  return page.evaluate(() => {
    const form = document.getElementById('strategy-call-form');
    const button = form.querySelector('button[type="submit"]');
    const status = document.getElementById('contact-status');
    const state = window.__ppRecovery;
    return { fields: Object.fromEntries(new FormData(form)), valid: form.checkValidity(),
      button: { disabled: button.disabled, text: button.textContent }, status: { hidden: status.hidden, text: status.textContent },
      calls: state.calls, events: state.events, aborted: state.signals.map(signal => signal.aborted),
      resets: state.resets, rejected: state.rejected };
  });
}

async function fill(page) {
  for (const [name, value] of Object.entries(SYNTHETIC)) {
    if (name === 'website') continue; // Leave the actual hidden honeypot untouched.
    const input = page.locator(`#strategy-call-form [name="${name}"]`);
    if (name === 'interest') await input.selectOption({ label: value });
    else await input.fill(value);
  }
}

async function clickAndSettle(page) {
  await page.locator('#strategy-call-form button[type="submit"]').click();
  await page.waitForFunction(() => !document.querySelector('#strategy-call-form button[type="submit"]').disabled,
    undefined, { timeout: 20000 });
}

function assertRecovered(state, expectedStatus, fieldsRetained) {
  assert.deepEqual(state.button, { disabled: false, text: BUTTON });
  assert.deepEqual(state.status, { hidden: false, text: expectedStatus });
  assert.equal(state.rejected, 0);
  if (fieldsRetained) {
    assert.deepEqual(state.fields, SYNTHETIC);
    assert.equal(state.resets, 0);
    assert.deepEqual(state.events, []);
  }
}

function assertSuccess(state, calls, resets = 1) {
  assertRecovered(state, SUCCESS, false);
  assert.equal(state.calls.length, calls);
  assert.equal(state.resets, resets);
  assert.deepEqual(state.fields, { website: '', first_name: '', last_name: '', email: '', company: '',
    interest: 'Practice Growth Audit', message: '' });
  assert.deepEqual(state.events, [{ type: 'event', payload: { name: 'strategy_call_sent' } }]);
}

async function runScenario(browser, sources, name) {
  scenarioPlan(name); // Reject unknown work before context creation.
  const routing = createRouteHandler(sources);
  const context = await browser.newContext({ offline: true, serviceWorkers: 'block', acceptDownloads: false,
    viewport: { width: 390, height: 844 } });
  try {
    await context.route('**/*', routing.handler);
    await context.addInitScript(installTransport, { plans: scenarioPlan(name), expected: SYNTHETIC });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    await page.goto(ENTRY, { waitUntil: 'load', timeout: 20000 });
    assert.equal(await page.locator('#strategy-call-form').count(), 1);
    assert.equal(await page.locator('#contact-status[role="status"][aria-live="polite"]').count(), 1);
    assert.equal((await snapshot(page)).status.hidden, true);
    if (name === 'native-validation') {
      await page.locator('#strategy-call-form button[type="submit"]').click();
      let state = await snapshot(page);
      assert.equal(state.valid, false);
      assert.equal(state.calls.length, 0);
      assert.equal(state.status.hidden, true);
      await fill(page);
      await page.locator('#email').fill('not-an-email');
      await page.locator('#strategy-call-form button[type="submit"]').click();
      state = await snapshot(page);
      assert.equal(state.valid, false);
      assert.equal(state.calls.length, 0);
      assert.equal(state.status.hidden, true);
      assert.equal(await page.locator('#email').evaluate(el => el.validity.typeMismatch), true);
      await page.locator('#email').fill(SYNTHETIC.email);
      await clickAndSettle(page);
      assertSuccess(await snapshot(page), 1);
    } else {
      await fill(page);
      assert.equal((await snapshot(page)).valid, true);
      if (/stalled|late-/.test(name)) {
        await page.locator('#strategy-call-form button[type="submit"]').click();
        const pending = await snapshot(page);
        assert.equal(pending.button.disabled, true);
        assert.equal(pending.button.text, 'Sending…');
        assert.equal(pending.calls.length, 1);
        assert.equal(pending.aborted[0], false);
        await page.waitForFunction(() => !document.querySelector('#strategy-call-form button[type="submit"]').disabled,
          undefined, { timeout: 20000 }); // Real, unchanged production 15-second deadline.
        const timedOut = await snapshot(page);
        assertRecovered(timedOut, FALLBACK, true);
        assert.equal(timedOut.calls.length, 1, 'No automatic resend');
        assert.equal(timedOut.aborted[0], true);
        if (name.startsWith('late-')) {
          await clickAndSettle(page); // Actual manual retry; fields are still present.
          const before = await snapshot(page);
          assertSuccess(before, 2);
          assert.deepEqual(before.aborted, [true, false]);
          await page.evaluate(privateError => window.__ppRecovery.release(0, privateError), !name.includes('-accepted-'));
          // A task boundary drains the late promise chain without an arbitrary delay.
          await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 0)));
          assert.deepEqual(await snapshot(page), before, 'Late first response must not overwrite manual retry');
        }
      } else {
        await clickAndSettle(page);
        const first = await snapshot(page);
        if (name === 'accepted-dedup') {
          assertSuccess(first, 1);
          await fill(page);
          await clickAndSettle(page);
          assertSuccess(await snapshot(page), 2, 2);
        } else {
          assertRecovered(first, FALLBACK, true);
          assert.equal(first.calls.length, 1);
        }
      }
    }
    assert.equal(routing.counts.unexpected, 0, 'No browser API transport permitted');
    for (const item of MANIFEST) assert.ok(routing.counts.assets[item.route] >= 1, `Required frozen asset not observed: ${item.route}`);
    return { scenario: name, passed: true, routing: { ...routing.counts, assets: { ...routing.counts.assets } } };
  } finally {
    // Close the original owned context, not whichever page happens to be active.
    await context.close();
  }
}

async function runContactRecovery(browser, sources) {
  assert.ok(browser && typeof browser.newContext === 'function', 'Runner must supply an admitted Browser');
  validateSources(sources); // Fail before creating a context on wrong source bytes.
  const results = [];
  for (const scenario of SCENARIOS) results.push(await runScenario(browser, sources, scenario));
  return { assetBaselineRevision: ASSET_BASELINE_REVISION, scope: 'Native form/DOM with simulated fetch/body; not live API, provider, fonts or visual acceptance', results };
}

module.exports = { ASSET_BASELINE_REVISION, ORIGIN, ENTRY, SYNTHETIC, MANIFEST, SCENARIOS,
  gitBlobSha, validateSources, readFrozenSources, routeDecision, expectedAbort, createRouteHandler,
  scenarioPlan, runContactRecovery };
