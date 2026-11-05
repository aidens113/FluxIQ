# t869: the "Working" strip under a finished answer, and three more model-output limits

Core worktree `fxwork/t869/!FluxIQ`. No paid call, no key, no browser, no `dist` rebuild. Nothing committed.

## 1. The strip

**Which it is: the closing signal does come, but later than the answer; the picture is early. The header also had no way to know the attempt had ended before it came.**

Evidence:
- `run-mw3rfe9e-af5a3ce8/attempt-1/answer-turn.jpg` shows the toast "Finished" and no strip. Core's closing row (`final: true`, label "Finished", `runtime/automation-activity/build.ts:33`) reaches the toast and the pacer settles it.
- `run-mw3r7gal-3ef7639e/attempt-2/answer-turn.jpg` shows "Working · 39s", "Step 11 of 11 · Checked" and the toast "Working on your task". The answer beside it says "Took 38s". The picture is taken 500 ms after the lane sees the attempt's record end (`run-attempt-command.ts` `pictureOfAnswer`). The closing row is emitted only when the whole build call returns (`build.ts:30-38`), after the answer is stored. The toast is still on "Working" too, so the activity itself had not closed, not just the header.
- The attempt's record says it ended (`endedAtMs`, status not `working`) while the unit is still filing. The header read only the activity, so for those seconds it said Working under a finished answer.

Not the cause: the header's `final` flag or subject kind (it reads `display.working`, which `outcomeOf` clears on `phase: "done"` or `final`); polling (the clock only ticks the number).

Fix at the cause: new `work-header/attempt-ended.ts` (`attemptEnded`), exported from the barrel. A display that is an attempt unit at work (headline is the attempt's "Working on your task") whose newest attempt in the thread has ended, and began no earlier than the unit's first row (5 s skew), makes `workHeaderModel` return null, so the strip and its Stop go. An earlier attempt's ending never closes a new unit. Other modes are byte for byte: the model change is one early return behind a new optional input; waiting is untouched. `chat-widget.ts` hunk: 2 lines (import, one field passed to `header.update`).

Test: `packages/ui-components/src/chat/tests/work-header-after-answer.test.ts` (new, 3 tests through the mounted chat with a real-shaped stream: opening row, "Checked" step, no closing row): strip gone for an ended attempt of this unit; kept when the ended attempt is an earlier one; kept for any other work.

Not fixed (not my files): the extension toast still reads "Working on your task" until the closing row. That is true to the activity; the real gap is that the build returns after the answer is stored. If the toast should also clear, the closing row should be emitted when the answer is stored (`service.ts` / answer-first, the other worker's).

## 2. Limits lifted

| Limit | Change |
| --- | --- |
| 16 amendments per decision (`evidence-loop-decision.ts`) | Constant removed, with its three uses and the schema's `maxItems`. At least one is still needed. |
| 12 cited cells at 500 each (`verification-checked/{schema,well-formed}.ts`) | No count, no length. Still dropped: wrong keys, blank, non-string. The harness's warning text (`harness/provider-result.ts:220`, a diagnostic not a model-facing word) no longer says "twelfth". |
| Recovery diagnosis text 500 (`adaptation/recovery/structured-diagnosis.ts`) | Constant and refusal removed; its header comment updated. Nothing stored from it (the run summary is verdicts and counts). |

Left on purpose: the draft's own size bounds and per-step limits (written into a running graph, per `caps-and-drops.md`); the model's `expected/observed/changed` "500" sentence told but never enforced.

Head stability: the schema text is one constant per loop, not varying call to call; `anthropic/tests/cache-content.test.ts` passes.

Tests moved: `verification-checked/tests/well-formed.test.ts` (twelve-cap and over-long cases replaced by "keeps every cell" and "schema offers no number"); `deepseek/tests/output-schema.test.ts` (`maxItems` now undefined); `adaptation/recovery/tests/structured-diagnosis.test.ts` (5,000-character field read whole, one refusal fewer). New: `llm/evidence-loop/tests/no-cap-on-amendments.test.ts` (16, 17 and 40 read whole; empty still refused; placed there because `llm/tests/` is at its 25-file limit).

## Commands run

- `npx vitest run packages/ui-components/src/chat/tests/work-header-after-answer.test.ts packages/ui-components/src/chat/work-header --minWorkers 1 --maxWorkers 2 --exclude "**/.tmp/**"` -> 4 files, 18 tests passed.
- `... runtime/llm/{verification-checked,deepseek,anthropic,harness (prefix matches harness-options too)}` plus `evidence-loop.test.ts`, `structured-diagnosis.test.ts`, `diagnosis-channel.test.ts`, `draft-amendment-feedback.test.ts` -> 80 files, 817 tests passed.
- The 17 files of `runtime/llm/tests` that mention checked, amend_draft or diagnosis, plus `runtime/flow-authoring/draft` and `runtime/flow-authoring/bootstrap/candidate/tests` -> 91 files, 967 tests passed.
- `no-cap-on-amendments.test.ts` after moving -> 2 passed.
- `pnpm.cmd --filter @fluxiq/ui-components check` -> passed.
- `pnpm.cmd --filter fluxiq check` -> fails only in the other worker's files: `answer-first/act-record/{index,record}.ts` (missing `./carried-words.ts`) and `status` on act-record data in `answer-first/attempt/opening.ts` and answer-first tests. After my cast fix, none in my files (the one error of mine, a cast in the new test, is fixed).
- `node scripts/structure-audit.mjs` -> passed (first run failed on `llm/tests/` at 26 files, my new test; moved).

## Not verified

- A live picture after the fix; the early picture's gap was inferred from the step log and the code path, not measured (no activity log is kept in the run directory).
- The `fluxiq` typecheck cannot go green until the other worker's files settle.
