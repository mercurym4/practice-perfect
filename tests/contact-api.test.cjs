'use strict';
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../api/contact.js'), 'utf8');
const fallback = 'Your request could not be confirmed. Please try again or email mike@practiceperfect.us directly.';
const valid = () => ({ first_name: ' Ada ', last_name: ' Lovelace ', email: ' ada@example.test ', company: ' Example ', interest: ' Intake ', message: ' Improve intake ', website: '' });
const config = { RESEND_API_KEY: 'synthetic-key', CONTACT_FROM_EMAIL: 'sender@example.test', CONTACT_TO_EMAIL: 'recipient@example.test' };
const accepted = () => ({ ok: true, status: 200, json: async () => ({ id: 'opaque-provider-id' }) });

function harness({ env = config, now = 1200001, provider = async () => accepted() } = {}) {
  const calls = [], signals = [], logs = [];
  const module = { exports: {} };
  const context = {
    module, process: { env: { ...env } }, Date: { now: () => now },
    require(name) { assert.equal(name, 'node:crypto'); return { createHash }; },
    console: { error: (...args) => logs.push(args) },
    AbortSignal: { timeout(ms) { assert.equal(ms, 10000); const signal = Object.freeze({ synthetic: true, timeoutMs: ms }); signals.push(signal); return signal; } },
    fetch: async (url, options) => { assert.equal(url, 'https://api.resend.com/emails'); calls.push({ url, options }); return provider(url, options); }
  };
  vm.runInNewContext(source, context, { filename: 'actual-api/contact.js' });
  assert.equal(typeof module.exports, 'function');
  return {
    calls, signals, logs,
    async invoke(req = {}) {
      const headers = {}, result = {};
      const res = { setHeader(name, value) { headers[name] = value; }, status(code) { result.status = code; return this; }, json(body) { result.body = JSON.parse(JSON.stringify(body)); return this; } };
      await module.exports({ method: 'POST', headers: { origin: 'https://practiceperfect.us', host: 'practiceperfect.us' }, body: valid(), ...req }, res);
      assert.equal(headers['Cache-Control'], 'no-store');
      return { ...result, headers };
    }
  };
}
async function refusedBeforeProvider(req, status, error, options) {
  const h = harness(options), result = await h.invoke(req);
  assert.equal(result.status, status); assert.deepEqual(result.body, { error });
  assert.equal(h.calls.length, 0); assert.equal(h.signals.length, 0);
  return result;
}

test('non-POST methods refuse before provider and advertise POST', async () => {
  for (const method of ['GET', 'PUT', 'OPTIONS', 'DELETE', undefined]) {
    const r = await refusedBeforeProvider({ method }, 405, 'Please submit the contact form.');
    assert.equal(r.headers.Allow, 'POST');
  }
});
test('missing, alternate, HTTP and suffixed origins refuse before provider', async () => {
  for (const origin of [undefined, '', 'https://other.test', 'http://practiceperfect.us', 'https://practiceperfect.us.evil.test', 'https://practiceperfect.us/'])
    await refusedBeforeProvider({ headers: { host: 'practiceperfect.us', origin } }, 403, 'Please submit from this website.');
});
test('malformed JSON and non-object top-level payloads refuse before provider', async () => {
  for (const body of ['{', null, undefined, [], true, 1, '"string"', 'null', '[]'])
    await refusedBeforeProvider({ body }, 400, 'Please check your form details.');
});
test('honeypot refuses before provider', async () => {
  await refusedBeforeProvider({ body: { ...valid(), website: 'bot.test' } }, 400, 'Please try again.');
});
test('every bounded field rejects nonstring types before provider', async () => {
  for (const key of ['first_name', 'last_name', 'email', 'company', 'interest', 'message'])
    for (const value of [true, 4, {}, []])
      await refusedBeforeProvider({ body: { ...valid(), [key]: value } }, 400, 'Please check your form details.');
});
test('every bounded field rejects one character beyond its trimmed limit', async () => {
  for (const [key, limit] of Object.entries({ first_name: 100, last_name: 100, email: 254, company: 200, interest: 100, message: 5000 }))
    await refusedBeforeProvider({ body: { ...valid(), [key]: 'x'.repeat(limit + 1) } }, 400, 'Please shorten your form details.');
});
test('required names and email syntax refuse before provider', async () => {
  for (const change of [{ first_name: '' }, { last_name: '  ' }, { email: '' }, { email: 'x@y' }, { email: 'a b@c.test' }])
    await refusedBeforeProvider({ body: { ...valid(), ...change } }, 400, 'Please provide your name and a valid email address.');
});
test('missing provider configuration refuses before fetch, timeout or credentials use', async () => {
  for (const key of Object.keys(config)) {
    const env = { ...config }; delete env[key];
    await refusedBeforeProvider({}, 503, 'Your request was not sent. Please email mike@practiceperfect.us directly.', { env });
  }
});
test('accepted provider preserves normalized payload, destination, auth and timeout', async () => {
  const h = harness(), r = await h.invoke();
  assert.equal(r.status, 200); assert.deepEqual(r.body, { ok: true, requestId: 'opaque-provider-id' });
  assert.equal(h.calls.length, 1); assert.equal(h.signals.length, 1); assert.deepEqual(h.logs, []);
  const o = h.calls[0].options;
  assert.equal(o.method, 'POST'); assert.equal(o.signal, h.signals[0]); assert.equal(o.signal.timeoutMs, 10000);
  assert.equal(o.headers.Authorization, 'Bearer synthetic-key'); assert.equal(o.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(o.body), { from: 'Practice Perfect <sender@example.test>', to: ['recipient@example.test'], reply_to: 'ada@example.test', subject: 'Practice Perfect — Strategy Call Request', text: 'New Practice Perfect strategy-call request\n\nName: Ada Lovelace\nEmail: ada@example.test\nCompany: Example\nInterest: Intake\n\nOpportunity:\nImprove intake' });
  const normalized = { first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.test', company: 'Example', interest: 'Intake', message: 'Improve intake' };
  const expected = 'contact-' + createHash('sha256').update(JSON.stringify(normalized) + 2).digest('hex');
  assert.equal(o.headers['Idempotency-Key'], expected);
});
test('JSON-string body, exact field limits and optional omissions retain acceptance', async () => {
  const body = { first_name: 'x'.repeat(100), last_name: 'x'.repeat(100), email: 'a'.repeat(247) + '@b.test', company: 'x'.repeat(200), interest: 'x'.repeat(100), message: 'x'.repeat(5000) };
  assert.equal(body.email.length, 254);
  assert.equal((await harness().invoke({ body: JSON.stringify(body) })).status, 200);
  const h = harness(); assert.equal((await h.invoke({ body: { first_name: 'A', last_name: 'B', email: 'a@b.test', company: null } })).status, 200);
  assert.match(JSON.parse(h.calls[0].options.body).text, /Company: \(not provided\)\nInterest: \(not provided\)\n\nOpportunity:\n\(not provided\)$/);
});
test('normalized retries share ten-minute key and next window or payload changes it', async () => {
  const a = harness({ now: 1200001 }), b = harness({ now: 1799999 }), c = harness({ now: 1800000 }), d = harness({ now: 1200001 });
  await a.invoke(); await b.invoke({ body: { ...valid(), first_name: 'Ada' } }); await c.invoke(); await d.invoke({ body: { ...valid(), message: 'Different' } });
  const key = h => h.calls[0].options.headers['Idempotency-Key'];
  assert.equal(key(a), key(b)); assert.notEqual(key(a), key(c)); assert.notEqual(key(a), key(d));
});
test('nonempty opaque string ID is preserved without invented UUID restrictions', async () => {
  for (const id of ['opaque', '123', 'provider/id:1', ' id-with-spaces ']) {
    const r = await harness({ provider: async () => ({ ok: true, status: 200, json: async () => ({ id }) }) }).invoke();
    assert.equal(r.status, 200); assert.deepEqual(r.body, { ok: true, requestId: id });
  }
});
test('truthy wrong-type and whitespace IDs cannot falsely confirm provider acceptance', async () => {
  for (const id of [true, 1, -1, {}, [], ['id'], ' ', '\t\r\n']) {
    const h = harness({ provider: async () => ({ ok: true, status: 200, json: async () => ({ id }) }) });
    const r = await h.invoke(); assert.equal(r.status, 502, `ID ${JSON.stringify(id)} must fail closed`);
    assert.deepEqual(r.body, { error: fallback }); assert.equal(h.calls.length, 1);
  }
});
test('missing, empty and falsy IDs fail with fixed private-error fallback', async () => {
  for (const result of [{}, { id: '' }, { id: null }, { id: false }, { id: 0 }]) {
    const r = await harness({ provider: async () => ({ ok: true, status: 200, json: async () => result }) }).invoke();
    assert.equal(r.status, 502); assert.deepEqual(r.body, { error: fallback });
  }
});
test('provider null, primitive and array JSON cannot establish acceptance', async () => {
  for (const result of [null, true, 1, 'id', []]) {
    const r = await harness({ provider: async () => ({ ok: true, status: 200, json: async () => result }) }).invoke();
    assert.equal(r.status, 502); assert.deepEqual(r.body, { error: fallback });
  }
});
test('provider HTTP rejection cannot confirm even if ID is valid', async () => {
  for (const status of [400, 401, 403, 429, 500]) {
    const h = harness({ provider: async () => ({ ok: false, status, json: async () => ({ id: 'opaque', name: 'private-provider-detail' }) }) });
    const r = await h.invoke(); assert.equal(r.status, 502); assert.deepEqual(r.body, { error: fallback });
    assert.doesNotMatch(JSON.stringify(r), /synthetic-key|private-provider-detail|recipient@example.test|ada@example.test/);
  }
});
test('network, abort and unreadable JSON failures stay private and never resend', async () => {
  for (const provider of [async () => { throw new TypeError('secret-key private@example.test'); }, async () => { const e = Error('private abort'); e.name = 'TimeoutError'; throw e; }, async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('private JSON body'); } })]) {
    const h = harness({ provider }), r = await h.invoke();
    assert.equal(r.status, 502); assert.deepEqual(r.body, { error: fallback }); assert.equal(h.calls.length, 1);
    assert.doesNotMatch(JSON.stringify(r), /secret-key|private@example.test|private abort|private JSON/);
  }
});
