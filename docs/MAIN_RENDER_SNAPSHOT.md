# Approved-main snapshot bridge (PP-WEB-42A)

This is a source-only, private verification primitive. It exports exactly the existing
83 approved public files from the immutable local Git-object loader, then admits
their literal bytes into a pure Node consumer. It neither renders nor serves a site.

## Production identity and boundary

- Repository: mercurym4/practice-perfect.
- Approved commit: 86894c29c5d02baad35b3cc47815d2d0ec06315e.
- Approved root tree: f09903750fa6d6c8b6df16a7fe818bb92692154d.
- Selected path/mode/Git-blob mapping SHA-256:
  6378328e0fb0b02fab38e692b9b0f2706197a7eafa3f50aff14b5dd1d790582d.
- The existing ApprovedMainBaseline production API is the only acquisition backend.
  Its pinned public allowlist is copied literally into the independent Node contract.
  There are no ref, policy, path-list or environment overrides.
- Public HTML, CSS, JavaScript, assets, API handlers, deployment configuration and
  approved design are unchanged. Internal docs/tests/scripts remain excluded from
  publication. Current Mike approval is required before Practice Perfect publication.
- No network acquisition, worktree fallback, filesystem exporter, local server,
  browser, package install, SDK/ADB action or deployment is introduced.

The existing loader verifies the pinned commit/root tree, selected nested
path/mode/blob mapping and literal Git-blob bytes. Missing objects fail closed;
there is no fetch. Inventory and subsequent reads share the same loader instance,
so cached bytes are reused rather than running the Git acquisition twice.

## Wire format

Exactly one canonical ASCII JSON array followed by one LF, with no objects anywhere:

[marker, version, repository, commit, tree, mappingDigest, source,
 visualAcceptance, deploymentVerified, fileCount, totalBytes, rows]

The fixed marker is "pp-approved-main-snapshot", version is integer 1, source is
"literal-local-git-objects", both acceptance flags are false, and fileCount is
integer 83. Each sorted row is exactly:

[path, mode, gitBlobSha1, byteLength, byteSha256, canonicalBase64]

The decoder requires precisely the 83 sorted public paths, regular-file modes
100644 or 100755, safe integer sizes, lowercase digest syntax, canonical padded
base64 with exact decoded length, per-file SHA-256 and Git-blob SHA-1. It recomputes
the pinned mapping digest from compact canonical [path,mode,blob] rows and checks
the aggregate byte count.

Duplicate-key handling is structural, not a permissive JSON-object parse policy:
objects cannot occur in the admitted format. A root object, row object, object in
a scalar slot or duplicate-key object is refused. Duplicate rows and alternate
path order are refused. The final byte-for-byte comparison with JSON.stringify
plus LF also refuses whitespace variants, escaped spellings, exponent numbers,
negative zero, alternate padding and trailing data. No object with duplicate keys
can survive the closed tuple/type validation.

## Bounds and defensive API

| Boundary | Limit |
| --- | ---: |
| Individual literal decoded file | 2 MiB |
| Aggregate literal decoded files | 16 MiB |
| Raw canonical JSON | 24 MiB |
| Node CLI stdin deadline | 70 seconds |
| Existing loader total acquisition deadline | 60 seconds |
| Existing loader Git command count | 256 |
| Existing loader per-command deadline | 5 seconds |

The loader's existing metadata/stderr bounds remain in force. The exporter
validates inventory types, bounds, byte identities and selected mapping before
writing anything. It constructs at most one bounded document in memory; no bytes
are streamed before complete admission. Base64 expansion is bounded by decoded
limits and the final JSON cap.

The Node CLI preallocates a 24 MiB input buffer, counts each incoming chunk before
copying, and refuses overflow without copying the excess. JSON parsing itself is
bounded by that raw cap; this is not a hard process-RSS or sandbox containment
claim. Decoded bytes are budgeted before allocation. No map is exposed until all
records pass. The returned frozen interface provides frozen path names and a
read(path) function that returns a fresh defensive Buffer copy. The private Map
and retained Buffers never escape. Consumers may mutate their own copies without
altering later lookups. The consumer must not describe an exposed JavaScript Map
as immutable.

The standalone CLI emits only a small provenance/count/total verification summary,
never base64 or page bytes. Refusals emit a generic message to stderr and return
nonzero; timeout and input-stream failure destroy stdin. No dynamic arguments or
environment variables relax validation.

## Source-only checks

Run from the repository root:

    python3 -m unittest discover -s tests -p 'test_export_main_snapshot.py'
    node --test tests/main-snapshot-contract.test.cjs

Unit happy-path bytes are explicitly synthetic. Python tests replace the loader
and only the mapping digest within a test context; Node tests substitute only
that digest inside a private VM copy. Production pins remain fixed in shipped
source. Both test suites separately prove the unmodified production mapping
rejects those synthetic bytes. Fixture passes do not authenticate actual baseline
bytes or establish rendered parity.

The normal existing hosted source-audit job can verify actual fixed production
bytes, after its approved-main checkout and existing baseline checks:

    set -o pipefail
    python3 scripts/export_main_snapshot.py --repository .pp-approved-main \
      | node tests/main-snapshot-contract.cjs

This is one finite normal-CI pipe, not a new runner, job, resource, artifact or
browser process. It uses the local Git objects already available in that job.
The exact current-head completed CI log is required before claiming that actual
83-file bridge works. The summary explicitly retains renderer_verified=false,
visual_acceptance=false and deployment_verified=false.

## Next bounded slice, not implemented here

Prepare a separate candidate snapshot with its own authenticated revision labels,
explicit candidate public paths and approved extra mobile-menu source. Validate
its path/size/digest envelope independently. Do not weaken or generalize this
approved-main exporter to export arbitrary repository files.

A future hosted-only renderer may consume the two admitted maps via independently
reviewed, finite loopback routing. It must keep origin identities distinct,
disallow path traversal/private paths and unexpected remote requests, mock contact
and analytics, and use the exact approved font admission and readiness gates on
both sides. Prove finite lazy-image/font readiness and first-capture strict gates
before artifact acceptance. Do not modify source styling, retry until a matching
capture, accept pixel tolerances, change renderer flags or treat this source bridge
as rendering evidence. Root owns any future workflow wiring and dispatch.

The current branch remains draft and unpublished. This primitive grants no
publication authority, automatic telemetry connection or live-provider claim.

