# t635 split-verification-contracts — worker report

## Outcome

Partial. `result-verification/contracts.ts` (800 lines) has been split into
`result-verification/contracts/`, and every check the brief names passes.
I did not move the `refuted-no/` reference modules, because the structure
audit's depth rule rules out the target path (see below).

## What changed and why

- I deleted `runtime/result-verification/contracts.ts` with `git rm`, so the
  deletion is staged. I created `runtime/result-verification/contracts/`,
  splitting it by domain noun ("declaration dump" cut, code-structure.md):
  - `index.ts` (46 lines) is the barrel. It holds the file's header comment and
    the loop-limits note. It also re-exports `../read-condition.ts` and
    `../record-set-summary.ts` exactly as before, then `export *` from each
    sibling.
  - `verdict.ts` (37 lines) holds `AutomationStudioResultVerdict` and `AutomationStudioResultVerdictBasis`.
  - `flow-step-summary.ts` (53 lines) holds `AutomationStudioResultFlowStepSummary`.
  - `read-account.ts` (129 lines) holds `AutomationStudioResultReadAccount` and `AutomationStudioResultNarrowingStep`.
  - `run-result-summary.ts` (139 lines) holds `AutomationStudioResultLeftOutNamingTheItem`, `AutomationStudioRunResultSummary` and `AutomationStudioResultEndView`.
  - `build-test.ts` (186 lines) holds the BuildTest Step, Landing, Pass, Input, Account, Store and Note types.
  - `task-checklist.ts` (27 lines) holds `AutomationStudioResultTaskChecklist`.
  - `repair.ts` (70 lines) holds `AutomationStudioResultRepairFinding` and `AutomationStudioResultRepairDirective`.
  - `verification.ts` (97 lines) holds `AutomationStudioResultVerification`, `...VerificationSkipped` and `...VerificationOutcome`.
  - `verification-reading.ts` (31 lines) holds `automationStudioResultVerificationAnswers` and `automationStudioResultVerificationFailsRun`.
- The declaration bodies were copied verbatim with `sed` line slices. The
  only text changes are these:
  - Import paths gained one `../`.
  - In `verification.ts`, the inline `import("./standing-no/index.ts")` type
    became `../standing-no/index.ts`.
  - In the header, "nothing in this file knows" became "nothing in this
    directory knows".
  - The unused `AutomationStudioResultProcessingAccount` type import was not
    carried over.
  - Sorted-line diff of HEAD's file against the new files confirms nothing
    else changed.
- Import rewrites: 98 specifiers in 96 files changed from `.../contracts.ts`
  to `.../contracts/index.ts`. A script resolved each relative specifier, so
  only specifiers that pointed at this file changed. I changed no files under
  `project-agents/dispatch/**`.
- Comment path references now point at the new files. These lines changed:
  - `result-verification/read-condition.ts` lines 1 and 26
  - `result-verification/record-set-summary.ts` line 3
  - `result-verification/result-summary.ts` lines 137 and 140
  - `flow-bootstrap/subflow-candidate/subflow-trial-gate.ts` line 54
- Path references inside the moved doc comments are verbatim. Examples are
  `./step-changes.ts` and `../llm/model-facing/control-words.ts`. They are
  written relative to `result-verification/`, so they are now one directory
  off.

## Commands run and observed results

- `node scripts/structure-audit.mjs` printed `structure-audit: passed (370 warning(s), 1156 baselined).`
  - Before the change it printed `371 warning(s), 1156 baselined`. The
    800-line advisory on `contracts.ts` is gone and no new warning mentions
    `contracts/`.
  - `result-verification/` now has 23 source files.
- `npx tsc --noEmit -p tsconfig.json` in `packages/fluxiq` returned exit 0.
- `npx vitest run` over result-verification, service/candidate-trial,
  service/subflow-trial, flow-bootstrap, project-agents and
  service/project-build printed:
  `Test Files 325 passed | 1 skipped (326)` and
  `Tests 3476 passed | 2 skipped (3478)` in 222s. Nothing else was running
  beside it.
- `git diff -U0` shows that every changed line in a modified file is an
  import specifier or one of the six comment paths above. The stat is
  `99 files changed, 104 insertions(+), 104 deletions(-)`, plus the staged
  deletion and the new `contracts/` directory.
- `node scripts/docs-reference.mjs --check` fails with "framework-reference.md
  is stale".
  - It was already stale at HEAD. Regenerating it brought in about 100
    unrelated entries (host-resources, detached-subflow, and others).
  - I reverted the regeneration to keep this diff to moves only. The
    generated reference still lists the old `contracts.ts` path for these
    types.

## Not verified

- I have no counts from before the change, because I could not run a second
  checkout. The counts are unchanged by construction: the only test-file
  edits are import specifier strings.
- I did not run the full `pnpm check`, the docs check or a live run (the
  brief asked for no live run).

## Open questions or contradictions found

- **refuted-no/references/ was not done.** The depth limit is
  `maxPathSegments: 9` (`scripts/structure-audit/context.mjs`), and the
  `naming` depth rule is never baselined (`ratchet: false`).
  `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/refuted-no/references/x.ts`
  is 10 segments, so the move would fail the audit. `refuted-no/` still has
  22 files, under the 25 cap. Options are to split `refuted-no` into a sibling
  of `result-verification/` or to leave it as it is. That is the supervisor's
  decision.
- `docs/reference/framework-reference.md` needs `pnpm docs:reference` on dev.
  The staleness comes from earlier merges, not from this task.
