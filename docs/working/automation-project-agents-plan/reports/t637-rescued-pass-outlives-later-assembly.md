# t637 rescued-pass-outlives-later-assembly: worker report

## Outcome

Done. The work is in Core worktree `fxwork/t637/!FluxIQ`, on branch `task/t637-rescued-pass-outlives-later-assembly`. Nothing was committed and no live run was made.

A rescued pass is a whole test that passed only because the run recovered by itself from a slow-down. The most recent rescued pass is now kept, with its own Flow, as the build's fallback. It stays the fallback until a later revision passes its whole test outright.

Every ending without such a later pass completes on the fallback, with t622's "relies on the run's own recovery" words. That covers:
- the model's honest ending;
- every guard-forced end: money, time limit, turns, stall, provider, or a question put to the person.

A person's cancel still completes on nothing.

## What changed and why

All changes are under `packages/fluxiq/src/programs/automation-studio/runtime/project-agents/supervisor/`. The dispatch tool was not touched: the shortfall flag did not need it.

### `state.ts`: the fallback

- **New private `fallback`.** It holds `{ test, candidate }`: the rescued test and a snapshot of the exact candidate its trial ran.
- **New `noteWholeTest(controller, gate)`.** It runs after every whole test.
  - When the latest assembly's test is a rescued pass, that pass becomes the fallback.
  - The fallback is dropped when the latest assembly passes outright (a yes the gate's `completion` accepts).
  - It is also dropped when the fallback's own revision is tested again and is no longer a rescued pass.
- **New `standingRescue(controller, gate)`.** It returns the latest assembly's own rescued pass, exactly as t622 had it. Otherwise it returns the fallback with its candidate and `setAside`, the later assembly's revision and digest. The existing `rescuedTest` is unchanged and still reads only the latest assembly. The dispatch tool's repair naming and the named-completion branch use it as before.
- **`relyOnRecovery` takes a `StandingRescue`.** On the fallback:
  - it sets `completedOn` to the fallback's candidate;
  - it puts `setAside` on `reliesOnRecovery`;
  - the person is told: "...it relies on the run's own recovery, which waits, tries the step again and closes the site's notice. A repair to add that was made, but the Flow assembled from it (revision N) never passed its whole test, so the build completes on revision M, the last that passed."
  - then come the words for what stopped the build, from the new `FALLBACK_STOP_WORDS` (for example "The supervisor then ended the build."). t622's `SHORTFALL_WORDS` say the repair was never made, which is false here.
  - Core's note of anything still on the target follows those words.
  - These are Core's words only. The model's reason is kept only under `endedWith`.
- **Header.** A new t637 paragraph covers all of this.

### `whole-trial.ts`

- `test` calls `state.noteWholeTest(context.controller, gate)` after every judged whole trial.

### `completion.ts`: the honest ending

- **On the latest assembly's own rescued pass:** the ending completes on it at once, as in t622.
- **On the fallback:** the ending is never refused as too soon. The reset rule holds first, exactly as for an ending. While this build's own undoable acts are in place and no reset came back last, the ending is refused `project.completion_reset_first`, at most `MAX_HELD_FOR_RESET` times. Then it completes on the fallback, with `left.note` added after the person's words.
- **`automationStudioProjectSupervisorReliesOnRecovery`.** It now takes `(context, why, { endedWith?, rescue?, left? })`. With no `rescue` given, it uses `standingRescue`.
- **Header.** A new t637 paragraph.

### `supervisor-loop.ts`: guard ends, and which Flow is promoted

- **Guard ends.** Each guard end now asks `standingRescue`. On the fallback, Core first runs its own reset brief (`resetBeforeEnding`, under the ending signal, with the new `FALLBACK_RESET_REASON`). It skips that reset in the cases where an ending sends none:
  - money spent;
  - a provider that stopped answering;
  - a question put to the person.

  It then completes, naming what is left.
- **Which Flow is promoted.** `done("candidate")` hands the caller `state.completedOn` when set, otherwise `controller.latest()`. The outcome's `trial` is `gate.standing(candidate)`, which is the fallback revision's own yes.
  - `service/project-build/run.ts` promotes `outcome.candidate` and uses `outcome.trial`. So the fallback revision's Flow is the one saved and promoted, never the later assembly. The service needed no change.
  - The gate keys its verdicts by revision and digest, so the fallback's standing yes is still read correctly after a later assembly.
  - `controller.latest()` cannot return an older revision, so the candidate is snapshotted when its test runs.
- **Header.** A new t637 paragraph, and the `reliesOnRecovery` outcome comment is updated.

### `tests/supervisor-fixture.ts`

- A new `script` option lets a done brief's builder write a different script, for example a repair that changes its subflow. The fixture's builders otherwise always rewrite the same script, so a repair could only come back unchanged.

### New `tests/rescued-pass-fallback.test.ts` (5 tests)

The fixture replays the social run's shape: a rescued yes on rev 1, the repair done with a changed script, rev 2 assembled and tested. Each whole trial leaves an act, and the start hook puts it back before the next trial.

1. **The model's honest ending.** Rev 2 answers unsure. The ending is refused `project.completion_reset_first`, the reset brief runs, and the second ending completes:
   - the outcome is `candidate`;
   - `candidate` is `{revision: 1, digest: <rev 1's trial digest>}` and `trial` is the yes for revision 1;
   - `reliesOnRecovery` holds `{revision: 1, why: "ended", endedWith, setAside: {revision: 2}}`;
   - what the person is told holds the recovery and fallback words, not the model's reason, and no "Still on the target";
   - no acts are left in place and no record ending is written;
   - the dispatches were build, repair, reset.
2. **A guard stall, with a purse.** Core's own reset brief runs, then the build completes on rev 1 with `why: "stalled"` and "The build then stopped making progress."
3. **A guard stall, without a purse.** No reset can be sized, so the build completes on rev 1 and the words end with "Still on the target from this build: ...".
4. **The person's cancel as the model ends.** The status is `ended`, the ending is `cancelled`, there is no `reliesOnRecovery` and no candidate.
5. **A later outright pass replaces the fallback.** Rev 2 answers a plain yes. An honest ending is then refused `project.completion_ended_too_soon` instead of completing on rev 1, and the build completes on rev 2 with no `reliesOnRecovery`.

**The tests fail without the change.**
- With the `noteWholeTest` call removed from `whole-trial.ts`, tests 1-3 failed and tests 4-5 passed.
- With only the outright-pass drop removed from `noteWholeTest`, test 5 failed.
- Both files were restored from scratch copies afterwards.

## Commands run and observed results

All commands ran in `fxwork/t637/!FluxIQ/packages/fluxiq` unless noted.

- `npx tsc --noEmit -p .`
  - The first run had 2 errors in `completion.ts`: `endedWith` was inferred as `outcome: string`. I fixed it with an explicit type.
  - After all edits it exited 0.
- `npx vitest run src/programs/automation-studio/runtime/project-agents/supervisor`, before the new tests: 19 files and 130 tests passed.
- `npx vitest run .../supervisor/tests/rescued-pass-fallback.test.ts`: 5 passed.
- The same file run again with the change temporarily removed:
  - `noteWholeTest` call removed: 3 failed, 2 passed;
  - outright-pass drop removed: 1 failed, 4 passed.
- Final run of `npx vitest run src/programs/automation-studio/runtime/project-agents src/programs/automation-studio/runtime/service/project-build`: 56 files and 384 tests passed, after a final `tsc` that exited 0.
- `node scripts/structure-audit.mjs`, at the repository root: `structure-audit: passed (373 warning(s), 1156 baselined)`.
  - It ran while that final vitest run was in progress. It only reads files.
  - Advisory warnings for the changed files:
    - `supervisor/state.ts` is 507 lines; it was 416 lines and already warned.
    - `supervisor-loop.ts` is now 413 lines, past the 400-line threshold.
    - `supervisor/tests/` has 22 files.
  - The `supervisor/` directory is at 25 files, the hard limit, so no new source file could be added there. That is why the fallback lives in `state.ts`.

## Not verified

- No live or Lab run was made, as the brief says. Whether a live build now promotes rev 1 of a social-style run is untested.
- `service/project-build/run.ts` was not edited. That it promotes `outcome.candidate` was read from the code and is covered only by the supervisor-level tests. No service test promotes a fallback.
- A supervisor started again on a build under way has no fallback, because it is held in memory only. Such a run completes only on the latest assembly's own rescued pass, as before.
- The `pnpm check` and full-suite gates were not run, per the project's twice-a-day rule.

## Open questions or contradictions found

- **Is an outright pass kept as a fallback too?** By the brief, the fallback is only a rescued pass, and a later outright pass drops it. If that outright revision is then superseded by a repair whose assembly never passes, an ending does not complete on it, so a passing Flow can still be lost on that path. The user rule ("a repair that fails never loses a passing Flow") suggests the fallback should be the most recent passing revision of either kind. That would need the person's words for an outright fallback. This is the supervisor's call.
- **A later standing no.** The debug report (fix 3) said to keep the fallback "until a later revision gets a yes or a standing no". The brief says only a yes. I followed the brief: a no on a different revision does not refute rev 1's judged yes.
- **The model naming the fallback directly.** A completion that names the fallback's revision and digest while a later assembly is latest is still refused `project.completion_not_latest`, and that refusal points at the later assembly. The build still completes on the fallback when the model then ends or a guard ends it, but the refusal could name the fallback instead.
- **Plan amendments.** The fallback is kept across a `project.amend_plan`. Rev 1 was judged against the instructions, not the plan, so I left it standing.

## Follow-up: the coordinator's three decisions

### Outcome

Done. All three decisions are in the code and tested, in the same worktree. Nothing was committed and no live run was made.

### What changed and why

1. **The fallback is the most recent pass of either kind** (`state.ts`).
   - `noteWholeTest` now keeps an outright pass as the fallback as well as a rescued one. An outright pass is a yes the gate's `completion` accepts. Each pass keeps its Flow snapshot and its trial's receipt id, and only a later pass replaces it.
   - `standingRescue` returns a union. It holds `test` (a rescued test) when the pass was rescued, and `fallback` (the new type `AutomationStudioProjectSupervisorFallbackFlow`: revision, digest, receiptId, candidate, setAside) when the pass is not the latest assembly's own.
   - An outright pass that is itself the latest assembly is not returned. The supervisor completes on that revision through the ordinary completion, and an honest ending there is still refused as too soon, as before.
   - **New `completeOnPass`** for an outright fallback.
     - It records `completedOnPass` (`{revision, digest, receiptId, why, told, setAside?, endedWith?}`) and sets `completedOn`.
     - The person is told plainly: "Revision 3 never passed its whole test, so the build completes on revision 2, the last that passed." Then comes the line for what stopped the build, then Core's note of anything still on the target. There is no recovery sentence.
     - The chat row's title is "The build completes on the last revision that passed".
   - A rescued fallback still goes through `relyOnRecovery`, with the recovery words.
   - `automationStudioProjectSupervisorReliesOnRecovery` (`completion.ts`) chooses between the two, and returns either record.
   - The run's outcome gains `completedOnPass` (`supervisor-loop.ts`), and `candidate` and `trial` are the fallback's own.
2. **Lifetime, as built.** A later pass replaces the fallback. A re-test of the fallback's own revision that no longer passes drops it.
3. **A completion naming the fallback completes on it** (`completion.ts`).
   - A completion whose revision and digest are not the latest assembly's but are the fallback's completes on the fallback. It uses the same reset rule as an ending: the `project.completion_reset_first` hold is now one shared helper, `resetFirst`.
   - The new shortfall `completed` is said "The supervisor then completed on it." (`FALLBACK_STOP_WORDS`), or, in `SHORTFALL_WORDS` for completeness, "The supervisor completed on it before a repair to add that was made."
   - A completion naming any other revision that is not the latest is still refused `project.completion_not_latest`.

Headers were updated in `state.ts`, `completion.ts` and `supervisor-loop.ts`, and the comment in `whole-trial.ts`.

### Tests added or changed (`tests/rescued-pass-fallback.test.ts`, now 9)

- **The latest's own outright pass is no fallback to end on.** This was the earlier test 5, kept. It now also checks there is no `completedOnPass`.
- **An outright fallback.** Rev 2 passes outright, then a second build of the subflow is assembled as rev 3 and answers unsure. The honest ending is refused once for the reset, the reset runs, and the build completes on rev 2:
  - `candidate` is rev 2 with its digest, and `trial` is rev 2's yes;
  - `completedOnPass` holds `{revision: 2, why: "ended", setAside: {revision: 3}, endedWith}`;
  - what the person is told is exactly the plain sentence;
  - there is no `reliesOnRecovery` and no record ending.
- **A completion naming the rescued fallback** (rev 1, while rev 2 is the latest). It is refused once with `project.completion_reset_first`, the reset runs, and it completes on rev 1 with `why: "completed"` and `setAside: {revision: 2}`.
- **A completion naming a stale non-fallback revision** (7) is still refused `project.completion_not_latest`, naming rev 2. The later honest ending then completes on rev 1.
- **The fallback's own revision tested again.** Rev 1 is rescued, then tested again and answers unsure. The fallback is dropped, and the honest ending is recorded `partial` with no Flow.

**Each test fails without its change.** I ran three temporary changes, one at a time, and restored the files from scratch copies after each:
- turning off the outright-pass branch of `noteWholeTest`: the outright-fallback test failed, 8 passed;
- turning off the re-test drop: the re-test test failed, 8 passed;
- turning off the named-fallback branch: the named-completion test failed, 8 passed.

### Commands run and observed results

All commands ran in `packages/fluxiq` unless noted, one after another, with nothing heavy beside them.

- `npx tsc --noEmit -p .`: exited 0.
- `npx vitest run .../supervisor/tests/rescued-pass-fallback.test.ts`: 9 passed. The three runs with a change turned off are listed above.
- `npx vitest run src/programs/automation-studio/runtime/project-agents src/programs/automation-studio/runtime/service/project-build`: 56 files and 388 tests passed.
- `node scripts/structure-audit.mjs`, at the repository root: exited 0, `structure-audit: passed (373 warning(s), 1156 baselined)`.
  - Advisory warnings for the changed files:
    - `state.ts` is 552 lines (the hard limit is 800);
    - `supervisor-loop.ts` is 418 lines;
    - the `supervisor/` and `supervisor/tests/` directories have 25 and 22 files.

### Not verified, and open questions

- **No live or Lab run.** No service-level test promotes a fallback.
- **A guard end while the latest assembly's own outright pass stands still ends with no Flow.** For example, the supervisor passes rev 2 outright and then stalls or runs out of time without completing. That is unchanged from before t637: the latest outright pass is not a fallback by design, so the supervisor completes on it itself. Making guard ends complete on it too would need words for the person, so I left it.
- **The fallback is still in memory only.** A supervisor started again on a build under way has none.

## Follow-up 2: a guard end after the latest assembly's own outright pass

### Outcome

Done. A guard can now end the loop while the latest assembly's own whole test passed outright and before the supervisor completed on it. When that happens, the build completes on that revision. The guard can be any of these:
- a stall, including one on a question put to the person;
- the time limit;
- the turns running out;
- the money running out;
- a provider that stopped answering.

The reset rule applies first, as it does for the fallback. A person's cancel still completes on nothing.

### What changed and why

- **`state.ts`: new `latestPass(controller, gate)`.**
  - It returns `{ fallback: { revision, digest, receiptId, candidate, setAside: undefined, latest: true } }` when the latest assembly's standing verdict is yes and the gate's `completion` accepts it. Otherwise it returns undefined.
  - `AutomationStudioProjectSupervisorFallbackFlow` gains `latest?: true`.
  - `completeOnPass` says, for a pass marked `latest`: "The supervisor stopped before completing, so the build completes on revision N, which passed its whole test."
  - The existing words for what stopped the build follow (`FALLBACK_STOP_WORDS`, for example "The build then reached its time limit."), then Core's note of anything still on the target.
- **`supervisor-loop.ts`: the guard path.**
  - It now takes `state.standingRescue(...) ?? state.latestPass(...)`, still only when a guard stopped the loop and the person did not cancel.
  - The latest pass goes through the same branch as the fallback. Core's reset brief runs first (new `LATEST_PASS_RESET_REASON`), except for money, provider and person-question stops, as for any ending. Then the build completes, and the outcome carries `completedOnPass` with `candidate` and `trial` set to that revision.
  - The honest-ending path is unchanged. An ending while the latest passed outright is still refused as too soon, because the supervisor can complete on that revision itself.
- **Headers** in `state.ts`, `supervisor-loop.ts` and the test file say this, citing t611 (a standing pass is Core's evidence however the loop stopped).

### Tests added (`tests/rescued-pass-fallback.test.ts`, now 12)

- **A stall after rev 1 passed outright** (its trial leaves an act; there is a purse). Core's reset brief runs, and nothing is left in place.
  - The outcome is `candidate` on rev 1, with rev 1's yes.
  - `completedOnPass` holds `{revision: 1, why: "stalled"}`, with no `setAside` and no `reliesOnRecovery`.
  - The person is told exactly: "The supervisor stopped before completing, so the build completes on revision 1, which passed its whole test. The build then stopped making progress."
  - No record ending is written.
- **The time limit after rev 1 passed outright.** A second build brief is still working at the work deadline, with `maxMs` 1200 and `endingMs` 600.
  - The run took under 1200 ms and `timedOut` is set.
  - The dispatches were build, build, reset, and nothing is left in place.
  - The outcome is `candidate` on rev 1 with `why: "time"`, and the words end "The build then reached its time limit."
  - No record ending is written.
- **The person's cancel after rev 1 passed outright.** The status is `ended` and the ending is `cancelled`, with no candidate and no `completedOnPass`.

**The tests fail without the change.** With `?? state.latestPass(controller, gate)` removed from the loop, the stall and time-limit tests failed (2 failed, 10 passed). The file was then restored.

### Commands run and observed results

All commands ran in `packages/fluxiq` unless noted, one after another, with nothing heavy beside them.

- `npx vitest run .../supervisor/tests/rescued-pass-fallback.test.ts`: 12 passed.
- `npx tsc --noEmit -p .`: exited 0.
- `npx vitest run src/programs/automation-studio/runtime/project-agents src/programs/automation-studio/runtime/service/project-build`: 56 files and 391 tests passed. No existing test relied on a guard end after an outright pass ending without a Flow.
- `node scripts/structure-audit.mjs`, at the repository root: exited 0, `structure-audit: passed (373 warning(s), 1156 baselined)`. Advisory warnings for the changed files: `state.ts` is 578 lines and `supervisor-loop.ts` is 426 lines.

### Not verified

- No live or Lab run.
- The turns, money and provider stops after an outright pass are not tested on their own. They take the same branch as the stall: `recoveryShortfall` names them, and the branch is shared.
- Where Core's reset undoes the passing trial's own acts, the site no longer shows what that trial did when the Flow is promoted. That follows the brief's "reset rule applies first". The ordinary completion on a yes still sends no reset.
