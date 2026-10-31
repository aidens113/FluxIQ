# P8 host plan: source-less target identity refresh

Plan only, task t828, frozen private paired source. No implementation, checks, browser session or provider calls were run. This report supersedes host-discovery.md's inference that every zero-match look proves gone. Exact Core names remain subject to the lead's interface freeze.

## Recommendation

Keep the source-bound `reacquireTarget` request/answer and its row/output callers intact. Add the separate optional `reacquireUnboundTarget` hook the Core planner describes. Native playback and authoring should share one downstream capture-scope classifier, candidate conversion, record gate and fresh-target replacement builder. They should continue using Core's existing retry coordinator; neither host adapter should own another action retry loop.

The source-less path requires the already resolved saved `parameters.element`, an adequate stable identity, a supported single-control output, and proof that the observation covers the intended target scope. A selector, xpath, old handle or position is never that proof. The authoring wrapper must stop requiring a handle when these conditions hold. Bound row/output targets retain their source recovery path; an unsupported or failed source recovery must not fall through to an unbound page-wide search.

Fix the existing shared matcher's record hole in the same unit. A lone generic matching control in a conflicting or unknown record is never the old control merely because no second match was captured.

## Evidence checked in the private downstream tree

- `domain/src/runtime/host-runtime.ts:198-245` already sends `web.dom.capture_snapshot`, enforces a 5-second command timeout, unwraps `payload.result.snapshot`, sanitizes through `sanitizeWebLlmSnapshotWithBindings`, and obtains the browser resource from `result.metadata.sessionId` and action `sourceId`. Its current `reacquireTarget` registration at line 294 is pure source-answer matching. Native refresh can use the same gateway/capture action without importing `node-run/run.ts` or adding a wire verb. The before-action snapshot reuse shortcut must not be used for identity refresh: refresh needs a new observation.
- `domain/src/runtime/llm-evidence/capture.ts:544-591` already supports `includeHidden:true`, forwards cancellation after capture, refuses needs-person/unreadable captures and builds a private snapshot binding. Native should reuse the capture/sanitize primitives, not the authoring coordinator or its RecoverableToolRejection policy.
- `apps/extension/src/shared/snapshot-capture-options.ts`, `content/actions/capture-snapshot.ts` and `runtime/look-across-frames.ts` already propagate `includeHidden`. `runtime/action-runner.ts:144-156` treats an explicit frame ID or frame URL path as an addressed single-frame read; `look-across-frames.ts` then skips the tab merge. A native scoped read can therefore send the original browser tab/frame/path fields, with an explicit top-frame 0 when no frame was named, using the existing action.
- `background/connection/dom-snapshot.ts` reports requested child frames that did not answer. However, its frame-list timeout/error becomes `[]`, and a failed merge in `runtime/look-across-frames.ts` leaves the top snapshot standing. An empty `unansweredFrameIds` or `childFrameIds` list does not prove the whole tab was observed. Addressing the intended frame avoids this gap for this unit. Do not add a new completeness wire flag merely to reinterpret a fallback as complete.
- Raw `domain/src/page-evidence/types.ts` carries element totals/truncated, loading documentState/busy/pendingNavigation, navigation timeOrigin, and unansweredFrameIds. `llm-evidence/page-evidence.ts` intentionally omits `documentState:complete`, false loading flags and empty frame lists; the sanitizer's `truncated:false` also does not distinguish an explicit producer false from missing totals. Positive completeness must be read before this lossy public projection and retained privately. Absence of a public loading flag is not a readiness assertion.
- A single-frame child's raw elements have local selectors and no merged frame stamp. `llm-evidence/elements.ts:519` only recovers a child ID from a merged stamp/qualified selector. The shared candidate adapter must use the capture's browser-originated source/frame scope for an addressed child capture; `element.frameId ?? 0` is insufficient for that capture.
- `llm-evidence/node-run/retries/looked-up-reacquire.ts:44` currently requires a handle and saved element and excludes object target parameters. Its `matched` function rebuilds packet fingerprints in the requested frame. It calls `webReacquireElement`, returns fresh selector/element, preserves readsWords and does not persist a handle. Move that candidate/replacement work to the shared owner and leave a small authoring wrapper. Preserve the object state-bound exclusion and use Core lineage to choose native source versus identity recovery.
- `target-reacquire/element-match.ts:44-55` returns one descriptive match before considering stale record text. `readElement` discards key/keyAttribute/values and retains only record.text. Thus an old record A disappearing while one identical button in record B remains currently produces found(B). Existing tests cover record disambiguation among several matches, not this single-wrong-record case.
- `content/identity/record.ts` already states the correct gate: per-instance key first, recorded key attribute when known; otherwise record text; missing or conflicting record fails closed. It includes DOM-only enclosing-record/row traversal and a small pure legacy-value comparator (`sameAsRecorded`, line 380). Move that pure comparison into a browser-safe domain owner and import it from the extension; do not import the DOM owner into domain. Preserve legacy 120-character key and 160-character text prefix compatibility exactly where the existing browser gate uses it.
- `llm-evidence/elements.ts` currently stores record keys only as opaque private `records` address strings; `packet-fingerprint/from-packet.ts` rebuilds only public `within` record text. Do not split/decode the address separator to recover structured records. Retain structured provenance beside the existing maps while the sanitizer still has the raw descriptor.
- `output-nodes/definitions.ts:338-345` owns a shared selectorParameters declaration. `selector` and `element` are the exact eligible flat parameter IDs. `native-runtime.ts` registers these definitions in the SDK manifest. `target`, visualTarget, browser scope, values, operation flags, timeout, expectedState and consequence declarations must remain outside the host patch write-set.

## Proposed additive interfaces

### Core-facing hook candidate

Use the Core planner's separate optional method; these are proposed spellings, not an implemented API:

```ts
reacquireUnboundTarget?({
  node,
  parameters, // actual immutable resolved node parameters
  refresh: {
    container: "node" | "output",
    definitionId, definitionVersion,
    parameterIds, removableParameterIds
  },
  failure,
  previousAttempt: { attemptId, beforeAction }, // isolated existing state ref; beforeAction optional
  signal
})
```

Found returns flat operations, `[{operation:"set",parameterId:"selector",value:freshSelector},{operation:"set",parameterId:"element",value:freshFingerprint}]`. The web host returns no remove operations in this unit. Core alone applies them to this arrival's resolved parameter copy, using the trusted container. For `builtin.policy.action`, that container is the inner output parameters, never the wrapper's outputId, action ID, policy or authority. No Flow save, shared state/output replacement, other-node update or cross-arrival override results from found.

Core's response candidate is found/patches; gone/coverage:"complete"; unmatched with ambiguous/unidentifiable; unavailable with observation_unavailable/observation_incomplete/unsupported_target. Host exceptions/malformed data must fail closed without exposing page/error text. An additive identity trace has no fabricated sourceNodeId or source-returned flag and contains no fingerprint, selector, handle, page text or patch values. Keep the old source trace conversion unchanged.

Declare `targetRefresh?:true` on the trusted registered AutomationNodeParameter. Add it to only the existing shared selector/element descriptors. Core's canonical SDK resolver selects the true registered direct or output definition and freezes its IDs/version/container; the host cannot nominate its own allowed keys. Reject a whole patch with any unauthorized key, duplicate/conflicting operation, malformed value, unsupported remove or dangerous object key. Recompute dispatch through the original definition/action and preserve original permission/effect/consequence metadata.

**Current-page/resource correlation.** The Core planner supplied the matching generic addition: `previousAttempt:{attemptId:string,beforeAction?:AutomationStudioHostStateSnapshotRef}`, populated from the prior attempt's ID and `stateRefs.beforeAction` as isolated snapshots. This fits the web host. A saved fingerprint usually has no page address, so matching an unrelated same-looking control after a tab navigation is unsafe. Use `beforeAction.stateRef` to recover private capture provenance; never key a latest-page memo solely by node ID. Missing/evicted/mismatched state/resource evidence is unavailable, not a weaker identity search. No new browser protocol or navigation is needed.

The exact existing fields and the proposed bounded private memo are:

| Existing source | Meaning and safe use |
| --- | --- |
| `beforeAction.stateRef`, `stateSnapshotId` | Host-generated capture identity; the private provenance memo is keyed by stateRef, with beforeAction/stateSnapshotId consistency checked. State refs offered to `captureStateSnapshot` through previousStateRef retain the original provenance when reused. |
| `sourcePlaces.of(previousAttempt.attemptId)` | Presently only the safe whole `from.location`. It can confirm a recorded location but proves neither resource nor frame/document identity. Do not silently treat same_place from the old source-return helper as new identity proof. |
| `beforeAction.from.location` | The safe whole HTTP(S) address `resetToken` was willing to publish. Missing when the actual address is withheld/unsafe; absence must not invent a page identity. |
| `beforeAction.summary.documentTimeOrigin` | Host-added finite document identity. With today's default merged snapshot it belongs to the top document. Same URL without the same observed document is insufficient for a source-less replacement in this unit. |
| Raw capture result `metadata.sessionId` + browser-generated action `sourceId` | Source is exactly `tab:N:frame:M`, produced by `domain/src/client/browser-result-mapping.ts`, never taken from page-supplied result fields. Pin the refresh dispatch to this session and tab/frame scope. |
| `webResetResource(sessionId,sourceId)` | Existing opaque token of the session **and full tab/frame source**, not a tab-only token. Equal tokens confirm the same exact resource; a top-frame token cannot be compared directly to a child token as if they were equivalent. |

Add `identity/places.ts` with a bounded stateRef memo (64 recent captures, matching the existing source-place scale), holding only validated session/source, safe whole location, document timeOrigin and capture scope. Populate it in the actual host capture and preserve an existing entry when a before-action capture reuses previousStateRef. Keep it entirely private: no new fields in a saved state summary or a trace, no selectors/handles/raw page copy. Resolve the session from that entry; do not assume current eligible-session selection is the one the failed attempt used.

**Provable scopes today:** an ordinary host before-action merged-top capture supplies session/tab/frame-0 resource, safe top location and top timeOrigin. A fresh addressed frame-0 read can prove that same top place/document. It does not establish the prior child document's identity: a child iframe could navigate while its top document remains. A child target is therefore unavailable unless the before-action provenance also contains a real scoped capture of that child document. Do not promote a saved child ID or frameUrlPath to such proof. The implementation may capture and memoize the child's own prior before-action state when the canonical resolved target scope is available at that boundary; this is an internal use of the existing action, not a browser wire change. If that boundary cannot supply resolved child scope without further Core work, preserve the explicit unavailable result and name this supported-scope limitation. Test both supported top scope and unknown child scope.

### Shared downstream capture/candidate contract

Suggested private types under `domain/src/runtime/target-reacquire/identity/`:

```ts
type WebTargetObservation = {
  page: WebLlmSnapshotBinding;
  scope: {
    kind: "single-frame" | "merged";
    browserFrameId: number;
    browserFrameUrlPath?: string;
    resetResource?: string; // existing trusted session/tab/frame token
    location?: string;
    timeOrigin?: number;
  };
  coverage: "complete" | "partial" | "unknown";
  includesHidden: boolean;
  samePlace: "yes" | "no" | "unknown";
};
type WebFreshTarget = {
  selector: string;
  element: WebAutomationElementFingerprint;
  hidden: boolean;
};
```

One raw-snapshot classifier derives these claims from the correlated dispatch request/result and explicit producer evidence. Keep this private; no new model packet or browser action schema is needed. Store only the minimum provenance required, not a second raw snapshot. `complete` means the intended frame's current DOM observation is whole and settled, not that a virtualized collection, another page, or the rest of the tab was searched.

Extend the private snapshot binding with optional structured `recordIdentities` keyed by its transient handles, and a private capture-provenance field. Sanitization populates the map from the same raw descriptor it just accepted; screen typed strings and discard withheld/invalid values. Capture and stable-handle rewriting must mention/copy/re-key these fields explicitly alongside existing maps. No saved Flow or trace contains the handle keys. Existing bindings with no new metadata are unknown, never automatically complete.

`webTargetCandidates(page, observation)` enumerates every candidate in the intended frame, including hidden candidates as negative/ambiguity evidence. It obtains selectors, fresh shadow host chain, fresh dialog name, drawing and structured record identity from the binding and calls the existing `webPacketElementFingerprint`. Add an optional structured record input to that builder if needed; keep one builder and its existing sensitivity/withheld rules. Never use the old selector to pick a candidate, require the old handle to resolve, or rank by position.

`webRefreshTargetIdentity({parameters,observation})` owns validation, candidate conversion, shared element/record matching and replacement construction. It returns only fresh selector/element or a closed failure outcome. Both native and authoring adapters call it. The low-level source matcher can continue returning its selected candidate as supplied; the observation gate belongs to source-less/current-page matching, not to already rerun source answers.

Native capture adapter accepts an injected normalized capture dispatch, cancellation and the canonical scoped parameters. It issues `capture_snapshot` with includeHidden:true, bounded timeout, explicit frame and the original browserTabId/browserFrameUrlPath where present. Forward original session selection; never silently choose another paired client. Check cancellation before capture, after the awaited capture and immediately before returning a patch. Capture failure/cancellation/needs-person is never empty candidates or gone. A timeout cannot strand a run; cancellation must prevent fresh action dispatch even if a late capture response arrives.

For authoring, extend the existing capture/read callback options to use that same intended-frame request and private provenance. Restamp only for the authoring look store; identity matching does not depend on the new handle number. Preserve `run.looked`. A frame-only look must be remembered as a scoped/partial page view so `target-packets.ts:rememberLook` adds its known controls rather than forgetting controls from other frames. Do not fake `captureTruncated:true`; use the new private scope metadata to make that storage decision. `webNodeLookUntilPresent` remains the existing bounded observe/wait helper; do not multiply action attempts or add a second source-rerun loop.

## Record and completeness decisions

Apply the saved record gate before returning a sole descriptive match:

1. A saved key requires the same key under the saved keyAttribute; a different attribute cannot accidentally supply it. A legacy bare key follows the existing weaker browser compatibility rule. Do not case-fold keys. Missing candidate provenance is unknown, never proof of another or absent item.
2. Without a key, saved record text must agree under the existing record normalization/legacy comparison before found. A changed text is identity uncertainty, even when only one generic button remains. It must yield unmatched, never found or gone. Do not clear the saved gate to make a refreshed candidate pass.
3. Source-less fingerprints carrying pass-row values are unsupported: they belong to the existing row-source path. Preserve the extension's DOM-only row-value traversal; this unit must not replace it with substring heuristics on packet text.
4. No saved record gate keeps the existing stable descriptive signal floor and ambiguity rule. Record context must not count toward lowering the two-signal minimum. Fresh dialog/shadow/frame constraints still apply; a different or unverifiable dialog/root cannot be chosen by a generic label. If same root cannot be established without stale address matching, return unmatched/unavailable.

Extract only the pure recorded-value comparison from the extension into `domain/src/element-fingerprint/record/`, then use it from a pure structured record comparator and the existing DOM owner. The DOM owner still gathers the requested attribute, enclosing record, fallback named row and row values. Source matching uses the pure record gate too, fixing the wrong-single-record defect without changing the source-hook API. Existing source `gone` remains valid only when the original identity is actually disproved; record text drift/missing provenance turns it into unmatched rather than incorrectly declaring gone.

Before any source-less found, require complete intended-frame scope, sufficient identity, same place/resource and exactly one eligible visible candidate. Partial capture cannot prove uniqueness either: one visible candidate on an incomplete page is not a safe found. Hidden matching candidates remain in ambiguity accounting; a unique hidden match is unmatched/unavailable and lets the ordinary wait/retry behavior continue. Do not dispatch a replacement toward another visible look-alike merely because the real match is hidden.

Source-less gone requires **all** of: correlated same place/resource, explicit settled complete intended-frame capture, includeHidden honored by the current supported producer, no unanswered/malformed intended frame, adequate saved identity, and exhaustive negative evidence without record/root uncertainty. All-DOM current-frame capture does not prove an item was deleted from a paginated/virtualized collection. Where those conditions cannot prove absence, use unavailable/observation_incomplete or unmatched; never upgrade lack of completeness into coverage:"complete". A saved stable key absent from an actually exhaustive same-scope observation may prove gone; text-only record drift cannot. This conservative floor is required behavior, not an invitation to add scenario-specific deletion knowledge.

## Exact implementation/test ownership proposal

All paths below are in the private downstream repository unless explicitly labelled Core. These are future edits; this report changed none of them.

| Owner/files | Required change and colocated acceptance |
| --- | --- |
| `domain/src/output-nodes/definitions.ts`; `output-nodes/tests/definitions.test.ts` | Mark only selector/element targetRefresh:true on the existing shared descriptors. Assert direct canonical declarations and that value/text/submit/checked/ensureState/expectedState/target/visualTarget/scope remain protected. Core's tests cover trusted wrapped output lookup. |
| New `domain/src/element-fingerprint/record/{value-match.ts,compare.ts,index.ts}` and `record/tests/{value-match,compare}.test.ts`; `element-fingerprint/index.ts`; `domain/src/client/index.ts` | One browser-safe pure comparison owner. Cases: exact key attribute, differing key/attribute, missing provenance, text drift, whitespace, case significance, exact historical cut behavior. Export to extension through domain/client; avoid a runtime/server import in the browser bundle. |
| `apps/extension/src/content/identity/record.ts` and existing colocated record tests | Replace only its pure legacy-value comparison with shared import. Keep DOM traversal/fallback/row-value behavior, bounds and existing browser floors. This also removes lines from an already large owner. |
| `domain/src/runtime/target-reacquire/element-match.ts`; `tests/element-match.test.ts` | Record gate applies before sole/multiple match decisions; new regression A-gone/B-only returns unmatched, B never found; keyed record selection/conflict/missing data; text change is unmatched. Keep all original descriptive-signal rules and direct source matching tests. |
| `domain/src/runtime/llm-evidence/{elements.ts,sanitize.ts,capture.ts,stable-handles.ts}` and their `tests/{sanitize,stable-handles,packet-carries-no-selector}.test.ts` | Retain screened structured record provenance and positive capture metadata privately, populate/carry/re-key it explicitly. Public packet contains no new raw record-key, selector, handle map or resource metadata. Test missing metadata stays unknown and restamping preserves provenance for its new local handle. |
| `domain/src/runtime/llm-evidence/packet-fingerprint/from-packet.ts` and its existing owning tests | Extend its private context input with typed record provenance; same fingerprint builder/screening for native, authoring, recording and repair. Do not pull authoring target packets into native runtime. |
| New `domain/src/runtime/target-reacquire/identity/{contracts.ts,observation.ts,candidates.ts,replacement.ts,refresh.ts,capture.ts,places.ts,index.ts}` and `identity/tests/{observation,candidates,replacement,refresh,capture,places}.test.ts`; `target-reacquire/index.ts` | Shared classifier, complete candidate set, record-aware match, bounded private prior-capture memo and fresh patch. Keep I/O capture adapter separate from pure conversion/matching. Confirm addressed child capture local selectors are scoped by trusted frame and mixed/unknown frames fail closed. |
| New `domain/src/runtime/target-reacquire/reacquire-unbound-target.ts`; `domain/src/runtime/host-runtime.ts`; `runtime/tests/host-runtime-reacquire.test.ts` | Small native adapter plus optional hook registration and private provenance memo plumbing at capture/reuse. Assert previousAttempt.beforeAction correlation, actual resolved parameters, explicit browser scope/session/cancel/timeout metadata, only selector/element patches, no refresh capture reuse and no input mutation. Ordinary top-before capture cannot authorize child-document recovery. |
| `domain/src/runtime/llm-evidence/node-run/retries/looked-up-reacquire.ts`; `node-run/run.ts`; `retries/tests/reacquire.test.ts` | Remove handle-only admission when saved resolved fingerprint is present. Delegate shared matching/replacement. Extend callback only for scoped includeHidden capture options; object state-bound/row-source targets remain on their source path. Keep gone/found/failure conversion and Core trigger timing. |
| `domain/src/runtime/llm-evidence/plan-resolution/target-packets.ts` and its existing scoped memory tests | `rememberLook` treats frame-only/partial provenance as additive, so reading one frame cannot erase controls from a prior merged view. Test this directly. |
| `packages/test-runner/src/recovery-matrix/records/trace-attempts.ts`; `records/tests/trace-attempts.test.ts` | Add identity kind without sourceNodeId/returned fabrication. Old row/output data remains unchanged; malformed trace values remain closed/nullable. Only needed if this existing reader is used for the new browser proof/report. |
| New `apps/extension/e2e/site-reset/tests/native-source-less-target.spec.ts` | Installed extension and canonical Core executor proof below. Reuse extension-context/startInstalledBuild/gateway infrastructure, no live or scripted model decisions needed for a directly created native Flow. |
| Authored architecture owner `docs/architecture/` chosen by lead; paired working docs | Document optional hook, per-arrival patch boundary, source precedence, conservative absence, shared matcher and browser evidence. Lead owns shared Current State and ledger. |

Core owns its additive parameter contract/resolver, resolved-parameter helper, per-arrival patch validation/application, optional hook request/answer, trace/activity/detail conversion and their tests. Do not edit them from the downstream lane or restate their final types here after freeze. The actual Core host file is `packages/fluxiq/src/programs/automation-studio/runtime/host-runtime.ts`, correcting the discovery report's executor prefix.

Structural budgets inspected, not audited: file hard limit 800/warn 400; directory hard 25/warn 15; value exports hard 15/warn 8; path depth 9; repeated filename prefix group 3. `host-runtime.ts` should gain only a registration/import. `node-run/run.ts` is already large and should receive one callback plumbing edit, no matcher. Put the new identity work in its own directory with a barrel and tests, one focused exported value per file. Respect the existing contractSpreadPaths rule: all added private binding/provenance keys must be written by name through the exhaustive `present<T>` boundary, not an untyped spread. Do not change audit limits/baselines to admit this work.

## Direct regression matrix

| Condition | Required result/proof |
| --- | --- |
| Unbound resolved saved fingerprint, selector/DOM order changed, one same visible identity | Found fresh selector/element only; node and all shared values untouched. |
| Same authoring call without a handle | Same result as with a handle; no handle is stored in replacement. |
| Bare selector, fingerprint absent or fewer than two stable signals | Unsupported/unidentifiable; no selector/old position fallback and preferably no capture. |
| Bound row/output or object state-bound target | Existing source rerun/matching remains selected; no unbound fallback or extra rerun. |
| A's record gone, single generic B remains | Never found(B); unmatched when record identity cannot establish A's absence. |
| Multiple controls; exactly one same stable key or record text | Found only after record gate and signal floor. Missing/conflicting record never wins a tie. |
| Same key string under another keyAttribute | Not same record; no accidental cross-attribute match. |
| Record text changes or becomes unreadable/withheld | Unmatched/unknown, never gone or relaxed record gate. |
| Two same eligible identities/records or missing candidate provenance | Unmatched/ambiguous; no ordering-based tie-break. |
| Unique hidden match, or hidden duplicate of visible match | No replacement dispatch; not gone. |
| Missing snapshot, unreadable page, capture failed/threw or malformed raw evidence | Unavailable; never an empty successful observation. |
| Truncated, busy, pending navigation, noncomplete/unknown loading, intended frame unanswered | Observation incomplete; no found uniqueness claim or gone. |
| Whole-tab frame enumeration timeout or merged-top fallback | Cannot prove whole-tab/child coverage; use addressed frame capture or unavailable. |
| Single addressed child frame with local untagged selectors | Correct trusted child scope; do not interpret the elements as top-frame controls. |
| Wrong tab/frame/page/document or no trusted correlation | Unavailable; never search another client/frame for a look-alike. |
| Exhaustive stable same-scope negative identity, no uncertainty | Gone/coverage complete only when that actual absence is proved; no action. |
| Fresh replacement includes new context | Only fresh fingerprint/context plus readsWords from stale; stale selector/xpath/position/handle absent. Fresh shadow/frame keys remain scoped. |
| Late capture resolves after abort | Cancellation prevents patch/action; no gone; no next command. |
| Unknown/malformed patch, protected parameter or wrapper/output rewrite | Core rejects whole patch and keeps original canonical authority and parameters. |
| Completed act, landed/unknown effect check, ambiguous act acknowledgement, held/uncertain/permission floor | No refresh-authorized action repetition; existing Core safety predicate unchanged. |
| Four attempts, two or three attempts, one attempt | One refresh only at attempt 4 of 4+, final attempt for 2/3, none for 1; capture reads do not create a fifth action attempt. |
| Source-bound row/output fixture/replay | Existing source rerun count, place return, current-pass/arrival overlay and trace IDs preserved. |
| Private binding restamp/scoped rememberLook | Structured record and capture claims follow new transient handle; partial frame look forgets no other frame. |

Lead-provided reproduction evidence, not a check performed by this planner: two regression cases were appended to the private downstream `target-reacquire/tests/element-match.test.ts`, and the narrow baseline observed six existing passes/two new failures. Sole conflicting record was wrongly found; a shared stable key with changed record text was wrongly ambiguous. Preserve those exact lead-written oracles and typed JsonObject[] fixtures. The lead's log is `test-runs/t828-validation/record-baseline.log`; it was not read or rerun here.

## Achievable provider-free browser proof

Use `social-network-feed` through the installed-extension harness, isolated fixture/account state. This fixture has real post-control identity plus actual replacement/removal behavior: `client/unit-script.ts:131` hides a post by replacing its children, restores them through Undo, creates/removes menus, and `confirmTrash` removes an owned post after its real confirmation. `markup/unit.ts` uses repeated post controls and positional article structure. No fabricated HTML, cloneNode/DOM reorder, selector injection, provider call or scenario-shaped model guidance is needed.

Prepare through the fixture's own UI: clear its normal starting overlays, wait for a settled feed, load the necessary posts, and capture/save a later post's existing single-control fingerprint and actual generated selector. Keep it source-less: no read/output/item binding and no handle in the native parameters. Remove an earlier owned post through its Actions -> Move to trash -> Move flow; this real removal shifts later article selectors. Select a target whose generated address actually changes, and assert the old/fresh selector difference before claiming the stale-address test. Record the setup mutation as before-state; the test must not claim the removal as its target action or reset the account.

Run a small native Flow through Core's canonical SDK and real gateway, retaining the saved old target. The initial stale command must meet the actual browser's no-effect target resolution/identity gate, then Core's existing retries reach refresh. Instrument command boundaries and published traces, not browser behavior: assert three unacted stale failures, one identity refresh at the established fourth-attempt point, fresh dispatch to the same saved post, one requested effect and no act on any other post. Inspect the fixture's concrete per-post before/after state, not only success status. If normal content-side recovery makes the stale selector succeed before the Core hook is reached, that is a useful positive lower-layer result but **not** acceptance of this feature; choose a naturally stale address/control for which the Core branch is actually observed, or report this proof limitation instead of manufacturing three failures.

Companion negative in the same fixture: capture a control in A; use the site's Hide control to remove A's original controls while B's identical control remains. A refresh must not click B and must not label text drift/unknown record evidence as proved gone. Also use the naturally collapsed/hidden state to show hidden is not gone. Duplicate ambiguity and malformed/partial observations are deterministic shared-helper unit cases; a fixture mutation solely to fabricate duplicate HTML is prohibited. The browser proof's minimum requirement is native hook execution plus actual correct-post and no-wrong-post state; authoring uses the same candidate matcher and receives a separate focused domain integration assertion.

Browser proof is proposed, not run. The current request's place/resource correlation and the observed selector-changing choice must be settled before calling it verified. Any future live model-backed comparison is separately held for explicit go, Claude only, $5 for the whole build.

## Narrow acceptance commands for the later implementation

Run only after lead freeze and implementation. No command below was executed in this planning task. Do not run full sweeps today.

1. `pnpm --filter @fluxiq-web-extension/domain check`
2. `pnpm --filter @fluxiq-web-extension/domain test -- element-fingerprint/record/tests runtime/target-reacquire/tests runtime/target-reacquire/identity/tests runtime/tests/host-runtime-reacquire runtime/llm-evidence/node-run/retries/tests/reacquire output-nodes/tests/definitions`
3. `pnpm --filter @fluxiq-web-extension/domain test -- runtime/llm-evidence/tests/sanitize runtime/llm-evidence/tests/stable-handles runtime/llm-evidence/tests/packet-carries-no-selector runtime/llm-evidence/packet-fingerprint/tests runtime/llm-evidence/plan-resolution/tests/target-packets-look` (add `packet-fingerprint/tests/from-packet.test.ts` as the new owning test; there is no existing test in that directory).
4. `pnpm --filter @fluxiq-web-extension/extension check`; `node apps/extension/scripts/test-extension.mjs src/content/identity/tests/record` selects the existing record, record-veto, record-subject and record-repeated-row tests. The runner's path-fragment filtering was inspected, not executed. Do not substitute its whole package test suite.
5. `pnpm structure:check` for the required narrow merge structure gate; no baseline update unless an actual old violation was removed.
6. The lead's narrow Core target-reacquire, parameter/SDK resolver, patch-validator and summaries tests plus touched package typechecks; keep original source-lineage tests in that list.
7. After preparing the affected installed bundle only: `pnpm --filter @fluxiq-web-extension/extension exec node --no-experimental-strip-types node_modules/@playwright/test/cli.js test -c e2e/playwright.config.ts e2e/site-reset/tests/native-source-less-target.spec.ts --workers=1`. Record browser/build target, exact fixture state, target-specific before/after, attempt/refresh counts and zero provider calls. No panel management is required or authorized here.

Outcome: Done
Changed: report only
Validation: not run (plan-only)
Not verified: implementation/runtime/types/browser
Report: C:/Users/osrs_/FluxStuff/fxwork/t828/!FluxIQ/docs/working/framework-heavy-lifting-plan/reports/codex-1031/p8-identity/host-plan.md
Notes: Existing capture supports scoped hidden-aware reads; no new browser verb is needed. Record gate repair is required shared safety work. previousAttempt.beforeAction fits the private provenance memo; unknown child document scope stays unavailable.
