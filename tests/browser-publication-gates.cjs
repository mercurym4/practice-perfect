/* Local-only browser checks. No deployment or form submission is performed. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { chromium } = require('playwright');
const { runPublicationContactRecovery } = require('./contact-browser-publication.cjs');
const { waitForCaptureReady, captureDiagnostics } = require('./capture-readiness.cjs');
const root = path.resolve(__dirname, '..');
const output = path.resolve(process.env.BROWSER_EVIDENCE_DIR || '/tmp/practice-perfect-browser-evidence');
const widths = [320, 390, 640, 641, 650, 651, 768, 980, 981, 1440, 1700, 2560];
const servicesStyleBytes = 9489;
const servicesCandidateBytes = fs.readFileSync(path.join(root, 'services-reference.css'));
const servicesBlock = servicesCandidateBytes.subarray(0, servicesStyleBytes).toString('utf8');
const servicesReferenceBefore = servicesCandidateBytes.subarray(servicesStyleBytes).toString('utf8').replace(/^\n/, '');
assert.equal(Buffer.byteLength(servicesBlock), servicesStyleBytes);
assert.equal(`${servicesBlock}\n${servicesReferenceBefore}`, servicesCandidateBytes.toString('utf8'));
const targets = [
  { file: 'our-system.html', selector: '.feature-grid--spaced', beforeSelector: '.feature-grid[style="margin-top:18px"]' },
  { file: 'what-we-fix.html', selector: '.feature-grid--spaced', beforeSelector: '.feature-grid[style="margin-top:18px"]' },
  { file: 'contact.html', selector: '.contact-panel .eyebrow', style: 'color:#9bd08d' },
  { file: 'pricing.html', selector: '.pricing-intro .section-heading', style: 'margin:0' },
  { key: 'contact-grid', file: 'contact.html', selector: '.contact-page .subhero-grid' },
  { key: 'contact-nextsteps', file: 'contact.html', selector: '.contact-page .contact-nextsteps' },
  { key: 'contact-chip', file: 'contact.html', selector: '.contact-nextsteps .hero-chip' },
  { key: 'audit-context-link', file: 'what-we-fix.html', selector: '.audit-context-link' },
  { key: 'direct-mail-anchor', file: 'services/debt-defense-direct-mail.html', selector: '#acquisition-scope' },
  { key: 'pi-anchor', file: 'services/pi-mva-lead-generation.html', selector: '#acquisition-scope' },
  { key: 'ppc-anchor', file: 'services/ppc-marketing.html', selector: '#marketing-scope' },
  { key: 'sprint-anchor', file: 'services/revenue-growth-sprint.html', selector: '#sprint-scope' },
  { key: 'seo-anchor', file: 'services/seo-marketing.html', selector: '#marketing-scope' },
  { key: 'website-audit-anchor', file: 'services/website-audit-overhaul.html', selector: '#website-scope' },
  { key: 'website-design-anchor', file: 'services/website-design.html', selector: '#website-scope' },
  { key: 'index-header-logo', file: 'index.html', selector: '.header .brand img' },
  { key: 'contact-header-logo', file: 'contact.html', selector: '.header .brand img' },
  { key: 'system-header-logo', file: 'our-system.html', selector: '.header .brand img' },
  { key: 'fix-header-logo', file: 'what-we-fix.html', selector: '.header .brand img' },
  { key: 'about-header-logo', file: 'about.html', selector: '.header .brand img' },
  { key: 'pricing-header-logo', file: 'pricing.html', selector: '.header .brand img' },
  { key: 'about-dashboard', file: 'about.html', selector: '.about-dashboard-image-wrap' },
  { key: 'pricing-current-visual', file: 'pricing.html', selector: '.subhero-visual' },
  { key: 'system-operating-flow', file: 'our-system.html', selector: '#growth-operating-flow' },
  { key: 'services-nav', file: 'services.html', selector: '.header .nav' },
  { key: 'services-hero', file: 'services.html', selector: '.hero-grid' },
  { key: 'services-hero-media', file: 'services.html', selector: '.hero-media img' },
  { key: 'services-grid', file: 'services.html', selector: '.services-grid' },
  { key: 'services-first-card', file: 'services.html', selector: '.service-card:first-child' },
  { key: 'services-partner', file: 'services.html', selector: '.partner-panel' },
  { key: 'services-process', file: 'services.html', selector: '.process-grid' },
  { key: 'services-cta', file: 'services.html', selector: '.reference-mountain-cta' },
  { key: 'services-footer', file: 'services.html', selector: '.footer' },
];
const rules = {
  'enhancements.css': [
    '.feature-grid--spaced{margin-top:18px}',
    'body:not(.services-page) .contact-panel .eyebrow{color:#9bd08d}',
    '.contact-page .subhero-grid{min-height:0}',
    '.contact-page .contact-nextsteps{min-height:0;margin:0;overflow:visible}',
    '.contact-nextsteps .hero-chip{position:static;max-width:none}',
    '.audit-context-link{display:inline-block;margin-top:12px;color:#0d2b55;font-size:13px;font-weight:700;line-height:1.5;text-decoration:underline;text-underline-offset:3px}',
    '.audit-context-link:focus-visible{outline:3px solid #1477ff;outline-offset:4px}',
    '.contact-page .subhero-grid{gap:24px}',
    '.contact-page .subhero-copy{padding:36px 0 0}',
    '.contact-page .contact-nextsteps{margin-bottom:32px}',
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
  'service-detail.css': [
    '#acquisition-scope{scroll-margin-top:94px}',
    '#marketing-scope{scroll-margin-top:94px}',
    '#website-scope{scroll-margin-top:94px}',
    '#sprint-scope{scroll-margin-top:94px}',
  ],
};
const contactBlock = `<style id="contact-hero-cleanup">
.contact-page .subhero-grid{min-height:0}
.contact-page .contact-nextsteps{min-height:0;margin:0;overflow:visible}
.contact-nextsteps .hero-chip{position:static;max-width:none}
@media(max-width:980px){
.contact-page .subhero-grid{gap:24px}
.contact-page .subhero-copy{padding:36px 0 0}
.contact-page .contact-nextsteps{margin-bottom:32px}
}
</style>`;
const auditBlock = '<style>.audit-context-link{display:inline-block;margin-top:12px;color:#0d2b55;font-size:13px;font-weight:700;line-height:1.5;text-decoration:underline;text-underline-offset:3px}.audit-context-link:focus-visible{outline:3px solid #1477ff;outline-offset:4px}</style>';
const serviceBlocks = {
  'services/debt-defense-direct-mail.html': '<style>#acquisition-scope{scroll-margin-top:94px}</style>',
  'services/pi-mva-lead-generation.html': '<style>#acquisition-scope{scroll-margin-top:94px}</style>',
  'services/ppc-marketing.html': '<style>#marketing-scope{scroll-margin-top:94px}</style>',
  'services/revenue-growth-sprint.html': '<style>#sprint-scope{scroll-margin-top:94px}</style>',
  'services/seo-marketing.html': '<style>#marketing-scope{scroll-margin-top:94px}</style>',
  'services/website-audit-overhaul.html': '<style>#website-scope{scroll-margin-top:94px}</style>',
  'services/website-design.html': '<style>#website-scope{scroll-margin-top:94px}</style>',
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
  if (file === 'services.html') {
    const mark = '<link rel="stylesheet" href="/services-reference.css">';
    assert.equal(text.split(mark).length - 1, 1);
    text = text.replace(mark, `<style>${servicesBlock}</style>${mark}`);
  }
  if (file === 'services-reference.css') {
    assert.equal(text, servicesCandidateBytes.toString('utf8'));
    text = servicesReferenceBefore;
  }
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
  if (file === 'contact.html') {
    const mark = '<link rel="canonical" href="https://practiceperfect.us/contact">';
    assert.equal(text.split(mark).length - 1, 1);
    text = text.replace(mark, mark + contactBlock);
  }
  if (file === 'what-we-fix.html') {
    const mark = '<meta property="og:type" content="website">';
    assert.equal(text.split(mark).length - 1, 1);
    text = text.replace(mark, auditBlock + mark);
  }
  if (serviceBlocks[file]) {
    assert.equal(text.split('</head>').length - 1, 1);
    text = text.replace('</head>', serviceBlocks[file] + '</head>');
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
async function prepareCapture(page, selector) {
  try {
    return await page.evaluate(waitForCaptureReady, { selector });
  } catch (error) {
    try { error.captureDiagnostics = await page.evaluate(captureDiagnostics, selector); } catch (_) { /* Preserve original readiness failure. */ }
    throw error;
  }
}
async function snapshot(page, origin, target, width, before = false) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`${origin}/${target.file}`, { waitUntil: 'networkidle' });
  const element = page.locator(before && target.beforeSelector ? target.beforeSelector : target.selector);
  assert.equal(await element.count(), 1);
  await element.scrollIntoViewIfNeeded();
  await prepareCapture(page, before && target.beforeSelector ? target.beforeSelector : target.selector);
  const computed = await element.evaluate(el => {
    const css = getComputedStyle(el);
    return { styles: Object.fromEntries([...css].map(key => [key, css.getPropertyValue(key)])),
      rect: JSON.parse(JSON.stringify(el.getBoundingClientRect())) };
  });
  const image = await element.screenshot({ animations: 'disabled' });
  const diagnostics = await page.evaluate(captureDiagnostics, before && target.beforeSelector ? target.beforeSelector : target.selector);
  return { computed, image, diagnostics, sha256: crypto.createHash('sha256').update(image).digest('hex') };
}
async function main() {
  fs.mkdirSync(output, { recursive: true });
  const before = await serve(true), after = await serve(false);
  let browser;
  const results = { sourceCommit: process.env.SOURCE_COMMIT || null, scope: 'PP-WEB-14, PP-WEB-22 through PP-WEB-25 migrated style targets; PP-WEB-15 keyboard; mobile navigation',
    limits: 'External fonts blocked for deterministic fallback-font parity. Services full-page parity covers five transition widths only. Does not establish deployed CSP, production fonts, image selection or whole-site full-page visual acceptance.',
    styles: [], fullPage: [], print: [], focus: [], keyboard: [], navigation: [], localFailures: [],
    contactRecovery: { passed: false, status: 'not-executed' } };
  try {
    browser = await chromium.launch({ headless: true });
    results.browser = browser.version();
    try {
      results.contactRecovery = await runPublicationContactRecovery(browser, root, results.sourceCommit);
    } catch (error) {
      results.contactRecovery = { passed: false, status: 'failed', error: String(error.message) };
      throw error;
    }
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
      const key = `${target.key || target.file.replace('.html', '')}-${width}`;
      fs.writeFileSync(path.join(output, `${key}-before.png`), a.image);
      fs.writeFileSync(path.join(output, `${key}-after.png`), b.image);
      if (JSON.stringify(b.computed) !== JSON.stringify(a.computed) || b.sha256 !== a.sha256)
        results.failedComparison = { key, before: a.diagnostics, after: b.diagnostics };
      assert.deepEqual(b.computed, a.computed, `${key}: computed styles/geometry`);
      assert.equal(b.sha256, a.sha256, `${key}: target pixel parity`);
      results.styles.push({ file: target.file, selector: target.selector, width, screenshotSha256: b.sha256 });
    }
    for (const width of [640, 641, 980, 981, 1700]) {
      const captures = [];
      for (const site of [before, after]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`${site.origin}/services.html`, { waitUntil: 'networkidle' });
        await prepareCapture(page, 'body');
        const image = await page.screenshot({ fullPage: true, animations: 'disabled' });
        captures.push({ image, diagnostics: await page.evaluate(captureDiagnostics, 'body'), sha256: crypto.createHash('sha256').update(image).digest('hex') });
      }
      fs.writeFileSync(path.join(output, `services-full-${width}-before.png`), captures[0].image);
      fs.writeFileSync(path.join(output, `services-full-${width}-after.png`), captures[1].image);
      if (captures[1].sha256 !== captures[0].sha256)
        results.failedComparison = { key: `services-full-${width}`, before: captures[0].diagnostics, after: captures[1].diagnostics };
      assert.equal(captures[1].sha256, captures[0].sha256, `services full-page ${width}: pixel parity`);
      results.fullPage.push({ file: 'services.html', width, screenshotSha256: captures[1].sha256 });
    }
    await page.emulateMedia({ media: 'print' });
    const printCaptures = [];
    for (const site of [before, after]) {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(`${site.origin}/services.html`, { waitUntil: 'networkidle' });
      await prepareCapture(page, 'body');
      const image = await page.screenshot({ fullPage: true, animations: 'disabled' });
      printCaptures.push({ image, diagnostics: await page.evaluate(captureDiagnostics, 'body'), sha256: crypto.createHash('sha256').update(image).digest('hex') });
    }
    fs.writeFileSync(path.join(output, 'services-print-before.png'), printCaptures[0].image);
    fs.writeFileSync(path.join(output, 'services-print-after.png'), printCaptures[1].image);
    if (printCaptures[1].sha256 !== printCaptures[0].sha256)
      results.failedComparison = { key: 'services-print', before: printCaptures[0].diagnostics, after: printCaptures[1].diagnostics };
    assert.equal(printCaptures[1].sha256, printCaptures[0].sha256, 'services print: pixel parity');
    results.print.push({ file: 'services.html', width: 1280, screenshotSha256: printCaptures[1].sha256 });
    await page.emulateMedia({ media: 'screen' });
    for (const width of [390, 1280]) {
      const focus = [];
      for (const site of [before, after]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`${site.origin}/what-we-fix.html`, { waitUntil: 'networkidle' });
        await prepareCapture(page, '.audit-context-link');
        const link = page.locator('.audit-context-link');
        await link.focus();
        await page.keyboard.press('Tab');
        await page.keyboard.press('Shift+Tab');
        focus.push(await link.evaluate(el => {
          const css = getComputedStyle(el);
          return { active: document.activeElement === el, visible: el.matches(':focus-visible'),
            outlineColor: css.outlineColor, outlineStyle: css.outlineStyle,
            outlineWidth: css.outlineWidth, outlineOffset: css.outlineOffset };
        }));
      }
      assert.deepEqual(focus[1], focus[0], `audit focus ${width}: before/after`);
      assert.deepEqual(focus[1], { active: true, visible: true, outlineColor: 'rgb(20, 119, 255)',
        outlineStyle: 'solid', outlineWidth: '3px', outlineOffset: '4px' });
      results.focus.push({ file: 'what-we-fix.html', selector: '.audit-context-link:focus-visible', width, computed: focus[1] });
    }
    const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
    const routes = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => new URL(m[1]).pathname);
    assert.equal(routes.length, 27);
    for (const route of routes) for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(after.origin + route, { waitUntil: 'networkidle' });
      await prepareCapture(page, '.skip-link');
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
      await prepareCapture(page, '.mobile-menu-toggle');
      const button = page.locator('.mobile-menu-toggle');
      await button.click(); assert.equal(await button.getAttribute('aria-expanded'), 'true');
      await page.keyboard.press('Escape'); assert.equal(await button.getAttribute('aria-expanded'), 'false');
      await button.click(); await page.setViewportSize({ width: 981, height: 900 });
      await page.waitForFunction(() => !document.body.classList.contains('menu-open'));
      assert.equal(await button.getAttribute('aria-expanded'), 'false');
      results.navigation.push({ route, open: true, escapeClose: true, resizeClose: true });
    }
    assert.deepEqual(results.localFailures, [], 'required local assets must load');
    assert.equal(results.contactRecovery.passed, true, 'Contact recovery must also pass');
    results.passed = true;
    console.log(`PASS: ${results.contactRecovery.executedScenarioCount} contact-recovery scenarios (native DOM, simulated transport; no live delivery).`);
    console.log(`PASS: ${results.styles.length} computed/pixel comparisons; ${results.fullPage.length} Services full-page comparisons; ${results.print.length} print comparison; ${results.focus.length} focus comparisons; ${results.keyboard.length} keyboard checks; ${results.navigation.length} menu checks.`);
  } catch (error) {
    results.failure = { message: String(error.message), ...(error.captureDiagnostics ? { diagnostics: error.captureDiagnostics } : {}) };
    throw error;
  } finally {
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
    if (browser) await browser.close();
    await Promise.all([new Promise(r => before.server.close(r)), new Promise(r => after.server.close(r))]);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
