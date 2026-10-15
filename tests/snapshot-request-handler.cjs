'use strict';
// Visual-fixture routing only. The caller must authenticate/decode both snapshots
// before composition; this handler does not establish byte provenance.
const PATHS = Object.freeze([
  "about.html",
  "analytics.js",
  "approved-green.css",
  "assets/library/about/about-growth-dashboard.webp",
  "assets/library/about/executive-boardroom.webp",
  "assets/library/about/leadership-workshop.webp",
  "assets/library/general/practice-perfect-analytics-workspace.webp",
  "assets/library/general/practice-perfect-office-growth-dashboard.webp",
  "assets/library/general/practice-perfect-performance-dashboard.webp",
  "assets/library/heroes/home-growth-hero.webp",
  "assets/library/heroes/practice-perfect-boardroom-hero.webp",
  "assets/library/heroes/services-growth-hero.webp",
  "assets/library/home/approved-monitor-workspace.png",
  "assets/library/home/approved-mountain-cta.png",
  "assets/library/home/approved-office-hero.png",
  "assets/library/home/opportunity-to-measurable-growth-dashboard.png",
  "assets/library/logos/practice-perfect-logo.png",
  "assets/library/logos/practice-perfect-logo.svg",
  "assets/library/masters/approved-green-services-reference.png",
  "assets/library/masters/opportunity-to-measurable-growth-reference.png",
  "assets/library/masters/practice-perfect-analytics-workspace-master.png",
  "assets/library/masters/practice-perfect-analytics-workspace-master.webp",
  "assets/library/masters/practice-perfect-boardroom-master.png",
  "assets/library/masters/practice-perfect-boardroom-master.webp",
  "assets/library/masters/practice-perfect-logo-master.png",
  "assets/library/masters/practice-perfect-office-growth-dashboard-master.png",
  "assets/library/masters/practice-perfect-office-growth-dashboard-master.webp",
  "assets/library/masters/practice-perfect-performance-dashboard-master.webp",
  "assets/library/masters/services-monitor-sharp-v2.png",
  "assets/library/our-system/growth-system-dashboard.webp",
  "assets/library/pricing/scalable-growth-path.webp",
  "assets/library/services/analytics-workspace.webp",
  "assets/library/services/approved-monitor-reference.png",
  "assets/library/services/approved-mountain-reference.png",
  "assets/library/services/approved-office-reference.png",
  "assets/library/services/monitor-sharp-v2-1288.webp",
  "assets/library/services/monitor-sharp-v2-390.webp",
  "assets/library/services/monitor-sharp-v2-780.webp",
  "assets/library/what-we-fix/revenue-diagnostics.webp",
  "assets/services-analytics-workspace-green.webp",
  "assets/services-dashboard-visual.webp",
  "assets/services-office-banner.webp",
  "assets/services-office-sharp-final.webp",
  "contact-form.js",
  "contact.html",
  "enhancements.css",
  "hero-office.svg",
  "home-reference.css",
  "homepage.css",
  "index.html",
  "logo.png",
  "logo.svg",
  "our-system.html",
  "pricing-dashboard.css",
  "pricing.html",
  "resources.css",
  "resources.html",
  "resources/debt-defense-marketing-fit.html",
  "resources/focused-practice-growth-support.html",
  "resources/law-firm-intake-kpis.html",
  "resources/paid-traffic-client-conversations.html",
  "resources/personal-injury-lead-quality.html",
  "resources/practice-growth-feels-stuck.html",
  "resources/practice-search-visibility.html",
  "resources/sales-intake-leadership-support.html",
  "resources/website-losing-client-confidence.html",
  "robots.txt",
  "service-detail.css",
  "services-reference.css",
  "services.html",
  "services/debt-defense-direct-mail.html",
  "services/fractional-sales-leadership.html",
  "services/law-firm-intake-consulting.html",
  "services/pi-mva-lead-generation.html",
  "services/ppc-marketing.html",
  "services/practice-growth-audit.html",
  "services/revenue-growth-sprint.html",
  "services/seo-marketing.html",
  "services/website-audit-overhaul.html",
  "services/website-design.html",
  "sitemap.xml",
  "styles.css",
  "what-we-fix.html"
]);
const MAX_URL_LENGTH = 2048;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MIME = Object.freeze({
  html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8',
  js: 'application/javascript; charset=utf-8', svg: 'image/svg+xml',
  png: 'image/png', webp: 'image/webp', txt: 'text/plain; charset=utf-8',
  xml: 'application/xml; charset=utf-8'
});
const MAIN_PATHS = new Set(PATHS);
const MOCK_PATHS = new Set(['analytics.js', 'contact-form.js']);
function refused() { throw new Error('Snapshot request adapter refused'); }
function route(status, path = null, kind = null) {
  return Object.freeze({status, path, kind});
}
function resolveSnapshotRoute(rawUrl, includeMobileMenu = false) {
  if (typeof includeMobileMenu !== 'boolean') refused();
  if (typeof rawUrl !== 'string' || rawUrl.length === 0 ||
      rawUrl.length > MAX_URL_LENGTH || !/^[\x21-\x7e]+$/.test(rawUrl) ||
      rawUrl.includes('#')) return route(400);
  // Split the query without decoding or using URL normalization. Bounded printable
  // ASCII queries are ignored only after all raw-path checks below have passed.
  const path = rawUrl.split('?', 1)[0];
  if (!path.startsWith('/') || path.includes('%') || path.includes('\\') ||
      path.includes('//') || path.split('/').some(p => p === '.' || p === '..')) {
    return route(400);
  }
  if (path === '/favicon.ico') return route(204, null, 'favicon');
  let selected = path === '/' ? 'index.html' : path.slice(1);
  if (!MAIN_PATHS.has(selected) && selected !== 'mobile-menu.js' &&
      MAIN_PATHS.has(selected + '.html')) selected += '.html';
  if (!MAIN_PATHS.has(selected) &&
      !(includeMobileMenu && selected === 'mobile-menu.js')) return route(404);
  return route(200, selected, MOCK_PATHS.has(selected) ? 'mock-script' : 'file');
}
function createSnapshotHandler(snapshot) {
  let paths, read;
  try {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) refused();
    paths = snapshot.paths;
    read = snapshot.read;
    if (!Array.isArray(paths) || !Object.isFrozen(paths) ||
        typeof read !== 'function' ||
        (paths.length !== PATHS.length && paths.length !== PATHS.length + 1)) refused();
    // Indexed reads do not honor a caller-supplied array iterator that could
    // hide substituted paths or yield an empty list.
    const sorted = [];
    for (let index = 0; index < paths.length; index++) sorted.push(paths[index]);
    sorted.sort();
    const expected = paths.length === PATHS.length ? [...PATHS] :
      [...PATHS, 'mobile-menu.js'].sort();
    if (sorted.some((p, i) => typeof p !== 'string' || p !== expected[i])) refused();
  } catch { refused(); }
  const includeMobileMenu = paths.length === PATHS.length + 1;
  const readFile = path => Reflect.apply(read, snapshot, [path]);
  return function snapshotRequestHandler(req, res) {
    let head = false;
    function reply(status, body, type = 'text/plain; charset=utf-8', extra = {}) {
      const data = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');
      res.writeHead(status, {
        'Content-Type': type, 'Content-Length': String(data.length),
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra
      });
      res.end(head ? undefined : data);
    }
    try {
      const method = req.method;
      head = method === 'HEAD';
      if (method !== 'GET' && !head) {
        return reply(405, 'Method not allowed\n', undefined, {Allow: 'GET, HEAD'});
      }
      const resolved = resolveSnapshotRoute(req.url, includeMobileMenu);
      if (resolved.status === 400) return reply(400, 'Bad request\n');
      if (resolved.status === 404) return reply(404, 'Not found\n');
      if (resolved.status === 204) return reply(204, Buffer.alloc(0));
      const extension = resolved.path.slice(resolved.path.lastIndexOf('.') + 1);
      const type = MIME[extension];
      if (!type) refused();
      // Side-effecting source scripts are intentionally inert in the visual
      // fixture. Never even call the snapshot reader for these two scripts.
      let data = Buffer.alloc(0);
      if (resolved.kind !== 'mock-script') {
        const result = readFile(resolved.path);
        if (!Buffer.isBuffer(result) || result.length > MAX_FILE_BYTES) refused();
        data = Buffer.from(result);
      }
      return reply(200, data, type);
    } catch {
      // Never reflect a request, path, reader exception, or private source data.
      // Real Node response write failures are the host's responsibility; do not
      // attempt a second response if headers have already been sent.
      if (res.headersSent) return res.end();
      return reply(500, 'Internal error\n');
    }
  };
}
module.exports = Object.freeze({
  createSnapshotHandler, resolveSnapshotRoute, MAX_URL_LENGTH, MAX_FILE_BYTES
});

