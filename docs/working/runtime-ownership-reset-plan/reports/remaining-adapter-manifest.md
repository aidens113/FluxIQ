# Remaining callback and clock adapter manifest

Status: Read-only inventory complete. The groups below remain implementation and release gates; none is accepted as an unprotected exception.

Scope: The concrete adapter closure under packages/fluxiq/src/engine/automation and runtime/automation-host, plus the actual component native-clock fallback sites and existing environment wait/wrapper owners they reach. Root authorized the complete adapter-closure inspection after the initial narrower scan. No implementation of these groups, tests, builds, providers or git operations ran.

## Evidence and classification

A TypeScript AST inventory parsed **318 non-test modules** in the two adapter trees. It found **125 named callback/clock property reads**, including already guarded reads, passive numeric values and internal clock closures. A complementary external-call-root pass found 136 call sites, including ordinary array/map methods and original private owners; 136 is not a count of defects. Targeted source reads classified the concrete paths below. Searches also traced the two actual intrinsic fallback families in components/automation.

| Class | Concrete evidence | Required treatment |
| --- | --- | --- |
| Callback property read before an existing observation call | Route-state, fact/effect checks, state-routing resolvers and outside-graph inputs below | Read the descriptor first; on accessor refusal mark the actual existing frame unknown through its original observation. Preserve the callback receiver and argument tuple at the current seam. |
| Callback invoked without the existing observation port | Target reacquire/source-place, repair, parking and some resolver calls below | Use the existing engine or runtime observation invocation port at the actual call; preserve original first-result behavior for ordinary unsupported data callbacks. Do not manufacture a completion certificate. |
| Stable wrapper with mutable delegate | Live environment now/random; scoped environment's default random and virtual-clock wrappers | Wrapper identity alone cannot establish a safe delegate. Guard the actual delegated read/invocation, without silently changing unobserved wrapper behavior. |
| Mutable default selected now | `input.now ?? Date.now`, default-argument Date.now and direct Date.now()/Math.random() | An accessor can run during selection; a data replacement can be captured and accidentally trusted. Use descriptor-safe selection and the original native-clock owner on observed paths. |
| Safe original pinned intrinsic | Frozen originalNativeClockFunctions; the original native-log invocation's admitted clock | A later global replacement does not change the already captured original callable. Retain its safe pinned behavior; do not reject it merely because the current global changed. Never whitelist a newly read arbitrary replacement. |
| Passive timestamps, not callbacks | defensive/planned-retry-wait.ts:37 `input.now` and defensive/thrown-error.ts:80 `context.now` are numbers | No callback adaptation. Preserve numeric contracts. Error/trace timestamps are passive outputs, although a mutable function used to obtain one is still an executable delegate. |
| Already protected internal closure | Step-loop consumers of `ctx.now` receive graph-run's guarded clock closure after the first batch | Do not wrap every `ctx.now()` again. Protect its actual supplier and preserve its receiver. |
| Existing descriptor reader with a missing fence | repeat/guard.ts:185-192 reads observeRuntimeRepeat descriptors and returns undefined for an accessor | Getter evaluation is already avoided, but a post-admission refusal is treated as ordinary missing evidence. On the observed path retain the original frame's unknown marker; preserve the unobserved depth/missing behavior. |

The first batch's 19 guard regressions and 164-test acceptance are historical validation of that batch. They do not validate these remaining sites.

## Stable prerequisite: original observation property seam

Role: Heavy worker; current permitted Sol/effort.
Goal: Make the preserved descriptor/refusal adapter usable by lower runtime owners without a runtime-to-engine import.
Owned: runtime/execution-observation/property.ts (new), its index.ts and owning tests; engine/automation/execution-admission/kernel/callback/observed-property.ts compatibility alias and barrel if required.
Must not touch: Admission authority, persistence, driver, programs, source registries, public wire options or shared docs.
Implementation: Move/reuse the behavior of automationObservedProperty under the existing neutral observation owner. It receives the original ExecutionCallbackObservation, walks own/inherited data descriptors, calls existing markObservedExecutionFrameUnknown on refusal, and preserves direct legacy reads when observation is absent. The old engine path aliases the same implementation. Share an existing descriptor primitive if doing so preserves dependency direction; never import the engine from runtime.
Acceptance: Actual entered-frame own/inherited getter and post-admission replacement cases; zero getter/callback acts; caught refusal remains pending after reopening; original data callback receiver/tuple, absent fields and undefined-observation getter compatibility. No new private binding store, authority or completion protocol.
Tests: runtime/execution-observation/tests/property.test.ts (new); existing frame-unknown tests.
Dependency: Root owns the common export seam. Freeze it before dispatching the following file-disjoint groups.

## Group 1: lower host, verification and fact reads

Owned files, relative to packages/fluxiq/src/:

- runtime/automation-host/route-state/observe.ts:19
- runtime/automation-host/route-state/host.ts:15,38
- runtime/automation-host/route-state/effect.ts:21,45,69
- engine/automation/defensive/host-act-landed.ts:29
- engine/automation/transitions/comparison.ts:138-139,222-227,310
- engine/automation/lifecycle-run/fact-observation.ts:55,86
- engine/automation/recovery/run.ts:140,225-230
- engine/automation/node-execution/recorded-effect.ts:79-80
- engine/automation/repeat/guard.ts:73-78,185-192

Existing lineage: Route helpers and act-landed already receive ExecutionCallbackObservation and call invokeObservedExecutionCallback/Sync. Transitions/recovery use bound graph options and invokeAutomationExpectation; facts receive the original observation from transitions, state-routing and lifecycle dispatch. Repeat uses invokeAutomationCallback. Reuse those exact original owners.

Smallest fixes: Guard hostRuntime and callback reads, including availability probes. Guard fact input.now and its native fallback; observed callers must hand it the guarded clock rather than a mutable wrapper selected directly. Replace recovery's hostExpectationEvaluator availability probe with a descriptor read at the options boundary. Its actual readiness invocation still uses invokeAutomationExpectation. Preserve the legacy hostExpectationEvaluator implementation/API: the only production non-alias Core consumer found is recovery/run.ts:140, so no new ambient observation is needed in the legacy helper. Replace repeat's observed silent accessor refusal with the existing unknown-frame fence.

Original tuples/receivers: observeRouteState(host,[request]); signRouteState(host,[state]); compareRouteSignatures(host,[recorded,observed]); signRouteEffect(host,[before,after]); routeEffectHolds/Seen(host,[effect,observed]); actLanded(host,[input]); expectationEvaluator(host,[conditions,mode,timeoutMs,context]); factEvaluator(host,[conditions,input.context]). Do not bind a copied host or pass an observation as an extra user callback argument.

Regressions: For each reader family install own/inherited getters after the actual frame enters, then catch/translate its refusal through the existing conservative fallback; assert zero getter/callback acts and durable pending/reopen refusal. Check missing project scope, missing host/method, structural signature comparison, unknown fact batches and original thrown-error behavior remain as before. Positive methods with private receiver state and exact tuples must still work. Mutate the live clock while fact observation is awaiting a host response; later timestamping must not invoke its replacement.

Acceptance paths: New runtime/automation-host/route-state/tests/observed-properties.test.ts; new engine/automation/defensive/tests/host-act-landed-properties.test.ts; new transitions/tests/observed-properties.test.ts; existing lifecycle-run/tests/fact-observation.test.ts and repeat/no-progress owner tests. Create immediate recovery/node owner cases for the availability prechecks. These are focused owner tests, not a composed build.

## Group 2: target reacquire and refresh callbacks

Owned: engine/automation/target-reacquire/{host-answer,source-place,source-rerun,step-reacquire}.ts; unbound-reacquire/{host-answer,step}.ts; parameter-refresh/floor.ts; immediate tests.
Readers: host-answer.ts26 reacquireTarget; source-place.ts25 returnToSourcePlace; step-reacquire.ts56,82-84 host/resolveActionEffect/matcher checks; unbound host-answer.ts11 reacquireUnboundTarget; unbound step.ts23,26 resolveTargetRefresh and46 host lookup; floor.ts9-10 resolveActionEffect. source-rerun.ts27 destructures onRecordBatch only to discard it, evaluating a getter before the already guarded copy.
Lineage: step-reacquire and unbound step have ctx.options for the actual graph frame. Their host-answer/source-place helpers currently receive no observation and call directly. Pass only the existing observation internally to those helpers and invoke host methods through the original observation source; do not add an observation argument to a host callback. Remove the unused onRecordBatch destructuring and retain guarded copy/delete behavior.
Compatibility: Missing returnToSourcePlace remains same_place; no matcher remains unavailable; throws/malformed answers retain current unmatched/unavailable meanings. Source reruns remain internal, read-only, unnumbered and dataset-free. Preserve exact original request, receiver and one callback argument. No lasting act or source rerun is repeated to obtain a fence.
Regressions: Replace each getter after retry2/source selection and before actual use; zero getter/host acts and pending after reopen even when translated to unmatched. Original data callbacks preserve four-attempt/rebind/gone behavior. Include a discarded inherited/non-enumerable record-callback accessor so source-rerun never reads it.
Acceptance: Existing target-reacquire/tests, unbound-reacquire/tests, parameter-refresh/tests and outside-graph/tests/reacquire.test.ts plus new observed-properties tests beside these owners.
Prerequisite: Coverage's real host names must include reacquireUnboundTarget and returnToSourcePlace. Existing legacy names checkFacts/checkActLanded/waitForTarget/sourcePlace are not substitutes for those real fields.

## Group 3: state/action-floor decision callbacks

Owned: engine/automation/state-routing/{decision,reopen,repeated-act}.ts; step-loop/already-done.ts; step-loop/lifecycle/route-guard.ts; immediate tests.
Readers: decision.ts107-113,124,307 selects resolveActionEffect and host/options classifyLegacyStepAct; reopen.ts57 and repeated-act.ts51 select input.resolveActionEffect before invokeObservedExecutionCallbackSync; already-done.ts44 calls the resolver directly; route-guard.ts46,52 forwards it and judge() calls it directly.
Lineage: decision/already-done/route-guard hold bound options. Reopen/repeated-act already receive the original ExecutionCallbackObservation. Use their existing adapter ports and descriptor-read the actual source field before invoking/forwarding it. Keep the receiver used at each current public seam; do not replace original callbacks with bound copies or accidentally transfer another receiver's no-direct-effects contract.
Compatibility: Missing declarations remain conservative; no input becomes executable from absent/unmapped action output. Completed-act and route progress state stay with their existing owners. No new replay/completion authority or copied act ledger.
Regressions: Getter installation between routing candidates, after classifier fallback and before a lifecycle guard; zero getter/action callbacks on refusal, original frame durably unknown even when the route is refused/ignored. Positive inherited/private receivers and exact resolver/classifier tuples; original forward/backward/declared-skip/repeated-act outcomes.
Acceptance: state-routing/tests/{decision,reopen,repeated-act,safe-routing,typed-skip}.test.ts; step-loop owner tests for completed acts and lifecycle route guard; node-execution/tests/action-effect-frames.test.ts.

## Group 4: composite, resume and diagnostic clocks

Owned: engine/automation/composite/{boundary,child-bounds,execution}.ts; resume.ts; node-execution/failure.ts; lifecycle-run/dispatch/dispatch.ts; immediate tests.
Readers: boundary.ts61 and88; execution.ts33,42,52,65,113,122; child-bounds.ts9 default argument and every subsequent now(); resume.ts53; failure.ts15; dispatch.ts87,140,271,327.
Lineage: Canonical composite runBody is already an admitted children kernel. Boundary holds parentOptions; graph/attempt/dispatch normally have an actual current frame. Use its existing clock/property guard and retain it through asynchronous timeout/abort callbacks. Child-bounds currently has a plain now parameter, so its two internal callers must pass the guarded original clock closure; default-argument Date.now must not be selected before that guard on an observed call.
Entry requirement: Public resume reads its clock before resumeAutomationStudioGraphRun enters the graph kernel. A mark-current helper alone is not durable when request.options has an observation but no current engine invocation. Move the resume body under the existing admission kernel/driver (or use an actual already-entered caller context), keeping pure refusals and unobserved signatures/settlement behavior. Do not manufacture a frame or claim a fence against a closed parked invocation.
Diagnostic requirement: A callback can throw and replace the clock on its way out. Preserve the original error/fault when the API promises it; retain the clock refusal's unknown marker and use a safe original pinned diagnostic timestamp where needed rather than invoking the replacement or losing the primary failure. Passive timestamps do not authorize completion.
Regressions: Own/inherited clock getter and data/container replacement before entry, after admission, while a child waits and during timeout/abort/error handling; no replaced delegate acts; pending/reopen refusal. Valid native/pinned clocks, custom clock receivers, original deadline/cancellation/region/cycle/parked-resume semantics and no replay of pre-park actions.
Acceptance: composite/tests/{run,boundary-options}.test.ts; new composite/tests/clock-properties.test.ts; engine/automation/tests/resume.test.ts; new node-execution/tests/failure-clock.test.ts; lifecycle-run/tests/dispatch.test.ts.

## Group 5: outside-graph retry input reads

Owned: engine/automation/outside-graph/retries.ts and its tests only.
Readers:53 registers current Date.now as pure at module evaluation;150 selects input.now/Date.now;151 selects delay;157 dispatch;164 read;170 checkEffect (including re-read inside its closure);188-193 reacquire and returned found.dispatch.
Lineage: automationStudioDispatchWithNodeRetries already enters the actual children kernel and supplies frame.options. Body invokes existing callback/backend ports with the original retry series. Guard input/returned callback reads against those same options. Replace import-time registration of arbitrary current Date.now with the safe bootstrap original; observed native default selection must be descriptor-safe. Never label a newly read replacement pure.
Compatibility: dispatch/now/delay/checkEffect/reacquire keep their current receiver/tuple; read remains receiver input. Preserve original first results, four attempts, wait accounting, one refresh and uncertain-lasting-act non-repeat behavior. No extra whole-run trials.
Regressions: Accessors present at first actual use, installed during prior dispatch/read/effect-check, and installed on found.dispatch; native getter installed before dynamic module import and between attempts. Zero getter/lasting callback on refusal; durable pending even when helper catches an unavailable reacquire. Original retry and reacquire positives remain unchanged.
Acceptance: outside-graph/tests/{observed,retries,reacquire,interrupted-act,action-effect}.test.ts plus a new properties.test.ts. Batch once with shared engine collection.

## Group 6: repair, learning and parking callbacks

Owned: engine/automation/step-loop/incident-repair.ts; step-loop/ask-or-park.ts; immediate tests.
Readers: incident-repair.ts53,103,143,157,226 reads/calls repairIncident/learnInterruption, including presence probes; ask-or-park.ts140 parking.open,154-155 awaitAnswer,161 clock. Include parking-object reads used in the person-needed availability path.
Lineage: Both have bound ctx.options for the original graph frame. Guard each presence/read and use existing invokeAutomationCallback for the actual user callback, preserving options receiver for repair/learning and port receiver for parking. Use the existing guarded clock after an awaited answer. Retain the actual callback's original source/completion evidence; do not certify durable learning/delivery from a returned object or a presentation fallback.
Compatibility: Missing parking still parks/resumes without delivery; missing awaitAnswer parks; delivery failure still stops; repair/learning throws retain none/current reporting and cannot silently clear an unknown frame. Keep once-per-incident/layer decisions and original request tuple. No new persistence owner or paid run.
Regressions: Getter after the presence probe and before invocation; getter installed while an awaited callback yields; caught none/undelivered fallback retains durable unknown; no model, repair, delivery or wait callback runs on accessor refusal. Pure registered/private-receiver positives preserve their existing callback tuples and first-run behavior.
Acceptance: New step-loop/tests/incident-repair-properties.test.ts and parking-properties.test.ts; existing engine/automation/tests/resume.test.ts, person-needed/ask/repair owner tests; existing parking settlement tests only if their consumer behavior changes. Assign clock+parking edits to this one owner, not Group4.

## Group 7: setup adapters, definitions and implicit built-in fallbacks

Owned: engine/automation/integration/graph-options.ts; environment/executor-options.ts; node-execution/attempt.ts; immediate tests. runtime/environment/{scoped,wait}.ts are a separate explicit owner dependency, not an automatic engine edit.
Readers: graph-options.ts29-32 native.execute/resolveActionEffect/resolveTargetRefresh/getRuntimeCapabilities and48-49 input.onRecordBatch; environment executor-options.ts25,27-28 environment.now/delay/random/startTimer. attempt.ts60/90/172/182/257-258 reads definition.execute and nested runSubflow prechecks; observed contexts still omit absent clocks.
Implicit sites: components/automation/random/shared.ts:5 and random-number.ts:37 call current Math.random when random is absent; control-flow/start.ts:16 and for-each.ts:120 call Date.now when now/referenceNow is absent. timing/wait.ts:39 deliberately uses 0.5 when random is absent. Keep that absence semantics: injecting Math.random into every observed context would change live wait jitter.
Smallest context fix: Supply guarded native fallback functions only to the original trusted built-in definitions that actually use those native fallbacks, keeping custom contexts and timing.wait's missing random behavior. Preserve integer Random Number's existing number of draws. Guard supplied context callbacks at actual invocation. No descriptor/native-clock import should make browser-loaded observation primitives reach node:crypto through runtime/environment/live.ts.
Setup lineage requirement: createAutomationGraphOptions is synchronous and can be called with an observation before any engine frame has entered. Do not claim a durable mark-current fence there. Guard callback selection without evaluating accessors, and execute capability callbacks only under the original caller/source invocation+flush; Root must keep that actual context in the setup seam. Never bless an arbitrary native runtime method because its object has a familiar shape. Preserve current synchronous API and original native execute 4-argument custom versus canonical 5-argument tuples.
Environment dependency: runtime/environment/scoped.ts36 defaults random to a new mutable Math wrapper;41-42 wrappers call clock.now/delay;43,46 read clock.startTimer. runtime/environment/wait.ts13-14 reads/calls options.delay. The wait owner has no observation parameter and cannot import engine. Guard these at the engine call boundary or thread the existing generic observation internally; retain direct legacy environment/wait behavior when no observation is supplied.
Regressions: Getter at setup with/without a genuine caller frame, definition.execute replaced after registration/admission, absent built-in now/random with globals replaced, random float/integer positive draws, timestamp start/for-each positives and timing.wait absent-random midpoint behavior. Zero getters/lasting callbacks on observed refusal; preserve unobserved replacements, callback receiver/tuple and original dynamic-definition first result.
Acceptance: Existing integration/producer/native tuple tests, environment/tests/executor-options.test.ts and timers.test.ts; native-clock/environment compatibility tests; new node-execution/tests/implicit-clocks.test.ts and definition-properties.test.ts. Read no provider keys or user state.

## Group 8: original nested ports and control method selection

This group is a concrete descriptor-read boundary, not a request to relocate control ownership or wrap every framework transition in a new authority.

| Exact files/read families | Existing owner/lineage and smallest fix |
| --- | --- |
| frames/call-subflow.ts58,63; lifecycle-run/registry.ts63-65; lifecycle-run/handler-body.ts50,53; frames/graph-frame.ts42; node-execution/attempt.ts172 | subflowGraphs.load/recovery and run.runSubflow/nextInvocationId can be read through option-exposed objects. Guard the actual read under the current bound frame; preserve the original subflow source and runner and registered orchestration. Do not create another run holder, registration cache or generic completion owner. |
| graph-run.ts148,152,186,192,376,380,382-383,458; composite files; node-execution/{attempt,execution}.ts; step-loop/{arrival,failed-attempt,incident-repair,ask-or-park}.ts; pacing/timed-pause.ts32,34; regions/execution.ts22,31; repeat/guard.ts141; recovery/run.ts74,77; resume.ts52 | commandRun and runControl method getters can execute before their original owner receives the call. Guard actual object/method reads and preserve invocation on the original control/command owner. Existing commandRun checkpoint/context/consume/receipt/withdraw/stop/own semantics and their authority remain canonical; never treat a stub or copied object as the original owner merely from its interface. |
| regions/execution.ts16,23,34 | startTimer is selected at graph-run's guarded read, but an arbitrary supplied timer callback and returned cancel method are still executable delegates. Guard selection/cancellation under the original frame; retain the original timer and cancellation receiver. Preserve real/virtual timeout and abort cleanup behavior. |
| lifecycle-run/dispatch/dispatch.ts223 and route-target.ts36 | Public-input routeGuard/valuesOf versus Core-created closures: their current internal suppliers are ordinary Core closures. Keep internal ones on their existing lineage; guard a caller-provided property before invocation when observation is supplied. Do not wrap array/map methods or passive frame/route fields. |

Regression per family: Install an own/inherited method getter on an option-exposed object after entry or during its awaited predecessor. Refuse before getter/callback acts and retain pending after reopening even when cleanup/fallback catches it. Positive original controls, nested subflows/handlers, custom private receivers, real/virtual timers and cleanup error identity must remain unchanged. A type-only interface does not establish original-owner identity; verify actual registered source/class at integration where one is required.

Owned edits must be partitioned by the exact file families above. Several overlap Groups4/6/7: the worker owning a file also owns its nested-port descriptor edits, or Root integrates those serially. Do not dispatch a second writer to the same file. New frame/subflow/control property tests belong beside frames, regions and the owning step-loop modules; use existing call-subflow, handler, region and run-control owner tests for positive compatibility.

## Router entry boundary

engine/automation/router/run.ts9 reads input.now directly and has no options, observation or admitted frame. Production search found only its canonical export and the Studio compatibility alias; the actual alias caller is programs/automation-studio/runtime/route-state/router-state.ts78. That program file was not opened or edited.

Keep ordinary standalone router behavior. Its observed owning caller must supply its original guarded clock and descriptor-read the input before entering the pure router; use the existing source context while completing that owner migration. Do not introduce ambient authority or pretend the pure router owns an execution frame. New router tests must cover native getter/data replacement and unchanged custom now receiver/result, together with a real observed-caller pending/reopen case. The canonical route owner/caller is a Root integration dependency, not permission to grow Studio backend implementation.

## Scheduling and acceptance

1. Root fixes/freezes the neutral property seam and exact setup/resume/router context requirements. This is ordinary helper/parameter plumbing through existing owners; no new observation, completion issuer, proof object, durable table or source registry.
2. Dispatch by disjoint file group: lower runtime route adapters, engine verification/target/state adapters, composite/entry clocks and lifecycle/parking/setup files. File overlaps above make those specific edits serial; generic helper consumers can proceed in parallel after its seam freezes.
3. Each worker reproduces its actual adapter/frame case once, fixes that case set, and groups its relevant owner tests on a stable closure. Record wall/collection/test duration; avoid repeated package-barrel collection. Root runs one common package typecheck/structure gate after the lanes freeze. No full sweep or provider/browser run is needed for descriptor acceptance.
4. Root verifies original public-package/browser dependency direction, callback receiver/tuple and native-log pinned compatibility; normal callback failures, failed unknown-marker persistence and reopen refusal remain gates. No baseline increase. Only after the known groups pass can complete callback/native-clock protection be claimed for this audited closure.

## Commands and limits

- Node/TypeScript createSourceFile AST traversal over the 318 modules, collecting named property reads and external call roots -> inventory/classification above. Parsing only; no program/typechecker/build was created.
- `rg -n 'Date\.now|Math\.random'` in the adapter trees and actual component fallback owners -> explicit mutable default sites above.
- Exact symbol searches for hostExpectationEvaluator, runExecutableRouter and runAutomationStudioRouter -> legacy probe and actual router caller identified; no source beyond the authorized adapter/dependency closure was opened.
- Existing test path inventory -> exact acceptance paths above. No tests were run in this read-only task. A guessed command-scope/run.ts read was absent; the actual contracts.ts was then inspected. No inferred implementation claim rests on that missing path.
- Root separately released **only** engine/automation/execution-admission/options/data.ts for the prepared compile fix during this task. Added typed known-key and PropertyKey-to-unknown overloads; implementation unchanged. Root was notified immediately and source re-frozen. No other source edits occurred. This is the 21st source/test file touched by this worker across the two briefs; Root owns its grouped verification.

Outcome: Done
Changed: This report; separately Root-authorized options/data.ts overload declarations only
Validation: AST/rg/source inventory -> finite owner groups and exact receiver/frame requirements recorded; tests/builds not run by instruction
Not verified: Runtime reproductions/acceptance for these remaining groups; original setup/resume/router caller integration; Root's common gates after the overload fix
Report: docs/working/runtime-ownership-reset-plan/reports/remaining-adapter-manifest.md
Notes: All remaining concrete groups remain release gates. No agents, providers, git mutations, shared-doc edits or new execution authority.
