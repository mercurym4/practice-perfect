const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');

const fallback = 'Your request could not be confirmed. Please try again or email mike@practiceperfect.us directly.';
const initialFields = { email: 'private@example.com', message: 'private message', first_name: 'Test' };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const flush = async () => { for (let index = 0; index < 16; index++) await Promise.resolve(); };
const accepted = (id = 'accepted') => ({ ok: true, json: async () => ({ ok: true, requestId: id }) });

function harness(fetchImpl = async () => accepted(), { analyticsThrows = false, controllerMissing = false } = {}) {
  const timers = new Map();
  const calls = [];
  const events = [];
  const signals = [];
  let nextTimer = 0, now = 0, resets = 0, submit;
  const fields = { ...initialFields };
  const button = { disabled: false, textContent: 'Request a Strategy Call →' };
  const status = { hidden: true, textContent: '' };
  const form = {
    querySelector: selector => { assert.equal(selector, 'button[type="submit"]'); return button; },
    addEventListener: (name, fn) => { assert.equal(name, 'submit'); submit = fn; },
    reset: () => { resets++; for (const key of Object.keys(fields)) fields[key] = ''; }
  };
  class FormData { constructor() { return Object.entries(fields); } }
  class Controller extends AbortController { constructor() { super(); signals.push(this.signal); } }
  vm.runInNewContext(fs.readFileSync('contact-form.js', 'utf8'), {
    document: { getElementById: id => id === 'strategy-call-form' ? form : status },
    window: { va: (type, payload) => { if (analyticsThrows) throw Error('Measurement unavailable'); events.push({ type, payload }); } },
    FormData, Set, AbortController: controllerMissing ? undefined : Controller,
    setTimeout: (fn, delay) => { const id = ++nextTimer; timers.set(id, { fn, at: now + delay }); return id; },
    clearTimeout: id => timers.delete(id),
    fetch: (url, options) => { calls.push({ url, options }); return fetchImpl(url, options); }
  });
  return {
    button, status, fields, calls, events, signals, timers,
    get resets() { return resets; },
    submit: () => submit({ preventDefault() {} }),
    async tick(milliseconds) {
      now += milliseconds;
      for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.fn(); }
      await flush();
    }
  };
}

function recovered(h) {
  assert.equal(h.button.disabled, false);
  assert.equal(h.button.textContent, 'Request a Strategy Call →');
  assert.equal(h.status.hidden, false);
  assert.equal(h.timers.size, 0);
}
function failed(h) {
  recovered(h);
  assert.equal(h.status.textContent, fallback);
  assert.deepEqual(h.fields, initialFields);
  assert.equal(h.resets, 0);
  assert.equal(h.events.length, 0);
}

test('stalled fetch recovers at 15 seconds even when fetch ignores abort', async () => {
  const h = harness(() => new Promise(() => {}));
  let settled = false;
  h.submit().then(() => { settled = true; });
  await flush();
  assert.equal(h.button.disabled, true);
  await h.tick(14999);
  assert.equal(h.button.disabled, true);
  assert.equal(settled, false);
  await h.tick(1);
  assert.equal(settled, true);
  assert.equal(h.signals[0].aborted, true);
  assert.equal(h.calls.length, 1, 'No automatic resend');
  failed(h);
});

test('stalled JSON body has the same whole-request deadline', async () => {
  const h = harness(async () => ({ ok: true, json: () => new Promise(() => {}) }));
  let settled = false;
  h.submit().then(() => { settled = true; });
  await flush();
  await h.tick(15000);
  assert.equal(settled, true);
  assert.equal(h.signals[0].aborted, true);
  failed(h);
});

test('abort-aware fetch rejection recovers without exposing AbortError', async () => {
  const h = harness((_, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('Aborted detail', 'AbortError')));
  }));
  const pending = h.submit();
  await h.tick(15000);
  await pending;
  failed(h);
});

test('late accepted fetch cannot clear fields or emit success after timeout', async () => {
  const response = deferred();
  const h = harness(() => response.promise);
  h.submit();
  await h.tick(15000);
  failed(h);
  response.resolve(accepted('late'));
  await flush();
  failed(h);
});

test('late accepted JSON cannot change the timeout result', async () => {
  const body = deferred();
  const h = harness(async () => ({ ok: true, json: () => body.promise }));
  h.submit();
  await flush();
  await h.tick(15000);
  body.resolve({ ok: true, requestId: 'late-body' });
  await flush();
  failed(h);
});

test('network errors use a stable confirmation fallback', async () => {
  const h = harness(async () => { throw new TypeError('NetworkError: private browser detail'); });
  await h.submit();
  failed(h);
});

test('non-JSON responses use the same fallback', async () => {
  const h = harness(async () => ({ ok: false, json: async () => { throw new SyntaxError('Unexpected token <'); } }));
  await h.submit();
  failed(h);
});

test('null JSON does not expose an implementation error', async () => {
  const h = harness(async () => ({ ok: true, json: async () => null }));
  await h.submit();
  failed(h);
});

test('malformed JSON success flags never falsely confirm or clear a submission', async () => {
  for (const result of [
    { ok: 'false', requestId: 'opaque' }, { ok: 1 }, { ok: {} },
    { ok: [] }, {}, null, [], 'true', true
  ]) {
    const h = harness(async () => ({ ok: true, json: async () => result }));
    await h.submit();
    failed(h);
  }
});

test('rejected JSON keeps approved server error text and fields', async () => {
  const h = harness(async () => ({ ok: false, json: async () => ({ error: 'Please provide your name and a valid email address.' }) }));
  await h.submit();
  recovered(h);
  assert.equal(h.status.textContent, 'Please provide your name and a valid email address.');
  assert.deepEqual(h.fields, initialFields);
  assert.equal(h.resets, 0);
});

test('rejection without a useful server error uses confirmation fallback', async () => {
  const h = harness(async () => ({ ok: false, json: async () => ({ error: { private: 'detail' } }) }));
  await h.submit();
  failed(h);
});

test('unknown server strings cannot expose provider, CDN or contact detail', async () => {
  for (const error of ['Request rejected', 'Provider error for private@example.com', '<html>Gateway detail</html>', 'Please check your form details.\nprivate']) {
    const h = harness(async () => ({ ok: false, json: async () => ({ error }) }));
    await h.submit();
    failed(h);
  }
});

test('all exact current API error strings remain displayable', async () => {
  for (const error of [
    'Please submit the contact form.', 'Please submit from this website.',
    'Please check your form details.', 'Please try again.', 'Please shorten your form details.',
    'Please provide your name and a valid email address.',
    'Your request was not sent. Please email mike@practiceperfect.us directly.', fallback
  ]) {
    const h = harness(async () => ({ ok: false, json: async () => ({ error }) }));
    await h.submit();
    recovered(h);
    assert.equal(h.status.textContent, error);
    assert.deepEqual(h.fields, initialFields);
    assert.equal(h.events.length, 0);
  }
});

test('accepted requests retain success copy, reset, request shape and no-PII event', async () => {
  const h = harness();
  await h.submit();
  recovered(h);
  assert.equal(h.status.textContent, 'Thank you. Your strategy-call request has been sent. We’ll follow up using the email you provided.');
  assert.equal(h.resets, 1);
  assert.equal(h.calls[0].url, '/api/contact');
  assert.equal(h.calls[0].options.method, 'POST');
  assert.equal(h.calls[0].options.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(h.calls[0].options.body), initialFields);
  assert.equal(h.calls[0].options.signal, h.signals[0]);
  assert.equal(h.signals[0].aborted, false);
  assert.equal(JSON.stringify(h.events), '[{"type":"event","payload":{"name":"strategy_call_sent"}}]');
  await h.tick(15000);
  assert.equal(h.signals[0].aborted, false, 'Success clears timeout');
});

test('duplicate submit while pending does not dispatch twice', async () => {
  const response = deferred();
  const h = harness(() => response.promise);
  const pending = h.submit();
  await h.submit();
  assert.equal(h.calls.length, 1);
  response.resolve(accepted());
  await pending;
  recovered(h);
});

test('manual retry gets a fresh signal and stale response cannot override it', async () => {
  const first = deferred();
  let attempts = 0;
  const h = harness(() => ++attempts === 1 ? first.promise : Promise.resolve(accepted('retry')));
  h.submit();
  await h.tick(15000);
  failed(h);
  await h.submit();
  assert.equal(h.calls.length, 2);
  assert.notEqual(h.signals[0], h.signals[1]);
  assert.equal(h.resets, 1);
  const success = h.status.textContent;
  first.resolve({ ok: false, json: async () => ({ error: 'Stale failure' }) });
  await flush();
  assert.equal(h.status.textContent, success);
  assert.equal(h.resets, 1);
  recovered(h);
});

test('accepted request IDs remain deduplicated per page', async () => {
  const h = harness();
  await h.submit();
  await h.submit();
  assert.equal(h.resets, 2);
  assert.equal(h.events.length, 1);
  recovered(h);
});

test('analytics failure cannot turn accepted submission into failure', async () => {
  const h = harness(undefined, { analyticsThrows: true });
  await h.submit();
  assert.match(h.status.textContent, /^Thank you/);
  assert.equal(h.resets, 1);
  recovered(h);
});

test('unavailable AbortController fails safely before dispatch', async () => {
  const h = harness(undefined, { controllerMissing: true });
  await h.submit();
  assert.equal(h.calls.length, 0);
  failed(h);
});
