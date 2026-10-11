# Practice Perfect source audit

Proposed repository locations: `scripts/audit_public_site.py` and `tests/test_public_site_audit.py`. No third-party dependencies; Python 3. Run from a repository checkout:

```sh
python3 scripts/audit_public_site.py .
```

The script reads local files, emits JSON, and exits 0 for acceptance or 1 for concrete defects. It makes no network calls and changes no files. Checks cover the production sitemap, canonical URLs, titles/descriptions/H1, HTML robots directives, JSON-LD syntax, local asset existence, internal links and fragments, private-path links, duplicate IDs and orphan pages. Internal `docs`, `tests`, `scripts`, `preview`, Markdown, and `services-green` pages are excluded from the public-page inventory.

This is a repository-source check. It does not verify rendered layout, response headers, live redirects, deployment exclusions/firewall state, historical deployments, Google Search Console coverage, actual indexing, or contact delivery. It is tailored to the current static clean-URL structure; update the checker deliberately if that structure changes. Deployment privacy still requires live excluded-path checks.

Review fixture provenance: fresh GitHub main commit `86894c29c5d02baad35b3cc47815d2d0ec06315e`; 27 public HTML bodies and configuration files fetched via the GitHub connector. Asset files in `site-fixture` are empty existence placeholders generated from that commit's repository tree; their bytes are not validated. They should not be committed as site content. Mutation tests use temporary copies only:

```sh
python3 -m unittest discover -s tests -p test_public_site_audit.py -v
```

The tests generate a tiny original three-page website in a temporary directory. They have no production-site or scratch-fixture dependency. They verify baseline acceptance and detection of broken anchors, wrong canonicals and sitemap omissions, plus HTML-file alias fragments, self-link-only orphan discovery, and outside-root path/symlink guards. The earlier production-source fixture remains separate verification evidence only.

The review script, self-contained tests and usage note may be moved to an isolated review branch. No main commit, deployment, or publication has been performed.

## Live canonical audit

`scripts/audit_live_site.py` performs read-only GET requests against the canonical
production domain. It reads robots.txt and sitemap.xml, verifies every sitemap page
returns indexable HTML with an exact self-canonical, and verifies seven known internal
repository paths return 404 or 410. It inventories four browser security headers as
warnings so missing coverage is visible without confusing hardening advice with an
indexing/privacy failure. It never submits the contact form, changes configuration,
writes files, or follows historical deployment URLs.

Run the original four-case behavior suite and the live audit with:

```sh
python3 -m unittest discover -s tests -p test_audit_live_site.py -v
python3 scripts/audit_live_site.py
```

The pull-request workflow runs both commands after the source audit. A passing result
establishes only the live canonical responses observed during that run. It does not
establish Vercel firewall rule state/log matches, historical-deployment privacy,
Google Search Console indexing, visual acceptance, form delivery, or analytics event
collection.

The first live run found HSTS on all 27 pages but no Content-Security-Policy,
X-Content-Type-Options, or Referrer-Policy headers. This draft proposes the two
low-risk global headers `X-Content-Type-Options: nosniff` and
`Referrer-Policy: strict-origin-when-cross-origin`, with a repository test that also
retains the branch deployment guard. CSP remains an explicit follow-on: inventory
inline/external scripts and analytics first so a policy does not silently break the
site. Because this branch cannot auto-deploy, the live audit will continue reporting
production's missing headers until publication is separately approved and verified.

## Content Security Policy inventory

`scripts/inventory_csp.py` inventories active origins, inline executable scripts,
inline style blocks/attributes, event-handler attributes, CSS URLs and same-origin
fetch/beacon calls across the public source. Unexpected external active origins or
inline event handlers fail the audit. The generated JSON includes SHA-256 hashes for
each distinct inline executable script and style block plus a staged report-only
policy. Three original fixture tests prove the detector accepts the expected
same-origin/Google Fonts pattern and rejects a third-party script or inline handler.

The proposed first-stage policy intentionally uses `unsafe-inline` for script/style
and has no reporting endpoint. It is an inventory baseline, not an enforcing policy
and not telemetry. The tightening path is: move repeated executable inline code to
versioned local files, move inline style blocks/attributes into existing CSS, replace
`unsafe-inline` with reviewed hashes or nonces, add an approved report destination,
observe violations, then separately approve enforcement. Do not publish or enforce a
CSP from this review branch.

The draft `vercel.json` now carries that exact baseline as
`Content-Security-Policy-Report-Only`, without `report-uri` or `report-to`.
It cannot block resources and sends no violation data. Publication remains held;
after an approved deployment, browser-console inspection is still required before
adding telemetry or converting it to enforcing `Content-Security-Policy`.
