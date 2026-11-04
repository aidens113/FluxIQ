# Forward run (plan D2): report

## Outcome
Done. Paths under `packages/fluxiq/src/runtime/llm`.

## What changed and why
- `node-tools/replay/forward.ts` (new, exported by the replay barrel): `AutomationStudioFlowDraftReplayForward { rowDone, stepDone, passed? }` and the counts type `{ done, skipped, failed }`. `loop-tools.ts` re-exports the forward type so the loop reads it from the `node-tools` barrel.
- `loop-configuration.ts`: loop input `forwardRun?: AutomationStudioFlowDraftReplayForward`.
- `evidence-loop.ts`: only the `automationStudioLlmEvidenceLoopToolSet(...)` expression. `enabled` is now `drafting && (dryRun !== false || forwardRun !== undefined)`, and `forward: input.forwardRun` is passed. The dry-run gate line is untouched, so a completion with `dryRun: false` still runs no dry run.
- `run/flow.ts`: `automationStudioLlmRunFlowTool(forward = false)`. Same tool id, schema and `effect: "mutate"`. With forward the description says it runs what you wrote forward from where the page is, on what is not done yet, nothing reset, and a lasting step really acts on a row not done. Without forward the description is today's string.
- `run/flow-part.ts`: optional `forward`. The answer then carries `rows: {done, skipped, failed}` (counts only) and its own instruction, which never says test, finished or judged. Without forward the instruction is today's.
- `replay/draft.ts` (`automationStudioFlowDraftReplaySteps`): optional `forward`. `modeFor(step, row?)` turns a lasting step into `replay` (a real act) unless it is a non-row step whose `stepDone` is true, which stays `verify`. `reanchor` stays false and no reset is sent. `passed` is called for every answered call of a step outside a list. The result gains `rows`.
- `replay/span.ts`: `modeOf(step, row?)`, `forward` (rowDone, passed) and `rows` on the result. A list pass whose row is `rowDone` is skipped whole: nothing is sent and it is counted. Each answered member call reports `passed(step, row, answer)`. Done and failed are counted per row.
- Item 3 needs no new input. A list step in the range is a read (mode `replay`) and is sent again, and its rows then decide the passes.

## How the driver turns it on
Pass `forwardRun: { rowDone: (row) => record.rowDone(row), stepDone: (step) => record.stepDone({ actionId, parameters, row }), passed }` together with `dryRun: false` on the evidence loop input. `core.run_flow` is then offered once the draft holds a step with `ranWith` and `replay`. Every pass goes through the loop's `executeTool`, so the permission gate, act gate and row sink see it.

## Commands run and observed results
- `pnpm.cmd exec vitest run src/runtime/llm/node-tools/tests src/runtime/llm/node-tools/replay src/runtime/llm/node-tools/run --minWorkers 1 --maxWorkers 2` -> 26 files, 327 tests passed.
- `pnpm.cmd exec vitest run src/runtime/llm/evidence-loop/tests --minWorkers 1 --maxWorkers 2` -> 24 files, 317 tests passed (run before the last two small edits, a re-export and a statement split).
- `pnpm.cmd --filter fluxiq check` -> the only errors are in files I do not own: `answer-first/result/result.ts` (missing export `automationStudioFlowLessScreenedWords`, seen earlier) and `answer-first/act-record/record.ts(208)`. None in my files.
- `node scripts/structure-audit.mjs` -> no FAIL line in my paths. The remaining FAILs are in other workers' files (answer-first result tests, `flow-less/judge.ts`, `act-record/row-ties.ts`, `act-record/identity/target-keys.ts`).
- Tests are in `node-tools/run/tests/forward-run.test.ts` (new folder). `node-tools/tests` is at the 25-file limit, and `run/` and `replay/` had no tests folders. It covers the three-row case, a done row never sent, real act versus check, a failing pass stopping, no reset or re-anchor, wire form equal to `automationStudioFlowDraftReplayPassCall`, `passed` per call with its row, the absent-forward tool and part run, and the loop with `dryRun: false` plus `forwardRun`.

## Not verified
- No real executor, act record or driver wiring. The tests use stub executors.
- `passed`'s answer type is the replay's parsed result (`AutomationStudioFlowDraftReplayAnsweredCall`: the executor result without a required `kind`), not `AutomationStudioLlmEvidenceToolExecutionResult` as design.md wrote it. The type checker refused the latter, and the driver reads only `effectApplied`, `resultCode`, `evidence` and `outputs`.
- A non-row lasting member in a while or do-while span whose `stepDone` is false runs `replay` each pass until the driver's record flips it to `verify`. A span of row-less lasting steps is not tested.
- A list step outside the range gives no rows, so its members run once, as today.

## Open questions
- `passed` fires per answered call, not once per whole row. If the driver wants one call per row, it can group by `row`.
