# Skipped rows told to the person (t870)

## Outcome
Partial. Everything is built except the proof through the real service, because `AutomationStudioAttemptActRecord.rowsHeldDone()` was still not in `runtime/answer-first/act-record/` after about 8 minutes of waiting. I did not add it. `keep.ts` is coded against that exact name.

## What changed and why
- Contract `packages/contracts/src/task-attempts/task-result.ts`: optional `skippedAsDone`, in the key set, parsed only as a whole number of at least 1 (issue `task_result.invalid_skipped_as_done`), copied onto the result only when valid. Old records parse unchanged. Parser test added to `tests/task-result.test.ts` (present, absent, 0, -1, 1.5, "2", null, NaN).
- Writer `runtime/answer-first/result/result.ts`: input takes `skippedAsDone`; kept only if the contract's parser accepts it, so 0 or a bad number is left off. It is also kept on the smaller fallback record. Tests added to `result/tests/result.test.ts`.
- `service/answer-first/attempt/keep.ts`: `automationStudioAnswerFirstResultAs` passes `run.record.rowsHeldDone()`. It goes through the ending check and the strict store re-read by the contract parser alone (no field list elsewhere; I grepped).
- ui-components: `ChatTaskResult.skippedAsDone` restated; new `chat/answer/words/skipped-words.ts` ("Skipped 1 as already done", "Skipped 2 ..."), exported from the words barrel; `AnswerModel.skipped`; `result-parts.ts` fills it (also on a result that holds nothing); `view/body.ts` draws it as a plain `answer-line` (data-line "skipped") after missing and checked, no mark. Tests in `model.test.ts` and `view.test.ts`. The existing view tests do not cover widths, so no 360 px test.
- New `service/answer-first/tests/skipped-rows.test.ts`: budget-out at two of four loans, then the same words; and an attempt with nothing held done. NOT YET RUN.

## Commands and observed results
- `pnpm.cmd --filter @fluxiq/contracts build` -> built.
- contracts `vitest run src/task-attempts/tests/task-result.test.ts` -> 15 passed.
- ui-components `vitest run src/chat/answer src/chat/ports src/testing/results` -> 5 files, 61 tests passed.
- ui-components `pnpm run check` -> ran clean (no errors printed); the type-parity test in `chat/ports/tests/results.test.ts` holds against the contract.
- fluxiq `vitest run src/runtime/answer-first/result` -> 2 files, 48 passed.
- `pnpm.cmd --filter fluxiq check` -> one error: `keep.ts(60,31): Property 'rowsHeldDone' does not exist on type 'AutomationStudioAttemptActRecord'`. Mine, and it is the missing method only.
- `node scripts/structure-audit.mjs` -> one FAIL, not mine: `statement-packing` in `answer-first/tests/identical-rows-probe.test.ts` (lines 16, 22). Only advisory warnings otherwise; none in my files.

## What the count really showed
Not observed. The service test is written to expect `skippedAsDone: 2` on the second attempt and none on the first; those expectations are my guess and must be read, not trusted, once `rowsHeldDone` exists. If the second attempt does not start from a record holding the two renewed loans, adjust the test to what it reads.

## Not verified
- The service test (`skipped-rows.test.ts`) never ran; `rowsHeldDone` is absent.
- Real count semantics of `rowsHeldDone()`.
- Not run: the full chat widget, Firefox or Lab; no browser use.

## Open questions
- I ran one `git diff --stat` by mistake early on (read-only, it hung and was stopped). No other git commands.
- Next step for the lead: once the act-record worker lands `rowsHeldDone(): number`, run `pnpm.cmd exec vitest run src/runtime/answer-first/result src/framework/automation-service/service/answer-first/tests/skipped-rows.test.ts --minWorkers 1 --maxWorkers 2` from packages/fluxiq, then `pnpm.cmd --filter fluxiq check`.
