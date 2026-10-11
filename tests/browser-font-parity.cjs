/* Actual-font, loopback-only style migration parity. No publication or form submission. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const output = path.resolve(process.env.FONT_PARITY_EVIDENCE_DIR || '/tmp/practice-perfect-font-parity-evidence');
const widths = [320, 390, 640, 641, 650, 651, 768, 980, 981, 1440, 1700, 2560];
const targets = [
  { file: 'our-system.html', selector: '.feature-grid--spaced', beforeSelector: '.feature-grid[style="margin-top:18px"]' },
  { file: 'what-we-fix.html', selector: '.feature-grid--spaced', beforeSelector: '.feature-grid[style="margin-top:18px"]' },
  { file: 'contact.html', selector: '.contact-panel .eyebrow', style: 'color:#9bd08d' },
  { file: 'pricing.html', selector: '.pricing-intro .section-heading', style: 'margin:0' },
];
const rules = {
  'enhancements.css': ['.feature-grid--spaced{margin-top:18px}', 'body:not(.services-page) .contact-panel .eyebrow{color:#9bd08d}'],
  'pricing-dashboard.css': ['.pricing-intro .section-heading{margin:0}'],
};
function beforeSource(file, text) {
  for (const rule of rules[file] || []) {
    assert.equal(text.split(rule).length - 1, 1, `baseline rule: ${file}`);
    text = text.replace(rule, '');
  }
  if (file === 'our-system.html' || file === 'what-we-fix.html') {
    assert.equal(text.split('class="feature-grid feature-grid--spaced"').length - 1, 1);
    text = text.replace('class="feature-grid feature-grid--spaced"', 'class="feature-grid" style="margin-top:18px"');
  }
  if (file === 'contact.html') {
    const mark = '<div class="contact-panel"><div class="eyebrow">';
    assert.equal(text.split(mark).length - 1, 1);
    text = text.replace(mark, '<div class="contact-panel"><div class="eyebrow" style="color:#9bd08d">');
  }
  if (file === 'pricing.html') {
    const mark = '<div class="pricing-intro"><div class="section-heading">';
    assert.equal(text.split(mark).length - 1, 1);
    text = text.replace(mark, '<div class="pricing-intro"><div class="section-heading" style="margin:0">');
  }
  return text;
}
async function serve(before) {
  const server = http.createServer((req, res) => {
    const route = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (route === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    const relative = route === '/' ? 'index.html' : route.slice(1);
    let file = path.resolve(root, relative);
    if (!path.extname(file)) file += '.html';
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404); res.end(); return;
    }
    const ext = path.extname(file);
    const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.xml': 'application/xml' };
    res.setHeader('Content-Type', types[ext] || 'application/octet-stream');
    const bytes = fs.readFileSync(file);
    res.end(before && ['.html', '.css'].includes(ext) ? beforeSource(path.relative(root, file), bytes.toString()) : bytes);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}
async function actualFonts(page) {
  const specs = [{ family: 'Inter', weights: [400, 500, 600, 700, 800] }, { family: 'DM Serif Display', weights: [400] }];
  const loaded = await page.evaluate(async specs => {
    const checks = [];
    for (const { family, weights } of specs) for (const weight of weights) {
      const faces = await document.fonts.load(`normal ${weight} 32px "${family}"`, 'Practice Perfect 0123456789');
      checks.push({ family, requestedWeight: weight, faces: faces.map(face => ({
        family: face.family.replace(/^['"]|['"]$/g, ''), style: face.style, weight: face.weight, status: face.status
      })) });
    }
    await document.fonts.ready;
    return checks;
  }, specs);
  for (const check of loaded) {
    assert.ok(check.faces.length > 0, `real FontFaces required: ${check.family} ${check.requestedWeight}`);
    for (const face of check.faces) {
      assert.equal(face.family, check.family); assert.equal(face.style, 'normal'); assert.equal(face.status, 'loaded');
      const range = face.weight.split(/\s+/).map(Number);
      assert.ok(range.every(Number.isFinite) && range.length >= 1 && range.length <= 2);
      assert.ok(check.requestedWeight >= range[0] && check.requestedWeight <= range[range.length - 1]);
    }
  }
  return loaded;
}
async function snapshot(page, origin, target, width, before = false) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`${origin}/${target.file}`, { waitUntil: 'networkidle' });
  const fontFaces = await actualFonts(page);
  const element = page.locator(before && target.beforeSelector ? target.beforeSelector : target.selector);
  assert.equal(await element.count(), 1);
  await element.scrollIntoViewIfNeeded();
  const computed = await element.evaluate(el => {
    const css = getComputedStyle(el);
    return { styles: Object.fromEntries([...css].map(key => [key, css.getPropertyValue(key)])),
      rect: JSON.parse(JSON.stringify(el.getBoundingClientRect())) };
  });
  const image = await element.screenshot({ animations: 'disabled' });
  return { computed, fontFaces, image, sha256: crypto.createHash('sha256').update(image).digest('hex') };
}
async function main() {
  fs.mkdirSync(output, { recursive: true });
  const before = await serve(true), after = await serve(false);
  let browser;
  const results = { sourceCommit: process.env.SOURCE_COMMIT || null, scope: 'PP-WEB-14 four migrated style targets with actual reviewed Google Fonts',
    limits: 'Actual requested normal Latin font readiness and scoped target parity in Chromium. Baseline restores only four inline declarations; it retains current font topology and all other changes. Does not establish older-site or whole-page font parity, image selection, deployed CSP or performance.',
    styles: [], fontReadiness: [], externalResponses: [], blockedExternal: [], requestFailures: [], localFailures: [] };
  try {
    browser = await chromium.launch({ headless: true });
    results.browser = browser.version();
    const context = await browser.newContext({ reducedMotion: 'reduce', deviceScaleFactor: 1 });
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (![before.origin, after.origin].includes(url.origin)) {
        const request = route.request();
        const style = url.protocol === 'https:' && url.hostname === 'fonts.googleapis.com' && url.pathname === '/css2' && request.resourceType() === 'stylesheet';
        const font = url.protocol === 'https:' && url.hostname === 'fonts.gstatic.com' && url.pathname.startsWith('/s/') && request.resourceType() === 'font';
        if (request.method() === 'GET' && (style || font)) return route.continue();
        results.blockedExternal.push({ url: url.href, type: request.resourceType() });
        return route.abort();
      }
      if (['/analytics.js', '/contact-form.js'].includes(url.pathname))
        return route.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
      return route.continue();
    });
    context.on('response', response => {
      if (response.status() >= 400) results.localFailures.push({ url: response.url(), status: response.status() });
      if (![before.origin, after.origin].includes(new URL(response.url()).origin)) results.externalResponses.push({ url: response.url(), status: response.status(), type: response.request().resourceType() });
    });
    context.on('requestfailed', request => results.requestFailures.push({ url: request.url(), error: request.failure()?.errorText }));
    const page = await context.newPage();
    for (const target of targets) for (const width of widths) {
      const a = await snapshot(page, before.origin, target, width, true);
      const b = await snapshot(page, after.origin, target, width);
      const key = `${target.file.replace('.html', '')}-${width}`;
      fs.writeFileSync(path.join(output, `${key}-before.png`), a.image);
      fs.writeFileSync(path.join(output, `${key}-after.png`), b.image);
      assert.deepEqual(b.computed, a.computed, `${key}: computed styles/geometry`);
      assert.equal(b.sha256, a.sha256, `${key}: target pixel parity`);
      results.fontReadiness.push({ file: target.file, width, before: a.fontFaces, after: b.fontFaces });
      results.styles.push({ file: target.file, selector: target.selector, width, screenshotSha256: b.sha256 });
    }
    assert.equal(results.styles.length, 48);
    assert.equal(results.fontReadiness.length, 48);
    assert.deepEqual(results.blockedExternal, [], 'unexpected external dependency');
    assert.deepEqual(results.requestFailures, [], 'required requests succeeded');
    assert.ok(results.externalResponses.some(item => item.type === 'stylesheet' && item.status === 200), 'Google CSS received');
    assert.ok(results.externalResponses.some(item => item.type === 'font' && item.status === 200), 'font bytes received');
    assert.deepEqual(results.localFailures, [], 'required local assets must load');
    results.passed = true;
    console.log(`PASS: ${results.styles.length} actual-font computed/pixel comparisons; 96 before/after page readiness sets.`);
  } finally {
    fs.writeFileSync(path.join(output, 'font-parity-results.json'), JSON.stringify(results, null, 2));
    if (browser) await browser.close();
    await Promise.all([new Promise(r => before.server.close(r)), new Promise(r => after.server.close(r))]);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
