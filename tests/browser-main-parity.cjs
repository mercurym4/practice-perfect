'use strict';
// Hosted CI entrypoint only. Pure imports/tests must not call main().
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const policy = require('./main-parity-policy.cjs');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function admitCandidate(raw, commit, decoder) {
  return decoder(raw, policy.sourceCommit(commit));
}

function acquireSnapshot(kind, commit, deadline, onChild = () => {}, spawnProcess = spawn) {
  const args = policy.exporterArguments(kind, commit);
  const timeoutMs = deadline.remaining(70000);
  return new Promise((resolve, reject) => {
    const child = spawnProcess('python3', args, { cwd: path.resolve(__dirname, '..'), shell: false,
      stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
    onChild(child); const parts = []; let size = 0, errors = 0, refused = false;
    let timer;
    const fail = () => { if (refused) return; refused = true; clearTimeout(timer); child.kill('SIGKILL'); reject(new Error('Snapshot acquisition refused')); };
    timer = setTimeout(fail, timeoutMs);
    child.stdout.on('data', bytes => {
      if (refused) return;
      if (bytes.length > 24 * 1024 * 1024 - size) return fail();
      parts.push(bytes); size += bytes.length;
    });
    child.stderr.on('data', bytes => { errors += bytes.length; if (errors > 65536) fail(); });
    child.on('error', fail);
    child.on('close', code => {
      clearTimeout(timer); onChild(null);
      if (refused) return;
      if (code !== 0 || errors !== 0 || size === 0) return fail();
      resolve(Buffer.concat(parts, size));
    });
  });
}
function evidenceWriter(directory, budget) {
  const names = new Set();
  return (name, bytes, reservation) => {
    assert.match(name, /^(?:\d{2}-(?:390|1440)-(?:main|candidate)\.png|results\.json)$/);
    assert.equal(name.trim(), name);
    assert.ok(Buffer.isBuffer(bytes)); assert.ok(!names.has(name), 'First capture must never be overwritten');
    assert.ok(bytes.length <= reservation.bytes, 'Evidence reservation exceeded before write');
    names.add(name);
    fs.writeFileSync(path.join(directory, name), bytes, { flag: 'wx', mode: 0o600 });
    budget.complete(reservation, bytes.length);
  };
}
async function closeResources({ context, browser, servers }, timeoutMs = 2000) {
  const bounded = async operation => {
    let timer;
    try {
      return await Promise.race([Promise.resolve().then(operation).then(() => true, () => false),
        new Promise(resolve => { timer = setTimeout(() => resolve(false), timeoutMs); })]);
    } finally { clearTimeout(timer); }
  };
  const states = await Promise.all([
    bounded(() => context ? context.close() : undefined),
    bounded(() => browser ? browser.close() : undefined),
    ...servers.map(server => bounded(() => new Promise((resolve, reject) => {
      server.closeAllConnections();
      server.close(error => error && error.code !== 'ERR_SERVER_NOT_RUNNING' ? reject(error) : resolve());
    }))),
  ]);
  return { contextClosed: states[0], browserClosed: states[1], serversClosed: states.slice(2), passed: states.every(Boolean) };
}
async function main() {
  const deadline = new policy.Deadline();
  assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Hosted GitHub Actions entrypoint only');
  assert.equal(process.env.GITHUB_REPOSITORY, 'mercurym4/practice-perfect', 'Existing approved repository only');
  const commit = policy.sourceCommit(process.env.SOURCE_COMMIT);
  assert.ok(process.env.FONT_EVIDENCE_DIR, 'Existing CI font evidence directory required');
  const output = path.join(path.resolve(process.env.FONT_EVIDENCE_DIR), 'literal-main');
  assert.equal(path.isAbsolute(process.env.FONT_EVIDENCE_DIR), true);
  assert.ok(fs.lstatSync(path.dirname(output)).isDirectory(), 'Existing font evidence parent directory required');
  // A fresh create-only directory refuses reruns/symlink destinations rather than replacing evidence.
  fs.mkdirSync(output, { mode: 0o700 });
  const budget = new policy.EvidenceBudget();
  const jsonReservation = budget.reserve(policy.MAX_JSON_BYTES);
  const write = evidenceWriter(output, budget);
  let browser, context, child;
  const servers = [];
  const results = { schema: 1, task: 'PP-WEB-42C', candidateCommitClaim: commit,
    candidateGitIdentityAuthenticated: false, candidateCommitChainVerified: false,
    scope: 'Literal approved main versus authenticated draft public bytes; 27 routes at 390 and 1440 CSS pixels; first full-page captures only',
    limits: 'Hosted Chromium normal Latin font readiness and exact full-page PNG/geometry parity only. Local analytics/contact scripts mocked empty. No provider, deployment, device, Unicode, interaction or publication claim.',
    passed: false, visualAcceptance: false, deploymentVerified: false, cases: [], externalFetches: [],
    blockedExternal: [], requestFailures: [], responseFailures: [], errors: [] };
  let expired = false;
  const stop = () => {
    expired = true; if (child) child.kill('SIGKILL');
    if (context) context.close().catch(() => {});
    if (browser) browser.close().catch(() => {});
    for (const server of servers) { server.closeAllConnections(); server.close(); }
  };
  const timer = setTimeout(stop, deadline.remaining());
  let networkOverflow = false;
  const boundedPush = (list, item) => {
    if (list.length >= 128) { networkOverflow = true; return; }
    list.push(item);
  };
  const briefUrl = value => String(value).slice(0, 512);
  try {
    const { decodeMainSnapshot } = require('./main-snapshot-contract.cjs');
    const { decodeCandidateSnapshot } = require('./candidate-snapshot-contract.cjs');
    const { createSnapshotHandler } = require('./snapshot-request-handler.cjs');
    const baseline = decodeMainSnapshot(await acquireSnapshot('main', commit, deadline, value => { child = value; }));
    const candidate = admitCandidate(await acquireSnapshot('candidate', commit, deadline, value => { child = value; }), commit, decodeCandidateSnapshot);
    results.baseline = { commit: baseline.commit, tree: baseline.tree, mapping: baseline.selectedInventorySha256, fileCount: baseline.fileCount, totalBytes: baseline.totalBytes };
    results.candidate = { commitClaim: candidate.candidateCommitClaim, treeClaim: candidate.candidateTreeClaim,
      mapping: candidate.selectedInventorySha256, publicMappingAuthenticated: candidate.publicMappingAuthenticated,
      commitChainVerified: candidate.commitChainVerified, fileCount: candidate.fileCount, totalBytes: candidate.totalBytes };
    const routes = policy.sitemapRoutes(baseline.read('sitemap.xml'), baseline.paths);
    assert.deepEqual(policy.sitemapRoutes(candidate.read('sitemap.xml'), candidate.paths), routes);
    const origins = [];
    for (const snapshot of [baseline, candidate]) {
      deadline.remaining(); const server = http.createServer(createSnapshotHandler(snapshot)); servers.push(server);
      server.requestTimeout = 5000; server.headersTimeout = 5000; server.keepAliveTimeout = 1000;
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
      origins.push(`http://127.0.0.1:${server.address().port}`);
    }
    // Playwright is loaded only in the hosted entrypoint, never by pure policy tests.
    const { chromium } = require('playwright');
    browser = await chromium.launch({ headless: true, timeout: deadline.remaining(10000) });
    results.browser = browser.version();
    context = await browser.newContext({ reducedMotion: 'reduce', deviceScaleFactor: 1, serviceWorkers: 'block' });
    const cache = new Map(); let fontBytes = 0;
    await context.route('**/*', async route => {
      try {
        deadline.remaining(); const request = route.request(), url = new URL(request.url());
        if (origins.includes(url.origin)) return await route.continue();
        const kind = policy.externalKind({ url: url.href, method: request.method(), type: request.resourceType() });
        if (!kind) { boundedPush(results.blockedExternal, { url: briefUrl(url.href), type: request.resourceType() }); return await route.abort(); }
        let entry = cache.get(url.href);
        if (!entry) {
          assert.ok(cache.size < 32, 'Font URL cache cap exceeded');
          entry = (async () => {
            const response = await route.fetch({ timeout: deadline.remaining(5000), maxRedirects: 0, maxRetries: 0 });
            assert.equal(response.status(), 200, 'Approved font response required');
            const body = await response.body();
            assert.ok(body.length <= 2 * 1024 * 1024 && body.length <= 8 * 1024 * 1024 - fontBytes, 'Font byte cache cap exceeded');
            fontBytes += body.length;
            const headers = { ...response.headers() };
            delete headers['content-encoding']; delete headers['content-length']; delete headers['transfer-encoding'];
            const value = { status: 200, headers, body };
            boundedPush(results.externalFetches, { url: briefUrl(url.href), type: kind, sha256: digest(body), bytes: body.length });
            await response.dispose(); return value;
          })();
          cache.set(url.href, entry);
        }
        return await route.fulfill(await entry);
      } catch {
        boundedPush(results.errors, 'Network admission failed');
        await route.abort().catch(() => {});
      }
    });
    context.on('requestfailed', request => boundedPush(results.requestFailures, { url: briefUrl(request.url()), error: String(request.failure()?.errorText).slice(0, 160) }));
    context.on('response', response => { if (response.status() >= 400) boundedPush(results.responseFailures, { url: briefUrl(response.url()), status: response.status() }); });
    const { waitForCaptureReady } = require('./capture-readiness.cjs');
    for (let index = 0; index < routes.length; index++) for (const width of policy.WIDTHS) {
      const route = routes[index]; const captures = [];
      const record = { route, width, passed: false }; results.cases.push(record);
      for (let side = 0; side < 2; side++) {
        deadline.remaining(); const page = await context.newPage();
        try {
          page.setDefaultTimeout(deadline.remaining(10000));
          await page.setViewportSize({ width, height: 900 });
          const response = await page.goto(origins[side] + route, { waitUntil: 'networkidle', timeout: deadline.remaining(10000) });
          assert.equal(response.status(), 200);
          const checks = await page.evaluate(async ({ serif, timeoutMs }) => {
            let timer;
            try {
              return await Promise.race([(async () => {
                const specs = [{ family: 'Inter', weights: [400,500,600,700,800] }];
                if (serif) specs.push({ family: 'DM Serif Display', weights: [400] });
                const checks = [];
                for (const spec of specs) for (const weight of spec.weights) {
                  const faces = await document.fonts.load(`normal ${weight} 32px "${spec.family}"`, 'Practice Perfect 0123456789');
                  checks.push({ family: spec.family, weight, faces: faces.map(face => ({ family: face.family.replace(/^['"]|['"]$/g, ''), style: face.style, weight: face.weight, status: face.status })) });
                }
                await document.fonts.ready; return checks;
              })(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Font readiness timed out')), timeoutMs); })]);
            } finally { clearTimeout(timer); }
          }, { serif: policy.SERIF_ROUTES.includes(route), timeoutMs: deadline.remaining(5000) });
          policy.requireFontChecks(checks, route);
          await page.evaluate(waitForCaptureReady, { selector: 'body', timeoutMs: deadline.remaining(5000) });
          const geometry = policy.normalizeGeometry(await page.evaluate(() => {
            const rect = node => { const r = node.getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width, height:r.height }; };
            return { document: { width: Math.ceil(Math.max(document.documentElement.scrollWidth, document.body.scrollWidth, innerWidth)),
              height: Math.ceil(Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, innerHeight)) },
              viewport: { width:innerWidth, height:innerHeight, dpr:devicePixelRatio }, scroll: { x:scrollX, y:scrollY },
              images: [...document.images].map(image => ({ rect:rect(image), currentSrc:image.currentSrc, naturalWidth:image.naturalWidth, naturalHeight:image.naturalHeight })) };
          }), origins[side]);
          assert.deepEqual(geometry.scroll, { x:0, y:0 });
          const reservation = budget.reserve(policy.captureReservation(geometry));
          const image = await page.screenshot({ fullPage:true, animations:'disabled', timeout:deadline.remaining(10000) });
          const name = `${String(index).padStart(2, '0')}-${width}-${side === 0 ? 'main' : 'candidate'}.png`;
          const stored = side === 0 ? { evidenceFile:name, storage:'original-first-capture' }
            : policy.firstPairEvidence(captures[0], image, record.main.name, name);
          if (stored.storage === 'deduplicated-equal-first-capture') {
            // Both original PNGs were independently captured. Refund bytes only after exact Buffer equality.
            assert.ok(image.length <= reservation.bytes, 'Evidence reservation exceeded before deduplication');
            budget.complete(reservation, 0);
          } else write(name, image, reservation);
          const dimensions = policy.pngDimensions(image);
          const item = { name, ...stored, sha256:digest(image), bytes:image.length, dimensions, geometry, fontChecks:checks };
          record[side === 0 ? 'main' : 'candidate'] = item; captures.push(image);
          policy.requireCaptureDimensions(dimensions, geometry);
        } finally { await page.close(); }
      }
      assert.deepEqual(record.candidate.geometry, record.main.geometry, 'Literal-main geometry/image choice changed');
      assert.ok(captures[0].equals(captures[1]), 'Literal-main first PNG bytes changed');
      record.passed = true;
    }
    deadline.remaining(); assert.equal(expired, false);
    assert.equal(networkOverflow, false, 'Network evidence record cap exceeded');
    policy.requireCoverage(results.cases, routes);
    for (const list of ['blockedExternal','requestFailures','responseFailures','errors']) assert.deepEqual(results[list], []);
    assert.ok(results.externalFetches.some(item => item.type === 'stylesheet'));
    assert.ok(results.externalFetches.some(item => item.type === 'font'));
    results.passed = true; results.visualAcceptance = true;
  } catch (error) {
    // Never copy subprocess payload/stderr or candidate source into logs.
    results.error = String(error?.message || 'Literal-main verification failed').slice(0, 300);
    throw new Error('Literal-main verification failed; inspect bounded first-capture evidence');
  } finally {
    clearTimeout(timer); stop();
    results.cleanup = await closeResources({ context, browser, servers });
    if (!results.cleanup.passed) { results.passed = false; results.visualAcceptance = false; }
    results.evidenceBytesReservedOrWritten = budget.used;
    const json = Buffer.from(JSON.stringify(results, null, 2) + '\n');
    assert.ok(json.length <= policy.MAX_JSON_BYTES, 'JSON evidence cap exceeded');
    write('results.json', json, jsonReservation);
    if (!results.cleanup.passed) throw new Error('Literal-main cleanup not verified; evidence retained');
    if (results.passed) console.log('PASS: 54 literal-main full-page first-capture pairs and geometry/image choices; cleanup verified.');
  }
}
module.exports = { admitCandidate, acquireSnapshot, evidenceWriter, closeResources, main };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
