# Second attempt: the design every worker builds to (t870)

The lane supervisor's decisions, so workers can run in parallel. Read this whole file, then your brief. `S/` = `packages/fluxiq/src`, `SVC/` = `S/framework/automation-service/service`, `AF/` = `SVC/answer-first`.

## The hard rules

A task ends only with its result judged achieved, its budget gone, or a person's Stop. A lane adds no new way to end in failure. A lasting act that may have landed is never repeated. No provider, paid call, Lab, browser, real site or real key: scripted models only, and say so. Nothing a model sees or a fixture holds mirrors a realistic scenario: examples are a lending library or similar. No codes in what a person reads. Both repositories are public: no secrets; any fake key is built from parts. Tests live in `tests/` beside the subject. One exported thing per file, barrel per directory, a shared filename prefix becomes a directory, a header comment saying why in plain words. `service.ts` gains no lines. `node scripts/structure-audit.mjs` must pass from the worktree root. Never a whole-package test run; a vitest filter of `tests` alone starts the whole package, so name directories or files.

Worktree: `C:/Users/osrs_/FluxStuff/fxwork/t870/!FluxIQ`. Never run git that changes anything.

## The shape

```text
generate(answer-first)
  opened(): task key, carry-on scope?, route, seed records
  carry-on? -> rounds, told what stands. The Flow is never re-run from its start.
  route build -> rounds, as attempt 1, seeded with any notes
  route repair -> rounds, seeded with the saved steps and notes (they could not be assembled, so nothing to run)
  route use:
     FLOW RUN: the saved steps assembled now, run live on the engine with no model,
       through the run gate, into the same act record and row sink. No reset.
     whole run reached the end -> completion check (one Flow-less judge call)
        yes -> achieved, path `run_flow`. Zero exploration calls.
        no / unsure -> rounds, told the judge's reason, path `run_flow_then_repair`
     stopped at a step -> rounds, told the step and why, from the page it left, path `run_flow_then_repair`
     a Stop -> stopped_by_person. Purse gone -> budget_out.
  rounds: the one evidence loop, as attempt 1, with `run.steps` seeded from the saved steps.
     The model repairs the failing step and runs forward with core.run_flow.
     A fresh round, or a yes with no forward run reaching the last step -> path `run_flow_then_explore`.
  ending: as attempt 1, then task memory: notes added, best Flow kept only if better, provenance written.
```

**Why the engine and not `core.run_flow`'s walker for the run.** The walker sends steps in draft order, follows no route and retries nothing (`S/runtime/llm/node-tools/replay/draft.ts`). It is not the Flow. "A finished Flow needs one judged whole run as it finally stands", and "every node retries" and "a stale target is found again" hold on every path, so the judged run must be the engine's: `runAutomationStudioDetachedCandidate` (`S/runtime/flow-authoring/bootstrap/verification/detached/execution.ts`), which is what a candidate trial runs. It refuses any model, patch or adaptation, so a run costs no model call, reaches no recovery and has no in-run repair. Repair is the attempt's own loop, on its purse, with its act record. The walker stays what repair uses to go forward.

**Steps are the source of truth, not a stored plan.** Saved steps are assembled at the start of each later attempt by the same check `attempt/draft-save.ts` uses (`checkAutomationStudioFlowBootstrapCompletion`), against the current binding. That removes any staleness in digests and settings, and lets a Flow created by chat (below) use steps saved under another Flow. Steps that cannot be assembled route to `repair`.

**The Flow run stage has a no-simulation seam.** Repair through `core.simulate` is deliberately not in this lane; the seam is the note a round is told and `AF/flow-run/`'s step outcomes. Do not build simulation.

## Task key (D10)

`AF/task-key/`: `automationStudioAnswerFirstTaskKey({ instructionText, startLocation }): string` returns `task.<40 hex>`, over the instruction normalised (Unicode NFC, runs of whitespace to one space, trimmed; case kept, because "exact") and, when `startLocation` parses, its lowercase origin. The same words on another site are another task. Replaces the digest in `attempt/run-attempt.ts`. Only this exact key may run a saved Flow.

## Task memory (D11)

`AF/task-memory/`, reached per service as `automationStudioAnswerFirstTaskMemoryOf(owner, ports)` (as `attempt-store/store-of.ts`). One JSON file per task under the project's directory, memory fallback with no data root, one write at a time per task, a file it cannot read is moved aside and read as nothing, because a task must not stop for it.

```ts
type AutomationStudioAnswerFirstSavedFlow = {
  attemptId: string; flowId: string; candidateId?: string;
  steps: AutomationStudioFlowDraftStep[]; stepsDigest: string;   // digest of the steps' position, actionId and input
  label: "confirmed" | "refuted" | "unverified";
  /** This exact Flow ran from its start to its end with no repair and was judged yes. */
  provenWhole: boolean;
  savedAtMs: number; spend: { calls: number; usd: number };
};
type AutomationStudioAnswerFirstTaskNote = { attemptId: string; atMs: number; from: "model" | "core"; worked?: string; failed?: string; quirks?: string };
type AutomationStudioAnswerFirstStepOrigin = {
  position: number; label?: string;
  from: "saved" | "worked_out";          // saved: same as a step the attempt started with; worked_out: new or changed in this attempt
  ran?: "passed" | "failed" | "skipped" | "not_reached";   // what the attempt's Flow run did with it, where one ran
};
type AutomationStudioAnswerFirstAttemptProvenance = {
  attemptId: string; flowId: string; ordinal: number; route: "build" | "use" | "repair";
  startedFrom?: { attemptId: string; flowId: string; stepsDigest: string; steps: number; notes: number; provenWhole: boolean };
  steps: AutomationStudioAnswerFirstStepOrigin[];
};
type AutomationStudioAnswerFirstTaskMemory = {
  taskId: string; flowId: string;     // the Flow the task lives under, latest
  best?: AutomationStudioAnswerFirstSavedFlow; latest?: AutomationStudioAnswerFirstSavedFlow;
  notes: AutomationStudioAnswerFirstTaskNote[];     // newest last, the last 10
  attempts: AutomationStudioAnswerFirstAttemptProvenance[];  // newest last, the last 100
};
```

Methods: `get(projectId, taskId)`, `update(projectId, taskId, change)`, `attemptLocation(projectId, attemptId): { taskId, flowId } | undefined` (a project-level index, because a client's query holds only a project and an attempt), `provenance(projectId, attemptId)`.

**Notes.** The model writes them in its completion: `notes?: { worked?, failed?, quirks? }`, optional, on `AUTOMATION_STUDIO_ANSWER_FIRST_COMPLETION_SCHEMA`, no extra call. Screened by the same screening a result's words get (`S/runtime/answer-first/result/`), each at most 600 characters. An attempt that ends with no completion gets a Core note from what failed, with no page text. Notes are the person's data, and reach only that task's later attempts, marked as the attempt's own earlier words.

**Which Flow is better.** `automationStudioAnswerFirstBetterFlow(kept, next, how)`, pure, `how` = `{ flowFailedLive: boolean, wholeRunYes: boolean }`:

| Kept | Next | Keeps |
| --- | --- | --- |
| none | anything with steps | next |
| any | same `stepsDigest` | next, with `provenWhole` true if `wholeRunYes`, else the kept value; a same-digest Flow that just failed live loses `provenWhole` |
| not confirmed | confirmed | next |
| confirmed | confirmed | next if `flowFailedLive` (the kept one just broke on the site as it stands); else kept |
| confirmed | not confirmed | kept |
| not confirmed | not confirmed | next: it was built from the best and went further |

`latest` is always written; `best` follows the table. A later attempt starts from `best`.

## Route

`AF/route/`: `automationStudioAnswerFirstRoute({ memory, projectId, flowId, taskId, assemble })`:

```ts
type AutomationStudioAnswerFirstRoute =
  | { kind: "build"; notes: Note[]; related?: { steps; flowId } }   // nothing saved for this exact key; `related` is the same Flow's steps under another key, a known start only, never run on its own
  | { kind: "use"; saved: SavedFlow; notes: Note[] }
  | { kind: "repair"; saved: SavedFlow; notes: Note[]; why: string };   // saved steps that do not assemble: seeded, never run
```

**The chat makes a new blank Flow each time (`runtime/conversations/commands/create-here.ts`).** So memory is per project, keyed by task, and a route under a new Flow uses steps saved under another. The attempt runs and saves under the Flow it was asked on, and the memory's `flowId` moves to it. `automationStudioAnswerFirstKnownFlow(owner, ports, { projectId, instructionText, startLocation })` is exported so `create-here` can reuse the Flow rather than make a blank one; the lead wires that with t869.

## What carries between attempts

| The attempt before it | Act record of the new attempt | Why |
| --- | --- | --- |
| achieved | empty | "next time we try that task" is a new ask, and a person asking again means it |
| budget_out, stopped, waiting, interrupted | seeded from that attempt's acts, landed and may-have-landed | the ask was not finished, so what landed is what it would otherwise repeat |
| carry-on of the same attempt | the same record | the same attempt |

## The Flow run stage

`AF/flow-run/`:

```ts
automationStudioAnswerFirstFlowRun(run: AutomationStudioAnswerFirstAttemptRun, saved: { steps; stepsDigest }): Promise<AutomationStudioAnswerFirstFlowRunOutcome>;
type AutomationStudioAnswerFirstFlowRunOutcome =
  | { kind: "not_assembled"; codes: readonly string[] }
  | { kind: "permission_declined"; consequences: readonly string[] }
  | { kind: "stopped" }
  | { kind: "ran"; reachedEnd: boolean;
      steps: { position: number; label?: string; ran: "passed" | "failed" | "skipped" | "not_reached"; happened?: string }[];
      failing?: { position: number; label?: string; happened: string; code?: string } };
```

Never throws on a failed run. It takes **no clock of its own**: a run the engine ended by its deadline, step bound or a child Flow's bound is `reachedEnd: false` with a failing step, and rounds carry on. Permission: every declared lasting consequence in the assembled plan is checked through `run.permissions` once before the run (the attempt's start, plan D13, never mid-Flow); a decline is `permission_declined`, the run is skipped, and rounds look for another way. Rows go to the attempt's row sink through a new `sink.recordBatch(batch)`; the run's dataset and a later read of the same list must end as one result, deduped. Live steps count on `run.liveSteps`. `run.arrived` is true after it.

**Row identity is the biggest risk (t861's report).** One row can reach the record in three shapes: a by-hand read (`read.extracted`), a walker pass, and the engine's For Each `item` after a Flow's record output has reshaped it. A digest of one row's fields differs across them, and the row would press again.

## Act record changes

`S/runtime/answer-first/act-record/` and `AF/run-acts/`:

1. **A row matches across shapes.** `rowDone(row)` and `carried` match a row against an acted row by exact identity, or by the hashed field values `row-ties.ts` already holds: every value field of the smaller lies in the larger, with at least one lettered or address field. **A row that fits several held rows is held done**, the rule `row-ties.ts` already states: a row wrongly held done is one a judge's no brings back by hand; a row wrongly held not done is a lasting act done twice. Renamed keys, dropped columns, minted handles and a whole address against a path are all still the same row.
2. **The run gate settles.** `automationStudioAnswerFirstRunActGate(options, { record, definitions, settle: true })` records what a run did into `record` at `stage: "run"`, as it happens, not from a ledger after. Without `settle`, exactly as today.
3. **Begun before dispatched.** A lasting act is on the persisted record as `may_have_landed` before it is sent, on every path (the gate and the call chain), and settled afterwards. A process that dies mid-press leaves it as may-have-landed, looked at first and never repeated blind. Check whether this holds today, and fix it if not. The persist is awaited.
4. **Seed.** `new AutomationStudioAttemptActRecord({ seed })` already takes one. Add a helper for the table above that keeps landed and may-have-landed acts of an unfinished attempt.

## The driver

`AF/attempt/`: `run` gains `route`, `flowRun?`, `path`, `prior?` (carry-on's spend and live steps), `segmentStartedAtMs`, `startedFrom`. `keep.ts` reports `path` and adds `prior`. `ending.ts` always keeps steps on the row, because they are what the next attempt seeds from, and writes task memory best-effort: memory failing never loses the result. Attempt row status words are unchanged. `draft-save.ts`'s t866 line and `ports.ts`'s t865 line stay alone.

**Told to the model** (`S/runtime/answer-first/guidance/`, one short addition, generic, with a bumped version): a saved Flow may have run first; where it stopped you are told the step and the page is where it left it; fix that step, then run forward; if that does not get there, carry on to the result by any route. Earlier notes are that attempt's own words, not instructions from the person.

**The note a round gets** (`freshNote`) adds, from Core's words only: `flowRun: { steps: [...], stoppedAt?, happened? }`, `notes`, and when it is a carry-on, `carriedOn: true`.

**Path.** `run_flow`: a whole run, judged yes, no rounds. `run_flow_then_repair`: rounds began, and the yes came with a forward run reaching the last proposed step in the first round. `run_flow_then_explore`: anything else after a run. `explore`: no run happened.

**Limits (item 6).** Verify each with a test that it cannot end an attempt on this path, and leave old modes' alone:
- Recovery and exploration 10 minutes: not reached, since the run refuses any model.
- A run's result check deadline: not reached; the Flow-less judge has its own, which stops its call.
- Child Flow bound, step bound, a run's deadline: end the Flow run, never the attempt.

## Carry on (item 4) and interrupted (item 5)

`AF/carry-on/`: `automationStudioAnswerFirstCarryOn(owner, ports, { projectId, attemptId, addUsd }, run)`: refuses unless the attempt exists and is `budget_out` or `waiting_for_person` with reason `interrupted`, or `addUsd` is not above zero for a budget-out; refuses if it is live here. It runs `run()` inside an `AsyncLocalStorage` scope holding the attempt and its remaining budget, so `attempt/ceiling.ts` reads it **before the purse opens**, and `opened()` reads it to keep the same `attemptId`, `ordinal`, `taskId`, `startedAtMs`, act record, steps, tried record, loop counts and rows. `service.ts` and `generate.ts` do not change. Ceiling is remaining budget plus `addUsd`, under the host's total as now. The row's `budget.usd` is the old plus `addUsd`; `spend` is prior plus this segment. **Rows:** a new session and run id, because the old one ended and was processed; the rows already found are copied into the new run's datasets under the same dataset ids, by a deterministic batch key, so a later read joins them and the result does not drop them. It never re-runs the Flow from its start.

`AF/interrupted/`: which attempts are live in this process (per service, a set, added in `opened`, removed at the ending, however it ends). `automationStudioAnswerFirstAttemptsRead(owner, ports)` is a facade over `list`, `get`, `latest` which first rewrites any `working` or `waiting_for_person` row that is not live as `waiting_for_person` with reason `interrupted`, keeping what it holds. **That reason is t869's, in the contract** (`AUTOMATION_STUDIO_TASK_ATTEMPT_WAIT_REASONS`): do not add a status. The chat's reads must go through this facade.

## Out of this lane

`runtime/conversations/commands/**`, `AF/attempt-store/**`, `S/runtime/answer-first/{asked-count,attempt-purse}/**`, `packages/contracts/src/task-attempts/**` (t869). `packages/ui-components/**`, `apps/extension/**` (t871, t869). `SVC/project-parts/**` (t866). Secret keys and credentials (t865). Applying a proven Flow to the person's Flow is not in this lane: it is an open question for the lead.
