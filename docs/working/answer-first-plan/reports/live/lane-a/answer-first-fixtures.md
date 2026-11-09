# Answer-first fixtures: scripted judge yes carries citations (t875 A8)

## Outcome
Done. All test files under service/answer-first/** pass; fluxiq check and the structure audit are clean.

## What changed and why
- `tests/fake-library.ts`: new exported `judgedYes(request?, said?)`. It reads the rows from the judge's own request (`request.context.resultSummary`, via Core's `automationStudioResultHeldRowCount` and `automationStudioResultCitedStoredCells`), cites the first stored row (label, first column, value) when rows are held, cites none otherwise, and gives `answerRecords {asked:false}`. The scripted provider's default yes now uses it, and a `judge:[...]` entry may be a function of the request (as `later-attempts.ts` already allowed).
- `tests/later-attempts.ts`: default yes is `judgedYes(request)`.
- `run-acts/tests/double-act.test.ts`, `tests/same-words.test.ts` (two yes sites), `tests/attempt.test.ts`, `tests/second-attempt-proof.test.ts`: their explicit `judgeReply("yes")` became `judgedYes` / `judgedYes(request)`.
- No refusal tests touched: judgedNo / judgedUnsure / the empty-diagnosis reply in `endings/tests/judge.test.ts` are unchanged. The shared `judgeReply` in service-bootstrap is untouched (other suites use it).
- Test helper lives in fake-library.ts, not a new file, because `tests/` was at the 25-file limit.

## Commands and results
- `vitest run --maxWorkers 2 --minWorkers 1` in batches: tests/endings 16 files / 82 tests; tests/ (non-endings) 20 files / 198; the 14 subdirectory test dirs 48 files / 297; focused re-runs after the helper move: 10/181, 21/179, 35/264. All passed.
- `pnpm.cmd --filter fluxiq check` -> tsc clean (no errors printed).
- `node scripts/structure-audit.mjs` -> clean after moving the helper into fake-library.ts (the first version as a separate file gave a 26-files-in-`tests/` violation, fixed).

## What the named tests prove now
- same-words.test.ts: a repeat of the same words is told it is a repeat, the judge says yes only when this run's change is exactly one more, a non-repeat is not told so; the yes stands on held rows. Passes with fix A and the "Already done earlier" sentence.
- double-act-on-run.test.ts: a lasting act is not repeated across attempts or restarts; a carried act is not counted as this attempt's. Passes unchanged (it uses the default judge, now citing).
- later-attempt*.test.ts: later attempts use/repair the saved Flow and still reach a yes over the rows they hold. Pass.

## Not verified
Whole-package suite (not run, per memory limits). No live runs.

## Open questions
No source defect found. `asked:false` is used for every scripted yes, so no test exercises `asked:true/siteShows` mismatch on the answer-first path (covered in result-verification tests).
