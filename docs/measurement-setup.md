# Practice Perfect measurement setup

Updated October 6, 2026.

## Prepared in the website

- Vercel page-view script loads on the permanent practiceperfect.us domain only. Preview and local traffic are excluded.
- Query strings and URL fragments are removed before analytics submission. Form field values are never sent.
- strategy_call_sent event runs only after the email API returns success and a provider request ID. Failed requests and honeypot responses do not count. Repeated provider IDs count once per page. Analytics errors do not affect the form success message.

## Requires account activation

- Enable Web Analytics in the Vercel Practice Perfect project, then redeploy. Confirm page views appear in the dashboard. Custom events require a supported Pro or Enterprise plan; do not upgrade without the user's authorization.
- Google Search Console requires user sign-in and property verification. Add https://practiceperfect.us/ as a URL-prefix property; obtain the HTML meta verification tag and add it to index.html, then verify. Submit https://practiceperfect.us/sitemap.xml.
- Do not claim tracking is collecting or Google verification/submission is complete until the dashboard confirms it.
