/* Pure PP-WEB-30 integration. Browser lifetime remains with the existing runner. */
'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { ASSET_BASELINE_REVISION, MANIFEST, SCENARIOS, gitBlobSha,
  readFrozenSources, runContactRecovery } = require('./contact-browser-recovery.cjs');

const FIXTURE_PATH = 'tests/contact-browser-recovery.cjs';
const SCOPE = 'Native form/DOM with simulated fetch/body; not live API, provider, fonts or visual acceptance';

function validateRecoveryEvidence(evidence) {
  assert.equal(evidence?.assetBaselineRevision, ASSET_BASELINE_REVISION, 'Frozen asset baseline required');
  assert.equal(evidence.scope, SCOPE, 'Explicit simulated-transport scope required');
  assert.ok(Array.isArray(evidence.results), 'Scenario evidence required');
  assert.deepEqual(evidence.results.map(row => row?.scenario), SCENARIOS,
    'All ten scenarios must execute exactly once, in the fixture order');
  for (const row of evidence.results) {
    assert.equal(row.passed, true, `${row.scenario}: explicit pass required`);
    assert.ok(!Object.hasOwn(row, 'skipped') && !Object.hasOwn(row, 'error'),
      `${row.scenario}: skipped/error evidence rejected`);
    assert.equal(row.routing?.unexpected, 0, `${row.scenario}: unexpected request`);
    assert.ok(Number.isSafeInteger(row.routing?.fulfilled) && row.routing.fulfilled >= MANIFEST.length);
    assert.ok(Number.isSafeInteger(row.routing?.aborted) && row.routing.aborted >= 0);
    assert.deepEqual(Object.keys(row.routing?.assets || {}).sort(), MANIFEST.map(item => item.route).sort());
    for (const item of MANIFEST)
      assert.ok(Number.isSafeInteger(row.routing.assets[item.route]) && row.routing.assets[item.route] >= 1,
        `${row.scenario}: missing frozen asset ${item.route}`);
    assert.equal(Object.values(row.routing.assets).reduce((sum, count) => sum + count, 0),
      row.routing.fulfilled, `${row.scenario}: fulfilled asset count mismatch`);
  }
  return evidence;
}

async function runPublicationContactRecovery(browser, checkout, sourceCommit) {
  assert.match(sourceCommit || '', /^[a-f0-9]{40}$/, 'Exact checkout SOURCE_COMMIT required');
  const loadedFixture = fs.realpathSync(require.resolve('./contact-browser-recovery.cjs'));
  assert.equal(fs.realpathSync(path.join(checkout, FIXTURE_PATH)), loadedFixture,
    'Checkout fixture must match the actually loaded module path');
  // Freeze and validate source before the supplied Browser can be used.
  const sources = readFrozenSources(checkout);
  const fixtureBytes = fs.readFileSync(loadedFixture);
  const evidence = validateRecoveryEvidence(await runContactRecovery(browser, sources));
  return { ...evidence, passed: true, sourceCommit, fixturePath: FIXTURE_PATH,
    fixtureBlobSha: gitBlobSha(fixtureBytes),
    fixtureSha256: crypto.createHash('sha256').update(fixtureBytes).digest('hex'),
    executedScenarioCount: evidence.results.length };
}

module.exports = { FIXTURE_PATH, SCOPE, validateRecoveryEvidence, runPublicationContactRecovery };
