'use strict';
// Pure policy. Importing this file does not open files, subprocesses, sockets or browsers.
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const WIDTHS = Object.freeze([390, 1440]);
const SERIF_ROUTES = Object.freeze(['/about', '/contact', '/our-system', '/pricing', '/what-we-fix']);
const MAX_JSON_BYTES = 1024 * 1024;
const MAX_EVIDENCE_BYTES = 64 * 1024 * 1024;
function sourceCommit(value) {
  assert.equal(typeof value, 'string'); assert.equal(value.length, 40); assert.match(value, /^[0-9a-f]{40}$/); return value;
}
function exporterArguments(kind, commit) {
  if (kind === 'main') return Object.freeze(['scripts/export_main_snapshot.py', '--repository', '.pp-approved-main']);
  assert.equal(kind, 'candidate');
  return Object.freeze(['scripts/export_candidate_snapshot.py', '--repository', '.', '--commit', sourceCommit(commit)]);
}
class Deadline {
  constructor(milliseconds = 420000, now = () => performance.now()) {
    assert.ok(Number.isFinite(milliseconds) && milliseconds > 0 && milliseconds <= 420000);
    this.now = now; this.end = now() + milliseconds;
  }
  remaining(cap = 420000) {
    const left = Math.floor(this.end - this.now());
    assert.ok(left > 0, 'Literal-main global deadline expired');
    return Math.min(left, cap);
  }
}
class EvidenceBudget {
  constructor(maximum = MAX_EVIDENCE_BYTES) { this.maximum = maximum; this.used = 0; this.pending = new Set(); this.files = 0; }
  reserve(bytes) {
    assert.ok(Number.isSafeInteger(bytes) && bytes > 0 && bytes <= this.maximum - this.used, 'Evidence byte budget exceeded');
    assert.ok(this.files < 109, 'Evidence file budget exceeded');
    const token = Object.freeze({ bytes }); this.used += bytes; this.files++; this.pending.add(token); return token;
  }
  complete(token, actual) {
    assert.ok(this.pending.has(token), 'Evidence reservation missing');
    assert.ok(Number.isSafeInteger(actual) && actual >= 0 && actual <= token.bytes, 'Evidence reservation exceeded');
    this.pending.delete(token); this.used -= token.bytes - actual;
  }
}
function captureReservation(geometry) {
  const { width, height } = geometry.document;
  assert.ok(Number.isSafeInteger(width) && Number.isSafeInteger(height) && width > 0 && height > 0);
  assert.ok(width <= 2560 && height <= 12000 && width * height <= 12000000, 'Capture dimensions exceed budget');
  // Conservative lossless RGBA deflate allowance, independent of hoped-for PNG compression.
  return 5 * width * height + height + 1024 * 1024;
}
function sitemapRoutes(bytes, paths) {
  assert.ok(Buffer.isBuffer(bytes) && bytes.length <= 65536);
  const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const envelope = /^\s*<\?xml version="1\.0" encoding="UTF-8"\?>\s*<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">([\s\S]*)<\/urlset>\s*$/;
  const match = envelope.exec(source); assert.ok(match, 'Sitemap envelope refused');
  const routes = []; let rest = match[1];
  rest = rest.replace(/<url><loc>(https:\/\/practiceperfect\.us\/(?:[a-z0-9-]+(?:\/[a-z0-9-]+)?)?)<\/loc><\/url>/g, (_, value) => {
    const url = new URL(value); routes.push(url.pathname); return '';
  });
  assert.equal(rest.trim(), '', 'Sitemap unsupported content');
  assert.equal(routes.length, 27); assert.equal(new Set(routes).size, 27);
  const actual = routes.map(route => route === '/' ? 'index.html' : route.slice(1) + '.html').sort();
  assert.deepEqual(actual, paths.filter(value => value.endsWith('.html')).sort());
  for (const route of SERIF_ROUTES) assert.ok(routes.includes(route));
  return Object.freeze(routes);
}
function externalKind(request) {
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  if (url.hostname === 'fonts.googleapis.com' && url.pathname === '/css2' && request.type === 'stylesheet') return 'stylesheet';
  if (url.hostname === 'fonts.gstatic.com' && request.type === 'font') return 'font';
  return null;
}
function normalizedImageUrl(value, origin) {
  const url = new URL(value, origin);
  assert.equal(url.origin, origin, 'Image outside admitted origin');
  assert.equal(url.hash, ''); assert.equal(url.username, ''); assert.equal(url.password, '');
  return url.pathname + url.search;
}
function normalizeGeometry(geometry, origin) {
  assert.ok(Array.isArray(geometry.images) && geometry.images.length <= 100);
  return { ...geometry, images: geometry.images.map(image => ({ ...image,
    currentSrc: normalizedImageUrl(image.currentSrc, origin) })) };
}
function pngDimensions(bytes) {
  assert.ok(Buffer.isBuffer(bytes) && bytes.length >= 33 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])));
  assert.equal(bytes.toString('ascii', 12, 16), 'IHDR');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}
function requireCaptureDimensions(actual, geometry) {
  assert.deepEqual(actual, geometry.document, 'Full-page capture dimensions must exactly match admitted geometry');
  captureReservation({ document:actual });
}
function firstPairEvidence(mainBytes, candidateBytes, mainName, candidateName) {
  assert.ok(Buffer.isBuffer(mainBytes) && Buffer.isBuffer(candidateBytes));
  assert.equal(typeof mainName, 'string'); assert.equal(typeof candidateName, 'string');
  const match = /^(\d{2}-(?:390|1440))-main\.png$/.exec(mainName);
  assert.ok(match && mainName.length === match[0].length, 'Invalid first-pair main filename');
  assert.equal(candidateName, `${match[1]}-candidate.png`, 'Evidence must remain within one first-capture pair');
  return Object.freeze(mainBytes.equals(candidateBytes)
    ? { evidenceFile:mainName, storage:'deduplicated-equal-first-capture' }
    : { evidenceFile:candidateName, storage:'original-first-capture' });
}
function requireFontChecks(checks, route) {
  const expected = [400,500,600,700,800].map(weight => ({ family:'Inter', weight }));
  if (SERIF_ROUTES.includes(route)) expected.push({ family:'DM Serif Display', weight:400 });
  assert.ok(Array.isArray(checks)); assert.equal(checks.length, expected.length);
  for (let n = 0; n < expected.length; n++) {
    const check = checks[n]; assert.equal(check.family, expected[n].family); assert.equal(check.weight, expected[n].weight);
    assert.ok(Array.isArray(check.faces) && check.faces.length > 0 && check.faces.length <= 16, 'Actual FontFace required');
    for (const face of check.faces) {
      assert.equal(face.family, check.family); assert.equal(face.status, 'loaded'); assert.equal(face.style, 'normal');
      assert.equal(typeof face.weight, 'string');
      const range = face.weight.split(/\s+/).map(Number);
      assert.ok(range.length >= 1 && range.length <= 2 && range.every(Number.isFinite));
      assert.ok(check.weight >= range[0] && check.weight <= range[range.length - 1]);
    }
  }
}
function requireCoverage(cases, routes) {
  assert.equal(cases.length, 54);
  const keys = cases.map(item => `${item.route}:${item.width}`);
  assert.equal(new Set(keys).size, 54);
  assert.deepEqual(keys.slice().sort(), routes.flatMap(route => WIDTHS.map(width => `${route}:${width}`)).sort());
  assert.ok(cases.every(item => item.passed === true), 'Incomplete literal-main parity');
}
module.exports = { WIDTHS, SERIF_ROUTES, MAX_JSON_BYTES, MAX_EVIDENCE_BYTES, sourceCommit, exporterArguments,
  Deadline, EvidenceBudget, captureReservation, sitemapRoutes, externalKind, normalizeGeometry, pngDimensions, requireCaptureDimensions, firstPairEvidence, requireFontChecks, requireCoverage };
