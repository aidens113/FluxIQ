# Admission persistence and configured cohort ownership manifest

## Current State

Read-only preparation complete on 2026-11-02 while Root owns the common source freeze. Only this report was written. No test, build, typecheck, audit, source edit, git command, browser, panel, provider or agent was run. Existing canonical SQL foundation remains frozen. This is a finite implementation manifest, not runtime acceptance or a diagnosis of the stalled build.

Read release 2 in `runtime-ownership-refactor/reports/remaining-backend-owner-map.md` (its path is outside the reset-plan report folder). Source anchors and destination paths below are relative to `packages/fluxiq/src/`.

## Next executable order

1. **P1: move admission and command-ledger persistence together.** 22 admission source files plus 5 command-ledger source files, preserving one SQL/UnitOfWork/claim-link implementation. This batch can start after Root releases the current freeze; its canonical dependencies already exist. Do not wait for the candidate actor or copy either store.
2. **P2: move original tool companions/observer and retarget canonical aliases.** Its state is disjoint from P1. `tools/bind.ts` still requires the complete harness binding declaration described below; do not declare configured-tool migration complete while that edge remains.
3. **P3: canonicalize the explicit full session and command-owner contracts, then move the 11 continuation/service files as whole owners.** Keep the required command controller and consumed-proof reader original. No smaller session DTO, new receipt registry or copied controller is an acceptable shortcut.
4. **P4: close only the named candidate source/authority/interface slice, then move the two engine-assembly bodies.** Do not absorb candidate mode selection, cached/offline trial execution, judging, authoring loops, all of service.ts or the whole candidate actor. If rich contract prerequisites are unfinished, report this exact assembly edge rather than importing Studio canonically.

## Exact primary original-to-destination manifest

`index.ts` entries are public/compatibility barrels, not additional runtime authorities. Old implementation paths become exact aliases to the moved objects.

| Batch | Original | Destination |
| --- | --- | --- |
| P1 | `programs/automation-studio/storage/project/execution-admission/admission.ts` | `framework/persistence/project/execution-admission/admission.ts` |
| P1 | `programs/automation-studio/storage/project/execution-admission/codec.ts` | `framework/persistence/project/execution-admission/codec.ts` |
| P1 | `programs/automation-studio/storage/project/execution-admission/command-inventory.ts` | `framework/persistence/project/execution-admission/commands/inventory.ts` |
| P1 | `programs/automation-studio/storage/project/execution-admission/command-link.ts` | `framework/persistence/project/execution-admission/commands/link.ts` |
| P1 | `programs/automation-studio/storage/project/execution-admission/command-proof.ts` | `framework/persistence/project/execution-admission/commands/proof.ts` |
| P1 | `programs/automation-studio/storage/project/execution-admission/commands.ts` | `framework/persistence/project/execution-admission/commands/create.ts` |
| P1 | `programs/automation-studio/storage/project/execution-admission/context.ts` | `framework/persistence/project/execution-admission/context.ts` |
| P1 | `programs/automation-studio/storage/project/execution-admission/event.ts` | `framework/persistence/project/execution-admission/event.ts` |
| P1 | `programs/automation-studio/storage/project/execution-admission/evidence.ts` | `framework/persistence/project/execution-admission/evidence.ts` |
| P1 | `programs/automation-studio/storage/project/execution-admission/finish.ts` | `framework/persistence/project/execution-admission/finish.ts` |
| P1 | `programs/automation-studio/storage/project/execution-admission/index.ts` | `framework/persistence/project/execution-admission/index.ts` |
| P1 | `programs/automation-studio/storage/project/execution-admission/inventory.ts` | `framework/persistence/project/execution-admission/inventory.ts` |
| P1 | `programs/automation-studio/storage/project/execution-admission/migration.ts` | `framework/persistence/project/execution-admission/migration.ts` |
| P1 | `programs/automation-studio/storage/project/execution-admission/mutation.ts` | `framework/persistence/project/execution-admission/mutation.ts` |
| P1 | `programs/automation-studio/storage/project/execution-admission/proof.ts` | `framework/persistence/project/execution-admission/proof.ts` |
| P1 | `programs/automation-studio/storage/project/execution-admission/release.ts` | `framework/persistence/project/execution-admission/release.ts` |
| P1 | `programs/automation-studio/storage/project/execution-admission/rows.ts` | `framework/persistence/project/execution-admission/rows.ts` |
| P1 | `programs/automation-studio/storage/project/execution-admission/scope.ts` | `framework/persistence/project/execution-admission/scope.ts` |
| P1 | `programs/automation-studio/storage/project/execution-admission/snapshot.ts` | `framework/persistence/project/execution-admission/snapshot.ts` |
| P1 | `programs/automation-studio/storage/project/execution-admission/state.ts` | `framework/persistence/project/execution-admission/state.ts` |
| P1 | `programs/automation-studio/storage/project/execution-admission/store.ts` | `framework/persistence/project/execution-admission/store.ts` |
| P1 | `programs/automation-studio/storage/project/execution-admission/write.ts` | `framework/persistence/project/execution-admission/write.ts` |
| P1 | `programs/automation-studio/storage/project/command-ledger/admission.ts` | `framework/persistence/project/command-ledger/admission.ts` |
| P1 | `programs/automation-studio/storage/project/command-ledger/contracts.ts` | `framework/persistence/project/command-ledger/contracts.ts` |
| P1 | `programs/automation-studio/storage/project/command-ledger/index.ts` | `framework/persistence/project/command-ledger/index.ts` |
| P1 | `programs/automation-studio/storage/project/command-ledger/migration.ts` | `framework/persistence/project/command-ledger/migration.ts` |
| P1 | `programs/automation-studio/storage/project/command-ledger/store.ts` | `framework/persistence/project/command-ledger/store.ts` |
| P3 | `programs/automation-studio/runtime/service/execution-admission/binding.ts` | `runtime/flow-authoring/execution/admission/scope-owner.ts` |
| P3 | `programs/automation-studio/runtime/service/execution-admission/command-bridge.ts` | `runtime/flow-authoring/execution/admission/command-bridge.ts` |
| P3 | `programs/automation-studio/runtime/service/execution-admission/consumption-reader.ts` | `runtime/flow-authoring/execution/admission/consumption-reader.ts` |
| P3 | `programs/automation-studio/runtime/service/execution-admission/context.ts` | `runtime/flow-authoring/execution/admission/command-context.ts` |
| P3 | `programs/automation-studio/runtime/service/execution-admission/continuation.ts` | `runtime/flow-authoring/execution/admission/continuation.ts` |
| P3 | `programs/automation-studio/runtime/service/execution-admission/controller.ts` | `runtime/flow-authoring/execution/admission/controller.ts` |
| P3 | `programs/automation-studio/runtime/service/execution-admission/gateway.ts` | `runtime/flow-authoring/execution/admission/gateway-source.ts` |
| P3 | `programs/automation-studio/runtime/service/execution-admission/index.ts` | `runtime/flow-authoring/execution/admission/index.ts` |
| P3 | `programs/automation-studio/runtime/service/execution-admission/options.ts` | `runtime/flow-authoring/execution/admission/options.ts` |
| P3 | `programs/automation-studio/runtime/service/execution-admission/ports.ts` | `runtime/flow-authoring/execution/admission/ports.ts` |
| P3 | `programs/automation-studio/runtime/service/execution-admission/run.ts` | `runtime/flow-authoring/execution/admission/root-runs.ts` |
| P2 | `programs/automation-studio/runtime/build-execution/bind-tools.ts` | Compatibility export only; point at the new tools/engine integration owners, retain existing names |
| P4 | `programs/automation-studio/runtime/build-execution/create.ts` | `engine/automation/integration/build-execution/create.ts` |
| P2 | `programs/automation-studio/runtime/build-execution/forwarding/index.ts` | `runtime/flow-authoring/execution/tools/forwarding/index.ts` |
| P4 | `programs/automation-studio/runtime/build-execution/gateway-targets.ts` | `engine/automation/integration/build-execution/gateway-targets.ts` |
| P2 | `programs/automation-studio/runtime/build-execution/index.ts` | Compatibility export only; point at the new tools/engine integration owners, retain existing names |
| P2 | `programs/automation-studio/runtime/build-execution/tools/auxiliary-calls.ts` | `runtime/flow-authoring/execution/tools/auxiliary-calls.ts` |
| P2 | `programs/automation-studio/runtime/build-execution/tools/auxiliary.ts` | `runtime/flow-authoring/execution/tools/auxiliary.ts` |
| P2 blocked declaration | `programs/automation-studio/runtime/build-execution/tools/bind.ts` | `runtime/flow-authoring/execution/tools/bind.ts` |
| P2 | `programs/automation-studio/runtime/build-execution/tools/callback-context.ts` | `runtime/flow-authoring/execution/tools/callback-context.ts` |
| P2 | `programs/automation-studio/runtime/build-execution/tools/callback-scope.ts` | `runtime/flow-authoring/execution/tools/callback-scope.ts` |
| P2 | `programs/automation-studio/runtime/build-execution/tools/create.ts` | `runtime/flow-authoring/execution/tools/create.ts` |
| P2 | `programs/automation-studio/runtime/build-execution/tools/delegate.ts` | `runtime/flow-authoring/execution/tools/delegate.ts` |
| P2 | `programs/automation-studio/runtime/build-execution/tools/descendant.ts` | `runtime/flow-authoring/execution/tools/descendant.ts` |
| P2 | `programs/automation-studio/runtime/build-execution/tools/factory.ts` | `runtime/flow-authoring/execution/tools/factory.ts` |
| P2 | `programs/automation-studio/runtime/build-execution/tools/index.ts` | `runtime/flow-authoring/execution/tools/index.ts` |
| P2 | `programs/automation-studio/runtime/build-execution/tools/inherit.ts` | `runtime/flow-authoring/execution/tools/inherit.ts` |
| P2 | `programs/automation-studio/runtime/build-execution/tools/invoke.ts` | `runtime/flow-authoring/execution/tools/invoke.ts` |
| P2 | `programs/automation-studio/runtime/build-execution/tools/observer.ts` | `runtime/flow-authoring/execution/tools/observer.ts` |
| P2 | `programs/automation-studio/runtime/build-execution/tools/options.ts` | `runtime/flow-authoring/execution/tools/options.ts` |
| P2 | `programs/automation-studio/runtime/build-execution/tools/parking-port.ts` | `runtime/flow-authoring/execution/tools/parking-port.ts` |
| P2 | `programs/automation-studio/runtime/build-execution/tools/permission.ts` | `runtime/flow-authoring/execution/tools/permission.ts` |
| P2 | `programs/automation-studio/runtime/build-execution/tools/project.ts` | `runtime/flow-authoring/execution/tools/project.ts` |
| P2 | `programs/automation-studio/runtime/build-execution/tools/request.ts` | `runtime/flow-authoring/execution/tools/request.ts` |
| P2 | `programs/automation-studio/runtime/build-execution/tools/state.ts` | `runtime/flow-authoring/execution/tools/state.ts` |
| P2 | `programs/automation-studio/runtime/build-execution/tools/with-callback-scope.ts` | `runtime/flow-authoring/execution/tools/with-callback-scope.ts` |

The three inherited `command-` leaves become `commands/` (inventory/link/proof), with the existing command-link creator in `commands/create.ts` and a new `commands/index.ts`; this avoids creating a new shared-prefix audit violation. The command-ledger implementation must import the proof through this narrow command barrel, which does not export the admission store. Importing the admission root barrel from the command-ledger store would create a value cycle: admission store -> command-ledger store -> admission store. Preserve current erased type edges separately.

## Whole state that moves once

| Owner | State and identity that must stay together |
| --- | --- |
| Admission SQL store/context | Original lease, original UOW, original command-ledger store; pipelines Set, source-owner links WeakMap, closed flag and closing Promise. Context/rows/events/materializations/proof digest code move with it. |
| Admission command-link factory | One prepared WeakMap keyed by original ExecutionEntry, storing the exact transaction SQL executor, inventory snapshot, claim digest and required bit. `validate` and `insert` must continue on the same claim UOW mutation and original bridge/sourceOwner. |
| Command-ledger SQL store | Original lease/UOW; admissions WeakMap with exact nominal RunAdmission, runId/first/consumption owner and consumed ticket map; pipelines, close promise, exact executionAdmission link. Keep run fences, proof-join scans and receipt reconciliation. |
| Admission continuation controller | contexts WeakMap, continuations/openings Sets, captured original attestor callback/receiver, actual required-owner consumption reader, close lifetime. |
| Root runs / scope owner | Proof WeakMap and root-id Map; original ExecutionEntryBridge/reservation/root objects; stored binding, original proof, pinned trusted readBinding receiver and serialized attestation. |
| Gateway source / command context | Origins/proofs WeakMaps, used/context WeakSets, completion map, active/opening sets, captured provenance reader/function, registration/sourcePorts and close lifetime. Per-context observer, claims/operations/lease Sets, revoked/claimStarted/resolved/delivered flags and terminal Promise stay original. |
| Tool observer and companions | RetrySeriesOwner, BackendAttempts, captured original run-binding reader/issuer, lastCallbacks/descendantOwners WeakMaps; Requests.values, CallbackContexts.originals, Factories.originals, ProjectBuildToolObservers.values and AuxiliaryCalls.originals static WeakMaps. Callback-scope restoration arrays and permission objects remain the originals. |
| Candidate configured source and authority | Source toolParents/origins/admissions/evidence/authorities maps, frame/read-only registries, sourcePorts and configured flag; authority states/completed/prepared WeakMaps, coveredRetained WeakSet, frame identities, original modeOwner. Also move the single candidateTrialCompanions and candidateTrialFramePorts maps and the actual trialExecutionSources registry, retaining every old alias. |

Preserve source registration strings (`studio.gateway`, `studio.build.callbacks`, `studio.build.tools`), scope owner key `studio.flow`, migration IDs `0027_gateway_command_receipts_v1` and `0037_execution_admission_v1`, SQL bytes/order/checksums, mutation/request/proof digests, schema scan limits and page sizes. Assembly order stays native/output/automation/callbacks/gateway/trials/tools, with the same delegatesTo lists and original callback/native completion policy objects. These are persistent or private identity contracts, not labels to rename during the move.

## Exact shared declaration cuts

| Blocking declaration / current dependency | Canonical cut required before its consuming batch |
| --- | --- |
| `storage/project/execution-admission/context.ts` and store import `AutomationStudioProjectCommandLedgerStore`; command-ledger store imports command-link/inventory types and `readExecutionCommandLinkProof` | Include the original five-file command-ledger owner in P1, with canonical command proof imports as above. Do not wrap/duplicate it. Existing runtime/execution-admission and client-gateway/service/command-ledger contracts are already canonical. |
| `runtime/service/execution-admission/ports.ts`: full `AutomationStudioRuntimeSession` from model/runtime.ts | Move ONLY the original complete `AutomationStudioRuntimeSession` and `AutomationStudioRuntimeSessionStatus` declarations to `runtime/run-control/session/{session,status}.ts`, new barrel and run-control export. Preserve every field including full flow, optional trace/metadata/timestamps/target kind/id/project nullability. Its FlowDocument depends on the separate rich Flow manifest; trace is already engine/automation-owned and must import that owner directly. RuntimeActionAttempt is outside this session cut. |
| Same ports.ts: concrete `AutomationStudioCommandExecutionController` requiredOwner | Its actual consumed surface is `bindExecutionAdmissionBridge`, `owns` and `resolve`, with full original Context/Bridge/ConsumptionReader/Lease signatures and receiver behavior. Root must freeze a genuine canonical required-owner capability contract or move the existing controller as its own explicit engine-integration batch. This report does not silently replace the concrete owner by a weakened DTO or clone. Admission command-bridge.ts also depends on canonical P1 ledger/RunAdmission types. |
| `runtime/build-execution/tools/bind.ts` uses `AutomationStudioHarnessOptionLoopBinding` from llm/harness-options/registry.ts:86 | Move the COMPLETE original binding type to a named canonical agent/harness contract, keeping tools, executeTool and observedStateKeys. Keep executeTool input callId/toolId/value/signal/referenceNow/permission and the full JsonValue-or-ToolExecutionResult return. PermissionCheck already has a canonical flows/executable/permissions alias. Do not replace rich returns with JsonObject/unknown or a few fields. |
| Full harness binding return: `AutomationStudioLlmEvidenceToolExecutionResult`, llm/evidence-loop/tool-execution.ts:12; tool declaration via evidence-loop/tool.ts | Canonicalize their complete original declarations (including every optional control/draft field), not the evidence-loop actor. Result imports four full FlowDraft step contracts: Change, Condition, Replay, Toggle. These are exact additional type prerequisites; no need to read/move all llm runtime. |
| `candidate-trials/contracts/source-input.ts` names engine AutomationExecutionAdmissionSource and concrete AutomationStudioBuildToolObserver; `input.ts` names concrete configured source; configured-source.ts constructs actual source.ts Authority | Retarget the full source input to the original canonical tool observer from P2 and existing engine source. Move the exact candidate mechanism slice below; an import of old Authority through its barrel would still be a canonical-to-Studio dependency. |
| Candidate rich contracts in `runtime/flow-bootstrap/candidate/contracts.ts`: FlowCandidate:32, TrialRequest:74, TrialResult:136, TrialPort:187 | Freeze/move their complete original declarations plus locally referenced Prepared/Act and related types. Preserve buildPlan/fingerprint/original-instruction digest; startedWith/earlierAdvice/siteChange callback; sampleRows/acts/absorbedByStartReset; optional prepareStart/environmentKind/offlineFirst. Named dependencies include FlowBuildPlan, TrialChangeAct/Outcome, ResultEarlierAdvice, SiteResetTrialActPlace, TrialOfflineFirst and TrialPrepared. No broad candidate actor move is implied. |
| `candidate-trials/observation/offline-runner.ts`: TrialOfflineRunner; its observe accepts `AutomationStudioCandidateTrialRecord` from service/candidate-trial/contracts.ts:52 | Move the complete runner interface plus original record/start/learned-pace declarations to canonical trial contracts. Record retains traceId, all start/execution/verdict/code/learnedPaces/judgedAgain/firstAskConfirmed/judge fields. Do not move the offline runner/judge implementation or whole service candidate actor in this cut. |

Existing aliases that can be retargeted immediately without redesign: `PartialTrialContext` is exactly `AuthoringExecutionContext` at runtime/flow-authoring/execution/observation; `AutomationStudioSiteResetObservation` is exactly AuthoringExecutionScope there; reset callback policies are exactly ExecutionCallbackPolicies at runtime/execution-observation/policies; AutomationStudioParkingPort is already runtime/parking-owned. Preserve the full original context/tool contract; its existing tool port is not a new alternate registry.

## Exact candidate binding/mechanism extension

This is the bounded source/authority companion slice required by assembly, conditional on the shared declarations above. Move actual maps/classes once; do not move wrappers alone. Destination root is `runtime/flow-authoring/execution/trials/` and each directory receives its own barrel. The remaining mode actor, caches, trial execution, judging and authoring loops remain explicitly outside this batch.

| Original beneath candidate-trials/ | Destination beneath canonical trials/ |
| --- | --- |
| `authority/configured-source.ts` | `authority/configured-source.ts` |
| `authority/source.ts` | `authority/source.ts` |
| `authority/state.ts` | `authority/state.ts` |
| `authority/registry.ts` | `authority/registry.ts` |
| `authority/request-key.ts` | `authority/request-key.ts` |
| `authority/is-frame.ts` | `authority/is-frame.ts` |
| `authority/frame-ports.ts` | `authority/frame-ports.ts` |
| `authority/bind-frame.ts` | `authority/bind-frame.ts` |
| `contracts/authority.ts` | `contracts/authority.ts` |
| `contracts/checkout.ts` | `contracts/checkout.ts` |
| `contracts/completed.ts` | `contracts/completed.ts` |
| `contracts/completion.ts` | `contracts/completion.ts` |
| `contracts/input.ts` | `contracts/input.ts` |
| `contracts/mode-owner.ts` | `contracts/mode-owner.ts` |
| `contracts/mode.ts` | `contracts/mode.ts` |
| `contracts/phase.ts` | `contracts/phase.ts` |
| `contracts/read-only-call.ts` | `contracts/read-only-call.ts` |
| `contracts/read-only-lease.ts` | `contracts/read-only-lease.ts` |
| `contracts/snapshot.ts` | `contracts/snapshot.ts` |
| `contracts/source-input.ts` | `contracts/source-input.ts` |
| `contracts/trial-receiver.ts` | `contracts/trial-receiver.ts` |
| `observation/offline-runner.ts` | `observation/offline-runner.ts` |
| `observation/source-registry.ts` | `observation/source-registry.ts` |
| `observation/source.ts` | `observation/source.ts` |
| `observation/bind-source.ts` | `observation/bind-source.ts` |
| `observation/inherit-source.ts` | `observation/inherit-source.ts` |

The authority class retains the original modeOwner interface rather than importing the later mode implementation. The old authority/registry and frame-ports modules must become aliases so existing bind-mode/bind-frame users still reach the same private maps. Read-only binding-level import tracing from configured-source found seven core authority leaves, thirteen contract leaves and offline-runner; the four source-registry helpers plus bind-frame above preserve their actual binding companions. This is source metadata, not a type-erased closure verdict.

## Public export files (Root-owned)

- New `framework/persistence/project/execution-admission/index.ts`, `.../execution-admission/commands/index.ts`, `.../command-ledger/index.ts`; extend existing `framework/persistence/project/index.ts`. Existing `framework/persistence/index.ts` already exports project after P1 SQL foundation. Public server seam remains `fluxiq/framework/persistence`.
- New `runtime/flow-authoring/execution/{admission,tools,trials}/index.ts`, tools/forwarding barrel and trial child barrels; extend existing execution/index.ts (flow-authoring/index.ts already exports execution). Public seam already exists: `fluxiq/runtime/flow-authoring/execution`. Session prerequisite additionally needs runtime/run-control/session/index.ts and run-control/index.ts.
- New `engine/automation/integration/build-execution/index.ts`; extend existing engine/automation/integration/index.ts. Public engine seam already exists: `fluxiq/engine/automation`. Do not put engine-dependent create into runtime.
- Retain every old storage, execution-admission, build-execution, tools and forwarding export name as identity-preserving aliases. No new package.json export is required for these three existing seams. Alias/compatibility tests that import program paths belong under the legacy/shared tests ownership, not inside a canonical subtree forbidden from reaching programs.

## Direct source consumer manifest

93 files outside the four primary source roots have 226 direct static/type import/export edges to them. Edges inside the roots are owned by their move. This scan does not claim all indirect named-barrel, computed-load, generated-child-code or downstream consumers; Root must inspect emitted public-package and full source/type closure after the move.

| Consumer | Exact referenced targets (source line) |
| --- | --- |
| `programs/automation-studio/runtime/build-execution/bind-tools.ts` | `programs/automation-studio/runtime/build-execution/tools/index.ts` (1) |
| `programs/automation-studio/runtime/build-execution/create.ts` | `programs/automation-studio/runtime/service/execution-admission/index.ts` (6); `programs/automation-studio/runtime/build-execution/tools/index.ts` (7) |
| `programs/automation-studio/runtime/build-execution/index.ts` | `programs/automation-studio/runtime/build-execution/create.ts` (1); `programs/automation-studio/runtime/build-execution/bind-tools.ts` (2); `programs/automation-studio/runtime/build-execution/gateway-targets.ts` (3); `programs/automation-studio/runtime/build-execution/tools/index.ts` (4) |
| `programs/automation-studio/runtime/build-execution/tools/auxiliary-calls.ts` | `programs/automation-studio/runtime/build-execution/tools/callback-context.ts` (2); `programs/automation-studio/runtime/build-execution/tools/request.ts` (3) |
| `programs/automation-studio/runtime/build-execution/tools/auxiliary.ts` | `programs/automation-studio/runtime/build-execution/tools/auxiliary-calls.ts` (2) |
| `programs/automation-studio/runtime/build-execution/tools/bind.ts` | `programs/automation-studio/runtime/build-execution/tools/observer.ts` (2); `programs/automation-studio/runtime/build-execution/tools/factory.ts` (3); `programs/automation-studio/runtime/build-execution/tools/project.ts` (4) |
| `programs/automation-studio/runtime/build-execution/tools/callback-scope.ts` | `programs/automation-studio/runtime/build-execution/tools/request.ts` (3); `programs/automation-studio/runtime/build-execution/tools/callback-context.ts` (4) |
| `programs/automation-studio/runtime/build-execution/tools/delegate.ts` | `programs/automation-studio/runtime/build-execution/tools/callback-context.ts` (2); `programs/automation-studio/runtime/build-execution/tools/request.ts` (3); `programs/automation-studio/runtime/build-execution/tools/invoke.ts` (4) |
| `programs/automation-studio/runtime/build-execution/tools/index.ts` | `programs/automation-studio/runtime/build-execution/tools/options.ts` (1); `programs/automation-studio/runtime/build-execution/tools/observer.ts` (2); `programs/automation-studio/runtime/build-execution/tools/create.ts` (3); `programs/automation-studio/runtime/build-execution/tools/project.ts` (4); `programs/automation-studio/runtime/build-execution/tools/callback-scope.ts` (5); `programs/automation-studio/runtime/build-execution/tools/bind.ts` (6); `programs/automation-studio/runtime/build-execution/forwarding/index.ts` (7) |
| `programs/automation-studio/runtime/build-execution/tools/invoke.ts` | `programs/automation-studio/runtime/build-execution/tools/request.ts` (2) |
| `programs/automation-studio/runtime/build-execution/tools/observer.ts` | `programs/automation-studio/runtime/build-execution/tools/options.ts` (6); `programs/automation-studio/runtime/build-execution/tools/state.ts` (7); `programs/automation-studio/runtime/build-execution/tools/factory.ts` (8); `programs/automation-studio/runtime/build-execution/tools/request.ts` (9); `programs/automation-studio/runtime/build-execution/tools/callback-scope.ts` (10); `programs/automation-studio/runtime/build-execution/tools/with-callback-scope.ts` (11); `programs/automation-studio/runtime/build-execution/tools/auxiliary-calls.ts` (12); `programs/automation-studio/runtime/build-execution/tools/project.ts` (13); `programs/automation-studio/runtime/build-execution/tools/permission.ts` (14) |
| `programs/automation-studio/runtime/build-execution/tools/parking-port.ts` | `programs/automation-studio/runtime/build-execution/tools/auxiliary-calls.ts` (2) |
| `programs/automation-studio/runtime/build-execution/tools/permission.ts` | `programs/automation-studio/runtime/build-execution/tools/state.ts` (2); `programs/automation-studio/runtime/build-execution/tools/request.ts` (3); `programs/automation-studio/runtime/build-execution/tools/callback-context.ts` (4) |
| `programs/automation-studio/runtime/build-execution/tools/state.ts` | `programs/automation-studio/runtime/build-execution/tools/observer.ts` (4) |
| `programs/automation-studio/runtime/build-execution/tools/tests/auxiliary.test.ts` | `programs/automation-studio/runtime/build-execution/tools/index.ts` (2); `programs/automation-studio/runtime/build-execution/tools/tests/fixture.ts` (5) |
| `programs/automation-studio/runtime/build-execution/tools/tests/callback-scope.test.ts` | `programs/automation-studio/runtime/build-execution/tools/index.ts` (3); `programs/automation-studio/runtime/build-execution/tools/tests/fixture.ts` (4); `programs/automation-studio/runtime/build-execution/tools/tests/host.ts` (5) |
| `programs/automation-studio/runtime/build-execution/tools/tests/fixture.ts` | `programs/automation-studio/runtime/build-execution/tools/index.ts` (6) |
| `programs/automation-studio/runtime/build-execution/tools/tests/parent.test.ts` | `programs/automation-studio/runtime/build-execution/bind-tools.ts` (5); `programs/automation-studio/runtime/build-execution/tools/index.ts` (6); `programs/automation-studio/runtime/build-execution/tools/tests/fixture.ts` (7); `programs/automation-studio/runtime/build-execution/tools/tests/host.ts` (8) |
| `programs/automation-studio/runtime/build-execution/tools/tests/producer.test.ts` | `programs/automation-studio/runtime/build-execution/bind-tools.ts` (4); `programs/automation-studio/runtime/build-execution/tools/tests/host.ts` (6); `programs/automation-studio/runtime/build-execution/tools/tests/fixture.ts` (7) |
| `programs/automation-studio/runtime/candidate-trials/authority/tests/configured-source.test.ts` | `programs/automation-studio/storage/project/execution-admission/index.ts` (4); `programs/automation-studio/storage/project/execution-admission/tests/fixture.ts` (5) |
| `programs/automation-studio/runtime/candidate-trials/authority/tests/entrances.test.ts` | `programs/automation-studio/storage/project/execution-admission/tests/fixture.ts` (3) |
| `programs/automation-studio/runtime/candidate-trials/authority/tests/source.test.ts` | `programs/automation-studio/storage/project/execution-admission/index.ts` (7); `programs/automation-studio/storage/project/execution-admission/tests/fixture.ts` (8) |
| `programs/automation-studio/runtime/candidate-trials/contracts/source-input.ts` | `programs/automation-studio/runtime/build-execution/tools/index.ts` (4) |
| `programs/automation-studio/runtime/candidate-trials/partial/tests/admission.test.ts` | `programs/automation-studio/storage/project/execution-admission/index.ts` (4); `programs/automation-studio/storage/project/execution-admission/tests/fixture.ts` (5) |
| `programs/automation-studio/runtime/candidate-trials/partial/tests/observe.test.ts` | `programs/automation-studio/runtime/build-execution/tools/tests/fixture.ts` (2) |
| `programs/automation-studio/runtime/flow-bootstrap/action-permissions.ts` | `programs/automation-studio/runtime/build-execution/tools/index.ts` (151) |
| `programs/automation-studio/runtime/flow-bootstrap/candidate/authoring-loop.ts` | `programs/automation-studio/runtime/build-execution/tools/index.ts` (15) |
| `programs/automation-studio/runtime/flow-bootstrap/candidate/tests/authoring-loop.test.ts` | `programs/automation-studio/runtime/build-execution/index.ts` (14); `programs/automation-studio/runtime/build-execution/tools/tests/fixture.ts` (15) |
| `programs/automation-studio/runtime/flow-bootstrap/reset-observation/tests/finish.test.ts` | `programs/automation-studio/runtime/build-execution/tools/tests/fixture.ts` (5) |
| `programs/automation-studio/runtime/flow-bootstrap/reset-observation/tests/invoke.test.ts` | `programs/automation-studio/runtime/build-execution/tools/tests/fixture.ts` (4) |
| `programs/automation-studio/runtime/flow-bootstrap/reset-observation/tests/result-policy.test.ts` | `programs/automation-studio/runtime/build-execution/tools/tests/fixture.ts` (2) |
| `programs/automation-studio/runtime/flow-bootstrap/reset-observation/tests/start-state.test.ts` | `programs/automation-studio/runtime/build-execution/tools/tests/fixture.ts` (5) |
| `programs/automation-studio/runtime/flow-bootstrap/site-reset/start-check.ts` | `programs/automation-studio/runtime/build-execution/tools/index.ts` (70) |
| `programs/automation-studio/runtime/flow-bootstrap/site-reset/tests/project-ledger-completion.test.ts` | `programs/automation-studio/storage/project/execution-admission/tests/fixture.ts` (9) |
| `programs/automation-studio/runtime/flow-bootstrap/subflow-candidate/builder-loop.ts` | `programs/automation-studio/runtime/build-execution/tools/index.ts` (197) |
| `programs/automation-studio/runtime/flow-bootstrap/subflow-candidate/tests/builder-loop.test.ts` | `programs/automation-studio/runtime/build-execution/index.ts` (19); `programs/automation-studio/runtime/build-execution/tools/tests/fixture.ts` (20) |
| `programs/automation-studio/runtime/llm/harness-options/binding.ts` | `programs/automation-studio/runtime/build-execution/tools/index.ts` (14) |
| `programs/automation-studio/runtime/llm/harness-options/plan-parameter-resolution.ts` | `programs/automation-studio/runtime/build-execution/tools/index.ts` (173) |
| `programs/automation-studio/runtime/llm/harness-options/registry.ts` | `programs/automation-studio/runtime/build-execution/tools/index.ts` (1) |
| `programs/automation-studio/runtime/parking/person-needed-tool-calls.ts` | `programs/automation-studio/runtime/build-execution/forwarding/index.ts` (45) |
| `programs/automation-studio/runtime/project-agents/record-completion/tests/fixture.ts` | `programs/automation-studio/storage/project/execution-admission/tests/fixture.ts` (4); `programs/automation-studio/storage/project/execution-admission/index.ts` (5) |
| `programs/automation-studio/runtime/project-agents/record-completion/tests/store-completion.test.ts` | `programs/automation-studio/storage/project/execution-admission/index.ts` (8); `programs/automation-studio/storage/project/execution-admission/tests/fixture.ts` (9) |
| `programs/automation-studio/runtime/project-agents/start-check/execution.ts` | `programs/automation-studio/runtime/build-execution/tools/index.ts` (1) |
| `programs/automation-studio/runtime/route-state/build-routing.ts` | `programs/automation-studio/runtime/build-execution/tools/index.ts` (11) |
| `programs/automation-studio/runtime/service.ts` | `programs/automation-studio/runtime/build-execution/index.ts` (9); `programs/automation-studio/runtime/service/execution-admission/index.ts` (11) |
| `programs/automation-studio/runtime/service/command-execution/controller.ts` | `programs/automation-studio/runtime/service/execution-admission/index.ts` (7) |
| `programs/automation-studio/runtime/service/command-run/controller.ts` | `programs/automation-studio/runtime/service/execution-admission/index.ts` (5) |
| `programs/automation-studio/runtime/service/execution-admission/binding.ts` | `programs/automation-studio/storage/project/execution-admission/index.ts` (4) |
| `programs/automation-studio/runtime/service/execution-admission/command-bridge.ts` | `programs/automation-studio/storage/project/command-ledger/index.ts` (2) |
| `programs/automation-studio/runtime/service/execution-admission/context.ts` | `programs/automation-studio/storage/project/command-ledger/index.ts` (3); `programs/automation-studio/storage/project/execution-admission/index.ts` (5) |
| `programs/automation-studio/runtime/service/execution-admission/continuation.ts` | `programs/automation-studio/runtime/service/execution-admission/gateway.ts` (3) |
| `programs/automation-studio/runtime/service/execution-admission/controller.ts` | `programs/automation-studio/storage/project/execution-admission/index.ts` (3); `programs/automation-studio/storage/project/command-ledger/index.ts` (4); `programs/automation-studio/runtime/service/execution-admission/continuation.ts` (5); `programs/automation-studio/runtime/service/execution-admission/ports.ts` (6); `programs/automation-studio/runtime/service/execution-admission/options.ts` (7); `programs/automation-studio/runtime/service/execution-admission/command-bridge.ts` (8); `programs/automation-studio/runtime/service/execution-admission/consumption-reader.ts` (9); `programs/automation-studio/runtime/service/execution-admission/binding.ts` (10); `programs/automation-studio/runtime/service/execution-admission/run.ts` (11); `programs/automation-studio/runtime/service/execution-admission/gateway.ts` (12); `programs/automation-studio/runtime/service/execution-admission/context.ts` (13) |
| `programs/automation-studio/runtime/service/execution-admission/gateway.ts` | `programs/automation-studio/storage/project/execution-admission/index.ts` (4); `programs/automation-studio/runtime/service/execution-admission/ports.ts` (5); `programs/automation-studio/runtime/service/execution-admission/context.ts` (6); `programs/automation-studio/runtime/service/execution-admission/run.ts` (7) |
| `programs/automation-studio/runtime/service/execution-admission/run.ts` | `programs/automation-studio/storage/project/execution-admission/index.ts` (3) |
| `programs/automation-studio/runtime/service/execution-admission/tests/build-tools.test.ts` | `programs/automation-studio/storage/project/execution-admission/tests/fixture.ts` (5); `programs/automation-studio/runtime/service/execution-admission/index.ts` (6) |
| `programs/automation-studio/runtime/service/execution-admission/tests/fixture.ts` | `programs/automation-studio/runtime/service/execution-admission/index.ts` (6); `programs/automation-studio/storage/project/execution-admission/tests/fixture.ts` (7) |
| `programs/automation-studio/runtime/service/execution-admission/tests/gateway.test.ts` | `programs/automation-studio/storage/project/execution-admission/index.ts` (4); `programs/automation-studio/runtime/service/execution-admission/tests/fixture.ts` (5) |
| `programs/automation-studio/runtime/service/execution-admission/tests/lost-ack.test.ts` | `programs/automation-studio/runtime/service/execution-admission/controller.ts` (8); `programs/automation-studio/runtime/service/execution-admission/tests/fixture.ts` (9); `programs/automation-studio/runtime/service/execution-admission/tests/resource-owner.ts` (10) |
| `programs/automation-studio/runtime/service/execution-admission/tests/required.test.ts` | `programs/automation-studio/runtime/service/execution-admission/index.ts` (14) |
| `programs/automation-studio/runtime/service/execution-admission/tests/scope-owner.test.ts` | `programs/automation-studio/storage/project/execution-admission/tests/fixture.ts` (6); `programs/automation-studio/runtime/service/execution-admission/controller.ts` (8); `programs/automation-studio/runtime/service/execution-admission/continuation.ts` (10); `programs/automation-studio/runtime/service/execution-admission/tests/resource-owner.ts` (11) |
| `programs/automation-studio/runtime/service/flow-bootstrap-commands/cancellation.ts` | `programs/automation-studio/runtime/build-execution/tools/index.ts` (3) |
| `programs/automation-studio/runtime/service/project-build-toggles/tests/toggles-record-completion.test.ts` | `programs/automation-studio/storage/project/execution-admission/tests/fixture.ts` (8) |
| `programs/automation-studio/runtime/service/project-build/brief-ports.ts` | `programs/automation-studio/runtime/build-execution/index.ts` (2); `programs/automation-studio/runtime/build-execution/tools/index.ts` (3) |
| `programs/automation-studio/runtime/service/project-build/subflow-trials.ts` | `programs/automation-studio/runtime/build-execution/tools/index.ts` (23) |
| `programs/automation-studio/runtime/service/project-build/tests/acts-record-completion.test.ts` | `programs/automation-studio/storage/project/execution-admission/tests/fixture.ts` (10) |
| `programs/automation-studio/runtime/service/project-build/tests/reset-calls.test.ts` | `programs/automation-studio/storage/project/execution-admission/index.ts` (9); `programs/automation-studio/storage/project/execution-admission/tests/fixture.ts` (10) |
| `programs/automation-studio/runtime/service/tests/spend-completion.test.ts` | `programs/automation-studio/storage/project/execution-admission/index.ts` (9); `programs/automation-studio/storage/project/execution-admission/tests/fixture.ts` (10) |
| `programs/automation-studio/runtime/tests/project-tool-wrappers.test.ts` | `programs/automation-studio/runtime/build-execution/index.ts` (10); `programs/automation-studio/runtime/build-execution/tools/tests/fixture.ts` (12); `programs/automation-studio/runtime/build-execution/tools/tests/host.ts` (13); `programs/automation-studio/runtime/build-execution/tools/index.ts` (17) |
| `programs/automation-studio/storage/project/command-ledger/store.ts` | `programs/automation-studio/storage/project/command-ledger/contracts.ts` (6); `programs/automation-studio/storage/project/command-ledger/admission.ts` (7); `programs/automation-studio/storage/project/command-ledger/migration.ts` (8); `programs/automation-studio/storage/project/execution-admission/index.ts` (10); `programs/automation-studio/storage/project/execution-admission/command-proof.ts` (12) |
| `programs/automation-studio/storage/project/command-ledger/tests/run-fence.test.ts` | `programs/automation-studio/storage/project/command-ledger/index.ts` (8) |
| `programs/automation-studio/storage/project/command-ledger/tests/store.test.ts` | `programs/automation-studio/storage/project/command-ledger/index.ts` (7) |
| `programs/automation-studio/storage/project/execution-admission/admission.ts` | `programs/automation-studio/storage/project/execution-admission/codec.ts` (5); `programs/automation-studio/storage/project/execution-admission/mutation.ts` (6); `programs/automation-studio/storage/project/execution-admission/state.ts` (7); `programs/automation-studio/storage/project/execution-admission/context.ts` (8); `programs/automation-studio/storage/project/execution-admission/rows.ts` (9); `programs/automation-studio/storage/project/execution-admission/event.ts` (10) |
| `programs/automation-studio/storage/project/execution-admission/codec.ts` | `programs/automation-studio/storage/project/execution-admission/rows.ts` (3); `programs/automation-studio/storage/project/execution-admission/event.ts` (4) |
| `programs/automation-studio/storage/project/execution-admission/command-proof.ts` | `programs/automation-studio/storage/project/execution-admission/codec.ts` (5); `programs/automation-studio/storage/project/execution-admission/proof.ts` (6); `programs/automation-studio/storage/project/execution-admission/rows.ts` (7) |
| `programs/automation-studio/storage/project/execution-admission/commands.ts` | `programs/automation-studio/storage/project/execution-admission/inventory.ts` (4); `programs/automation-studio/storage/project/execution-admission/state.ts` (5); `programs/automation-studio/storage/project/execution-admission/proof.ts` (6); `programs/automation-studio/storage/project/execution-admission/write.ts` (7); `programs/automation-studio/storage/project/execution-admission/codec.ts` (8); `programs/automation-studio/storage/project/execution-admission/command-link.ts` (9); `programs/automation-studio/storage/project/execution-admission/context.ts` (10); `programs/automation-studio/storage/project/execution-admission/snapshot.ts` (11) |
| `programs/automation-studio/storage/project/execution-admission/context.ts` | `programs/automation-studio/storage/project/command-ledger/index.ts` (3) |
| `programs/automation-studio/storage/project/execution-admission/evidence.ts` | `programs/automation-studio/storage/project/execution-admission/mutation.ts` (5); `programs/automation-studio/storage/project/execution-admission/state.ts` (6); `programs/automation-studio/storage/project/execution-admission/context.ts` (7) |
| `programs/automation-studio/storage/project/execution-admission/finish.ts` | `programs/automation-studio/storage/project/execution-admission/mutation.ts` (3); `programs/automation-studio/storage/project/execution-admission/state.ts` (4); `programs/automation-studio/storage/project/execution-admission/context.ts` (5) |
| `programs/automation-studio/storage/project/execution-admission/inventory.ts` | `programs/automation-studio/storage/project/execution-admission/codec.ts` (5); `programs/automation-studio/storage/project/execution-admission/proof.ts` (6); `programs/automation-studio/storage/project/execution-admission/context.ts` (7); `programs/automation-studio/storage/project/execution-admission/rows.ts` (8); `programs/automation-studio/storage/project/execution-admission/snapshot.ts` (9); `programs/automation-studio/storage/project/execution-admission/event.ts` (10); `programs/automation-studio/storage/project/execution-admission/state.ts` (11) |
| `programs/automation-studio/storage/project/execution-admission/mutation.ts` | `programs/automation-studio/storage/project/execution-admission/codec.ts` (3); `programs/automation-studio/storage/project/execution-admission/inventory.ts` (4); `programs/automation-studio/storage/project/execution-admission/proof.ts` (5); `programs/automation-studio/storage/project/execution-admission/write.ts` (6); `programs/automation-studio/storage/project/execution-admission/context.ts` (7); `programs/automation-studio/storage/project/execution-admission/event.ts` (8); `programs/automation-studio/storage/project/execution-admission/snapshot.ts` (9) |
| `programs/automation-studio/storage/project/execution-admission/proof.ts` | `programs/automation-studio/storage/project/execution-admission/codec.ts` (4); `programs/automation-studio/storage/project/execution-admission/event.ts` (5) |
| `programs/automation-studio/storage/project/execution-admission/release.ts` | `programs/automation-studio/storage/project/execution-admission/mutation.ts` (3); `programs/automation-studio/storage/project/execution-admission/state.ts` (4); `programs/automation-studio/storage/project/execution-admission/context.ts` (5) |
| `programs/automation-studio/storage/project/execution-admission/scope.ts` | `programs/automation-studio/storage/project/execution-admission/mutation.ts` (4); `programs/automation-studio/storage/project/execution-admission/context.ts` (5); `programs/automation-studio/storage/project/execution-admission/rows.ts` (6) |
| `programs/automation-studio/storage/project/execution-admission/snapshot.ts` | `programs/automation-studio/storage/project/execution-admission/rows.ts` (2); `programs/automation-studio/storage/project/execution-admission/event.ts` (3) |
| `programs/automation-studio/storage/project/execution-admission/state.ts` | `programs/automation-studio/storage/project/execution-admission/rows.ts` (3); `programs/automation-studio/storage/project/execution-admission/snapshot.ts` (4); `programs/automation-studio/storage/project/execution-admission/event.ts` (5) |
| `programs/automation-studio/storage/project/execution-admission/store.ts` | `programs/automation-studio/storage/project/command-ledger/index.ts` (7); `programs/automation-studio/storage/project/execution-admission/migration.ts` (8); `programs/automation-studio/storage/project/execution-admission/scope.ts` (9); `programs/automation-studio/storage/project/execution-admission/admission.ts` (10); `programs/automation-studio/storage/project/execution-admission/evidence.ts` (11); `programs/automation-studio/storage/project/execution-admission/finish.ts` (12); `programs/automation-studio/storage/project/execution-admission/release.ts` (13); `programs/automation-studio/storage/project/execution-admission/inventory.ts` (14); `programs/automation-studio/storage/project/execution-admission/state.ts` (15); `programs/automation-studio/storage/project/execution-admission/commands.ts` (16); `programs/automation-studio/storage/project/execution-admission/context.ts` (17); `programs/automation-studio/storage/project/execution-admission/command-link.ts` (18) |
| `programs/automation-studio/storage/project/execution-admission/tests/commands.test.ts` | `programs/automation-studio/storage/project/command-ledger/index.ts` (5); `programs/automation-studio/storage/project/execution-admission/tests/fixture.ts` (6); `programs/automation-studio/storage/project/execution-admission/tests/command-source.ts` (7); `programs/automation-studio/storage/project/execution-admission/index.ts` (8) |
| `programs/automation-studio/storage/project/execution-admission/tests/fixture.ts` | `programs/automation-studio/storage/project/execution-admission/index.ts` (5) |
| `programs/automation-studio/storage/project/execution-admission/tests/store.test.ts` | `programs/automation-studio/storage/project/execution-admission/index.ts` (4); `programs/automation-studio/storage/project/execution-admission/tests/fixture.ts` (5) |
| `programs/automation-studio/storage/project/execution-admission/write.ts` | `programs/automation-studio/storage/project/execution-admission/event.ts` (2); `programs/automation-studio/storage/project/execution-admission/rows.ts` (8); `programs/automation-studio/storage/project/execution-admission/rows.ts` (12); `programs/automation-studio/storage/project/execution-admission/rows.ts` (19); `programs/automation-studio/storage/project/execution-admission/rows.ts` (23) |
| `programs/automation-studio/storage/project/index.ts` | `programs/automation-studio/storage/project/command-ledger/index.ts` (36) |
| `programs/automation-studio/storage/project/tests/administration.test.ts` | `programs/automation-studio/storage/project/command-ledger/index.ts` (15) |
| `tests/native-repository-completion.test.ts` | `programs/automation-studio/storage/project/execution-admission/index.ts` (13); `programs/automation-studio/storage/project/execution-admission/tests/fixture.ts` (14) |

## Original test/support manifest and future acceptance

No test ran during preparation. Keep these original oracles and their test data. SQL acceptance uses temporary fixtures and retains real-sql markers. Cross-owner integration tests may remain in their legacy test directories with imports retargeted to canonical subjects.

- `programs/automation-studio/storage/project/execution-admission/tests/command-source.ts`
- `programs/automation-studio/storage/project/execution-admission/tests/commands.test.ts`
- `programs/automation-studio/storage/project/execution-admission/tests/fixture.ts`
- `programs/automation-studio/storage/project/execution-admission/tests/inventory.test.ts`
- `programs/automation-studio/storage/project/execution-admission/tests/store.test.ts`
- `programs/automation-studio/storage/project/command-ledger/tests/process-restart.test.ts`
- `programs/automation-studio/storage/project/command-ledger/tests/run-fence.test.ts`
- `programs/automation-studio/storage/project/command-ledger/tests/store.test.ts`
- `programs/automation-studio/runtime/service/execution-admission/tests/build-tools.test.ts`
- `programs/automation-studio/runtime/service/execution-admission/tests/fixture.ts`
- `programs/automation-studio/runtime/service/execution-admission/tests/gateway.test.ts`
- `programs/automation-studio/runtime/service/execution-admission/tests/lost-ack.test.ts`
- `programs/automation-studio/runtime/service/execution-admission/tests/required.test.ts`
- `programs/automation-studio/runtime/service/execution-admission/tests/resource-owner.ts`
- `programs/automation-studio/runtime/service/execution-admission/tests/scope-owner.test.ts`
- `programs/automation-studio/runtime/build-execution/forwarding/tests/index.test.ts`
- `programs/automation-studio/runtime/build-execution/tools/tests/auxiliary.test.ts`
- `programs/automation-studio/runtime/build-execution/tools/tests/callback-scope.test.ts`
- `programs/automation-studio/runtime/build-execution/tools/tests/fixture.ts`
- `programs/automation-studio/runtime/build-execution/tools/tests/host.ts`
- `programs/automation-studio/runtime/build-execution/tools/tests/parent.test.ts`
- `programs/automation-studio/runtime/build-execution/tools/tests/producer.test.ts`

Required staged checks after authorized implementation: P1 original admission `{store,commands,inventory}` and ledger `{store,run-fence,process-restart}`; P2 original `{producer,parent,callback-scope,auxiliary}` and forwarding browser/Node closure; P3 actual ordinary gateway/root proof and scope-owner tests; P4 original configured-source/source/choice/cached/direct-whole/suppresses-writes and required-engine/required-callback-child consumers. Preserve original callback receiver/arguments/result/error and promise receipt identity, one real claim + command link transaction, lost ACK/reopen zero-second-send/write, inventory-corruption fail-closed, required consumption proof and close draining. The original process-restart test uses child-process emitted imports: migrate its SQL import to the existing public server seam after rebuilding, preserving the same killed-after-effect oracle.

Source/declaration/type/erased/public-export gates must independently prove no canonical path reaches Studio, every original declaration/SQL byte remains accounted for, aliases retain identity and browser forwarding stays Node-free. No error-handling semantic correction is implicitly authorized by this manifest: existing cleanup/unknown behavior is preserved; a discovered defect is a separately reproduced substep with original primary/cleanup error identity.

## Additional diagnostic returned during freeze

Root package typecheck found duplicate AutomationStudioChangeFeedOperation. Read-only source diagnosis: Studio `api/contracts/change-feed.ts:1` independently declares the same four-value union already moved to canonical mutations/contracts/change-feed-operation.ts. Studio index.ts:4 explicitly exports the API type while root index.ts exports both framework and programs. Recommended exact correction is an import/reexport alias in the API leaf, preserving all local typed uses and the public name; Root owns the edit. Root separately owns relocating the SQL legacy-identity test and removing the duplicate SQL export-star. No worker source edits were made.

Outcome: Done
Changed: docs/working/runtime-ownership-reset-plan/reports/admission-owner-manifest.md only
Validation: Read-only source/import/export/state inspection -> finite primary file map, exact coupled SQL owner and named contract cuts recorded; no checks run by instruction
Not verified: Type/erased closure, compiled public imports, structure gates, original test behavior or stalled-build cause
Report: docs/working/runtime-ownership-reset-plan/reports/admission-owner-manifest.md
Notes: P1 is independently executable after freeze release; full configured assembly waits on the exact rich declarations above. No source edits, git, tests/builds or agents.
