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
