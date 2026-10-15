# Strategy-call measurement contract (private, offline evidence)

Scope: PP-WEB-48 / existing PP-03. This document and its test are private repository support files, not visitor-facing copy or a deployment. The approved design, public JavaScript, contact API, provider configuration and publication hold are unchanged.

## Source identity and repeatable check

Reviewed source: `mercurym4/practice-perfect`, PR #2, `internal-website-source-audit`, revision `5870e84d70f08abf2d30f3b2e2cb22581dd60d9e`, tree `4cc74a7e17186e98eeb43db42e68535aec5d7632`.

| Actual source | Authoritative Git blob |
| --- | --- |
| `analytics.js` | `211b6a59690a5109358786225a308a1dedd43e54` |
| `contact-form.js` | `9e25ab032521575570567e2414cdfd7530ed5979` |

The exact source SHA-256 values are `657d6c31a4c8d29e6380f2dc70e652c51b73d529990213ee3d821883cea6a45f` for `analytics.js` and `6ac97f61cda29e653aedbe603fbd89db9af342d4478b36418c8450c201243c33` for `contact-form.js`. Source bytes, including terminal newlines, must match before claiming this revision's result.

Run from the repository root:

```sh
node --test tests/measurement-contract.test.cjs
```

The test executes both complete, unmodified scripts in one VM with a shared mocked `window` and `document`. It does not reconstruct either implementation. Seventeen test methods cover combined click/submission behavior and explicit negative cases. Fetch, DOM script insertion, form data and timers are controlled pure mocks. No browser, local server, actual HTTP, collector, email provider, credentials or real submission is used; no package installation is needed. The controlled 15-second timer is never a real wall-clock wait, and every settled submission must clear its timer.

## Exact current event vocabulary

| Event name | Exact payload shape | Meaning and boundary |
| --- | --- | --- |
| `service_clicked` | `{name:'service_clicked',data:{service:<allowlisted slug>}}` | A same-origin anchor click whose exact pathname selects one known service; not a pageview, purchase or qualified lead. |
| `strategy_call_clicked` | `{name:'strategy_call_clicked',data:{location:'header'\|'footer'\|'content'}}` | A supported same-origin contact anchor click; region is a fixed category, never anchor text or arbitrary DOM content. |
| `strategy_call_sent` | `{name:'strategy_call_sent'}` | An API-confirmed success with a truthy request ID not already seen on this page, followed by a best-effort analytics call; not proof of collector receipt, inbox delivery or a booked call. |

The ten exact service values are `practice-growth-audit`, `revenue-growth-sprint`, `fractional-sales-leadership`, `law-firm-intake-consulting`, `website-design`, `website-audit-overhaul`, `seo-marketing`, `ppc-marketing`, `debt-defense-direct-mail` and `pi-mva-lead-generation`. Case variants, trailing slashes and unknown service names are not aliases. Other same-origin pages, external origins, HTTP variants, `www` and unrelated fragments are ignored for these custom events.

Supported strategy-call destinations are pathname `/contact`, `/contact.html`, or the current page pathname with fragment exactly `#contact-form`. Header wins over footer in the implementation's ancestor selection; otherwise the category is `content`. No URL, contact value, request/provider ID, full text, company, email, message, query or fragment is included in these three custom-event payloads.

## Host and redaction boundaries

`analytics.js` initializes only when `window.location.hostname === 'practiceperfect.us'`. On the canonical host it retains an already-defined `window.va`, otherwise installs the normal queue stub; registers `beforeSend`; and appends one deferred `/_vercel/insights/script.js` element. A mocked append does not load this script and is not collector verification.

For a valid URL passed to `beforeSend`, the callback retains only `origin + pathname`, removing query and fragment. Absolute and relative URL cases are tested. This is not a universal event sanitizer: unrelated fields are returned unchanged, a pathname itself could contain private material if future routes become user-defined, and malformed URL behavior is not a collector acceptance guarantee. Current custom events instead use the fixed field/value vocabulary above. The test explicitly checks the serialized combined event stream against synthetic form values, provider IDs, query and fragment sentinels.

Preview/noncanonical hosts do not initialize this click handler, redactor or collector script. The form script is deliberately separate and has no hostname guard: if something else already supplied `window.va` on a preview, an accepted form can still call it. A dedicated negative-boundary test preserves this fact. Without a pre-existing collector, the preview form can confirm success while emitting nothing. Do not describe the host gate as universal suppression of all preview analytics.

## Confirmation, deduplication and failure semantics

Both the HTTP result and parsed JSON are required: `response.ok` must be truthy, JSON must be a non-array object and `result.ok` must be exactly `true`. Rejected HTTP, malformed success flags, unreadable JSON and transport failures cannot emit `strategy_call_sent` or reset fields. A delayed success after the controlled deadline also cannot replace the unconfirmed result, clear fields or emit a sent event. A second submit while pending cannot dispatch twice. No automatic retry is made.

Confirmed form success shows the existing success message and resets the form even if analytics is absent or throws. A confirmed result without a request ID also resets but emits no sent event. The actual API supplies a nonempty string from the provider's accepted response; the form itself currently tests request-ID truthiness, not an independent string schema. The test does not claim broader schema validation than the source provides.

Deduplication uses an in-memory `Set` of returned request IDs for this page instance. The same ID is counted once; a different ID is another event; a new page instance starts a new set. IDs are never sent in the analytics payload. An ID is marked tracked before attempting analytics, so a throwing or unavailable collector is not retried for that ID on this page. The test proves local emission/queuing behavior, not exactly-once ingestion. It is neither cross-page, cross-session nor cross-device person deduplication. Separately, the API's same-send provider idempotency key is scoped to identical normalized values within its ten-minute window; it is not a durable unique-lead metric.

An unreadable response or timeout means **unconfirmed**, not necessarily **not sent**: the provider may already have accepted a request. The safe existing message offers retry/direct email, preserves fields and avoids exposing arbitrary provider/CDN strings. This offline contract never sends or resends real mail.

## What is still needed for a business conversion claim

1. Approved publication of the reviewed website revision, preserving the existing design and the independent current firewall/privacy approval gates. Passing private VM tests is not publication authority.
2. Actual authorized canonical-host collector evidence: script loading, redactor application, all three custom event names/property categories accepted, and preview behavior observed. Emission or an analytics queue is not collection. No query/fragment PII should be used to perform a live check.
3. An approved, explicitly identified test submission with provider acceptance evidence and separate inbox receipt evidence, plus confirmation that failure/retry handling is acceptable. No live submission or prospect contact is authorized by this file.
4. Defined reporting denominator, time window and metric source before reporting a rate. Current events are aggregate interactions/API confirmations; they do not establish unique visitors, qualified leads, calls booked, calls attended, sales or revenue. Do not silently divide unrelated counts into a funnel.

No analytics dashboard access, collector delivery, mail inbox, Search Console indexing, conversion totals or business outcomes were verified here. Retain those as explicit evidence gaps rather than zeroes or successes.

## Next authorized source-only queue

Root can reconcile these event categories against all 27 current page script inclusions and existing supported CTA destinations, then record any exact coverage gap without redesign or adding speculative funnel events. A future defensive change to preview suppression or request-ID typing requires its own reproduced requirement and reviewed implementation; neither is silently introduced by this contract. Once this bounded assignment is accepted the specialist ends; no ongoing worker runtime is implied.

## Dated collector observation — root COO, October 15, 2026 12:34 UTC

Root separately queried the existing authenticated production Web Analytics project `prj_tdU1rqLtf4IcNbS0uS262Vohbdea` in team `team_RuHSPvhqmQHXsfiDz9u5bnAH`; this is external evidence, not generated by the VM fixture. The project read confirmed `practice-perfect`, canonical domain and latest READY production deployment `dpl_FGooPSTUa42PPQrJHnLiEt6sjtJ7`. No deployment or analytics setting was changed.

The requested interval was October 7 00:00 UTC through October 15 12:33 UTC; the aggregate API normalized its returned upper bound to October 15 13:00 UTC. As observed at 12:34 UTC, the production event-name query returned `strategy_call_clicked`: 3 events / 3 reported visitors, and `service_clicked`: 1 event / 1 reported visitor. A separate event-name query filtered to `strategy_call_sent` returned an empty data array for the same normalized interval. The separate count endpoint returned zero sent events but normalized its upper bound to October 15 00:00 UTC; do not present that narrower count as an exact current-time total.

Daily returned buckets locate the service click and one contact click on October 8 UTC (the previously documented operator verification), and one contact click each on October 13 and October 14 UTC. Provenance of those latter clicks is unknown; they are not established genuine or qualified inquiries. The APIs returned no sent-event row; this does not prove no requests were delivered, analytics had no ingestion delay/loss, or the current draft was deployed. No test email, real form submission, prospect contact, private-property query or PII capture was performed. Do not calculate a funnel conversion rate from these unmatched aggregate interactions.

Root also independently authenticated all 27 current HTML blob SHA-1 identities and byte counts against the fresh Git tree (326,714 bytes total). All 27 include exactly one deferred `/analytics.js`; only Contact includes deferred `/contact-form.js`, ordered after analytics. This is source placement, not an actual browser load-order/collector test. Seventeen exact-script combined methods and six independently introduced in-memory regression mutants were reviewed: all original methods pass, and all six unsafe mutants are rejected. Public source remains unchanged.
