# Execution-options copy structural guard

SOURCE FROZEN. The rule is implemented and mirrored. Production callers remain deliberately unmodified for the separate migration unit.

Dispatch: [execution-options-copy-guard brief](../briefs/execution-options-copy-guard.md).

Changed only:
- Core `scripts/structure-audit/rules/execution-options-copy.mjs`.
- Core `scripts/structure-audit/rules/tests/execution-options-copy.test.mjs`.
- Byte-identical copies of those two paths in sibling t843 `!FluxIQWebExtension`.
- This report.

No source callers, copy helper, context, configuration, baseline, package manifest, shared docs or git edits by this worker.

## Enforcement

The rule consumes the lead-frozen `CONFIG.executionOptionsCopy`. It loads the configured tsconfig including extends/baseUrl/source aliases, selects production object-spread roots only, and loads the configured original declaration/helper as authority dependencies. It requests no project diagnostics and emits nothing.

The checker identifies the **actual original exported type symbol/declaration**, including renamed imports/reexports, optional/property access, unions/intersections, interface inheritance, constrained generics and nested Partial/Readonly aliases. Mapped aliases retain their original property declarations; plain same-shaped settings and containers of option objects are not mistaken for copies of the option object. Transparent casts, non-null/satisfies expressions and nullish expressions retain recognition.

Only spreads inside the original exported `copyAutomationExecutionOptions` body in the exact configured source file are exempt. A same-name function elsewhere, another function in that same file, and a configured module merely reexporting another file's implementation are refused.

Configured missing/malformed tsconfig, original type/export, copy implementation and empty source scopes produce explicit failures. Relevant unresolved aliases retaining original-owner evidence and syntax errors in inspected spread files also fail. Findings include the original source line/expression, the helper remedy and **ratchet:false**.

`testRootDirNames` excludes whole fixture-root trees, including non-test fixture helpers; actual shipped support outside those roots remains inspected. Missing rule configuration is a fast no-op before any source/file/compiler work, as required downstream.

**Limits stated precisely:** intentional unrelated any/unknown and unrelated unresolved JSON imports are not declared graph-option evidence. A completely unresolved dependency with no retained original-owner identity cannot be distinguished from unrelated data; normal package tsc remains responsible for that error. This is a typed object-spread guard, not whole-program companion taint analysis, a ban on Object.assign, or an issuer of execution rights. Rerun to a fixed point during caller migration: returning the canonical type from the approved helper can expose later spreads whose prior inferred object type had already erased its original declaration. No metadata or property-name heuristic is used to manufacture identity.

## Observed checks

- Core: `node --test scripts/structure-audit/rules/tests/execution-options-copy.test.mjs` -> **23 passed, 0 failed**.
- Downstream: same exact Node test command -> **23 passed, 0 failed**.
- Core: `node scripts/structure-audit.mjs --rule execution-options-copy --json` -> **exit 1, 29 unratcheted production failures, 0 warnings/suppression**. This is the intended enforcement result before migration.
- Final scoped direct `run(createContext())` after the mapped-container negative refinement -> **exit 1, the same 29 sites** listed below.
- Downstream: `node scripts/structure-audit.mjs --rule execution-options-copy --json` -> **exit 0, 0 failures/warnings/suppression** with unset config.
- Byte comparison at mirror delivery -> **both rule and test copies identical**.

The first fixture run was 21/22: an invalid mapped alias was correctly refused but its diagnostic was labelled a normal option copy. The final rule identifies it as unresolved and all original expectations pass; a generic-container negative then brought the final cohort to 23. No refusal or type-identity oracle was relaxed.

The initial actual scan matches the supplied prototype's 35 findings minus two original helper-body spreads and four fixture-helper spreads. No current findings were baselined or waived. No full audit, suite, package typecheck, build, providers or browser ran.

## Remaining production sites

Paths are relative to `packages/fluxiq/src/`; line numbers are the final observed pre-migration tree.

| Path | Line and exact spread expression |
| --- | --- |
| `engine/automation/compiled-plan/run.ts` | 10: `...options` |
| `engine/automation/composite/boundary.ts` | 73: `...request.childOverrides`; 82: `...childOptions` |
| `engine/automation/composite/execution.ts` | 98: `...executionOptions`; 119: `...options`; 122: `...rootOptions` |
| `engine/automation/environment/executor-options.ts` | 25: `...options` |
| `engine/automation/execution-admission/internal/driver.ts` | 59: `...options` |
| `engine/automation/frames/graph-frame.ts` | 73: `...options` |
| `engine/automation/graph-run.ts` | 436: `...options`; 446: `...attemptOptions` |
| `engine/automation/resume.ts` | 68: `...options` |
| `programs/automation-studio/runtime/compiled-plan.ts` | 18: `...options` |
| `programs/automation-studio/runtime/composite-executor.ts` | 9: `...options` |
| `programs/automation-studio/runtime/executor/graph-run.ts` | 7: `...options`; 12: `...options` |
| `programs/automation-studio/runtime/executor/resume.ts` | 8: `...options` |
| `programs/automation-studio/runtime/flow-bootstrap/verification/detached-execution.ts` | 41: `...input.options`; 129: `...childOptions` |
| `programs/automation-studio/runtime/flow-change/trial.ts` | 74: `...request.options` |
| `programs/automation-studio/runtime/live-patch.ts` | 376: `...(input.options ?? {})` |
| `programs/automation-studio/runtime/recovery/annotation/annotate.ts` | 671: `...input.graphOptions` |
| `programs/automation-studio/runtime/service/candidate-trial/run.ts` | 180: `...graphOptions`; 185: `...observedOptions` |
| `programs/automation-studio/runtime/service/runtime-adaptation/repair-rerun.ts` | 186: `...(input.graphOptions ?? {})` |
| `programs/automation-studio/runtime/service/subflow-trial/from-step.ts` | 99: `...graphOptions`; 104: `...observedOptions` |
| `programs/automation-studio/runtime/service/subflow-trial/run.ts` | 206: `...graphOptions`; 211: `...observedOptions` |

Outcome: Done
Changed: two new Core rule/test files, their downstream mirrors and this report
Validation: 23/23 Node compiler fixtures in each checkout; Core guard detects 29 expected violations; downstream no-op passes; mirrors identical
Not verified: caller migration/runtime private-companion behavior, package/full structure/type/build/suite integration
Report: docs/working/runtime-ownership-refactor/reports/execution-options-copy-guard.md
Notes: All owned source frozen. Remaining callers belong to the separately released migration unit. No worker processes remain.
