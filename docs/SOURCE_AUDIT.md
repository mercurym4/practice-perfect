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

## Review branch deployment guard

The review branch `internal-website-source-audit` sets `git.deploymentEnabled` false for that exact branch in vercel.json before its first push. Other branches keep their existing deployment behavior. This prevents automatic Git-triggered deployment of this review branch per https://vercel.com/docs/project-configuration/git-configuration . Main merge and website publication remain separate approval gates; this branch must not be merged without that approval.
