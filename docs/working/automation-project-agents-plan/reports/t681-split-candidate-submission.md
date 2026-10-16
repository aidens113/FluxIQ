# t681 split candidate submission — worker report

## Outcome
Done.

## What changed and why
`flow-bootstrap/candidate/submission.ts` (412 lines) split into flat siblings in `candidate/`. A `candidate/submission/` directory was tried first and refused by the structure audit: its files were 10 path segments deep, and the limit is 9. Sibling files were the fallback the brief allowed.
- `submission.ts` (292 lines): the controller class `AutomationStudioFlowCandidateSubmissionController`, with `refusedKey` kept as a private function. One statement that had been packed onto line 50 is now two lines, because the audit's statement-packing rule fails it under its new line. Behaviour is unchanged.
- New files, one export each: `kept-condition-dropped-code.ts` (`AUTOMATION_STUDIO_CANDIDATE_KEPT_CONDITION_DROPPED_CODE`), `kept-condition-refusal.ts`, `binding-refusal.ts`, `part-output-port-issues.ts`, `submission-text.ts`, `changed-paths.ts`, `canonical.ts`. The helpers keep their bodies and doc comments unchanged.
- `candidate/index.ts` also re-exports `./kept-condition-dropped-code.ts`, so both public names are still exported from the barrel. `submission-refusal.ts` now imports the code constant from its new file. `authoring-loop.ts` and the tests needed no change, because `./submission.ts` still exports the class.
- Comments: the file is still called `submission.ts` and still holds the controller, so the comments that name it remain accurate. None were changed.

## Commands run and observed results
- `npx tsc --noEmit -p .` in packages/fluxiq: exit 0.
- `npx vitest run src/programs/automation-studio/runtime/flow-bootstrap/candidate src/programs/automation-studio/service/flow-bootstrap-commands`: 26 test files and 173 tests passed.
- `node scripts/structure-audit.mjs`: `structure-audit: passed (390 warning(s), 1155 baselined)`. The audit gives one new advisory warning: `candidate/` has 20 source files, past the 15-file advisory (the hard limit is 25). It reported no removed violation, so the baseline script was not run.

## Not verified
The full suites were not run. Only the narrow checks the brief named were run.

## Open questions or contradictions found
`candidate/` is now at 20 of its 25 allowed files, so a later split there may have to group files into a subdirectory, and the depth limit would block that. `trial-gate.ts` in the same directory is 754 lines.
