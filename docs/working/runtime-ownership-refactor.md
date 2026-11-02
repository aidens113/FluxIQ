# Runtime Ownership And Web Boundary Refactor

Status: Active
Status detail: task checkpoint backed up; SQL/router/permission/producer/whole-candidate units accepted; R5 capture/mapping, partial trials and remaining audit/UI phases active.
Created: 2026-11-01
Last updated: 2026-11-02
Owner: Senior supervisor agent
Scope: Separate framework runtime from Automation Studio ownership and audit all downstream web boundaries.
Paired document: ../!FluxIQWebExtension/docs/working/runtime-ownership-refactor.md
Related: [architecture](../architecture/README.md)

## Current State

The complete Core/downstream ownership audit and refactor remains Active. The user also requires a separate reusable standardized chat-stream/widget package, tentatively `@fluxiq/ui-components`, AFTER both full audits/refactors finish. That final UI phase is recorded in both repositories and has not started.
The user reaffirmed that Automation Studio is ONLY a UI panel controlling the framework. Execution, authoring, verification, persistence, project/policy/recording ownership and orchestration must all move to framework packages. Studio keeps UI/view state and thin control adapters; current backend/receipt/composition locations are temporary compatibility scaffolding. Earlier proposed permanent Studio persistence/composition exceptions are superseded.

Actual authoring checkouts are C:/Users/osrs_/FluxStuff/fxwork/t843/!FluxIQ and its sibling !FluxIQWebExtension, both on task/t843-runtime-foundations. They share the original repositories' actual Git histories. The first t842 capability group is already merged/pushed to BOTH original dev branches; main has not moved. Original downstream user changes remain untouched.
Accepted remote task checkpoints: Core6a871e62/downstreamed155444. Later documentation commits Corecbbfc05e/downstream2f16c2a2 remain local: normal pre-push structure checks refused the active tree. No hook bypass, force push, PR, registry publishing or main promotion occurred. Current implementation remains uncommitted until coherent acceptance.

Lead independently accepted these current source units:
- A2 durable SQL/sole command bridge:10files90tests. Gateway original-child completion reader amendment:2files9tests. Historical unknown/lost ACK stays pending across reopen; original required observer and handling remain sole authorities.
- R6 router:5files46tests; actual compilation/condition/choice is engine-owned, Studio retains its artifact projection.
- R6 permission:26files274tests, canonical/erased closure597modules0Studio edges, browser-client closure26modules0Node/instruction edges. Browser guard additionally rejects bare builtin imports. Source public package/parent seams are integrated; built-package acceptance is pending.
- B real engine/native/output producers:22files195tests; subsequent successful-self-loop fix passed lead14affected cases, plus3independent neutral callback-root cases. Retry fencing uses actual private invocation/effect series, not repeated method names; original receiver/arguments and first unsupported return remain preserved.
- C whole-candidate/reentry/cache:14files92tests. Actual SQL counter/throw blocks new inputs/revisions/gates/ports/reopened owners; genuine pinned cached diagnosis performs no committing entry, start/reset, coverage credit or promotion.

R5 mapper/review/recipe and normalizer binder are source-frozen and lead-accepted (17files119tests, then23normalizer-guard cases). Canonical capture/IO is lead-accepted (13files37tests), and full recording isolation/restart/proposal/storage acceptance passed7files90tests. Current source includes canonical rich verification data and shared invocation scope owners, real queued writer completion and wrapper forwarding. C now closes the actual project reset-routing facade; the storage worker closes reviewed cleanup errors. B investigates the separate production conversation/activity completion owner. Normal rebuilt/composed integration remains pending. Root owns composition/public exports, neutral verification control/accounting and independent acceptance. Change/recovery discovery is complete; its implementation remains required.
Root's generic callback-root lifecycle is in runtime/execution-observation/roots, reused by ordinary build tools and the partial adapter. Persisted continuation/cohort composition still sits in Studio temporarily and must migrate to framework ownership under the user?s panel-only requirement. All sources register before exploration; later candidate ports bind privately to the same original flow series. A gateway completion read is informational and never replaces SQL owner/frontier CAS or issues rights.
Actual raw-tool adversarial acceptance exposed a gap: an unsupported fulfilled return allowed a fresh ordinary call without a completion receipt. The actual backend now durably marks that outcome terminal unknown before returning the original result. Worker7focused cases and strict checks pass; lead composed acceptance is pending. Generic callback compatibility and distinct authored calls with authentic completion remain unchanged.
Root moved normalized recording candidate/evidence/bound-mapper data to the SDK and preserved old type aliases. The trusted normalizer hook is implementation-bundle code only. Canonical mapper absence means shallow-copy parameters, never implicit browser interpretation.
Downstream now has its actual web target-normalization adapter, registered by its real implementation bundle. Source-local browser bundle:3domain modules/0Core runtime implementation imports;4literal unit cases and650exact JSON-byte comparisons against unchanged checkpoint Core functions pass. This is source-local acceptance; guarded downstream integration waits a normal Core rebuild. Legacy active Core target-normalizer callers remain required R8 work.

Previous checkpoint acceptance remains: Core59files512distinct tests; downstream268distinct selected cases, all package/library checks/builds and both structure audits passed. Core versions are fluxiq0.27.0/contracts0.7.0; no publishing. No baseline may grow or transfer; checkpoint baselines were Core1095/downstream583 entries.
The FIRST daily full sweeps ran on original stable dev and exposed reproduced historical fixture failures. Those fixtures were repaired truthfully; current safe-retest subjects now pass controlled source/SQL acceptance. The second full-sweep allowance remains unused. No package-wide/full suite is repeated per fix.
Historical t844 remains source-untouched at downstreamc9056f1a/Core16b5043c, with ignored TEST-only comparison evidence; it is not current integration proof. All current tests are provider-free. No live providers/paid Lab runs/panel management/browser-user-data operations started.

Remaining required work: finish R5 capture/mapping and partial composed acceptance; remaining R6 recovery/change authority; R7 actual authoring/trial/verification/recovery owners; R8 all active browser interpretation through downstream trusted ports; R9 authored docs, current focused/browser checks, paired integration/pushes and permitted full-sweep gates; THEN R10 reusable actual chat UI/component-data package with extension plus a second real client. These are required phases, not optional recommendations. No claim that either full audit/refactor is complete.


## Phases

1. Inventory Core Automation Studio responsibilities, consumers and dependency cycles.
2. Inventory downstream ownership and web-specific code incorrectly retained by Core.
3. Refactor verified misplaced code into owning layers, preserve existing public exports and add mechanical boundaries.
4. Verify touched packages, focused regression tests and structure checks; document compatibility and integrate both repositories.

## Remaining Ownership Phases

These phases are required by the original refactor, not deferred recommendations.
The current cuts cover nodes, engine, host ports, provider/agent primitives, DSL and matching, with integration fixes in progress.

| Phase | Required capability/owner | Dependency |
| --- | --- | --- |
| R1 | Importer SDK and native binding -> components/automation/importer and runtime/native-execution | Current neutral nodes/matcher/host |
| R2 | Environment, run control, resource scheduling -> focused runtime owners | Current host ports |
| R3 | IO dispatch and graph option composition -> runtime/output-dispatch and execution adapters | R1/R2 |
| R4 | Compiled/composite execution + snapshot/composition contracts -> engine and flows | Current DSL accessor stable |
| R5 | Shared state/recording, normalizer and gateway recording ports -> state/recording owners | Shared wire types aligned |
| R6 | Router, permission/change/recovery gates and context packing -> engine/runtime capabilities | R5 and canonical model ports |
| R7 | Flow authoring/draft/coverage/trial/repair and verification -> focused runtime capabilities behind persistence ports | R1-R6; stable ArtifactSource/DraftStore/History/Evidence/ResultSink/Presentation/Model/HostSemantics ports |
| R8 | Remaining active browser target/location/wording interpretation -> domain adapters through trusted host ports | Cross-cutting; exact list in residual report |
| R9 | Focused integration/browser checks, authored docs, narrow merge gates and paired pushes; permitted full sweep for main | All code phases |
| R10 | Separate reusable Core chat-stream UI/component-data package, tentatively `@fluxiq/ui-components`; extension consumes it and any project/client can use the standardized widget | User requires this AFTER the full audit/refactor of both repositories |

See `runtime-ownership-refactor/reports/residual-runtime.md` for the complete remaining-area inventory and exact moves.

## Required final shared chat UI package

Only after both repository audits/refactors finish, extract the extension's actual chat-stream component implementation and reusable UI data/contracts into a separate Core package, tentatively `@fluxiq/ui-components`. This is required work, not an optional follow-up.
The public package must expose the widget, message/stream contracts, styles and narrow client event/transport ports without extension APIs, pairing/storage ownership, private Studio imports or Node-only dependencies. Projects supply their own transport and host bindings.
Migrate the extension to the package and exercise a second real client integration to prove reuse. Preserve streaming, activity/results, user interactions, accessibility and existing visual behavior; keep extension-specific approvals/routing/browser bindings in its adapter. Document standalone client setup and verify the browser bundle boundary.

## Work Ledger

### 2026-11-02 - Normal library checkpoint and guarded downstream acceptance
- Agent: senior supervisor
- Validation: normal `node scripts/build-cache/cli.mjs contracts:build fluxiq:build client-gateway-websocket:build` ->exit0. Contracts/websocket matched their stamps; FluxIQ rebuilt current production, declarations/native imports/runtime identities in134.226s,20,927outputs/37,046,277bytes. Regular downstream `pnpm.cmd --filter @fluxiq-web-extension/domain check` ->exit0/35.346s; normal core-build guard confirmed this actual t843 Core source matches its build. This stamp predates the next model/spend source edits.
- Validation: lead final7-root strict ->0errors; whole Core structure audit ->exit0. Canonical storage final10files54passed,74roots/4,967modules0,68files21rules0,259originalcookedvalues0unapproveddifferences; fixture typing correction emits exactly10,361unchanged JS bytes. C reset/acts original4files25passed plus corrected collection case1passed,11roots0/18rules0. B permission/submit follow-up has235distinct affected passing cases across staged runs,33roots0/19files15rules0; two new grant fixtures explicitly opt into waiting. No full suite was repeated.
- Finding: isolated actual Service first-unknown diagnostic ->callback derive, source studio.build.callbacks, unverified, children[]. The known unresolved builder failure is now the actual instruction-authority read's model call plus queued spend acknowledgement, not initial raw exploration or reset facade forwarding. No current whole-Service YES claim.
- Assigned: C instruction-authority-completion; B model-execution-completion (original provider Promise/timeout and genuine owner ACK); writer spend-settlement-completion (exact original call/persisted prefix). Shared seam is one existing opaque ExecutionCallbackObservation in separate INTERNAL model execution options, never request/prompt/wire metadata; no new scope registry/root/status proof. Their written briefs are in the task folder. During this normal-build checkpoint all package source/tests were frozen; next-unit work was read-only.
- Git: preparing a task-branch backup of tested foundations, not a dev/main release. Known instruction-owner work and all remaining runtime/web/UI phases stay Active. No packages published, provider calls launched, panel managed or user data touched.

### 2026-11-02 - Canonical owners checked; actual facade closure remains
- Agent: senior supervisor
- Validation: lead `node scripts/structure-audit.mjs` ->exit0 on corrected canonical storage/scope/verification tree; downstream structure audit also exit0. Earlier13 new storage findings were fixed without baseline transfer: legacy adapter tests relocated, statements unpacked, malformed config no longer falls back, discovery ignores only missing dirs, cleanup failures retain both errors.
- Validation: lead actual9-file integration run ->39passed/1failed out of40,113.65s. This includes all21 real receipt/store/writer/ledger cases, neutral declaration/working-set computations, original scope-policy cases and3 Service fixture proof/receipt cases. All original two-builder YES/cart/reset/start-page assertions remain unchanged. Actual initial read now passes raw ownership but later loses its reservation at the toggle flush because reset-calls explored still delegates outside observation. C owns the whole factory boundary in briefs/project-reset-forwarding.md; no latches are weakened.
- Validation: raw producer fixture now acknowledges actual owned shop work with one-use original Promise/per-call/output membership and owned digests. Copies/swaps/fake Promises/repeats/rejected operations refuse. Read-only declarations cover only the actual literal read/projection methods. Lead strict7-root probe exposed3 NEW fixture typing errors (explicit optional undefined and missing unused permission port); those are corrected, rerun pending.
- Worker claims awaiting remaining lead built integration: canonical scope8files18passed/strict23roots0/declarations0/source1,588+erased11closure0; storage10files45passed/strict74roots0/68-file21-ruleaudit0/source58+erased50+data8+declarations0/259originalcookedvalues unchanged. B wrappers13files109passed/strict28roots0/scoped21files0.
- Review: C found two additional inherited storage gaps: close failure could mask a primary/rollback error; throwing empty factory after archiving could leave the active path absent. Writer is fixing both within the same owned methods with actual fault tests. These findings are required work, not deferred exceptions.
- Review correction: the fixture plan resolver invokes an injected permission callback; its initial no_direct declaration was unjustified and is removed. B owns the actual submit/plan-permission private scope forwarding, including the highest constructed submit wrappers; C owns the entire reset/acts routing facade and actual owner callbacks. No arbitrary resolver is treated as pure.
- State: all readers ended before the next source edits. No normal rebuild, guarded downstream acceptance or composed Service pass is claimed for the current snapshot. Current task source remains uncommitted while the known facade/storage fixes are in flight; original dev/main and user data are untouched.

### 2026-11-02 - Actual shared storage and pure verification owners moving
- Agent: senior supervisor
- Decision: writer owns the actual reusable JSON/SQLite storage, original connection pools/operation queue, root routing, repository contracts and shared performance registry migration into framework/persistence and framework/observability/performance. Written brief: runtime-ownership-refactor/briefs/framework-storage-migration.md. Studio record/writer owners follow after these real dependencies and C's context/ledger authorities move; no injected fulfilled-Promise commit substitute is allowed.
- Changed: lead integrated framework public parents and package subpaths for persistence/performance. Lead also moved the original owed-record projection and working-set lineage/cycle classifier into neutral result-verification owners, with exact old aliases and rich canonical DTO imports.
- Validation: lead isolated AST/transpile probes ->both moved algorithm bodies identical to HEAD after explicit type-name/newline normalization; erased runtime imports0. Owed projection preserves original declaration copy and explicit-empty precedence. The first body comparison refused only CRLF/LF text; normalized AST comparison passed. Existing behavioral selectors/strict roots are queued for the next joint stable snapshot, not yet accepted.
- State: B repairs the actual stale private request parent after a completed delegate, preserving original series/run proof/last completion and the production open-lifecycle guard. The new ledger fixture recorded the act correctly but its unwitnessed act is deliberately absent from inPlace; only that NEW fixture's assertion is corrected to the actual recorded act/declaration. Existing world/reset oracles stay unchanged.

### 2026-11-02 - First shared invocation ownership migration assigned
- Agent: senior supervisor
- Decision: C owns the actual seven-field invocation context, scope registry/owner map and async/sync/producer algorithms moving to runtime/flow-authoring/execution/observation. Old exports remain exact aliases; candidate lookup/session bridges are the next unit. Written brief: runtime-ownership-refactor/briefs/framework-observation-migration.md. Source work waits for the coordinated read window to close.
- Validation: lead `node scripts/structure-audit.mjs` ->3 violations across2 rules: two references to the new internal isFrame name matched the web-vocabulary rule, and the generated working index was stale. No other structural failures. Both indexes regenerated through the owning rule without baseline changes; the two-symbol correction is reserved to the lead after readers finish.
- Validation claim requiring lead confirmation: C's exact cache/partial/registry/alias selectors ->4files14passed/82.06s; strict45roots0, scoped17rules0 failures. All original cache/action/start/reset/no-reserve/no-promotion assertions retained. This does not establish full Service behavior.

### 2026-11-02 - Queued writer checks and composed builder failure
- Agent: senior supervisor
- Validation: lead `node --max-old-space-size=4096 .fluxiq/refactor/lead-project-callers-types.cjs` ->14 roots,0 errors on the current caller integration. Actual Service selector `project-build-trial-reset.test.ts -t "runs each trial on the site"` ->1failed/2skipped,96.62s: exploration reached test.1, then the first trial returned llm_evidence_loop.tool_failed instead of the required yes. The original cart, reset and start-page assertions remain unchanged; this is not accepted composed behavior.
- Validation: lead selected receipts/real Store/acts/toggles/ledger completion subjects ->5files21passed/111.45s; actual memory/file/SQLite commits, held writes, unsupported clock, lostACK and reopened-owner refusal passed. Remaining worker claim: queued completion9files58tests pass; strict47roots0; neutral62data/4runtime modules0Studio/Node edges; declarations0; scoped47files0 failures. Real lostACK, held-write, injected clock and reopened-owner refusal are covered. All readers ended before further edits.
- Finding: temporary isolated-test diagnostics reveal the FIRST opening read throws execution_observation.tool_run_binding_unverified at build-tool bindAuxiliary, before any successful exploration. Later execution_blocked/trial errors are consequences; earlier call-list-only diagnostics did not establish successful exploration. B owns original run/context forwarding repair, with lifecycle guards intact.
- State: lead is tracing the original thrown trial error with temporary isolated-test diagnostics; B is checking the remaining new ledger fixture classification; C is adding only inspected effect-free fixture declarations and producing the first canonical trial/reset migration brief. No full audit, backend migration or shared UI completion claim.

### 2026-11-02 - Studio panel-only acceptance criterion and actual foundation checkpoint
- Agent: senior supervisor
- Decision: recorded the user's explicit panel-only Studio requirement in BOTH AGENTS.md files and Current State. All runtime, authoring, persistence and orchestration authorities must migrate to framework packages, including the currently instrumented project store/reset/build helpers. Thin control adapters and compatibility aliases alone may remain. This is the completion criterion, not a deferred enhancement.
- Validation: `node scripts/build-cache/cli.mjs contracts:build fluxiq:build client-gateway-websocket:build` ->exit0; contracts/websocket current stamps reused, FluxIQ clean compile/native imports/declaration verification/runtime identity built in122.408s. Regular downstream `pnpm.cmd --filter @fluxiq-web-extension/domain check` ->exit0/34.310s, normal core-build guard explicitly confirmed matching Core source. This stamp covers that frozen checkpoint; subsequent active caller changes require rebuilding before later integration.
- Validation: lead actual producer/private binding/managed declarations/environment cohort ->6files18passed/40.16s; original clock/policy5root strict ->0errors after correcting a NEW negative fixture's this annotation. Lead canonical timer/actual annotation clock pair ->2files12passed/52.22s. Worker recovery161 and writer provisional cases remain claims outside these lead counts.
- Validation: lead original Source9 plus explicit owner-frame3 ->2files12passed/1.41s. Generic invokeSync compatibility remains unchanged; additive isReadOnly/markFrameUnknown lets the actual sync owner persist terminal uncertainty without forging a prepared handle. C consumes that API and owns its integration tests.
- State: active actual wrapper/parking callback, queued-store, reset/session and caller integrations remain unfinished. Root is wiring actual outer-loop entry, observed read/check/trial/writer hooks and readonly write suppression; no complete application/audit/refactor/UI claim. Original Core main checkout is clean; original downstream retains exactly its two pre-existing user changes.

### 2026-11-02 - Neutral confirmation and actual graph validation
- Agent: senior supervisor
- Changed: real first-ask confirmation/model verdict-word/status algorithms moved to neutral verification control; old symbols are exact function/type aliases. Actual graph/handler/reachability validation moved once to validateExecutableGraph; full Flow validation delegates with its original required interface outputs. Graph callers must explicitly supply enclosing required output IDs. Old repair-overlay dummy-artifact composition remains required follow-on integration, not claimed removed.
- Validation: `pnpm.cmd --filter fluxiq exec vitest run src/flows/executable/validation/tests/flow.test.ts src/flows/executable/validation/tests/graph.test.ts src/programs/automation-studio/runtime/result-verification/tests/verification-status.test.ts src/programs/automation-studio/runtime/result-verification/first-ask/tests/first-ask.test.ts --maxWorkers 1 --minWorkers 1` ->4files28passed/38.21s; unchanged handler/confirmation/status oracles plus graph-only issue order/multiplicity, actual required-output context, exact full-Flow issue parity and no mutation.
- Validation: `node --max-old-space-size=4096 .fluxiq/refactor/lead-graph-confirmation-types.cjs` ->7source roots0errors. Browser esbuild of neutral control and executable validation ->126modules0Studio inputs0Node builtin resolutions. Scoped29files initially found only one extra final blank line in the earlier deadline extraction; removed it, then `node .fluxiq/refactor/lead-graph-confirmation-structure.mjs` ->29files0failures0warnings, unchanged baseline/config.
- Integrated: canonical rich verification parent barrel and public flows/executable/verification package subpath; lead historical/data acceptance is recorded below. Normal package/public API and composed service acceptance remain pending.
- Validation: lead explicit historical/outcome/legacy-identity/actual act-passes subjects ->4files53passed/36.54s. `node .fluxiq/refactor/verification-authorities-shapes.cjs` ->77exact rich authorities plus historical base/diagnosis and strict producer field identity verified; source-review script ->99canonical files plus19runtime functions/7response branches unchanged; runtime script ->20modules0forbidden/Node/Studio edges and declaration emit0errors. Broader165worker consumer cases are not added to lead counts.
- Enforcement: browser-imports now covers neutral verification public entry, rich data and actual graph validation; `node scripts/structure-audit.mjs --rule browser-imports` ->exit0. Future runtime/adaptation is included in the existing fail-build reach boundary against Studio.
- Assigned: bounded read-only exploration policy/deadline/timer extraction preparation while C closes actual pre-trial session and writer ownership. No new source implementation is authorized for that discovery. UI remains required after BOTH completed audits/refactors.
- Assigned: separate queued writer completion owner for actual acts/toggles/project-ledger queues and original read/write/persist callbacks, with Root caller integration. Real project record-store commit witness is being traced; arbitrary injected callback fulfillment is not authenticated completion.

### 2026-11-02 - Actual host callback and neutral receipt collection acceptance
- Agent: senior supervisor
- Validation: `pnpm.cmd --filter fluxiq exec vitest run src/engine/automation/tests/host-observation.test.ts --maxWorkers 1 --minWorkers 1` ->17passed/12.24s. This independently confirms actual original host receiver/call paths and uncertain-effect retry refusal; it is not whole-service acceptance.
- Changed: completed verification receipt collection now has one neutral generic runtime owner. Studio specializes the same constructor with its ORIGINAL full intervention type; no replacement receipt DTO or history store. Original receipt identity/order, closure against late answers and defensive result arrays are preserved.
- Validation: `pnpm.cmd --filter fluxiq exec vitest run src/runtime/result-verification/control/tests/completed-checks.test.ts src/runtime/result-verification/control/tests/deadline.test.ts src/programs/automation-studio/runtime/result-verification/tests/deadline.test.ts --maxWorkers 1 --minWorkers 1` ->3files10passed/1.71s. Existing run-outcome/run-outcome-repair subjects ->2files49passed/65.31s. `node --max-old-space-size=4096 .fluxiq/refactor/lead-completed-checks-types.cjs` ->4source-closed roots0errors; `node .fluxiq/refactor/lead-completed-checks-structure.mjs` ->4files0failures0warnings, no baseline/config writes.
- State: reusable chat UI package remains required AFTER both full audits/refactors. Current production producer/verification workers remain active; package rebuild, paired integration/push and main promotion are pending.
- Finding: raw producer adversarial check initially4passed/1failed: forged unacted return was preserved but a second fresh ordinary call sent again. B now adds durable terminal-unknown handling only at the actual unreceipted raw backend, using existing Source authority; no JSON/status inference or method-wide fence. The new focused run is pending.

### 2026-11-02 - Current independent callback and scope acceptance
- Agent: senior supervisor
- Validation: lead exact25option-migration subjects ->257passed/70.26s; lead constructor-owner/lost-ACK/build-tool subjects ->3files23passed/64.06s; lead declaration snapshots/original-promise/Source/root-preparation cohort ->6files34passed/1.85s. Source copy/native strict closure ->exit0. Earlier worker113scope durability and92host-path cases remain independently pending in their broader portions, not added to lead counts.
- Changed: generic Root preparation awaits the pinned original owner and ORIGINAL reserved root; failures preserve original error, never call the implementation and leave history non-clear. A new hook fixture initially assumed null where the actual root omits parentId; corrected to the actual contract and fail-fast async waiting. Current root cohort passes7cases.
- Changed: managed callback consumers can read the ORIGINAL unawaited return for private async-void commit receipts; no new implementation arguments/fields. Declaration snapshots and manage-only facades are wired before cohort registration, with genuine original function/reader identity.
- Integrated: build-tool observer is constructed from the SAME original continuation/cohort; top-level harness and original project/trial environment are privately linked. B owns actual per-brief registry/raw-binding producer forwarding; C owns actual beforeTrial/startState producer/async hook closure. Unknown raw callbacks are not relabelled native.
- Assigned: canonical rich verification DTO/diagnosis/trial packet authorities and exact historical notRun reader, preserving all old aliases and private hint registry. This prerequisite is disjoint from the producer closures; R7 algorithms remain required.
- State: source work remains active; no new package build stamp, paired task integration/dev push/main promotion or UI extraction is claimed. Original downstream user changes stay untouched.

### 2026-11-02 - Full service closure findings and authenticated resource owner
- Agent: senior supervisor
- Validation: not validated as a complete service unit: the actual raw build-tool and beforeTrial producer gaps below still prevented composed acceptance. Individual narrow results are recorded separately; no package-build or downstream-integration pass is claimed by this entry.
- Accepted: lead reran the complete recording isolation/restart/proposal/storage cohort ->7files90passed, preserving original snapshot and retry identities. Lead typed-guard compiler fixtures ->23passed;74mirrored audit files match. Common option helper ->3passed including actual entered-child deferral, retry preservation and unchanged rebind refusal.
- Changed: trusted native completion declarations are pinned through the existing bindNativeNodeRuntime third optional argument, preserving the existing identity second argument. The same original declaration snapshot function is used by Source binding. Root native/pinning selectors ->6passed; strict copy/completion closure ->exit0 after correcting a new test's native status literal to success.
- Finding: production SQL scope default is deliberately unverified; callback completion cannot upgrade that baseline. New constructor-only executionScopeAttestor supplies an ORIGINAL real resource-owner proof while persisted project/owner/continuation/epoch stay anchored. Default/null remain unverified; existing SQL unknown/pending history remains sticky. Worker reports17realSQL cases passed; independent lead owner acceptance remains pending.
- Changed: canonical attestation/attestor type authorities and public parent exports; trusted ServiceOptions forwarding to the controller, never model/build request flags. Resource ownership must last throughout the continuation under the existing A1 lifecycle contract.
- Finding: actual project builders recreate an unbound per-brief harness, bypassing top-level ordinary tool roots; Core.run_node context forwarding and real beforeTrial/offline/synchronous callback completion still require bounded production wiring. Host callback review also found actual direct invocation gaps; presence protection stays until coverage is real. These are required closures, not purity-by-name or fixture status exceptions.
- Assigned: original scope-owner seam; exact literal offline-disabled Core factory path; read-only ordinary tool/native producer trace. Option migration worker froze20production files with guard0/strict0 and264distinct selected tests; lead exact25-subject check is running. No normal rebuilt package/current downstream integration is claimed yet.

### 2026-11-02 - Structural execution-option copy prevention
- Agent: senior supervisor
- Finding: repeated private companion loss required a common copy operation, rather than more independent object-spread repairs. Read-only TypeScript symbol/declaration discovery inspected1737production candidates and found35typed spreads, including the2original helper spreads and test fixture helpers.
- Changed: engine execution-admission now exports copyAutomationExecutionOptions, transporting public fields and the original private observation/retry companions together. It grants nothing to serialized or empty options. The actual original counter/throw stays pending and blocks a second committing callback.
- Validation: `pnpm.cmd --filter fluxiq exec vitest run src/engine/automation/execution-admission/tests/copy.test.ts` ->2passed. Core module-reach guard extended to result-verification and canonical gateway recording ->exit0,0warnings/0baselines. Downstream full structure shrink-only update ->exit0,baseline583 unchanged;72mirrored files match before the new rule is added.
- Assigned: bounded worker implements a TypeScript declaration-identity fail-build rule in Core first, then identical downstream mirror. Caller migration follows the current reset regression closure; no baseline exception or metadata-based grant is permitted.
- Build: first normal library attempt stopped on an inferred inaccessible-this declaration and accounting explicit-undefined compatibility. Both typing issues are corrected; current public library rebuild is still pending the source freeze. No downstream guard bypass occurred.

### 2026-11-02 - First verification control authority
- Agent: senior supervisor
- Changed: actual bounded waiting, timeout calculation and the single asks-per-check constant now live in runtime/result-verification/control. Studio deadline/verifier names alias those exact authorities; no judge or execution-admission decision changed.
- Validation: `pnpm.cmd --filter fluxiq exec vitest run src/runtime/result-verification/control/tests/deadline.test.ts` ->3passed, including original thrown-object identity, abort-listener cleanup and late operation completion after timeout. Existing deadline and actual first-ask route selector ->2files13passed. `pnpm.cmd exec tsc -p .fluxiq/refactor/tsconfig-neutral-verification-control.json` ->exit0.
- Validation: lead canonical recording/IO selector ->13files37passed, including erased binding-aware source closure; affected producer barrel correction ->11passed. Normal contracts build ->exit0, current stamp reused.
- State: R7 has begun only this bounded control cut; rich result contracts, accounting, obligations, repair and judge sequencing remain required. Current full package integration still waits the actual partial and recording isolation regressions.
- Subsequent cut: actual accounting projection now lives beside control behind a read-only original-ledger source; Studio aliases the same function. Lead canonical original-receiver/omitted-history cases ->2passed; original accounting and actual verifier purse consumers ->2files5passed; strict control/accounting closure ->exit0. No budget owner, purse opening or persisted-session selector moved. Rich result contracts, obligations, repair and judge sequencing remain required.

### 2026-11-02 - Recording address isolation and neutral gateway closure
- Agent: senior supervisor
- Finding: scoped capture tests exposed the actual recording store returning a cached same-ID recording from another project. Store/controller isolation is assigned to a separate worker; scoped negative assertions remain unchanged.
- Changed: three actual gateway failure parser/type imports now use contracts/runtime rather than contracts/automation-studio.
- Validation: `pnpm.cmd exec vitest run packages/fluxiq/src/client-gateway/service/tests/action-result-reading.test.ts packages/fluxiq/src/client-gateway/service/command-ledger/tests/dispatch.test.ts packages/fluxiq/src/client-gateway/service/command-ledger/tests/dispatch-host-lease.test.ts` ->3files33tests passed.
- State: paired integration still requires actual recording isolation, partial engine ancestry and guarded package rebuilds. No full sweep or paid execution ran.

### 2026-11-02 - Core ownership acceptance and downstream target adapter
- Agent: senior supervisor
- Changed: public canonical permission, recording-mapping/recipe/definition and observation export seams; original browser-client contract remains narrow. Root neutralized callback-root execution into runtime/execution-observation/roots and C reuses that lifecycle. R5 mapper source is accepted; capture and partial entries remain in progress.
- Validation: lead exact permission selector ->26files274passed/45.74s; independent closure ->canonical597modules0Studio/unresolved edges, browser26modules0Node/instruction/unresolved edges. Bare-builtin browser guard refresh ->1passed.
- Validation: lead exact producer selector ->22files195passed/21.39s; successful same-node-loop affected selection plus neutral root tests ->3files17passed/11.75s. Lead exact whole-candidate selector ->14files92passed/57.83s.
- Validation: lead exact mapper selection ->17files119passed/62.79s. Root added refusal of Promise/Date/non-plain normalizer returns before candidate ID creation; focused candidate selector ->23passed (6new negative cases). Required SQL fixture remains unchanged.
- Validation: root sink/start/ingress contract isolated strict check ->exit0. Root source-local recording SDK data check ->exit0. Root neutral callback-root tests ->3passed; scoped structure ->22owned files/15rules/0failures before the final guard amendment.
- Changed: downstream target-normalization owns the actual 24-declaration normalization closure and registers its SDK hook on the real web implementation bundle. Source-only browser build contains3domain modules/0Core runtime implementation imports; four literal Node unit cases pass.
- Validation: source-local pinned-checkpoint comparison ->650exact JSON-byte cases/0differences. Initial probe tried a helper already moved by the mapper worker; reference corrected to unchanged committed Core checkpoint, without editing/bypassing any package-currency guard. Normal guarded downstream checks remain pending a real Core rebuild.
- Decision: configured recording context provider's approved project is final (intentional security correction to old request-over-provider precedence). No-provider explicit request behavior and host request/session precedence remain legacy-compatible; later matching writes/Stop use the stored owned address.
- Outcome: Partial; current global package/build/paired integration gate is not yet claimed.
- Follow-up: finish R5 capture and bounded partial entries, freeze source, run current narrow package/library/downstream gates and paired integration. Complete all remaining R6-R8 work, final R9 checks, THEN required R10 shared chat UI package.


### 2026-11-02 - SQL accepted; actual source composition and router extraction
- Agent: senior supervisor
- Changed: service lifecycle/controller/resolver integration, original gateway handler pair capture, early complete source cohort in runtime/build-execution, actual bootstrap tool roots and private per-build trial-source binding. Native summary and flow-binding authority extracted into focused owners. No baseline increase.
- Validation: lead `pnpm.cmd --filter fluxiq exec vitest run` with the ten exact A2 report subjects and `--maxWorkers 2 --minWorkers 1` ->10files90passed/92.71s on final owner-pin source.
- Validation: lead build-tool SQL and flow-binding subjects ->2files5passed/51.33s, including actual counter-write/throw/reopen, original callback identity and unsupported success. Initial SQL run had2passing tests but failed its required SQL-group marker guard; marker corrected before the passing normal run.
- Validation: `pnpm.cmd exec tsc -p .fluxiq/refactor/tsconfig-build-composition.json` ->exit0 for18owned files and actual transitive dependencies. Scoped15rules initially rejected deep composition placement and barrel bypasses; source moved to shallow runtime/build-execution and imports corrected, final scoped refresh pending.
- Validation: documentation backup commits Corecbbfc05e/downstream2f16c2a2 are LOCAL ONLY; both normal pre-push hooks refused the active tree. Core reported unfinished worker structure findings; both reported generated outside-repository Markdown links. Generator now emits portable sibling paths as plain code, its15tests pass. Hooks remain enabled; retry waits final audited snapshot. Earlier accepted checkpoint6a871e62/ed155444 remains pushed.
- Outcome: Partial; source integration/builds/current downstream acceptance still required.
- Follow-up: complete B/C, independently accept router/producer/cache cases, finish structure/exports/build/paired narrow integration and all remaining ownership phases, then required shared UI package.


### 2026-11-02 - Paired checkpoint pushed; durable integration active
- Agent: senior supervisor
- Changed: paired task backups, private entry/reservation identity verification, shared source/gateway contracts, service controller/resolver composition and focused flow-binding module. A2/B/C workers own disjoint implementation paths.
- Validation: `git push -u origin task/t843-runtime-foundations` ->succeeded in both repositories, Core6a871e62/downstreamed155444. No dev/main promotion or package publication.
- Validation: lead A1 focused authority run ->29passed; `pnpm.cmd exec vitest run packages/fluxiq/src/programs/automation-studio/runtime/service/flow-binding/tests/resolve.test.ts` ->3passed after adjusting unsupported test assertion syntax.
- Validation: Core-first working-document generator repair `node --test scripts/structure-audit/rules/tests/working-docs.test.mjs` ->15passed; downstream `node scripts/check/core-mirror.mjs` ->72files match. Scoped flow-binding15-rule review ->0failures/0warnings.
- Validation: `pnpm.cmd exec tsc -p .fluxiq/refactor/tsconfig-flow-binding.json` ->four TS18048 errors in actively edited candidate-trials/mode/owner.ts110; reported to owning worker, not repaired outside ownership. This imports the actual storage dependency closure; integrated typecheck remains pending.
- Outcome: Partial; current integration not yet package-validated.
- Follow-up: connect actual producers/SQL/candidate seams, independently verify counter/reopen/lost-ACK/read-only cases, continue all remaining ownership phases, then required shared chat UI package.


### 2026-11-02 - Accepted checkpoint before durable integration
- Agent: senior supervisor
- Validation: final normal three-library Core build ->exit0 (fluxiq17627files); final `pnpm.cmd --filter fluxiq check` ->exit0/14659ms; contracts check ->exit0. Downstream `node scripts/check/core-build.mjs` ->current with source.
- Validation: final full Core and downstream `node scripts/structure-audit.mjs` ->exit0. `pnpm.cmd structure:baseline` ->Core1lowered/15removed,1095entries; downstream1lowered/0removed,583entries. No new or transferred exceptions.
- Validation: lead current Core acceptance ->59files/512distinct cases passed. Lead current downstream acceptance ->domain repaired25plus6passed, safety52passed, extension159passed, runner26passed;268distinct cases,0failed/0skipped. All normal guards used; logs under ignored .fluxiq/lead-final-*.log.
- Validation: worker normal extension all-five-entry build and three22-file distributables plus runner four-package build/check passed; lead independently observed final Core typechecks/audits and reran every selected test subject.
- Outcome: Accepted checkpoint, original goal remains Active.
- Follow-up: back up exact scoped task-authored changes on paired branches; keep dev/main pending real retest repair. Next source units A2 durability/sole observer, B actual execution producers and C candidate authority, then remaining ownership/browser phases and required final shared UI.


### 2026-11-02 - Built-package downstream acceptance and final queue idiom
- Agent: senior supervisor
- Validation: Core `pnpm.cmd --filter @fluxiq/contracts check` ->exit0; `pnpm.cmd --filter fluxiq check` ->exit0, actual combined source/test typecheck107999ms. Downstream full structure ->exit0 (legacy advisories remain).
- Validation: current normal extension check/build and four-package runner dependency build/check ->exit0; extension159/159 and runner26/26 passed with zero skips. Current normal domain build/check ->exit0 and verified Core current; repaired31/31 and safety52/52 passed. Supported withheld-origin case now executes saved click/type and succeeds through repair/judgment.
- Changed: after downstream runners completed, adjusted A1 retained cleanup waiter from used catch to prescribed queue-tail then form. Errors still surface through awaited release; no data fallback or runtime behavior change.
- Validation: full Core audit had one remaining failure-as-empty queue-idiom finding; targeted `node scripts/structure-audit.mjs --rule failure-as-empty` after correction ->passed,0warnings/60baselined. Lead A1 rerun ->28/28passed. Final full audit/build/typecheck refresh is in progress; downstream subjects do not consume standalone A1 and are not needlessly repeated for this private idiom change.
- Outcome: Partial
- Follow-up: finish final guards and shrink-only baseline, commit/push paired task backups; no dev/main promotion with the known three retest protocol failures. Continue A2/B/C and remaining R5-R8, then final shared UI package.


### 2026-11-02 - Final source-batch integration corrections
- Agent: senior supervisor
- Changed: restored local canonical proposal-predicate import in Studio durable metadata writer (a reexport alone did not bind its internal call); A1 abort cleanup now retains real background write errors and awaited release surfaces original causes, with focused release finalizer and truthful tracking-only comment.
- Validation: initial library build stopped on TS2304 at durable.ts140 before a fluxiq stamp; explicit local import corrected it. Subsequent normal three-library build passed, then final cleanup-inclusive build passed: contracts/client gateway valid stamp reuse, fluxiq rebuilt17627files and exited0.
- Validation: full structure found exactly two discarded handlers in A1 under swallowed-failure; owner fixed actual propagation without an audit exception. Lead reran `vitest run src/runtime/execution-admission/tests/authority.test.ts src/runtime/execution-admission/tests/lifecycle.test.ts src/runtime/execution-admission/tests/concurrency.test.ts` ->3files/28passed. Distinct primary source acceptance now59files/512passed.
- Validation: additional bootstrap-adaptation storage compatibility selection ->one file,7passed/1skipped, exit0; not claimed as coverage of every durable metadata branch.
- Finding: A2/B discovery agrees both gateway routes use actual backend parent; required Context remains original and binds once. Actual host leases prove current ownership, not durable freshness; default resource proof remains unverified. No invented clear baseline from telemetry/page/reset/new epoch.
- Outcome: Partial
- Follow-up: final combined structure/package/downstream acceptance, shrink-only baseline refresh, paired backup commits; then actual A2/B/C safety integration and remaining ownership phases before shared UI.


### 2026-11-02 - Continuation source freeze and lead acceptance
- Agent: senior supervisor
- Changed: actual R5 indexing with own-key dictionaries, R6 shared change contracts/parser/table, R7 draft/destructive mechanisms and presentation/schema seams, A1 neutral private admission lifecycle/contracts; canonical parent/public exports and authored architecture.
- Validation: lead current `vitest run src/runtime/recording/indexing src/runtime/recording/tests/ownership.test.ts` ->7files/32passed, including opaque IDs and erased-import program independence.
- Validation: lead current `vitest run src/runtime/execution-admission/tests/authority.test.ts src/runtime/execution-admission/tests/lifecycle.test.ts src/runtime/execution-admission/tests/concurrency.test.ts` ->3files/26passed. Strict NodeNext canonical authority typecheck ->exit0.
- Validation: lead continuation selection logged in .fluxiq/lead-continuation-acceptance.log ->49files/452passed, including all384draft/destructive cases, remaining18legacy/index/realSQL cases and50change/model/promotion cases. Combined distinct acceptance59files/510passed.
- Validation: before/after AST probe ->4parser/helper function bodies and exhaustive gate-table initializer exactly unchanged.
- Outcome: Partial
- Follow-up: coordinated three-library build, package checks, full structure and current downstream fixture acceptance; paired backup commits then next durable SQL/producer/candidate work. Full original audit and final shared UI remain incomplete.


### 2026-11-02 - Capture contract diagnosis and R6 shared authority
- Agent: senior supervisor
- Changed: canonical executable change proposal/risk/status/origin/validation DTOs, exhaustive patch classification and actual proposal predicate; exact bounded origin parser/helpers moved into flows/executable/change. Old model/gate/parser/predicate names forward to the same authorities. Three pure origin tests moved beside the canonical parser.
- Validation: focused legacy model/validation/promotion selection ->three files/50 passed; after test relocation canonical parser plus legacy model ->two files/16 passed. Strict NodeNext exactOptionalPropertyTypes/noUncheckedIndexedAccess canonical change typecheck ->exit0.
- Validation: first source-test attempt collected no tests because root exported an indexing barrel before its worker had created it; removed premature runtime parent export, then all targeted cases passed. Restore only after worker reports coherent barrel.
- Finding: URL-less-start fixture omitted mandatory DomSnapshot.url, which the real browser producer always supplies. The intentional first-phase capture-error contract correctly exposed it. Do not weaken production sanitizer or hide capture errors. Valid withheld-address capture has no origin/reset token; exact carried case with this truthful stimulus passed1/1 with original action/full-run/no-reset assertions intact and stronger privacy/capture checks. Normal guarded acceptance waits for the next batch build.
- Outcome: Partial
- Follow-up: workers implement R5 indexing and R7 draft mechanisms in disjoint files; durable re-entry API review then actual repair; remaining R6/R8 work and final shared UI remain required.


### 2026-11-02 - Current integration acceptance exposes URL-less-start regression
- Agent: senior supervisor
- Changed: expanded transitive Studio-independence checks to all new runtime owners; corrected declaration tooling statement layout; persisted concrete final shared-chat package acceptance.
- Validation: worker current normal extension check/build -> exit0, five browser entries and three distributables; runner dependency build/check -> exit0; extension159/159 and runner26/26 passed.
- Validation: lead independent extension pass-row/action-runner selection ->43/43 passed; current domain listing/carried selection ->11passed/1failed. Independent worker repaired-domain selection ->30passed/1failed, same URL-less-start case, no initial saved actions or judge calls. Closest safety ->52/52 passed.
- Validation: current Core exact eight fixture files ->66passed/3failed, only known candidate-retest protocol conflicts. Full structure after tooling/guard edits ->only stale working index, regenerated separately; no source or transitive-boundary violation.
- Outcome: Partial
- Follow-up: diagnose/fix actual URL-less-start behavior without weakening oracles; recording indexing discovery begins read-only; durable retest API review active; final rebuild and paired backup commits await coherent repair.


### 2026-11-02 - Current foundation build and declaration portability
- Agent: senior supervisor
- Changed: public package seams, browser-safe composite definition addressing, moved test-helper imports; declaration-origin-proven public import rewrite and static local build-script dependency fingerprints; authored ownership/package docs.
- Validation: combined fluxiq package check -> exit 0; independent dispatch/composite selection -> 15 files/78 tests passed. Full structure identified one new packed tooling statement; correction waits for source-frozen downstream acceptance. No baseline exception was added.
- Validation: `node --test scripts/tests/rewrite-declaration-imports.test.mjs scripts/build-cache/workspace/tests/script-dependencies.test.mjs scripts/build-cache/tests/ignored-inputs.test.mjs scripts/build-cache/tests/registry.test.mjs` -> 30 passed, zero failed.
- Validation: `node scripts/build-cache/cli.mjs contracts:build fluxiq:build client-gateway-websocket:build` -> exit 0, all three libraries built and stamped through normal owning scripts. Downstream `node scripts/check/core-build.mjs` -> current with source, exit 0.
- Outcome: Partial
- Follow-up: current normal downstream acceptance, tooling formatting/guards, commit paired foundations, structural retest safety repair and remaining ownership phases before reusable UI package.


### 2026-11-02 ? Foundation handoffs and exact historical evidence
- Agent: senior supervisor
- Changed: R1-R5 foundation integration/public exports, shared routing DTO authorities, legacy adapter feature/test placement, seven retargeted moved stub-host imports, downstream SDK/native migration, next minor package versions.
- Validation: independent R1 seven files/31 tests; R2 ten canonical files/64 tests plus four compatibility/progress files/eight tests; all-import closures including erased types -> zero Studio/engine reach from base runtime owners.
- Validation: independent R5 seven canonical files/12 tests plus four legacy policy/type/roundtrip files/17 tests -> passed. Contracts build/check -> exit 0. Legacy adapter feature test after cohesive grouping -> passed.
- Validation: pre-refactor t844 selected downstream -> six passed/25 failed, exactly matching original daily failures; corrected TEST-only overlays -> all 31 passed and unchanged safety selection -> 52 passed. Pre-refactor Core eight files -> 55 passed/14 failed, exactly matching daily failures; corrected fixtures now leave only three unchanged real protocol failures.
- Validation: combined Core package typecheck initially found seven stale test-helper import paths after R2 move; retargeted to canonical helper, rerun active. No production/type errors were reported in that initial gate.
- Outcome: Partial
- Follow-up: source-stable gate/current build acceptance, structural uncertain-act/retest repair, all remaining generic/web ownership groups, final required reusable UI package.


### 2026-11-02 ? Daily sweep baseline assertion repair
- Agent: senior supervisor
- Changed: downstream scripts/task/tests/builds-through-cache.test.mjs removes a stale direct-call text assertion already covered by behavioral start tests; preserves cache-boundary scan and shared-move/full-validation checks.
- Validation: original Core full `pnpm.cmd check` -> exit 0, including all four package checks and the web app. Core whole tests continue in background.
- Validation: original downstream full `pnpm.cmd check` -> 729 tooling tests passed, one failed, one skipped; stopped before package checks because a regex expected direct buildCore invocation instead of the already-existing injected prepare.buildCore.
- Validation: original pre-refactor task/start.mjs blob fails the same regex and is unchanged by t842; baseline cause verified before editing.
- Validation: t843 `node --test scripts/task/tests/builds-through-cache.test.mjs scripts/task/tests/start.test.mjs` -> 13 passed, zero failed; real paired task startup also built all three Core libraries successfully.
- Outcome: Accepted
- Follow-up: merge repair with t843 and rerun only narrow checks before integration; conserve the second full sweep for a coherent later checkpoint. Both first daily whole test/build runs continue; main promotion waits for a clean complete sweep.


### 2026-11-02 ? t843 foundation dispatch and context packing
- Agent: senior supervisor
- Changed: disjoint R1/R2/R5 worker assignments; one canonical ExecutableFlowRunStatus authority with exact Studio alias; actual reusable context packer moved to runtime/models/context with minimal candidate/disposition contracts and exact old function facade. Studio store composes canonical candidate with its persistence-only fields.
- Validation: `pnpm.cmd --filter fluxiq exec vitest run src/runtime/models/context/tests/pack.test.ts src/programs/automation-studio/runtime/tests/reusable-llm-context.test.ts` -> two files, five tests passed; original whole-projection/order/dedup tests moved intact and legacy function identity preserved.
- Validation: standalone strict NodeNext typecheck of canonical context index and execution run-status -> exit 0, no diagnostics (exactOptionalPropertyTypes and noUncheckedIndexedAccess enabled).
- Outcome: Partial
- Follow-up: service/store integration and package checks at coordinated t843 source freeze; do not run broad validation against peers' changing source.


### 2026-11-02 ? Integrate t842 and continue t843
- Agent: senior supervisor
- Changed: merged first capability group to both original dev checkouts; opened paired task/t843-runtime-foundations with separate Core/downstream worktrees.
- Validation: downstream `pnpm.cmd task finish t842` -> full structure gate passed, merged, worktree removed.
- Validation: Core `pnpm.cmd task finish t842 --skip-checks` -> mandatory three prompt-contract files/70 tests passed; merged through Core tooling. Broad check intentionally left to daily sweep after already passing focused checks.
- Validation: `git push origin dev` in both original repositories -> succeeded. Backup task branches also pushed; no main or package publication.
- Outcome: Accepted
- Follow-up: execute all remaining ownership phases; first daily full sweep runs on stable dev while source work continues only in t843. Do not move shared chat UI until both full audits/refactors are complete.


### 2026-11-02 ? First extraction acceptance
- Agent: senior supervisor
- Changed: canonical execution group, downstream matcher migration, explicit capture boundary and cohesive test support; prepared remaining source briefs and R6/R7 ownership plans.
- Validation: Core `pnpm.cmd --filter fluxiq exec vitest run src/programs/automation-studio/runtime/llm/deepseek/tests/system-prompt.test.ts src/programs/automation-studio/runtime/flow-bootstrap/plan/tests/extraction-vocabulary.test.ts src/programs/automation-studio/runtime/flow-bootstrap/plan/tests/issue-feedback.test.ts` -> three files, 70 tests passed.
- Validation: downstream test-runner and extension checks after latest Core build -> exit 0; both rebuilt successfully rather than relying on an outdated stamp.
- Validation: `node --test packages/test-runner/dist/flow-lane/tests/persisted-flow-run.test.js packages/test-runner/dist/flow-lane/tests/target-resolution.test.js packages/test-runner/dist/flow-lane/repair/tests/run-repair-lane.test.js` after cohesive helper/test split -> 67 passed, zero failed.
- Validation: `pnpm.cmd --filter @fluxiq-web-extension/extension test:content -- --workers=2 identity-resolution.spec.ts identity-ambiguity.spec.ts identity-veto.spec.ts` -> actual complete output: 34 passed; independent lead run of the same specs with the nine repaired cases selected by --grep -> nine passed, zero failed (47.7 seconds). Earlier failures exposed stale retry/place-context expectations; production scoring/target/retry logic unchanged.
- Validation: Core task branch commit and push -> succeeded; paired dev/main not yet merged or pushed.
- Outcome: Partial
- Follow-up: independent browser result and paired narrow-gated integration, then all remaining required source groups and final reusable UI package.


### 2026-11-02 ? Package integration and browser gate
- Agent: senior supervisor
- Changed: canonical capability integration, explicit capture result handling and domain matcher registration; focused test support split.
- Validation: Core `pnpm.cmd --filter fluxiq check` and `pnpm.cmd --filter fluxiq build` -> exit 0.
- Validation: Core selected regression runner -> 2,350 tests passed, eight failed; subsequent exact five affected-file rerun -> 22 passed, zero failed. Original dev reproduced stale cache oracle before correction.
- Validation: `pnpm.cmd --filter @fluxiq-web-extension/domain test element-fingerprint/tests output-nodes/tests/native-runtime output-nodes/tests/definitions actions/action-effect/tests runtime/tests/state-routing-run` -> 80 passed, zero failed.
- Validation: `node --test packages/test-runner/dist/flow-lane/tests/persisted-flow-run.test.js` -> 32 passed, zero failed (before cohesive support split).
- Validation: downstream test-runner and extension package checks -> exit 0, valid cache stamps reused.
- Validation: realistic-site Chromium identity-resolution/ambiguity/veto selection -> failures observed; investigation active, not accepted as passing.
- Outcome: Partial
- Follow-up: resolve browser failures, rerun split tests and structure gates; paired first-group integration, then all remaining phases including final shared UI package.


### 2026-11-02 — Required reusable chat UI package
- Agent: senior supervisor
- Changed: paired working documents; added explicit user-requested completion phase.
- Why: after the full audit/refactor of both repos, move the extension chat stream UI/component data into a separate reusable Core package, tentatively `@fluxiq/ui-components`, usable by any project/client; extension consumes it through browser-specific bindings.
- Validation: not validated; requirement recorded before implementation.
- Outcome: Partial
- Follow-up: execute only after the existing full audit/refactor phases, preserving stream behavior and keeping extension/browser APIs outside the shared package.

### 2026-11-01 — Begin t842
- Agent: senior supervisor
- Changed: paired plan and discovery briefs.
- Validation: not validated; initial dispatch only.
- Outcome: Partial

### 2026-11-01 — Verify neutral runtime contracts
- Agent: senior supervisor
- Changed: contracts runtime seam and generic runtime imports.
- Why: generic runtime must not depend on Studio result contracts.
- Validation: `pnpm.cmd --filter @fluxiq/contracts exec vitest run src/tests/runtime.test.ts src/failure/tests src/actionability/tests` -> 5 files passed, 50 tests passed.
- Outcome: Accepted
- Follow-up: integrate framework execution and web adapter moves.

### 2026-11-01 — Independent node/runtime/matcher verification
- Agent: senior supervisor
- Changed: canonical capabilities, contract seam and web adapter extraction.
- Validation: `pnpm.cmd --filter fluxiq exec vitest run src/components/automation` -> 22 files, 184 tests passed.
- Validation: `pnpm.cmd --filter fluxiq exec vitest run src/runtime/tests src/runtime/result-control/tests` -> 5 files, 43 tests passed.
- Validation: `pnpm.cmd --filter fluxiq exec vitest run src/runtime/target-matching/tests/matcher.test.ts src/programs/automation-studio/fingerprinting/tests` -> 3 files, 9 tests passed.
- Validation: `pnpm.cmd --filter @fluxiq/contracts build` and `pnpm.cmd --filter @fluxiq/contracts check` -> exit 0.
- Outcome: Accepted
- Follow-up: global source-stable package and integration checks, residual extraction.


### 2026-11-02 — Combined integration checkpoint
- Agent: senior supervisor
- Changed: full capability migration tree at source-stable checkpoint.
- Validation: `pnpm.cmd --filter fluxiq check` -> failed: canonical/Studio graph envelope type mismatches, missing host DTO exports and readonly provider request diagnostics.
- Validation: `node scripts/structure-audit.mjs --json` -> 36 failures; dominant engine module SCC plus facade directory counts, prefix/depth placement, swallowed failures and stale index.
- Outcome: Partial
- Follow-up: engine-integration-fixes, studio-execution-adapters, model-integration-fixes dispatched; no full daily sweep used.

## Worker Briefs

Written briefs are under `runtime-ownership-refactor/briefs/`; each worker owns only its named report or source paths.
Core discovery: core-runtime and core-web. Downstream discovery: extension-boundaries.
Core implementation: runtime-contracts. Architecture review: execution-architecture.
Node implementation: node-ownership. Additional web audit: fingerprint-boundary.
Kernel implementation: execution-ownership. Web matcher implementation: web-matcher-ownership.
Provider/agent implementation: model-ownership. DSL implementation: dsl-ownership.
Read-only completion audit: residual-runtime.

## Decisions

- Existing Studio-prefixed names and persisted discriminator strings remain compatible.
- Framework execution consumers exist downstream; Studio naming does not establish program ownership.
- Executable graph types belong in flows/executable; neutral nodes in components/automation; executor in engine/automation.
- Studio retains editor/project APIs, persistence and product-specific authoring composition; shared execution support moves with its kernel.
- Framework owners must not import Studio, including type dependencies; the structure gate enforces the cut.
- Browser DOM producers and concrete web behavior remain downstream; generic web-panel rendering/HTTP transport are Core host concerns.

## Open Questions

No decisions requiring the user. Engine, provider/agent and web matcher ownership are implementation work.

None requiring user input.
