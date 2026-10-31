# Core identity structural repair

Outcome: Done. Core source frozen; no checks running.

Repaired all 29 supplied findings without changing product behavior, public signatures, rules, limits, baselines, or assertions. Cross-directory imports now use existing owning barrels; step-loop/index.ts additionally re-exports the existing automationStudioStepAlreadyDone helper. Existing parameter-refresh, unbound-reacquire and runtime-session barrels already exported every other required symbol, so no new exports were necessary there. Type-only imports remain type-only. No new top-level execution was introduced.

Replaced the command-run never cast with a complete typed AutomationStudioExecutorCommandRun collaborator: its checkpoint retains the assertion and intentional preparation error, while unused context/consume/stop methods fail explicitly if reached. Replaced the incomplete invocation never cast with the existing real root-invocation factory and a complete typed completed-act ledger entry. All assertions remain intact.

Expanded every supplied packed line while preserving order and branching. graph-run.ts measured 559 lines before and 562 after; no extraction or packing was needed.

Exact changed paths below are relative to packages/fluxiq/src/programs/automation-studio/:

- `nodes/tests/canonical-registry.test.ts`
- `runtime/executor/contracts/graph-execution-options.ts`
- `runtime/executor/graph-run.ts`
- `runtime/executor/node-execution.ts`
- `runtime/executor/node-execution/attempt.ts`
- `runtime/executor/node-execution/tests/action-effect-frames.test.ts`
- `runtime/executor/parameter-refresh/apply.ts`
- `runtime/executor/parameter-refresh/snapshot.ts`
- `runtime/executor/parameter-refresh/tests/snapshot.test.ts`
- `runtime/executor/step-loop/index.ts`
- `runtime/executor/step-loop/loop-context.ts`
- `runtime/executor/target-reacquire/contracts.ts`
- `runtime/executor/target-reacquire/step-reacquire.ts`
- `runtime/executor/unbound-reacquire/answer.ts`
- `runtime/executor/unbound-reacquire/host-answer.ts`
- `runtime/executor/unbound-reacquire/request.ts`
- `runtime/executor/unbound-reacquire/step.ts`
- `runtime/executor/unbound-reacquire/tests/fixtures.ts`
- `runtime/executor/unbound-reacquire/tests/graph.test.ts`
- `runtime/executor/unbound-reacquire/tests/safety.test.ts`
- `runtime/native-node-runtime.ts`
- `runtime/service/summaries/reacquire.ts`

Moved `runtime/tests/target-refresh.test.ts` to `runtime/tests/target-refresh/tests/registry.test.ts`, preserving all three tests/assertions and adjusting its three relative imports. Lead test selectors must use the new path. runtime/tests now has 25 direct source files.

After all source edits froze, ran only:

`node scripts/structure-audit.mjs --rule as-never --rule directory-files --rule imports --rule statement-packing`

Observed exit 0: `structure-audit: passed (117 warning(s), 734 baselined).` No remaining failures in these selected rules; the directory remains at the advisory threshold. No audit rules/baseline were edited. No tests, typechecks, SDK/build, browser, panel, provider/API calls, git actions, or agents were run. Lead owns fresh runtime/type acceptance after barrel import changes and collaborator completion; this report makes no behavioral acceptance claim.

Outcome: Done
Changed: 22 source/test paths above; registry test moved to grouped location; this core-fix.md report
Validation: `node scripts/structure-audit.mjs --rule as-never --rule directory-files --rule imports --rule statement-packing` -> exit 0, passed (117 warnings, 734 baselined)
Not verified: tests, types, SDK/build, runtime import-cycle execution, browser/live behavior, full audit; prohibited by brief
Report: docs/working/framework-heavy-lifting-plan/reports/codex-1031/p8-identity/core-fix.md
Notes: Source frozen. Use runtime/tests/target-refresh/tests/registry.test.ts for registry/factory acceptance. No behavior or public interface changes intended.
