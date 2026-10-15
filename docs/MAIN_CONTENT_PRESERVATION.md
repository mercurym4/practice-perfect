# Literal-main content and selected design-input preservation (PP-WEB-41)

This standard-library source guard compares the current candidate's 27 public
HTML files with literal approved-main bytes from `ApprovedMainBaseline`.
It does not reconstruct original HTML from a candidate or migration rule.
Approved commit `86894c29c5d02baad35b3cc47815d2d0ec06315e` and actual tree
`f09903750fa6d6c8b6df16a7fe818bb92692154d` remain fixed by the baseline loader.

```sh
python3 -m unittest discover -s tests -p test_verify_main_content.py -v
python3 scripts/verify_main_content.py --baseline-repository .pp-approved-main --candidate .
```

The exact approved baseline objects must already exist locally. This command
does not fetch, install, start a server, launch a browser, execute website JS,
submit forms, send analytics, change deployment settings or publish anything.
Run it after a separate pinned baseline checkout, at the end of the existing
source-audit job. The candidate filesystem is intentionally compared separately;
it is never used to manufacture baseline bytes.

## Protected signatures

Each route reports baseline/candidate file SHA-256, seven signature SHA-256
pairs, equality booleans and explicit differing categories:

- Public text, including title, navigation, footer and hidden-element text.
  Script/style bodies are excluded, not arbitrary navigation or copy. Character
  entities are decoded. Only HTML ASCII whitespace (`[ \t\r\n\f]+`) is collapsed;
  case, punctuation, wording and NBSP/other Unicode characters are preserved.
  Text data is concatenated in source order; this is not a rendered-text model
  and does not model CSS/block-element line breaks or visibility.
- Exact decoded page title, without title-whitespace normalization.
- Meta description, plus all ordered meta elements with their complete sorted
  decoded attribute tuples (including Open Graph, Twitter, verification,
  charset and viewport inputs). Missing/present-empty values remain distinct.
- Ordered canonical-link href values.
- Ordered raw JSON-LD inner text, without JSON parsing, whitespace cleanup,
  key reordering or schema rewrite. UTF-8/raw string equality preserves payload
  bytes; executable scripts are not compared or executed.
- Ordered image `src`, `srcset` and `alt` values. Missing and present-empty
  attributes differ. Width, height, loading, fetchpriority and decoding hints
  are deliberately outside this signature, so requested loading fixes can pass.

There is precisely one candidate-only public text exception: one direct-body
plain-text anchor `<a class="skip-link" href="#main-content">Skip to main content</a>`.
It must have exactly those attributes/text, no additional classes, attributes,
nested elements or comments, and one actual `<main id="main-content" tabindex="-1">`
target. It is not a blanket allowance to remove matching text elsewhere.
Original pages with an existing main ID need not contain the newly introduced
tabindex/skip link. All other copy remains in the compared signature.

## Refusal and bounds

Input must be strict UTF-8 without NULs and no more than 1 MiB per HTML page.
The parser checks balanced explicit tags, unique document/head/body, preceding
closed head before body, title in head, unique attributes and required title,
description/canonical metadata. It refuses ambiguous/incomplete source instead
of silently producing a passing signature. This is a bounded checker for the
current explicitly closed website HTML, not a complete HTML5 conformance or
security validator. Unrelated CSS/JS semantics remain outside scope.

Candidate reads use only the fixed 27-path allowlist, directory-relative
`O_NOFOLLOW` traversal, nonblocking final open and regular-file checks. Symlink
roots/directories/files, hardlinked files, FIFOs, directories, missing pages and
oversized/changing files refuse. Baseline plus candidate HTML has a 16 MiB
aggregate byte budget; exhausted reports do not keep reading subsequent pages.
Before each candidate attempt, its maximum possible bytes are reserved from
the remaining budget; only successful reads refund unused reservation. Failed
or changed-file reads therefore cannot evade aggregate accounting. Reads stop
at the initially bounded regular-file size, then recheck metadata/length without
an extra unbudgeted EOF probe.
No source contents are included in stdout, only public paths/hashes/categories.

`SOURCE_COMMIT`, if a full lowercase commit hash is supplied by CI, is recorded only
as `candidate_source_commit_claim`. `candidate_git_identity_authenticated` is
explicitly false: hashing filesystem bytes does not authenticate them as that
Git commit. The surrounding exact-checkout CI supplies its separate provenance.

## Acceptance boundaries

A passing source report means only the seven defined inputs match literal
approved-main source, apart from the exact allowed accessibility link. It does
not establish approved visual parity, CSS/layout/geometry equality, full
functional behavior, actual image asset bytes, fonts, contact delivery, analytics, deployed headers/WAF,
indexing, privacy of historical deployments or device compatibility. JSON
explicitly sets visual/deployment verification false. Publication remains held.

Prior 402 migration-baseline image pairs are separate evidence. This guard
does not relabel those as original-main rendering. Existing actual source and
browser tests remain required; integrate only after independent review, then
verify the new exact candidate head in normal CI.

## Engineering preflight (not replacement CI)

On October 15, 2026, the pure parser/comparison was run against fresh GitHub
file reads for all27 original86894/current618f page pairs. All54 UTF-8 bodies'
Git blob identities were recomputed and matched returned file metadata, and
all27x7 source signature comparisons passed. This direct source preflight is
separate from the production CLI's local immutable Git backend and current
candidate filesystem: the integrated exact-new-head normal CI must still run.
No baseline reconstruction, browser, renderer or live website request supplied
that preflight evidence.
