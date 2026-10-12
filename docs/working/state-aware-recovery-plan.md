# State-Aware Recovery Plan - Core contracts

Status: Active
Status detail: Planned 2026-10-09; R1-R4 implemented across t385-t392 (t392 uncommitted at this writing), provider-free proofs pass; live validation is next.
Created: 2026-10-09
Last updated: 2026-10-09
Owner: Senior supervisor agent
Scope: The domain-neutral contracts for invocation frames and Call Subflow, subflow contracts (interface, entries, checkpoints, success check), lifecycle handlers and their scopes, continuations and dispositions, the integrated recovery ladder with safe state routing, one recovery incident and budget per failure, fact conditions, the requirement gate, traces, and the candidate-script grammar and unit repair that author them. Browser observation, command reconciliation, chat wording, the Lab and the schedule are owned downstream.
Paired document: C:/Users/osrs_/FluxStuff/!FluxIQWebExtension/docs/working/state-aware-recovery-plan.md
Related: [automation-studio architecture](../architecture/automation-studio.md), [flow regions](../architecture/automation-studio-flow-regions.md), [version history plan](./flow-version-history-plan.md), [MVP final month (Core)](./mvp-final-month-plan.md)

---

## Current State

**What this is.** The Core half of a plan to let a saved Flow begin from different valid page states, survive
known interruptions through scoped handlers, try a known alternative, and resume locally without calling a model;
and, when something genuinely new happens, repair only the failing unit. The consultant's proposal (2026-10-09,
quoted in the downstream document) was checked against Core `dcaf8f9f` by four code maps and a docs survey; the
adjustments are listed downstream under "Adjustments to the consultant plan". This document owns the contracts
below; the downstream document owns the schedule, the browser side, the acceptance matrix and the briefs.

**Implemented through t392 (uncommitted on `task/t392-executor-integration` at this writing).** On dev: t385 (types,
frames, pure lifecycle functions, validation), t386 (requirement gate), t387 (state-routing guards), t388 (script
grammar). t392 adds Call Subflow (C1), the trace and activity contract (C11), graph-run wiring of the five events with
handler bodies, dispositions and the shared incident budget (C3-C7), entries, checkpoint routes across frames and the
success check (C2), checkpoint-preferring safe routing, the effect check before any rung (C8), lost-command
reconciliation and the orphan sweep, and in-run repair at the failing step through today's diagnosis -> patch
pipeline (C6 step 8, C12). Its lane report is downstream, in the plan's `reports/` folder,
`t392-executor-integration.md`. Nothing has run live yet.

**Baseline facts this plan builds on (verified by code maps, 2026-10-09; AS = `packages/fluxiq/src/programs/automation-studio/`).**
- One cursor, no frames: `AS/runtime/executor/graph-run.ts:337` (`currentNode`), `run-state.ts:8-33` (in memory).
  Call Flow recurses on the JavaScript stack with a fresh run state (`AS/runtime/composite-execution/owner.ts:43-93`)
  and calls only published, version-pinned snapshots of other Flows (`AS/model/composites.ts:66-87`).
- One Subflow per run: the Router picks it before execution (`AS/runtime/service.ts:2586-2611`); its
  `inputMapping`/`outputMapping` are validated but never applied at runtime (:2644-2645). No subflow-to-subflow
  call exists; `builtin.routine.subroutine` only emits an effect nothing handles (`AS/nodes/routine/subroutine.ts:5`).
- Ladder (`AS/runtime/executor/recovery-ladder.ts:44-54`, `ladder-run.ts`): skip_satisfied_node,
  await_recorded_state, clear_interference (the first node with `metadata.clearsInterference`), retry_node,
  deterministic_path (optional way-on or authored `failed` edge), approved_runtime_patch, reroute, llm_diagnosis.
  Rungs 6-8 are recorded, not executed inside the step loop. The step loop then stops and, in an adapting run (the
  chat's "run it" carries `explore_and_adapt` since t375), the run session calls the model: diagnosis, one runtime
  patch (target override, wait-retry, step insert, reroute, recovery-subflow call), a live trial of the patch from
  the changed node on the page as it stands (`live-patch.ts:274-324`), and, when the trial vouches for it, the same run
  carries on from the trial's resume point ("a repair applied at node five continues at node six",
  `service/adaptations/adaptive-retry.ts`). The patch is applied to the saved Flow only after the run's judged end
  (`judged-promotion.ts`). t375 made the resume work; its live proof is still owed.
- State routing (`AS/runtime/executor/state-routing/`) runs before the ladder on `target_not_found` and when a
  readiness gate is unmet; it ranks every node whose recorded `before` signature matches by host closeness
  (`ranking.ts:21-40`; the web host matches on Jaccard >= 0.5). It does not check that skipped nodes produced data
  later nodes need (that check exists only in `defensive/continuation.ts:157-169`). Progress guard: 3 returns.
- Retry floor: first attempt plus 3 retries (`retry-policy.ts:43-46`); "nothing lowers a node below four attempts"
  (architecture `automation-studio.md` 710-721). Lasting acts with an uncertain effect are never blindly repeated.
- Budgets are separate counters (`model/flows.ts:260-267`, `recovery-budget.ts`): retries per action 3, recovery
  attempts per subflow 2, reroutes per run 2, interventions per run 2; waits 30 s / 60 s / 300 s.
- Mid-run position is not persisted (`service.ts:2571-2580`, trace written after the run); `resumeAutomationStudioGraph`
  has no non-test caller; no startup sweep of sessions left `running`.
- Flow-level requirements are checked against the executor's own capability set, not the connected extension's
  (`runtime/service/runtime-session/graph-options.ts:45-50`); `CLIENT_GATEWAY_PROTOCOL_VERSION` is never compared.
- Candidate script: `subflow <label>:` + `when:` blocks are mutually exclusive Router situations
  (`flow-bootstrap/authoring/assemble.ts:138-262`); `run subflow` is parsed and ignored (:150-162); `role:` is parsed
  but not shown to the model; interruptions are written inline as `optional:` + `only after:` (t378).
- Repair: the target override is pinned to the failing node; the re-author edits the whole Subflow graph through a
  legacy extend build (`service/runtime-adaptation/reauthor-build.ts:128`); every repair applies only after a judged
  whole run from the Flow's start (`judged-promotion.ts`, `judged-reauthor.ts`).

**Binding rules this plan must keep** (Core architecture and the user's standing rules, recorded downstream):
state routing stays a global runtime behaviour and precedes any model call; a model is never called from inside the
step loop, but the run session calls it mid-run when the step loop stops on an unresolved incident, and the run
carries on when the fix holds (the user's 2026-10-09 direction: repair fixes things on the fly); every node keeps the
four-attempt floor; a fix (unit or whole) is saved to the Flow only after one judged whole run from the start; handlers and contracts are declarative JSON (no code, no expressions beyond the condition grammar); data that
changes Flow behaviour is stored in the versioned graph, not on unversioned Subflow or Router records; structural
adaptations that create or edit subflows, routers or recovery paths link to an adaptation review record.

**Revised the same day (user).** Model repair happens inside the live run, at the failing step, and the run carries on
(C6 step 8); it is triggered only by a true failure: retries spent and no On Fail path to another node, or every On
Fail path tried and failed (C6, "What counts as a true failure"). Retries and planned fails never call the model.

**Next.** R1 units C1, C2 (types only), C4 (registration types and validation), C7, C10, per the downstream briefs.

---

## C1. Invocation frames and Call Subflow

**Frame.** `AutomationStudioInvocationFrame` (new, `AS/runtime/executor/frames/`):
`{ invocationId, parentInvocationId?, callNodeId?, subflowId | null, graphFlowId, graphRevision, entry: { kind:
"default" | "entry" | "checkpoint", id? }, inputs, outputs, cursor: { nodeId, phase }, incidentId? }` where `phase`
is one of `before_attempt | before_retry | before_next | failed | handler`. The run state carries the stack
(outermost first). JavaScript recursion may stay; the stack is explicit data so scope resolution, traces and later
persistence read one structure. Every attempt trace gains `framePath: invocationId[]`.

**Call Subflow node.** `builtin.control.call-subflow` (new, `AS/nodes/control-flow/call-subflow.ts`): parameters
`subflowId`, `inputs` (binding map from parent values to the child's interface inputs), `outputs` (child interface
outputs to parent values); ports `success`, `failed`, and `error.<id>` for declared child errors. It runs a sibling
Subflow graph of the same automation at its latest revision (as runs do today) and records `{graphFlowId,
revision, subflowId}` in `metadata.flowVersions`. Implementation generalises the composite owner's typed boundary
(`owner.ts:48-55`: no ambient parent values cross) to a sibling-graph target instead of copying it; cycle detection
uses the frame stack. Child nodes keep the retry floor; the container itself is not re-run as a whole (the existing
composite rule, default 1 attempt), because re-running a child repeats its acts; re-entry happens only through an
On Fail route to a checkpoint (C5). `builtin.routine.subroutine` is removed in the same unit (it is inert).

**Router-selected Subflow.** The run's first frame is the Router's chosen Subflow; its Subflow-record mappings are
now applied to the frame's inputs. Launching a subflow graph directly stays refused (`service.ts:2695`).

## C2. Subflow contract

Stored in the Subflow's graph (versioned), never only on the Subflow record:
- **Interface.** The graph Flow artifact's existing `interface: { inputs, outputs }` (`AS/model/flows.ts:133-146`)
  is the contract; the Subflow record's mappings bind parent ports to it.
- **Default entry.** The graph's Start node (unchanged rule: exactly one, `start-node.ts:40-60`).
- **Alternative entry.** Node metadata `fluxiq.entry = { id, order, when: FactCondition[], requires: string[] }`.
  `requires` names interface inputs or values that must be bound when execution starts there.
- **Recovery checkpoint.** Node metadata `fluxiq.checkpoint = { id, when?: FactCondition[], requires: string[] }`.
  A node may be both. Only checkpoints are legal Route targets (C5).
- **Success check.** Graph metadata `fluxiq.successCheck: FactCondition[]`, evaluated when the frame reaches End;
  `false` fails the frame with a verification failure (not retryable at node level; On Fail at subflow scope),
  `unknown` fails it as unproven.
- **Replay restriction.** Derived from the existing side-effect model (`defensive/node-side-effect.ts`,
  `lasting-act.ts`): `safe` when `RepeatIsSafe`, `reconcile` for a lasting act, `never` when `requiresApproval` or
  destructive. Optional override `metadata.replay` may only tighten, never loosen.

**Entry selection at invocation** (C3 On Start runs first): bind inputs; evaluate alternative entries by ascending
`order`; the first whose `when` is all `true` and whose `requires` are all bound wins; otherwise the default entry.
The chosen node still passes its readiness gate and On Before. Entry selection happens at invocation and at Route
dispositions only, never after an ordinary success. A new invocation never reuses a previous run's outputs; a
resumed invocation keeps only outputs whose producing node is upstream of the resume point on the frame's own path.

## C3. Lifecycle events and where they fire in graph-run

| Event | Fires | Not |
| --- | --- | --- |
| `start` | once per new frame, before entry selection | on a retry, a resume or a Route |
| `before` | before each attempt of a node, retries included, before the readiness gate | inside a handler body |
| `retry` | after Core has decided another attempt is permitted (C6 step 5), before the wait | to decide whether to retry |
| `fail` | when the node's retries are spent or the failure is not retryable | when an earlier rung resolved it |
| `before_next` | after verified success (expected-transition check passed), before the edge is chosen | on a skipped optional step |

Handlers are evaluated only at these boundaries (and inside an explicitly interruptible wait); never on page
mutations, never concurrently with an attempt. One execution owner per browser resource.

## C4. Handler registration

**Storage.** A registration is a node `builtin.control.handler` (new) whose `body` port leads to ordinary nodes ending
at `builtin.control.handler-end` (new). Parameters: `event` (C3), `scope = { kind: "automation" | "subflow" |
"nodes", nodeIds?, inherit?: boolean }` (`inherit` default true for subflow scope: applies to active descendant
frames), `when: FactCondition[]`, `order: number`, `completionCheck: FactCondition[]` (evidence the recovery worked;
required for `before` and `retry` handlers), `maxRuns?` (default 1 per occurrence). `handler-end` parameters:
`disposition` and its arguments (C5). Node-scoped and subflow-scoped registrations live in the owning Subflow graph;
automation-scoped ones live in the automation's `recovery`-role Subflow graph (the existing role, created on demand,
never a Router target). Everything is versioned with its graph.

**One representation.** The authored `failed` edge and the optional way-on are already node-scoped On Fail Routes;
the dispatcher reads them as such (budget-free way-on unchanged). The `clear_interference` rung becomes an implicit
automation-scope `retry` registration for each `metadata.clearsInterference` node, with `when` = that node's
`readyState`: same behaviour, one mechanism. Editor "hook ports" (downstream B7) are a view of node-scoped
registrations, never a second stored form.

**Validation** (`AS/model/validation/flow.ts`, web `graph-validation.ts`): a node reachable from a registration's
`body` is not "unreachable"; any other node without an incoming route still is. Refused: unknown event; scope naming
a node outside the graph; `automation` scope outside the recovery Subflow; a body without `handler-end`; a body
containing a `handler` node; a Route to an unknown checkpoint; a `resolve` whose outputs do not cover the node's
required outputs; a `before`/`retry` handler without `completionCheck`.

**Resolution.** Candidates come only from the active frame stack: node scope (exact node; a Call Subflow node's
scope does not extend into its child) -> the current frame's subflow -> ancestor frames' subflows (if `inherit`) ->
automation. Within a level, ascending `order`, then document order. No confidence, no match-count ranking. All
`when` conditions are evaluated in one batched observation (downstream B1); `unknown` is not `true`.

## C5. Continuation and dispositions

Before a handler body runs, the dispatcher saves `{ framePath, nodeId, phase, attemptNumber, inputs, outputsSoFar,
lastingActStatus, incidentId }`. The body runs in a handler frame: ordinary nodes, Call Subflow allowed, no ambient
handler dispatch inside it (no nesting); a failure inside the body returns `unhandled` to the dispatcher.

| Disposition | `before` / `retry` | `before_next` | `fail` |
| --- | --- | --- | --- |
| `resume` | continue the saved attempt (the permitted retry) | continue to the edge; the action is not re-run | refused at validation: no success continuation exists |
| `route(checkpointId)` | move to a checkpoint in the current or an ancestor frame after its `when` and `requires` hold | same | same |
| `resolve(outputs)` | refused | refused | outputs validated against the failed node's (or frame's) output contract, then the success edge |
| `unhandled` | continue the ladder | continue | continue the ladder at the next level |

After any body that changed the page, the facts the continuation needs (the node's `readyState`, the checkpoint's
`when`, the `completionCheck`) are re-observed before resuming. A `completionCheck` that is not `true` makes the run
`unhandled` regardless of the disposition written, and every `unhandled` keeps where it came from as a closed code on
the attempt's lifecycle record (`written_unhandled`, `body_failed`, `completion_check_not_true`,
`disposition_not_allowed`, `resolve_missing_outputs`, `route_refused` with the refusing guard, `budget_spent`,
`already_tried`, `no_body`, `core_stop`). Pause, cancel, permissions and `Outcome uncertain` stops remain Core outcomes
that no handler can override. The goal is that a completed act is never repeated, not that the run never goes back
(t411): the run keeps a ledger of completed lasting acts, keyed by node and the act's identity (the list loop's row
when the node runs per row, otherwise its resolved target and inputs), and a lasting act the ledger holds is skipped as
`already_done` ("Already done for <row>"), never dispatched; a route that leaves a list loop restarts it, so the rows
already done are skipped and the rest are done. A Route may therefore go back past completed acts, and is refused only
past a node whose lasting act is `uncertain`, on the way forward or on the way back, or past a completed act the ledger
does not hold (a run resumed from a saved trace starts with an empty ledger, so nothing would skip it).

## C6. The integrated recovery ladder

Rung 0 stays in the browser (actionability retries and the allow-listed interference clearing). Core order:

1. **Before attempt.** Pace hold and run-control checkpoint (unchanged); On Before dispatch (C4), at most one handler
   at a time, re-observing between them, each occurrence at most once; then the readiness gate (unchanged).
2. **Attempt.**
3. **Satisfied.** `skip_satisfied_node` (unchanged; t388 marks the attempt done) -> `before_next`.
4. **Uncertain lasting act.** Reconcile through the effect check (downstream B3): `landed` -> `before_next`;
   `not_landed` -> treat as unacted; `unknown` -> stop `Outcome uncertain` (no rung below runs).
5. **Retry permitted** (policy floor, retryability, wait budget; Core decides): declared optional way-on first if the
   step could not run (unchanged); else On Retry dispatch (includes the folded clear_interference); if no retry
   handler matched and the step could not run, **safe state routing** (below); else await_recorded_state, then retry.
6. **Retries spent or not retryable.** On Fail dispatch: node scope (authored `failed` edge included), current frame,
   ancestors, automation. A known alternative is an On Fail handler whose body calls an alternative Subflow and ends
   `resolve`; it must satisfy the same outputs and success check. Then Route to a checkpoint if a handler chose one.
7. **Frame boundary.** A child frame's unresolved failure becomes the failure of its Call Subflow node in the parent,
   carrying the same incident; handlers already tried for that incident are not re-run at the parent.
8. **In-run model repair, at the failing step** (adapting runs; reached only on a **true failure**, defined below;
   user direction 2026-10-09: "call model to analyze situation and fix the flow at the step it fails at
   rather than having to do it detached from the live runtime"). The executor does not return: it holds the run in
   place (frames, variables, loop positions, pace, defence ledger and the continuation stay in memory; the chat shows
   "Fixing a step") and calls a `repairIncident` callback the run session supplies. The callback runs today's
   diagnosis -> patch request with the incident's smallest unit as its target (the failing node, the handler that
   failed, or the part whose contract it broke), that unit's contract, the live page evidence, the recoveries already
   tried and the acts already completed. Patch kinds: today's target override, wait-retry, reroute and
   recovery-subflow call, plus `add_handler` (a scoped handler for the interruption met, C4) and `replace_unit` (one
   part or handler, C12). The fix is overlaid on this run's in-memory Flow and the unit is re-attempted from the saved
   continuation: that attempt is the fix's trial. If it holds (the node's expected state, the handler's completion
   check or the part's success check is `true`), the run simply continues, at the same loop pass and row. If not, the
   overlay is dropped and the incident moves to step 9. One in-run repair per incident by default (C7), under the
   run's cost ceiling, never past an uncertain act. The fix is saved to the Flow only after the run's judged end
   (existing judged-promotion gate). Today's detached path (end the step loop, trial on a cloned Flow, restart a new
   step loop from `resumeFrom` rebuilt from receipts, `adaptive-retry.ts`) loses loop and variable state; it stays
   only for runs that cannot hold in place, and the architecture document's "a model is only ever called after the
   run" (`automation-studio.md` ~895-898) is rewritten when R4b lands.
9. **Unresolved.** Only when the in-run repair fails, or the evidence shows the problem crosses the unit, does the run
   end failed with its incident record: post-run re-author (today's whole-graph path, narrowed to the unit when it
   can be) or the person. The approved-patch and reroute rungs keep their current recorded-only behaviour.

**What counts as a true failure** (user, 2026-10-09: "redefine what is considered truly FAILING rather than just a
retry or planned fail. EG if there is no edge from the on fail to some other node, THEN it calls model"). A node's
failure is a **true failure**, and only then reaches step 8, when all of these hold:
- its retries are spent or the failure is not retryable (step 5 is over), and no earlier rung (satisfied, effect
  check, declared way-on, On Retry, safe state routing) moved the run on;
- no On Fail path applies at any scope: no authored `failed` edge or `error.<id>` port leading to another node, and no
  On Fail handler at node, frame, ancestor or automation scope whose `when` is `true`;
- or every On Fail handler that ran ended `unhandled`, failed inside its body, or left its `completionCheck` not
  `true`, and no known alternative or checkpoint Route resolved the incident.

Not failures, and never a model call: an attempt a retry superseded (t375 marks it `retried`); a `failed` edge or
On Fail handler that took the run to another node (a **planned fail**), including one that leads to an End with
`resultStatus: failed` or another deliberate stop, which ends the run with its authored reason; a skipped optional
step; a state route. Traces, the chat and the measures count retries, planned fails and true failures separately,
and the chat never words a planned fail as a failure. An uncertain lasting act (step 4 `unknown`) is neither: it
stops as `Outcome uncertain`, which no repair overrides. A true failure in a child frame that its Call Subflow node's
own On Fail paths then handle is a planned fail of the parent. A fix written for a true failure may be exactly the
missing On Fail path (`add_handler`, or an authored `failed` edge in a `replace_unit`), so the next occurrence is
planned and costs no model call.

**Safe state routing** keeps the user's rule (a step that is not available routes by page state, globally, before
any model) with four guards: the target is in the active frame's graph; when the frame declares checkpoints, only
checkpoints whose `when` facts are `true` qualify, otherwise signature candidates must also pass the target's
`readyState` facts (not closeness alone); a forward route is refused when a skipped node produces a value that a node
on the route's path reads and that value is unbound (the `continuation.ts:157-169` check moves into the routing
decision); a backward route is refused across a completed `reconcile`/`never` act unless its effect check says
`not_landed`. The progress guard (3 returns) is unchanged.

## C7. Recovery incident and shared budget

An incident opens at the first failed attempt that reaches step 5 and closes when the run passes the node or ends; it
is marked `true_failure` at the moment C6's definition is met, which is the only trigger for step 8:
`{ incidentId, origin: { framePath, nodeId, failureCode }, handlersRun: occurrenceKey[], routes, alternatives,
startedAt }`. Occurrence key = handler id + node arrival + digest of the condition evidence; the same handler never
runs twice for the same occurrence. One run-level budget, carried across frames and never reset by entering or
leaving a Subflow: handler runs per incident (default 3), handler runs per run (default 12), Routes per run (the
existing `maxReroutesPerRun`, 2), alternatives per incident (the existing `maxRecoveryAttemptsPerSubflow`, 2), and
handler body steps count against `maxSteps`. The budget never lowers a node below four attempts and never counts the
optional way-on. Defaults live in the existing policy owner (`model/flows.ts` recovery budget), one named constant each.

## C8. Action outcome categories (domain-neutral)

Keep the existing vocabulary (`defensive/contracts.ts`: effect `unacted | ambiguous`, `actUncertain`; lasting act;
`RepeatIsSafe`). Add only: an effect check result `landed | not_landed | unknown` usable on every path (the
outside-graph `checkEffect` shape, `outside-graph/retries.ts:64-112`, becomes the one hook; exploration and replay
callers pass one, downstream B3), and the rule that a missing acknowledgement is `unknown`, never `not_landed`.

## C9. Fact conditions

`FactCondition = { fact: string, op: "exists" | "absent" | "visible" | "enabled" | "equals" | "contains" | "matches"
| "count", value?: literal | { input: string } | { value: string }, target?: <durable target> }`. Core treats `fact`
as a host path or check kind it does not interpret, evaluates through a host capability (`fact-evaluation`, a batched
extension of today's `expectation-evaluation`), and receives `true | false | unknown` plus an evidence reference and
`capturedAt` per condition. Facts are never model claims or Flow variables: a model setting `loggedIn = true` proves
nothing. `unknown` never satisfies a guard; it does not equal `false` either (a `when` with an `unknown` part does not
run its handler, and an entry with one is not eligible).

## C10. Requirement gate

A Flow (and each Subflow graph) declares `metadata.requires: string[]` of semantic and host capability ids (for
example `flow.handlers@1`, `web.facts@1`). Core refuses a run before any step when the executor or the connected
client session lacks one, with a plain reason naming it. The client hello's protocol version is compared to
`CLIENT_GATEWAY_PROTOCOL_VERSION`; a major mismatch refuses the session. Flows without the new fields declare nothing
and run under today's semantics.

## C11. Traces and activity

Attempt trace: `framePath`; `lifecycle = { event, handlerId, occurrence, conditionEvidence, disposition,
completionCheck }`; `entry = { kind, id, evidence }` on a frame's first attempt; `stateRouting` gains the guard that
refused or allowed. Runtime stream kind `handler_execution` (beside `recovery_attempt`). Live activity: a `step` row
carries `recovery = { kind: "handler" | "entry" | "route" | "alternative", subject, outcome }` so the extension can
render a card without parsing Core's sentence. The trace explains what ran from runtime events, never from a model.
Contract changes stay synchronised with `packages/contracts/src/client-gateway.ts`, the extension's protocol and docs.

**Note (t392, decided 2026-10-09, confirmed by the supervisor).** The attempt's `failureClass` (`true_failure`,
`planned_fail`, `retry`, `skip`, `state_route`, `uncertain`) is stamped only when a Handler is in scope, so a Flow with
no Handlers keeps a trace identical to before. Incidents are opened and marked true failure in every run, which keeps
the in-run repair trigger universal, and the run summary counts `retries`, `plannedFails`, `trueFailures` (repaired
ones included) and `repairedInRun` for every run from the root trace's incident records, never from the attempt stamp.
The recovery kinds gained `interference` (a layer the extension cleared, t401). Attempts also carry `effectCheck`,
`clearedLayers` and `repair`; the root trace carries `handlerExecutions`, `lifecycleNotes`, incident records and
`repairs`.

## C12. Authoring and unit repair

**Candidate script additions** (`flow-bootstrap/plan/flow-script-format.ts`, `authoring/parse.ts`, `assemble.ts`):
- A block without `when:` that some step calls with `call: <block label>` is a callable part (today refused as
  `subflow_unreachable`); `run subflow` is replaced by `call:`. `input: <name>` and `output: <name> = <binding>` lines
  declare its interface; `$step` stays local to its block; outputs cross only through `output:`.
- `start at: <step label>` + `when:` lines declare an alternative entry; `checkpoint: yes` marks a step.
- `on <before|retry|fail|start|next> [for <step labels> | for this part | everywhere]: <situation>` + `when:` lines
  + steps + `then: carry on | go to <checkpoint step> | use <output bindings> | give up` + `end` declares a handler.
- Predictable interruptions stay inline (`optional:`/`only after:`); interruptions that can appear at several places,
  including at any pass of a loop (lane D's rate-limit notice), become `on retry` or `on before` handlers. The t378
  pace rules stay.
- Three short worked examples (state-aware entry, interruption handler, verified alternative) on kinds of sites that
  no realistic Lab scenario uses; the existing guard test (`flow-bootstrap/plan/tests/flow-script-format.test.ts:356`)
  covers them.
- Discovery stays evidence only (`authoring-loop.ts:37,49`); a handler is written only for an interruption observed
  in discovery or a trial, or one the instruction asks for, never speculatively.

**Unit repair, in the run first.** A repair names one unit (a node, a handler or a part) and Core refuses any change
to another unit's compiled graph (digest comparison). In the run (C6 step 8) the run is held at the failing step, the
fixed unit is re-attempted there on the live page, and the run carries on from its continuation; saving waits for the
run's judged end. After a run (C6 step 9) the same unit-scoped submission is tried from the unit's entry after a replay from
the Flow's start to its Call Subflow node (allowed in the repair phase), then judged as a whole run; the re-author
route uses this instead of the whole-graph extend build when the incident names a unit. A learned handler keeps its
declared scope; widening it is a separate repair with its own judged run and review record.

---

## Implementation units (Core files)

Briefs are written downstream before dispatch; one owner for the contracts and the dispatcher.

| Unit | Contracts | Core files (owned) |
| --- | --- | --- |
| R1-core-types | C1-C5, C7, C9 types | new `AS/runtime/executor/frames/**`, `AS/runtime/executor/lifecycle/**` (types, scope resolver, dispatcher decision, continuation, incident budget: pure functions with a fake host in tests) |
| R1-call-subflow | C1 | `AS/nodes/control-flow/call-subflow.ts`, `AS/runtime/composite-execution/**`, Subflow mapping wiring in `AS/runtime/service.ts` (wiring only) and a module beside it; remove `AS/nodes/routine/subroutine.ts` |
| R1-validation | C4 validation, C2 metadata | `AS/model/validation/flow.ts`, `AS/nodes/control-flow/handler.ts`, `handler-end.ts`, `apps/web/src/features/automation-studio/flow-editor/graph-validation.ts` |
| R1-gate | C10 | `AS/runtime/service/runtime-session/graph-options.ts`, client-gateway inbound version check, `packages/contracts/src/client-gateway.ts` (capability ids) |
| R2-wiring | C3, C5, C6 steps 1-6 | `AS/runtime/executor/graph-run.ts` (wiring only), `ladder-run.ts`, `recovery-ladder.ts` (clear_interference folded) |
| R2-trace | C11 | `AS/runtime/executor/contracts.ts`, `AS/runtime/activity/**`, `storage/project/runtime-stream-store.ts`, `packages/contracts/src/client-gateway.ts` |
| R3-entries | C2 entries/checkpoints/success check | `AS/runtime/executor/start-node.ts`, `lifecycle/entry-selection.ts` (new) |
| R3-routing | C6 safe state routing | `AS/runtime/executor/state-routing/**`, `defensive/continuation.ts` |
| R4a-script | C12 grammar | `flow-bootstrap/plan/flow-script-format.ts`, `authoring/parse.ts`, `assemble.ts`, `script-statements/**`, `candidate/submission*.ts`, `service/candidate-trial/feedback.ts` |
| R4b-in-run-repair | C6 step 8, C12 in the run | `executor/lifecycle/` (the hold-in-place rung and the overlay), `graph-run.ts` (wiring the `repairIncident` callback), `llm/harness/runtime-patch-schema.ts` (add_handler, replace_unit), `live-patch.ts` and `live-patch/**`, `recovery/annotation/**` (unit and incident in the request), the run-session module that supplies the callback beside `service.ts`, `docs/architecture/automation-studio.md` (model placement) |
| R4c-post-run-unit-repair | C6 step 9, C12 after the run | `recovery/refuted-result/**`, `service/runtime-adaptation/reauthor-build.ts`, `judged-reauthor.ts` |
| R5-sweep | C8, persistence | startup sweep of `running` sessions (mark `interrupted`, last lasting act `unknown`), effect-check hook on every path |

## Work Ledger

### 2026-10-09 - Plan written from the consultant's proposal and four code maps
- Agent: senior supervisor agent (Claude)
- Changed: this document (new); paired downstream document (new)
- Why: the user asked for a plan from the consultant's state-aware subflow, handler and recovery proposal, adjusted to the code
- Validation: documents only, no code changed: `node scripts/structure-audit.mjs --rule working-docs --rule docs-links` -> "structure-audit: passed (0 warning(s), 16 baselined)"; `node scripts/docs-reference.mjs --check` -> "Deterministic framework reference is current". Evidence: read-only code maps of the executor, Flow model, authoring/repair and editor/traces, and a docs survey, all against Core `dcaf8f9f`
- Outcome: Accepted
- Follow-up: R1 briefs downstream; dispatch when the user approves the plan

### 2026-10-09 - Model repair moved into the live run; true failure defined
- Agent: senior supervisor agent (Claude)
- Changed: this document (Current State, C6 steps 8-9 and "What counts as a true failure", C7, C12, units table)
- Why: the user said repair is meant to fix things on the fly, at the step that fails, not detached from the live runtime, and that only a true failure (no On Fail path to another node) calls the model
- Validation: documents only: `node scripts/structure-audit.mjs --rule working-docs --rule docs-links` (result in the downstream ledger entry of the same title)
- Outcome: Accepted
- Follow-up: R4b (in-run repair) joins the MVP cut; the architecture document's model-placement sentence is rewritten when R4b lands

### 2026-10-09 - t392 executor integration (waves 2-3), uncommitted
- Agent: t392 lane lead (Claude), through workers
- Changed: Core executor (frames, Call Subflow, step-loop seams, lifecycle-run, entries, checkpoints, success check,
  effect check, in-run repair hold), composite boundary, contracts (trace, `detail.recovery`, `interrupted`), run
  session (subflow frames, in-run repair supplier through the after-run pipeline, held-repair verification, orphan
  sweep, late results), durable `add_handler` / `replace_unit` applier, summaries (failure counts), architecture docs;
  downstream extension activity reader and `gateway-session.ts`
- Why: the user's direction that repair happens at the failing step, plus waves 2-3 of this plan
- Validation: see the lane report's ledger (the final tsc, audit and narrow-vitest results are quoted there)
- Outcome: Accepted by the lead; awaiting supervisor integration
- Follow-up: live validation on the ten realistic scenarios; the decisions listed in the lane report

## Open Questions

- Supervisor: whether automation-scope handlers should also be allowed in the primary Subflow when an automation has
  no recovery Subflow yet (decided no for R1: created on demand; revisit if the editor finds it confusing).
- Supervisor, at R3: whether `fluxiq.successCheck` should default to the End node's `expectedState` when absent.
  Decided no in t392 (D2): absent means no check and no fact call.
- Supervisor, post-MVP: resuming a frame stack after a Core process restart (today an orphaned run is only swept to
  `interrupted`); depends on `mvp-final-month-plan.md`'s rule that same-process consumption is not restart clearance.
