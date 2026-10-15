# Immutable approved-main baseline (PP-WEB-40)

This source-only utility provides literal, untransformed public-file bytes from
the actual approved main commit. It does not reconstruct a baseline from the
candidate's HTML/CSS or migration rules.

## Authoritative pins

- Repository: `mercurym4/practice-perfect`.
- Approved main commit: `86894c29c5d02baad35b3cc47815d2d0ec06315e`.
- Actual commit tree: `f09903750fa6d6c8b6df16a7fe818bb92692154d`.
- Selected inventory SHA-256: `6378328e0fb0b02fab38e692b9b0f2706197a7eafa3f50aff14b5dd1d790582d`.
- Commit metadata: https://github.com/mercurym4/practice-perfect/commit/86894c29c5d02baad35b3cc47815d2d0ec06315e
- Exact sitemap: https://github.com/mercurym4/practice-perfect/blob/86894c29c5d02baad35b3cc47815d2d0ec06315e/sitemap.xml

Both pins were obtained from repository commit/tree metadata. Neither `main`,
`HEAD`, a candidate revision nor a worktree serves as a substitute. The CLI has
no revision/pin override. The private `_Policy` seam exists solely for isolated
offline test fixtures; it is not exposed by the production API or CLI.

## Admission and use

The exact commit and tree objects must already exist in a local Git repository.
If an existing CI job admits a second checkout, pin that checkout to the full
commit above. Keep it separate from the candidate checkout and run it only after
the job's existing audits, so baseline files do not contaminate earlier scans.
The loader never fetches, clones, checks out, modifies Git refs or reads site
bytes from a worktree. Missing local objects cause a refusal, not a network or
mutable-reference fallback.

```sh
python3 scripts/immutable_site_baseline.py --repository .pp-approved-main
python3 -m unittest discover -s tests -p test_immutable_site_baseline.py -v
```

Stdout is a deterministic JSON provenance inventory; it contains no website
content. Call `ApprovedMainBaseline(repository).read("index.html")` in Python to
obtain the exact original bytes, including binary/non-UTF-8 bytes without
normalization. `inventory()` returns the same metadata as the CLI. There is no
snapshot-directory export, HTTP server, browser or publication action.

## Explicit public scope

`PUBLIC_PATHS` fixes 83 individually named paths from the pinned tree: all 27
sitemap HTML pages, root CSS/JS/static files and selected PNG/WebP/SVG assets.
Repository metadata predicts 10,933,866 bytes across these paths; a successful
actual-object inventory must independently reproduce that count and total.
This includes original images needed to preserve the approved design and
reference images; selection does not establish that every asset is requested
by a particular page. It is not an export of every file in the repository.

Excluded paths include API/server code, deployment configuration/dotfiles,
docs, tests, scripts, preview pages, `services-green.html`, Markdown notes,
asset-library README/AUDIT files, the asset-library JSON manifest and base64
source copies. Non-allowlisted paths always refuse, even if tracked or present
in the worktree. Absolute paths, dot segments, backslashes, non-ASCII/control
characters and hidden path components refuse. Selected symlinks and Git links
refuse; only regular `100644`/`100755` Git blobs qualify.

## Integrity and resource bounds

The loader verifies raw commit and root-tree Git object identities, confirms
the commit's exact tree, reads a NUL-delimited tree inventory and verifies each
returned blob's declared size and Git SHA-1 object identity. Inventory rows are
sorted by path and contain mode, Git blob ID, byte count and SHA-256. No source
transformation or candidate-derived value supplies a baseline blob.

Before reading any selected blob, the complete selected path/mode/blob mapping
must match the independent pinned inventory digest above. This prevents a
corrupted nested-tree listing from substituting another valid blob at a public
path while retaining the original root-tree object. Its canonical input is
ASCII JSON with `ensure_ascii=True`, compact separators `(',', ':')`, and rows
`[path, mode, git_blob]` sorted by path (83 rows, 7,961 bytes). The expected
digest was computed independently from authoritative GitHub tree metadata, not
from candidate or locally reconstructed baseline content.

Limits are 100 policy paths, 2 MiB per blob, 16 MiB aggregate cached bytes,
512 KiB per metadata command, 64 KiB stderr per command, 256 Git commands,
5 seconds per command and 60 seconds total Git-reader elapsed lifetime.
Stdout/stderr are capped while reading, before unbounded accumulation. Timed
out/over-limit children are killed and reaped. Repeated cached reads do not
consume a second byte budget. Git replacement refs and lazy fetching are
disabled; inherited `GIT_*` redirections are removed, global/system Git config
is suppressed and terminal prompting/optional locks are disabled. Arbitrary Git
stderr is not copied into reports.

## Evidence boundaries and next gate

Passing offline fixtures verifies this reader's source behavior, not actual
production baseline collection. A separately admitted exact-object CI inventory
must pass before claiming the 83-file actual baseline was collected. Inventory
hashes establish byte provenance, not design approval, visual parity, contact
delivery, deployed headers, analytics operation, indexing or device behavior.
The JSON explicitly marks visual and deployment acceptance false.

Existing 402 image-pair evidence compares a reviewed migration baseline, not
literal whole-main-to-candidate rendering. This loader closes only the source
acquisition dependency for a future literal-main comparison. A future browser
adapter must explicitly admit local approved-main bytes and mock/block contact
and telemetry requests; that integration and screenshot comparison are out of
this change. Preserve the approved design and the current publication hold.
