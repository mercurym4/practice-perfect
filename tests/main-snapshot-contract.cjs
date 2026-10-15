'use strict';
// Pure decoder: no filesystem, network, subprocess, browser or mutable worktree reads.
const crypto = require('node:crypto');
const COMMIT = '86894c29c5d02baad35b3cc47815d2d0ec06315e';
const TREE = 'f09903750fa6d6c8b6df16a7fe818bb92692154d';
const MAPPING = '6378328e0fb0b02fab38e692b9b0f2706197a7eafa3f50aff14b5dd1d790582d';
const PATHS = [
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
];
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES = 16 * 1024 * 1024;
const MAX_JSON_BYTES = 24 * 1024 * 1024;
const B64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const HEX40 = /^[0-9a-f]{40}$/;
const HEX64 = /^[0-9a-f]{64}$/;
function refuse() { throw new Error('Approved-main snapshot contract refused'); }
function digest(algorithm, data) { return crypto.createHash(algorithm).update(data).digest('hex'); }
function decodeMainSnapshot(raw) {
  if (!Buffer.isBuffer(raw) || raw.length === 0 || raw.length > MAX_JSON_BYTES) refuse();
  // ASCII-only canonical wire format. Reject invalid UTF-8, BOM, objects, duplicate-key
  // objects, whitespace alternatives, duplicate data, exponent/negative-zero numbers.
  for (const byte of raw) if (byte > 127 || byte === 0) refuse();
  let value;
  try { value = JSON.parse(raw.toString('ascii')); } catch { refuse(); }
  if (!Array.isArray(value) || value.length !== 12) refuse();
  const [schema, version, repository, commit, tree, mapping, source,
    visual, deployment, count, total, rows] = value;
  if (schema !== 'pp-approved-main-snapshot' || version !== 1 ||
      repository !== 'mercurym4/practice-perfect' || commit !== COMMIT ||
      tree !== TREE || mapping !== MAPPING || source !== 'literal-local-git-objects' ||
      visual !== false || deployment !== false || count !== 83 ||
      !Number.isSafeInteger(total) || total < 0 || total > MAX_TOTAL_BYTES ||
      !Array.isArray(rows) || rows.length !== 83) refuse();
  const entries = [];
  const pathMapping = [];
  let actualTotal = 0;
  for (let index = 0; index < PATHS.length; index++) {
    const row = rows[index];
    if (!Array.isArray(row) || row.length !== 6) refuse();
    const [path, mode, gitBlob, size, sha256, encoded] = row;
    if (path !== PATHS[index] || (mode !== '100644' && mode !== '100755') ||
        typeof gitBlob !== 'string' || !HEX40.test(gitBlob) ||
        !Number.isSafeInteger(size) || size < 0 || size > MAX_FILE_BYTES ||
        typeof sha256 !== 'string' || !HEX64.test(sha256) ||
        typeof encoded !== 'string' || encoded.length !== 4 * Math.ceil(size / 3) ||
        !B64.test(encoded)) refuse();
    actualTotal += size;
    if (actualTotal > MAX_TOTAL_BYTES) refuse();
    const data = Buffer.from(encoded, 'base64');
    if (data.length !== size || data.toString('base64') !== encoded ||
        digest('sha256', data) !== sha256 ||
        digest('sha1', Buffer.concat([Buffer.from('blob ' + size + '\0', 'ascii'), data])) !== gitBlob) refuse();
    pathMapping.push([path, mode, gitBlob]);
    entries.push([path, {data, mode, gitBlob, sha256, size}]);
  }
  if (actualTotal !== total || digest('sha256', Buffer.from(JSON.stringify(pathMapping), 'ascii')) !== MAPPING ||
      raw.toString('ascii') !== JSON.stringify(value) + '\n') refuse();
  // Only defensive lookup is public: neither the private Map nor its Buffers escape.
  const files = new Map(entries);
  return Object.freeze({commit, tree, selectedInventorySha256: mapping, totalBytes: total,
    fileCount: files.size, paths: Object.freeze([...files.keys()]),
    visualAcceptance: false, deploymentVerified: false,
    read(path) { if (typeof path !== 'string' || !files.has(path)) refuse();
      return Buffer.from(files.get(path).data); }});
}
module.exports = Object.freeze({decodeMainSnapshot, MAX_JSON_BYTES, MAX_FILE_BYTES, MAX_TOTAL_BYTES});

if (require.main === module) {
  // Bounded pipe consumer; no file reads, subprocess, server, or browser. Allocate
  // the raw byte budget once and reject before copying any excess incoming chunk.
  const input = Buffer.alloc(MAX_JSON_BYTES);
  let length = 0;
  let ended = false;
  const timer = setTimeout(() => fail(), 70000);
  function fail() {
    if (ended) return;
    ended = true;
    clearTimeout(timer);
    process.stderr.write('Approved-main snapshot contract refused\n');
    process.exitCode = 1;
    process.stdin.destroy();
  }
  process.stdin.on('data', chunk => {
    if (ended) return;
    if (!Buffer.isBuffer(chunk) || chunk.length > MAX_JSON_BYTES - length) return fail();
    chunk.copy(input, length);
    length += chunk.length;
  });
  process.stdin.on('error', fail);
  process.stdin.on('end', () => {
    if (ended) return;
    try {
      const result = decodeMainSnapshot(input.subarray(0, length));
      ended = true;
      clearTimeout(timer);
      process.stdout.write(JSON.stringify({schema: 1, repository: 'mercurym4/practice-perfect',
        baseline_commit: result.commit, baseline_tree: result.tree,
        selected_inventory_sha256: result.selectedInventorySha256,
        source: 'literal-local-git-objects', file_count: result.fileCount,
        total_bytes: result.totalBytes, bridge_verified: true,
        renderer_verified: false, visual_acceptance: false, deployment_verified: false}) + '\n');
    } catch { fail(); }
  });
}

