# Fix A: a carried count act has no room only if it was done in an achieved attempt

## Outcome
Partial. The change is built and its own tests, the typecheck and the structure audit pass. The real-service integration tests (same-words, double-act-on-run, later-attempt) could not be used as a gate: same-words fails 9 of 10 with and without my ending change, and double-act-on-run hangs or crashes the worker.

## What changed and why
The seam held up: an achieved ending writes the act record into task memory in `remember.ts`, so the mark is set there.

- `act-record/contracts.ts`, `record-data.ts`: new optional `doneInAchieved?: true` on an act entry. It is in `ENTRY_KEYS` and the validator.
- `act-record/done-in-achieved.ts` (new, exported from `index.ts`): `automationStudioAttemptActMarkDoneInAchieved(data)` marks every act that stood (landed or may_have_landed).
- `act-record/record.ts`: `hasRoom` is now `!(entry.carried && entry.doneInAchieved) && rows.length === 0 && asked !== undefined && landings < asked`. This replaces the too-broad `!entry.carried`. `doneInAchieved` is deleted where `carried` is deleted, when this attempt does the act itself. The `hasRoom` doc comment and the "count across a real run" header paragraph state the rule.
- `act-record/seed.ts`: header states the rule. `union` keeps the mark (an act once done in an achieved attempt stays so).
- `service/answer-first/attempt/remember.ts`: inside the `memory.update`, when `ending === "achieved"` and `current.acts.attemptId === run.attemptId`, the stored act data is passed through the marker.
- A carried act from budget_out, stopped or waiting is left unmarked, so it keeps its room.

Tests:
- `act-record/tests/asked.test.ts`: the earlier "carried has no room" test is replaced by four.
  - Napkins shape (asked 2, one landing, achieved, seeded): `carried({counted:true})` returns the act, `admit` is already_done, and `stepDone` is true.
  - Budget-out "add 3" at 1 of 3, seeded: `carried` returns nothing, two more `admit` calls run, then already_done.
  - The mark survives a union (`earlier`) and the strict file parse.
  - Row-bound and non-count acts are already_done as before, marked or not.
- `attempt/tests/remember-acts.test.ts` (new, 5 tests): an achieved ending marks the stood act, and budget_out, stopped_by_person and waiting_for_check do not. Another attempt's record is not marked.

## Commands run and observed results
- `vitest --maxWorkers 2 --minWorkers 1 src/runtime/answer-first/act-record src/framework/automation-service/service/answer-first/attempt`: 33 files, 377 tests passed. This was before I split one line in `remember-acts.test.ts`.
- After that edit, `vitest` on `remember-acts.test.ts` and `asked.test.ts`: 2 files, 18 tests passed.
- `pnpm.cmd --filter fluxiq check`: EXIT 0 (tsc, 141 s). It ran before the one-line test refactor, which only restructured a helper in the test.
- `node scripts/structure-audit.mjs`: first run FAIL statement-packing in my new test, line 19. I split it, and the second run printed "structure-audit: passed (535 warning(s), 1097 baselined)".
- `--maxWorkers 1` alone is refused by this vitest ("minThreads and maxThreads must not conflict"). Use `--maxWorkers 1 --minWorkers 1` or 2/1.
- `pnpm.cmd --filter @fluxiq/contracts --filter fluxiq --filter @fluxiq/client-gateway-websocket --filter @fluxiq/ui-components build`: EXIT 0. fluxiq built in 273 s and ui-components in 22 s. contracts and client-gateway-websocket were restored from the shared build cache.

## Not verified / pre-existing failures
- `same-words.test.ts` (real SQL, scripted model): 9 of 10 fail in my tree. The first, "run the saved Flow, press nothing that landed", fails at `second.decisions` length 0 (the saved Flow's second attempt asked the model), and the other attempt-2 cases end `stopped_by_person`. I re-ran that first test with my `remember.ts` marking disabled and it failed identically. The `hasRoom` change touches only count acts (`asked` set), and these tests have none, so I believe this is the unrelated judge/Flow-run change the brief expected. I did not investigate it and did not fix it.
- `double-act-on-run.test.ts` and `later-attempt.test.ts`: not completed. Two runs, one of them alone, gave "Worker exited unexpectedly" with no tests collected, or ran 12+ minutes with no output before I stopped it. The machine was loaded by the other lanes' vitest and tsc, but I did not establish the cause. Whether they pass is unknown.
- No end-to-end test drives "add two packs" through a real attempt 2. The napkins shape is proven at the record level (seed, carried, admit, stepDone) and at the ending level (remember). The `opening.ts` `seedOf` fallback (task memory has no acts, so it reads the Flow's act store) is unmarked. It applies only when task memory lacks the record, and I did not touch it.

## Open questions or contradictions found
- Marking happens in `remember.ts`, after `flushedRecord`, and only in task memory. The Flow's own act store keeps the unmarked record. If task memory is unreadable the fallback seed loses the mark. Say if you want the mark written to both.
- Acts that were carried (not done by this attempt) into an attempt that ended achieved are also marked, since the task was done. I think that is right and did not special-case it.
