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
  { key: 'index-header-logo', file: 'index.html', selector: '.header .brand img', families: ['Inter'] },
  { key: 'pricing-header-logo', file: 'pricing.html', selector: '.header .brand img' },
  { key: 'about-dashboard', file: 'about.html', selector: '.about-dashboard-image-wrap' },
  { key: 'pricing-current-visual', file: 'pricing.html', selector: '.subhero-visual' },
  { key: 'system-operating-flow', file: 'our-system.html', selector: '#growth-operating-flow' },
];
const rules = {
  'enhancements.css': [
    '.feature-grid--spaced{margin-top:18px}',
    'body:not(.services-page) .contact-panel .eyebrow{color:#9bd08d}',
    '.header .brand{display:flex;align-items:center;flex:0 0 auto}',
    '.header .brand img{width:176px!important;height:auto!important;max-width:none!important;display:block!important}',
    '@media(max-width:640px){.header .brand img{width:145px!important}}',
    '.about-dashboard-image-wrap{min-height:0!important;background:transparent!important;box-shadow:0 16px 42px rgba(13,43,85,.12)}',
    '.about-dashboard-image-wrap img{display:block;width:100%;height:auto;object-fit:contain}',
    '#growth-operating-flow{grid-template-columns:repeat(2,minmax(0,1fr));min-height:0;padding:28px;gap:16px;background:linear-gradient(135deg,var(--navy),#174c70);border:0;align-items:stretch}',
    '#growth-operating-flow .system-node{position:relative;min-width:0;text-align:left;padding:22px 18px;background:#fff;border:1px solid var(--line);border-radius:14px;box-shadow:0 8px 24px rgba(13,43,85,.12);overflow:hidden}',
    '#growth-operating-flow .system-node:before{content:"";position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--green),var(--blue))}',
    '#growth-operating-flow .system-node-top{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:20px}',
    '#growth-operating-flow .feature-icon{width:46px;height:46px;flex-shrink:0;margin:0;background:var(--mint);color:var(--navy)}',
    '#growth-operating-flow .system-node span{width:auto;height:auto;margin:0;background:none;border-radius:0;color:var(--text);font-size:12px;letter-spacing:.08em}',
    '#growth-operating-flow .system-node b{font-size:19px;color:var(--navy);line-height:1.3}',
    '#growth-operating-flow .system-node small{font-size:12px;line-height:1.5;color:var(--text);margin-top:7px}',
    '#growth-operating-flow .system-arrow{display:none}',
    '@media(max-width:980px){#growth-operating-flow{grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;padding:24px}#growth-operating-flow .system-arrow{display:none}}',
    '@media(max-width:650px){#growth-operating-flow{grid-template-columns:1fr;padding:18px;gap:14px}#growth-operating-flow .system-node{padding:20px}#growth-operating-flow .system-node-top{margin-bottom:14px}}',
  ],
  'pricing-dashboard.css': [
    '.pricing-intro .section-heading{margin:0}',
    '.pricing-hero-visual{position:relative;min-height:500px;overflow:hidden}',
    '.pricing-hero-image{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center;display:block}',
    '.pricing-hero-visual:after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(241,247,242,.32),rgba(13,43,85,.04))}',
    '.pricing-hero-visual .hero-chip{z-index:2}',
  ],
};
const headerRules = '.header .brand{display:flex;align-items:center;flex:0 0 auto}.header .brand img{width:176px!important;height:auto!important;max-width:none!important;display:block!important}@media(max-width:640px){.header .brand img{width:145px!important}}';
const aboutRules = '.about-dashboard-image-wrap{min-height:0!important;background:transparent!important;box-shadow:0 16px 42px rgba(13,43,85,.12)}.about-dashboard-image-wrap img{display:block;width:100%;height:auto;object-fit:contain}';
const pricingRules = '.pricing-hero-visual{position:relative;min-height:500px;overflow:hidden}.pricing-hero-image{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center;display:block}.pricing-hero-visual:after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(241,247,242,.32),rgba(13,43,85,.04))}.pricing-hero-visual .hero-chip{z-index:2}';
const operatingFlowRules = `<style id="pp-operating-flow-polish">
#growth-operating-flow{grid-template-columns:repeat(2,minmax(0,1fr));min-height:0;padding:28px;gap:16px;background:linear-gradient(135deg,var(--navy),#174c70);border:0;align-items:stretch}
#growth-operating-flow .system-node{position:relative;min-width:0;text-align:left;padding:22px 18px;background:#fff;border:1px solid var(--line);border-radius:14px;box-shadow:0 8px 24px rgba(13,43,85,.12);overflow:hidden}
#growth-operating-flow .system-node:before{content:"";position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--green),var(--blue))}
#growth-operating-flow .system-node-top{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:20px}
#growth-operating-flow .feature-icon{width:46px;height:46px;flex-shrink:0;margin:0;background:var(--mint);color:var(--navy)}
#growth-operating-flow .system-node span{width:auto;height:auto;margin:0;background:none;border-radius:0;color:var(--text);font-size:12px;letter-spacing:.08em}
#growth-operating-flow .system-node b{font-size:19px;color:var(--navy);line-height:1.3}
#growth-operating-flow .system-node small{font-size:12px;line-height:1.5;color:var(--text);margin-top:7px}
#growth-operating-flow .system-arrow{display:none}
@media(max-width:980px){#growth-operating-flow{grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;padding:24px}#growth-operating-flow .system-arrow{display:none}}
@media(max-width:650px){#growth-operating-flow{grid-template-columns:1fr;padding:18px;gap:14px}#growth-operating-flow .system-node{padding:20px}#growth-operating-flow .system-node-top{margin-bottom:14px}}
</style>`;
function beforeSource(file, text) {
  for (const rule of rules[file] || []) {
    const expected = rule === '#growth-operating-flow .system-arrow{display:none}' ? 2 : 1;
    assert.equal(text.split(rule).length - 1, expected, `baseline rule: ${file}`);
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
  if (file === 'our-system.html') {
    const mark = '<link rel="stylesheet" href="enhancements.css">';
    assert.equal(text.split(mark).length - 1, 1);
    text = text.replace(mark, mark + operatingFlowRules);
  }
  if (['index.html', 'contact.html', 'our-system.html', 'what-we-fix.html'].includes(file)) {
    const mark = '<link rel="stylesheet" href="enhancements.css">';
    assert.equal(text.split(mark).length - 1, 1);
    text = text.replace(mark, mark + `<style id="pp-logo-match-services">${headerRules}</style>`);
  }
  if (file === 'about.html') {
    const mark = '<link rel="stylesheet" href="enhancements.css">';
    assert.equal(text.split(mark).length - 1, 1);
    text = text.replace(mark, mark + `<style id="pp-logo-match-services">${headerRules}${aboutRules}</style>`);
  }
  if (file === 'pricing.html') {
    const mark = '<link rel="stylesheet" href="pricing-dashboard.css">';
    assert.equal(text.split(mark).length - 1, 1);
    text = text.replace(mark, mark + `<style id="pp-logo-match-services">${headerRules}${pricingRules}</style>`);
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
async function actualFonts(page, families = ['Inter', 'DM Serif Display']) {
  const allSpecs = [{ family: 'Inter', weights: [400, 500, 600, 700, 800] }, { family: 'DM Serif Display', weights: [400] }];
  const specs = allSpecs.filter(spec => families.includes(spec.family));
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
  const fontFaces = await actualFonts(page, target.families);
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
  const results = { sourceCommit: process.env.SOURCE_COMMIT || null, scope: 'PP-WEB-14, PP-WEB-23 and PP-WEB-24 migrated style targets with actual reviewed Google Fonts',
    limits: 'Actual requested normal Latin font readiness and scoped target parity in Chromium. Baseline restores only the reviewed phase-2, phase-4 and phase-5 rules; it retains current font topology and all other changes. Does not establish older-site or whole-page font parity, deployed CSP or performance.',
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
        // Google Fonts may serve reviewed font bytes from versioned /s/ paths or
        // the /l/font endpoint. Keep the boundary on HTTPS + exact host + font
        // resource type instead of coupling acceptance to one CDN path shape.
        const font = url.protocol === 'https:' && url.hostname === 'fonts.gstatic.com' && request.resourceType() === 'font';
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
      const key = `${target.key || target.file.replace('.html', '')}-${width}`;
      fs.writeFileSync(path.join(output, `${key}-before.png`), a.image);
      fs.writeFileSync(path.join(output, `${key}-after.png`), b.image);
      assert.deepEqual(b.computed, a.computed, `${key}: computed styles/geometry`);
      assert.equal(b.sha256, a.sha256, `${key}: target pixel parity`);
      results.fontReadiness.push({ file: target.file, width, before: a.fontFaces, after: b.fontFaces });
      results.styles.push({ file: target.file, selector: target.selector, width, screenshotSha256: b.sha256 });
    }
    assert.equal(results.styles.length, targets.length * widths.length);
    assert.equal(results.fontReadiness.length, targets.length * widths.length);
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
