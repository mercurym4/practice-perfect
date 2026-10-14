# Practice Perfect contact confirmation recovery

PP-WEB-27. Local source/Node VM qualification only; publication remains held.

## Starting source and bounded change

Reviewed draft PR #2 head `866923f9566cdbdd442245f7d6e5e67ae1c82ff0`:

- `contact-form.js` blob `f7416d4baaf107e1b241e7798a2e3082091dc366`.
- `tests/analytics.test.cjs` blob `b49fb62d3298b78a38ae3673e559c44ea11b982f`.
- `api/contact.js` blob `a33bba7bef14e9a8c087545007e97976417270ab`, unchanged.

The client awaited `fetch()` and then `response.json()` with no client deadline. Either unresolved stage could leave its submit button disabled indefinitely. The API already uses a 10-second upstream provider timeout; that does not bound browser-to-API transport or reading the API response body.

The client now applies a 15-second confirmation deadline to both stages. It passes a fresh AbortController signal and races the whole fetch/body operation with the deadline. Aborting alone is insufficient for a transport that ignores cancellation. Only the winning result can update the form, so a late response cannot clear fields, overwrite a later manual attempt, or emit a successful-submission event. The timer is cleared on every completion path.

Timeout, network, unreadable JSON and unexpected errors produce the stable confirmation-uncertain message, with the existing direct email fallback. Only the eight exact current API error strings (including that fallback) may be rendered; unknown server/provider/CDN strings fall back rather than exposing technical or contact details. This repairs a preexisting arbitrary-error-text exposure, not an HTML-execution finding: rendering remains textContent. Failure preserves the form fields, restores the same submit button and uses the existing status element. The client does not automatically resend. Abort is not proof that the server/provider did not send; a manual retry may duplicate an already accepted email. The existing server-side ten-minute idempotency-window policy remains unchanged, not a universal exactly-once guarantee.

Accepted JSON must be a non-null, non-array object with literal `ok: true`, together with a successful HTTP response. It retains the existing success copy and form reset, per-page request-ID measurement deduplication, event without contact values, and measurement-failure isolation. No API recipient, credentials, request fields, origin checks or delivery behavior changed.

## Reproduction and verification

Before the fix, four selected tests against the actual submit listener failed: stalled fetch, stalled JSON body, arbitrary network error detail, and JSON parser detail. The first two remained pending after the synthetic clock passed 15 seconds; the latter two exposed inconsistent technical error text. These are four reproducing checks, not four security exploit findings. No real network request was made.

Before any push, COO review reproduced another preexisting false-confirmation case: HTTP success with JSON `{"ok":"false","requestId":"opaque"}` showed success and cleared the form. The initial 18-method candidate acceptance was held/voided; the revised source rejects nonboolean success flags and malformed JSON shapes. This is a client confirmation bug, not proof of actual provider acceptance or a new timeout regression.

Run from the source root with installed Node (no dependencies):

```sh
node --test tests/contact-form.test.cjs
node tests/analytics.test.cjs
node tests/mobile-menu.test.cjs
```

The new suite has 19 distinct test methods, using the actual script's submit callback in a Node VM with synthetic form, transport and clock. It covers the exact 14,999/15,000ms boundary, ignored cancellation, stalled body, late results, abort rejection, network/non-JSON responses, nine malformed success/JSON shapes, all eight exact API errors and four unknown error strings, accepted-request shape/success/reset, pending-submit exclusion, fresh manual retry, deduplication and analytics isolation. No browser rendering, background-tab clock scheduling, live API/provider delivery, inbox receipt, device behavior or hosted CI is claimed. Browser timers run when their event loop can execute, so 15 seconds is a cooperative scheduled deadline for asynchronous waits, not a hard wall-clock guarantee in suspended/background pages or preemption of synchronous JSON parsing, JavaScript or a blocked main thread. Browser cancellation also does not prove server-side cancellation.

## Preservation and next acceptance

Only `contact-form.js`, the new recovery test, the analytics VM's required timer/controller globals and synthetic rejection-message expectation, and this scope record are intended changes. All HTML/CSS, approved images, layout, copy outside recovery behavior, other scripts and the API remain byte-identical. No dependencies, server, browser or service were installed or started; no form was sent, hosted job dispatched, Site created, main merged, deployment triggered, money spent or resource deleted by the implementing worker.

Independent reviewer and COO source/test review are required before integration. Even then this remains a draft-only website change. Actual browser/accessibility and failure-recovery behavior should be checked on an approved protected preview once publication/access permits, without submitting a real email unless explicitly authorized. The retained-deployment firewall/config/log dependency is unchanged; the historical rule was Log, not blocking. Commercial/org expansion and Google Play remain deferred; PayoutLab remains excluded.

Technical references reviewed October 14, 2026: [MDN AbortController](https://developer.mozilla.org/en-US/docs/Web/API/AbortController) and [MDN Using Fetch](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch). Fetch resolves at response headers; cancellation also applies while reading its body. These API semantics are not evidence of a live deployment or delivery.

## COO follow-on PP-WEB-28: wire the verified checks into existing CI

After PP-WEB-27 source acceptance, the COO added one step to the existing source-audit job: run the19-method contact recovery suite and existing analytics assertions. Removing only that step restores the entire prior workflow. No new job, trigger, dependency installation, runner, timeout change, permission, secret exposure, artifact or deployment route was added. The protected draft Vercel deploymentEnabled=false rule and all HTML/CSS/assets/API blobs remain unchanged. Source changes are checkpointed with [skip ci]; no new hosted job is dispatched while current allowance/approved execution access remain unresolved. Workflow wiring is source-reviewed, not a matching-head CI pass.

Root locally ran19 recovery tests, analytics/menu assertions,5 Vercel configuration checks,10 source-audit detector tests and5 CSP detector tests, all passing. A27-page source structure audit and zero-inline-active-content CSP inventory passed. Asset existence placeholders were used only in a local structural fixture; this does not verify asset bytes/dimensions/pixels, browser rendering, live headers, provider delivery or inbox receipt. Actual repository tree/blob equality, not placeholder bytes, preserves approved assets. Original API blob a33bba7b is preserved; a local read-only materialization's EOF newline was not used as an integration input.
