# t554 A9: the judge reads the task checklist (worker report, t554-a9-judge-checklist)

## Outcome

Updated after the supervisor's follow-up, which allowed edits to `run.ts` and `contracts.ts`. The two open points it named (the implicit binding and the undeclared field) are now explicit; see the follow-up section below.

Done. Worktree `C:/Users/osrs_/FluxStuff/fxwork/t554/!FluxIQ`, branch `task/t554-judge-task-checklist`. Nothing committed.

## What changed and why

Paths below are relative to `packages/fluxiq/src/programs/automation-studio/runtime/`.

- `result-verification/build-test/task-checklist.ts` (new). Holds the `AutomationStudioBuildTestTaskChecklist` type (`parts[{id, words, goalFacts, lastingActs}]`, `notAsked[]`) and `automationStudioBuildTestSummaryWithTaskChecklist`. That function returns a copy of the summary with a top-level section `taskChecklist: { supplementary, asked, notAsked }`. The `supplementary` text comes first. It labels the section as supplementary to the instructions and says the instructions are the only authority ("where this checklist and the instructions differ, judge by the instructions"). It says a part that no step does is not done. It also says a result that a filter, condition or exclusion narrows, or that carries a column or makes a lasting act the instructions do not ask for, does not do what was asked. Steps that only reach what a part asks for are excepted.
  - The section is at the top level of the summary, not inside `buildTest`, because `llm/harness/request-evidence-check.ts` refuses any locator-shaped string anywhere in `buildTest`. The person's own words could contain one, and then the test would go unjudged.
  - The text explains itself because `llm/diagnosis-instructions.ts`, which I must not touch, does not mention the section.
- `result-verification/build-test/judge.ts`. `AutomationStudioBuildTestJudgeInput` gains an optional `taskChecklist`. When one is given, verify gets the summary with the section added. Without one, verify gets `input.summary` itself, the same object as before. I also added a paragraph to the file header.
- `result-verification/build-test/index.ts`. The barrel now exports `./task-checklist.ts`, and its header mentions it.
- `service/project-build/task-checklist.ts` (new). One frozen object, `AutomationStudioProjectBuildTaskChecklist`:
  - `bind(environment, {records, ref})`
  - `whole(environment)` returns the checklist from the record's latest task spec: every part plus `notAsked`. It returns undefined when nothing is bound or no spec exists.
  - `subflow(source, scope)` returns the brief's parts only, taken from the task spec that the brief's plan names (with their goal facts and lasting acts), plus the whole task's `notAsked`. If the record has no such spec, it falls back to the scope's own parts and words.
- `service/project-build/whole-trials.ts`. The judge is wrapped: before each judgement it reads `AutomationStudioProjectBuildTaskChecklist.whole(environment)` and passes the checklist if one exists. Otherwise it passes the input unchanged.
- `service/project-build/subflow-trials.ts`. It binds `{records, ref}` to the trial environment and passes `taskChecklist: await ...subflow(source, scope)` to the scoped judge. I updated the header bullets.
- Tests:
  - New: `result-verification/build-test/tests/task-checklist.test.ts`, with the byte comparison and the guard test copied from `llm/harness/tests/in-run-repair-slot.test.ts:106-125`.
  - New: `service/project-build/tests/project-build-task-checklist.test.ts`.
  - Extended: `service/project-build/tests/project-build-facade.test.ts`. The two-part plan now has `notAsked: [NOT_ASKED]`, and one new `it` drives the whole thing through the real service.

**How the whole trials reach the build record.** No file I own had a path to it, so the design leans on a shared object (see the first open question).
- `service.ts` builds the whole trials before the project build's record exists, and passes no ref or records.
- `run.ts`, which I do not own, holds the record but passes only the port.
- The one object both trial runners share is the trial environment. `service.ts` gives the same `trialEnvironment` object to `automationStudioProjectBuildWholeTrials` and, as `project.trialEnvironment`, to `automationStudioProjectBuildSubflowTrials` in `run.ts`.
- So the subflow trials bind the record to that object (a WeakMap), and the whole judge reads it at judge time.
- A candidate build creates no subflow trials, so nothing is bound and its judge's request is unchanged.
- The facade test confirms this binding works through the actual service.

## Commands run and observed results

All run from the worktree. vitest was run from `packages/fluxiq`.

- `pnpm.cmd exec vitest run .../build-test/tests/task-checklist.test.ts`: 5 passed. The first two runs failed because the byte comparison did not normalise minted ids (requestId, idempotencyKey, runId), and then because `estimatedInputTokens` differs once the checklist is added. Both are now handled in the test: the minted ids are normalised, and the test asserts the estimate grows.
- `pnpm.cmd exec vitest run .../project-build/tests/project-build-task-checklist.test.ts`: 4 passed.
- `pnpm.cmd exec vitest run .../project-build/tests/project-build-facade.test.ts`: 6 passed, including the new test.
- `pnpm.cmd exec vitest run` over the directories `result-verification/build-test/tests`, `service/project-build/tests`, `service/subflow-trial/tests` and `service/candidate-trial/tests`: Test Files 44 passed (44), Tests 317 passed (317).
- `pnpm.cmd --filter fluxiq check`: tsc printed no errors, and the build-cache stored the step. I ran it twice, the second time after the last edit.
- `node scripts/structure-audit.mjs`: the first run had 2 FAILs ([statement-packing] in my two new test files). I split those lines, and the rerun printed `structure-audit: passed (350 warning(s), 1156 baselined)`, with no warnings on my files.
- `git diff --check`: no output, exit code 0.

## Follow-up (supervisor message, same task)

- `service/project-build/run.ts`: right after `acts.bind(records, ref)`, it now calls `AutomationStudioProjectBuildTaskChecklist.bind(project.trialEnvironment, { records, ref })` (plus the import and a one-line comment). The project build binds its own record explicitly, so nothing depends on two files happening to share one object.
- `service/project-build/subflow-trials.ts`: the bind is removed, along with the header bullet that described it. The subflow judge still reads its brief's checklist from `{records, ref}`.
- `service/project-build/task-checklist.ts`: the header now says `run.ts` does the binding.
- `result-verification/contracts.ts`: declares `AutomationStudioResultTaskChecklist` (`supplementary`, `asked[{part, words, goalFacts, lastingActs}]`, `notAsked`) and the optional `taskChecklist?` on `AutomationStudioRunResultSummary`, with a doc comment. `build-test/task-checklist.ts` now returns a plain typed `{ ...summary, taskChecklist }`, so the intersection-typed extra field is gone.
- Where the judge is told about the summary's fields: that explanation lives in `llm/diagnosis-instructions.ts`, not in `result-verification/`. I left `llm/` alone because the field does not need to be named there: the section explains itself in its own `supplementary` text, and the provider tests show it arrives as sent.
- Reruns, same set as before (it includes `service/project-build`): Test Files 44 passed (44), Tests 317 passed (317). `pnpm.cmd --filter fluxiq check` exited 0 with no tsc errors. The structure audit passed (350 warning(s), 1156 baselined). Its existing advisory warning on `result-verification/contracts.ts` now reads 798 lines; it is still a warning, not a failure. `git diff --check` exited 0. The intent-to-add entries are still in place, as asked.

## Not verified

- No live or paid run, so I have not checked how a real model reads the section.
- I did not run full suites, per the narrow-check rule.
- I did not test a whole trial in a project build whose record has no task spec yet. The code returns no checklist in that case.

## Open questions or contradictions found

1. (Resolved in the follow-up.) **The record binding is implicit.** It depends on `service.ts` and `run.ts` passing the same trial environment object. If someone later spreads or copies that object in `run.ts`, the whole judge silently loses its checklist. Only the facade test guards this today. The explicit fix is one line in a file I do not own: in `run.ts`, next to `acts.bind(records, ref)`, call `AutomationStudioProjectBuildTaskChecklist.bind(project.trialEnvironment, { records, ref })` (or bind against the ledger), and remove the bind from `subflow-trials.ts`.
2. (Resolved in the follow-up; `llm/` left alone.) **The field is outside the summary contract.** `taskChecklist` is not a declared field of `AutomationStudioRunResultSummary` (`result-verification/contracts.ts`, which I do not own). It travels as an intersection-typed extra field and reaches the provider intact; the tests confirm that. Lifting it into `contracts.ts`, and mentioning it in `llm/diagnosis-instructions.ts` (out of scope here), would make the contract explicit.
3. **Index entries for the new files.** (Supervisor: leave them; it stages them at commit.) I ran `git add -N .` so that `git diff --check` would cover the new files. That left intent-to-add index entries for the four new files, and `git status` now shows them as `A`. The hook then blocked my `git reset`, so I could not undo it. Nothing is staged with content. Commit them as usual or unstage them.
4. **Record read failures.** If `records.read` throws inside a judge, the error propagates rather than the judge running without a checklist. This matches how `currentPlanDigest` already reads the record without catching.
