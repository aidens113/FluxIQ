# t692 keep-all read is a doubt: worker report

Round 1 built the flag and the gate. Round 2 connects them end to end on the Core dev base `f909ce8c`, which includes t691. Round 3 closes the gap round 2 found: a yes is now held to every row of a flagged read (see "Round 3" at the end, which supersedes round 2's gap item).

## Outcome

**Done.** The round-2 gap below is closed in round 3.

Round 2 outcome, as reported then: **done, with one gap you should decide on.**

- The flag now reaches every judge.
- Both ports that answer a builder's test now carry the flag. Each answers the gate's `checkRows` from t691's converse question, so a flagged yes is never left without its check.
- The end-to-end test passes.
- I edited three files outside the extended ownership, all strictly needed (listed under "Open questions").
- **The gap:** a yes that both judge calls give, the second being the converse question, stands even if its reply names none of the extra rows, wherever t691's per-row quote rule does not apply. So t692 alone does not check the reply row by row.

## What changed and why

All paths are under `packages/fluxiq/src/programs/automation-studio/runtime/`.

### Design change from round 1: the check is t691's converse question

You asked that `checkRows` reuse t691's converse question and never ask a second copy of the per-row question.

- Since t691, a build-test yes is two judge calls. The second call asks the converse question (each stored row against the request's words) and sees the flag in `reads`.
- A yes from both calls, the second being the converse, is `firstAskConfirmed`.
- `checkRows` now answers `AutomationStudioSubflowTrialRowCheck = { converse: "confirmed" | "unconfirmed" }`. Ports answer it from the trial's own verdict, with no new judge call.
- In the gate (`flow-bootstrap/subflow-candidate/subflow-trial-gate.ts`):
  - **Confirmed:** the yes stands, and the feedback gets `keptEveryRow` and `rowCheck` ("…so the yes stands").
  - **Not confirmed** (unconfirmed, no answer, a check that throws, or a port with no hook): the trial is unsure under `subflow.trial_rows_unaccounted`. The revision is not closed, and the builder gets the `ROWS_UNACCOUNTED_RETESTABLE` instruction.
  - Round 1's per-row answer shape, the `rows_not_asked` no, and `rowCheckOutcome` are removed.

### Where the flag goes

- **Contract:** `result-verification/contracts/read-account.ts` now has `keptEveryRow?: AutomationStudioResultKeptEveryRow`, and the type lives there. The round-1 intersection types and the `AutomationStudioResultKeptEveryRowCarrier` type in `read-account/` are removed.
- **Summary:** `result-verification/result-summary.ts` passes `flowEdges` to `automationStudioResultReadAccounts`, so every summary built with edges flags the read. Candidate-trial and subflow-trial summaries both pass edges (`service/candidate-trial/summary.ts`).
- **Judge prompt:** `llm/diagnosis-instructions.ts` has one new sentence, with a provenance comment. It is generic and mirrors no scenario: "resultSummary.reads[].keptEveryRow, where present, is Core's flag on a read with no condition that kept every item it saw, run after a step was repeated over the fewer rows its narrowerRead kept: nothing in that read chose which rows the answer holds, so answer yes only if the request's own words ask for each row it stored."

### The partial-trial port (`service/subflow-trial/`)

- `run.ts` (`withRowCheck`): every judged trial carries its flagged reads beside the result, Core-only (`keptEveryRow: [{ nodeId, kept, keptEveryRow }]`). Its outcome carries `rowCheck`, which is `confirmed` only when the verdict is yes and `firstAskConfirmed` is true.
- `port.ts`: keeps each trial's `rowCheck` by its run id and implements `checkRows`. It answers nothing for another build or an unknown run.

### The dispatch wrapper (`project-agents/dispatch/trial-port.ts`)

It now forwards `checkRows`. Without this, every flagged yes on a scoped brief would have become unsure.

### The single-path whole test (`project-agents/single-subflow/`)

- `single-subflow-trial.ts` (`withRowCheck`): reads the flagged reads from the whole test's `feedback.reads[].keptEveryRow` and the confirmation from `feedback.firstAskConfirmed`. It sets both beside the trial.
- `whole-test-port.ts`: removes `rowCheck` from the trial, keeps it by run id, and implements `checkRows`.
- **The channel:** the whole candidate gate keeps only a trial's `feedback`, so the facts must travel there. Two edits make that work:
  - `service/candidate-trial/reads.ts` puts the flag on each read's feedback entry: node ids, counts and Core's sentence, no row. The builder sees it too.
  - `service/candidate-trial/feedback.ts` adds `firstAskConfirmed` to a judged yes's feedback.

### Tests

- **End-to-end:** `project-agents/single-subflow/tests/kept-every-row-build.test.ts`, 3 cases, on a returns desk with no Lab scenario's words.
  - **How it runs:** the supervisor loop on a scripted provider, the real builder gate, the real whole-test port, and the whole candidate gate. Each whole trial is judged by the real `automationStudioBuildTestJudge` (with the converse and t691's rules) over a summary Core builds, and its feedback comes from `automationStudioCandidateTrialFeedback.judged`.
  - **Case 1:** every judge request shows the flag on the last read, and the converse is asked. A yes that never says why the answer holds the 4 returns that were not approved comes back `subflow.trial_not_judged` with `yesUnconfirmed` (t691's stored-row rule holds it). The build does not complete.
  - **Case 2:** when the request asks for every return and the yes names each extra row beside the read that stored it, the test answers `subflow.trial_yes` with `rowCheck` "…the yes stands", and the build completes (`candidate`).
  - **Case 3:** a flagged yes whose converse did not confirm it comes back `subflow.trial_unsure` with `subflow.trial_rows_unaccounted`, and the build does not complete.
  - `tests/gated-single-build.ts` gained a `judged` option so a caller's real judge can supply each whole trial's verdict and feedback.
- **Other new and changed tests:**
  - `flow-bootstrap/subflow-candidate/tests/kept-every-row-check.test.ts`: rewritten for the converse contract, 3 tests.
  - `service/subflow-trial/tests/kept-every-row.test.ts` (new, 3 tests): mocks the trial summary to add one flagged read, then checks that the port carries it and answers `checkRows`.
  - `project-agents/dispatch/tests/trial-port-check-rows.test.ts` (new, 2 tests).
  - Appended to existing files, because their directories are at the 25-file limit:
    - `result-verification/tests/result-summary.test.ts`: a new describe block, 2 tests;
    - `service/candidate-trial/tests/reads.test.ts`: a new describe block, 2 tests;
    - `llm/tests/diagnosis-channel.test.ts`: a new describe block, 1 test.
- **No existing test's expectation changed.**

## Commands run and observed results

- **Re-ran the round-1 checks on the new base first:** a vitest run of the six named directories gave `Tests 3 failed | 1883 passed (1886)`. The 3 failures were all in my own gate test file, because I had already changed the gate's contract. I then rewrote that test (3 passed).
- **Typecheck:** `npx tsc --noEmit -p tsconfig.json` in `packages/fluxiq` gave `tsc exit=0`, before and after the fix-off run. One earlier error, in my new test (an optional type), was fixed.
- **Fix-off run:** I switched off each round-2 piece (flowEdges passing, reads flag, `firstAskConfirmed`, the run.ts row check, port `checkRows`, dispatch forwarding, the prompt sentence, single-subflow `withRowCheck`, whole-test-port `checkRows`) and ran the new tests: `Tests 11 failed | 59 passed (70)`.
  - The 11 failures are every new round-2 test except one.
  - The exception is the guard test "offers none where the brief's port has none", which holds trivially with the fix off.
  - I restored every file and confirmed with grep that no trace of the switch-off remained.
- **Final named vitest scope:** `npx vitest run` on `result-verification`, `flow-bootstrap/subflow-candidate`, `service/subflow-trial`, `service/candidate-trial`, `project-agents`, `service/project-build` and `llm/tests` (I added `llm/tests` because I changed the prompt): `Test Files 288 passed (288)`, `Tests 2358 passed (2358)`.
- **Structure audit:** `node scripts/structure-audit.mjs` failed once: three test directories went past the 25-file limit. After I folded those tests into existing files: `structure-audit: passed (396 warning(s), 1155 baselined).`

## Not verified

- No live run and no real model.
- The end-to-end test's summary is built from a synthetic returns-desk Flow, not from the fixture Flow the supervisor assembled. The real build-test judge, verify, converse, agreement, feedback, whole gate, whole-test port, builder gate and supervisor loop all run for real.
- The whole-candidate gate's own behaviour on a flagged yes is unchanged: only the builder's gate acts on the flag. That covers the single-path case, where the builder's test is the judged run.
- I did not check how the new feedback members (`keptEveryRow` per read, `firstAskConfirmed` on a yes), now shown to builders and the supervisor, affect their prompt size or caching.

## Open questions or contradictions found

1. **Files edited outside the extended ownership, each needed to ship the flag and `checkRows` together on every port:**
   - `service/candidate-trial/reads.ts` and `feedback.ts`: the whole gate keeps only a trial's `feedback`, so this is the only way the flag and the converse confirmation reach the single-path port.
   - `project-agents/dispatch/trial-port.ts`: it dropped `checkRows`.
   - Their tests are appended or new beside them.
2. **The gap (please decide):**
   - The gate takes a yes that both calls gave, the second being the converse, without checking that the reply named each row of the flagged read.
   - t691's quote rule (`request-rows/unquoted-rows.ts`, `stored`) checks this only for rows marked `storedThoughLeftOut`. Those are rows a condition alone left out with their labels sent, found by label in a set whose `processing.passes` names another read.
   - I saw this happen: while writing case 1, the record set had no `processing.passes`, so no row was marked, and the scripted yes that never named the extra rows was taken (`subflow.trial_yes`). With `passes` added, as real record sets carry them, t691 holds it.
   - Rows left out by several conditions together, or by a read that sent no labels, are never marked `storedThoughLeftOut`, so t691's rule never checks them.
   - **Structural fix, in `request-rows/` (not mine):** treat every row of a `keptEveryRow` read as a kept row Core flagged (t663's list in `unquoted-rows.ts`). A yes must then name each one with the request's words beside the read that stored it, so a converse-confirmed yes is also checked row by row.
3. The prompt sentence is in the shared judge prompt, so it reaches the post-run result check as well as build tests. That seems right, since the flag is also in that summary.

## Round 3: every row of a flagged read is a kept row Core flagged

### Outcome

**Done.**

- Every row a `keptEveryRow` read stored is now one of t663's flagged kept rows.
- A yes is held unless it names each row in a sentence that names that read and quotes the request's words. This applies whether or not the converse question confirmed the yes, and whether or not the record set carries `processing.passes`.
- All end-to-end cases pass. One reply was widened to name every row.
- The new feedback members do not push a judge request past the build-test size bound (figures below).

### What changed and why (paths under `runtime/result-verification/`)

- **`contracts/read-account.ts`:** the flag gains `storedIn?: string[]`, the record sets the read stored.
- **`result-summary.ts`** (`withStoredIn`): fills `storedIn` from the run's own record of each set. A set counts when its writers (`summary.nodeIds`) or its passes name the read. Nothing depends on passes: the summarized set drops `nodeIds`, so this is the only point where the link can be made.
- **`request-rows/unquoted-rows.ts`** (owned):
  - New `automationStudioResultKeptEveryRowFlagged(summary)`: one `every_row` flag per set a flagged read stored, carrying every shown row's label.
  - `automationStudioResultKeptRowsUnquoted` now requires, for an `every_row` flag only, that each row is named in a sentence that also names the read by node id. The read may be named in the sentence or in a sentence beside it that lends a quote, as t691's stored rows already are.
  - Why the read must be named: judge 0032's yes lists every row in one sentence beside the bound's quote "at least 5 days overdue". Under t663's rule alone that sentence would have passed.
  - The header documents both points.
- **Needed edits outside the stated ownership** (each one or two lines, saying so as asked):
  - `request-rows/types.ts`: `AutomationStudioRequestRowsKept.kind` gains `"every_row"`; `missing` holds the narrower read's id.
  - `verdict/kept-rows-flagged.ts`: adds `...automationStudioResultKeptEveryRowFlagged(summary)` to the flagged kept rows, so the verdict and the refuted-no re-ask both see them.
  - `verdict/kept-line.ts`: Core's line for an `every_row` flag (a measurement, never a verdict).
  - `refuted-no/recheck-words.ts`: the same in the recheck words. Without it an `every_row` row would have been worded as a missing item phrase.
- **Tests:**
  - `request-rows/tests/unquoted-rows.test.ts`: a new describe block, 3 tests, on the renewals fixture with every set's `processing` removed:
    - the flags list all 8 loans, and an unflagged summary has none;
    - judge 0032's yes, given by both calls with the second the converse, is held (`not_judged`), and the same yes over the same summary without the flag is taken, so this test fails with the fix off;
    - a yes naming all 8 beside `s14` with the request's words is taken, with `firstAskConfirmed`.
  - `project-agents/single-subflow/tests/kept-every-row-build.test.ts`:
    - new case 4: a passless record set and a converse-confirmed yes that lists the returns only beside the bound's quote; it comes back `not_judged` and the build does not complete;
    - case 2's yes now names all 7 rows beside the read, as the rule asks;
    - all 4 cases pass.
  - No other test's expectation changed.

### Commands run and observed results

- **Typecheck:** `npx tsc --noEmit -p tsconfig.json` gave `tsc exit=0`.
- **New tests:** `npx vitest run` on `request-rows/tests/unquoted-rows.test.ts` gave `Tests 14 passed (14)`. On the end-to-end file it gave `Tests 4 passed (4)`.
- **Fix-off run:** with `automationStudioResultKeptEveryRowFlagged` removed from `verdict/kept-rows-flagged.ts`, both files gave `Tests 2 failed | 16 passed (18)`. The 2 failures are the new hold test and end-to-end case 4. I restored the file and confirmed with grep.
- **The seven directories:** `npx vitest run` on `result-verification`, `flow-bootstrap/subflow-candidate`, `service/subflow-trial`, `service/candidate-trial`, `project-agents`, `service/project-build` and `llm/tests`: `Test Files 288 passed (288)`, `Tests 2362 passed (2362)`.
- **Structure audit:** `node scripts/structure-audit.mjs`: `structure-audit: passed (396 warning(s), 1155 baselined).`
- **Request sizes:** measured with temporary `console.log` lines, then the test files were restored.
  - `build-test/tests/request-size.test.ts`: the real-build judge request is 11,158 characters against its 14,000 bound. That matches the figure in that test's own header, so the round-2 and round-3 changes add nothing to that request. Its Flow has no flagged read, and the prompt sentence travels in the instructions, which the bound does not measure.
  - In the end-to-end test, one flagged read's `keptEveryRow` is 1,078 characters of the judge request (the whole request there is 6,176). Even added to the bound's 11,158 build, that gives 12,236, under 14,000.
  - The builder-facing additions (`keptEveryRow` per read entry, `firstAskConfirmed`) are in trial feedback, not in a judge request. The builder's yes evidence in the end-to-end test is 3,045 characters.
  - The prompt sentence adds about 290 characters to the judge instructions. No test bounds those, and the llm prompt tests pass.

### Not verified

- No live run.
- The `every_row` rule reads the rows a summary shows (`sampleRows`). A set with more rows than are shown is held only to the ones shown, as t663's flags already are.
- A flagged read whose stored rows land in a set Core cannot link to it (no `nodeIds` match and no passes) gets no `every_row` flag. It is still covered by the flag in the judge's summary and by the gate's converse check.
