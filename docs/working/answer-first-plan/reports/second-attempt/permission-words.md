# Permission words (t870): worker report

## Outcome
Done. A later attempt's permission question now names the control from the saved step's own recorded words. Without usable words it reads exactly as before.

## What changed and why
All paths under `packages/fluxiq/src/`.
- `runtime/flow-authoring/bootstrap/action-permissions.ts`: new optional member on the returned object, `shown?(words: readonly AutomationStudioFlowBootstrapScreenedControlWords[]): void`. It only calls `gate.observe(text)` for each word, which is the gate's existing "shown to the model" record. Nothing else in the file changed.
- `runtime/flow-authoring/bootstrap/screened-control-words.ts` (new): branded type `AutomationStudioFlowBootstrapScreenedControlWords`. The screens live in `runtime/llm`, and importing them into `bootstrap/` closes an import cycle (structure audit failed on it, twice). So the type forces the caller to screen, and the compiler refuses a plain string.
- `runtime/flow-authoring/bootstrap/index.ts`: one barrel line for the new type (not in the owned list; needed for the barrel rule).
- `flow-run/control-words.ts` (new): `automationStudioAnswerFirstFlowRunControlWords(step)` takes `words.target`, then `control`, through `automationStudioFlowLessScreenedWords`. A word the screen touched at all (`withheld`) is dropped whole, never shown in part.
- `flow-run/permission.ts`: before each node's declarations go to `planStep`, calls `ports.permissions.shown?.(...)` with the saved step's words. The step comes from the locator (`draftStepId`, else `draftStep` position). It takes a third optional `saved` argument.
- `flow-run/ports.ts`: `permissions` is now `Pick<..., "planStep" | "shown">`.
- `flow-run/flow-run.ts` (not in the owned list; one-token change): passes `saved.steps` to the permission call. It was the only way to give permission.ts the steps.
- `flow-run/tests/flow-run.test.ts`: one assertion edited. It used to pin "a control it cannot name here"; it now expects "Cancel card". That pin was the open question this task closes.
- `flow-run/tests/permission-words.test.ts` (new, 8 tests).

## Addition's signature
`shown?(words: readonly AutomationStudioFlowBootstrapScreenedControlWords[]): void`

## Why an existing path cannot change
- It is optional and only `permission.ts` calls it. `executeTool`, `planStep`, `asking` and the gate's decision code are untouched.
- `observe` only widens what the gate may quote as a name. `checkFor` decides from consequences and grants and never reads `shown`.
- The tests show the decision, the number of presses and the number of questions are the same with and without words, in four cases.
- The existing action-permissions tests, in `runtime/flow-authoring/bootstrap/tests`, ran unedited and pass.
- Side effect: the words stay "shown" for the rest of that attempt's gate, so a later declaration naming the same control may also carry its name. Only screened words get that.

## Commands run and observed
- From `packages/fluxiq`: `pnpm.cmd exec vitest run src/framework/automation-service/service/answer-first/flow-run src/runtime/flow-authoring/bootstrap/tests --minWorkers 1 --maxWorkers 2` -> `Test Files 24 passed (24)`, `Tests 248 passed (248)`. This run was before I fixed a TS typing error in my own test file. After the fix I re-ran only `permission-words.test.ts` -> `8 passed (8)`.
- Mutation: in `control-words.ts` I replaced the `withheld` check and the screened text with the raw word. The secret test failed (`expected 'The Flow would press "Cancel library …' not to contain 'sk-a1b2c3d4…'`, 7 passed, 1 failed). I restored the file; it passes again.
- `pnpm.cmd --filter fluxiq check` from the worktree root -> exit 2. The only `error TS` lines are not mine: `answer-first/tests/carry-on.test.ts(133,5)` TS2412, `answer-first/tests/interrupted.test.ts(113,7)` TS2322 and `(173,5)` TS2412. They belong to the other worker in carry-on/ and interrupted/. My test file's own TS2375 was fixed and no longer appears.
- `node scripts/structure-audit.mjs` -> my files are clean; the last full run reported one violation: `answer-first/attempt/` has 27 source files against the 25-file limit (the other worker's directory). The run before the final fixes passed with `structure-audit: passed (498 warning(s), 1097 baselined)`.

## Tests in `permission-words.test.ts`
- A saved press step with words: the question contains the control's name and not "cannot name here".
- No words: the question still asks, in today's wording.
- Secret-shaped words (fake key built from parts): it never reaches the question; reads as unnamed.
- Markup and selector-shaped words: left unnamed.
- Permitted, refused (nobody to ask), declined and granted: same outcome kind, same step results, same presses and same number of questions with and without words.

## Not verified
- The real web domain's declared control name equal to the step's recorded words. This works only if they match (the gate quotes a name only if it appears in what was shown). The test domain declares the same name. If a domain declares a different string (e.g. a selector), the question stays unnamed. No browser here.
- The driver does not yet pass a gate whose `shown` is the real one; the fixture uses the real `automationStudioFlowBootstrapActionPermissions`.
- A full `pnpm check` is not clean until the other worker fixes its two test files.

## Open questions
- A step's label in the outcome is derived from the same words, so `ran` outcomes differ in `label` with and without words. The decision tests compare results, not labels, deliberately.
