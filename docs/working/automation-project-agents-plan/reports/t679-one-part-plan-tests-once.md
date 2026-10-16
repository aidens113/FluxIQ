# t679 one-part plan tests once: worker report

Worktree: `C:/Users/osrs_/FluxStuff/fxwork/t679/!FluxIQ`, branch `task/t679-one-part-plan-tests-once` (from Core dev
a5195d3f). Nothing committed. Paths below are under `packages/fluxiq/src/programs/automation-studio/runtime/`.

## Outcome

Partial. Design (5) items 1-3, 5, 6 and 7 are implemented, tested, type-checked and pass the structure audit. On a
single-subflow plan the builder's `core.test_subflow` is the judged whole run of the exact assembled revision. It is
recorded as a `candidate_trial` receipt, and the supervisor completes on it in three decisions (write_plan, dispatch,
complete). The end-to-end test shows one builder brief, zero reset briefs, no scoped judge, and one whole-judge pair.

It is Partial because 7 existing tests in 3 files I do not own now fail. They are the one-part cases in
`service/project-build/tests/project-build-{facade,reset,time-limit}.test.ts`, and they encode the old one-part path.
Two of the time-limit failures also show a real gap: the build's proposals store never learns a single-path trial (see
"Open questions"). Both fixes are outside my files and are described below.

## What changed and why

New directory `project-agents/single-subflow/` (barrel `index.ts`). `supervisor/` is at its 25-file limit, and the new
directory is not re-exported from `project-agents/index.ts`, as `amendment/` is not.

- `single-subflow-plan.ts`: `automationStudioProjectSingleSubflowPlan(structure)` (item 1) returns the subflow key
  when the plan has exactly one subflow, with no `interface`, that the router fallback targets and that carries parts.
- `assemble-latest.ts`: `automationStudioProjectAssembleLatest` is the shared assembly (item 2) that `project.assemble`
  and the single-subflow test both call. It reads the proposals, runs `automationStudioProjectAssembly` with the arrival
  node, and calls `controller.submitComposed`. On a single-subflow plan only:
  - When the latest revision was assembled from exactly these proposals, it answers `again` and makes no new revision
    (item 5 guard).
  - When the composed submission is refused `candidate.unchanged_submission` and the standing revision is the one named,
    that standing revision is used.

  Multi-subflow plans assemble and refuse as before.
- `assembled-from.ts`: `AutomationStudioProjectAssembledFrom` is per-controller memory, kept in a WeakMap. It records
  which proposals each whole revision was made from, and keeps every proposal a single-subflow test assembled, so the
  supervisor can read one back. The build's proposals store learns proposals only from the scoped port's `weighed`
  (`service/project-build/subflow-trials.ts`), which this path never asks.
- `single-subflow-trial.ts`: `automationStudioProjectSingleSubflowTrial(input)` (item 2) returns `undefined` unless the
  plan is a single-subflow plan and `gate.available`. Otherwise it returns the dispatch's whole test, which:
  - assembles the proposal under test with the shared function;
  - runs the supervisor's whole test (`supervisor/whole-trial.ts` `test`, passed in) under
    `withAutomationStudioProjectAgent({ role: "supervisor" })` and `automationStudioLlmBuildPurseScope(ports.purse)`;
  - maps the answer to a subflow trial of the proposal: its verdict, `trialRunId`, `entryPrepared: true`, and the
    feedback plus `wholeTest` and `complete` (plus `slowDown` on a rescued pass);
  - maps every whole-gate or assembly refusal to `{ refused }` in a builder's terms, never as a verdict.

  Deviations from the design:
  - It uses a purse **scope** frame, not a run frame. A run frame throws `AutomationStudioLlmBuildPurseRefused`, which
    the builder's gate would read as a failed port (`execution_failed`).
  - Its `acts` are not carried into the result. The whole trial port already records them under the supervisor, and
    carried here the brief's reset `trialRan` would record them a second time in the brief's ledger. `leftOnSite` still
    lists them through the supervisor's ledger.
- `whole-test-port.ts`: `AutomationStudioProjectWholeTestPort` is the port a brief's gate gets (item 3). A trial that
  ran goes through the dispatcher's own `automationStudioProjectDispatchTrialPort` wrapper, so receipts, `remember`,
  `weighed`, standing nos and `spend.trial` still apply. The scoped port's `prepareStart` is kept, and the scoped port
  is never asked or told a verdict.

  A refusal reaches the gate as its one not-a-trial answer, the code `subflow.trial_unaffordable`. That code is the
  contract the scoped trial service also writes, so the gate counts, weighs and records nothing for it. The loop
  observer (`observe`) then replaces the gate's answer with the refusal itself, including `resultReason: retry_allowed`
  for a reset refusal.
- `dispatch/port.ts`: adds `AutomationStudioProjectDispatchWholeTrial`, its answer type, and
  `AutomationStudioProjectDispatchRequest.wholeTrial?`. The answer is richer than a bare `AutomationStudioSubflowTrialPort`
  so that a refusal is not a verdict.
- `dispatch/dispatcher.ts`: passes `request.wholeTrial` to each brief.
- `dispatch/run-brief.ts`: for a build or repair brief given `wholeTrial`, the gate's port is
  `AutomationStudioProjectWholeTestPort`, and its observer wraps the loop. A reset brief returns before this point and
  never gets it. The import is by file because the single-subflow barrel leads back to `run-brief` through
  `supervisor/assembly.ts` → `dispatch/index.ts`.
- `supervisor/assemble-tool.ts`: now calls the shared function. When it answers `again`, the tool answers
  `sameRevision: true` and `latestTest`; when that test was a yes, `next` is `afterAssembleTested`.
- `supervisor/dispatch-tool.ts` (items 3 and 5):
  - It builds the whole test per dispatch with a fresh `AutomationStudioProjectSupervisorWholeTrial({ ports, state })`.
    Its `test` reads only the context's gate, ports and state. The site reset is the one the loop gave the gate, so
    `context.ts` and `supervisor-loop.ts` stay unchanged.
  - It passes `wholeTrial` to `ports.dispatch`.
  - It answers `afterSingleWholeYes` with `complete` when a done return's proposal made the latest assembly and that
    assembly stands yes and `gate.completion` is ok.
  - `changedNothing` reads proposals with the memory fallback.
  - It passes `finishingCalls` when `ports.finishing` is set.
- `supervisor/brief-sizing.ts` (item 6) applies only when the brief is a build or repair of the single subflow, sent
  alone, and `finishingCalls` is given. Such a brief gets `max(evenShare, allocatableUsd - finishingCalls ×
  averageUsd)`, where `averageUsd = (spentUsd − carriedUsd) / spentCalls()`. That is computed from the public purse API
  because `purse.ts` is not mine, and it reads at least the settled average. It also gets every allocatable call, since
  the finishing calls are already kept back from all allowances. With nothing priced, or no finishing kept back, it gets
  today's even share.
- `supervisor/guidance.ts` (item 7):
  - Steps 5 and 6 now say that one subflow needs no assembly, reset or second test: complete on the dispatch answer's
    `complete`.
  - New `next.afterSingleWholeYes` and `next.afterAssembleTested`.
  - `forward.complete` names the dispatch answer.
  - Step 1's find-belongs-to-the-act sentence and the one-part examples (library renewals, garden plot booking) were
    already in place from t673.

Tests added: `single-subflow/tests/{single-subflow-plan,single-subflow-trial,assemble-latest}.test.ts` and the support
file `single-build.ts`; `dispatch/tests/whole-trial-port.test.ts`; 3 new cases in
`supervisor/tests/brief-sizing.test.ts`; and the end-to-end
`service/project-build/tests/project-build-single-subflow.test.ts`.

## Commands run and observed results

All commands ran from `packages/fluxiq` unless noted.

- Baseline before any edit:
  - Command: `npx vitest run src/programs/automation-studio/runtime/service/project-build src/programs/automation-studio/runtime/project-agents`
  - Result: `Test Files 69 passed (69)`, `Tests 451 passed (451)`.
- Type check:
  - Command: `npx tsc --noEmit -p tsconfig.json`
  - Result: no output, exit 0, after fixing one import and one test typing.
- Structure audit:
  - Command: `node scripts/structure-audit.mjs`, from the repository root.
  - Result: `structure-audit: passed (390 warning(s), 1156 baselined)`.
  - The +1 warning is advisory: `dispatch/tests/` has 16 files against a 15-file advisory.
- New tests:
  - `vitest run .../project-agents/single-subflow` → 3 files, 12 tests passed.
  - `.../dispatch/tests/whole-trial-port.test.ts` → 4 passed.
  - `.../supervisor/tests/brief-sizing.test.ts` → passed.
  - `.../service/project-build/tests/project-build-single-subflow.test.ts` → 1 passed.
- Final run of the same two directories:
  - Command: `npx vitest run src/programs/automation-studio/runtime/service/project-build src/programs/automation-studio/runtime/project-agents`
  - Result: `Test Files 3 failed | 71 passed (74)`, `Tests 7 failed | 464 passed (471)`.
  - Every failure is in a file I do not own, and each is explained below.

The 7 failures, and the change each file needs (all are one-subflow `main` plans going through the real dispatcher):

1. `project-build-facade.test.ts`, "plans a one-part task …": expects 2 scoped and 2 whole judge calls. It now gets 0
   scoped and 4 whole: 2 from the builder's test, and 2 because the scripted supervisor still assembles (it gets
   `sameRevision`) and calls `core.test_candidate` again.
   - Fix: script write_plan, dispatch, complete and expect `judged.subflow` 0 and `judged.whole` 2. Or keep the script
     and expect whole 4.
2. `project-build-facade.test.ts`, "judges a subflow's trial against the success check its builder proposed": a
   one-part plan no longer has a scoped judge.
   - Fix: run it with `shape: "two_parts"`.
3. `project-build-reset.test.ts`, "refuses the whole trial until a reset brief undoes …" and "undoes a cart line …":
   `boxWhenWholeJudged` and `cartWhenWholeJudged` now hold 4 entries, not 2. The extra pair is the builder's whole test,
   which judged on the site as the build found it plus its own save. Those tests are about the supervisor's
   reset-before-whole-test.
   - Fix: give their plans two subflows, or expect the extra pair.
4. `project-build-reset.test.ts`, "tells the person, when it ends with the save still in the box …": the builder's
   whole test passed, so the scripted honest ending now completes on that pass under the existing t622/t637 rules, and
   the build does not fail.
   - Fix: a two-subflow plan, or a judge that answers no for the whole run.
5. `project-build-time-limit.test.ts`, both tests: a single-path build that reaches its time limit now holds an
   assembled revision, the one the builder's test made, so it ends as a draft rather than a failure. The words also say
   "Its one part did not pass its own test. Left: a part never tested", because `run.ts`'s `trials` map is fed only by
   `proposals.trialled`.
   - Fix: the proposals-store follow-up under "Open questions" fixes the words.
   - The tests then need their expectations moved to the draft path. Test 2 already expects the draft path, so it needs
     only the words fix.

## Not verified

- No live browser or Lab run. That a real builder and the real loop words follow this path is not shown. The builder
  is still told "partial trial … no trial of the whole Flow" by the gate (follow-up 1 below).
- The whole reset's repeated-refusal rule (`supervisor/whole-trial.ts`) across a builder's undo was only exercised for
  an act that was really undone. Suppose a builder has already met a whole-gate refusal and then names an act under
  `cannotUndo`. That act stays `inPlace`, and the whole gate refuses again until a reset brief comes back. So the
  refusal text tells the builder to end partial and name an act it cannot undo, rather than use `cannotUndo`. A
  deployment with a start hook never reaches this.
- With a start hook, the hook runs twice per single-path test: once from the builder gate's `prepareStart` and once
  from the whole gate's. This costs time only and is not measured.
- A supervisor that ignores the guidance and calls `core.test_candidate` after the yes runs and pays for a second
  trial. I added no guard because `supervisor/whole-trial.ts` is not in my files.
- An amendment from a single-subflow plan to a multi-subflow plan that keeps the single-path proposal as a predecessor
  is not tested. The dependent's entry preparation reads `proposals.predecessors`, which lacks it, so it is most likely
  broken until the proposals-store follow-up.

Checked with tests, from the cost-gap report's "Not verified" list:

- The purse frame inside an allowance: the judge's `automationStudioLlmCurrentBuildPurse()` is the build purse, with
  role `supervisor`.
- `unchanged-submission.ts`: a retest of the same proposal reuses its revision (revisions `[1, 1, 2]`). The scoped
  controller already refuses a reworded subflow, so a reworded proposal never reaches the composed submission. The
  composed `candidate.unchanged_after_no` mapping is code-only and untested.
- The host lease: capacity 1, the whole test runs inside the builder's lease, `most` is 1 and `held` is 0 at the end.

## Open questions or contradictions found

1. **Follow-up, `flow-bootstrap/subflow-candidate/builder-loop.ts` (item 4, other worker):**
   - Add the input `trialIsWhole?: true`.
   - In the submit tool's `next` (the `gate.available` branch near the end of `executeTool`), when it is set, say:
     "Test next with core.test_subflow using exactly {revision, digest}. This test runs the whole Flow from its start
     as the build's judged run; a yes completes this brief. Submitting again makes a new revision that needs its own
     test."
   - In `discovery.budget`, use `countCalls: { keptForFinishing: input.trialIsWhole ? 0 : AUTOMATION_STUDIO_SUBFLOW_FINISHING_JUDGE_CALLS }`,
     and check that the loop's wrap-up (5 decisions) still fits under `AUTOMATION_STUDIO_SUBFLOW_BRIEF_MIN_CALLS`.
   - `subflow-trial-gate.ts` needs the same `trialIsWhole` for its `tool.description` and `INSTRUCTIONS.yes`, which
     now say "partial … no trial of the whole Flow".
   - Then, in `dispatch/run-brief.ts`, add `...(whole ? { trialIsWhole: true as const } : {})` to the `runBuilder({...})`
     call. That is one line in my file, left out because the input field does not exist yet.
   - Optionally, give the gate a general not-run port answer so that `whole-test-port.ts` can stop borrowing
     `subflow.trial_unaffordable` as its carrier.
2. **Follow-up: feed the build's proposals store from the single path.** This fixes the time-limit words and lets a
   single-path proposal be kept as a predecessor after an amendment.
   - In `dispatch/types.ts`, add `AutomationStudioProjectDispatcherInput.trialled?: (scope: AutomationStudioSubflowScope, proposal: AutomationStudioSubflowProposal, verdict: AutomationStudioCandidateTrialVerdict) => void`.
   - In `service/project-build/run.ts`, pass `trialled: (scope, proposal, verdict) => proposals.trialled(scope, proposal, verdict)`
     to `createAutomationStudioProjectDispatcher`. That goes through `run.ts`'s wrapped `trialled`, so `trials` is fed
     too.
   - In `whole-test-port.ts` and `run-brief.ts`, call it from the port's `weighed` with the request's scope and
     proposal and the gate's verdict.
   - Neither `types.ts` nor `run.ts` is in my files.
3. **The 7 failing tests above** need their owner to move them to the new path or to two-subflow plans. The brief said
   only that the two-subflow facade tests must stay green, and they do.
4. The design names `supervisor/single-subflow-plan.ts`, `supervisor/single-subflow-trial.ts` and
   `supervisor/assemble-latest.ts`. Per the brief's placement rule, all of them live in `project-agents/single-subflow/`
   instead, with their tests in `single-subflow/tests/`.
