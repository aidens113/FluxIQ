# t674 split verdict module: worker report

## Outcome
Done.

## What changed and why
- `result-verification/verdict.ts` (492 lines) is removed (`git rm`). Its code now lives in `result-verification/verdict/`, in 17 files plus a barrel. Each top-level block was moved as it was, by script. The only edits were `export` on helpers that other files in the directory now import, and comment paths `./x` -> `../x` (`./agreement.ts` -> `../agreement/`).
  - `index.ts`: the old header, a short map of the files, and explicit exports of exactly the old public names: `AUTOMATION_STUDIO_RESULT_VERDICT_CODES`, `automationStudioResultVerdictFromDiagnosis`, `automationStudioResultKeptRowsFlagged`, `automationStudioResultObservation`, `automationStudioResultVerdict`, and the type `AutomationStudioResultVerdictInput`.
  - Public pieces: `codes.ts`, `from-diagnosis.ts`, `types.ts`, `kept-rows-flagged.ts`, `observation.ts` (with its private helpers `eachSet`, `distinctRows` and `wouldStore`), and `result-verdict.ts` (the verdict function).
  - Internal pieces: `failed.ts`, `call-failure-words.ts`, `reply-text.ts`, `advice.ts`, `unaccounted-line.ts`, `unquoted-line.ts` (`PRESENCE_CONDITION` stays private), `kept-line.ts`, `kept-number-line.ts`, `refused-yes-reason.ts`, `held-yes-reason.ts` and `without-unaccounted.ts`.
- Callers now import through the barrel: `../verdict.ts`, `../../verdict.ts` and `./verdict.ts` became `.../verdict/index.ts`. This covers `result-verification/index.ts`, `verify.ts`, the agreement, exclusion-evidence and refuted-no modules, and the tests. Only import paths changed in the tests.
- Comments that named the module now name `verdict/`, for example `../verdict/` and `result-verification/verdict/`. They are in about 30 source and test files across `result-verification`, `flow-bootstrap` (comments only), `llm`, `recovery`, `result-check-schedule` and `service/candidate-trial`.
- Not touched: `contracts/verdict.ts`, `flow-change/verdict.ts`, `claim-verdict.ts`, `finishing-verdict.ts`, generated `dist/` and `docs/reference`.
- No `docs/architecture/automation-studio/*.md` line names this file. The only match was `finishing-verdict.ts`, so no doc change was needed.

## Commands run and observed results
- `npx tsc --noEmit -p tsconfig.json` (in packages/fluxiq):
  - The first run failed. `unquoted-line.ts` exported the wrong symbol, and two errors followed from that.
  - After fixing it, the run printed nothing (exit 0).
- `npx vitest run <runtime>/result-verification <runtime>/service/candidate-trial <runtime>/flow-bootstrap` printed: "Test Files 317 passed | 1 skipped (318); Tests 3365 passed | 2 skipped".
- `npx vitest run <runtime>/service/subflow-trial` printed: "Tests 22 passed (22)".
- `node scripts/structure-audit.mjs` printed: "structure-audit: passed (389 warning(s), 1156 baselined)".
  - It reported no removed violation, so the baseline script was not run.
  - There is one new advisory warning: `result-verification/verdict/: 18 source files is past the 15-file advisory threshold`. This is the same pattern as `agreement/` (19 files).

## Not verified
- Full suites were not run, by rule.
- Git shows the usual LF/CRLF warnings on the edited files. The diff stat is balanced (70 insertions and 70 deletions on existing files), so no file had all of its lines rewritten.

## Open questions or contradictions found
- The 18-file directory advisory: the supervisor can accept it, or merge the small line and reason files into fewer files. Merging would break the one-export-per-file rule.
- A bare `verdict.ts` mention in `flow-bootstrap/unfinished-build/test-step-numbers.ts` now reads `verdict/`. From its context it means the result-verification module.
