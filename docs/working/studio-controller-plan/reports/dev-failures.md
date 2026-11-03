# Report: dev-failures

## Outcome

Done. All 15 failing tests in the nine files pass. One group was a real regression and got a code fix; the other seven groups were stale tests, updated with assertions at least as strict as before.

The brief's guess that t842 caused these is mostly wrong. Only `io-bridge` comes from t842. The rest come from four commits on 2026-10-31 (t823, t826, t830, t831), or from test arithmetic dating to 2026-10-20. The 2026-10-31 causes were read from `dev` at `16b5043c5`, the commit before t842's changes: each change is already there.

## What changed and why

| Group | Failing tests | Cause | Commit | Fix | Changed |
| --- | ---: | --- | --- | --- | --- |
| Re-test refused as a repeat: `trial-gate` | 3 | The trial gates kept re-testing allowed by answering `retry_allowed`. t826 stopped the repeat guard reading that word, on purpose, and did not give the gates another way to say it. So once the loop had seen a page, the guard refused every re-test of a transient verdict. This brought back the live failure the test records (`run-muyrpbnk-fef374e7`, t356). | `f83edef91` (t826) | **Regression.** Added a typed field, `ownRetestBound: true`, on a trial answer that ran and has a re-test left. The guard records no failure for that call, and only when `effectApplied` is true. Both trial gates set it; the supervisor reuses the candidate gate. | **Code**, plus new tests |
| Trial options gained `referenceNow`: `consequences` (5), `trial-environment` (1), `subflow-trial/environment` (1) | 7 | t823 added the session's date reference to the options on purpose and tested it, so "same object as built" can no longer hold. | `208101aa0` (t823) | Stale test. Now `toStrictEqual({ ...built, referenceNow: session start })`, which fixes the exact key set, every value by identity and the reference's value. | Test |
| Judge request bytes differ: `task-checklist` | 1 | Same t823 change. The summary now sends `referenceNow`, defaulting to `Date.now()`, so two summaries built milliseconds apart differ (`...368636` against `...368670`). Those timestamps were the only time-like values that differed in the failure output. | `208101aa0` (t823) | Stale test. Its `summary()` helper now pins the reference; the byte comparison is unchanged. No model-facing text changed. | Test |
| Bound callback: `passive-result` | 1 | t831 binds callbacks to the host on purpose, so private host state keeps working (`examples-binding.test.ts`). Identity with the original function can no longer hold. A second stale assertion was hidden behind this one (`bound.executeTool` is no longer a spy). | `faff8d3f2` (t831) | Stale test. Now checks that the callback ran twice with the original host as its receiver, and that the host's `executeTool` was not called. This is stronger than identity. | Test |
| Evidence view shape: `runtime-exploration-views` | 1 | t830 made evidence history append-only: each result references its own view, and the newest view appears whole once in `core.current_view`. `supersededBy` is gone, and `context-window.test.ts` covers the new contract. | `1bd5aafce` (t830) | Stale test. Now checks the references and the current view at both decisions, that the earlier entry does not change, and that the old view's content is no longer shown anywhere. | Test |
| Over-window check: `run-size` | 1 | The code is right. The token limits are written into the sent request. The test measured the size under a 7-digit limit, then set a 5-digit window one token below it. Measured: 176182 bytes / 58744 tokens became 176180 bytes / 58743 tokens, which fits a window of 58743, so the call was attempted. | Arithmetic from `67411d20e` (2026-10-20). I did not identify which later commit moved the request to a size that fails. | Stale test. It now measures at limits with the same digit count as the window, so the window is still exactly one token too small. | Test |
| No matcher supplied: `io-bridge` | 1 | t842 moved matching out of Core: with no domain matcher, Core leaves the target to the output adapter. `io-policy.test.ts` asserts that as intended. | `fd9386baf` (t842) | Stale test. It now passes `createElementMatcher()`; the assertions are unchanged. | Test |

### The code fix, and why this shape

- **t826's rule stays.** Words still grant nothing, and the existing test `does not interpret result codes or reasons as temporary failure facts` still passes. `retry_allowed` stays on the answers as a diagnostic.
- **Rejected: treating a call as `unacted`.** A trial acts, so that would be false, and `retry-later.ts` rightly refuses it.
- **Rejected: keying on a trial counter through `requestContextKey`.** The key is read after the gate has already counted, so the record and the next check match and the re-test is still refused.
- **Rejected: a general rule for any call that acted with no page reported.** It would also free domain acts and failed part runs from the guard.
- **No admission, observation or proof mechanism was added.** The field only loosens the guard for a trial its gate already bounds.
- **Limits still hold.** Past the gate's limit the field is absent. A call that did nothing is never exempt, whatever it claims. Gate refusals stay under the guard.
- **Nothing new reaches the model.** The field is not in `evidence`. The only model-facing difference is that the "repeat refused" entry no longer appears for these re-tests.

Source changed: `runtime/llm/evidence-loop/tool-execution.ts`, `runtime/llm/evidence-loop-decision.ts` (field allow-list and parser), `runtime/llm/evidence-loop.ts` (one line), `runtime/llm/repeat-guard/outcomes.ts`, `runtime/flow-authoring/bootstrap/candidate/trial/gate.ts`, `runtime/flow-authoring/bootstrap/subflow-candidate/subflow/trial-gate.ts`. Stale header comments in both gates were corrected.

New coverage: two tests in `runtime/llm/repeat-guard/tests/outcomes.test.ts` and one assertion in `subflow-candidate/tests/subflow-trial-gate.test.ts`.

## Commands run and observed results

Run from `packages/fluxiq` unless noted.

| Check | Command | Observed |
| --- | --- | --- |
| Baseline | `pnpm.cmd exec vitest run <nine files> --minWorkers 1 --maxWorkers 2` | `Test Files 9 failed (9)`, `Tests 15 failed \| 67 passed (82)` |
| 1. Nine files, plus the two test files with new coverage | `pnpm.cmd exec vitest run <those eleven files> --minWorkers 1 --maxWorkers 2 --reporter=dot` | Exit 0. `Test Files 11 passed (11)`, `Tests 120 passed (120)` |
| 1. Nine files alone, before the last two small edits | same command, nine files | Exit 0. `Test Files 9 passed (9)`, `Tests 82 passed (82)` |
| 2. Test directories beside changed source | `pnpm.cmd exec vitest run src/runtime/llm/repeat-guard/tests src/runtime/llm/evidence-loop/tests src/runtime/llm/tests src/runtime/llm/decision-handlers/tests src/runtime/flow-authoring/bootstrap/candidate/tests src/runtime/flow-authoring/bootstrap/subflow-candidate/tests src/runtime/project-agents/supervisor/tests --minWorkers 1 --maxWorkers 2 --reporter=dot` | Exit 0. `Test Files 189 passed (189)`, `Tests 1713 passed (1713)` |
| 2. Rerun after the last two small edits | same command, `repeat-guard/tests` and `subflow-candidate/tests` only | Exit 0. `Test Files 49 passed (49)`, `Tests 305 passed (305)` |
| 3. Typecheck, from the worktree root | `pnpm.cmd --filter fluxiq check` | Exit 0, no `error TS`. Build cache: `"build-cache":"build"`, so it really ran, in 17163 ms |
| 4. Structure audit, from the worktree root | `node scripts/structure-audit.mjs` | Exit 0. `structure-audit: passed (477 warning(s), 1102 baselined)` and `2 baseline entries can be lowered` |

The first audit run found two violations in my own edits, an `as never` cast and a packed statement. Both were fixed before the run quoted above.

## Not verified

- **No live or browser run.** The re-test fix is proven through the real authoring loop with a scripted model and fake trial port. No paid or browser run was in scope.
- **Old commits were not executed.** Commits were attributed by reading `git log -S` and diffs, and by confirming five of the six causes in `dev` at `16b5043c5` with `git show`. I did not run the tests at those commits.
- **`run-size`:** which commit moved the request to a failing size is not known.
- **Downstream:** the web extension was not typechecked or tested against the new optional field. Its `domain/src/runtime/llm-evidence/capture.ts` matched a search for the field list, but I did not read it. Trial gate answers are made in Core.
- **Full suites:** not run, as the brief requires.

## Open questions or contradictions found

1. **Other refusals may have the same t826 gap.** The subflow gate's `retry` refusals and the supervisor's `refused(..., { retry: true })` still carry `retry_allowed`, and the supervisor's comment still says it keeps the identical call from being answered from memory. Refusals named in the guard's `PRECONDITIONS` are lifted by a later call. Any others stay refused on the same page until the page changes. I did not change this, because t826's documentation chose it and no failing test covers it; the lead should decide whether any of those refusals need attention.
2. **Documentation is outside my paths.** `docs/architecture/automation-studio/failure-control.md` and `llm-flow-bootstrap.md` should gain a line on `ownRetestBound`. Suggested text: a trial that ran with a re-test left says so with a typed field, and its gate bounds the re-tests.
3. **Package version.** Core's tool-result contract gained an optional field. I left `packages/fluxiq/package.json` alone as briefed, so any bump is the lead's.
4. **Baseline.** The audit reports two entries that can be lowered. I did not check whether they come from my files or the other worker's, and `.structure-baseline.json` is off limits for me.
5. **Plan path.** The plan's failure table lists `runtime/agents/llm/harness/tests/run-size.test.ts`. The file is at `runtime/llm/harness/tests/run-size.test.ts`, as the brief says.
