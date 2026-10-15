/* Loopback-only candidate testing; no publication, analytics or form submission. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const output = path.resolve(process.env.FONT_EVIDENCE_DIR || '/tmp/practice-perfect-font-evidence');
const serifRoutes = new Set(['/about', '/contact', '/our-system', '/pricing', '/what-we-fix']);
const interWeights = [400, 500, 600, 700, 800];
const sample = 'Practice Perfect 0123456789';
async function main() {
  fs.mkdirSync(output, { recursive: true });
  const results = { sourceCommit: process.env.SOURCE_COMMIT || null, passed: false,
    scope: 'Actual Google Fonts readiness on 27 Inter pages and five DM Serif Display pages',
    limits: 'Chromium Latin normal-style readiness only; explicitly loads reviewed faces. No font pixel parity, deployed headers, performance timing, full Unicode coverage or physical-device claim.',
    pages: [], network: [], failures: [], blockedExternal: [] };
  const server = http.createServer((req, res) => {
    const route = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (route === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    let file = path.resolve(root, route === '/' ? 'index.html' : route.slice(1));
    if (!path.extname(file)) file += '.html';
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404); res.end(); return;
    }
    const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    res.end(fs.readFileSync(file));
  });
  let browser;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
    const routes = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => new URL(m[1]).pathname);
    assert.equal(routes.length, 27); assert.equal(new Set(routes).size, 27);
    assert.deepEqual(new Set(routes.filter(route => serifRoutes.has(route))), serifRoutes);
    browser = await chromium.launch({ headless: true }); results.browser = browser.version();
    for (const route of routes) {
      // Fresh contexts prevent a previous page's font cache masking a failed request.
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const network = [];
      try {
        await context.route('**/*', async requestRoute => {
          const request = requestRoute.request(), url = new URL(request.url());
          if (url.origin === origin) {
            if (['/analytics.js', '/contact-form.js'].includes(url.pathname))
              return requestRoute.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
            return requestRoute.continue();
          }
          const googleStyle = url.protocol === 'https:' && url.hostname === 'fonts.googleapis.com' && url.pathname === '/css2' && request.resourceType() === 'stylesheet';
          // Google Fonts may serve reviewed font bytes from versioned /s/ paths
          // or the /l/font endpoint; both stay within the exact HTTPS font host.
          const googleFont = url.protocol === 'https:' && url.hostname === 'fonts.gstatic.com' && request.resourceType() === 'font';
          if (request.method() === 'GET' && (googleStyle || googleFont)) return requestRoute.continue();
          results.blockedExternal.push({ route, url: url.href, type: request.resourceType() });
          return requestRoute.abort();
        });
        context.on('response', response => {
          const request = response.request();
          if (new URL(response.url()).origin !== origin) network.push({ url: response.url(), type: request.resourceType(), status: response.status() });
          if (response.status() >= 400) results.failures.push({ route, url: response.url(), status: response.status() });
        });
        context.on('requestfailed', request => {
          results.failures.push({ route, url: request.url(), error: request.failure()?.errorText });
        });
        const page = await context.newPage(); page.setDefaultTimeout(30000);
        await page.goto(origin + route, { waitUntil: 'networkidle', timeout: 60000 });
        const stylesheets = await page.locator('link[rel="stylesheet"]').evaluateAll(elements => elements.map(el => el.href).filter(href => new URL(href).hostname === 'fonts.googleapis.com'));
        assert.equal(stylesheets.length, 1, `${route}: one Google stylesheet`);
        const specs = [{ family: 'Inter', weights: interWeights }];
        if (serifRoutes.has(route)) specs.push({ family: 'DM Serif Display', weights: [400] });
        const families = await page.evaluate(async ({ specs, sample }) => {
          const clean = value => value.replace(/^['"]|['"]$/g, '');
          const groups = [];
          for (const { family, weights } of specs) {
            const checks = [];
            for (const weight of weights) {
              const faces = await document.fonts.load(`normal ${weight} 32px "${family}"`, sample);
              checks.push({ requestedStyle: 'normal', requestedWeight: weight,
                faces: faces.map(face => ({ family: clean(face.family), style: face.style, weight: face.weight, status: face.status, unicodeRange: face.unicodeRange })) });
            }
            groups.push({ family, checks });
          }
          await document.fonts.ready;
          return groups;
        }, { specs, sample });
        for (const group of families) for (const check of group.checks) {
          assert.ok(check.faces.length > 0, `${route}: ${group.family} ${check.requestedWeight} must resolve real FontFaces`);
          for (const face of check.faces) {
            assert.equal(face.family, group.family); assert.equal(face.style, 'normal'); assert.equal(face.status, 'loaded');
            const range = face.weight.split(/\s+/).map(Number);
            assert.ok(range.every(Number.isFinite) && range.length >= 1 && range.length <= 2, `${route}: valid face weight descriptor`);
            assert.ok(check.requestedWeight >= range[0] && check.requestedWeight <= range[range.length - 1], `${route}: ${group.family} supports ${check.requestedWeight}`);
          }
        }
        assert.ok(network.some(item => item.type === 'stylesheet' && item.status === 200), `${route}: Google CSS received`);
        assert.ok(network.some(item => item.type === 'font' && item.status === 200), `${route}: font bytes received`);
        results.pages.push({ route, stylesheet: stylesheets[0], families });
        results.network.push({ route, responses: network });
      } finally { await context.close(); }
    }
    assert.deepEqual(results.blockedExternal, [], 'unexpected external dependency');
    assert.deepEqual(results.failures, [], 'all required requests succeeded');
    results.familyPageGroups = results.pages.reduce((total, page) => total + page.families.length, 0);
    results.weightPageChecks = results.pages.reduce((total, page) => total + page.families.reduce((n, family) => n + family.checks.length, 0), 0);
    assert.equal(results.familyPageGroups, 32); assert.equal(results.weightPageChecks, 140);
    results.passed = true;
    console.log('PASS: 27 Inter pages, five DM Serif Display pages; 32 family/page groups and 140 real FontFace weight checks.');
  } catch (error) { results.error = String(error.stack || error); throw error; }
  finally {
    fs.writeFileSync(path.join(output, 'font-results.json'), JSON.stringify(results, null, 2));
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
