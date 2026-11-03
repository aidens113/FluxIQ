# Brief: dev-failures

Goal: find and fix why these tests fail. They fail on plain `dev` at Core `ff8eb0be8` too, so the Studio move did not cause them; the likely source is the t842 merge, which was accepted on narrow checks only. They block promotion to `main`.

Worktree: `C:/Users/osrs_/FluxStuff/fxwork/t845/!FluxIQ`, branch `task/t845-studio-controller`. Paths are under `packages/fluxiq/src`.

| File | Failing tests | Observed |
| --- | ---: | --- |
| `framework/automation-service/service/candidate-trial/tests/consequences.test.ts` | 5 | `expected { inputs: {}, …(7) } to be { inputs: {}, …(6) }` |
| `runtime/flow-authoring/bootstrap/candidate/tests/trial-gate.test.ts` | 3 | Output contains `llm_evidence_loop.repeat_refused` |
| `framework/automation-service/service/candidate-trial/tests/environment/tests/trial-environment.test.ts` | 1 | `expected { …(4) } to be { …(3) }` |
| `framework/automation-service/service/subflow-trial/tests/environment.test.ts` | 1 | `expected { …(4) } to be { …(3) }` |
| `framework/automation-service/service/end-view/tests/passive-result.test.ts` | 1 | `expected [Function bound spy] to be [Function spy]` |
| `runtime/adaptation/recovery/tests/runtime-exploration-views.test.ts` | 1 | Not yet read |
| `runtime/llm/harness/tests/run-size.test.ts` | 1 | `expected 'attempted' to be 'not_attempted'` |
| `runtime/result-verification/build-test/tests/task-checklist.test.ts` | 1 | Request bytes differ |

Paths may have moved a little further by dispatch; find them by file name. The prefix-directory step may also have moved source files they import.

Method:

- Trace each to its cause before changing anything. For each, decide from `git log` on `dev` and the code whether the test is right and the code regressed, or the code changed on purpose and the test is stale. Say which, with the commit that changed it.
- If the test still states the intended behaviour, fix the code. Never weaken an assertion to get a pass. If the test is genuinely stale, update it and say why in the report.
- Several failures look like one cause (an extra option key, a bound function), so group them.
- `llm_evidence_loop.repeat_refused` and the request-byte difference touch model-facing behaviour: read `AGENTS.md` on the guard against repeated failing actions and on guidance never teaching to the test before changing them.

Owned paths: the eight test files and the source they exercise.

Must not touch: `programs/automation-studio/api/**` (the `thin-handlers` brief owns it), `scripts/**`, `.structure-baseline.json`, `packages/fluxiq/package.json`. No git mutations and no commits. Do not add any execution-admission, observation or completion-proof mechanism: the parked t843 branch has these and they are not to come back.

Never run full suites: the user caps them at twice a day. No paid model calls, no panel, no browser. Run the eight files directly: `pnpm.cmd exec vitest run <files> --minWorkers 1 --maxWorkers 2` from `packages/fluxiq`.

Context: `docs/working/studio-controller-plan.md`, Current State only.

Acceptance checks, run and quote each:

1. The eight files -> all pass.
2. Any further test directories beside source you changed -> pass.
3. `pnpm.cmd --filter fluxiq check` -> 0 errors.
4. `node scripts/structure-audit.mjs` -> no new findings from your files.

Report: `docs/working/studio-controller-plan/reports/dev-failures.md`, with one row per failure group: cause, commit that introduced it, fix, and whether code or test changed. End your final message with the return contract: Outcome, Changed, Validation, Not verified, Report, Notes.
