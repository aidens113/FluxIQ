# t603 interruption-repair: worker report

## Outcome

Done. All three parts are built and covered by stub tests. Two caveats come first:

- I edited four files outside the brief's Owns list: `supervisor/completion.ts`, `supervisor/supervisor-loop.ts`, `supervisor/guidance.ts` and `contracts/subflow-brief.ts`. None of them is on the Must-not-touch list.
- I ran no live run. Nothing I ran could reach a model provider.

## What changed and why

Root cause, from run-mv8mebid-84ada5bd steps 0066 and 0072-0080:
- Step 0066 was the whole test. It answered `yes`, but the trial gate also answered `slowDown` and refused completion with `candidate.trial_slow_down_unhandled`.
- The gate (`flow-bootstrap/candidate/trial-gate.ts`) bases that refusal on the trial's step record: a step's `absorbed` entry with `askedWaitMs`, a step's `interruptions` entry of kind `rate_limit`, and the paces the run learned. It then checks whether the Flow already has the pace and the dismiss-and-wait branch.
- In the run, step 18 had `absorbed[{failureCode:"web.action.rate_limited", askedWaitMs:8500, waitedMs:3400, paceMs:7163}]` and `interruptions[{kind:"rate_limit", wayOut:"t914"}]`.
- The supervisor's repair check (`failingTrials`) used the contract reader `failingTrial()`, which returned undefined for any `yes`. So all four repairs were refused with `project.failing_receipt_passed`.

1. **Detection, from the structured record only** (`supervisor/state.ts`, `rescuedTest`)
   - It asks the gate's own `completion()` for the latest candidate. It counts a test as rescued only when the verdict is `yes` and the refusal code is `candidate.trial_slow_down_unhandled` with a non-empty `slowDown`.
   - The gate stays the one owner of deciding whether the Flow answers it. No page words are read.
   - A consent banner or dialog the run closed does not count, and neither does a plain retry. The gate does not hold those back either.
2. **Contract / trial feedback reader** (`contracts/subflow-brief.ts`)
   - `AutomationStudioProjectFailingTrial` is now a union. The second form is `{verdict:"yes", interruptions[], said}`.
   - `failingTrial(trial, unanswered=[])` builds each interruption from the trial's step record: step number, label, definitionId, control, `absorbed`, `interruptions`, the matching learned `paces`, and `needs` (paceAtLeastMs, wayOut, waitAtLeastMs from the gate). Each one is bounded.
   - A `yes` without interruptions is still undefined, so it is still not a failing trial.
   - The parser accepts `yes` only with a non-empty `interruptions` list and no `failedStep`. It refuses `interruptions` on any other verdict.
3. **Dispatch** (`supervisor/dispatch-tool.ts`)
   - A repair naming a rescued whole test is admitted. Its brief carries the yes-with-interruptions failing trial, which is recorded as sent.
   - When a repair of it comes back not done or changed nothing, `state.recoveryRepairsShort` is set to `short`. The answer then gives `wholeTestStands.complete` and `next.afterRecoveryRepairShort`.
   - When the purse refuses a call made only of such repairs (either allowance refusal), the state is set to `money`. The answer gives `wholeTestStands` plus `issues.recoveryRepairUnaffordable`.
   - A repair naming a passing whole test with no such interruption is still refused `failing_receipt_passed`, with no `wholeTest`.
4. **What the builder sees** (`dispatch/run-brief.ts`)
   - A `yes` failing trial is shown under `repairOf` with a new note, `REPAIR_RESCUED_NOTE`. The note covers the `interruptions` and `needs` fields, the `repeat pace:` line, an `optional: yes` dismiss step followed by a `builtin.timing.wait` step with `only after:`, that wayOut is the trial page's handle, and to end blocked if the step is not in its subflow.
   - The wording is generic and names no realistic scenario.
5. **Part (3): the pass still stands**
   - In `supervisor/completion.ts`, a rescued yes is refused with `completion.recoveryRepairFirst`, which carries `slowDown` and `wholeTest`, until its repair could not be made. After that, completing on the same revision is accepted.
   - The new `automationStudioProjectSupervisorReliesOnRecovery` stores what the person is told (`state.relyOnRecovery`) and posts a chat note titled "The Flow relies on the run's own recovery". The note names the steps and says why the repair could not be made.
   - In `supervisor/supervisor-loop.ts`, when money (`outOfMoney`), time (`timedOut`) or turns (`llm_evidence_loop.iteration_limit`) run out while a rescued test stands, the run ends `candidate` on that test instead of with an ending. The outcome carries `reliesOnRecovery`.
6. **Guidance** (`supervisor/guidance.ts`): three new texts, `next.afterRecoveryRepairShort`, `issues.recoveryRepairUnaffordable` and `completion.recoveryRepairFirst`. All three are covered by the existing teach-to-the-test word check in `guidance.test.ts`. I avoided the banned words "rate limit" and "digest".
7. **Tests**
   - The fixture has a new `trialFeedback` option.
   - New `supervisor/tests/interruption-repair.test.ts`, 6 tests:
     - a rescued test admits a repair, whose brief carries the steps from the step record, and the record keeps them;
     - a plain pass (only a consent banner closed) still refuses the repair;
     - completion is held until the repair is tried, then accepted once the repair changed nothing, and the chat note is emitted;
     - turns running out still ends `candidate` with why `turns`;
     - the purse being drained gives `allowance_unavailable` with `wholeTestStands`, then `candidate` with why `money`;
     - a `no` verdict keeps its old failing trial.
   - `repair-opening.test.ts` has one more test: the builder is shown the interruptions, and the note's syntax and banned-word checks pass.
   - `subflow-brief.test.ts` has two more tests, for parsing and the reader.

## Commands run and observed results

All run from `C:/Users/osrs_/FluxStuff/fxwork/t603/!FluxIQ`:
- `npx tsc --noEmit -p .` in `packages/fluxiq`: exit 0, no output. It reported 3 type errors before I fixed them.
- `npx vitest run src/programs/automation-studio/runtime/project-agents`: 32 files, 250 tests passed. Before I added tests it was 31 files, 241 tests passed.
- `npx vitest run src/programs/automation-studio/runtime/service/project-build`: 14 files, 66 tests passed.
- `node scripts/structure-audit.mjs`: `structure-audit: passed (360 warning(s), 1156 baselined)`. No warning names a touched source file. `state.ts` is exactly 400 lines; it was 401 until I trimmed its header.

## Not verified

- No live or Lab run. No browser.
- The time-limit path (`timedOut`, then `candidate`) has no test of its own. The turns and money paths are tested.
- `service/project-build/run.ts` does not read `outcome.reliesOnRecovery`. The person is told only through the chat note, not in the final "Flow is ready" message or the build record. Promoting a relied-on candidate through the service is not tested.
- No site reset runs before completing on a rescued test. A repair builder that ran after that test may have left its own acts on the site. This matches normal completion, which also does not reset.
- Subflow-trial receipts that passed only on the run's own recovery are not detected. Only the whole test is.
- Architecture docs are not updated.

## Open questions or contradictions found

- **Ownership:** part (3), its test, and keeping model text in guidance.ts could not be done inside the Owns list. I edited `completion.ts`, `supervisor-loop.ts`, `guidance.ts` and `contracts/subflow-brief.ts`, which I read as the brief's "trial feedback reader". The supervisor should accept these edits or move them.
- A new file in `supervisor/` would have made it 26 source files, over the 25-file directory limit. So the reader lives in `state.ts` and the contract instead.
- Scope of "interruption": I followed the gate, so only cases where the site asked the run to slow down count. A dialog or consent notice the run closed, and a plain retry, do not admit a repair. If the user's rule should cover those too, the gate (`flow-bootstrap`, which I must not touch) would need to change first.
