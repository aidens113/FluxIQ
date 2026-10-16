# t679 one-part plan tests once: worker report

Worktree: `C:/Users/osrs_/FluxStuff/fxwork/t679/!FluxIQ`, branch `task/t679-one-part-plan-tests-once`. Part 1 was
committed as 5bac22c4 after merging Core dev. Round two is uncommitted on top of that, on a base that includes t676,
t680 and t681. Paths below are under `packages/fluxiq/src/programs/automation-studio/runtime/`.

## Outcome

Done. Design (5) items 1-7 are in. On a single-subflow plan, the builder's `core.test_subflow` is the judged whole run
of the exact assembled revision:

- The builder is told so, and its budget keeps no judge calls back.
- A refused whole test reaches the builder through the gate's own not-run answer, never as a verdict.
- The build's proposals store learns each single-path trial.
- The supervisor completes in three decisions.
- A `core.test_candidate` of the already-judged revision runs no second trial.

The 7 tests that failed after round one are fixed:

- One-part cases now expect the new path.
- Cases that test mechanics only the multi-subflow path still has now run on two-subflow plans. No case was deleted.

Everything in the four named directories passes: 101 files, 614 tests.

## What changed and why

Round one (committed; summary):

- New directory `project-agents/single-subflow/`:
  - `single-subflow-plan.ts`
  - `assemble-latest.ts`: the one assembly that `project.assemble` and the single-path test share.
  - `assembled-from.ts`
  - `single-subflow-trial.ts`: the whole test, run under the supervisor's purse frame and attribution.
  - `whole-test-port.ts`
- `dispatch/{port,dispatcher,run-brief}.ts`: `wholeTrial` added to the dispatch request.
- `supervisor/{assemble-tool,dispatch-tool,brief-sizing,guidance}.ts`:
  - `afterSingleWholeYes` with `complete`.
  - `sameRevision` from assemble.
  - Sizing of `allocatableUsd - finishingUsd`, with every allocatable call.
  - Guidance steps 5 and 6.

Round two:

1. **Builder words and budget (follow-up 1).**
   - `flow-bootstrap/subflow-candidate/subflow-trial-gate.ts`:
     - New input `whole?: true`. The tool description and a yes now say the test runs the whole Flow from its start
       as the build's judged run and that a yes completes the brief. The old "partial … no trial of the whole Flow"
       words are gone.
     - The tool is now built in the constructor, so the description can depend on the input.
     - A general not-run answer: the port may return `notRun: { code, instruction, detail?, retry? }` beside its
       result (exported type `AutomationStudioSubflowTrialNotRun`). The gate answers that refusal itself, with
       `resultReason: retry_allowed` when `retry` is set. It counts no trial, keeps no verdict, does not weigh, and does
       not run the reset's `trialRan`. A malformed `notRun` (no code or no words) is ignored.
   - `builder-loop.ts`: new input `trialIsWhole?: true`.
     - It passes `whole` to the gate.
     - The submit answer's `next` says: "This test runs the whole Flow from its start as the build's judged run; a yes
       completes this brief."
     - `budget.countCalls.keptForFinishing` is 0 on this path, because that judge is paid from the build's reserve.
       The wrap-up still fits, since `AUTOMATION_STUDIO_SUBFLOW_BRIEF_MIN_CALLS` = wrap-up decisions + 4.
   - `dispatch/run-brief.ts` passes `trialIsWhole: true` when the brief has the whole test.
   - `single-subflow/whole-test-port.ts` no longer borrows `subflow.trial_unaffordable` and has no loop observer. A
     refusal is returned as a `notRun` result.
2. **Proposals store fed from the single path (follow-up 2).**
   - `dispatch/types.ts` gains `AutomationStudioProjectDispatcherInput.trialled?`.
   - `service/project-build/run.ts` passes `(scope, proposal, verdict) => proposals.trialled(...)`, through the wrapper
     that also feeds the time-limit `trials` map.
   - The whole-test port calls it from `weighed`, with the request's scope and proposal and the gate's verdict. It is
     never called for a refusal.
   - `run.ts` also counts only part-carrying subflows in a time limit's words (`partSubflows`). Before, a plan of
     several subflows counted Core's router-run `main` as "a part never tested". That bug was found when moving the
     time-limit tests to two parts.
3. **The 7 failing tests.**
   - `project-build-facade.test.ts`:
     - The one-part case now expects 0 scoped and 2 whole judge calls, a dispatch answer carrying `complete`, and no
       assembly. The one-part supervisor script is now write_plan, dispatch, complete.
     - The proposed-success-check case moved to two parts. The part script proposes
       `done when: dialog alert "Not saved" absent`, a fact that names no handle, and the scoped judge's instruction
       carries the builder's proposed check.
   - `project-build-time-limit.test.ts`:
     - The failure path ("not assembled") and the draft path ("parts passed, whole judged no") moved to two parts, with
       the new counts.
     - A new one-part case: the builder's whole test could not be confirmed, so the draft is kept. The words count that
       test as the part's ("a part tested once whose last test could not be confirmed") and never say "never tested".
       This proves follow-up 2.
   - `project-build-reset.test.ts`: all recipe and cart cases now run on two subflows: `prepare` acts on nothing, and
     `keep` makes the lasting act. Step numbers moved: the builder trial's act is step 3, and the whole run's is step 4.
     See open question 1 for what changed in the recipe case.
4. **Guards in `supervisor/whole-trial.ts`.**
   - A `core.test_candidate` on a single-subflow plan that names the latest revision, while its yes stands and
     `gate.completion` is ok, answers `{ ok, verdict: "yes", alreadyJudged: true, complete, instruction }` with the new
     guidance `next.afterWholeAlreadyJudged`. It runs no trial and records no second receipt. A rescued pass still runs
     as before.
   - The cannotUndo case:
     - The repeated-refusal rule only fires while acts are in place. A ledger's `inPlace` excludes kept acts, so an act
       the builder names under `cannotUndo` in its next test, after the whole gate's refusal asked for it, is kept and
       stops holding the test back.
     - The refusal words (`single-subflow-trial.ts` `resetRequired`) now tell the builder to name such an act under
       `cannotUndo` when it tests again.
     - The header of `whole-trial.ts` documents this.

Tests added or changed in round two:

- New: `subflow-candidate/tests/subflow-trial-whole.test.ts` (3 cases).
- New: `single-subflow/tests/amend-from-single.test.ts`.
- `subflow-candidate/tests/builder-loop.test.ts`: whole words, `keptForFinishing: 0`, and the wrap-up fit.
- `dispatch/tests/whole-trial-port.test.ts`: `trialled` is told for trials and not for refusals, and the builder
  sees the whole-test tool.
- `single-subflow/tests/single-subflow-trial.test.ts`: the cannotUndo case, and the new refusal words.
- `supervisor/tests/whole-trial.test.ts`: the already-judged guard.
- `project-build-single-subflow.test.ts`: the whole run's booking is recorded as the supervisor's act.
- The three moved service test files described above.

## Commands run and observed results

All commands ran from `packages/fluxiq` unless noted.

- On the new base, before any round-two edit:
  - `npx tsc --noEmit -p tsconfig.json` → no errors.
  - `npx vitest run src/programs/automation-studio/runtime/{service/project-build,project-agents,flow-bootstrap/subflow-candidate,service/subflow-trial}`
    → `Test Files 3 failed | 96 passed (99)`, `Tests 7 failed | 599 passed (606)`. These are the same 7 failures as
    round one.
  - `node scripts/structure-audit.mjs` (repository root) → `passed (391 warning(s), 1155 baselined)`.
- After round two:
  - `npx tsc --noEmit -p tsconfig.json` → exit 0, no output.
  - The same vitest command → `Test Files 101 passed (101)`, `Tests 614 passed (614)`.
  - `node scripts/structure-audit.mjs` → `passed (392 warning(s), 1155 baselined)`. The +1 is advisory:
    `builder-loop.ts` is at 409 lines against a 400-line advisory (the budget is 800).

## Not verified

- No live browser or Lab run. That a real model follows the new words is not shown.
- With a start hook, the hook runs twice per single-path test: from the builder gate's `prepareStart` and from the
  whole gate's. This costs time only and is not measured.
- The `notRun` mapping of a composed `candidate.unchanged_after_no` is covered by code only. The scoped controller
  already refuses a reworded subflow before it can reach the composed submission.

## Open questions or contradictions found

1. **Defect on the multi-subflow path, found while moving the reset tests to two subflows.** A part subflow's trial
   runs its steps inside a called subflow. Those steps get no state diff that names the item they acted on. So a
   builder trial's act inside a part can never be undone by its item:
   - The reset brief's undo is refused as `candidate.undo_wrong_target`.
   - The act is kept.
   - The reset still comes back `done`, saying "Every lasting act this build made is undone", while the recipe stays in
     the box.
   - The whole trial then runs with it in place (`startedWith.cannotUndo`).

   On a single router-run subflow, the item is named and the undo works (t598). The recipe case now asserts this
   behaviour honestly, as the cart case already did for its item-less act. The fix belongs to the trial run's state
   diff for called subflows (`service/subflow-trial/` or the host runtime), which I did not own. A follow-up should fix
   it, and then restore that case's `Unsave` expectation.
2. **A single-path proposal cannot be kept as a predecessor after an amendment.** Amending a single-subflow plan to
   several gives the old subflow an interface, so the amendment drops its proposal ("its inputs or outputs changed");
   it is neither kept nor carried. The new test shows this. The kept-predecessor case the brief asked to test therefore
   does not exist under the current amendment rules. The proposals store is still fed (follow-up 2), so a future rule
   that keeps or carries it would find it.
3. The reset brief's `done` wording when an act was kept rather than undone (point 1) is existing `dispatch/ending.ts`
   behaviour, and it reads as untrue to the supervisor. It is worth a separate look.
