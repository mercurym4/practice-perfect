# Candidate public Git-object snapshot (PP-WEB-42B)

This read-only source-verification primitive reads exactly 84 public candidate
files at a caller-supplied full commit object ID. It does not render, serve,
publish, export arbitrary repository content or contact a remote service.

## Scope and identity

The fixed candidate allowlist is the existing ApprovedMainBaseline PUBLIC_PATHS
83-file set plus mobile-menu.js. No CLI/environment path-list override is accepted.
The normal hosted workflow must supply the expected actual PR-head commit as a
separate argument:

    python3 scripts/candidate_site_snapshot.py \
      --repository .pp-candidate-head \
      --commit "$CANDIDATE_COMMIT"

The required commit must be exactly 40 lowercase hexadecimal characters. Branches,
tags, HEAD, abbreviated IDs and inherited environment values are not fallbacks.
The repository argument only selects a local Git object database; it does not
grant arbitrary-file export.

Object identity is not remote-origin authentication or product approval. The
fixed repository label identifies intended project scope, not proof that local
objects came from GitHub or that Mike approved their contents. Trust in the
expected commit and repository acquisition belongs to the enclosing normal CI
checkout/event. A caller choosing another valid local commit could intentionally
choose different public content; the reader proves those bytes belong to that
specified commit, not that the commit is approved for publication.

The separate approved-main reader remains pinned to commit
86894c29c5d02baad35b3cc47815d2d0ec06315e and its existing 83-path mapping.
This candidate reader does not replace or relax that immutable baseline gate.

## Transitive raw-object authentication

1. Read the raw candidate commit with a bounded local cat-file command and
   recompute its Git commit SHA-1 against the required expected object ID.
2. Require a first, unique canonical tree header in the commit header section.
   Authenticate the named raw root tree by recomputing its Git tree SHA-1.
3. Parse the binary tree entries directly: mode, space, raw name, NUL and exactly
   20 object-ID bytes. Refuse truncation, duplicate raw names, empty/oversized
   names, slash/dot/dot-dot names, unsupported modes and noncanonical Git ordering.
4. Match each selected path component byte-for-byte. Before following any selected
   child directory, read and authenticate that raw tree against the ID obtained
   from its authenticated parent. Cache only authenticated parsed trees by ID.
5. Selected intermediate components must be mode40000. Selected leaves must be
   regular mode100644 or100755. Symlink120000 and submodule160000 selected leaves
   are refused; selected non-directory ancestors are refused.
6. Read each selected literal blob only within its declared byte budget. Check
   exact size and recompute Git blob SHA-1, then report its SHA-256. Derive the
   selected mapping digest from sorted compact [path,mode,gitBlob] rows.

There is no ls-tree mapping trust, rev-parse:path fallback, path normalization,
filesystem/worktree content read, text conversion, URL decoding or checkout
mutation. A different internally valid nested tree cannot be substituted under
an already authenticated parent's child ID. All selected ancestor links must be
authenticated before any blob reads. Nonselected private repository entries may
exist; they are not read as blobs or exported.

## API and budgets

CandidateSiteSnapshot(repository, expected_commit) exposes read(path) returning
immutable Python bytes and inventory() returning fresh plain metadata. Repeated
reads reuse the same immutable cached byte sequence. Public commit, tree and
selected_inventory_sha256 are read-only properties. Inventory uses retained
verified identity, preventing accidental relabeling through the public API.
This is not hostile-Python-consumer or private-attribute sandbox containment.

| Boundary | Limit |
| --- | ---: |
| Individual literal file | 2 MiB |
| Aggregate reserved literal bytes | 16 MiB |
| Single commit/tree metadata object | 512 KiB |
| Aggregate reserved metadata, including blob-size responses | 2 MiB |
| Git stderr per command, inherited | 64 KiB |
| Git commands, inherited | 256 |
| Individual Git command deadline, inherited | 5 seconds |
| Whole Git acquisition deadline, inherited | 60 seconds |

The existing immutable_site_baseline._Git and _object_hash helpers are private
implementation dependencies, reused without changes. The Git runner scrubs
inherited GIT_* configuration and disables replacement objects, lazy fetching,
optional locks, terminal prompts and global/system Git configuration. It performs
local cat-file reads only, never fetches, and enforces its output/deadline/command
bounds. As in that existing runner, detecting overflow may consume one sentinel
byte beyond a per-command cap before refusal; aggregate reservations do not grant
a new read allowance after failure.

Metadata allowance is reserved before each command; only successfully returned
unused capacity is refunded. Blob declared size is reserved before literal read
and retained if read or hash verification fails. Caller retries cannot reset
aggregate budgets. Missing objects fail closed; no network or worktree recovery
is attempted. The limits do not claim a hard process-RSS sandbox.

Inventory contains candidate commit/root tree, dynamically derived selected
mapping digest, all84 path/mode/Git-blob/SHA256/size records, count/total and
source="authenticated-local-git-object-chain". It contains no literal/base64
payload. renderer_verified, visual_acceptance and deployment_verified are always
false. A valid source inventory is not rendered parity, candidate approval,
origin authentication, deployment verification or live-form delivery evidence.

## Verification and exact-head hosted gate

Source tests:

    python3 -m unittest discover -s tests -p 'test_candidate_site_snapshot.py'

The suite creates one temporary local Git repository with all84 public files and
binary/non-UTF8 fixture bytes; one full real-Git inventory/byte roundtrip and a
dirty-worktree separation check use actual Git objects. Other focused adverse
tests use internally hashed synthetic object graphs to avoid hundreds of duplicate
Git subprocesses. They are explicitly fixture checks, not actual repository CI.

Coverage includes wrong commit/root/intermediate identity, substitution of a
different valid nested tree, missing selected paths/blobs, malformed/duplicate/
truncated raw tree entries, mode/path restrictions, read-only public identity,
immutable/cached bytes, metadata/file/aggregate/command/elapsed limits, reservations
retained across failed reads, no worktree fallback and generic CLI refusal.

Root owns workflow wiring. A shallow synthetic-merge checkout may not contain the
actual PR-head commit objects even if its worktree tree matches. A separately
reviewed exact-head checkout using the already pinned action in the existing
normal source job may supply those objects; do not make this reader fetch or
infer missing identity. Preserve old checks and the approved-main gate.

Qualification requires a completed exact-current-head hosted inventory using the
expected PR-head commit, verified authenticated tree/mapping/84 file records and
matching actual candidate hashes. No actual-head CI success is established by
local fixture tests. Do not inherit predecessor or synthetic-merge acceptance.

## Next slice and unchanged boundaries

A later independent slice may define a candidate Python-to-Node closed-array
envelope with expected commit supplied independently to the decoder, strict
84-path identity, canonical base64, per-file hashes, aggregate/time limits and
defensive lookup. No candidate byte export/Node bridge/renderer/server is
implemented here.

Only after both source snapshot gates pass should a separately reviewed hosted
renderer consume immutable approved-main and candidate maps. Keep source identity
distinct, retain strict first-capture/readiness/font/network/artifact gates and
do not treat source identity as rendered acceptance.

Approved public design, content, assets, API, Vercel exclusions and publication
constraints remain unchanged. Practice Perfect remains draft and unpublished
until current Mike approval. No browser, server, package installation, paid/new
resource, SDK/ADB, live-provider action or deployment is introduced. All existing
portfolio exclusions and deferrals remain in force.

