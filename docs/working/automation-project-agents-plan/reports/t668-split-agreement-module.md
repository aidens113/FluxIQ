# t668 split-agreement-module: worker report

## Outcome

Done. `result-verification/agreement/`, which sat at exactly 800 lines, is now the directory
`result-verification/agreement/`: 21 files, the largest 146 lines (the barrel, most of it the old
file header). This is a pure restructure. No behaviour changed, no export was renamed, and no test
assertion was touched.

## What changed and why

Each function body was moved verbatim. The only edits are imports, and relative paths inside
comments, which gained one `../` because the code is now one directory deeper.

- `agreement/index.ts` is the barrel. It holds the old file header (t477 through t655) unchanged
  apart from those path fixes and "this file" becoming "this directory", plus a short map of the
  files. Many inline comments cite "(header, tNNN)", so the directory's barrel is the natural home
  for the header, as `refuted-no/index.ts` already is. It exports only the old public surface:
  `automationStudioResultVerificationAgreement`, `automationStudioResultVerificationAskAgain`,
  `AutomationStudioResultVerificationAskAgainOptions`,
  `automationStudioResultVerificationReaskContradicted`, and
  `AutomationStudioResultVerificationAgreementInput` (as a type). The internal helpers stay
  unexported from the barrel, as they were private before.
- `types.ts` holds the agreement input, `JudgeReading`, and `ReaskContradictedInput`. The last is
  the inline `input & { settled; ask }` parameter type, now named and structurally identical.
- `verification-agreement.ts`: the public agreement. `agree.ts`: the core branch logic.
  `ask-again.ts`: the ask-again check and its options type.
- `reask-contradicted.ts`: the public re-ask, its inner `reaskContradicted`, and the private
  `reaskUnstatedExclusion`. It is kept here, not in `unstated-exclusion.ts`, so that
  `agree → unsettled → unstated-exclusion` never imports `agree` back, which would be a cycle.
- `unsettled.ts`, `change-advised.ts`, `yes-readings.ts` (answeredReadingOf, advisedChange,
  yesReading, answeredYes), `unconfirmed-reading.ts`, `refuted-labelled.ts`, `contradicted-labels.ts`
  (the three label consts), `both-readings.ts` (with the private sameWords and
  weighedStillAchievable), `record-contradictions.ts` (MORE_PAGES, contradictsPagingRecord,
  contradictsOrderRecord, pagingReads), `no-record.ts` (noRecordOf with the private NO_RECORDS,
  DENIES_ORDER and pageOrOrderClaim), `weighed-no.ts` (weighedNos, refutedMark, splitRefuted, with
  the private weighedNo and refutedFindings), `standing-record.ts` (recorded, standingNoOf),
  `contradicted-unsure.ts`, `said.ts` (with the private passedOverRows), `unstated-exclusion.ts`,
  and `exclusion-words.ts` (exclusionRecheckWords, markedAdvice, with the private quotedExclusions).
- `git mv agreement.ts agreement/index.ts` was used, so the old path shows as a rename. Git may not
  detect the rename, because the barrel keeps under half of the old content.
- Callers now import through the barrel: `result-verification/verify.ts`, plus 12 tests (only their
  import line changed). The 12 tests are `build-test/tests/judge-yes-unconfirmed`,
  `refuted-no/tests/reask`, three under `request-rows/tests/` (kept-rows-recheck, run-mvam0lys,
  weighed-nos), five under `tests/` (agreement, agreement-both-readings, check-activity,
  judge-accounts-for-rows, verdict), and two under `unsure-doubts/tests/` (narrowing,
  narrowing-no). No test file was added or moved, so `result-verification/tests/` is unchanged.

## Commands run and observed results

- `npx tsc --noEmit -p tsconfig.json` (packages/fluxiq): no output, exit 0 (about 62 s).
- `node scripts/structure-audit.mjs` (Core root): `structure-audit: passed (389 warning(s), 1156
  baselined).` The only new warning in this area is advisory: `agreement/: 21 source files is past
  the 15-file advisory threshold`. There was no failure, no import-cycle finding, and no request to
  rebaseline. `agreement.ts` had no baseline entry, so `pnpm structure:baseline` was not run.
- `npx vitest run src/programs/automation-studio/runtime/result-verification
  src/programs/automation-studio/runtime/service/candidate-trial
  src/programs/automation-studio/runtime/service/subflow-trial
  src/programs/automation-studio/runtime/flow-bootstrap`: `Test Files 322 passed | 1 skipped
  (323)`, `Tests 3387 passed | 2 skipped (3389)`, 253 s.
- `git diff -- '*.test.ts'` shows changed lines other than the agreement import: 0.

## Not verified

- Full suites (`pnpm check`, `pnpm test`) and the web extension's typecheck against Core were not
  run. Neither imports this path directly; the module is not re-exported from
  `result-verification/index.ts`, now or before.
- No live run, per the brief.

## Open questions or contradictions found

- Several comments outside my ownership still cite the old path `result-verification/agreement/`.
  They are in `flow-bootstrap/candidate/trial-gate.ts` (lines 167 and 179),
  `flow-bootstrap/subflow-candidate/subflow-trial-gate.ts:218`,
  `flow-bootstrap/unfinished-build/contracts.ts:58` (which `docs/reference/framework-reference.md`
  is generated from), and `docs/architecture/automation-studio/llm-flow-bootstrap.md:1843`. I left
  them alone because they were outside the brief. The docs-links audit rule did not flag them. They
  should become `result-verification/agreement/`, or point at the specific file, in a follow-up
  that owns those files.
- `git mv` and `git add -N` (intent-to-add, for the diff stat) touched the index. Nothing was
  committed.
