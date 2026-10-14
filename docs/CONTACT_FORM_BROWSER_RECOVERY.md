# Offline contact recovery browser fixture — PP-WEB-29

Status: source implementation for future admitted browser execution, not browser acceptance. Practice Perfect PR #2 remains draft/unmerged/unpublished. Approved design and publication authority are unchanged.

## What this adds

The existing publication-parity fixture stubs contact-form.js and therefore does not qualify contact recovery. This fixture instead loads the exact reviewed contact page, frontend, styles and supporting local assets into fresh isolated contexts on a synthetic .invalid origin. It exports a function for an already-admitted Browser; importing it does not launch a browser, start a server, install tooling or visit a deployment.

Production sources are pinned by exact-byte hashes. Drift must fail closed and receive deliberate review, not a silent pin update. Browser-local synthetic transports exercise pending fetch, pending JSON body and late completion; these are controlled failure simulations, not real HTTP/provider cancellation or inbox tests. Actual HTML constraints, native form submission, DOM fields/status/button and event observations are the future browser acceptance surface. No synthetic dispatchEvent may stand in for native invalid-form acceptance.

## Acceptance cases and evidence

- Required and invalid-email native validation prevents dispatch.
- Pending fetch and JSON body recover on the actual client's cooperative 15-second timer, retain fields and restore controls; no automatic resend.
- Malformed success flags and private/unknown error strings cannot falsely confirm, reset fields or expose arbitrary response detail.
- Literal accepted response resets the form; the observed measurement event contains no contact data, and repeated request IDs are deduplicated.
- A timed-out original attempt cannot overwrite an accepted later manual retry when its synthetic transport eventually completes.

Every scenario requires a fresh offline context, blocked service workers, routes installed before navigation, a closed exact-URL local-asset allowlist and abort for every other request. No route continue/fallback, API/provider forwarding, external fonts/analytics or live form submission. The supplied browser remains owned by its caller; contexts created by the fixture close in finally. This is application-level browser isolation, not proof of an OS/network namespace or protection from a hostile browser/interpreter.

## Current execution boundary

No browser/server was launched in the implementation session. Managed Sites requires control-browser, which was unavailable; an installed Playwright module is not permission to substitute a launch path. Current hosted allowance/cap and approved execution access are also unresolved. The browser suite is deliberately NOT automatically wired into an existing browser job, and no new job/runner/trigger/dependency/artifact/preview/deployment route is created.

The companion contract tests exercise the actual fixture's byte/source, input and closed-routing helpers with Node only. They cannot establish that Playwright calls, native validation, timers, DOM assertions, context cleanup or layout work in a real browser. Syntax and helper passes must never be reported as a browser pass. Existing 19 Node-VM recovery methods remain separate source-level evidence.

Next admitted step: execute the exact committed fixture with the supported managed browser interface, or a separately approved exact-head CI browser runner. Capture source commit/hashes, browser/tool versions, executed scenario names and assertions, errors, dispatch/event counts and cleanup outcome. Fail if any case is missing, skipped, hangs or makes an unexpected request; explicitly classified blocked font/analytics/favicon requests are expected no-forward aborts, not failures. Review current-head evidence before claiming browser acceptance. Fonts/pixel/contrast/keyboard/live headers/provider/inbox and real analytics collection remain distinct gates; older run37 does not qualify this newer head.

Root's follow-on wiring adds only the pure Node contract-test command to the existing source-audit recovery step; removing that line restores the entire prior workflow. The browser fixture remains export-only/unwired. Protected existing branch internal-website-source-audit retains deploymentEnabled=false. No main merge, publication, live email, spending, deletion or product redesign.

## Source-level reproduction and limits — October 14, 2026

```sh
node --check tests/contact-browser-recovery.cjs
node --check tests/contact-browser-contract.test.cjs
node --test tests/contact-browser-contract.test.cjs tests/contact-form.test.cjs
node tests/analytics.test.cjs
node tests/mobile-menu.test.cjs
```

Root, engineering and independent review ran 15 new pure contract methods plus the unchanged 19 production-handler Node-VM methods: 34 pass, zero failure/cancellation/skip. Existing analytics and mobile-menu checks also pass. Independent review additionally passed 91 adverse byte/source/routing assertions and 18 serialized-transport helper assertions; these are assertion counts, not additional browser cases or test methods. The 10 browser scenarios are authored but UNEXECUTED; 34 local passes do not include them. Pure fake-adapter setup-failure testing checks the fixture's call ordering/finally close invocation, not actual browser cleanup. Raw route-tuple tests do not establish browser URL normalization or a network-security boundary.

Review strengthened rejected synthetic-transport accounting, precise expected-abort classification and observation of every pinned asset. Four late-result scenarios cover accepted/private original fetch/body completion after a later accepted manual retry. The report's assetBaselineRevision refers only to the six frozen assets at bb227a31, not the new fixture code's commit; an admitted runner must separately capture the actual fixture commit and browser version. Initial six guard failures were caused by a scratch logo copy's added EOF newline; the frozen upstream pin was correct and was not relaxed. The scratch newline was normalized, with no repository asset change.

The initial 13-method fixture freeze passed its tests but was HELD before any Git write after independent execution of the actual serialized init helper found an audit gap: an arrow denial function is not constructable, so constructor calls failed before incrementing the rejected-attempt counter. No egress bypass or product defect was established. A normal throwing function and two committed helper regressions repair the counter for eight constructor/method attempts and malformed/non-synthetic/excess fetches. Final source/test SHA-256: bae744161610f5fbe900158cfc68ef0676698742cb2ee71432fe63e3ce89ce3e / dd400c604403014c57fcca909181e469fbfa1c54da039a2546ac36f707fd153c. Engineering bounded lease ended 23:40:53UTC with no next queue; root owns integration.

API guidance reviewed for future execution: [BrowserContext](https://playwright.dev/docs/api/class-browsercontext) and [Browser.newContext](https://playwright.dev/docs/api/class-browser#browser-new-context). These describe the intended calls, not proof that offline+route fulfillment or native cases execute successfully in this environment. The actual supported runner needs an overall time/cleanup budget and independent current-head evidence before any acceptance or automatic wiring.
