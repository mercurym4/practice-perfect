# CSP inline-dependency migration plan

Status: phases 1 and 2 implemented on the protected draft branch; no design, deployment, or publication change. Acceptance requires matching-head pull-request CI.

Source baseline: reviewed phase-1 parent `69bbffe24654be37d3aa31d9b7b9909735c2dc24`.
Exact-head evidence: use the pull-request workflow associated with the current branch head; do not count a superseded run.

## Objective

Remove executable inline JavaScript and inline CSS without changing rendered design,
responsive behavior, navigation behavior, content, analytics, or conversion flows.
Keep `Content-Security-Policy-Report-Only` non-enforcing until an approved deployment
has passed browser-console and visual comparison checks.

## Verified inventory

The reviewed pre-migration checkout contained:

- 27 executable inline-script occurrences with one fingerprint (phase 1 now externalized);
- 17 inline-style-block occurrences with 11 fingerprints;
- four `style`-attribute occurrences with three fingerprints (phase 2 now class-based); and
- zero inline event-handler attributes.

The CI inventory emits every path, source line, byte count, element name for style
attributes, and SHA-256 fingerprint under `inline_occurrence_groups`. The earlier
counts describe distinct fingerprints, not total occurrences. The 27 page-specific
`application/ld+json` blocks are structured data and are not executable JavaScript.

## Migration units

| Unit | Current scope | Purpose | Design-preserving target |
| --- | --- | --- | --- |
| Shared mobile menu | Identical 747-byte script on all 27 public pages | Toggle `body.menu-open`; update button ARIA; close on navigation, Escape, and resize above 980px | Copy byte-for-byte to `/mobile-menu.js`; replace each block at the same end-of-body position with `<script src="/mobile-menu.js"></script>`; do not add `async` or change execution order |
| Shared header sizing | Exact 239-byte block on `index`, `contact`, `our-system`, and `what-we-fix`; same rules prefix the About and Pricing blocks | 176px desktop / 145px at 640px logo plus flex sizing | Move exact rules to `enhancements.css`; preserve the 640px breakpoint and cascade position |
| About-only styles | `about.html` block after the shared header rules | Dashboard image containment and shadow | Page-scoped selectors in `enhancements.css` |
| Pricing-only styles | `pricing.html` block after the shared header rules | Hero height, cover image, overlay, chip stacking | `pricing-dashboard.css`, retaining last-equivalent cascade order; moving shared header rules earlier into `enhancements.css` requires explicit `.brand img` computed-style parity |
| Contact-only styles | `contact.html` second block | Hero/next-step height, spacing, overflow, and mobile adjustments | Page-scoped section in `enhancements.css` |
| Operating-flow styles | `our-system.html` second block | Full responsive presentation of `#growth-operating-flow` | Page-scoped section in `enhancements.css`; migrate only with viewport parity evidence |
| Audit-link styles | `what-we-fix.html` second block | Link appearance and keyboard focus | `enhancements.css`; move base and `:focus-visible` rules together |
| Service anchor offsets | Two `#acquisition-scope`, two `#marketing-scope`, two `#website-scope`, one `#sprint-scope` blocks | 94px sticky-header anchor offset | `service-detail.css`, retaining the four distinct ID selectors |
| Services page base | `services.html`, one 9,489-byte block | Entire Services layout, responsive rules, cards, process, CTA, footer, mobile navigation | New `/services-base.css` linked at the exact current block position before `services-reference.css` |
| Feature-grid spacing | `our-system.html` and `what-we-fix.html`: `margin-top:18px` | Space after section heading | Add semantic `feature-grid--spaced` class and matching `enhancements.css` rule |
| Contact eyebrow | `contact.html`: `color:#9bd08d` | Contrast over dark contact panel | `body:not(.services-page) .contact-panel .eyebrow` in `enhancements.css`; the extra existing scope is required to beat the branded eyebrow rule without `!important` |
| Pricing intro margin | `pricing.html`: `margin:0` | Remove inherited heading margin | `.pricing-intro .section-heading` in `pricing-dashboard.css` |

## Ordered implementation

1. **Implemented in the phase-1 candidate:** extracted only the shared mobile-menu script. All 27 pages reference the same synchronous same-origin asset at the former inline position; source and behavior tests require zero executable inline scripts, unchanged JSON-LD bodies, and preserved analytics/contact-form order.
2. **Implemented in the phase-2 candidate:** replaced all four style attributes with three narrowly scoped rules. The Contact rule deliberately extends the existing branded eyebrow selector with `.contact-panel`; the originally proposed shorter selector would lose the current cascade. Rules remain unconditional across the required viewports.
3. Move the small contact, audit-link, and service-anchor blocks into their existing
   stylesheets.
4. Consolidate the shared header rules without changing the 640px breakpoint or
   their cascade position; then move the About and Pricing additions.
5. Move `#growth-operating-flow` only after capturing narrow, tablet, and desktop
   baselines.
6. Extract the Services base block last, preserving its order before
   `services-reference.css`.
7. Treat the 27 inline JSON-LD data blocks as a separate CSP dependency. The current
   executable inventory intentionally excludes them, so zero executable blocks alone
   does not authorize removing `'unsafe-inline'` from `script-src`. Under report-only,
   verify target-browser behavior and retain `'unsafe-inline'` or add exact reviewed
   hashes/nonces until all JSON-LD remains available without violations.
8. Remove `'unsafe-inline'` from `style-src` only after the inventory reports zero
   style blocks and zero style attributes. Keep the policy report-only pending
   approved live validation.

Each phase is a separate reviewable commit. Stop at the first behavior, computed-style,
layout, accessibility, source-audit, or live-audit regression.

## Acceptance evidence required

- Source audit retains 27 pages, 668 internal links, 27 valid JSON-LD blocks, and
  zero errors. The verified pre-migration baseline is 177 local asset references;
  phase 1 expects 204 (27 new page references to one new file), and the asset must resolve.
- CSP inventory reports only expected same-origin/browser dependencies, the Resend
  origin remains server-only, and no inline event handlers appear.
- Mobile navigation opens and closes on button press, navigation, Escape, and resize;
  `aria-expanded` and the accessible button label remain correct.
- DOM/source-order assertion confirms the synchronous menu asset remains at the same
  end-of-body position, after deferred `analytics.js` and before deferred
  `contact-form.js` on `contact.html`; do not add `async`, `defer`, or module mode.
- Computed-style and screenshot parity at 320px, 390px, 640px, 641px, 650px, 651px,
  768px, 980px, 981px, 1440px, 1700px, and an ultrawide viewport for `index`,
  `about`, `pricing`, `contact`, `our-system`, `what-we-fix`, `services`, and a
  representative service page. Add a print-layout smoke check. Include keyboard
  focus on the audit context link and anchor-offset checks for each service scope.
- Contact form submission logic, analytics loading, canonicals, and metadata remain
  unchanged. Exact JSON-LD body hashes remain unchanged on all 27 pages and are
  checked separately under report-only CSP in target browsers.
- After separate publication approval: verify the deployed headers, inspect browser
  console violations, and confirm genuine analytics/form behavior before considering
  CSP enforcement or a reporting endpoint.

## Explicit non-goals

This plan does not authorize a redesign, copy/pricing changes, publication, CSP
enforcement, telemetry collection, contact-form submission, or Vercel firewall-rule
changes. It does not establish retained historical-deployment privacy, Search Console
indexing, or conversion collection.
