# Public image intrinsic-dimension audit

Scope: the 27 sitemap-defined public pages on protected draft PR #2. Private templates, inline SVG icons and CSS background images are outside this bounded change.

The source audit found 64 `<img>` occurrences. Seven already had dimensions; 57 lacked both attributes. The missing occurrences reduce to five assets:

| Asset | Occurrences | Verified dimensions |
| --- | ---: | ---: |
| `/assets/library/logos/practice-perfect-logo.svg` | 53 | 240 × 160 |
| `/assets/library/about/leadership-workshop.webp` | 1 | 1448 × 1086 |
| `/assets/library/general/practice-perfect-analytics-workspace.webp` | 1 | 1440 × 1080 |
| `/assets/library/pricing/scalable-growth-path.webp` | 1 | 1672 × 941 |
| `/assets/library/what-we-fix/revenue-diagnostics.webp` | 1 | 1440 × 1080 |

The raster dimensions are corroborated by the exact-head asset manifest or identical repository blob and by the canonical deployment's natural image dimensions. The logo's exact source declares `viewBox="0 0 240 160"` and embeds 240 × 160 artwork; the attributes use that source coordinate system rather than a CSS-rendered header or footer size.

The change adds only matching positive integer `width` and `height` attributes. It does not alter image sources, alt text, classes, loading behavior, CSS, copy or page structure. Existing responsive CSS remains authoritative, including the four hero images' `object-fit` behavior. Source tests enforce all 64 occurrences and the reviewed source-keyed registry. Browser viewport and crop parity remain a separate pre-publication gate.
