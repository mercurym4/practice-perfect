# Candidate render envelope — PP-WEB-42C1

This is private verification tooling. It changes no public page, asset, API,
Vercel configuration, approved design or deployment. Publication remains held.

## Purpose and trust boundary

The Python exporter reads the candidate through `CandidateSiteSnapshot`, which
authenticates the local raw commit → root tree → child tree → blob chain for the
required full lowercase 40-hex commit. It never reads candidate worktree content.
The exporter additionally admits only the fixed public path/mode/blob mapping
`47e1b87881df615984cd81a6ee2ee63e93ba69c846704e8f24c7ab1fc8281800`.
That mapping is 84 paths: the existing 83 `PUBLIC_PATHS` plus `mobile-menu.js`.
Private repository paths are not exported. Changing any public blob or mode
requires a separately reviewed source pin update; neither CLI nor environment
can change the pin.

The pure Node decoder authenticates that the transferred bytes match this fixed
public mapping. It does **not** receive raw commit/tree proof, so it cannot
independently authenticate arbitrary commit/tree identities. The required
`expectedCommit` must match the envelope claim, but agreement alone is not Git
identity proof. Even when it accepts a genuine fixed public mapping:

- `publicMappingAuthenticated` is `true`.
- `commitChainVerified` is `false`.
- `candidateCommitClaim` and `candidateTreeClaim` are explicitly claims.
- `visualAcceptance` and `deploymentVerified` remain `false`.

An untrusted producer could label these exact fixed public bytes with another
syntactically valid commit/tree claim. The decoder deliberately does not claim to
detect that; the independently reviewed Python producer and exact-head CI are
separate evidence. General raw-chain proof transport is deferred. Do not relabel
this as a generic arbitrary-commit authenticated snapshot protocol.

## Wire format

One ASCII JSON positional array, no extra whitespace, followed by exactly one LF.
Its exact canonical encoding is Python
`json.dumps(value, ensure_ascii=True, separators=(",", ":")).encode("ascii") + b"\n"`.
All string values are restricted to ASCII by their fixed values/paths, lowercase
hash syntax or canonical base64. Arrays only; object-shaped or duplicate-key
representations are refused.

| Index | Value |
| --- | --- |
| 0 | `pp-candidate-public-snapshot` |
| 1 | Integer `1` |
| 2 | `mercurym4/practice-perfect` |
| 3 | Full lowercase 40-hex candidate commit claim |
| 4 | Full lowercase 40-hex candidate tree claim |
| 5 | Fixed selected-inventory SHA256 above |
| 6 | Producer source `authenticated-local-git-object-chain` |
| 7 | Public mapping authenticated flag `true` |
| 8 | Consumer commit-chain verified flag `false` |
| 9 | Visual acceptance `false` |
| 10 | Deployment verified `false` |
| 11 | Integer `84` |
| 12 | Actual total decoded bytes |
| 13 | Exactly 84 rows in ascending fixed-path order |

Each row is exactly
`[path, mode, git_blob_sha1, size, sha256, standard_padded_base64]`.
Only regular Git modes `100644` and `100755` are syntactically admitted; the fixed
mapping additionally binds the actual mode for every path. Git blob SHA1 is
recomputed over `b"blob " + decimal_size + b"\0" + data`, and SHA256 over the
literal data. Size is a nonnegative integer, not Boolean/fraction/negative zero.
Base64 must round-trip exactly including padding, with no URL alphabet or spaces.

The selected-inventory digest is SHA256 of the ASCII compact JSON array
`[[path, mode, git_blob_sha1], ...]`, in the same fixed order. Missing, extra,
duplicate, reordered, private or traversal paths are refused.

## Limits and interfaces

- Per-file decoded bytes: at most 2 MiB.
- Aggregate decoded bytes: at most 16 MiB.
- Complete canonical JSON including LF: at most 24 MiB.
- Python inherits the existing Git reader's 60-second elapsed, 256-command,
  bounded-output, no-lazy-fetch/no-replace-object/no-network policies.
- Node CLI reserves a single 24 MiB input buffer, refuses an excess chunk before
  copying, and has a 70-second input deadline. Its pure decoder performs no file,
  network, subprocess, server or browser access.
- Errors from exporter/consumer are generic; repository content and Git stderr
  are not emitted.

Python API: `build_snapshot(repository, commit) -> bytes`.

Python CLI:

```sh
python3 scripts/export_candidate_snapshot.py --repository . --commit FULL_40_HEX
```

Node API:

```js
const {decodeCandidateSnapshot} = require('./candidate-snapshot-contract.cjs');
const snapshot = decodeCandidateSnapshot(rawBuffer, independentlyExpectedCommit);
// snapshot.paths: sorted frozen array; snapshot.read(path): defensive Buffer copy
```

The frozen snapshot exposes only `candidateCommitClaim`, `candidateTreeClaim`,
`selectedInventorySha256`, `totalBytes`, `fileCount`, `paths`,
`publicMappingAuthenticated`, `commitChainVerified`, `visualAcceptance`,
`deploymentVerified` and `read(path)`. No private Map or mutable stored Buffer
escapes. Unknown paths and non-string lookups are refused.

Node CLI accepts exactly `--commit FULL_40_HEX`, consumes stdin, and emits only a
small JSON summary. It never echoes base64/source bytes. Existing hosted source
CI must separately wire the actual production-pin exporter into this decoder:

```sh
python3 scripts/export_candidate_snapshot.py --repository . --commit "$SOURCE_COMMIT" |
  node tests/candidate-snapshot-contract.cjs --commit "$SOURCE_COMMIT"
```

Here SOURCE_COMMIT is the independently selected exact candidate head, not a
substitute mapping policy. The workflow owner controls safe pipeline failure
handling and exact-head evidence. No workflow edit is included in C1.

## Verification and limits

Tests use synthetic full-84 binary fixtures. Python patches its loader and fixed
pin only inside the private unit-test process; Node replaces the exact fixed-pin
declaration only inside an isolated VM fixture. These seams are not exported as
production API/CLI/environment options. The unchanged production decoder refuses
synthetic mapping fixtures.

Tests cover structural fields, mapping recomputation, literal bytes, Git/SHA256
identity, canonical JSON/base64, malformed and newline-suffixed full-hex claims,
budgets, exact per-file/aggregate boundaries, defensive copies, refusal redaction,
CLI argument shape and Python→Node binary interoperability. The latter remains
fixture evidence, not actual repository collection. An explicit test demonstrates
the truthful unverified commit/tree claim boundary rather than claiming generic
chain authentication.

Current source qualification does not establish a running HTTP adapter,
rendered parity, live contact/analytics behavior, indexing, firewall enforcement
or deployment. Those require their separately bounded acceptance gates.
