# Local browser publication gates

This protected draft adds a non-publishing Chromium verification route for PP-WEB-14 and PP-WEB-15. It serves the exact checkout on loopback only and never submits contact forms or deploys to Vercel. External requests are blocked; analytics and form scripts are inert in this harness.

The baseline reconstructs only the four former inline declarations plus the phase-3 Contact, audit-link and seven service-anchor blocks, and removes their migrated stylesheet rules. Everything else comes from the same candidate source. Assertions require 192 identical computed-style/geometry and target-pixel comparisons across 12 widths (320 through 2560 px), including audit-link keyboard-focus parity and every service anchor target; keyboard skip-link behavior on all 27 pages at 390 and 1280 px (first Tab, Enter to main, next Tab within main); and menu open/Escape/desktop-resize closure on Home, Services and Contact.

Baseline transformations fail if the expected exact source is absent or duplicated. Local HTTP asset errors fail acceptance. Before/after target PNGs and JSON are kept outside the served project and uploaded as seven-day private Actions evidence. The workflow pins Playwright 1.62.1 and installs matching Chromium using the official documented CI flow: https://playwright.dev/docs/ci .

This does not establish real Google Fonts rendering, image-selection or whole-page pixel parity, production headers/firewall, Search Console, real conversions, Safari/Firefox/device behavior or approved publication. External fonts are blocked for deterministic fallback-font comparisons. PR #2 remains draft, unmerged and excluded from deployment. Current-head CI must pass before accepting any browser result.
