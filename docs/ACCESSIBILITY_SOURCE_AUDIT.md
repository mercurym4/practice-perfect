# Accessibility source audit

## Scope

This check covers source-verifiable keyboard and semantic behavior across the 27 public HTML pages. It does not claim screen-reader, browser-focus, device, or visual acceptance.

## Implemented hardening

- The first focusable control on every page is one `Skip to main content` link.
- Every link targets one unique `main#main-content[tabindex="-1"]` after the repeated header/navigation.
- The skip link stays outside the normal visual layout until keyboard focus, then uses a high-contrast visible focus treatment. Reduced-motion preferences disable its transition.
- The 16 decorative SVGs on the Services landing page are excluded from the accessibility tree; adjacent visible labels and link names remain unchanged.

## Automated acceptance

`tests/test_accessibility_landmarks.py` verifies all 27 pages, exact skip-link placement and target wiring, main uniqueness, duplicate IDs, ARIA references, Services decorative SVG handling, and the visible-on-focus CSS contract.

## Required pre-publication check

Before publication, use a real browser keyboard session on the protected candidate to confirm that Tab reveals the skip link, Enter bypasses the repeated navigation and focus arrives at main content without a visible normal-state layout change. Do not infer this behavior from source tests alone.
