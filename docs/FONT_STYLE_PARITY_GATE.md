# Actual-font style migration parity

This independent protected-draft Chromium gate compares the four PP-WEB-14 targets across the established 12 widths (320, 390, 640, 641, 650, 651, 768, 980, 981, 1440, 1700 and 2560 pixels), producing 48 exact computed-style/rectangle/target-PNG comparisons. Before/after PNG hashes must be identical; thresholds are not relaxed.

The reviewed baseline changes only the four former inline declarations and their three migrated CSS rules. It restores the correct Response Standards grid on What We Fix. Both baseline and candidate retain the same current Google Fonts request topology and all unrelated candidate changes. Therefore the gate verifies the inline-style migration with real fonts; it does not compare against historical pre-font-consolidation source.

Before every snapshot, each page explicitly loads Inter normal weights 400/500/600/700/800 and DM Serif Display normal 400 with a Latin sample. Nonempty actual FontFace results must have matching family, normal style, matching weight descriptor/range and loaded status. All four target pages request both families. Evidence contains 96 before/after readiness sets and 96 target PNGs plus JSON, exact head and Chromium version.

Only reviewed HTTPS GET Google Fonts stylesheet/font requests are admitted externally; analytics/contact-form scripts are inert. HTTP errors, failed requests or unexpected external dependencies fail acceptance. Successful Google CSS/font responses are required. Existing fallback-font visual/keyboard/menu gates and all-page font readiness remain unchanged.

This is scoped Chromium target parity, not whole-page or historical font-topology parity, exact glyph selection for every element, complete Unicode/italic coverage, measured network/performance/FCP/LCP improvement, production headers/firewall, physical-device behavior or publication. Wait for matching-head CI and inspect actual evidence before accepting the gate. No HTML/CSS/design/content, deployment or publication change is introduced.
