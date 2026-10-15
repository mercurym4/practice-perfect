# Services geometry/accessibility repair — PP-WEB-44

This is a targeted design-preservation repair, not a redesign. Practice Perfect remains unpublished pending current approval.

## Observed failure and source cause

Current-head hosted run46, [38715816887](https://github.com/mercurym4/practice-perfect/actions/runs/38715816887), compared literal approved main `86894c29c5d02baad35b3cc47815d2d0ec06315e` to candidate `5632c0a8e7977c0480789bb7dae4f4bc338a7eb1`. Home390 and1440 first-capture pairs passed; the first Services390 comparison failed. The original main/candidate PNGs were preserved. Their reported dimensions were390×3303 and390×3323. Every non-logo image was20px lower in the candidate. The approved SVG source and natural dimensions225×150 were identical, but the candidate logo rectangle was145×160 versus main145×96.65625.

Actual Services HTML loads only its dedicated `services-reference.css` plus Google Inter, not shared `styles.css`. The accessibility work added a first-body skip link, but its hiding/focus/reduced-motion CSS existed only in `styles.css`; the skip link was therefore visible in normal flow and added the observed20px. Image-dimension work also added width240/height160 attributes. Services' dedicated `.brand img` rules set width176/mobile145 without `height:auto`, so HTML height160 overrode the earlier natural aspect-ratio height.

## Bounded repair

Append only to `services-reference.css`:

1. `.services-reference .brand img{height:auto}` preserves the approved logo asset, intrinsic dimension attributes and all existing responsive widths. It restores natural aspect ratio instead of stretching the image to its HTML height.
2. Copy the existing canonical skip-link normal, focus and reduced-motion rules byte-for-byte from shared `styles.css`. Fixed positioning removes it from normal flow; the offscreen transform hides it until focused. It remains a keyboard-accessible link, becomes visible with outline on focus, and has no transition under reduced motion.

All16,349 previous stylesheet bytes retain Git blob identity `4a696ef68df2aaa7509deb89b1962eba303cebf8`. No HTML, fonts, imagery, copy, pricing, color palette, spacing, cards, mountain CTA, routes, API, Vercel or provider configuration is changed. No `!important`, extra width, masking or pixel tolerance is introduced.

## Verification and evidence boundaries

`tests/test_services_design_preservation.py` validates the actual loaded stylesheet and canonical shared rules, historical prefix identity, Services skip-link/main semantics and intrinsic logo attributes. Negative cases reject the unpatched source, prefix design changes, truncated/duplicate suffixes, late overrides, flow-visible skip links, forced logo height, broken focus/reduced-motion behavior and canonical CSS drift. These source tests do not establish rendered pixel equality.

The old phase6 migration guard pins a historical CSS reconstruction. At integration, retain all historical constants and assertions, but project out only this exact reviewed appendix after validating its bytes and complete prior-prefix identity; do not remove arbitrary CSS or replace historical pins. Existing migration browser fixtures reconstruct their baseline from candidate source and would retain the new appendix on both sides. They therefore cannot independently qualify this repair. The literal-main harness must remain untouched and require exact first PNG/geometry/image-choice equality against fixed approved Git objects on the next matching-head hosted run. Keep all first failure images, no unchanged retries, capture selection, tolerance, deletion or budget increase.

Original evidence ZIP artifact11961899011: SHA256 `1673888c8329758079079cc3ad28d17579a7b9bc37ddc4f09f468ea7d31d686f`. Its literal results JSON SHA256 `26c63a03ed650d7314f0d83fb15be59d66a484fcb077fff74cea7b27f7847ef6`. Services390 main PNG SHA256 `78a48144bb188ac955a6057134fb81d0ea4f231e7f058e6d4cd13ff78a152685`; candidate PNG `31014315c5970ac936b72e63edddae6e373c62f4a7cfb9899b14c57beb1bf9dc`. Evidence describes the original failure, not proof the repair already passed.
