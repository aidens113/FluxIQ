# Review: dropped-act.test.ts later-attempt tests (t869)

`T` = `SVC/answer-first/tests/dropped-act.test.ts`. Nothing edited but this report.

## Verdict: evidence, with one missing assertion. Neither moved expectation is wrong.

## 1. The two expectations

**The as-first-written text is not in git.** `T` was first committed in `2a25f067f` (10:22:15), already with the moved expectations. The caps-and-drops worker never committed its first run. What I can compare is `2a25f067f` (the worker's final version, a further ask) against `2134eb649` (11:41, the same-words work):

- "Run again after that" (`T:170-190`): the second attempt and the third now pass `runAgain: true`. Before, they were bare repeats. Under today's rule a bare repeat after an achieved attempt carries its landed acts. The by-hand press of BIRDS would have been refused, so `renewals` `{ATLAS:2, BIRDS:2}` would be wrong. With Run again the record starts empty. The engine presses the one step the Flow holds (ATLAS), the judge's no brings the model back, and the by-hand BIRDS press lands. The third attempt then presses ATLAS and BIRDS. This is right under today's rule, and it asserts behaviour, not just what the code does: renewal counts on the fake site, the target's press list, the path, and the `landed` mark on the draft.
- "Ran out of budget" (`T:192-207`): a bare repeat. The carried record means `presses` is `[]`, `renewals` is once each, and the by-hand press is answered `attempt.act_already_done`. This is right under today's rule, and it is meaningful (site-side counts, not internals). I cannot say what the worker's first-written version asserted. `2134eb649` did not touch this test, and it passes under the same-words rule as it stands.

## 2. The original failure

- Run now: 7 passed (7). Run 5 times in a row, with `--exclude '**/.tmp/**' --minWorkers 1 --maxWorkers 2`: 7 of 7 each time. No flake seen. Each test builds its own `siteLane` with cleanups, so I found no shared state. There is no `.tmp` under `packages/fluxiq`.
- Timing explains it well. `588946b04` ("Tell a plain press from a lasting one", committed 10:22:14, one second before `T`) changed `flow-run/flow-run.ts`, `flow-run/act-claims.ts`, `run-acts/{settling,run-gate}.ts`, `tests/fake-library-engine.ts` and `tests/later-attempts.ts`. Those are exactly the engine's presses, and the helpers `T` uses. The worker's own report says other workers were editing `flow-run` and `run-acts` at the time. A first run against a half-edited `settling.ts` explains one failure on the engine's presses and another on an attempt that stopped. I cannot prove it, because the intermediate tree is gone. I found no other cause.
- The worker's changed expectations were then reconciled with the same code (the same press-or-not logic), so their passing is consistent. They do not hide a defect I can find.

## 3. Missing assertion

Gap: a dropped step whose press landed in an **achieved** attempt, followed by the **same words**.

- `T` covers a same-words repeat only after `budget_out`, and a Run again after an achieved drop.
- `same-words.test.ts` has no `drop(`, so the pairing is not covered there either.
- Add one test: attempt 1 `asked()`, `drop(PRESS_BIRDS)`, complete. The act stays on the record (`result.acts` has 2 landed). Then a bare same-words attempt: `target.presses` is `[]`, `renewals` stays `{ATLAS:1, BIRDS:1}`, and the result says "Already done earlier". Then a `runAgain: true` attempt presses ATLAS only by the engine (BIRDS is not in the saved Flow), so it goes to the model for BIRDS. The existing Run again test already covers this last half.

## 4. Result

Evidence: the expectations match today's rule, are meaningful, and pass 5 of 5. The earlier failure is most likely an artefact of concurrent edits to `flow-run` and `run-acts` (`588946b04`), unproven. Add the one same-words-after-achieved-drop test above.

```text
Outcome: Done
Changed: docs/working/answer-first-plan/reports/attempt-road/dropped-act-review.md
Validation: `npx vitest run .../tests/dropped-act.test.ts` x5 -> 7 passed (7) each run
Not verified: the original failing run (its tree is gone); the missing test was not written or run
Report: C:/Users/osrs_/FluxStuff/fxwork/t869/!FluxIQ/docs/working/answer-first-plan/reports/attempt-road/dropped-act-review.md
Notes: first-written expectations are not in git (first commit already had them); cause is by timing and file overlap, not proven.
```
