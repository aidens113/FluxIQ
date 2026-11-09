# Lane A: dataset 4 vs 28, and evidence kept after a later throw

Worker report for run-mw43h5ew-a04a583d. Both repositories are on task/t875-live-breadth-a. Nothing was committed.

## Outcome

Done. Core was wrong. The attempt's row said 4 rows, but its dataset was serving 28 unprocessed collected rows. That happens whenever the attempt parks for a person. The Lab read the right dataset; it was only the Lab's error message that blamed the wrong side. Both defects are fixed and each fix has tests.

## The cause of 4 against 28

1. **What the 28 are.** In this run the read node declares `process: { dedupe: { by: [name, role, branch] } }`, which drops repeated whole rows (step 0012 `call.json`). Each replay's Load more read returns the list built up so far: 1 row, then 2, 3 and 4. The sink appends every row of a read that only adds rows, not just the new ones (`answer-first/rows/row-sink.ts:148`, `:157`). The store keeps every batch until the dataset is processed (`persistence/automation/project/run-dataset-store.ts:240`).
   - Collected from the step logs (shapes only, no values): step 0012 = 1; replay 1 (0018, 0020, 0022) = 2+3+4; 0031 = 4; replay 3 (0043 to 0049) = 1+2+3+4; 0056 = 4. Total 28.
   - Processing that dataset gives 4.
2. **The store does not contradict itself.** Its `recordCount` and `getPage` both switch on `processed_at_ms` (`run-dataset-store.ts:605`, `:521`, `:319-341`).
   - Unprocessed: count 28, page 28.
   - Processed: count 4, page 4.
3. **Where the 4 came from.** It is the attempt record's `result.rows.totalRows`. The Lab passes it to `readRunDatasets` as if it were a store summary (`test-runner/src/attempt-lane/live/attempt/stage.ts`, old line 13). The record is written by `automationStudioAnswerFirstKeep` from `run.sink.summary()`, which is the sink's own deduped account (`answer-first/attempt/keep.ts`).
4. **Why the dataset was never processed.** The live chat has a person to ask, so the last rung of loop detection went through `askedToStop` (`answer-first/attempt/rounds.ts:80`, `:122-132`). That writes the row as `waiting_for_person` / `stuck_in_a_loop` (`:125`) and then parks with no clock and the session still open.
   - Only an ending processes datasets: `ending.ts:37-38` calls `endedSession` and then `readBack`, and the reader processes only `if (sessionEnded)` (`run-attempt.ts:163`).
   - The Lab treats `waiting_for_person` as the end, so it read a dataset that was still raw.
   - The same mismatch shows in the Data window and in exports for as long as the person does not answer.
5. **Verdict.** This is a Core defect: a resting row names a dataset that does not serve what the row says. The Lab read the right dataset (the one the result names), but its message said "Core stored 4", which wrongly made the 4 sound like the store's count.

## What changed and why

**Core, `packages/fluxiq/src/framework/automation-service/service/answer-first/attempt/`**
- `keep.ts`: when the row being written is a wait (`run.waitingFor` set), the row is written first and then the run's datasets are processed with `processEndedRunDatasets` (best-effort, the same call an ending uses). The next read's batch makes the dataset unprocessed again (`run-dataset-store.ts:240`), and the ending processes it once more.
  - The row is written before processing because a first version that processed first failed `person.test.ts` › "a permission › allowed continues in place". That test reads the row as soon as the ask shows, and processing delayed the write.
  - Processing cannot change the row's contents: they come from the sink.
  - The stuck question awaits `keep`, so the dataset is processed before the person is asked.
- `tests/keep.test.ts` (new, real-sql): two reads of the same 3-row list, then the attempt gets stuck and asks. While it waits:
  - the row says 3;
  - `getRunDatasetPage` serves 3 rows, with `recordCount` 3 and processing `collected 6, duplicates 3, kept 3`.
  - With the fix switched off, the test fails with "expected [ …(6) ] to have a length of 3 but got 6". That is the 4 vs 28 bug in small.

This edit is in `attempt/`, not in the store or its handler. I judged that the store and its handler were correct and the defect is in what writes the row, so `keep.ts` is the file my trace led to. I did not touch `completion/**`, `flow-less/**` or `result-verification/**`.

**Lab, `packages/test-runner/src/attempt-lane/live/`**
- `attempt/stage.ts`: a mismatch now reads "The attempt's result says its dataset holds N row(s), and Core's dataset served M". Its details add `countFrom: "attempt_result"`, `attemptId` and `datasetId`. Category stays `runtime.behavior`.
- `attempt/kept-whatever-scored.ts` (new, exported from the barrel): runs the scoring. If scoring throws, it runs `keep`, logs any failure of `keep` itself, and rethrows the scoring's own error.
- `live-driver.ts`: scoring (`judgeAttemptAnswer`, which reads the dataset) used to run before `onEnded`, so a throw skipped `site.json`, the picture and `answer-turn.json`. Now `onEnded` runs whatever the scoring throws.
  - If the site cannot be read after a failed scoring, `site` is `{ unread: <reason> }`, never a guess. I first used `.catch(() => null)`, which the structure audit's `failure-as-empty` rule rejects.
- `run-attempt-command.ts`:
  - `onEnded` records the ended attempt before taking the picture.
  - Any throw other than AttemptProofStuck or AttemptScriptRefused now calls `writeUnscoredAttemptEvidence`, prints a `[attempt] … the run failed, and …` line, and rethrows. The CLI still prints the RunnerFailure and exits 1.
  - `recorded` tracks whether the full `attempt.json` is already written, so it is never overwritten.
- `unscored-attempt-evidence.ts` (new): for each attempt that ended it writes:
  - `attempt.json` with `notScored {name, category, message}`, attempt, result, saved, budget, cache, model calls and site;
  - `attempt-report.txt`;
  - for a paid run, `writePaidAttemptBundle` with verdict `failed` and the spend Core recorded for the attempts that ended, which gives the ledger a runId, verdict and cost.
  - If no attempt ended, it writes nothing, as before. In that case there is no spend Core recorded to put in the ledger.
- Tests (new):
  - `attempt/tests/kept-whatever-scored.test.ts` (3)
  - `attempt/tests/stage.test.ts` (3)
  - `tests/unscored-attempt-evidence.test.ts` (4). It reads the bundle back with the ledger's own `scripts/lab/live-guards/run-outcomes.mjs` and gets the runId, verdict `failed` and cost 0.54, or 0.75 summed over two attempts.

## Commands run and observed results

- `npx vitest run …/attempt/tests/keep.test.ts` (Core): 1 passed. With the fix switched off: failed, "expected [ …(6) ] to have a length of 3 but got 6". Fix restored.
- First version (process, then write the row), running `npx vitest run …/attempt/tests …/tests/endings/tests/person.test.ts …/stuck-with-nobody.test.ts`: 44 passed, 1 failed (person.test.ts "a permission › allowed continues in place": status `working`, expected `waiting_for_person`). Fixed by writing the row first.
- After that fix, the same set plus `…/tests/identical-rows.test.ts`: `Test Files 12 passed (12)`, `Tests 52 passed (52)`, exit 0.
- `pnpm --filter fluxiq check` (Core typecheck): passed (`fluxiq:check` built, no errors).
- `pnpm --filter @fluxiq/contracts --filter fluxiq --filter @fluxiq/client-gateway-websocket --filter @fluxiq/ui-components build`: Done, after the final Core edit.
- `node scripts/structure-audit.mjs` (Core): `passed (530 warning(s), 1097 baselined)`.
- `pnpm --filter @fluxiq-web-extension/test-runner check`: passed after one fix (TS2345 on `activity` typed as unknown at live-driver.ts:188).
- `pnpm --filter @fluxiq-web-extension/test-runner build`, then `node --test "dist/attempt-lane/live/**/*.test.js" "dist/attempt-lane/tests/*.test.js" dist/flow-lane/tests/run-datasets.test.js`: `tests 66, pass 66, fail 0`. The 10 new tests pass on their own as well.
- `node scripts/structure-audit.mjs` (extension): first run failed `failure-as-empty` at live-driver.ts:159. After the fix: `passed (244 warning(s), 552 baselined)`.
- Scripted proof, `FLUXIQ_LAB_INSTANCE=t875-proof FLUXIQ_TEST_ENV_FILES=none pnpm lab attempt company-website --task company-website-apprentices --authoring-mode answer-first --scripted-model`: exit 0, `{"status":"passed","answerVerdict":"right","ended":"achieved"}`, "4 rows stored, 4 shown". Evidence is in `test-runs/instances/t875-proof/attempts/run-mw45oand-b6d52759`.

## Not verified

- **No paid run.** I have not seen the live company-website-apprentices attempt park as `stuck_in_a_loop` and then serve 4 rows from its dataset. The Core test proves this path through the real service and SQL store with a scripted model.
- **The live store from the failed run is gone.** `.attempt-work` was empty, so the 28 comes from the step logs and the store code, not from that run's project.sqlite.
- **The failure path of `live-driver.ts` has no end-to-end proof.** I verified it through `keptWhateverScored`'s tests and the typecheck only. No scripted run made the dataset read throw, and the proof covered only the success path.
- I did not run the full suites (`pnpm check`, `pnpm test`, Core's whole vitest run), by the twice-a-day rule.

## Open questions or contradictions found

1. **The row and the store can still disagree when two reads of one dataset declare different processing.** The store keeps the first processing it was sent (`held.sent`), while `summary()` and `readBack()` apply the latest declared one (`held.process`, `row-sink.ts:176-177`, `:227-229`). In that case the row's `totalRows` would still differ from what the store serves, even after an ending. I did not change this; it needs a decision on whether the store should take the latest processing.
2. **Datasets are now processed at every wait, including permission and model-key waits.** These are short. Processing is idempotent and the next batch undoes it, so I saw no harm, but it is extra SQL work at each wait.
3. **Should the Lab still treat a run with no ended attempt the way it does today?** In that case no paid bundle is written, so the ledger has no run id for it, as before. Writing one would need a spend figure from the step log, and a verdict `failed` would bring in the ledger's rule that refuses relaunching a task on unchanged source after a failure. That is the supervisor's call.
4. Unchanged and out of scope: cause 2 in the debug note (a citation-refuted yes refused for ever as `same_evidence`) is still open with the lead.

```text
Outcome: Done
Changed: Core packages/fluxiq/src/framework/automation-service/service/answer-first/attempt/keep.ts, .../attempt/tests/keep.test.ts (new); extension packages/test-runner/src/attempt-lane/live/{live-driver.ts, run-attempt-command.ts, index.ts, unscored-attempt-evidence.ts (new), tests/unscored-attempt-evidence.test.ts (new)}, live/attempt/{stage.ts, index.ts, kept-whatever-scored.ts (new), tests/kept-whatever-scored.test.ts (new), tests/stage.test.ts (new)}
Validation: Core vitest (attempt/tests + endings person/stuck + identical-rows) -> 52/52 passed; keep.test fails 6 vs 3 with the fix off; fluxiq check -> pass; test-runner check -> pass; Lab node --test -> 66/66; both structure audits -> passed; scripted proof -> exit 0, passed, 4 stored, 4 shown
Not verified: a paid live rerun; the failed run's store itself (deleted); live-driver's failure path end to end (unit-tested through keptWhateverScored only); full suites
Report: C:/Users/osrs_/FluxStuff/fxwork/t875/!FluxIQ/docs/working/answer-first-plan/reports/live/lane-a/dataset-and-evidence.md
Notes: The Core fix is in attempt/keep.ts (what writes the row), not in the store, which was correct; flag if attempt/ is outside the lane's ownership.
Open: the row and the store can still differ when reads of one dataset declare different processing (row-sink sent vs process).
```
