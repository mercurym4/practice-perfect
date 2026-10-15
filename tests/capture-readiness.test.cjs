'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { waitForCaptureReady, captureDiagnostics } = require('./capture-readiness.cjs');

function fixture(options = {}) {
  const events = [];
  const pendingFrames = [];
  class Image {
    constructor() {
      this.complete = true; this.currentSrc = '/pinned.png';
      this.naturalWidth = 32; this.naturalHeight = 24; this.handlers = new Map();
    }
    querySelectorAll() { return []; }
    addEventListener(name, fn) { this.handlers.set(name, fn); }
    removeEventListener(name) { this.handlers.delete(name); }
    scrollIntoView() { events.push('scroll-image'); if (options.onScroll) options.onScroll(this); }
    async decode() { events.push('decode'); if (options.decodeError) throw new Error('decode rejected'); }
  }
  const image = new Image();
  if (options.image) Object.assign(image, options.image);
  const target = options.rootImage ? image : { querySelectorAll: () => options.noImages ? [] : [image] };
  const document = { querySelector: () => options.missing ? null : target,
    fonts: options.noFonts ? undefined : { status: options.fontStatus || 'loaded', ready: options.fonts || Promise.resolve() } };
  const context = vm.createContext({ document, HTMLImageElement: Image,
    window: { scrollX: 11, scrollY: 22, scrollTo(x, y) { events.push(`restore:${x},${y}`); } },
    requestAnimationFrame(fn) { events.push('frame'); if (!options.stalledFrames) queueMicrotask(fn); else pendingFrames.push(fn); }, setTimeout, clearTimeout });
  const run = args => vm.runInContext(`(${waitForCaptureReady.toString()})`, context)(args || { timeoutMs: 50 });
  return { run, image, events, pendingFrames };
}
test('serialized page function waits for fonts, decodes, restores scroll, then two frames', async () => {
  let ready;
  const f = fixture({ fonts: new Promise(r => { ready = r; }) });
  const result = f.run();
  await Promise.resolve(); assert.deepEqual(f.events, []);
  ready();
  const evidence = await result;
  assert.equal(evidence.decodedImages, 1); assert.equal(evidence.animationFrames, 2);
  assert.deepEqual(f.events, ['decode', 'restore:11,22', 'frame', 'frame']);
});
test('root image itself is decoded, not silently omitted', async () => {
  const f = fixture({ rootImage: true }); assert.equal((await f.run()).decodedImages, 1);
});
test('non-image target without descendant images still waits for two frames', async () => {
  const f = fixture({ noImages: true }); assert.equal((await f.run()).decodedImages, 0);
  assert.equal(f.events.filter(e => e === 'frame').length, 2);
});
test('pending lazy image is awaited and its listeners cleaned up', async () => {
  const f = fixture({ image: { complete: false }, onScroll(image) { queueMicrotask(() => { image.complete = true; image.handlers.get('load')(); }); } });
  await f.run(); assert.equal(f.image.handlers.size, 0);
  assert.equal(f.events[0], 'scroll-image'); assert.equal(f.events[1], 'decode');
});
test('missing target fails closed', async () => { await assert.rejects(fixture({ missing: true }).run(), /target missing/); });
test('unavailable font API fails closed', async () => { await assert.rejects(fixture({ noFonts: true }).run(), /Font readiness unavailable/); });
test('rejected fonts fail closed before image decode', async () => {
  const f = fixture({ fonts: Promise.reject(new Error('font rejected')) });
  await assert.rejects(f.run(), /font rejected/); assert.deepEqual(f.events, []);
});
test('font ready with loading status fails closed', async () => { await assert.rejects(fixture({ fontStatus: 'loading' }).run(), /Fonts are not loaded/); });
test('missing image current source fails closed', async () => { await assert.rejects(fixture({ image: { currentSrc: '' } }).run(), /missing or broken/); });
test('broken image width or height fails closed', async () => {
  for (const image of [{ naturalWidth: 0 }, { naturalHeight: 0 }]) await assert.rejects(fixture({ image }).run(), /missing or broken/);
});
test('missing decode API fails closed', async () => { await assert.rejects(fixture({ image: { decode: undefined } }).run(), /decode unavailable/); });
test('rejected image decode fails closed', async () => { await assert.rejects(fixture({ decodeError: true }).run(), /decode rejected/); });
test('image load error fails closed and cleans listeners', async () => {
  const f = fixture({ image: { complete: false }, onScroll(image) { queueMicrotask(() => image.handlers.get('error')()); } });
  await assert.rejects(f.run(), /failed to load/); assert.equal(f.image.handlers.size, 0);
});
test('stalled fonts and image decode time out with no frame acceptance', async () => {
  for (const options of [{ fonts: new Promise(() => {}) }, { image: { decode: () => new Promise(() => {}) } }]) {
    const f = fixture(options); await assert.rejects(f.run({ timeoutMs: 10 }), /timed out/);
    assert.equal(f.events.includes('frame'), false);
  }
});
test('stalled lazy image times out, removes listeners and restores original scroll', async () => {
  const f = fixture({ image: { complete: false } });
  await assert.rejects(f.run({ timeoutMs: 10 }), /timed out/);
  assert.equal(f.image.handlers.size, 0); assert.equal(f.events.at(-1), 'restore:11,22');
});
test('late font settlement after timeout cannot start decode or frames', async () => {
  let ready;
  const f = fixture({ fonts: new Promise(r => { ready = r; }) });
  await assert.rejects(f.run({ timeoutMs: 10 }), /timed out/); ready();
  await new Promise(r => setImmediate(r)); assert.deepEqual(f.events, []);
});
test('invalid deadline fails closed', async () => {
  for (const timeoutMs of [0, -1, Infinity, NaN]) await assert.rejects(fixture().run({ timeoutMs }), /Invalid/);
});
test('stalled animation frames fail within the same total deadline', async () => {
  const f = fixture({ stalledFrames: true }); await assert.rejects(f.run({ timeoutMs: 10 }), /timed out/);
  const atTimeout = [...f.events];
  for (const callback of f.pendingFrames) callback();
  await new Promise(r => setImmediate(r)); assert.deepEqual(f.events, atTimeout);
});
test('late decode settlement after timeout cannot start frames', async () => {
  let decoded;
  const f = fixture({ image: { decode: () => new Promise(r => { decoded = r; }) } });
  await assert.rejects(f.run({ timeoutMs: 10 }), /timed out/);
  const atTimeout = [...f.events];
  assert.deepEqual(atTimeout, ['restore:11,22']);
  decoded();
  await new Promise(r => setImmediate(r)); assert.deepEqual(f.events, atTimeout);
});
test('serialized diagnostics retain bounds and image source without form/text values', () => {
  class Image {}
  const image = Object.assign(new Image(), { tagName: 'IMG', currentSrc: '/pinned.png', complete: true,
    naturalWidth: 22, naturalHeight: 33, loading: 'lazy', value: 'private-value', textContent: 'private-text',
    querySelectorAll: () => [], getBoundingClientRect: () => ({ x: 1, y: 2, width: 22, height: 33 }) });
  const context = vm.createContext({ document: { querySelector: () => image, fonts: { status: 'loaded' } },
    HTMLImageElement: Image, window: { scrollX: 3, scrollY: 4, devicePixelRatio: 1, innerWidth: 800, innerHeight: 600 },
    getComputedStyle: () => ({ getPropertyValue: key => key === 'display' ? 'block' : '' }) });
  const result = vm.runInContext(`(${captureDiagnostics.toString()})`, context)('img');
  assert.equal(result.elements[0].image.currentSrc, '/pinned.png');
  assert.equal(result.elements[0].rect.width, 22); assert.equal(result.scroll.y, 4);
  assert.doesNotMatch(JSON.stringify(result), /private-value|private-text/);
});
