# t684: reset undoes acts made inside a part

## Outcome

Done. All four items are fixed, each with a test that fails when its fix is switched off. Core `tsc` is clean, the named
test directories pass, and the structure audit passes. Nothing is committed.

## What changed and why

### Defect 1: a called part's step named no item (cause found and fixed)

**Cause.** The fault was not the state diff. A step inside a called subflow does get its own state diff:
`composite-execution/boundary.ts` passes the parent's `hostRuntime` to the child run. The fault was in
`service/candidate-trial/landed-acts.ts`, which reads each step's items. `automationStudioRunDetailAttemptsInRunOrder`
puts a Call Subflow attempt *before* its child's attempts. The call's own diff spans the whole child, so the page after
the call already lists the item the child's step made. `landed-acts` added every earlier step's before and after items to
`seen`. So by the time the child's Save step was read, its new recipe was already "shown by an earlier step", and
`created` came back empty. With no item named, the reset's undo was refused `candidate.undo_wrong_target` and the act was
kept.

I confirmed this with a temporary debug print on the recipe case (now removed):
`call-subflow ... after:["recipe:lentil-soup","recipe:rye-loaf"]`, followed by
`domain.isolated.save-recipe ... created:[] seen:[...,"recipe:rye-loaf"]`.

**Fix** (`service/candidate-trial/landed-acts.ts`). For a Call Subflow attempt (`subflowTarget`), only its page before
goes into `seen`, because only that page comes before the child. Its page after does not. The child's own steps, and the
steps after the call, list those items themselves. The header has a new t684 paragraph.

This file is the act-ledger input that the subflow trial (`service/subflow-trial/run.ts`) and the whole trials use. It
belongs to the brief's "act ledger" path, though it sits in `service/candidate-trial/`.

**Tests:**
- `candidate-trial/tests/landed-acts.test.ts` has a new case. A call whose diff shows the line, then its child's step
  that made it, then a later step: the child's step now names the line in `created`, and the later step names none.
- `project-build-reset.test.ts`, recipe case: the `Unsave` expectation is restored. The presses are now
  `[run Save rye, Save herb, Unsave herb, Unsave rye, run Save rye]`, and the judged whole run has no `startedWith`.
  The record now holds act-3 (the supervisor's whole-run save, `trial step 4 "save the recipe"`). Step 4 is the number
  the trial itself reports on the two-subflow router.

### Defect 1, second half: the reset's words are now honest

**New file:** `project-agents/dispatch/reset-done.ts`, with the function `automationStudioProjectDispatchResetDone(ledger)`.

- When no act of the build stayed on the site, it returns the old sentence: "Every lasting act this build made is undone;
  the site is as the build found it."
- Otherwise it returns: "This reset undid every act of this build it could, but N lasting act(s) of this build stay(s) on
  the site, so the site is not as the build found it: act-1 (did; the site offers no way to undo it), act-2 (did; FluxIQ
  cannot undo it)". It names at most 10 acts and counts the rest.
- An act counts as stayed when its brief's ledger kept it. This uses the same `claim` → `candidate.undo_act_kept` check as
  `supervisor/left-on-target.ts`. An irreversible act also counts as stayed.

**Wiring:**
- `dispatch/ending.ts`: `ending.reset` takes the `done` words as a new 5th parameter.
- `dispatch/run-brief.ts`: the `RESET_DONE` constant is removed. Both reset `done` paths now call the new function.

**Tests:**
- New `dispatch/tests/reset-done.test.ts` (3 cases).
- `project-build-reset.test.ts`, cart case: the reset's return reason no longer says every act is undone, and names act-1
  as staying.

### Gap 2: a whole test after a reset holds the next ending

In `supervisor/state.ts`, the state now numbers each return and each whole test in the order they happen, using
`moments`, `answeredAt` and `testedAt`. `noteWholeTest` stamps `testedAt`. `resetCameBackLast()` is true only when the
latest brief is a reset, its return came back, and no whole test ran after it. A return read from the record counts as
back before any test this run ran.

The `completion.ts` header sentence now says the reset must come back after the last whole test too.

This also changes the two other callers of `resetCameBackLast()`, as intended:
- Core's own reset before a guard-forced ending (`supervisor-loop.ts`) is now sent after such a test.
- `repeatedReset` (`dispatch-tool.ts`) no longer refuses a reset sent after such a test.

**Test:** `supervisor/tests/reset-next.test.ts`, new case. Two-subflow plan, then test refused, reset, test (no, leaves
its act), end. The ending is held `project.completion_reset_first`. A second reset runs, and the next ending goes
through.

### Gap 3: a test refused for a reset clears `resetToEnd`

In `supervisor/whole-trial.ts`, `test()` sets `state.resetToEnd = undefined` first. Any test asked means the build is
going on, even one refused `project.trial_reset_required` or answered `alreadyJudged`. The header has a t684 paragraph.

**Test:** `supervisor/tests/whole-trial.test.ts`, new unit case. A gate that refuses for a reset, with `resetToEnd` set to
`ending` and then to `completion`: after `test()`, it is undefined both times.

I first tried an end-to-end case for this. Re-testing the same revision after a no is refused
`candidate.trial_unchanged_after_no` before the reset check runs, so I used the unit case instead.

### Gap 4: `afterReset` no longer asks why the reset was sent

In `supervisor/guidance.ts`, `GUIDANCE.next.afterReset` is now "The reset came back. Test the latest assembled Flow with
core.test_candidate." A reset sent for a held ending or completion is answered from `resetToEnd` instead (t683).

**Test:** `reset-next.test.ts`. The old test "puts ending again first ..." is replaced by "says only to test ...". The new
test fails on the old words, which named `project.completion_reset_first` and "end again".

### Must-not-change checks

None of these changes refuses an act before it runs, touches retries, or widens what a reset may undo. The `created` rule
is still positive evidence only, and an item an earlier step's page before showed is still never "created". The new
model-facing words name no Lab scenario.

## Commands run and observed results

All run in `C:/Users/osrs_/FluxStuff/fxwork/t684/!FluxIQ`. Commands marked `(packages/fluxiq)` ran from that
subdirectory.

- `npx tsc --noEmit -p tsconfig.json` (packages/fluxiq) → exit 0, no output.
- `npx vitest run $R/project-agents $R/service/project-build $R/service/subflow-trial $R/service/candidate-trial`
  (packages/fluxiq; `R=src/programs/automation-studio/runtime`) → `Test Files 106 passed (106)`,
  `Tests 698 passed (698)`.
- `npx vitest run $R/flow-bootstrap/candidate $R/flow-bootstrap/site-reset $R/service/candidate-trial $R/tests/service-bootstrap`
  (also users of landed acts and the ledger) → `Test Files 80 passed (80)`, `Tests 565 passed (565)`.
- `node scripts/structure-audit.mjs` → `structure-audit: passed (392 warning(s), 1155 baselined).`
  - The warnings on the files I touched are existing advisories: `ending.ts` 482, `run-brief.ts` 524, `state.ts` 583 and
    `project-build-reset.test.ts` 607 lines, all over the 400-line advisory.
- Fixes switched off one at a time, then restored from scratchpad copies (`grep -c` confirmed the restore):
  - landed-acts: the new `landed-acts.test.ts` case failed (`Tests 1 failed | 8 passed`).
  - landed-acts, state and whole-trial off together: 3 failed (`Tests 3 failed | 20 passed`):
    - "a whole test refused for a reset > drops the reason ..."
    - "an ending after a whole test that ran after the last reset > is held ..."
    - "a project build whose builder leaves a lasting act > refuses the whole trial until ..." (recipe case)
  - reset-done forced to the old sentence: 3 failed (`Tests 3 failed | 7 passed`). These were the two reset-done unit
    cases and the cart case.
  - Gap 4 is shown by the assertion itself: the new test asserts the absence of exactly the strings the old words
    contained.

## Not verified

- No live browser or Lab run. The web domain must write `stateDiff.items` around each step for the fix to take effect
  live (t609 noted it does). Whether its called parts' steps do so was not checked live.
- I did not check, outside the recipe fixture, that the order where a call comes before its children holds for every
  stored trace shape, such as a trace read back from a session, or a Call Flow (not a Call Subflow), whose children
  `automationStudioRunDetailAttemptsInRunOrder` does not flatten. A Call Flow attempt still adds its page after to `seen`,
  as before.
- Whole suite not run, per the brief.

## Open questions or contradictions found

1. **Stale header, not edited.** `supervisor/dispatch-tool.ts` (not mine to edit) still says, in its t638 paragraph
   "After a reset, what comes next": "otherwise end again if an ending was held for this reset, else test". That has not
   been true since gap 4. The t683 suggestion to move `AFTER_RESET_TO_END` and `RESET_REPEATED_TO_END` into
   `guidance.ts` is also still open, because it needs `dispatch-tool.ts`.
2. **Files outside the named list.** I edited `dispatch/ending.ts` and `dispatch/run-brief.ts`, and added
   `dispatch/reset-done.ts`, as "the reset brief words". The cause of defect 1 was in
   `service/candidate-trial/landed-acts.ts`, which is the act-ledger input, not `service/subflow-trial/` or the executor.
   Both fall under the brief's "whatever the cause is in" clause, but the supervisor should confirm.
3. **A possibly lasting press is not named in the new reset words.** These are acts that declared no lasting act but
   changed the page. The reset's `done` can therefore still say "the site is as the build found it" while one may remain.
   An ending names them (`left-on-target.ts`). The reset words could do the same if that is wanted.
