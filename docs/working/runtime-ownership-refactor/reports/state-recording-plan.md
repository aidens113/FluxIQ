# R5 state and recording extraction plan

Outcome: Read-only investigation complete; implementation has not begun.
Owner: node_ownership, heavy worker, gpt-6.1-sol max.
Date: 2026-11-02.
Owned changes for this brief: this report only. All source remains unchanged for the lead's integration checkpoint.

## Recommended first substantial group

Extract the rich shared state/recording contracts together with the real state store, diff, signal registry, recording append/domain/controller, and normalization implementations. These are already coherent without a project, database, UI, or browser runtime. They total about 1,000 implementation lines plus the contract definitions; moving only the DTOs would leave the real ownership defect in place.

The cut needs the additional dependency slices listed below, especially `signal-registry.ts`, descriptors, evidence references, passive target DTOs, and structural validators. Neither active DOM target normalization nor Studio object-reference acceptance belongs in the neutral implementation.

Recommended execution order: freeze the contracts first; dispatch state/recording foundations, index processing, and gateway capture against those fixed contracts; finish mapper processing after its domain normalization port is bound. The groups below are a substantial closure, not an assertion that R6/R7/R8 are complete.

Path abbreviations: `S` = `packages/fluxiq/src/programs/automation-studio`; `F` = `packages/fluxiq/src`; `C` = `packages/contracts/src`; downstream paths are in the paired `!FluxIQWebExtension` worktree.

## 1. Canonical contract authority and compatibility

Public contract seams: `@fluxiq/contracts/state` and `@fluxiq/contracts/recording`; matching convenience exports may be exposed by `fluxiq/contracts/state` and `fluxiq/contracts/recording`. Add `fluxiq/runtime/state` and `fluxiq/runtime/recording` for implementations. Generic action contracts should be exported by the existing `@fluxiq/contracts/runtime` seam. The lead owns public package/config/barrel integration unless an implementation brief explicitly assigns it.

Use focused files and directory barrels, with one canonical declaration of each shape. Suggested physical owners:

| Authority | Existing declarations to absorb | Canonical focused directory |
| --- | --- | --- |
| State values, namespaces, snapshots, paths, schemas, deltas | `S/model/state.ts`; duplicated subset in `C/automation-studio.ts` | `C/state/` |
| Bounds, coordinates, anchors, presentation, visual frames/layers | Rich portions of `S/model/state.ts`; bounds/anchors subset in `C/automation-studio.ts` | `C/state/presentation/` |
| Provenance, comparators, signals and signal registry | `S/model/signals.ts`; `SignalProvenance` in shared file | `C/state/signals/` |
| Conditions | `S/model/conditions.ts` | `C/state/conditions/` |
| Action definition, parameter, preflight, safety, policy action and result | `S/model/actions.ts`; duplicate target/result in shared file | `C/runtime/actions/` |
| Passive element target/fingerprint/candidate/selection DTOs | Type declarations only from `S/model/action-element-target.ts` | `C/runtime/targets/` |
| Recording schema version, note/session/append/create DTOs, timeline entries, descriptors and domain event contracts | `S/model/{recordings,timeline,recording-framework,descriptors,recording-domain}.ts`; duplicates in shared file | `C/recording/` |
| Passive evidence layer/reference | Minimal declarations from `S/model/evidence.ts` | `C/evidence/` internal leaf, reexported where needed |
| Runtime node comparison and execution phase | Runtime comparison/phase slices of `S/model/node-state.ts` | `C/state/node/` |

Do not extract the whole evidence artifact model to obtain its two reference types. Keep `NodeStateViewSelection`, learned/observed source envelopes, and `initialNodeStatePhases` in Studio: their current use is model/view validation and editor defaults. A neutral runtime may consume the comparison/phase DTO, without importing those view envelopes.

### Published differences that must be resolved explicitly

The shared `C/automation-studio.ts` declarations are smaller than actual Core model types. Replacing rich Core types with the current shared subset would silently lose compile-time coverage for real persisted data.

| Shape | Core has, current shared copy omits or differs | Required compatibility |
| --- | --- | --- |
| `StateSnapshot` | optional `id`, `presentation` | Preserve as optional fields in the canonical contract. |
| `StateValue` | optional `presentation` | Preserve typed anchors/visual metadata. |
| `RecordingSession`, `CreateRecordingSessionInput` | optional `description` | Preserve; mandatory description is Studio start policy, not a new required foundational DTO field. |
| `ActionEntry` | optional `outputId`, `confirmationInputId`, `confirmationTimeoutMs` | Preserve. An old actionType-only recording stays readable. |
| `ActionTarget` | optional `elementTarget` | Preserve passive target DTO shape; do not normalize it while serializing. |
| `ActionResult.evidence` | Core `EvidenceReference[]`; shared `JsonObject[]` | Shared API already permits opaque JSON. Do not narrow it to references. Use one generic canonical shape and retain shared alias specialization for `JsonObject` and Core specialization for `EvidenceReference`. Thread that evidence parameter through containing action/timeline/session aliases where needed. |
| `RecordingDomainDefinition.signals` | Core `SignalDefinition[]`; shared `JsonObject[]` | Same explicit generic specialization strategy; do not silently narrow existing shared callers. |

No serialization/schema migration is required. Preserve schema strings (`0.1`, recording-index `0.2`), enum members, optionality, null handling, unknown parameter/value payloads, IDs, offsets, sequence and metadata. `StateValue<T = unknown>` and action parameter `Record<string, unknown>` must not become JSON-only values in this ownership change.

`C/automation-studio.ts` becomes compatibility reexports/type aliases for this slice; its project request envelopes remain Studio contracts. Old model leaves reexport canonical contracts, and old implementation leaves reexport canonical implementations unless they supply an actual Studio policy. Avoid a second parallel shape assembled with `Omit` at the old owner: generic type parameters on one declaration preserve the two existing specializations truthfully.

Type checks must cover old shared callers using arbitrary JSON evidence/signals and old Core callers reading rich reference/signal properties, plus rich snapshot/presentation and output-confirmation round trips. Do not claim assignment compatibility merely because fields disappear in structural typing.

## 2. Foundation implementation group

| Existing source | Canonical implementation owner | Actual move |
| --- | --- | --- |
| `S/model/state-diff.ts` | `F/runtime/state/diff/` | Snapshot diff, delta application and summary. |
| `S/model/state-store.ts` | `F/runtime/state/store/` | Real in-memory store, events/subscriptions and value/snapshot builders. Keep old Automation names as aliases. |
| `S/model/signal-registry.ts` | `F/runtime/state/signals/` | Schema-to-signal construction, discovery, comparator selection and snapshot lookup. This extra file is required closure. |
| `S/model/recording-framework.ts` | `F/runtime/recording/session/` | Create/append/checkpoint/delta/note/finalize functions and sequence/unique ID helpers. |
| `S/model/recording-domain.ts` implementation slice | `F/runtime/recording/domain/` | Registry, recursive schema validation, reducer/extractor execution, latest checkpoint lookup. Reducers/extractors are already injected trusted domain functions. |
| `S/runtime/recording-controller.ts` | `F/runtime/recording/controller/` | Actual store subscription and recording lifecycle, not another wrapper loop. |
| `S/normalization/{contracts,default-normalizer,index}.ts` | `F/runtime/recording/normalization/` | Conservative pass and selection helpers; contracts live under `C/recording/normalization/`. |

Split the existing multi-export modules into cohesive leaf groups as they move; retain old public symbol names through feature barrels. Canonical code must never import a Studio model barrel, including erased imports. Keep new directories within the depth budget.

Additional structural validation closure: `S/model/validation/{state,recording,visual-target}.ts`, structural target checks from `S/model/action-element-target.ts`, and the already canonical issue/result helper in `F/flows/executable/validation/`. Validation of finite dimensions, IDs, sequence, references, confidence and allowed source literals is reusable. `validateStateSnapshot` currently also accepts image content refs by Studio-specific prefixes (`automation-object://`, `fluxiq-object://`, `object://`, `/api/`) and emits Studio wording. Separate that acceptance policy into an explicit validator port; the Studio wrapper binds its exact current predicate and messages. Do not put an implicit Studio URL allowlist in generic validation. The old wrapper is behavior-compatible rather than an identity alias where it injects that policy.

Normalization classification needs an explicit policy seam: current high-frequency observation logic recognizes generic gateway names `client.state_snapshot`/`client.state_update`, then any observation payload containing a `state` key. The gateway names are transport vocabulary, not browser interpretation. Preserve the payload heuristic only as explicitly supplied compatibility policy; do not make arbitrary domain payloads with a `state` field a hidden generic fallback. Existing Studio callers must bind the compatibility policy so their normalized output remains unchanged.

Foundation acceptance subjects: existing `S/model/tests/state-recording.test.ts` (split state, signals, session, normalization rows into canonical subject tests), `action-visual-target.test.ts` structural rows, `model.test.ts` recording-domain rows, and passive target validation rows from `action-element-target.test.ts`. Leave model fixture/artifact validation integration rows in Studio. Add direct controller coverage for subscribe/checkpoint/stop/unsubscribe; no provider/service dependency is necessary.

## 3. Recording indexing, linking and lookup group

Do not leave `state-linker.ts` importing Studio storage merely for DTOs and sorting.

| Existing source | Move/split |
| --- | --- |
| `S/storage/state-index.ts` | Move index/item/summary/state-link DTOs to `C/recording/index/`. Move `emptyRecordingIndex`, sort and visual-target projection to `F/runtime/recording/index/`. Keep Studio object-ref acceptance/ownership validation in storage, or provide an explicit reference-policy port to the canonical structural validator. |
| `S/runtime/state-linker.ts` | Move the real finalizer to `F/runtime/recording/index/links/`. Preserve explicit-link mode, nearest absolute time, prior-on-tie rule, warnings and deterministic sorting. |
| `S/runtime/service/recording-state-index/lookup.ts` | Move state/entry/action lookup and candidate action-entry resolution to `F/runtime/recording/index/lookup/`. Its only nontrivial dependencies are canonical DTOs, finite-number/unique-string helpers and candidate types. |
| `S/runtime/service/recording-state-index/build.ts` | Move one-pass construction/finalization to `F/runtime/recording/index/build/`, taking entry readings from explicit ports. |
| `S/runtime/service/recording-state-index/{entry-readings,state-entry-readings}.ts` | Split generic timestamp/action/state projection from Studio object-ref parsing. A trusted reference reader returns scoped opaque refs; it never imports Studio parser from canonical code. |
| `S/runtime/service/recording-state-index/contracts.ts` | Generic lookup result/request into canonical contracts; keep project repair request/write mode envelopes in Studio service. |

`RecordingIndex.projectId`, `stateRef`, `screenshotRef`, `timelineRef` and coordinate-unit literals are passive compatibility data. Neutral code may carry them without understanding a Studio project or URL scheme. Its reference callback must preserve current same-project filtering and content ref rejection at the Studio sink. The full storage file must not simply move because it imports `parseAutomationStudioObjectContentRef`.

Tests: move generic rows of `S/runtime/tests/state-linker.test.ts`; split `S/storage/tests/state-index.test.ts` structural vs Studio content ref rows. Keep `S/runtime/tests/service-recordings/tests/state-index.test.ts` as an adapter integration check and add canonical lookup/build port tests. The linker chooses nearest state, including a later one; lookup fallback chooses latest at or before entry. They are different intentional algorithms and must not be collapsed.

## 4. Gateway and IO capture group

Canonical owner: `F/client-gateway/recording/` for the bridge/write ordering; `F/runtime/recording/io/` for registered input capture. This removes the actual 790-line bridge from Studio ownership.

Existing files: `S/client-gateway/{bridge,client-recording-write-order,index}.ts` and `S/runtime/io-bridge.ts`. The existing bridge depends on Studio only for service calls, model DTOs, `requiredRecordingDescription`, default open-project refusal, and diagnostic source metadata. Its scheduling, trusted-client ownership, scoped-session filtering, drain/finalize rules, message routing and action result capture are generic.

Define a canonical `RecordingSink` with explicit typed methods corresponding to these six existing operations:

- create session;
- append one entry;
- append entry batch;
- append validated domain event;
- finalize session;
- read session/finalized status.

Arguments/results use canonical contracts. Carry optional project scope as an opaque sink address for compatibility. Inject context/description validation and diagnostic source through a `RecordingStartPolicy` adapter. Do not import a broad `AutomationStudioService` type or use `Pick<AutomationStudioService, ...>` as a supposedly neutral port. Studio facade constructs the sink against its existing methods and binds the exact description rules, project refusal and `source: automation-studio` metadata. Root wiring in `F/programs/_shared/runtime.ts` and `F/framework/index.ts` stays lead-owned unless reassigned.

`AutomationStudioIoRecorder` becomes an adapter over the canonical IO recorder and the Studio sink. The canonical recorder reads `IoRegistry` and `IoEnvelope`, performs the existing bound-input projection and calls append sink. A role=`action` input becomes executable only when an actual output binding exists; state inputs and unmapped actions remain observations. Preserve `policyEligible`, confirmation fields, the optional `recordInputPayload` projection, and metadata precedence exactly.

Move generic tests from `S/client-gateway/tests/{bridge,bridge-restart,bridge-scoped-session,client-recording-write-order}.test.ts` to the canonical owner using an in-memory sink. Leave description/open-project adapter assertions at `S/client-gateway/tests/description.test.ts`; retain a small Studio sink integration and legacy facade compatibility test. Split `S/runtime/tests/io-bridge.test.ts` direct capture cases into canonical sink tests; keep graph/service integration rows in Studio.

Important compatibility behaviors: owner keys prefer trusted client ID; pending-start barriers are registered before awaits; refused starts settle queued messages; Stop during pending start suppresses acknowledgement; scoped sessions never capture; stop drain defaults to 250 ms; write queue timer/batch boundaries remain 25 ms/50/100; a concurrent new recording survives an older Stop; closed owner memory stays 32; finalized late action loss is audited every time while passive loss is counted/reported once. Preserve durable command failure propagation.

## 5. Actual mapper/candidate/review processing group

Canonical owner: `F/runtime/recording/mapping/`; contracts: `C/recording/mapping/`. Keep actual mapper invocation, fallback, validation and timing control flow in this owner and use it from the existing service. Do not introduce a duplicate loop with the real one remaining in Studio.

Exact existing closure:

- `S/runtime/service/recordings/{proposal-generation,proposal-candidates,timeline,normalization-review}.ts`.
- `S/runtime/service/recording-projections/mapper-candidate.ts` (bound action fallback); its label token formatter should be moved to a neutral focused utility or injected, not imported from Studio evidence services.
- Generic candidate/evidence/state-link declarations from `S/runtime/recording-flow-proposal.ts`; project proposal/review/destination/approved-definition/invalidation envelopes remain Studio.
- Recording mapper definition/observation/candidate/result/context/implementation declarations from `S/nodes/importer-sdk.ts`. Only these declarations are needed; leave the rest of SDK/native execution with R1. Context/implementation using `ElementMatcher` belongs in runtime, since the contracts package must not depend on the framework implementation package. Reexport the exact old AutomationStudio names. This shared file needs lead/R1 coordination before editing.
- Generic normalization review mappings and wait-clip projection from `S/runtime/service/recordings/normalization-review.ts`, with artifact ID/time/persistence handled by its Studio wrapper; `S/runtime/service/recordings/types.ts` keeps its aggregate pipeline artifact envelope.

Ports needed before dispatch:

1. `normalizeCandidateParameters(domainId, parameters, context)` supplied by the trusted domain host. Current proposal candidate code calls `normalizeAutomationStudioElementTarget`, interpreting `element`, DOM aliases, selector, XPath, tag name, implicit role, ARIA label and attributes. Move that web interpretation downstream. Neutral candidate validation carries parameters untouched if no normalizer is registered; no Core browser-normalizer fallback. The existing web host must register its adapter before the canonical mapper is used, preserving current parameter bytes for the compatibility corpus.
2. Candidate ID factory and proposal envelope stamper. Keep exact `safeSegment`/UUID output by supplying current factories from the Studio wrapper; do not import `programs/_shared/storage.ts` into runtime. A generic normalized candidate result does not need project ID, approval state, or a persisted Studio artifact.
3. State-link lookup port or the canonical index lookup from group 3. No Studio index import.
4. Existing neutral `ElementMatcher` supplied to the mapper context; do not infer a web scorer.

Candidate validation must retain registered/declared output checks; all source and confirmation input role checks; immutable expected-state clone with empty/uncloneable dropped; invalid recordOutput rejected rather than dropped; output-declared recordsPath fallback; encrypted output refusal; positive safe-integer timeout validation; confidence bounds; evidence and state links; `policyStateEligible: false`. The per-entry mapper error is collected while later entries proceed. Keep up to 32 following observations, mapper-visible ordering, fallback policyEligible exclusion, emitted/mapped/accepted counts and no-candidate diagnostics.

The gap tracker advances before candidate validation, as current code does. A failed candidate can therefore affect the next candidate's gap. Preserve this ordering during extraction, and flag any later behavior change separately. First candidate has no gap, same-entry candidates have zero, backward clock yields no wait, and accepted finite gap rounds to milliseconds.

`appendRecordingProposalToFlow` mixes generic candidate-to-policy-action node preparation with Studio artifact/layout metadata. Extract candidate execution parameters (output, confirmation, expected state, record output, timeout and gap) to a canonical executable-node recipe helper, using the executable graph/node contracts from R4. Keep proposal review/artifact updates and existing editor layout placement in the Studio wrapper. This avoids a new runtime dependency on `AutomationStudioFlowArtifact` while preserving stored nodes/edges/positions/metadata.

Acceptance: canonical mapper/candidate/clock/normalization-review tests with injected ports; existing Studio `runtime/service/recordings/tests/proposal-candidates.test.ts` service-through-mapper rows and `runtime/tests/service-recordings/tests/recorded-gap.test.ts` as scoped integration checks after the source-stable barrier. Existing `candidate-definitions.test.ts` checks the record-output/timeout values carried forward and must remain covered. No provider calls are needed.

## 6. Required downstream adapter and consumer files

The paired downstream tree already owns browser capture, reducer and interpretation behavior. Do not copy these implementations into Core.

| Downstream paths | Required work when implementation is authorized |
| --- | --- |
| `domain/src/recording/{domain,events,observations,reducers,state}.ts` | Switch neutral type imports to new contracts/runtime barrels; keep URL/title/forms/scroll/DOM/sensitivity interpretation here. Existing reducer/extractor functions bind the canonical registry's trusted ports. |
| `domain/src/recording/web-state/{state-values,snapshot,visual-frame,tab-state,action-target,geometry}.ts` and `evidence/project.ts` | Consume canonical rich state, visual and target DTOs. Preserve element IDs, coordinate spaces, presentation/anchors, secret withholding and every existing identity signal. |
| `domain/src/web-panel-host.ts` | Register the trusted candidate normalization port beside current `web-recording-actions` mapper binding; import canonical mapper DTO/implementation ports. Keep browser event/action/click-landing/extraction/late-target policies here. |
| New `domain/src/recording/proposals/normalize-candidate.ts` plus its barrel | Own exact web target parameter normalization; reuse downstream fingerprint/descriptor builders, with byte-parity tests for legacy inputs. Do not call back into the Core browser normalizer as the final adapter implementation. |
| `domain/src/element-fingerprint/{build,from-descriptor,source}.ts` and `domain/src/output-nodes/targets/targets.ts` | Existing trusted web interpretation owners. Reuse as appropriate; do not broaden this read-only plan into a blanket rewrite of their richer recording/repair identity rules. |
| `apps/extension/src/background/connection/{recording-evidence,dom-snapshot,browser-state,active-page,index}.ts` and `apps/extension/src/content/{recorder,snapshots}.ts` | Reviewed as actual producer/consumer locations. Keep browser lifecycle/DOM/snapshot capture downstream. Their current generic gateway JSON envelopes do not require wire changes for the new Core seam. |

Relevant downstream checks are `domain/src/tests/{web-panel-host,recorded-identity-shortfall,page-evidence-joinery,core-gateway-recording-order}.test.ts`, recording/web-state and recording/proposals subject tests, and existing sensitivity/target identity projection tests. Only run touched subsets. Browser runs are not required to prove these type/algorithm moves and are not authorized by this brief.

### Concrete web normalizer dependency

The old Core normalizer is shared by proposal generation and additional runtime dispatch/repair paths outside R5. Extract its passive DTOs in group 1; move the active proposal-use closure through the registered domain normalizer in group 5. Remaining active calls belong to the R8/R6 adapter migration, not to a canonical fallback hidden behind an old function name. Preserve old exported functions during the staged migration, and make the remaining active owners explicit in the ledger. Never declare the entire browser semantic cut finished solely because R5 uses the new port.

## 7. Ownership boundaries for implementation briefs

A source brief for group 1 must authorize the listed model files, signal-registry and minimal validation/target/evidence slices; `S/normalization/**`; `S/runtime/recording-controller.ts`; new canonical directories/tests. Do not assume the report itself grants source ownership.

Cross-group shared files requiring explicit assignment/serialization:

- `C/automation-studio.ts`, contracts package public exports and `C/index.ts`: shared contract aliases/public integration.
- `S/model/index.ts`, `S/model/validation/index.ts`, Studio runtime/root barrels: export integration.
- `S/model/action-element-target.ts`: passive DTO/structural validation split vs active web normalizer; coordinate R8.
- `S/nodes/importer-sdk.ts` and native mapper registration/binding: recording declaration slice and added normalizer registration; coordinate R1.
- `S/storage/state-index.ts`: passive index/structural projection vs Studio reference policy.
- `S/runtime/service.ts`, `facade-ports.ts`, recording service composition and root framework/program wiring: adapter call sites only, with lead ownership until assigned.
- `S/runtime/recording-flow-proposal.ts` and `service/recordings/types.ts`: generic candidate shape vs artifact envelopes.
- Paired downstream host and candidate normalizer files: require a downstream bounded implementation brief, not unannounced source edits.

Add independent transitive program-import guards rooted at the new canonical state/recording barrels, including erased imports. Canonical tests also cannot import Studio for facade identity assertions; put those assertions beside the Studio compatibility facades. Use feature barrel imports without new import-boundary exceptions. No structure baseline remapping for moved violations.

## 8. Semantic risks and acceptance evidence

These are existing details to retain or explicitly resolve in a later authorized fix, not changes made by this investigation:

- Diff equality uses value JSON serialization plus type; presentation-only changes do not become deltas. Numeric and boolean transition classifications, confidence minimum and sorted namespace/path order must remain exact.
- State store clones constructor/read/update/snapshot/schema data, commits before notifying listeners, and reuses one event object across listeners. Recording append helpers share certain inputs rather than deep-cloning all of them. Do not silently impose a new clone contract.
- Registry reducer context contains the recording after its domain event append and the state before reducer application. Observation extractor sees that same context. Processing currently returns the last delta entry even when no new reducer state was appended; record and regression-test the observed behavior before any independent correctness fix.
- Normalization preserves raw recording, mutates neither it nor entries, renumbers normalized sequence, and derives `.delta` IDs/correlation metadata. Unused normalization options must not gain new behavior in an ownership migration.
- State content-reference acceptance and recording index ref scoping are policy decisions. Generic shape validation must not widen accepted image URLs or cross-project object references at the Studio adapter.
- Write-order draining, stop/start races and late finalized errors can lose or misattribute recordings if reordered. Replace `.catch(() => undefined)` finalized-status probing with an explicit classified adapter outcome only under a scoped behavior-equivalence test; no blanket failure-to-empty result in canonical code.
- The write queue currently splices a batch before awaiting its write. Preserve surfaced failure semantics; verify rejection and subsequent queue progress rather than adding silent retries or swallowing failures.
- Description validation/default open-project wording is Studio workflow policy. Neutral creation DTO remains usable without that product policy, while every existing Studio path binds it.
- The web target has richer recording/repair identity rules than Core's old normalizer. Parity fixtures must cover explicit target vs element precedence, typed text never becoming identity text, ARIA/implicit role/test IDs, bounds/attributes, redaction and context preservation. Never accept a losing identity field simply because the new adapter returns a target.

Planned validation, not run by this read-only brief:

1. Contracts package typecheck and targeted type/serialization compatibility tests; both shared broad evidence/signal aliases and rich Core aliases.
2. Canonical subject Vitest files for state/recording/index/mapping/gateway capture; closure tests statically traverse all imports including type-only edges and reject Studio paths.
3. Focused old facade identity tests for pure reexports; policy adapter behavior parity tests for wrappers.
4. After source stable, the exact existing service/mapper/IO/gateway and downstream recording tests named above, with package typechecks. Do not run package-wide/full suites per fix.
5. Scoped structural rule checks for new paths; the lead runs public package build/export and downstream integration checks on the stable combined tree.

## Investigation validation

Read-only commands used: `Get-Content` on the named brief/source/test/package files, `rg --files`, `rg -n`, `rg -l`, and Node read-only file/line inventory scripts in the paired Core/downstream worktrees. Observed: duplicate shared/Core authority, exact rich-only fields, generic implementation closures and the active web normalization dependency described above. A few candidate-path lookups returned file-not-found before the actual named import path was read; no source or environment state changed.

No tests, builds, typechecks, audits, provider calls, browser sessions or panel operations were run. No implementation or behavior has been verified. This report is a proposed extraction map for a new authorized source brief.
