const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup(hostname = 'practiceperfect.us') {
  const listeners = {};
  const events = [];
  const scripts = [];
  const window = { location: { hostname, origin: `https://${hostname}`, pathname: '/services' } };
  const document = {
    addEventListener: (name, fn) => { listeners[name] = fn; },
    createElement: () => ({}),
    head: { appendChild: script => scripts.push(script) }
  };
  vm.runInNewContext(fs.readFileSync('analytics.js', 'utf8'), { window, document, URL, Set });
  const redact = window.vaq?.[0][1];
  window.va = (type, payload) => { events.push({ type, payload }); };
  const click = (href, region) => listeners.click({ target: { closest: () => ({
    href, closest: selector => selector === region ? {} : null
  }) } });
  return { window, listeners, events, scripts, redact, click };
}

const tracking = setup();
assert.equal(tracking.scripts.length, 1);
assert.equal(tracking.scripts[0].src, '/_vercel/insights/script.js');
assert.equal(tracking.redact({ url: 'https://practiceperfect.us/contact?email=private#contact-form' }).url,
  'https://practiceperfect.us/contact');
tracking.click('https://practiceperfect.us/services/seo-marketing?private=value#anything');
assert.equal(tracking.events[0].payload.name, 'service_clicked');
assert.equal(JSON.stringify(tracking.events[0].payload.data), '{"service":"seo-marketing"}');
tracking.click('https://practiceperfect.us/contact#contact-form', 'header');
assert.equal(tracking.events[1].payload.name, 'strategy_call_clicked');
assert.equal(JSON.stringify(tracking.events[1].payload.data), '{"location":"header"}');
tracking.click('https://other.example/contact');
tracking.click('https://practiceperfect.us/services/private-input');
assert.equal(tracking.events.length, 2);
tracking.window.va = () => { throw Error('Analytics unavailable'); };
assert.doesNotThrow(() => tracking.click('https://practiceperfect.us/contact'));
const preview = setup('preview.vercel.app');
assert.equal(preview.scripts.length, 0);
assert.equal(preview.listeners.click, undefined);

async function verifySubmission() {
  let submit;
  const events = [];
  const button = { disabled: false, textContent: '' };
  const status = { hidden: true, textContent: '' };
  let resets = 0;
  const form = { querySelector: () => button, reset: () => { resets++; },
    addEventListener: (_, fn) => { submit = fn; } };
  let response = { ok: true, result: { ok: true, requestId: 'accepted-request' } };
  const document = { getElementById: id => id === 'strategy-call-form' ? form : status };
  class FormData { constructor() { return [['email', 'private@example.com'], ['message', 'private message']]; } }
  const window = { va: (type, payload) => events.push({ type, payload }) };
  vm.runInNewContext(fs.readFileSync('contact-form.js', 'utf8'), {
    document, window, FormData, Set,
    fetch: async () => ({ ok: response.ok, json: async () => response.result })
  });
  const event = { preventDefault() {} };
  await submit(event);
  assert.equal(events.length, 1);
  assert.equal(JSON.stringify(events[0].payload), '{"name":"strategy_call_sent"}');
  assert.equal(resets, 1);
  await submit(event);
  assert.equal(events.length, 1, 'Repeated provider IDs must not count twice');
  response = { ok: false, result: { error: 'Request rejected' } };
  await submit(event);
  assert.equal(events.length, 1, 'Failed submissions must not count');
  assert.equal(status.textContent, 'Request rejected');
  assert.equal(button.disabled, false);
  response = { ok: true, result: { ok: true, requestId: 'second-request' } };
  window.va = () => { throw Error('Analytics unavailable'); };
  await submit(event);
  assert.match(status.textContent, /^Thank you/);
  assert.equal(button.disabled, false);
}
verifySubmission().then(() => console.log('Tracking checks passed: approved values only, preview exclusion, successful submission deduplication, rejected submissions, analytics failure isolation.'));
