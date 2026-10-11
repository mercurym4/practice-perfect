/* Local-only browser checks. No deployment or form submission is performed. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const output = path.resolve(process.env.BROWSER_EVIDENCE_DIR || '/tmp/practice-perfect-browser-evidence');
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
async function snapshot(page, origin, target, width, before = false) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`${origin}/${target.file}`, { waitUntil: 'networkidle' });
  const element = page.locator(before && target.beforeSelector ? target.beforeSelector : target.selector);
  assert.equal(await element.count(), 1);
  await element.scrollIntoViewIfNeeded();
  const computed = await element.evaluate(el => {
    const css = getComputedStyle(el);
    return { styles: Object.fromEntries([...css].map(key => [key, css.getPropertyValue(key)])),
      rect: JSON.parse(JSON.stringify(el.getBoundingClientRect())) };
  });
  const image = await element.screenshot({ animations: 'disabled' });
  return { computed, image, sha256: crypto.createHash('sha256').update(image).digest('hex') };
}
async function main() {
  fs.mkdirSync(output, { recursive: true });
  const before = await serve(true), after = await serve(false);
  let browser;
  const results = { sourceCommit: process.env.SOURCE_COMMIT || null, scope: 'PP-WEB-14 style targets; PP-WEB-15 keyboard; mobile navigation',
    limits: 'External fonts blocked for deterministic fallback-font parity. Does not establish deployed CSP, production fonts, image selection or full-page visual acceptance.',
    styles: [], keyboard: [], navigation: [], localFailures: [] };
  try {
    browser = await chromium.launch({ headless: true });
    results.browser = browser.version();
    const context = await browser.newContext({ reducedMotion: 'reduce', deviceScaleFactor: 1 });
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname !== '127.0.0.1') return route.abort();
      if (['/analytics.js', '/contact-form.js'].includes(url.pathname))
        return route.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
      return route.continue();
    });
    context.on('response', response => {
      if (response.status() >= 400) results.localFailures.push({ url: response.url(), status: response.status() });
    });
    const page = await context.newPage();
    for (const target of targets) for (const width of widths) {
      const a = await snapshot(page, before.origin, target, width, true);
      const b = await snapshot(page, after.origin, target, width);
      const key = `${target.file.replace('.html', '')}-${width}`;
      fs.writeFileSync(path.join(output, `${key}-before.png`), a.image);
      fs.writeFileSync(path.join(output, `${key}-after.png`), b.image);
      assert.deepEqual(b.computed, a.computed, `${key}: computed styles/geometry`);
      assert.equal(b.sha256, a.sha256, `${key}: target pixel parity`);
      results.styles.push({ file: target.file, selector: target.selector, width, screenshotSha256: b.sha256 });
    }
    const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
    const routes = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => new URL(m[1]).pathname);
    assert.equal(routes.length, 27);
    for (const route of routes) for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(after.origin + route, { waitUntil: 'networkidle' });
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('.skip-link').evaluate(el => document.activeElement === el), true, route);
      const bounds = await page.locator('.skip-link').boundingBox();
      assert.ok(bounds && bounds.y >= 0 && bounds.y + bounds.height <= 900, `${route}: visible focus`);
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'main-content', route);
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.querySelector('main').contains(document.activeElement)), true, route);
      results.keyboard.push({ route, width, firstTab: 'skip-link', enter: 'main-content', nextTab: 'within-main' });
    }
    for (const route of ['/', '/services', '/contact']) {
      await page.setViewportSize({ width: 390, height: 900 });
      await page.goto(after.origin + route, { waitUntil: 'networkidle' });
      const button = page.locator('.mobile-menu-toggle');
      await button.click(); assert.equal(await button.getAttribute('aria-expanded'), 'true');
      await page.keyboard.press('Escape'); assert.equal(await button.getAttribute('aria-expanded'), 'false');
      await button.click(); await page.setViewportSize({ width: 981, height: 900 });
      await page.waitForFunction(() => !document.body.classList.contains('menu-open'));
      assert.equal(await button.getAttribute('aria-expanded'), 'false');
      results.navigation.push({ route, open: true, escapeClose: true, resizeClose: true });
    }
    assert.deepEqual(results.localFailures, [], 'required local assets must load');
    results.passed = true;
    console.log(`PASS: ${results.styles.length} computed/pixel comparisons; ${results.keyboard.length} keyboard checks; ${results.navigation.length} menu checks.`);
  } finally {
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
    if (browser) await browser.close();
    await Promise.all([new Promise(r => before.server.close(r)), new Promise(r => after.server.close(r))]);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
