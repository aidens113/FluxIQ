# P8 shared web matching and provenance foundation

Outcome: Done within the assigned source scope. Shared source is now frozen for lead verification and native-lane integration. No tests, typechecks, builds, audits, browser/provider/API calls or git commands ran; the Core SDK was deliberately left at the brief's pre-rebuild state.

## Implemented behavior

The existing `webReacquireElement` API is unchanged. Its record, dialog and shadow-root gates now run before either sole or multiple candidate selection. A single matching generic control in the wrong record cannot win. Saved key/keyAttribute outranks changed record text; missing/conflicting record evidence and text-only drift return unmatched, not gone. Descriptive matching still requires the same two-signal floor and agreement of all shared signals; selectors/xpaths/positions/handles are not identity signals. Key comparisons remain case-sensitive; runtime record text retains its previous whitespace/case folding so existing successful record-disambiguation assertions remain intact.

The browser's pure historical comparison moved to a small browser-safe domain owner. The extension calls it with the same already-normalized values and the same key/text meanings. Exact equality and the historical 120-character key/160-character text prefix compatibility are preserved. DOM record discovery, requested-attribute lookup, row-value matching, named-row fallback and traversal limits were not changed.

Accepted non-sensitive raw descriptors now retain screened structured record provenance in the private binding map. A withheld key does not degrade to its text fallback. No opaque `records` address string is parsed. Stable-handle rewriting re-keys and clones this map and clones existing private capture provenance without mutating the original binding. The map/capture fields remain outside public `WebLlmPageEvidence`.

Packet fingerprint construction accepts a private typed recordIdentity input and clones it into the existing saved-fingerprint record contract. `webPlanElementIdentity` accepts that input as its optional sixth argument. Same stable key/attribute survives record-text drift across views without adopting either changed text. The native lane still owns the actual target-packets call-site argument.

The shared observation classifier consumes the actual raw `snapshot.evidence.captureOptions.includeHidden === true` marker through the domain wire reader. It has no includesHidden request grant or producer-version assumption. Complete requires explicit applied hidden capture, single intended-frame scope, correct top/child frame claim, matching observed URL/document identity, whole well-formed element descriptors/counts, explicit nontruncation and explicit complete/not-busy/no-pending-navigation flags. Busy/truncated/unanswered observations are partial; old/missing/malformed/merged/fallback provenance is unknown. Malformed/withheld root claims cannot establish complete coverage. The private scope is cloned into the result.

Shared candidates enumerate all current intended-frame evidence, including hidden controls, and rebuild fingerprints with fresh selectors/shadow hosts/dialog/drawing/structured records. An explicitly scoped child capture's untagged local selectors use its trusted child scope, rather than becoming top-frame controls. The refresh helper rejects unproved place, incomplete coverage, missing selector bindings, mixed single-frame packets, absent saved fingerprints and pass-row values. It never repeats source recovery or performs I/O. A unique hidden match remains unmatched; a hidden duplicate participates in ambiguity. Found contains a fresh target only; replacement inherits only readsWords, drops xpath and positional context, and never copies stale selector/context/handles. No parameters/Flow/shared state/authority are written.

## Stable function APIs for the native lane

Both required functions are exported from `domain/src/runtime/target-reacquire/identity/index.ts` with the agreed signatures:

```ts
webTargetObservation(input: {
  snapshot: unknown;
  page: WebLlmSnapshotBinding;
  scope: WebTargetScope;
  samePlace: "yes" | "no" | "unknown";
}): WebTargetObservation

webRefreshTargetIdentity(input: {
  parameters: JsonObject;
  observation: WebTargetObservation;
}): WebTargetIdentityRefreshResult
```

Other focused exports are `webTargetCandidates(observation):WebFreshTarget[]`, `webTargetReplacement(fresh,stale):WebFreshTarget`, `webRecordedRecordValueMatches(found,recorded,kind:"key"|"text"):boolean` and `webRecordedRecordMatches(recorded,candidate):boolean`. The extraction comparator alone is additionally exported through domain/client for the extension. No frozen type-leaf signature was changed.

## Exact source paths changed

All paths are relative to private downstream `C:/Users/osrs_/FluxStuff/fxwork/t828/!FluxIQWebExtension`.

| Path | Change |
| --- | --- |
| `domain/src/element-fingerprint/record/value-match.ts` | New pure exact/legacy-prefix comparator. |
| `domain/src/element-fingerprint/record/match.ts` | New pure structured key/text record gate. |
| `domain/src/element-fingerprint/record/index.ts` | Focused barrel. |
| `domain/src/element-fingerprint/index.ts` | Exports shared record helpers. |
| `domain/src/client/index.ts` | Browser-safe comparator export for extension. |
| `apps/extension/src/content/identity/record.ts` | Pure comparator extraction/import/call replacement only; DOM behavior retained. |
| `domain/src/runtime/target-reacquire/element-match.ts` | Record/root/dialog gate before uniqueness; malformed saved scope fails closed. |
| `domain/src/runtime/llm-evidence/elements.ts` | Private structured accepted-record field and screening. |
| `domain/src/runtime/llm-evidence/sanitize.ts` | Populates private map and mentions it explicitly in exhaustive binding construction. |
| `domain/src/runtime/llm-evidence/stable-handles.ts` | Re-keys/clones record map and carries cloned capture provenance. |
| `domain/src/runtime/llm-evidence/packet-fingerprint/from-packet.ts` | Typed private record input; selected fingerprint retains its key. |
| `domain/src/runtime/llm-evidence/plan-resolution/element-identity.ts` | Optional sixth recordIdentity input and stable keyed record agreement across text drift. |
| `domain/src/runtime/target-reacquire/identity/classify-observation.ts` | New raw applied-marker and positive coverage classifier. |
| `domain/src/runtime/target-reacquire/identity/candidates.ts` | Shared fresh intended-frame candidate conversion, including hidden. |
| `domain/src/runtime/target-reacquire/identity/replacement.ts` | Fresh identity with only readsWords inherited and positions/xpath dropped. |
| `domain/src/runtime/target-reacquire/identity/refresh.ts` | Shared pure match/result orchestration. |
| `domain/src/runtime/target-reacquire/identity/index.ts` | Value exports only; prior type exports remain intact. |

Key anchors from final source reading: comparator `value-match.ts:2`; structured gate `match.ts:7`; existing matcher `element-match.ts:40`; raw record screen `elements.ts:448`; private map write `sanitize.ts:253`; binding rewrite `stable-handles.ts:457,470,504`; packet builder `from-packet.ts:47`; saved identity signature `element-identity.ts:136`; keyed agreement `element-identity.ts:296`; classifier `classify-observation.ts:9`; candidates `candidates.ts:6`; replacement `replacement.ts:5`; refresh `refresh.ts:11`.

## Tests authored or extended, not run

- New `domain/src/element-fingerprint/record/tests/value-match.test.ts`: exact equality/case and both historical prefix boundaries.
- New `domain/src/element-fingerprint/record/tests/match.test.ts`: stable key after text drift, exact attribute/case, legacy bare key, missing provenance, text drift and unsupported pass-row values.
- Extended `domain/src/runtime/target-reacquire/tests/element-match.test.ts`: missing provenance, another key attribute, text-only drift and dialog/shadow conflicts. All six original assertions and both lead-written regression tests remain unchanged.
- New `domain/src/runtime/target-reacquire/identity/tests/classify-observation.test.ts`: true/false/missing/malformed applied marker, busy/truncated/missing readiness, wrong frame/document, merged scope, unanswered frames, inconsistent counts and malformed shadow roots.
- New `domain/src/runtime/target-reacquire/identity/tests/refresh.test.ts`: correct stable-key target after text drift, fresh-only replacement/input immutability, hidden/duplicate/wrong-record refusal, scoped child locals, partial/unknown/no-place/bare-selector cases, honest complete no-record negative, missing selector binding, mixed frame, readsWords preservation and pass-row refusal.
- Extended `domain/src/runtime/llm-evidence/tests/sanitize.test.ts`: structured stable key privacy and withheld-key fallback refusal.
- Extended `domain/src/runtime/llm-evidence/tests/stable-handles.test.ts`: map re-keying, original binding preservation and private capture-provenance propagation/privacy.
- New `domain/src/runtime/llm-evidence/packet-fingerprint/tests/from-packet.test.ts`: selected private stable key enters the existing fingerprint without aliasing its binding.
- Extended `domain/src/runtime/llm-evidence/plan-resolution/tests/record-identity.test.ts`: saved selected key and keyed record agreement after text drift.

Tests are colocated by subject. No expected result in an existing success/failure oracle was weakened or replaced. The lead's original six-pass/two-fail record baseline was not rerun or represented as passing here.

## Integration and remaining verification

Native-lane required caller edit (communicated before implementation): `plan-resolution/target-packets.ts:633` must pass `binding.recordIdentities?.get(element.target)` as the sixth `webPlanElementIdentity` argument. That file was not edited by this lane. Native also owns capture.ts private-field propagation, scoped additive target memory, session/resource/place/document correlation, prior child capture memo and actual adapters/descriptors. Producer marker population and its conservative frame merge belong to the separate capture-proof lane. This classifier trusts only the actual strict marker it receives; producer support is not inferred.

Deliberate conservative boundaries: merged observations do not claim complete intended-frame coverage; changed shadow-root address chains are not treated as same root without proof; negative observations for saved record/dialog/root-gated targets remain unmatched rather than claiming deletion. A complete current-frame DOM observation does not assert that an entire virtualized collection or other pages were searched. No native or authoring runtime/browser success is claimed.

After Core SDK rebuild and every lane freezes, lead acceptance should include:

1. `pnpm --filter @fluxiq-web-extension/domain check`
2. `pnpm --filter @fluxiq-web-extension/domain test -- element-fingerprint/record/tests runtime/target-reacquire/tests/element-match runtime/target-reacquire/identity/tests runtime/llm-evidence/tests/sanitize runtime/llm-evidence/tests/stable-handles runtime/llm-evidence/packet-fingerprint/tests/from-packet runtime/llm-evidence/plan-resolution/tests/record-identity`
3. `node apps/extension/scripts/test-extension.mjs src/content/identity/tests/record`
4. Affected extension type check and required narrow structure gate, then the lead-owned native/browser proofs. No full sweep is requested.

These are future commands, not observed outcomes. All untouched/frozen boundaries from the brief were respected: no Core/versions/shared working-doc edits, no type-leaf changes, no host/runtime/capture/places/descriptor/target-packets/test-runner/E2E/producer edits. Source is frozen now.

Outcome: Done
Changed: 17 exact source paths and 9 exact test paths listed above; shared.md report only in private Core
Validation: not run (brief forbids checks/tests/builds/audits while SDK/lane source is unfrozen)
Not verified: types/runtime/SDK/browser; authored tests have not executed
Report: C:/Users/osrs_/FluxStuff/fxwork/t828/!FluxIQ/docs/working/framework-heavy-lifting-plan/reports/codex-1031/p8-identity/shared.md
Notes: Source frozen. Both stable shared APIs implemented; all existing and lead record oracles preserved. Native call-site/adapter integration and producer proof remain with their separate owners.
