# Practice Perfect Image Asset Audit

Updated: 2026-09-10

## Scope reviewed

- Home
- Services
- What We Fix
- Our System
- About
- Pricing
- Contact
- Shared stylesheet imagery
- Header/footer branding
- Inline vector charts and service icons

## Reference audit

All raster/logo file references in the active HTML/CSS have been migrated to `/assets/library/`. The website no longer depends on temporary chat URLs or scattered legacy image paths for active references.

| Asset | Canonical website path | Type | Current usage | Reference status |
|---|---|---|---|---|
| Practice Perfect logo | `/assets/library/logos/practice-perfect-logo.svg` | Vector SVG | Header + footer | PASS |
| Boardroom hero | `/assets/library/heroes/practice-perfect-boardroom-hero.webp` | Raster WebP | Hero/banner sections | PASS |
| Analytics workspace | `/assets/library/general/practice-perfect-analytics-workspace.webp` | Raster WebP | Services + supporting sections | PASS |
| Performance dashboard | `/assets/library/general/practice-perfect-performance-dashboard.webp` | Raster WebP | Our System + What We Fix | PASS |

## Quality audit

- Logo: vector source; safe at all display sizes.
- Inline service icons: vector; no raster pixelation risk.
- Homepage chart: inline vector; no raster pixelation risk.
- Raster photography/dashboard artwork: approved compositions are now cataloged and high-resolution source masters have been preserved separately so future optimized derivatives can be regenerated instead of repeatedly recompressing an already compressed web file.
- Do not upscale any web derivative. If a larger placement is introduced, regenerate from the corresponding master.

## Page mapping

### Home
- Brand logo
- Boardroom hero through shared stylesheet
- Inline vector performance chart

### Services
- Brand logo
- Boardroom hero
- Analytics workspace
- Inline vector service icons

### What We Fix
- Brand logo
- Boardroom hero
- Analytics workspace
- Performance dashboard

### Our System
- Brand logo
- Analytics workspace
- Performance dashboard
- Boardroom hero

### About
- Brand logo
- Boardroom hero
- CSS-rendered dashboard component

### Pricing
- Brand logo
- Boardroom hero
- CSS-rendered dashboard component

### Contact
- Brand logo
- Analytics workspace

## Ongoing rule

Every new approved raster image must have a retained high-resolution master and a separately generated web derivative. Add the asset to `manifest.json` before referencing it on a page.
