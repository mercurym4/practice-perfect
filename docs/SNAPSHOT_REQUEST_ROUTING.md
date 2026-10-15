# Snapshot request routing (PP-WEB-42C2)

Source reviewed: PR #2 `abe92c0fec2720b0782130be6acd43237fe180ef`,
tree `262fd1d316934009e5cb1ae52e719e0960a2f700`.

This private, pure Node module is a visual-fixture adapter, not a web host.
It creates no server, socket, process, browser, timer, file read, or network request.
Only the renderer's separately authorized hosted composition may attach the
handler to a server after independently authenticating and decoding both snapshots.

## API and trust boundary

`createSnapshotHandler(snapshot)` accepts a frozen `paths` array and synchronous
`read(path)` method returning a defensive Buffer. Its closed path set must be
exactly the 83 public paths from `main-snapshot-contract.cjs`, or those paths plus
`mobile-menu.js` (84 paths). Order may differ; duplicates, missing, extra or
substituted paths refuse. Factory validation never reads file bytes.

The handler captures the read method and admitted menu choice once; replacing
the caller's properties later cannot widen routes or change the captured method.
It copies every successful Buffer before passing it to the response. The trusted
decoders must still ensure immutable private byte storage; this module cannot
authenticate a caller's implementation, closure state, Git identity, hashes or
defensive-read promise. The renderer must pass admitted decoder objects, not
arbitrary objects or worktree readers. The handler must never be described as
establishing source authenticity, exact served-JS parity, live deployment,
firewall behavior, form delivery, analytics behavior, or visual acceptance.

`resolveSnapshotRoute(rawUrl, includeMobileMenu = false)` returns a frozen
`{status, path, kind}` classification. Only a literal boolean may enable menu
routing. Kinds are `file`, `mock-script`, `favicon`, or null for a refusal.

## Request classification

- Only exact GET and HEAD. All other methods return 405 with `Allow: GET, HEAD`.
- Raw request-target maximum: 2,048 printable ASCII characters, no whitespace,
  control bytes, Unicode, fragment, absolute URL, backslash, percent-encoded path,
  dot segment or double slash. Validation precedes any route selection. No URL
  normalization or percent decoding is performed. Malformed targets return 400.
- `/` selects `index.html`. Extensionless paths select their exact known HTML
  file, including the 27 admitted HTML routes. Exact public file paths are
  selected without directory lookup. Unknown routes return 404, never Home.
- A bounded printable ASCII query is ignored after raw-path validation. It cannot
  alter the path, widen the allowlist, enter a response header, or be reflected.
  Literal fragments are not request-targets and are rejected. Source inspection
  of all 27 HTML and nine CSS files at the revision above found query references
  only in external Google Fonts stylesheet links; local query handling is
  intentionally conservative convenience rather than a production rewrite claim.
- `/favicon.ico` is explicitly empty 204. There is no file or directory catchall.
- `/analytics.js` and `/contact-form.js` return empty JavaScript Buffers without
  invoking the reader. This intentional visual-fixture mock prevents their source
  scripts from executing analytics or contact delivery. It does not verify their
  functionality or prove all possible remote requests are contained. The renderer
  separately must deny unexpected external requests and mock/deny all provider
  calls. This module has no API route; POST never invokes the reader.

## Responses and budgets

A selected actual file must be a Buffer of at most 2 MiB. Content type is fixed
by selected public extension: HTML, CSS, JS, SVG, PNG, WebP, text or XML.
Content-Length is exact in bytes; Cache-Control is no-store and
X-Content-Type-Options is nosniff. HEAD has the same status and headers as GET but
no response body, including refusal/error paths.

Reader exceptions, non-Buffer results, or excessive bytes return constant 500
`Internal error\n`, without reflecting paths, exceptions or source data. Real
response-transport failures remain the host's responsibility; after sent headers
the handler never attempts a second header response. Per-request byte copying is
bounded by 2 MiB; upstream snapshot admission owns the 16 MiB aggregate budget.
The eventual hosted renderer must own request-count, wall-clock, artifact and
server-lifecycle budgets. No local server/browser execution is admitted here.

## Verification

`node --test tests/snapshot-request-handler.test.cjs`

52 pure request/response-mock tests cover all 83 exact routes and all 27 clean
HTML aliases, optional 84th menu path, unsafe raw targets, private/API path
refusals, query/header non-reflection, method restrictions, binary MIME/byte
lengths, GET/HEAD correspondence, fixture mocks, invalid/frozen path sets,
captured-method and returned-buffer mutation defense, reader errors and byte
limits. There is no browser, real HTTP transport, origin or live-provider claim.

No public HTML/CSS/JS/assets/API/Vercel files are changed. The current Mike
publication hold prevails over older source authorization. Google Play remains
deferred, accounts disabled, custom SDK/ADB G45 pilot NO-ADMIT; no commercial or
organization expansion is included.

