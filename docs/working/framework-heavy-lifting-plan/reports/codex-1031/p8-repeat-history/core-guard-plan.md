# P8 Core unchanged-runtime-repeat guard — implementation design

## Decision and source anchors

Implement a private, frame-scoped **observed unchanged execution** guard, separate from the existing Repeat-only and state-routing guards. Refuse the prospective third identical logical visit before dispatch, after two completed comparable visits left the observed runtime unchanged. Missing evidence preserves the existing execution path and maxSteps. This is an observable no-progress safeguard, not a general proof that an arbitrary program cannot eventually terminate.

Source inspected in task t829; no source changed or validation run:

- `executor/graph-run.ts:294` owns the graph loop/context, publishing outputs at approximately 483, and all retry/routing decisions. Its default/maxSteps protection and `repeat-progress` call remain.
- `executor/node-execution/attempt.ts:86` calls `automationStudioRefreshInputs`; accepted target-refresh changes follow at 91–97; trusted original/refreshed effect floors and unresolved-binding refusal follow. `beforeAction` is captured at 135. The first executable branch follows the definition-version refusal at 137–139. **This is the pre-dispatch hook.** Native, composite, Call Subflow and built-in execution all occur after it.
- `executor/parameter-refresh/inputs.ts:8` is the authoritative binding precedence: options inputs, variables, run values, then collected inputs; `$node` references are rewritten through `node-inputs.ts`. Reuse this resolver rather than independently interpreting bindings.
- `executor/node-inputs.ts:10` explains why `attempt.inputs` is unsuitable: it contains every earlier output. Native execution instead receives options inputs plus `collectWiredNodeInputs` (`attempt.ts:161`); built-ins receive the merged view (`attempt.ts:208`). Unused command IDs/timestamps in earlier outputs must not mask a stall.
- `executor/host-state.ts:28` captures before state and may offer the preceding accepted ref for reuse; `enrichAttemptWithHostState` captures after state and diffs it. Existing `stateRefs`, IDs, timestamps and opaque diffs provide no typed semantic equality proof.
- `executor/step-loop/arrival.ts:60` skips completed acts **before** normal execution, and later runs On Before/readiness/reacquisition. `graph-run.ts:404` repeats the ledger check after source-less identity recovery. These protections remain ahead of the new guard.
- `executor/target-reacquire/source-rerun.ts:23` runs the source internally through the same node executor with a copied run state and no public attempt. Do not accidentally make that read a new guard occurrence.
- `nodes/control-flow/for-each.ts:128` advances real iteration index; `repeat.ts:79` advances its real pass index. `control-flow/loop.ts` routes from condition and exposes maxIterations as an output; its name/parameter alone does not prove that an actual counter advances. `control-flow/shared.ts:4`, `logic/compare.ts`, `data/get-variable.ts` and `data/set-variable.ts` establish the real data dependencies that finite conditional cycles use.
- `step-loop/arrival.ts` identifies arrivals by node change; a graph self-edge therefore need not increment arrival ordinal. Neither ordinal nor attempt ID is a reliable logical-visit discriminator.
- `frames/graph-frame.ts` creates each invocation; `graph-run.ts:258` restores only variables/loops on parked resume; `step-loop/incident-repair.ts:287` swaps the graph reference for a repair. Guard memory must not be reconstructed from saved traces.
- Read accepted `p8-identity/p8-remainder-discovery.md`, source-less-target-recovery architecture and this task's `host-digest-discovery.md`. The web digest exists, but current captures do not certify its completeness or resource scope. No web source facts are assumed beyond that report.

## Optional typed host interface for the lead to freeze

Add focused types under `runtime/runtime-repeat/`, export them through its barrel and `host-runtime.ts`. Add this optional host method; do not add equality tokens to persisted state refs or their model-readable summary:

```ts
export type AutomationStudioRuntimeRepeatObservation =
  | {
      kind: "observed";
      coverage: "complete";
      resource: string;
      target: { kind: "none" } | { kind: "identified"; key: string };
      viewDigest: string;
    }
  | {
      kind: "unavailable";
      reason: "missing" | "partial" | "unreadable" | "unsupported";
    };

export type AutomationStudioRuntimeRepeatObservationInput =
  AutomationStudioHostRuntimeActionContext & {
    point: "before_action" | "after_action";
    stateRef: AutomationStudioHostStateSnapshotRef;
    signal?: AbortSignal;
  };

// Member of AutomationStudioHostRuntimeBoundary:
observeRuntimeRepeat?(
  input: AutomationStudioRuntimeRepeatObservationInput
): AutomationStudioRuntimeRepeatObservation |
   Promise<AutomationStudioRuntimeRepeatObservation>;
```

Contract:

- The method derives equality evidence from the **already accepted capture** identified by stateRef. It performs no action and requires no additional browser capture. Core asks immediately after each existing before/after capture. A bounded host cache can retain the current accepted capture privately; cache misses return unavailable. This keeps capture metadata out of trace/model context and preserves the existing previousStateRef optimization.
- resource is an opaque equality token incorporating every resource/document/incarnation boundary relevant to that host. Equivalent content in different resources must not compare equal. target identifies the actual resolved subject in that resource, independently of temporary handles/position/selectors. `none` explicitly means a genuinely targetless operation, not a failed lookup.
- viewDigest represents comparable relevant state, not a snapshot ID, timestamp, summary string or model assessment. `complete` must be positive, scoped evidence. Partial/unanswered captures, missing scope, an unidentified required target and operations whose relevant effects are unobservable return unavailable. The web producer must gate the existing digest using its actual completeness/scope facts; the checksum alone supplies neither.
- Validate closed shapes and bounded nonempty token strings (proposed 256 characters each); catch throws/getter failures/malformed answers as unavailable. No token or callback error text is copied into a trace, activity, failure or model request. Observation cannot grant permission, authorize refresh or assert that a lasting effect is safe to repeat.
- A host that omits the method, or cannot meet the evidence contract for an operation, executes as today. Do not make this a new admission prerequisite.

## Stable Core dependencies, without volatile output noise

Do **not** fingerprint `ctx.values`, `attempt.inputs`, all outputs, capture refs, command receipts, timestamps, attempt/step counts or arrival ordinals.

Compile a bounded read set for the current graph reference, then resolve that set through the existing executor precedence at boundaries:

1. Every authored parameter value that is actually state-bound, including nested bindings and rewritten `$node` references. Resolve using `automationStudioRefreshInputs`, but retain only its resolved parameter values/missing status, never its merged `inputs` field. Static parameter values may be included as part of the graph/action definition key. Missing/unreadable bindings break comparability.
2. Actual input values consumed by **known deterministic Core definitions**: pick their canonical declared input ports from `collectNodeInputs`, including the unqualified fallback values the current built-ins really read. Do not assume that an unwired port is absent. Include these upstream data inputs, not merely the final boolean result: a counter may change while `counter < limit` remains true.
3. Variable names resolved by trusted Get/Set Variable nodes and their current values, plus variables read through parameter bindings. This covers get/add/set/compare cycles even when the native action's own parameters never change. Arbitrary opaque code that reads hidden variables is not covered by pretending this list is complete.
4. Real iteration state `(loop node id, index)` for every active For Each/Repeat, including addition/removal of an active loop. Counter progress and distinct rows cannot be treated as unchanged body work. Actual row/action values still participate through their real bindings/inputs.
5. For the current executable node, include all actual resolved parameters after the accepted refresh overlay, and its **effective dispatch inputs**. Native effective inputs are options inputs plus wired ports, not the merged trace input bag. Other unknown/custom paths require an explicit supported dependency/evidence contract or are ineligible.

An output's changing command ID only matters if authored parameters or a real Core input explicitly consume it. If a real dependency itself holds an opaque changing payload, conservatively decline equality; do not strip arbitrary keys or call that semantic progress. No generic projection may discard fields of an object actually used as data.

Use canonical, bounded JSON hashing privately (SHA-256, sorted object keys, ordered arrays, explicit missing-vs-present). Proposed work bound: 1 MiB/20,000 JSON values per checkpoint and 512 graph nodes/2,048 edges; exceeding it makes that boundary unproven. Keep digests, not raw dependency copies. This is an availability fallback, not a new execution limit. Compile dependency membership once per graph revision/reference; recompute values as the run changes them.

## Transparent Core nodes and proof barriers

A web action A → Core Condition/Compare B → A cycle must retain proof through B even though the native host deliberately captures nothing for B. Permit transparent deterministic definitions only by exact canonical definition object **and execute-function identity**, following `attempt.ts`'s trustedDefinitions pattern. A string `builtin.*` prefix or sideEffectClass alone is insufficient.

Initial supported group: known Start/End/Merge, Branch/Switch/Loop, For Each/Repeat, Boolean logic, arithmetic, Constant/Filter/Map Object/Get Variable/Set Variable. Their live declared inputs, resolved parameters, relevant variables and loop state are in the read set. A change in these dependencies breaks the entire unchanged chain; no host snapshot is needed for an unchanged transparent node.

Random/timing nodes, arbitrary/custom implementations, Call Flow/Subflow, handler execution, record persistence callbacks, unknown effect dispatch, unknown external observations and unsupported host fact/control dependencies are barriers. They clear parent-frame candidates rather than receiving fictitious no-change evidence. Children have their own guard. A later independently observed pair of ordinary actions may establish a new chain.

Graph changes/repair overlays, reacquisition/source re-find, state-routing jumps, entry/handler/checkpoint routing, parked resume and cancellation also break the current proof. Do not require resetting existing run data or safety ledgers.

## Hook placement and occurrence semantics

Create `runtime-repeat` guard state on the private `AutomationStudioStepLoopContext`; pass an optional internal execution-sample handle as a final argument through `executeAutomationStudioNode` into `AutomationStudioNodeAttemptExecution.execute`. Do not place mutable guard state on spreadable public options or the copied runState: internal source reruns currently spread both. Existing source-rerun calls omit this internal argument and are never occurrences.

1. Give each **logical graph visit** a private token. A graph edge traversal starts another visit even for a self-edge. A retry `continue` retains the same token. Lifecycle/repair jumps start a fresh visit after clearing proof. Do not rely on the existing arrival ordinal. This is scheduling identity, never semantic progress.
2. In `attempt.ts`, after real resolution/overlay, trusted effect-floor resolution, missing-binding refusal, before capture, cancellation and definition-version refusal, request the before observation and ask the private gate. Re-check commandRun checkpoint/cancellation after its await. This is before Call Subflow/native/composite/definition execution and any effect dispatch. No recovery or permission path moves below this gate.
3. If admitted, capture the after observation using the existing attempt's afterAction ref and the **same resolved execution node/inputs**. Retain only private equality tokens/flags. Observation failure must not replace a real node failure. Record a visit's evidence incrementally, bounded to first/last sample and flags, rather than an array of retry samples.
4. The graph publishes ordinary outputs/variables/loop changes as today. Re-evaluate the stable read set after publication. Changed Core dependencies, any observed resource/target/view change, any unknown external sample or a barrier clear **all** candidates, not just this node. This is required when another action changes the UI and later restores the earlier view.
5. Finalize a visit once routing is settled. Count one comparable visit, never every retry. A retry gets the existing full ladder and before-attempt-four source/identity recovery. Failed attempts cannot be counted before the uncertainty/effect check and retry decision. A final failed visit is eligible only if it is explicitly unacted and every relevant sample was comparable/unchanged; uncertain, landed, permission-refused or unobserved failures never become repeat evidence. The simpler safe fallback is to leave that failed visit unproven, explicitly tested/documented, rather than counting retries.
6. On the next distinct visit, compare `(node+definition/graph, identified target, effective params/inputs, scoped viewDigest)` and the stable Core checkpoint. After the **first** completed unchanged visit, count=1. The second identical visit is admitted and, if unchanged, count=2 (first repeat). Before a third identical visit dispatches, refuse it (prospective second repeat). There are exactly **two real executions**, not three. The refusal asserts that the third visit sees the same unchanged state; it does not pretend to have observed the effects of an action it did not run. If visit two changed state, or any intermediate action changed state, there is no refusal on visit three.

Store at most one latest tuple per node, up to 512 entries; replace it on a changed tuple. Keep only fixed-size digests, count 1/2 and scheduling token/epoch. Bound active pending samples; dispose on frame exit. Retain memory across an in-memory pause, but re-observe after release. New graph-run/parked resume creates fresh memory; never rebuild it from withheld/persisted attempts. Graph reference/revision change clears it before a repair trial. Nested invocations have disjoint candidates even when node IDs match.

## Terminal failure, skips and safety precedence

On a refused pre-dispatch sample return a synthetic attempt with empty outputs/effects, status/route failed and fixed failure:

```ts
{ category: "unexpected_state", code: "executor.runtime.unchanged_repeat",
  retryable: false, stage: "dispatch", effect: "unacted" }
```

Use fixed prose: “Two completed visits left the observed runtime unchanged; the next identical visit was not run.” No raw tuple values, digests, handles, URLs, page text or host error prose. No new model-facing guidance is needed.

Append it normally in graph-run, preserve required-command/child unknown-outcome precedence, then recognize this exact failure as a terminal graph stop before ordinary retry/repair/failed-edge routing. Return its structured failure on the graph trace. The unchanged-repeat stop is not a recoverable target failure and must not launch a repair/model call or be routed back into its own loop. Existing Repeat/state-route guards and maxSteps stay unchanged.

Completed-act skips returned by arrival, already-in-state skips, and pure-only/skip-only cycles are **not** evidence of an unchanged dispatched action. They retain existing semantics and maxSteps/state-route/Repeat protections. A skip/routing barrier clears any parent candidate. Do not move the new gate ahead of the completed-act ledger to try to catch such cycles. Unknown-outcome and completed-act safety still decide before any new action can run; the guard never supplies permission or effect certainty.

## Honest semantic limits

Finite cycles driven by represented Core counters/variables/data dependencies are preserved by the read set, even when the action and final boolean repeat. Authored For Each/Repeat progress is preserved by actual iteration state. Changed target, parameters, input, view or resource reset comparison. Intermediate observable actions that restore an older view also reset it.

No generic tuple guard can prove arbitrary future semantic progress: hidden native state, random outcomes, timers, remote events and host conditions not represented in the observation/dependency contract can eventually change despite identical current visible state. Such paths must be unproven/barriers. Do not claim general termination detection or silently use attempt counts as evidence. The host's v7 checksum also has collision/reorder omissions documented in the host report; it is an equality heuristic, not an effect-integrity or safety boundary.

## Bounded implementation ownership and meaningful tests

Core source paths to edit/create, all under automation-studio/runtime:

- `runtime-repeat/` new observation/input types, barrels, guard, canonical checkpoint/read-set and trusted-transparent-definition helpers, with owning `tests/`.
- `host-runtime.ts` optional method/type exports only; `executor/step-loop/loop-context.ts` private state; `executor/graph-run.ts` scheduling, publication/settlement/barrier/terminal hooks.
- `executor/node-execution.ts` and `executor/node-execution/attempt.ts` internal sample argument plus exact pre/post-dispatch hooks. No edits to receipts, identity recovery declarations, command ledger or permission machinery.
- Authored architecture documentation for the optional contract and limitations. No generated SDK/source edits during this planning stage.

New owning Core tests: `runtime-repeat/tests/guard.test.ts`, `runtime-repeat/tests/control-dependencies.test.ts`, `executor/step-loop/tests/run-repeat-guard.test.ts` (names provisional). Acceptance cases must assert dispatch counts and final structured cause, not just helper equality:

1. Native A → uncaptured trusted Core Branch/Compare B → A, with changing command IDs, stateSnapshotIds and capture timestamps in unused native outputs: exactly two A dispatches; third refused. Also test a self-edge, which must not masquerade as a retry.
2. Before/after semantic view change, alternating A/B UI changes, progress between two otherwise identical A visits, changed target/resource/parameter/wired input, and incomplete/malformed/missing/throwing observations: no false guard stop.
3. At least seven passes of get/add/set/compare with a stable native action/final boolean until exit, including a counter wired through outputs rather than a variable. Finite Repeat and For Each with duplicate-looking rows/different indices both reach their existing exit. Verify unused volatile outputs are excluded while explicitly consumed changing values remain dependencies.
4. Four retries belong to one visit; source re-find still happens once at its existing boundary; refresh overlay is used for real dispatch; source reread is not counted. Preserve identity source precedence, cancellation after async observation, original effect floors and completed-act re-checks.
5. Parent/child node ID collisions, graph repair overlay, in-memory pause, parked resume, already-done skip cycle and unknown-lasting-effect path: no cross-frame/history false positive, no third lasting dispatch, original unknown-outcome/permission failure remains authoritative.
6. Canonical field ordering, invalid/cyclic/oversized JSON, token/accessor validation, memory capacity/disposal; secret sentinels in parameters/observation tokens/host error never appear in saved failure/activity/model-facing context.

Re-run only affected selections beside graph-run/resume, target-reacquire and unbound-reacquire, effect-check/required-outcome, lifecycle repair, repeat-progress and state-routing when implementation lands; affected typecheck and structure audit under the lead's normal gates. No full sweep allowance remains today.

Provider-free downstream proof: run the real native host binding against an isolated realistic fixture capture/dispatch adapter. A nonlasting native no-op and a Core conditional back edge must stop with two output dispatches while result/capture IDs change; assert observer requests cause **zero additional capture commands** beyond existing host-state captures. Companion changing-control case must finish normally, and partial/frame/resource-change cases must remain unproven. Host unit tests must prove completeness/scope gating and previous-ref reuse. This plan ran none of these; the lead/domain implementer owns actual wiring and evidence.

Outcome: Done
Changed: docs/working/framework-heavy-lifting-plan/reports/codex-1031/p8-repeat-history/core-guard-plan.md
Validation: not run (authorized read-only planning; no checks/builds/browser/API/panel)
Not verified: implementation, types, exact host completeness/identity producer, browser behavior or performance
Report: C:/Users/osrs_/FluxStuff/fxwork/t829/!FluxIQ/docs/working/framework-heavy-lifting-plan/reports/codex-1031/p8-repeat-history/core-guard-plan.md
Notes: Only this assigned report was edited. Interface requires lead freeze with the host producer. Available for implementation follow-up.
