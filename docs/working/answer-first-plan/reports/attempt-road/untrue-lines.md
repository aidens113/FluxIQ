# Four untrue lines (t869)

Outcome: Done. Nothing committed. No paid call, no browser, no dist rebuild.

## Each line, before and after

1. Run again note. Cause: `answer-model.ts` said "Running this again may repeat what was done on the site." whenever a lasting act existed. The act record's class cannot tell a count (cart items) from a state (a saved item): the fixture and the real Save are both `modify_existing`. So the line now says both, each only as far as it holds.
   - Before: "Running this again may repeat what was done on the site."
   - After: "Run again does the task again. Something already in the state you asked for is checked, not done again, but a count on the site, such as items in a cart, can go up again."
   - Files: `chat/answer/words/repeatable-acts.ts` (new), `model/answer-model.ts`.

2. "3 acts on the site". Cause: carried acts are in the result's `acts` as state `landed`, marked only by the words Core's `carried-words.ts` puts on `what` ("Already done earlier: ..." / "May already be done: ..."). The judge's counts line and the card's "What I got" both counted every act.
   - Judge before: "Checked: 5 rows, 3 acts on the site, once against what was asked for."
   - Judge after: "5 rows, 3 already done earlier, once ..."; with one new act: "1 act on the site, 1 already done earlier".
   - "What I got" before: "3 things done on the site". After: "3 things already done earlier", apart from "N things done on the site".
   - Site title, when every act is earlier: "On the site: nothing changed this time" (was "On the site").
   - Files: `judge.ts` (counts hunk only: `held` now calls `actCounts`), `chat/answer/words/earlier-act.ts` (new), `model/result-headline.ts`, `words/site-words.ts`.
   - Caveat: the marker is the prefix. Where the contract refused the prefixed line, Core leaves the act unmarked, and it is counted as this attempt's. Older stored results still carry the old count line.

3. Left-out line. Cause: `automationStudioFlowDraftStepLandedOut` only asks "was it dropped and did it land"; nothing asked whether a kept step still does that act. New `task-memory/step-still-done.ts`: a dropped step is not left out when a proposed step replaced it (`replacedBy`), stands for it (`id`/`standsFor`), names the same act id, has the same words/control and action, or runs the same node with the same parameters once `ensureState` is taken off (the stamped case).
   - Before: `Saved today: the steps, except the one that did "Save" (it was left out of the Flow). ...` with a Save step in the Flow.
   - After: "Saved today: the steps. ..." when a step still does it; unchanged when none does.
   - Files: `task-memory/left-out-steps.ts`, `step-still-done.ts`, `index.ts`. `outcome-of-record.ts`, `saved-state.ts` and the words files needed no change.

4. "Working · Step 11 of 11" after the end. Cause: `attemptEnded` held the attempt to the unit with its START (`startedAtMs >= first row - 5s`). An attempt carried on after Core's restart began before its new unit's first row, and a long unit's first row can age out of the kept rows, so the header never went. Now the ENDING is held to the unit (`endedAtMs >= first row - 1s`); the attempt before still cannot close a later unit, since it ended before that unit began.
   - Files: `chat/work-header/attempt-ended.ts`.
   - Not fixed here: the toast (bottom left of the pictures) is Core's own display, closed by the activity closing row. `answer/ending.ts` emits that row after `remember` and `applyProven`, so a short window remains where the card is up and the toast says Working. `ending.ts` is not in my owned paths; moving the emit to right after `storedEnding` is the lead's call.

## Tests

- New: `chat/answer/tests/earlier-acts.test.ts`, `answer-first/task-memory/tests/left-out-steps.test.ts` (includes the stamped Save case seen), judge test for the counts, three restart-shaped cases in `chat/tests/work-header-after-answer.test.ts` (unit before cut off by restart; first row aged out; the earlier attempt does not close the later unit).
- Updated for the new words: `chat/answer/tests/model.test.ts`, `screens/tasks/tests/screen.test.ts` (outside my list, one regex).

## Commands run and observed

- ui-components vitest `src/chat/answer src/chat/work-header src/chat/tests src/testing/results` plus `src/screens/tasks`, `--minWorkers 1 --maxWorkers 2`: 33 files, 255 tests passed.
- fluxiq vitest `src/runtime/result-verification/flow-less src/runtime/automation-activity src/framework/automation-service/service/answer-first/task-memory .../attempt-store`: 72 files, 622 tests passed.
- contracts vitest `src/task-attempts`: 10 files, 96 tests passed.
- `pnpm.cmd --filter fluxiq --filter @fluxiq/contracts --filter @fluxiq/ui-components check`: all three Done.
- `node scripts/structure-audit.mjs`: 2 failures, both another worker's file: `answer-first/tests/probe-row-url-t869w.test.ts` (statement-packing, line 21) and the `answer-first/tests/` directory at 27 files (limit 25). Nothing of mine is in the failures.

## Lab reader

`packages/test-runner/src/attempt-lane/live/{answer-turn-dom,shown-answer}.ts` read `.answer-site > .answer-line` into `siteTitle` as data and match only `of N rows` on the note. No text of the four lines is matched, so it reads what it read; the title text changes only when every act is earlier. Lab-pressed labels untouched.

## Not verified

No browser: the toast and header were not seen live. The new restart tests were reasoned to fail on the old start-based rule, not run against it.
