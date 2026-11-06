# Four untrue lines, second pass (t869)

Outcome: Partial. All four fixed with tests; ui-components acceptance passed. Core vitest (act-record, task-memory), Core/contracts/ui-components `check` and the Core audit were NOT completed: the machine ran out of memory (about 500 MB free, other lanes' `next` servers at 2.6 GB) and the runs crawled. Details under "Not verified".

## Each line, before and after

1. Fresh save "Changed something that was already there: <job>".
   - Cause: the by-hand press's answer came with no words for its control (the domain could not name it after the page moved), so `words.ts` fell to the class's line. The control's fingerprint still holds its word.
   - Before: `Changed something that was already there: Customer Success Manager.`
   - After: `Save: Customer Success Manager` (class line only where the fingerprint holds no short word, or the word fails the person-words screen).
   - How: new `act-record/control-name.ts` reads the fingerprint by shape (own top-level words, no structural/positional field, no address, at most 4 words / 40 chars, shortest wins; row words nested in it are not read). `words.ts` takes it as a fourth argument, after the given words and before the class's line, through the same `accepted()` screen. `record.ts` keeps it in memory only (`controls` WeakMap, like an item), so the persisted line holds no page text and `foreseen.test.ts` "holds no words of it in the clear" still stands.
   - Note: I could not see the step log of that run, so "the domain gave nothing" is inferred (the item was named, the control was not). If the real cause is a different one the fallback still gives the true word.

2. "Left out 1 that looked already done" on attempt 1.
   - Cause: `rowsHeldDone()` counted every pass of a forward run over a row the record held done, including a row this attempt pressed by hand. That row was done, not left out.
   - After: `rowsHeldDone()` takes off one for each act this attempt landed itself (not carried, declared, landed) on a left-out row. Rows an earlier attempt did, which this attempt passed over, still count; so does an unpressed twin of an identical row.
   - Files: `record.ts` (`rowsHeldDone`), `rows-left-out.ts` (`holds`).
   - Test change: `skipped-rows.test.ts` "two rows nothing separates" now expects `skippedAsDone: 1` (one of the two alike rows was pressed by hand). `identical-rows.test.ts` earlier-attempt cases now go through `nextAttempt` (seeded, as a later attempt is), and one new test says a row pressed in this attempt is not left out by any route.
   - Note: `SVC/answer-first/attempt/keep.ts` (lane A) is untouched and still takes `max(prior.skippedAsDone, rowsHeldDone())`: fine.

3. "except the one that did "Step 13"".
   - Cause: `left-out-steps.ts` fell back to `Step ${position}` for a step with no words, and quoted any control string, ids included.
   - After: a step is named by its own control words when they read as words (not an address, not one unbroken run holding a digit); otherwise `one step that did something on the site`. The card (`words/left-out-words.ts`) counts such names, and any old stored `Step N`/id-like name, in words and never quotes them: `Saved today: the steps, except one step that did something on the site (it was left out of the Flow).` Mixed: `except the ones that did "Save: Table" and one step that did something on the site (they were left out of the Flow).`
   - Limit: the record holds no link from a draft step to the result's act (the act's `steps` is memory-only), so the act's own line is not looked up; the step's control words are what that line is made of.

4. "checked once" after 2 checks.
   - Cause: the count line text ends `once against what was asked for.` and is written before it is known whether the check is asked again. Written in lane A's `flow-less/judge.ts` line 166 (`, once against what was asked for.`) and spoken in lane B's `completion/check.ts` ("It is what you asked for, checked once.", `input.say("Checked", ...)` after `state.timesChecked += 1`).
   - Card fix: new `words/times-checked-words.ts` (`checkedTimesWords`) turns "once" into the result's own `timesChecked` (1 stays once, 2 "twice", n "n times", 0 no count). `model/result-parts.ts` uses it on the confirmed "Checked:" line. The "Checked: ... N acts" counts are unchanged.
   - Before: `Checked: 5 rows, 3 acts on the site, once against what was asked for.` with `timesChecked: 2`.
   - After: `Checked: 5 rows, 3 acts on the site, twice against what was asked for.`
   - Requirements for other lanes (not edited):
     - lane A, `SVC/../result-verification/flow-less/judge.ts:166`: write the count line without "once" (for example `${got}, against what was asked for.`), since only the attempt knows how many checks answered; the card reads the number from `timesChecked` and keeps the older wording working.
     - lane B, `SVC/answer-first/completion/check.ts` near `input.say("Checked", "It is what you asked for, checked once.")` (line ~123): say the real count (`state.timesChecked`), or drop "once". It is toast/activity text, not the card.
     - `timesChecked` is written at `check.ts:119` (`state.timesChecked += 1`) and kept by `attempt/keep.ts:58`. It counts judge answers that are yes/no/unsure; a yes refuted for its citation and re-asked inside the judge is not counted (3 answers, 2 checks), which is what a person calls 2 checks, so no change is needed there.

## Files changed

Core, `packages/fluxiq/src/`:
- `runtime/answer-first/act-record/control-name.ts` (new), `index.ts` (barrel), `words.ts`, `record.ts`, `rows-left-out.ts`
- `runtime/answer-first/act-record/identity/target-keys.ts` (not on my owned list, not on the must-not list: only `export` added to `POSITIONAL_FIELD` and `STRUCTURAL_FIELD` so the control name reads the same fields the identity does; lane B should be told)
- `framework/automation-service/service/answer-first/task-memory/left-out-steps.ts`
- Tests: `act-record/tests/control-name.test.ts` (new), `act-record/tests/identical-rows.test.ts`, `act-record/tests/record.test.ts`, `act-record/gate/tests/act-gate.test.ts`, `task-memory/tests/left-out-steps.test.ts`, `service/answer-first/tests/skipped-rows.test.ts`

ui-components, `packages/ui-components/src/chat/answer/`:
- `words/times-checked-words.ts` (new), `words/index.ts`, `words/left-out-words.ts`, `model/result-parts.ts`
- Tests: `tests/times-checked.test.ts` (new), `tests/left-out-words.test.ts`

Test expectations I changed because the old rule they encoded ("a press's control name is never used") is now the lead's call: `record.test.ts` "generic line for words it refuses" (now "Save it" where the fingerprint holds a word) and `act-gate.test.ts` "takes words only from wordsOf".

## Commands run and observed

- ui-components `vitest run src/chat/answer src/testing/results --exclude "**/.tmp/**" --minWorkers 1 --maxWorkers 2`: 9 files, 92 tests passed (run before the Core edits; it does not touch Core).
- Core `act-record` (first run, before the rows rule was refined): 11 failures, all from the words rule and the first, coarser rows rule; fixed as above. After that: `identical-rows`, `record`, `control-name`, `gate`: 4 files passed, 61 tests, then `record` alone 26 passed. `skipped-rows` failed once on the coarse rule (the expectation change above) and was not re-run to the end.
- `pnpm.cmd --filter fluxiq --filter @fluxiq/contracts --filter @fluxiq/ui-components check`: contracts Done; fluxiq FAILED with 3 type errors, all in my new `control-name.test.ts` (outcome `words` needs both `what` and `where`). Fixed afterward; not re-run.
- The full act-record plus task-memory run, and `skipped-rows` after it, were still running (17 of 24 files passed, no failure seen) when I stopped waiting.

## Lab reader

`packages/test-runner/src/attempt-lane/live/{answer-turn-dom,shown-answer}.ts` (extension): `answer-turn-dom.ts` reads `.answer-site > .answer-line` into `siteTitle` as data; nothing there matches the words changed here (checked-line, left-out line, act lines). Not edited, still reads what it read.

## Not verified

- Core vitest to the end for `act-record` and `task-memory`; `skipped-rows` after the rows refinement; `carry-on.test.ts` (reads `skippedAsDone`); the three package checks after the test-file type fix; the Core structure audit (`node scripts/structure-audit.mjs`). The new files are small and one-thing, barrels updated, tests in `tests/`, but the audit was not run.
- No browser, no live run: whether the real run's control word is in the fingerprint is inferred.

## Open questions

- The fallback names a control by the shortest short word of its fingerprint; a control whose shortest word is not its label (an icon with an aria title) would be named by that word. It is screened as person words, but it is page text.
