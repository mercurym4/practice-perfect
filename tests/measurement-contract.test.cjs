// Run from the repository root. The two unchanged production scripts share one
// VM window/document; no browser, collector, API, provider or network is used.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');

const analyticsSource = fs.readFileSync('analytics.js', 'utf8');
const contactSource = fs.readFileSync('contact-form.js', 'utf8');
const services = [
  'practice-growth-audit', 'revenue-growth-sprint',
  'fractional-sales-leadership', 'law-firm-intake-consulting',
  'website-design', 'website-audit-overhaul', 'seo-marketing',
  'ppc-marketing', 'debt-defense-direct-mail', 'pi-mva-lead-generation'
];
const secrets = ['person+pp48@example.invalid', 'PP48_PRIVATE_MESSAGE',
  'PP48_PRIVATE_COMPANY', 'PP48_PRIVATE_QUERY', 'PP48_PRIVATE_FRAGMENT',
  'PP48_PROVIDER_REQUEST_ONE', 'PP48_PROVIDER_REQUEST_TWO'];
const fields = { first_name: 'PP48_PRIVATE_FIRST', last_name: 'PP48_PRIVATE_LAST',
  email: secrets[0], message: secrets[1], company: secrets[2],
  interest: 'PP48_PRIVATE_INTEREST', website: '' };
const fallback = 'Your request could not be confirmed. Please try again or email mike@practiceperfect.us directly.';
const accepted = requestId => ({ ok: true, result: { ok: true, requestId } });
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const flush = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };

function harness({ hostname = 'practiceperfect.us', preexistingAnalytics = false,
  pathname = '/services', transport } = {}) {
  const listeners = {}, scripts = [], directCalls = [], requests = [], timers = new Map();
  let response = accepted(secrets[5]), resets = 0, nextTimer = 0;
  const values = { ...fields };
  const button = { disabled: false, textContent: 'Request a Strategy Call →' };
  const status = { hidden: true, textContent: '' };
  const form = {
    querySelector(selector) { assert.equal(selector, 'button[type="submit"]'); return button; },
    addEventListener(name, fn) { assert.equal(name, 'submit'); listeners.submit = fn; },
    reset() { resets++; for (const key of Object.keys(values)) values[key] = ''; }
  };
  const window = { location: { hostname, origin: `https://${hostname}`, pathname } };
  if (preexistingAnalytics) window.va = (...args) => directCalls.push(args);
  const document = {
    addEventListener(name, fn) { assert.equal(name, 'click'); listeners.click = fn; },
    createElement(tag) { assert.equal(tag, 'script'); return {}; },
    head: { appendChild(script) { scripts.push(script); } },
    getElementById(id) { assert.ok(['strategy-call-form', 'contact-status'].includes(id)); return id === 'strategy-call-form' ? form : status; }
  };
  class FormData { constructor() { return Object.entries(values); } }
  const context = vm.createContext({ window, document, URL, Set, FormData, AbortController,
    setTimeout(fn, delay) { assert.equal(delay, 15000); const id = ++nextTimer; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); },
    fetch: async (url, options) => {
      assert.equal(url, '/api/contact', 'Only the actual form endpoint may reach the mock');
      requests.push({ url, options });
      if (transport) return transport(url, options);
      return { ok: response.ok, json: async () => response.result };
    }
  });
  vm.runInContext(analyticsSource, context, { filename: 'analytics.js' });
  vm.runInContext(contactSource, context, { filename: 'contact-form.js' });
  const calls = () => [...directCalls, ...Array.from(window.vaq || [], args => Array.from(args))];
  return { window, listeners, scripts, requests, timers, values, button, status,
    calls, events: () => calls().filter(args => args[0] === 'event').map(args => JSON.parse(JSON.stringify(args[1]))),
    redact: () => calls().find(args => args[0] === 'beforeSend')?.[1],
    get resets() { return resets; },
    setResponse(next) { response = next; },
    submit: () => listeners.submit({ preventDefault() {} }),
    click(href, region = 'content') {
      listeners.click?.({ target: { closest(selector) {
        assert.equal(selector, 'a[href]');
        return { href, closest: ancestor => ancestor === region ? {} : null };
      } } });
    },
    async expire() { for (const [id, fn] of [...timers]) { timers.delete(id); fn(); } await flush(); }
  };
}

function recovered(h) {
  assert.equal(h.button.disabled, false);
  assert.equal(h.button.textContent, 'Request a Strategy Call →');
  assert.equal(h.timers.size, 0, 'Settled submissions leave no active timer');
}
function confirmed(h) { recovered(h); assert.match(h.status.textContent, /^Thank you\./); }
function unconfirmed(h) {
  recovered(h); assert.equal(h.status.textContent, fallback);
  assert.equal(h.resets, 0); assert.deepEqual(h.values, fields); assert.deepEqual(h.events(), []);
}
function safe(events) {
  for (const event of events) {
    if (event.name === 'service_clicked') {
      assert.deepEqual(Object.keys(event).sort(), ['data', 'name']);
      assert.deepEqual(Object.keys(event.data), ['service']); assert.ok(services.includes(event.data.service));
    } else if (event.name === 'strategy_call_clicked') {
      assert.deepEqual(Object.keys(event).sort(), ['data', 'name']);
      assert.deepEqual(Object.keys(event.data), ['location']); assert.ok(['header', 'footer', 'content'].includes(event.data.location));
    } else assert.deepEqual(event, { name: 'strategy_call_sent' });
  }
  const serialized = JSON.stringify(events);
  for (const secret of [...secrets, ...Object.values(fields).filter(Boolean)]) assert.equal(serialized.includes(secret), false, `No synthetic private value: ${secret}`);
  assert.equal(serialized.includes('?'), false); assert.equal(serialized.includes('#'), false);
}

test('canonical host queues the redactor and one deferred relative collector script', () => {
  const h = harness();
  assert.equal(h.calls().length, 1); assert.equal(typeof h.redact(), 'function');
  assert.equal(h.scripts.length, 1); assert.equal(h.scripts[0].defer, true);
  assert.equal(h.scripts[0].src, '/_vercel/insights/script.js');
  assert.equal(h.requests.length, 0, 'Appending the mocked element does not load a collector');
});

test('all ten exact services emit only the fixed service slug', () => {
  const h = harness();
  for (const service of services) h.click(`${h.window.location.origin}/services/${service}?${secrets[3]}#${secrets[4]}`);
  assert.deepEqual(h.events(), services.map(service => ({ name: 'service_clicked', data: { service } })));
  safe(h.events());
});

test('contact CTAs emit only header, footer or content across supported contact paths', () => {
  const h = harness();
  for (const [path, region] of [['/contact', 'header'], ['/contact.html', 'footer'], ['/services#contact-form', 'content']]) h.click(path, region);
  assert.deepEqual(h.events(), ['header', 'footer', 'content'].map(location => ({ name: 'strategy_call_clicked', data: { location } })));
  safe(h.events());
});

test('external, unknown, near-match and unrelated links emit nothing', () => {
  const h = harness();
  for (const href of ['https://other.invalid/contact', 'https://www.practiceperfect.us/contact',
    'http://practiceperfect.us/contact', 'mailto:person@example.invalid', '/services/unknown',
    '/services/seo-marketing/', '/services/SEO-marketing', '/service/seo-marketing',
    '/contact/other', '/other#contact-form', '/services#other', '/about']) h.click(href);
  assert.deepEqual(h.events(), []);
  h.listeners.click({ target: {} });
  h.listeners.click({ target: { closest: () => null } });
  assert.deepEqual(h.events(), []);
});

test('beforeSend removes query and fragment from absolute and relative URLs', () => {
  const h = harness();
  for (const path of ['/contact', '/services/seo-marketing']) {
    for (const prefix of ['', h.window.location.origin]) {
      const output = h.redact()({ url: `${prefix}${path}?email=${secrets[0]}&secret=${secrets[3]}#${secrets[4]}` });
      assert.equal(output.url, `${h.window.location.origin}${path}`);
      for (const secret of secrets) assert.equal(JSON.stringify(output).includes(secret), false);
    }
  }
  const withoutUrl = { type: 'pageview' }; assert.equal(h.redact()(withoutUrl), withoutUrl);
});

test('noncanonical and preview hosts initialize neither click tracking nor collector', async () => {
  for (const hostname of ['preview.vercel.app', 'www.practiceperfect.us', 'localhost', 'practiceperfect.us.example.invalid']) {
    const h = harness({ hostname });
    assert.equal(h.listeners.click, undefined); assert.equal(h.window.va, undefined);
    assert.deepEqual(h.scripts, []); assert.deepEqual(h.calls(), []);
    await h.submit(); confirmed(h); assert.equal(h.resets, 1); assert.deepEqual(h.events(), []);
  }
});

test('pre-existing collector is retained on canonical host with the same event vocabulary', async () => {
  const h = harness({ preexistingAnalytics: true });
  assert.equal(typeof h.redact(), 'function');
  h.click('/contact'); await h.submit(); confirmed(h);
  assert.deepEqual(h.events(), [{ name: 'strategy_call_clicked', data: { location: 'content' } }, { name: 'strategy_call_sent' }]); safe(h.events());
});

test('host guard does not promise suppression of independently pre-existing preview analytics', async () => {
  const h = harness({ hostname: 'preview.vercel.app', preexistingAnalytics: true });
  assert.equal(h.listeners.click, undefined); assert.deepEqual(h.scripts, []); assert.equal(h.redact(), undefined);
  await h.submit(); confirmed(h);
  assert.deepEqual(h.events(), [{ name: 'strategy_call_sent' }]); safe(h.events());
});

test('combined source click-to-confirmation emits exactly three privacy-safe event types', async () => {
  const h = harness();
  h.click(`/services/seo-marketing?${secrets[3]}#${secrets[4]}`); h.click('/contact', 'header');
  await h.submit(); confirmed(h);
  assert.deepEqual(h.events(), [{ name: 'service_clicked', data: { service: 'seo-marketing' } },
    { name: 'strategy_call_clicked', data: { location: 'header' } }, { name: 'strategy_call_sent' }]);
  assert.deepEqual(JSON.parse(h.requests[0].options.body), fields, 'Form data goes only to the mocked contact endpoint, not the event');
  assert.equal(h.resets, 1); safe(h.events());
});

test('same provider ID deduplicates per page, distinct IDs count, new page resets scope', async () => {
  const h = harness();
  await h.submit(); await h.submit(); h.setResponse(accepted(secrets[6])); await h.submit();
  confirmed(h); assert.equal(h.resets, 3); assert.equal(h.requests.length, 3);
  assert.deepEqual(h.events(), [{ name: 'strategy_call_sent' }, { name: 'strategy_call_sent' }]); safe(h.events());
  const nextPage = harness(); await nextPage.submit(); assert.equal(nextPage.events().length, 1);
});

test('strict confirmed success without request ID resets but emits no sent event', async () => {
  const h = harness(); h.setResponse({ ok: true, result: { ok: true } });
  await h.submit(); confirmed(h); assert.equal(h.resets, 1); assert.deepEqual(h.events(), []);
});

test('provider/API rejections cannot emit sent or reset even if JSON claims success', async () => {
  for (const result of [{ ok: true, requestId: secrets[5] }, { error: `Provider rejected ${secrets[0]}` }]) {
    const h = harness(); h.setResponse({ ok: false, result }); await h.submit(); unconfirmed(h);
  }
});

test('malformed confirmation bodies never emit sent or reset', async () => {
  for (const result of [null, [], {}, true, 'true', { ok: 'true', requestId: secrets[5] },
    { ok: 1, requestId: secrets[5] }, { ok: false, requestId: secrets[5] }]) {
    const h = harness(); h.setResponse({ ok: true, result }); await h.submit(); unconfirmed(h);
  }
});

test('unreadable JSON and transport failures cannot emit sent or reset', async () => {
  for (const transport of [async () => { throw new Error(secrets[0]); },
    async () => ({ ok: true, json: async () => { throw new Error(secrets[1]); } })]) {
    const h = harness({ transport }); await h.submit(); unconfirmed(h);
  }
});

test('missing or throwing analytics cannot change accepted form outcome', async () => {
  for (const mode of ['missing', 'throws']) {
    const h = harness();
    if (mode === 'missing') delete h.window.va; else h.window.va = () => { throw new Error('Synthetic analytics failure'); };
    await h.submit(); confirmed(h); assert.equal(h.resets, 1); assert.deepEqual(h.events(), []);
    assert.doesNotThrow(() => h.click('/contact'));
  }
});

test('in-flight duplicate cannot dispatch or count twice', async () => {
  const pendingResponse = deferred(); const h = harness({ transport: () => pendingResponse.promise });
  const pending = h.submit(); await h.submit();
  assert.equal(h.button.disabled, true); assert.equal(h.requests.length, 1); assert.deepEqual(h.events(), []);
  pendingResponse.resolve({ ok: true, json: async () => ({ ok: true, requestId: secrets[5] }) });
  await pending; confirmed(h); assert.equal(h.resets, 1); assert.equal(h.events().length, 1); safe(h.events());
});

test('late accepted confirmation after controlled deadline cannot emit sent or reset', async () => {
  const pendingResponse = deferred(); const h = harness({ transport: () => pendingResponse.promise });
  const pending = h.submit(); await h.expire(); await pending; unconfirmed(h);
  assert.equal(h.requests[0].options.signal.aborted, true);
  pendingResponse.resolve({ ok: true, json: async () => ({ ok: true, requestId: secrets[5] }) });
  await flush(); unconfirmed(h); assert.equal(h.requests.length, 1, 'No automatic retry');
});
