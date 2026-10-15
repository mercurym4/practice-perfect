'use strict';
const { createHash } = require('node:crypto');

// Diagnostic samples never replace the original screenshot or acceptance hash.
// Native screenshot timeouts are awaited sequentially: no background race/retry.
async function collectPartnerCaptureSamples({ selector, originalSha256, capture, describe, shouldStop = () => false }) {
  if (selector !== '.partner-panel') return null;
  const evidence = { originalSha256, samples: [] };
  const images = [];
  for (let index = 1; index <= 2; index++) {
    if (shouldStop()) { evidence.stopped = true; break; }
    try {
      const before = await describe();
      if (shouldStop()) { evidence.stopped = true; break; }
      const image = await capture({ animations: 'disabled', timeout: 1000 });
      if (shouldStop()) { evidence.stopped = true; break; }
      const after = await describe();
      const sha256 = createHash('sha256').update(image).digest('hex');
      evidence.samples.push({ index, available: true, sha256, matchesOriginal: sha256 === originalSha256, before, after });
      images.push({ index, image });
    } catch (error) {
      evidence.samples.push({ index, available: false, error: String(error?.message ?? error) });
      break;
    }
  }
  return { evidence, images };
}

module.exports = { collectPartnerCaptureSamples };
