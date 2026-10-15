'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { ASSET_BASELINE_REVISION, MANIFEST, SCENARIOS } = require('./contact-browser-recovery.cjs');
const { SCOPE, validateRecoveryEvidence, runPublicationContactRecovery } = require('./contact-browser-publication.cjs');
const root = path.resolve(__dirname, '..');
const revision = '790ec6704bfeaa95fa1a993cd57b7dc270af2e9d';
function completeEvidence() {
  return { assetBaselineRevision: ASSET_BASELINE_REVISION, scope: SCOPE,
    results: SCENARIOS.map(scenario => ({ scenario, passed: true,
      routing: { fulfilled: MANIFEST.length, aborted: 2, unexpected: 0,
        assets: Object.fromEntries(MANIFEST.map(item => [item.route, 1])) } })) };
}
test('complete ten-scenario evidence retains observations and simulated scope', () => {
  const evidence = completeEvidence();
  assert.equal(validateRecoveryEvidence(evidence), evidence);
  assert.equal(evidence.results.length, 10);
});
test('missing, duplicate, unknown, reordered and extra scenarios fail admission', () => {
  for (const change of [rows => rows.pop(), rows => { rows[9] = rows[0]; },
    rows => { rows[9].scenario = 'unknown'; }, rows => rows.reverse(),
    rows => rows.push(structuredClone(rows[0]))]) {
    const evidence = completeEvidence(); change(evidence.results);
    assert.throws(() => validateRecoveryEvidence(evidence), /All ten scenarios/);
  }
});
test('false, missing, nonboolean passes, skipped and error cases fail admission', () => {
  for (const row of [{ passed: false }, { passed: undefined }, { passed: 'true' },
    { passed: true, skipped: true }, { passed: true, skipped: false },
    { passed: true, error: 'synthetic failure' }]) {
    const evidence = completeEvidence(); Object.assign(evidence.results[4], row);
    assert.throws(() => validateRecoveryEvidence(evidence));
  }
});
test('wrong or missing scope, baseline and result list cannot qualify recovery', () => {
  for (const delta of [{ scope: undefined }, { scope: 'live delivery passed' },
    { assetBaselineRevision: revision }, { results: null }, { results: {} }])
    assert.throws(() => validateRecoveryEvidence({ ...completeEvidence(), ...delta }));
});
test('unobserved assets and unexpected transport cannot qualify a case', () => {
  for (const edit of [r => { r.unexpected = 1; }, r => { delete r.unexpected; },
    r => { delete r.assets[MANIFEST[0].route]; }, r => { r.assets[MANIFEST[0].route] = 0; },
    r => { r.assets['/extra.js'] = 1; }, r => { r.fulfilled = 0; },
    r => { r.aborted = -1; }, r => { r.aborted = 0.5; }, r => { r.fulfilled++; }]) {
    const evidence = completeEvidence(); edit(evidence.results[2].routing);
    assert.throws(() => validateRecoveryEvidence(evidence));
  }
});
test('missing or malformed checkout revision refuses before any Browser call', async () => {
  let called = false;
  const browser = { async newContext() { called = true; throw Error('Should not execute'); } };
  for (const commit of [undefined, '', 'main', '790ec670', 'A'.repeat(40), '0'.repeat(41)])
    await assert.rejects(runPublicationContactRecovery(browser, root, commit), /SOURCE_COMMIT/);
  assert.equal(called, false);
});
test('production integration invokes actual fixture using supplied Browser only', async () => {
  let calls = 0;
  const browser = { async newContext(options) {
    calls++;
    assert.deepEqual(options, { offline: true, serviceWorkers: 'block', acceptDownloads: false,
      viewport: { width: 390, height: 844 } });
    throw Error('Synthetic adapter boundary; no browser launch');
  }, async close() { assert.fail('Caller owns Browser close'); } };
  await assert.rejects(runPublicationContactRecovery(browser, root, revision), /Synthetic adapter boundary/);
  assert.equal(calls, 1);
});

test('alternate checkout cannot label imported fixture execution with a different file hash', async () => {
  const alternate = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-contact-provenance-'));
  let called = false;
  try {
    fs.mkdirSync(path.join(alternate, 'tests'));
    // Even identical bytes at a different real path are not the loaded module.
    fs.copyFileSync(require.resolve('./contact-browser-recovery.cjs'),
      path.join(alternate, 'tests/contact-browser-recovery.cjs'));
    await assert.rejects(runPublicationContactRecovery({ async newContext() { called = true; } },
      alternate, revision), /actually loaded module path/);
    assert.equal(called, false);
  } finally { fs.rmSync(alternate, { recursive: true, force: true }); }
});

test('symlink to an alternate fixture real path refuses before Browser access', async () => {
  const alternate = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-contact-symlink-'));
  let called = false;
  try {
    fs.mkdirSync(path.join(alternate, 'tests'));
    const target = path.join(alternate, 'other-fixture.cjs');
    fs.copyFileSync(require.resolve('./contact-browser-recovery.cjs'), target);
    fs.symlinkSync(target, path.join(alternate, 'tests/contact-browser-recovery.cjs'));
    await assert.rejects(runPublicationContactRecovery({ async newContext() { called = true; } },
      alternate, revision), /actually loaded module path/);
    assert.equal(called, false);
  } finally { fs.rmSync(alternate, { recursive: true, force: true }); }
});
