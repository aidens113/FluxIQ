# Run again: the four holes (t869)

`S/` = `packages/fluxiq/src`, `SVC/` = `S/framework/automation-service/service`, `AF/` = `SVC/answer-first`. This was provider-free throughout: scripted models only, no paid call, no key, no `dist` rebuild, no browser and no git mutation.

## Outcome

Done. All four holes are closed. Each has a test through the real service with a scripted model. Each test was shown to fail with the old behaviour put back, and each file was restored and checked identical with `cmp`.

## What changed and why

**1. A stopped attempt is finished by Carry on.**
- **Core carries on a stopped attempt** (`AF/carry-on/carry-on.ts`):
  - It uses the attempt's own remaining budget, so nothing needs adding. Where the budget is all spent, the press must add some.
  - The `stopped` refusal code and its words are gone.
  - It is the same attempt with the same record, and it keeps the Run again's `askedAgain`.
- **Core refuses a second Run again in this one case** (`AF/run-again/run-again.ts`).
  - The case: the task's last attempt was stopped by the person and holds a lasting act of its own (not a carried one).
  - It answers: "You stopped the last run of this task part way, after it had already done something on the site. Press Carry on on it to finish it, so nothing it did is done twice."
  - The signal is a new provenance flag, `stoppedByPerson` (`AF/task-memory/provenance.ts`), written in `AF/attempt/remember.ts`. A carry-on that ends any other way writes its row again without the flag.
  - A Stop that came before anything was pressed can still be run again.
- **The chat** (`ui-components/src/chat/answer/{model,view}`):
  - A stopped attempt gets a "Carry on" button. Where its budget is all spent, the button reads "Add $X and carry on".
  - Run again is hidden beside it once the attempt did something on the site. This is the rule budget-outs already follow.
  - A port without `addBudgetAndCarryOn` keeps Run again and shows no Carry on.
- **The wording is fixed** in `same-words-rule.md` (call 2, the key section, and open questions 2 and 3), in the (f2) note in `double-act-on-run.test.ts`, and in `design.md`.

**2. The task key folds case and drops the punctuation that ends a sentence, for the key only** (`AF/task-key/task-key.ts`).
- Characters dropped from the end: whitespace and `.!?,;:…。！？`. A closing quote or bracket stays.
- The one function serves both the attempt and the chat's known-Flow lookup (`AF/route/known-flow.ts`), so they agree.
- The words stay as typed everywhere else. The test shows the judge receives the lowercase words exactly as the person typed them.
- Old keys start again at attempt 1.
- `design.md` D10 now records the known limit: the same request in other words is still another task.

**3. The judge on a Run again is told it is a repeat the person asked for.**
- The new line is `S/runtime/result-verification/flow-less/asked-again.ts`.
- `judged-summary.ts` sends it as `askedAgain` only when `summary.askedAgain` is set.
- The value comes from `AF/completion/check.ts`, which is fed from `run-attempt.ts` (`again`, or a carry-on of a Run again).
- The words are generic: the person asked for it to be done again. Judge this time's change from `witnesses.before`, which is this time's own reading. One more is right. A state already held and left alone is right. More than one more, or anything not asked for, is wrong.
- They name no site and pass the realistic-scenario word test.

**4. The missing test** is added in `dropped-act.test.ts`.
- After an achieved attempt that dropped a landed step, the same words press nothing, either by the Flow or by hand ("attempt.act_already_done"). Renewals stay at one each.
- A Run again then presses that step by hand, once.

**Tests:**
- New:
  - `carry-on.test.ts`, "a Run again a person stopped part way" (two tests).
  - `same-words.test.ts`, the case and full-stop test on the hold-shelf toggle, and the judge test on the card count.
  - `task-key.test.ts`.
  - `flow-less/tests/judge.test.ts`.
  - ui-components `model.test.ts` and `view.test.ts`.
- Rewritten to the new rule: two `carry-on.test.ts` tests that said a stopped attempt "stays stopped", and one `route.test.ts` expectation that said case made another task.
- `later-attempts.ts`: a judge reply may now be a function of the request (additive).

## Commands run and observed results

All from `packages/fluxiq` unless noted, with `--minWorkers 1 --maxWorkers 2 --exclude "**/.tmp/**"`.

```text
vitest answer-first (flow-run included: no one had it open), runtime/answer-first, flow-less, handlers/task,
  task-attempt-wiring, task-attempt-routes, handlers/tests/domain-scope, runtime/conversations/commands
    Test Files 2 failed | 129 passed (131)   Tests 1 failed | 1344 passed (1345)
    - route.test.ts "the known Flow": expected the old case rule. Fixed (see above).
    - row-url-repeat.test.ts: ENOENT. Another worker's file, deleted from disk mid-run. Not mine.
vitest tests/carry-on.test.ts + answer-first/route            Test Files 2 passed  Tests 27 passed
vitest same-words.test.ts                                     Tests 10 passed (10)
vitest flow-less, task-key, same-words, dropped-act, carry-on  80 passed before the moves; dropped-act 8/8
Mutations (copy, edit, run, restore, cmp identical each time):
  no key folding + no askedAgain to the judge -> same-words: 2 failed (the two new tests), 8 passed
  Run again guard off                         -> stopped-run-again: 1 failed ("expected { ok: true } to match { ok: false }")
  carry-on refuses stopped again              -> stopped-run-again: 1 failed
ui-components: vitest src/chat/answer                         Test Files 7 passed  Tests 76 passed (rerun at end)
(root) pnpm.cmd --filter fluxiq --filter @fluxiq/ui-components check   both Done, exit 0
(root) node scripts/structure-audit.mjs                       structure-audit: passed (531 warning(s), 1097 baselined).
```

- The first audit failed: `answer-first/tests/` had 27 files against a limit of 25. One was my new test file; the other was another worker's `row-url-repeat.test.ts`.
- I folded my file into `carry-on.test.ts` and deleted it.
- The other worker's file has since gone from disk, and the audit passes.

## Not verified

- No browser, Lab run or real model was used. A real judge's reading of the new line is unproven: the Core test's judge is a stub that says yes only when it is told of the repeat and the change is exactly +1.
- **A carry-on of a stopped Run again reads its own before-witness.** That witness is read again at the carry-on's first lasting act, so its judge sees only the carry-on's part of the change, while the act list still holds the press made before the Stop.
- **Interrupted attempts are not covered by the guard.** An attempt a restart cut off is not marked `stoppedByPerson`, so a Run again on its task is not refused. The chat already offers "Keep going" on it.
- The extension's fake ports and Lab were not touched. `ui-components/src/testing/results/port.ts`, which I do not own, still refuses a carry-on of a stopped attempt in its fake. My view test stubs the port instead.

## Open questions or contradictions found

1. **Another worker edits inside my owned path.** `S/runtime/result-verification/flow-less/judge.ts` is modified in the tree and was not edited by me. In `ui-components`, `answer-model.ts` changed under me while I worked (`hasRepeatableAct`, `RUN_AGAIN_DOES_IT_AGAIN`). I kept my edits to the Carry on lines.
2. **I edited one file outside the owned list:** one expectation in `AF/route/tests/route.test.ts`. It pinned case as another task, which the brief asked to change.
