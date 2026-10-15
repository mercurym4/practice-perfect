# Public font loading audit

Baseline review head: `4af7aecd748754123b83db6a8e17144b8b09e74b`.

## Finding

All 27 sitemap pages already preconnect to `fonts.googleapis.com` and `fonts.gstatic.com`, with `crossorigin` on the font-file origin. Each page directly requests the Inter family with `display=swap`.

The shared `styles.css` also imported DM Serif Display. That import was discovered only after the shared stylesheet downloaded and parsed, creating a serial stylesheet dependency on pages that still render DM Serif. Most pages override the shared serif headings with Inter and do not need the second family.

## Accepted source change

- Removed the Google Fonts `@import` from `styles.css`.
- Combined DM Serif Display and the existing Inter weights into the one existing Google Fonts stylesheet request on the five reviewed pages that retain DM Serif usage:
  - `about.html`
  - `contact.html`
  - `our-system.html`
  - `pricing.html`
  - `what-we-fix.html`
- Kept the other 22 public pages on the existing Inter-only request.
- Preserved both preconnects, `display=swap`, local stylesheet order, font-family stacks, weights, copy, layout, images, scripts and analytics.

Google's CSS2 API documents multiple families as repeated `family=` parameters and the `display` parameter: https://developers.google.com/fonts/docs/css2

No DNS-prefetch, CSS preload or generated font-file preload was added. Preconnect already covers the origin setup; the linked CSS is already discovered in the document head; generated font-file URLs may vary by browser format and subset.

## Regression contract

`tests/test_font_loading.py` requires:

1. exactly 27 sitemap pages;
2. exactly one reviewed Google Fonts stylesheet per page;
3. the exact five-page combined-family and 22-page Inter-only mapping;
4. one preconnect to each font origin before the stylesheet, with `crossorigin` on `fonts.gstatic.com`; and
5. no Google Fonts `@import` in repository CSS.

## Evidence limits

This is source-level request-topology evidence. It does not establish a measured waterfall, FCP/LCP improvement, cache behavior, FOIT/FOUT, computed-font parity or screenshot parity. Those remain browser publication gates.
