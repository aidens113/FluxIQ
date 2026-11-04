# Flow run stage (t870): worker report

## Outcome

Done. `AF/flow-run/` assembles the saved steps and runs them on the real engine with no model, through the run gate with `settle: true` and into the row sink. It returns what each step did. One limit needs a change outside my paths: a permission question on this path cannot name its control (see "Open questions").

`AF/` = `packages/fluxiq/src/framework/automation-service/service/answer-first`. `S/` = `packages/fluxiq/src`.

## What changed and why

- `AF/flow-run/`:
  - `flow-run.ts`: the stage.
  - `assemble.ts`: the same check `draft-save.ts` uses.
  - `permission.ts`: permission once, before the run.
  - `dispatch-watch.ts`: what really went out. A deadline's trace holds no attempts.
  - `steps-ran.ts`: attempt to draft step.
  - `engine-of.ts`, `ports.ts`, `outcome.ts`, and the barrel.
  - Tests: `flow-run.test.ts`, `row-shape.test.ts`, `steps-ran.test.ts`.
- `AF/rows/`:
  - `recordBatch` and `runRowsRefused` on the sink.
  - The join and the "not with less" rule (`row-sink.ts`, `result-dataset.ts`).
  - `readBack` dedupes while unprocessed.
  - Test: `tests/run-batches.test.ts`.
- `AF/tests/fake-library-engine.ts`: real node implementations that change the library and count presses, a real record output, an output door like a web step's, and `flowRunFixture`.

## Exact exports and ports

From `AF/flow-run/index.ts`. I did not touch `AF/index.ts`, so the driver imports the barrel directly.

```ts
automationStudioAnswerFirstFlowRun(ports: AutomationStudioAnswerFirstFlowRunPorts, saved: { steps; stepsDigest }): Promise<AutomationStudioAnswerFirstFlowRunOutcome>
automationStudioAnswerFirstFlowRunEngineOf(input: Pick<AttemptInput, "owner"|"projectId"|"flowId"|"instructionIds"|"startLocation"|"registry"|"resolution">): AutomationStudioAnswerFirstFlowRunEngine
automationStudioAnswerFirstFlowRunAssemble(ports: Pick<Ports, "input">, steps)   // for the route's `assemble`
// types: ...FlowRunOutcome, ...FlowRunStep, ...FlowRunEngine, ...FlowRunPorts, ...FlowRunAssembly

type Ports = {
  input: Pick<AttemptInput, "projectId"|"flowId"|"registry"|"resolution"|"binding"|"instructionText"|"instructionIds"|"startLocation">
    & { size?; routing: Pick<..., "signaturesOf">; cancellation: Pick<..., "signal"> };
  runId: string; record: AutomationStudioAttemptActRecord;
  sink: Pick<RowSink, "recordBatch">; permissions: Pick<ActionPermissions, "planStep">;
  stepped(): void; arrived(): void;
  engine(): Engine;   // called inside the run's own care: a throw is a run that could not start
};
type Engine = { parentFlow(); currentBaseDigest(); snapshots(); deprecatedPublicationIds(); graphOptions({runId, signal}); domainReadings?; definitions?() };
```

The outcome type is the design's. Its `steps` item is exported as `AutomationStudioAnswerFirstFlowRunStep`.

Rows, from `AF/rows/`:
- `sink.recordBatch(batch)` throws if the store fails. The engine reads that as `record_output.persist_failed` on the step, so rows are never dropped silently.
- `sink.runRowsRefused()`.
- `automationStudioAnswerFirstResultDataset(order, ran?)`.

## What I traced

**Start.**
- A trial has no navigation of its own. Its only start is a deployment's hook that puts the site back (`candidate-trial/run.ts:151,:319,:328`). With no hook it runs on the target as it stands. `startLocation` only enters a digest (`run.ts:176`).
- The stage calls no hook, and a test proves `prepareCandidateStart` is never called.
- Getting to the start is the Flow's own first step. The assembly puts a withdrawn arrival step back at the front (`bootstrap-completion.ts:376-379`, `reachability/start-step.ts:70-80`).
- A Flow with no arrival step is only a note, never a refusal (`bootstrap-completion.ts:496-500`). It fails at its first step that needs the page, which is an ordinary failing step.
- A saved Flow's first step therefore already navigates. I state this rather than add anything.
- `arrived()` fires only if a call really went out. This is narrower than the design's "true after it": a run refused before its first step leaves the first round going to the start location.

**Permission.**
- An engine run reaches no gate.
  - `permittedConsequences` is no executor option (`graph-options.ts:12-17`).
  - `authorizedDomainIds` only decides which domain Flows a global Flow may call (`composite-execution/owner.ts:25-27`, `composites.ts:142-145`).
  - So the gate is `planStep` (`action-permissions.ts:469-475`), called before the run.
- The assembly hands the domain a check that grants and records each declaration, so nobody is asked about a Flow that then cannot assemble. A test proves this.
- Then each declaration goes to `planStep` in plan order. A step whose domain declared nothing still has `node.consequences`, and those are asked too.
- `parking` is removed from the options, so a step that raises a question ends the run as `waiting` and asks nobody. Tested.
- `planStep` aborts `permissions.signal` on a refusal. Nothing in the attempt reads that signal, or `request()`, or `endedOnRequest`. In `attempt/*.ts` only `executeTool` and `instructedLastingActs` are used (`round.ts:49,:90`). If the driver starts reading them, a decline would end the round.

**Step mapping.**
- `metadata.bootstrapSymbolicKey` carries the plan key (`adaptation.ts:241`).
- `verdict.locator.nodes["S.M"]` gives the draft step and id (`assemble-draft.ts:240-250`, `bootstrap-completion.ts:542`).
- A step is reported by its id's position in the saved draft, because the assembly renumbers a restored arrival step. Tested.
- Attempts fold through `automationStudioTrialExecutedSteps`, so a retry is one step and repeat passes are the same step.
- `failing` comes from `automationStudioUnresolvedFailedAttempt`. If there is none, it falls back to the trace's current node, then the last step sent, then the first not reached.
- `happened` is only ever a Core sentence. A failure's message, its expected/actual and a trace's message are never passed on. A test confirms page text stays out.

**Row merging rule.**
- A read joins the latest dataset a run wrote when its columns include every field of that dataset and every row fits its schema. It is stored under that dataset, with its schema, label and `process`. The store throws if either schema or processing changes within a run (`run-dataset-store.ts:184-185`).
- A read that does not join is something else. It becomes the result only with at least as many rows as the run's dataset.
- `readBack` dedupes whole rows until the dataset is processed. Before this change it would have shown duplicates to the judge, since the store counts rows as collected.
- Tested on stubs and on the real store: 3+2=5; the same rows again = 3; a shorter other read does not replace.
- Added beyond the brief: `runRowsRefused()`. Without it, a run that found the wrong 30-row list would outrank the right 5-row read forever, and no check could ever pass.
- A join can take in another list with the same columns. That errs towards rows a judge can read and refuse.

## Row shape (the lead's risk)

The shapes meet.

The engine's For Each hands `{title, due}` after the record output. By hand, the read holds `{title, due, shelfmark, $handle}`. Seeded through the real act gate (a read, then a press), the engine run presses only the other rows, once each, for all of these:
- by-hand row in hand
- row known only from the answer's `actedOn` sentence
- a record output keeping only `title`
- the output door a web step uses

A run of the same Flow again on the same record presses nothing, and its press step reads `skipped`. Without a seed each row presses once, and the act is held `landed` at `stage: "run"`.

One honest limit: the act must be the same node. A by-hand press through a different node id is a different act by the record's rule (`record.ts`, `matches`). My first output-door test seeded the wrong node and did press twice, which also shows these tests detect a repeat.

## Limits verified

| Limit | How | Reads as |
| --- | --- | --- |
| Step bound | Really trips, with `maxSteps: 3` on a straight line. A repeat cannot trip it small: each pass raises it (`graph-run.ts:266`). | `reachedEnd: false`, failing step, later steps `not_reached` |
| Run deadline | Really trips, with the parent's `executionDefaults.timeoutMs` and a hanging step. The trace has no attempts, so `dispatch-watch` keeps step 1 `passed`, fails step 2, and the press stays `may_have_landed`. | same |
| Child Flow deadline | Really trips on the engine, but as a real `runCanonical` trace fed to the mapper. No draft step can make a Call Flow node, because its target rides on metadata (`flows/executable/composite/configuration.ts:8`). The whole path cannot reach it today. | failing at the calling step |
| Stop | Mid-run abort and thrown `AbortError` | `stopped` |
| Recovery/exploration 10 min, result check deadline | Not reached: the runner refuses any model, and the fixture has no provider resolver at all | n/a |

Codes that read as `reachedEnd: false` with a failing step at the first step and a plain cause:
- From the runner:
  - `candidate.execution_identity_mismatch`
  - `candidate.invalid_execution_start`
  - `candidate.partial_execution_unsupported`
  - `candidate.foreign_invocation_unsupported`
  - `candidate.conflicting_execution_signal`
  - `candidate.from_node_*`
  - `candidate.execution_stale`
  - `candidate.execution_plan_invalid`
  - `candidate.execution_plan_rewritten`
  - `candidate.routing_state_unavailable`
  - `candidate.execution_no_route`
  - `candidate.execution_graph_not_owned`
  - `candidate.execution_error`
- Mine: `answer_first.flow_run_threw`, for anything else thrown.

Only `candidate.execution_stale` is exercised by a test, plus `answer_first.flow_run_threw`. The rest share the same path. `candidate.execution_incomplete` is the code on a run that ran and stopped.

## Commands run and observed results

- `pnpm.cmd exec vitest run .../answer-first/flow-run .../answer-first/rows --minWorkers 1 --maxWorkers 2` from `packages/fluxiq` -> `Test Files 7 passed (7)`, `Tests 60 passed (60)`, exit 0, Duration 109.74s.
- `pnpm.cmd --filter fluxiq check` from the worktree root -> exit 0, no `error TS` lines.
- `node scripts/structure-audit.mjs` from the worktree root -> `structure-audit: passed (498 warning(s), 1097 baselined).`
- No whole-package run. No model, Lab, browser or real site.

## What the driver must add

```ts
await automationStudioAnswerFirstFlowRun({
  input: run.input, runId: run.runId, record: run.record, sink: run.sink, permissions: run.permissions,
  stepped: () => { run.liveSteps += 1; }, arrived: () => { run.arrived = true; },
  engine: () => automationStudioAnswerFirstFlowRunEngineOf(run.input)
}, { steps: saved.steps, stepsDigest: saved.stepsDigest });
```

- Seed `run.steps` from the saved steps. Keep the row (`automationStudioAnswerFirstKeep`) after the outcome.
- Call `run.sink.runRowsRefused()` when the Flow-less judge says no to rows the run wrote.
- `permission_declined`: go to rounds. The gate remembers the no for that control.
- Carry-on's row copy should go through `sink.recordBatch`, so a later read joins them.
- Expect one model call on a `run_flow` path whose plan declares anything lasting. The gate makes the attempt's one instruction read when an action first declares something lasting (`gate.ts`, `instructedFor`). It happens before the run, not during it, and is counted under `authority`. "Zero exploration calls" still holds, but a test asserting zero non-judge calls will not.

## Not verified

- The real web domain's `resolvePlanNodeParameters` on steps saved by an earlier attempt. `ranWith` holds resolved parameters, but an amended `settings` value naming a handle would refuse. That reads as `not_assembled` and routes to repair. Provider-free and no browser here, so unproven.
- Real target retries and the stale-target re-find on this path. They come from the runner's default policy (trial parity, not retested). The fake's failure is `retryable: false`.
- A step excused at the output door by a Core `builtin.policy.action` node reads `passed`, not `skipped`. That door names no node. The press is still not sent.
- In a loop, the last pass decides `ran`: a pass that failed and took an authored route, with a later pass succeeding, reads `passed`.
- I did not mutate `readBack` to prove its new test fails without the change. I reasoned from the store's `recordCount` (the existing real-store test shows 4 collected for 3 rows).

## Open questions or contradictions found

1. **The question cannot name its control (change needed outside my paths).**
   - The gate carries a control's name only if this attempt has shown it in evidence (`gate.ts`, `carriedName`). A `run_flow` attempt asks before showing anything, so the person reads "a control it cannot name here" (`action-permissions/request.ts:109`, pinned by a test).
   - `gate.ts` itself records a person being right to refuse an unnamed control.
   - Change wanted in `S/runtime/flow-authoring/bootstrap/action-permissions.ts`: expose `observe` (or take saved steps' screened `words`) on `automationStudioFlowBootstrapActionPermissions`, so the attempt can show the gate the saved steps' words first. I did not make it, and I did not read further for how it should be screened.
2. **Design note.** The design says `run.arrived` is true after the stage. I made it true only if a call went out (above). If you want it unconditional, it is one line in `flow-run.ts`, `outcome`.
3. The brief's step 5 wants a test with a child Flow's bound really tripping. I could only do that on a real trace fed to the mapper, as the table says, because a draft cannot make a Call Flow node.
