# Router ownership and existing-driver entry

Status: Complete contract/state moves and approved thin entry forwards implemented; focused tests/strict closure/scoped structure held for Root's coherent source freeze.

## Ownership and preservation

Canonical `flows/authoring/routing/` now owns the full route group, rule, router, Subflow role and Subflow definitions, plus their original target/status aliases and all four rich execution aliases. `flows/authoring/adaptation-policy/` owns the full preset and policy. Every original field, literal and type body is retained; no reduced execution DTO was substituted.

The default Subflow projection moved intact because the complete canonical `AutomationStudioFlowArtifact` is now available under `flows/authoring/flow/`. Its owning comment was updated to reflect canonical authoring ownership; its function declaration/body and projected values are unchanged.

Actual state routing moved from Studio to `engine/automation/router/state/{paths,state,resolve,run}.ts` with its barrel. The module's original state/provenance documentation and all descriptor/frame guards are retained. Path collection imports the narrow canonical `runtime/flow-authoring/plan/route-condition` owner, not the broad Studio bootstrap barrel. Host observation remains the existing canonical automation-host implementation.

Studio `model/flow-adaptation.ts`, `runtime/router-runtime.ts` and `runtime/route-state/router-state.ts` now re-export the actual canonical symbols. They do not introduce same-name type alias declarations that would make public export stars ambiguous. Thirty-seven unrelated model declarations are unchanged.

## Approved observation entry

`engine/automation/router/entry.ts` registers one existing-driver `children` kernel. It prepares the original bound graph options, invokes that actual frame with the original routing input and prepared options, then forwards `automationCallbackObservation(frame.options)` into the canonical state router and existing executable router. It adds no source, authority, callback-registration API, clone, proxy, purity label or completion proof.

Root approved exactly two thin forwards:

- `service.ts`: routing import/call only, passing its original `graphOptions`.
- `flow-bootstrap/verification/detached-execution.ts`: routing import/call only, passing its copied/inherited original `options`.

`RequiredCommandRun.execute/own` still only owns the graph-execution promise. It is not counted as a callback frame and no second command wrapper was added. Surrounding service/candidate behavior is untouched.

### Ordinary observation remains absent at its outer source

Both this worker and Root inspected ordinary service setup: `automationStudioRunGraphOptions` creates fresh options, and `commands.bind` only sets the command run and signal. It currently creates no observation binding. Root explicitly approved preserving that unbound legacy path while proving real entry for already-bound callers. Completing ordinary root binding remains P3 integration work; this change does **not** establish end-to-end ordinary observation or create a frame from an absent binding. A supplied raw observation without an actual callback frame remains refused by the lower router, rather than becoming an unobserved fallback.

## Saved-original and caller-diff evidence

`node .fluxiq/refactor/router-owner-verify.mjs` -> exit 0:

- `savedOriginalDeclarationsAndBodies:18`, `legacyActualReexports:18`, `unchangedUnrelatedModelDeclarations:37`.
- `thinCallerChangedLines:13`, `unapprovedCallerChanges:0` against the two exact approved call-site files.

The original model/router/state sources were saved before their moves in ignored `.fluxiq/refactor/router-owner-originals.json`. The verification compares full declaration/function text with normalized line endings, including member documentation. The state module header documentation is retained under its canonical owner. One preliminary inline Node snapshot command failed at PowerShell quote removal before I/O; no evidence is claimed from it. The checked script and scoped Git diff provide the recorded preservation evidence.

## Focused acceptance ready

New `engine/automation/router/tests/entry.test.ts` exercises the actual configured driver: paused persistence before the original private host callback, exact original receiver/request/signal, complete target identity and metadata redaction, own/inherited accessor refusal with zero acts and independent reopen fencing, raw bound/no-frame refusal, unbound ordinary getter compatibility without a frame claim, and post-await native-clock refusal/no second host call. Per Root's clock review, the clear positive uses the genuine native default; an arbitrary custom `now()=>17` separately proves pending/reopen without registering a copied or guessed spread receiver. Legacy unobserved constant-clock assertions remain.

Legacy `runtime/route-state/tests/router-owner-alias.test.ts` checks exact state-routing function identities. Existing `runtime/tests/router-runtime.test.ts` adds canonical default-projection identity while retaining rich input/policy/target tests and original routing assertions. Existing engine router compile/run/condition cases remain unchanged.

Held until Root freezes the relevant closure: the focused route tests; strict source/type closure from canonical routing/policy/state/entry roots with zero `programs` edges; scoped official structure rules; lead package/public export acceptance. No package-wide reader, provider, browser, panel, user data or composed build has been used.

Exact held commands from the Core task root:

```text
node .fluxiq/refactor/router-owner-verify.mjs --closure
node .fluxiq/refactor/router-owner-structure.mjs
```

Exact focused command from `packages/fluxiq` (also includes Root's held diagnostic compatibility regression):

```text
pnpm.cmd exec vitest run src/engine/automation/router src/programs/automation-studio/runtime/tests/router-runtime.test.ts src/programs/automation-studio/runtime/route-state/tests/router-owner-alias.test.ts src/engine/automation/node-execution/tests/failure-clock.test.ts --minWorkers 1 --maxWorkers 1
```

The scoped structure harness keeps complete repository path metadata for import resolution while selecting only owned source files for rule iteration; it writes no baseline, config or source.

## Exact source/test manifest

- `flows/authoring/routing/{definition-status,target,group,rule,router,subflow-role,subflow,default-subflow,index}.ts`.
- `flows/authoring/routing/execution/{input,compiled-rule,plan,result,index}.ts`.
- `flows/authoring/adaptation-policy/{preset,policy,index}.ts`; `flows/authoring/index.ts`.
- `programs/automation-studio/model/flow-adaptation.ts` (only routing/policy declarations/imports/re-exports).
- `programs/automation-studio/runtime/router-runtime.ts` and `runtime/route-state/router-state.ts` compatibility exports.
- `engine/automation/router/state/{paths,state,resolve,run,index}.ts`; `engine/automation/router/{entry,index}.ts`. Engine `router/run.ts` and shared guards remain the other worker's.
- `programs/automation-studio/runtime/service.ts` and `runtime/flow-bootstrap/verification/detached-execution.ts` approved routing imports/forwards only.
- `engine/automation/router/tests/entry.test.ts`; `programs/automation-studio/runtime/route-state/tests/router-owner-alias.test.ts`; existing `runtime/tests/router-runtime.test.ts` identity assertion.

## Separate read-only P3 required-owner discovery

Root requested this investigation while routing readers remain held. No P3 implementation or interface edit was made.

### Smallest complete controller unit

Moving only `service/command-execution/{controller,contracts}.ts` cannot produce a canonical closure: its concrete upper controller constructs the actual `service/command-run/controller.ts`, and its ports are the full `Omit<AutomationStudioCommandRunPorts, "executorOwner">`. Replacing that dependency with a new factory, weaker interface or session DTO would change the authority/composition contract.

Recommended finite paired owner move:

1. Move the **original lower** `AutomationStudioCommandRunController`, scope class and all four related full contracts from `service/command-run/{controller,contracts}.ts` to `runtime/output-dispatch/command-run/`. Focused files: `controller.ts`, `scope.ts`, `owner.ts`, `effect-provenance.ts`, `executor-owner.ts`, `ports.ts`, barrel. Keep the original class/Scope identities through actual legacy re-exports.
2. Move the **original upper** `AutomationStudioCommandExecutionController` and its exact full ports alias from `service/command-execution/{controller,contracts}.ts` to `engine/automation/command-scope/{controller,ports}.ts`, with its existing barrel extended. Import the existing canonical `AutomationStudioNodeAttemptExecution` and `AutomationStudioCanonicalExecution`; never copy their private provenance registries or replace them with structural interface checks.
3. Move complete `AutomationStudioExecutionCommandBridge` and `AutomationStudioExecutionConsumptionReader` interfaces into the lower canonical command-run admission contract seam. Keep `claim`'s exact `ReturnType<OriginalStore["claimForRun"]> | undefined`, original proof/context arguments and one-use consumption-reader relationship. The former `service/execution-admission/{command-bridge,consumption-reader}.ts` become actual aliases.
4. Move or re-export the complete `AutomationStudioExecutionAdmissionPorts` composition contract under the canonical engine admission owner, e.g. `engine/automation/execution-admission/owner/ports.ts`. `requiredOwner` stays the **concrete original upper controller type**, not a replacement interface. The old ports module aliases it. Root should choose the public barrel seam alongside its remaining admission-controller move.

These four steps form one identity-preserving required-owner unit. They do not imply that the remaining Studio admission controller or ordinary root-binding integration has moved.

### Dependencies and exact blockers

- The complete `AutomationStudioRuntimeSession` already lives at `runtime/run-control/session/index.ts`; Studio `model/runtime.ts` is an actual import/re-export. Both lower ports and admission ports can use that complete canonical symbol. A new session DTO or `Pick` is unnecessary and would weaken the existing contract.
- Pool, command ledger store and run-admission contracts already have canonical `framework/persistence/project/{sql,command-ledger}` owners. Rewrite imports to those actual symbols, preserving sole pool/lease/SQL state.
- The two current bridge interfaces are still declared under Studio. They are real type-closure blockers even though erased; move their **complete** declarations as above.
- The upper controller's current Studio executor/composite imports are compatibility paths to real canonical engine owners. Rewrite to the existing canonical symbols; retain original static `readEntry/readHandling/isRegistered` ownership checks.
- The lower controller's `fingerprint` reads the full original stored session repeatedly and hashes project/run/root Flow, target, queued time and the full Flow. Keep those checks; no caller snapshot, substituted owner or cached session grants authority.
- `RequiredCommandRun.execute/own` still merely tracks the promise. This controller move does not create ordinary observation bindings or callback frames; P3 must wire those separately through the actual configured cohort.
- Canonical barrel/import-cycle and strict closure acceptance are required: moving the real upper class makes its actual engine dependencies visible. Do not hide a reverse import behind a facade.

### Lifetime and identity that must remain sole

Upper controller: original `states`, port/effect/context WeakMaps, opening/pipeline sets, synchronous stop/abort, per-run close and cleanup-error retention. `context` must still join the original node attempt and private capability; `consume` must keep original state/consumer/context identity checks and actual handling verification.

Lower controller: original scope/context registration maps, reserved-run set, receipt/claim/ticket/consumed state, SQL admission owner and one-use `handlingProofs`. `bindExecutionAdmissionBridge` stays the same one-time owner binding; no new observer/registry protocol. Preserve exact Context/Scope constructor identity, original proof objects, `Outcome.require` observer, uncertain/withdraw rules, late ACK fencing and lease/pipeline drains.

The lower class has an old comment saying executor issuance is unwired. Its real upper constructor already supplies `executorOwner` and its service lifecycle calls `open`; that comment is not evidence that required-command execution is absent. The missing **ordinary observation binding** is a separate, source-backed finding.

### Required lifecycle is a separate bounded dependency

`service/command-execution/lifecycle.ts` currently imports the Studio intervention-mode union and the real `runtime-session/ending.ts` implementation. It may remain an explicitly tracked legacy control adapter for the class unit above, with its controller import resolving to the actual canonical class. Do not include it in a canonical barrel by importing Studio back.

To move that lifecycle itself, take a second explicit complete batch: its full mode union, `endAutomationStudioRuntimeSessionAfterThrow`, full ending ports/result contracts and their actual store-unavailable/error-message collaborators. Preserve `required/storage/adaptive/existing-session/idempotency` refusals, the special `run.outcome_uncertain` checkpoint rule, `endFailure` error identity/settled session semantics, and synchronous close invalidation with retained cleanup rejection. No weakened session/ending interface is acceptable. Exact ending closure beyond those direct imports was not investigated in this bounded discovery.

### Narrow acceptance manifest for the controller unit

- Before/after full class/contract declaration and body comparison; actual constructor/Scope/port alias identity; strict canonical source/type closure with zero Studio edges; scoped official structure and normal public export checks.
- Existing `service/command-execution/tests/controller.test.ts`: both IO/runtime paths, original handling/consumption before the second actual effect, timeout/no second send, foreign/copied consumer and capability refusal, native/composite refusal, selected-child provenance/root wire identity, record-persistence failure, per-run close, post-COMMIT drain, cancelled lease resolution and primary-plus-cleanup failure retention.
- Existing `required-transport.test.ts`, `service.test.ts` and `storage-required-reach.test.ts`: real runtime transport registration, no fallback legacy handler, honest unknown/cancel/late ACK behavior, existing/adaptive/storage gates and lifecycle compatibility. These are provider-free real-SQL/temp fixtures; never aim them at user data.
- Existing lower `service/command-run/tests` cases, particularly withdrawal and stored-session/admission/receipt rules; do not substitute pure interface mocks for these original private-owner tests.
- Existing execution-admission bridge tests must still prove original required claim/handling/consumption integration after the aliases move. Root's final reader should cover both layers together, rather than certifying each copied body independently.

No P3 code, test or broad reader was run for this discovery. This is a concrete proposed next workstream, not completed ownership or observation acceptance.

Outcome: Partial
Changed: exact source/test manifest above and this report.
Validation: 18 saved-original declarations/bodies and actual legacy exports preserved; 37 unrelated model declarations unchanged; both thin caller diffs contain only the 13 approved added/removed lines.
Not verified: focused runtime/type/structure gates pending freeze; ordinary root observation remains absent by explicit scope decision; no complete-runtime/browser acceptance.
Report: docs/working/runtime-ownership-reset-plan/reports/router-owner-entry.md.
Notes: No active reader; no git mutation or shared-plan edit. Earlier nine-file callback unit remains frozen except Root's requested diagnostic compatibility follow-up, coordinated with its owner.
