# Practice Perfect measurement setup

Updated October 6, 2026 (America/Chicago).

## Confirmed

- Vercel Web Analytics activated and redeployed. Browser visits to Home and Services were recorded as one visitor and two page views.
- Tracking loads on practiceperfect.us only; previews and local traffic are excluded. Query strings and fragments are removed. Form values are not sent.
- Google Search Console URL-prefix property verified using the exact homepage verification tag.
- Sitemap submission accepted. Google's live URL test confirmed access to both sitemap.xml and the homepage.
- Homepage indexing request accepted into Google's crawl queue.
- Contact email delivery confirmed by the user.

## Pending

- Sitemaps report last showed Could not fetch despite a successful live access test. Successful sitemap processing is not yet confirmed.
- Actual homepage and other-page indexing is not confirmed. An accepted request does not establish indexing or rankings.
- strategy_call_sent instrumentation executes only after a successful API response with a provider ID and deduplicates IDs per page. Actual custom-event collection is unverified; a supported paid plan may be required. No plan upgrade authorized.
- Search query, ranking, and conversion baselines need real dashboard data as traffic develops.

## Tracking implementation — October 7, 2026

Added delegated service_clicked events with an allowlisted service slug and strategy_call_clicked events with header/footer/content placement. No link text, query values, fragments, contact values, or email-provider IDs are sent as custom properties. Existing strategy_call_sent fires only after an accepted API response with a provider ID and deduplicates that ID per page; the ID is not sent to analytics. Tests verify production-host restriction, sensitive URL stripping, event allowlists, duplicate accepted responses, failed responses, and measurement failure isolation. Live custom-event collection remains pending verification. Do not submit a fabricated lead or send an unsolicited test email just to create a conversion event.
