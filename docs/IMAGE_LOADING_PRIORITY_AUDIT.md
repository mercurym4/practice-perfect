# Public image loading-priority audit

Scope: the 27 public pages enumerated by `sitemap.xml` at protected draft head
`5458131eaa6317fe76a7f12d7494336cd4bb57e1`.

## Result

- Six reviewed above-the-fold hero images use `fetchpriority="high"` and
  `decoding="async"`, without lazy loading: Home, Services, About, Our System,
  Pricing, and What We Fix.
- Five reviewed below-the-fold images retain `loading="lazy"` with
  `decoding="async"`: the two growth-dashboard occurrences, two mountain CTA
  occurrences, and the Services monitor image.
- All 53 shared logo occurrences remain non-lazy and neutral priority. The
  browser can request the header logo normally, while repeated footer use can
  reuse the same asset without assigning additional high-priority fetches.
- No CSS, dimensions, source URLs, `srcset`, `sizes`, alt text, copy, layout,
  JavaScript, analytics, forms, or publication configuration changed.

## Verification contract

`tests/test_image_loading_priority.py` reads the sitemap-defined public set and
fails if a high-priority or lazy image is added outside the reviewed inventory,
if a high-priority image is also lazy, if a lazy image is marked high priority,
if reviewed hero/lazy images lose asynchronous decoding, or if logo loading is
deferred or promoted.

This establishes source-level loading intent. It does not prove LCP, network
waterfalls, decoded-pixel timing, responsive crop behavior, or visual parity.
Those require an exact-draft browser target. The authenticated Vercel project
reported zero deployments for `internal-website-source-audit`; no deployment
was created because publication approval remains held.
