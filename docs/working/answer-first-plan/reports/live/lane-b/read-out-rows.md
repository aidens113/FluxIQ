# Lane B: a read-out finished from the model's own text (run-mw45itmx-c4d6f5cb)

## Outcome
Done. The lead approved the design with changes, and it is implemented in the t876 Core tree. Every check the brief named passes: the vitest targets, the typecheck and the structure audit. Nothing is committed; the lead commits.

## Cause (file:line, t876 tree, before the change)
1. **Completion accepted text in place of rows.** `answer-first/completion/check.ts:95` refused only when there were no rows, no acts and no answer. Anything else went straight to the judge (`:105`), and a yes was accepted (`:118-122`). The run held 3 acts and `answer` text, so it was judged and accepted with 0 rows. The label "the model's own answer" is only how the judge names `answerText` (`result-verification/flow-less/judge.ts:145`). It decides nothing, so it was left alone.
2. **The read-out was an act, and the opener ticked it.** `instructed-acts/instruction-acts.ts:151` read "give/list/show/tell me what is in my <place>" as an `open` act. `step-fault.ts:80-85` (through `standing.ts`) counts such an act done by any kept step that changed something.
3. **Correction to the debug note.** Lane B's `openSaid` did appear in the 0003 request ("Name a1 on that step, as you add it or with keep"). The model obeyed it: the 0003 decision is the navigation to the cart with `add: true, act: "a1"`. a1 showed `done: 2` from 0005 on, not from 0011.
4. **Core already had a reader for "does the request want rows back".** `answerability/instruction-ask.ts:68` (`automationStudioFlowBootstrapInstructionAsk`) answers it with no model call, but only the old-mode plan check used it. `request-rows/` and `asked-count/read.ts` answer other questions. A probe of the real readers gave these results:

   | Text | `records` | Acts read |
   |---|---|---|
   | This run's instruction | `true`, with columns item, quantity, price | `[a1 open give]` |
   | "Show me what is in my basket." | `false` | `[a1 open show]` |
   | "What is the price of the blue kettle?" | `false` | none |
   | "How many records does the archive hold?" | `true` | none |

## What changed
**Rule 1: rows come only from a read.**
- `runtime/flow-authoring/bootstrap/answerability/index.ts` now publishes `instruction-ask.ts`. The header says why: every path asks this one reader, so none grows a second.
- `framework/automation-service/service/answer-first/completion/check.ts` reads `automationStudioFlowBootstrapInstructionAsk(input.instructions)` once. Right after the `nothing_to_judge` check, it refuses `answer_first.rows_not_read` when `asks.records && rows.totalRows === 0 && !input.readsRan()`.
  - The refusal comes before the digest, the purse and any judge call.
  - `readsRan(): boolean` is a new required input.
  - The header says what the refusal does and why.
- `.../completion/refused-words.ts` adds `rowsNotRead(asked)`. The wording is generic and quotes only the person's own sentence. It says rows come only from a read and words in `answer` are not rows. It tells the model to run the read where the rows are shown, and to complete with an empty read if that read finds none.
- `.../rows/sink-type.ts` and `.../rows/row-sink.ts` add `readsAnswered()`.
  - It counts a read that returned an empty list, a read whose rows were stored, and every `recordBatch` (a saved Flow's capture, carried-on copies).
  - It does not count `rows_not_stored` or `rows_no_columns`: the rows exist but were lost, so another read is right.
  - The point is that an honest empty read reaches the judge rather than looping until the budget is gone.
- **`.../attempt/run-attempt.ts` (t869 may be editing this file):** one line added after line 173 `    rows: () => sink.readBack(),`. It is now line 174: `    readsRan: () => sink.readsAnswered() > 0,`. Nothing else in the file changed.
- The refusal is an ordinary `ok: false`, the same path `nothing_to_judge` takes: `round.ts` steers, and `rounds.ts` starts a fresh round when the loop stalls. The attempt test below shows this.
- Nothing under `result-verification/flow-less/**` was touched.

**Rule 2: a read-out is no act.**
- **This differs from the design.** Pattern `instruction-acts.ts:151` is kept, with `readOut: true`, and the loop skips such a match (`if (act.readOut) return;`).
- **Why not delete it:** deleting it would have lengthened the quote of the act before it in the same sentence, and the object words that act is matched by. "Save X to my saved items, then give me a table of everything in my saved items" would have made a1 run to the sentence's end.
- The read-out still ends the clause before it, but yields no act. The header explains this with the run id.
- "open/view/visit my X" and "go to my X" remain `open` acts, done by the step that opens the page.
- **Done by the lead, not by me:** reverting `openSaid` in `checklist.ts` (and its test), and removing the opener sentence from `fallback.ts` (and its test). `fallback.ts` is untouched by me.

## Tests
**New**
- `answer-first/completion/tests/rows-not-read.test.ts` (6 cases):
  - A request for rows that completes with an act and answer text but no read is refused `rows_not_read`. No judge call is made, the person's sentence is quoted, and the same-evidence ladder is untouched.
  - The same request is judged after an empty read, and judged when it holds rows.
  - A one-value question with answer text and no read is judged.
  - A request for acts only, with no read, is judged.
  - With nothing at all, the refusal is still `nothing_to_judge`.
- `answer-first/tests/endings/tests/refused-rows-not-read.test.ts` (real service, 3 cases):
  - **Refused, then a read:** two `rows_not_read` refusals, then a read. The attempt ends achieved, with 3 rows, 1 act and 1 judge call.
  - **Refused until the round stalls:** the third refusal carries `llm_evidence_loop.no_progress`. "Carrying on" is said exactly once, before "Reading from the page". The next round's first decision is the read, and the attempt ends achieved with 1 judge call.
  - **Nothing asked back:** the attempt ends achieved, `done_on_site`, with no read call.
- `rows/tests/row-sink.test.ts`: a `readsAnswered` case. It stays 0 after a press and after a read the store lost, goes to 1 after an empty read, 2 after a read with rows, and 3 after a run batch.
- `instructed-acts/tests/instruction-acts.test.ts`: four read-outs yield no act. "Open my saved items" and "Go to my cart" stay `open`. A save before a read-out keeps its short quote.

**Re-pointed (no expectation weakened)**
- `instruction-acts.test.ts`: the rows local-classifieds tables, auction watch endings and kettle to cart drop their read-out act.
- `check.test.ts` and `checklist.test.ts`: `TABLES` now says "then open my saved items and give me a table of everything there". Every two-act case keeps both its acts and its assertions, and a comment says why.
- `bootstrap-completion.test.ts:525` (KETTLES): a3, the read-out, drops out of the todo list, with a comment.
- `completion/tests/notes.test.ts` and `refused-again.test.ts`: `readsRan: () => true` added. Their instruction asks for no records.

## Commands run and observed results
- **Design phase:** read run steps 0003-0019. Ran the probe `node --experimental-transform-types read-out-probe.mjs`; its results are the table under Cause 4.
- **Named test targets:** `npx vitest run` over answer-first `completion/tests`, `rows/tests`, `tests/attempt.test.ts` and the new attempt test; `instructed-acts/tests`; `answerability/tests`; `llm/decision-handlers/tests`; `llm/harness-options/tests/bootstrap-completion`; `answer-first/asked-count/tests`; and `llm/tests/draft-amendment-feedback.test.ts`. Result: `Test Files 51 passed (51)`, `Tests 693 passed (693)`.
- **The whole answer-first service folder (beyond the brief):** `npx vitest run src/framework/automation-service/service/answer-first` -> `Test Files 84 passed (84)`, `Tests 648 passed (648)`.
- **The moved attempt test:** `refused-rows-not-read.test.ts` -> `3 passed (3)`.
- **Before re-pointing:** 9 failures, all expected: the 3 read-out rows, check 27 and 49, checklist 32, 42 and 50, and bootstrap-completion 525.
- **Typecheck:** `pnpm --filter fluxiq check` -> `{"build-cache":"build","step":"fluxiq:check",...}`, with no tsc error output. Run twice: before and after moving the test.
- **Structure audit:** `node scripts/structure-audit.mjs` at the Core root first gave `FAIL [directory-files] .../answer-first/tests/: 26 source files exceeds the 25-file limit`. I moved the attempt test into `tests/endings/tests/`, beside `refused-completion.test.ts` and `stalls.test.ts`. The audit then gave `structure-audit: passed (531 warning(s), 1097 baselined)`, with no warning on a changed file.

## Risks still open
- **Count questions:** a request that names rows, records or columns ("How many records ...") must make one read before it is judged.
- **Wrong list:** rows read from another list (such as search results) satisfy rule 1, and the judge is the backstop, as today.
- **Read-out without table words:** "Show me what is in my basket." is now neither an act nor held to rows. Text was accepted before as well. R1b was skipped, as instructed.
- **Empty saved-Flow capture:** I have not checked whether `onRecordBatch` fires for a saved Flow's read that captured 0 rows. If it does not, the repair is asked for one more read.

## Not verified
- No live run. That needs the Haiku everything-store task to be run again.
- The empty saved-Flow capture above.
- `pnpm check` and the full suites were not run, per the twice-a-day rule.

```text
Outcome: Done
Changed: answerability/index.ts; answer-first completion/check.ts, completion/refused-words.ts, rows/sink-type.ts, rows/row-sink.ts, attempt/run-attempt.ts (1 line); instructed-acts/instruction-acts.ts; tests: completion/tests/rows-not-read.test.ts (new), tests/endings/tests/refused-rows-not-read.test.ts (new), completion/tests/notes.test.ts, completion/tests/refused-again.test.ts, rows/tests/row-sink.test.ts, instructed-acts/tests/instruction-acts.test.ts, instructed-acts/tests/check.test.ts, instructed-acts/tests/checklist.test.ts, bootstrap-completion.test.ts
Validation: vitest named targets -> 51 files / 693 tests passed; answer-first folder -> 84 / 648 passed; `pnpm --filter fluxiq check` -> no errors; `node scripts/structure-audit.mjs` -> passed (531 warnings, 1097 baselined)
Not verified: live run; onRecordBatch for an empty saved-Flow capture; read-outs without table words (R1b skipped)
Report: C:/Users/osrs_/FluxStuff/fxwork/t876/!FluxIQ/docs/working/answer-first-plan/reports/live/lane-b/read-out-rows.md
Notes: run-attempt.ts: one line added after 173, `readsRan: () => sink.readsAnswered() > 0,`.
Read-out pattern kept as a clause boundary (`readOut: true`), not deleted, so the act before it keeps its quote.
The attempt test is in tests/endings/tests/ because answer-first/tests/ is at the 25-file limit.
```
