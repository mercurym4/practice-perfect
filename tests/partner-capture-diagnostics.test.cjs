'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { collectPartnerCaptureSamples } = require('./partner-capture-diagnostics.cjs');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const original = Buffer.from('original screenshot bytes');
const originalSha256 = hash(original);

test('wrong target produces no additional screenshot or metadata call', async () => {
  for (const selector of ['.partner-panel img', 'body', '.hero-grid', undefined]) {
    const result = await collectPartnerCaptureSamples({ selector, originalSha256, capture() { throw Error('must not capture'); }, describe() { throw Error('must not evaluate'); } });
    assert.equal(result, null);
  }
});
test('exactly two sequential diagnostic samples keep the immutable original hash', async () => {
  const events = [], copy = Buffer.from(original);
  let next = 0, active = 0;
  const result = await collectPartnerCaptureSamples({ selector: '.partner-panel', originalSha256,
    async describe() { events.push('describe'); return { rect: { x: 1, y: 1.25 }, image: { complete: true, currentSrc: '/pinned.webp' } }; },
    async capture(options) {
      assert.equal(active++, 0, 'No concurrent capture');
      assert.deepEqual(options, { animations: 'disabled', timeout: 1000 });
      events.push('capture'); await Promise.resolve(); active--;
      return ++next === 1 ? Buffer.from('different') : Buffer.from(original);
    }
  });
  assert.equal(next, 2); assert.equal(result.evidence.originalSha256, originalSha256);
  assert.deepEqual(original, copy);
  assert.deepEqual(events, ['describe', 'capture', 'describe', 'describe', 'capture', 'describe']);
  assert.equal(result.evidence.samples[0].matchesOriginal, false);
  assert.equal(result.evidence.samples[1].matchesOriginal, true);
  assert.equal(result.evidence.samples.length, 2); assert.equal(result.images.length, 2);
  // A later matching sample is just data: the supplied original hash remains unchanged.
  assert.equal(result.evidence.originalSha256, hash(original));
});
test('first diagnostic timeout is recorded unavailable without a retry or acceptance substitute', async () => {
  let calls = 0;
  const result = await collectPartnerCaptureSamples({ selector: '.partner-panel', originalSha256,
    describe: async () => ({}), capture: async () => { calls++; throw new Error('Timeout 1000ms exceeded'); } });
  assert.equal(calls, 1); assert.equal(result.images.length, 0); assert.equal(result.evidence.originalSha256, originalSha256);
  assert.deepEqual(result.evidence.samples, [{ index: 1, available: false, error: 'Timeout 1000ms exceeded' }]);
});
test('second diagnostic failure retains first sample and never schedules a third', async () => {
  let calls = 0;
  const result = await collectPartnerCaptureSamples({ selector: '.partner-panel', originalSha256,
    describe: async () => ({}), capture: async () => { if (++calls === 2) throw Error('page closed'); return Buffer.from('first'); } });
  assert.equal(calls, 2); assert.equal(result.images.length, 1); assert.equal(result.evidence.samples[1].available, false);
  assert.equal(result.evidence.originalSha256, originalSha256);
});
test('stop before execution performs no capture or metadata side effects', async () => {
  const result = await collectPartnerCaptureSamples({ selector: '.partner-panel', originalSha256, shouldStop: () => true,
    describe() { throw Error('unexpected'); }, capture() { throw Error('unexpected'); } });
  assert.equal(result.evidence.stopped, true); assert.deepEqual(result.evidence.samples, []);
});
test('stop during metadata prevents the next capture', async () => {
  let stopped = false, captured = 0;
  const result = await collectPartnerCaptureSamples({ selector: '.partner-panel', originalSha256, shouldStop: () => stopped,
    async describe() { stopped = true; return {}; }, async capture() { captured++; return original; } });
  assert.equal(captured, 0); assert.equal(result.evidence.stopped, true);
});
test('stop during capture prevents following metadata and further screenshot work', async () => {
  let stopped = false, descriptions = 0, captures = 0;
  const result = await collectPartnerCaptureSamples({ selector: '.partner-panel', originalSha256, shouldStop: () => stopped,
    async describe() { descriptions++; return {}; }, async capture() { captures++; stopped = true; return original; } });
  assert.equal(captures, 1); assert.equal(descriptions, 1); assert.equal(result.evidence.stopped, true);
  assert.equal(result.images.length, 0);
});
test('metadata failure is evidence unavailable and cannot swallow the caller original comparison', async () => {
  let captures = 0;
  const result = await collectPartnerCaptureSamples({ selector: '.partner-panel', originalSha256,
    describe: async () => { throw Error('metadata unavailable'); }, capture: async () => { captures++; return original; } });
  assert.equal(captures, 0); assert.equal(result.evidence.samples[0].available, false);
  const originalAfter = hash(Buffer.from('original mismatch'));
  assert.throws(() => assert.equal(originalAfter, result.evidence.originalSha256), /AssertionError/);
});
test('actual snapshot preserves first mismatch even when all later diagnostic shots match', async () => {
  const source = fs.readFileSync(path.join(__dirname, 'browser-publication-gates.cjs'), 'utf8');
  const body = source.slice(source.indexOf('async function snapshot('), source.indexOf('async function main()'));
  const snapshot = vm.runInNewContext(`(${body.trim()})`, {
    assert, crypto: require('node:crypto'), prepareCapture: async () => {},
    captureDiagnostics: () => {}, collectPartnerCaptureSamples
  });
  const page = first => {
    let calls = 0;
    const element = { count: async () => 1, scrollIntoViewIfNeeded: async () => {},
      evaluate: async () => ({ styles: {}, rect: { x: 1, y: 1.25 } }),
      screenshot: async () => ++calls === 1 ? Buffer.from(first) : Buffer.from('later matching diagnostic') };
    return { setViewportSize: async () => {}, goto: async () => {}, locator: () => element,
      evaluate: async () => ({ nodes: 1, image: { complete: true } }) };
  };
  const target = { file: 'services.html', selector: '.partner-panel' };
  const before = await snapshot(page('before first'), 'http://synthetic.test', target, 980, true);
  const after = await snapshot(page('after first'), 'http://synthetic.test', target, 980);
  assert.equal(before.image.toString(), 'before first'); assert.equal(after.image.toString(), 'after first');
  assert.equal(before.repeatCaptures.evidence.samples[0].sha256, after.repeatCaptures.evidence.samples[0].sha256);
  assert.throws(() => assert.equal(after.sha256, before.sha256), /AssertionError/);
});
test('diagnostic rejections with null, undefined or primitive values remain unavailable evidence', async () => {
  for (const thrown of [null, undefined, 'synthetic rejection', 0, false]) {
    let captures = 0;
    const result = await collectPartnerCaptureSamples({ selector: '.partner-panel', originalSha256,
      describe: async () => ({}), capture: async () => { captures++; throw thrown; } });
    assert.equal(captures, 1); assert.equal(result.evidence.originalSha256, originalSha256);
    assert.deepEqual(result.evidence.samples, [{ index: 1, available: false, error: String(thrown) }]);
    assert.deepEqual(result.images, []);
  }
});
test('actual snapshot still returns its first image when a diagnostic screenshot rejects null', async () => {
  const source = fs.readFileSync(path.join(__dirname, 'browser-publication-gates.cjs'), 'utf8');
  const body = source.slice(source.indexOf('async function snapshot('), source.indexOf('async function main()'));
  const snapshot = vm.runInNewContext(`(${body.trim()})`, {
    assert, crypto: require('node:crypto'), prepareCapture: async () => {},
    captureDiagnostics: () => {}, collectPartnerCaptureSamples
  });
  let captures = 0;
  const element = { count: async () => 1, scrollIntoViewIfNeeded: async () => {},
    evaluate: async () => ({ styles: {}, rect: { x: 1 } }),
    screenshot: async () => { if (++captures === 1) return Buffer.from(original); throw null; } };
  const page = { setViewportSize: async () => {}, goto: async () => {}, locator: () => element,
    evaluate: async () => ({ nodes: 1 }) };
  const result = await snapshot(page, 'http://synthetic.test', { file: 'services.html', selector: '.partner-panel' }, 980);
  assert.equal(captures, 2); assert.equal(result.sha256, originalSha256); assert.deepEqual(result.image, original);
  assert.equal(result.repeatCaptures.evidence.samples[0].error, 'null');
  assert.throws(() => assert.equal(hash(Buffer.from('different first screenshot')), result.sha256), /AssertionError/);
});
