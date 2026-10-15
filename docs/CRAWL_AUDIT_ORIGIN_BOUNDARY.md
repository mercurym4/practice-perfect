# Read-only crawl audit: HTTPS origin admission

## Scope and source

PP-WEB-46 is a private audit-tool correction based on Practice Perfect PR #2
revision `c15b34c1dff57f5d0c65fdeb78230f2889a27386`. It changes only
`scripts/audit_live_site.py`, `tests/test_audit_live_site.py`, and this document.
Public website files, approved design/content/assets, the API, analytics, robots,
sitemap, snapshot pins, browser gates, workflow, dependencies and publication are
unchanged. Current publication approval is still required.

## Defect reproduced without network access

The old audit marked a foreign sitemap entry `foreign-url` but kept it in the
subsequent fetch loop. An injected dictionary fetcher recorded this exact sequence:

1. `https://practiceperfect.us/robots.txt`
2. `https://practiceperfect.us/sitemap.xml`
3. `https://outside.invalid/leak`
4. The seven unchanged internal-path probes.

The old result was `ok: false`, but `foreign_fetched: true`: a failed report did
not prevent the request. Separately, the old default `build_opener()` included
urllib's unrestricted HTTP redirect handler. Its standard implementation creates
a redirect request and calls `parent.open(new, timeout=req.timeout)` before the
audit can inspect `Response.url`.

## Admission before a request

The base is validated before any injected or default fetch. The `--base` option
continues to support intentionally selected HTTPS deployment origins, including
nondefault numeric ports and ordinary IPv4/IPv6 literals. It must be a root
origin, not a URL carrying a path, credentials, query or fragment. Invalid bases
return the existing result shape, `ok: false`, zero requests, an `invalid-base`
error, and the literal redacted base value `[invalid base]`.

The comparison key is `(https, lowercase ASCII hostname, effective port)`; an
omitted port and explicit `443` are equivalent. A different port is a different
origin. Malformed/empty/zero/out-of-range ports, malformed hosts, percent-encoded
authority spelling, user information, raw whitespace/control characters,
backslashes, query/fragment delimiters and malformed percent escapes are refused.
Path admission also refuses dot segments and encoded separators, controls or
percent escapes capable of hiding a second encoding layer. Encoded authority or
IPv6 zone identifiers are intentionally unsupported; ordinary bracketed IPv6 is
supported. This is a conservative website-audit URL policy, not a universal URI
parser.

Each sitemap URL is admitted against the validated base origin before it can
reach the fetch callback. Rejected entries retain the compatible `foreign-url`
error code but report only their entry number, never credentials or query values.
Valid entries can continue to be audited. Empty and duplicate sitemaps still fail;
exact duplicate entries are fetched once. Counts retain the original sitemap
entry count, while page and header processing use only admitted unique targets.

## Redirect ordering and final-response defense

The default fetcher builds its opener with `SameOriginRedirectHandler`, pinned to
the initial admitted origin. For 301/302/303/307/308, the raw Location is checked
before urllib normalization, then its resolved URL is admitted before urllib can
call `parent.open`. `redirect_request` checks the final normalized target again.
Cross-origin, downgrade, credential-bearing and otherwise unsafe redirects are
refused before any follow-up request. Normal same-origin relative/absolute
redirects retain urllib's existing loop handling and GET behavior.
Both raw/resolved and final redirect-request refusal close the original response
without reading its body before propagating the boundary error. An absent test
response is safe; an OS-level close error does not replace the admission error.
Malformed bracket/authority parsing in raw Location or URI is converted to the
same safe boundary error before closing the refused original response.
Inherited urllib parsing/Location-quoting ValueError or UnicodeError is likewise
converted and closed, including non-Latin-1 Location/URI text. A final-guard
refusal is not closed twice when it propagates through the inherited handler.

Every injected/default response for robots, sitemap, public pages and internal
path probes has its final URL admitted against the same origin before its body
is processed. This cannot undo I/O performed inside a malicious injected fetcher;
production confinement is the default opener's pre-follow boundary. Existing
public-page unexpected-redirect and canonical checks remain in place. Caught
transport/parse errors report the exception class and a fixed description, not
untrusted exception strings that might include URLs or secrets.

## Verification and limits

All verification here uses Python unittest, injected dictionaries, mocks and
urllib handler composition; no server, browser, live HTTP request or form
submission is required. The original four live-audit methods and their assertion
lines remain unchanged. Twelve new methods exercise sitemap non-admission, raw
controls, malformed/redacted bases, deployment-origin compatibility, empty and
duplicate maps, all response kinds, all five redirect codes, same-origin GET
follow-up, refusal response cleanup, default opener limits, and error-detail redaction. The original ten
public-site audit tests remain passing.

Default read-only GET behavior, two attempts, ten-second request timeout, the
2,000,000-byte response read limit, retry delay and seven fixed internal paths
are retained. These existing limits are not represented as a hard streaming,
total-wall-clock or connection-allocation sandbox. No DNS resolution/private-IP
restriction, proxy/environment policy, network sandbox, live WAF state, actual
deployment privacy, inbox delivery or browser/device compatibility is established
by this source-only boundary. No credentials, environment overrides or network
capabilities are added.
