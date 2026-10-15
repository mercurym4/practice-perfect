'use strict';

// This function is serialized into the existing browser page. Keep it dependency-free.
async function waitForCaptureReady({ selector = 'body', timeoutMs = 10000 } = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Invalid capture readiness timeout');
  let timer;
  let expired = false;
  const cleanups = new Set();
  const active = () => { if (expired) throw new Error('Capture readiness expired'); };
  const work = async () => {
    const target = document.querySelector(selector);
    if (!target) throw new Error(`Capture target missing: ${selector}`);
    if (!document.fonts || !document.fonts.ready) throw new Error('Font readiness unavailable');
    await document.fonts.ready;
    active();
    if (document.fonts.status !== 'loaded') throw new Error('Fonts are not loaded');
    const images = [...(target instanceof HTMLImageElement ? [target] : []), ...target.querySelectorAll('img')];
    const originalScroll = { x: window.scrollX, y: window.scrollY };
    let scrollRestored = false;
    const restoreScroll = () => {
      if (scrollRestored) return;
      scrollRestored = true;
      window.scrollTo(originalScroll.x, originalScroll.y);
    };
    cleanups.add(restoreScroll);
    try {
      for (const image of images) {
        active();
        if (!image.complete) {
          await new Promise((resolve, reject) => {
            const cleanup = () => { image.removeEventListener('load', loaded); image.removeEventListener('error', failed); cleanups.delete(cleanup); };
            const loaded = () => { cleanup(); resolve(); };
            const failed = () => { cleanup(); reject(new Error('Capture image failed to load')); };
            image.addEventListener('load', loaded, { once: true });
            image.addEventListener('error', failed, { once: true });
            cleanups.add(cleanup);
            // Native lazy loading may require intersection. Preserve the viewport afterwards.
            image.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
            if (image.complete) loaded();
          });
        }
        active();
        if (!image.currentSrc || image.naturalWidth <= 0 || image.naturalHeight <= 0)
          throw new Error('Capture image missing or broken');
        if (typeof image.decode !== 'function') throw new Error('Image decode unavailable');
        await image.decode();
        active();
      }
    } finally {
      restoreScroll();
      cleanups.delete(restoreScroll);
    }
    await new Promise(resolve => requestAnimationFrame(() => {
      if (!expired) requestAnimationFrame(resolve);
    }));
    active();
    return { fonts: document.fonts.status, decodedImages: images.length, animationFrames: 2 };
  };
  try {
    return await Promise.race([work(), new Promise((_, reject) => {
      timer = setTimeout(() => { expired = true; reject(new Error(`Capture readiness timed out after ${timeoutMs}ms`)); }, timeoutMs);
    })]);
  } finally { clearTimeout(timer); for (const cleanup of cleanups) cleanup(); }
}

// No text, field values, cookies or storage are collected. Snapshot diagnostics are evidence only.
function captureDiagnostics(selector = 'body') {
  const target = document.querySelector(selector);
  if (!target) return { missing: true, selector };
  const nodes = [target, ...target.querySelectorAll('*')];
  const properties = ['display', 'position', 'overflow', 'opacity', 'transform', 'filter', 'border-radius',
    'background-color', 'background-image', 'object-fit', 'object-position', 'image-rendering', 'font-family', 'font-size'];
  return {
    selector, scroll: { x: window.scrollX, y: window.scrollY }, devicePixelRatio: window.devicePixelRatio,
    viewport: { width: window.innerWidth, height: window.innerHeight }, fonts: document.fonts?.status,
    nodeCount: nodes.length, truncated: nodes.length > 200,
    elements: nodes.slice(0, 200).map(el => {
      const css = getComputedStyle(el);
      return { tag: el.tagName, rect: JSON.parse(JSON.stringify(el.getBoundingClientRect())),
        styles: Object.fromEntries(properties.map(key => [key, css.getPropertyValue(key)])),
        ...(el instanceof HTMLImageElement ? { image: { currentSrc: el.currentSrc, complete: el.complete,
          naturalWidth: el.naturalWidth, naturalHeight: el.naturalHeight, loading: el.loading } } : {}) };
    })
  };
}

module.exports = { waitForCaptureReady, captureDiagnostics };
