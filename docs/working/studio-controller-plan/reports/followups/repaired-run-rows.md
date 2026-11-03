# Repaired run rows (run-mw0jw263-0251c104, cause 4)

## Outcome

Done. The original cause, the five follow-up defects and the four decisions from the lead's last message are all implemented, each test was seen failing first, and the docs are updated. Nothing is committed. Nothing has run live, as the brief required, so none of this has been seen on the real task.

| # | Defect | Result |
| --- | --- | --- |
| 0 | Repaired run's rows wrong (13 rows, wrong order) | Fixed |
| 1 | A patch that passed its trial was thrown away | Fixed: it reaches a judged run, and is kept only if that run answers |
| 2 | Row markers from a replaced pass could show a different row | Fixed |
| 3 | A failed step's trial left unjudged rows | Fixed: its rows are held until a retry takes the trial up |
| 4 | In-run repairs left rows from the unit they replaced | Established and fixed |
| 5 | `recording-stream/tests/store.test.ts` failure | Reproduced on run 2: a real timeout. Fixed by item 9 |
| 6 | Docs | Updated |
| 7 | A re-authored Flow's re-run repeating a lasting act | Fixed: declined, same code |
| 8 | A Core-computed no skipping the re-author route | The route was wrong. Fixed |
| 9 | Timeouts | Real-SQL files now run on 60 s; both per-test overrides removed |
| 10 | Target override route, concurrent first batches | Tested. Concurrent batches were a real defect, now fixed |

## The original cause

Rows were written under the run's id by something other than the pass the run is judged on.

1. **The saved run's path.** The patch ladder's trial ran inside result verification with the run's own record hook. The first pass's 3 rows were processed and refuted. The trial's 10 rows then cleared that answer, nothing processed the dataset again, and readers got the raw 3 then 10.
2. **A real re-run from the start.** It appended to the pass it replaced. Dedupe keeps each row's first position, which gives expected rows 7-9 first. A wrong row from the replaced pass stayed and was judged again, so a correct repair could be refuted a second time. The chain test missed this because it declares `replace`, while built Flows declare `append`.

### How the saved run proves it

Counts and closed codes only, from `lab-runs/2026-11-03/run-mw0jw263-0251c104`.

| Evidence | Observed | What it shows |
| --- | --- | --- |
| `evaluation.json` extraction | `observedRecords: 13`, `matchedRecords: 0`, `matchedInAnyOrder: 10`, no `collectedRecords` | The lane reports `collectedRecords` only with a processing account, so the dataset was unprocessed when read |
| Control run `run-mw0l0e9y-a7d8ae51` | `observedRecords: 10`, `collectedRecords: 10` | The field is present on a processed run |
| `flow-lane.json` `reads`, `run.json` actions | One extract attempt, `recordCount: 3` | 10 of the 13 rows have no attempt on the run's record |
| `logs/core.log`, `steps/` | Steps 0058-0060 fall between `patch-ladder start` and `patch-ladder end`, and no run step follows | The second read ran inside the ladder, and no re-run followed |
| Steps 0042 and 0059 `call.json` | Identical `parameters` and `outputId` | Same schema, so no stored-key difference |

The debug note's reading, "the 3 rows of the failed attempt, then the 10 of the repaired read", holds. Rows 10-12 are repeats of expected rows 7-9, because the oracle's pairing lets each observed row answer only one expected row. Running its two passes over labels on `[e7, e8, e9, e0..e9]` printed `[3,4,5,6,7,8,9,0,1,2]` with positions 10, 11 and 12 unanswered. The bundle holds no row values, so this comes from the pairing, not from comparing rows.

Possibilities ruled out: `processEndedRunDatasets` swallowing an error (no processing call was made after the trial), and differing stored keys (same parameters, `unexpectedFields: 0`).

## What changed and why

### 0. Repaired runs' rows

- A refuted run's ladder trial stores no rows (`AutomationStudioRunDatasets.trialOptions`). The first-pass answer stands if nothing re-runs: your decision as lead.
- A repair's re-run from the start replaces earlier passes (`restartedPass`, with the store's `startsOver`). Each dataset's first batch clears it and takes on that batch's schema and declaration. A re-run that succeeded removes datasets it did not write.

### 1. A correct repair discarded

**Why it got no re-run. Four separate things stopped it:**

1. `runtimePatchVerification` gave `awaitsJudgedRun` only to `temporary_target_override`. An inserted-steps trial with nothing declared to prove it ended `unverifiable`, `no_evidence`. The promotion gate then refused it ("Adaptation must pass validation before promotion"), so `automationStudioRunHasUntriedPatch` was false and no re-run followed. The service test recorded exactly this: `no_expectation_declared`, `autoApply: false`, `not_rerun`.
2. Lifting that alone would have run the wrong Flow. The patch's change kind was `edit_recovery`, which carries no steps and which `automationStudioJudgedPromotionCandidate` skips, so the re-run would have run the Flow without the fix.
3. A judged yes could not keep it either: `edit_recovery` has no durable applier.
4. On a failed step, `retryOriginalAction` was always false for inserted steps, so `decideAutomationStudioAdaptiveRetry` read "nothing asked" and the run ended failed.

**The fix:**

- Inserted steps that passed their trial now take `awaitsJudgedRun` (`runtime/adaptation/live-patch.ts`).
- Their change kind is a new unit repair, `insert_steps`, gated like `replace_unit`. It carries its steps, so the candidate and the apply write the same steps the trial ran, through the same overlay.
- On a failed step, the run resumes after the last inserted step (`changedNodeIds` now names them all), so they are not taken twice.
- A refuted run re-runs from the start and that pass's rows are the answer.

**Verification is not weakened.** The marker passes nothing: only the judged run's yes keeps the patch. A trial that fails stays discarded. Both have tests.

**Lasting acts.** A re-run from the start has no ledger of what the first pass completed, so it would repeat every act. A patch's re-run is now declined with `repair_rerun.lasting_act_may_have_landed` when the first pass ran a step that states a lasting consequence, when an outcome stayed uncertain, or when an inserted step declares one (`flow-change/lasting-acts.ts`). Inserted steps that acted lastingly in their trial get no marker and no resume.

"States" is deliberate. Every web press floors at `commit` by verb, so reading the floor would refuse a re-run of every Flow that presses anything, the saved run included. The check reads what the step declared, its explicit marks, and permission consequences. A press with no declaration that does something lasting would not be caught, which is the same limit the permission system has.

This reverses an earlier agent decision in `step-insert.ts`, which folded a durable form into the extend build and called this kind "trial only". It was an agent's call, not the user's, and it is what left a working repair with nowhere to go. A durable insert now exists beside the extend plan, on a judged whole run only.

### 2. Stale row markers

`step-rows.ts` now reads markers back only for the last pass from the Flow's start. An earlier pass's marker is named by its place (`row 2 collected into requests`), as the file already does when a row cannot be said for certain. Only `step-rows.ts` and its test changed. A route back to the entry mid-run only costs a row its name; it can never show a wrong row.

### 3. A failed step's trial

The trial's rows are held in memory (`heldTrial`). They join the run, ahead of the retry's own rows, only if a retry takes the trial up. A trial that failed gives its rows up as it ends, through the new `trialRecordBatches` option that `patches.ts` calls. If no retry takes it up, they leave. Rows are held rather than stored and removed because a `replace` output's batch would already have cleared what it replaced. This path is narrow: a run that can hold in place repairs in-run instead. The tests reach it with a step whose item is gone, which gets no in-run ask.

### 4. In-run repairs

**Established:** a part re-attempted after a repair runs under new attempt ids, so its keys differ (`call.attempt.3/inner.attempt.2`, then `call.attempt.4/inner.attempt.2`). With the fix off, the stale and new rows both stayed. A changed schema failed the re-attempt outright.

**Fixed:** when a fix is held, the executor removes what the failing unit stored, called attempts included (`discardRecordBatches`, `store.discardBatches`). A dropped fix removes its trial's rows too. Rows of other steps stay, an earlier loop pass of the same step included. A dataset left with no batch is removed, so the fix may store another schema.

### 5. The test failure

**Seen on run 2 of the repeat loop, with its error kept:** `Error: Test timed out in 15000ms` at 15629 ms. The loop completed 3 runs before the fix: 2 passed and 1 failed.

**Cause:** the test makes 40 appends, each its own durable commit, under the 15 s default. A probe with the CPU at 99% measured appends flat at 30-536 ms, about 230 ms each, 9079 ms in total, plus 1092 ms for the first list. There is no growth with history, so this is not a product slowdown and no ordering is involved. The assumption that broke is that 40 durable commits fit in 15 s while other suites run.

**Fix:** the real-SQL timeout in item 9, which replaced this test's own. With a 60 s timeout on the test, 14 further runs passed with other lanes running. The probe file is deleted.

### 6. Docs

Updated `automation-studio-native-nodes.md` (around line 419: what each kind of repair writes), `automation-studio.md` (the judged-promotion steps, the lasting-act decline, `insert_steps`) and `package-boundaries.md` (`awaitsJudgedRun`, `retryOriginalAction`, `insert_steps`).

**A second test hit the same limit.** While re-running the acceptance checks, `gateway-trace-rekey/tests/rotation.test.ts`, "keeps two projects apart", failed with the same `Test timed out in 15000ms`, at 15413 ms. It builds two whole migrated projects, and it took 13268 ms even when it passed. Item 9 covers it too.

### 7. A re-authored Flow's re-run

The check now applies to every re-run from the start, read against the graph the first pass ran, not a held edit's. When a step that states a lasting consequence ran, or an outcome stayed uncertain, the re-run is declined with `repair_rerun.lasting_act_may_have_landed`, as the patch route is. With the check off, the service test pressed the lasting step twice; with it on, once.

**What the person sees.** The run ends failed, on the answer that was judged, with its rows processed. The line reads: "it saved 3 rows, but the check found they don't answer what you asked, and the fix wasn't run: that would repeat what this run already did." Before this wording it said "the fix didn't finish", which was untrue, so I changed `automation-activity/wording/run-ending.ts`. If a Core-computed no refuted the run, the line stays what Core found, as that file already does for those, and says nothing of the fix.

**What happens to the re-authored Flow.** It is not kept. The held edit is rejected with `notAppliedReason: "not_rerun"`, so it blocks no later build, and the stored Flow is unchanged. A person's next run is the old Flow, so the same wrong answer can come back and be repaired again.

**A judged run from just after the last lasting act does not exist as a path, and I built none.** A resume needs a trial's resume point in the graph that ran, and only the patch ladder's failed-step route writes one. A re-authored graph has no such point. In-run repair does hold in place after completed acts, but only at a failing step, not after a refuted answer.

**Reach, and a limit of the service test.** With a *declared* consequence, a re-author build usually stops earlier. It must carry that step, and carrying it needs a replay back to the step's start plus the consequence allowed; against the test's stand-in domain it ended `rerun_place_unreachable` then `bootstrap.step_permission_required`, with no edit and so nothing to decline. So the service test marks the step `effect: "mutate"`, which the same check reads, and `repair-rerun.test.ts` covers the declared form at the re-run itself. Whether a real domain's replay lets a declared step through to this decline has not been run.

### 8. A Core-computed no and the re-author route

**The route was wrong.** `computed-no.ts` says a repair reads this no exactly as a judge's, and it writes the same verdict with the same directive and located defects. The route's refusal is documented as "failed for something other than its answer", and this no is about its answer. The route compared one code only. I found no statement that the skip was deliberate, and the ladder it sent these runs to cannot add a missing step.

`automationStudioRefutedResultReauthorDecision` now takes both codes, under the same purse and attempt limits, and a test holds the new constant to the code `computed-no.ts` actually writes. So the saved run's kind of refutation now goes to the re-author first; the ladder follows only if that build ends before its first decision with its cost known, or for refutations the route still refuses. The ladder tests therefore have the route say no, once, through a mock.

A comment in `run-ending.ts` said "nothing was being fixed" for this no. That was already untrue, since a repair is entered for every refuted run, so I corrected it. The sentence a person reads there is unchanged.

### 9. The real-SQL timeout

Real-SQL files now run on 60 s against 15 s (`REAL_SQL_TEST_TIMEOUT_MS`), sized from the measurements above: about 15.6 s when the store test failed and 13.3 s when the rotation test passed, so four times the default leaves room and a hung test still fails. It is in the group's config. A plain `vitest run <path>` has no group, and both failures were in plain runs, so the setup file also sets it for any file with the marker. Both per-test overrides are gone.

**It taking effect**, with a temporary test sleeping 16 s, then deleted:

```text
× tests/t848-plain.test.ts > sleeps past the default 15013ms
  → Test timed out in 15000ms.
✓ tests/t848-marked.test.ts > sleeps past the default 16012ms
```

`tests/real-sql-timeout.test.ts` and `tests/test-groups.test.ts` pin both sides. Reading the running timeout uses vitest's internal `__vitest_worker__`, because `context.task.timeout` does not exist in this version: my first form of that test passed on `undefined`, before the constant existed.

### 10. The target override route, and concurrent first batches

**A correction to my last report.** I said the decline "also applies to a held target override". A real refuted run cannot hold one: the plan refuses it (`failure_not_target_repairable`), and a service test now pins that. The real route for a held override is a failed step, which *resumes* and repeats nothing. So:

- The service test drives that route: first pass with a lasting step, override held, resume, judged, kept. The lasting step is pressed once.
- The decline on an override's re-run from the start is tested at the re-run (`repair-rerun.test.ts`), with nothing dispatched. It guards a path no real run reaches today.

**Concurrent first batches were a real defect.** With two batches in flight the first could clear the second: the test got `[A]`, not `[A, B]`. Batches now store one at a time, in the order they came. The test holds the first batch back until the second is stored, or for a second at most. The queue means the second never starts first, so the passing result does not depend on timing; only how quickly the old failure showed did.

## Commands run and observed results

All in the Core worktree. The checks ran on the final code; the only edit after the type check and audit was this report.

**Seen failing first** (`pnpm.cmd exec vitest run <file> --minWorkers 1 --maxWorkers 2` in `packages/fluxiq`):

| Item | State when it failed | Observed |
| --- | --- | --- |
| 0 | Before any fix | `Tests 3 failed (3)`; the saved run's shape: 13 rows in the order 7, 8, 9, 0..9, no processing account |
| 1 | The `awaitsJudgedRun` widening turned off, the other fixes in place, then restored | `Tests 3 failed \| 3 passed (6)`; `expected undefined to match object { attempted, status }` for `repairedRerun`. The test that a failed trial stays discarded passed, as it should |
| 2 | Before the fix | `Tests 2 failed \| 5 passed (7)`; a replaced pass's marker read back as the re-run's row |
| 3 | The hold turned off, then restored | `expected [ { name: 'listing-0' }, …(9) ] to be undefined` |
| 4 | The discard turned off, then restored | `expected [ { name: 'before-part' }, …(4) ] to deeply equal [ { name: 'before-part' }, …(2) ]`; a changed schema: `expected 'failed' to be 'succeeded'` |
| 5 | Before the fix | `Error: Test timed out in 15000ms`, on run 2 |
| 7 | The check limited to patches again, then restored | `expected [ 'order', 'order' ] to have a length of 1 but got 2`; at the re-run: `expected { session, flow } to deeply equal { declinedCode }` |
| 8 | Before the fix | `expected { routed: false, … } to match object { routed: true, applied: true }` |
| 9 | Before the fix | `actual value must be number or bigint, received "undefined"` |
| 10 | Before the queue | `expected [ { title: 'A', price: 1 } ] to deeply equal [ { title: 'A', price: 1 }, …(1) ]` |

For items 1, 3, 4 and 7's service test the fix was already written when I saw the failure, so I turned it off to see the test fail. The item 3 test "joins the run when a retry takes it up" failed at that point because of item 1's retry rule, not the hold, so the hold's own failing-first evidence is the decline test.

**Final checks:**

| Command | Observed |
| --- | --- |
| `packages/fluxiq`: `pnpm.cmd exec vitest run src/framework/automation-service/service/datasets src/framework/persistence/automation --minWorkers 1 --maxWorkers 2` | `Test Files 108 passed \| 2 skipped (110)`, `Tests 701 passed \| 4 skipped (705)`, exit 0 |
| Beside the changed code, same flags: `tests/real-sql-guard`, `real-sql-timeout`, `test-groups`, `vitest-config`, `src/runtime/adaptation`, `automation-activity/wording`, `judge-sees-each-row`, the `live-patch` tests, `tests/refuted-result`, `tests/in-run-repair`, `tests/service-adaptation`, `training-modes`, `service/adaptations`, `service/runtime-adaptation`, `service/runtime-session`, `executor/lifecycle-run`, `engine/automation/lifecycle-run`, `engine/automation/records`, `runtime/conversations/commands` | `Test Files 1 failed \| 190 passed (191)`, `Tests 1 failed \| 1937 passed (1938)`. The one failure was my new wording test: the sentence was 167 characters against the 160 limit |
| After shortening that sentence: `src/runtime/automation-activity/wording` and `repaired-run-rows.test.ts` | `Test Files 20 passed (20)`, `Tests 210 passed (210)`, exit 0 |
| Root: `pnpm.cmd --filter fluxiq check` | `check exit=0` |
| Root: `node scripts/structure-audit.mjs` | `structure-audit: passed (486 warning(s), 1098 baselined).`, exit 0 |
| `recording-stream/tests/store.test.ts`, repeated with its 60 s timeout | 14 runs, all exit 0 |

The acceptance run and the sibling run came before that sentence was shortened, which changed one string and its two tests. Those two test files were re-run after it.

**A mistake of mine, which you should count.** My first sibling run passed the filter `tests`, which vitest matches against every path, so it started the whole package. I noticed after about 45 minutes and stopped it, at 736 files passed and the one wording failure above. It should count against the twice-a-day allowance for full suites, even though it did not finish.

## Not verified

- No live, Lab or browser run, as required.
- **Whether the fix would have rescued the saved run.** Its inserted navigate first answered `web.intervention.required`, and the bundle does not record the trial's verdict. If that attempt counted as failed, the trial is `contradicted` and stays discarded. The service test proves the path for a trial that passes.
- A real domain's replay of a re-author carrying a *declared* lasting step (item 7).

## Open questions and contradictions

1. **A declined re-author has already spent its build.** The check runs at the re-run, so a build that cannot be run is paid for first. The same check could run before the build and save that money, but it would have to read the first pass's graph inside the repair port. That is more than you asked for, so I left it. I recommend it.
2. **A read's own target override is still thrown away on a failed step.** When the override is on the read itself, its trial is `verified` by the rows it read but not resumable, as the rows' seam counts as unknown (`records_minimum_undeclared`, `check_unknown`), so the run ends failed. That is the same kind of loss as item 1, and `resume.ts` documents the fail-closed rule as deliberate. Seen in a test run and not changed. It only reaches this path where in-run repair cannot be asked.
3. **Other refutations still go to the ladder.** I checked only the computed no against the route. Core has other refusing codes, such as `core.result.change_not_proven`, and I have not assessed them.
4. **A project rule and this change.** Core's `AGENTS.md` says of the real-SQL marker "Never raise a timeout instead". The change keeps that sense: the marker is still required and earns the longer timeout. `code-structure.md` said "never raise their timeout" outright, so I reworded it. That line came from an agent's commit (`d73bcc37a`), and I found no statement of it from the user. I did not edit `AGENTS.md`; you may want to.
5. **A dropped in-run fix leaves the run with fewer rows than it had,** since the unit's first rows are removed when the fix is held. The run ends failed either way.
