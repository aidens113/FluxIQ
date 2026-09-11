# Report: core-executor-split

Brief: `### Brief: core-executor-split`, Phase 5 / 6 completion dispatch.
Repository: FluxIQ Core (`F:\!FluxIQ`). Date: 2026-09-10.

## Outcome

Done. `runtime/executor.ts` is a one-line facade over `runtime/executor/`
(15 files). Its 15 exported names are unchanged, every line of logic is
preserved byte-for-byte, and no file outside `runtime/executor.ts` and
`runtime/executor/` was touched.

## What changed and why

`executor.ts` was 876 lines: 12 exported types, 3 exported functions, and 28
private functions making up the Flow execution pipeline — the giant-function-body
pathology Phase 6 names. It is now:

```ts
export * from "./executor/index.ts";
```

the same facade shape the `model/` worker used for `validation.ts` and
`fixtures.ts`. Because this repository writes explicit `.ts` extensions, the
filename had to survive: seven modules import `./executor.ts`, `../executor.ts`
or `../runtime/executor.ts` by path (`model/runtime.ts`,
`runtime/adaptive-orchestrator.ts`, `runtime/compiled-plan.ts`,
`runtime/composite-executor.ts`, `runtime/live-patch.ts`, `runtime/service.ts`,
`storage/project/compiled-plan-store.ts`) plus `runtime/index.ts` and five
tests. None of them changed.

### The 15 modules

| File | Lines | Holds |
| --- | --- | --- |
| `contracts.ts` | 172 | All 12 exported types. Zero exported *values*, so it does not count against the 15-value limit. |
| `graph-run.ts` | 143 | `runAutomationStudioGraph` — the step loop, untouched. |
| `graph-navigation.ts` | 39 | `chooseAutomationStudioEdge`, `findStartNode`, `hasUnvisitedAutomationStudioNodes`, `missingTargetTrace`. |
| `region-execution.ts` | 38 | `executeWithRegionTimeout`, `policyDecisionForAttempt`, `recordRegionTransition`. |
| `node-execution.ts` | 131 | `executeAutomationStudioNode` (exported) over private `dispatchAutomationStudioEffects` and `sideEffectClassForNode`. |
| `node-inputs.ts` | 12 | `collectNodeInputs`. |
| `host-state.ts` | 52 | `captureHostState`, `enrichAttemptWithHostState`. |
| `attempt-trace.ts` | 30 | `nodeAttemptFromResult`. |
| `trace-summary.ts` | 12 | `automationStudioTraceSummary` (public). |
| `transition-comparison.ts` | 91 | `compareAutomationStudioTransition` (public) over private `classifyTransitionComparisonStatus`, `comparisonMessage`, `uniqueStrings`. |
| `expected-transition.ts` | 69 | `expectedTransitionForNode` (exported) over private `expectedStatusForNode`, `expectedEffectsForNode`, `expectationStateFromNode`, `jsonObjectParameter`, `isEffectShape`. |
| `actual-transition.ts` | 18 | `actualTransitionForAttempt`. |
| `recovery-ladder.ts` | 79 | `chooseAutomationStudioRecovery`, `failureMessageForRecoveryStop`. |
| `recovery-budget.ts` | 35 | `recoveryBudgetState`, `recoveryBudgetExhaustion`. |
| `index.ts` | 4 | Barrel: `export *` of `contracts.ts` plus the 3 public functions by name. |

Largest file is 172 lines, well under the 400-line advisory. The dependency
graph is acyclic: `graph-run` depends on `graph-navigation`, `region-execution`,
`node-execution`, `recovery-ladder` and `recovery-budget`; `node-execution` on
`host-state`, `attempt-trace` and `node-inputs`; `attempt-trace` on
`transition-comparison`, which depends on `expected-transition` and
`actual-transition`; `recovery-ladder` on `recovery-budget`. Everything points
at `contracts.ts`.

### Two deliberate decisions

**Helpers stay private.** Only the 15 names that were public are re-exported
from `executor/index.ts`. The 28 extracted helpers are exported from their own
file so a sibling can import them, but none reaches the barrel. A runtime probe
confirmed `Object.keys(facade)` is exactly the 3 public functions.

**Barrel-skipping imports went to zero rather than moving.** The original had
two: `../nodes/contracts.ts` and `../nodes/importer-sdk.ts`, recorded in the
baseline as `imports … executor.ts = 2`. The `imports` rule keys findings *per
importing file* and fails outright on a key with no baseline record, so carrying
those specifiers into new files would have manufactured new failures. Both
symbols (`AutomationNodeExecutionResult`, `AutomationStudioNativeLogEntry`) are
already re-exported by `nodes/index.ts`, so the new modules import
`../../nodes/index.ts`. No barrel was widened to make this work.

Imports to `../host-runtime.ts` are exempt under the Phase 1 rule change: a file
in `runtime/executor/` reaching a file of `runtime/`, the directory it lives
inside, is not a consumer crossing a boundary.

### Naming budgets checked before writing

`prefixGroup` is 3, and a third `transition-*` file would have created a *new*
ratcheted `naming` failure. Hence `expected-transition.ts` /
`actual-transition.ts` / `transition-comparison.ts` rather than three
`transition-` files. The largest prefix group is 2 (`graph-`, `node-`,
`recovery-`). 15 files sits exactly at the `directoryFilesWarn` threshold, so no
warning. Depth is 8 segments against a limit of 9.

No `tests/` folder was added under `executor/`: the public subject is still
`runtime/executor.ts`, so `runtime/tests/executor.test.ts` stays where it is.
`test-placement` reports nothing in this scope.

## Commands run and observed results

**Exported-name diff — the primary evidence.** Via the TypeScript checker
(`getExportsOfModule`), before and after:

```
$ diff <(cut -f1 exports-before.txt) <(cut -f1 exports-after.txt)
IDENTICAL (15 names)
```

The 15: `AutomationStudioActualTransition`, `AutomationStudioExpectedTransition`,
`AutomationStudioGraphExecutionOptions`, `AutomationStudioGraphExecutionTrace`,
`AutomationStudioGraphRunStatus`, `AutomationStudioNodeAttemptTrace`,
`AutomationStudioRecoveryBudget`, `AutomationStudioRecoveryCandidate`,
`AutomationStudioRecoveryDecision`, `AutomationStudioRecoveryLookupInput`,
`AutomationStudioTransitionComparison`,
`AutomationStudioTransitionComparisonStatus`, `automationStudioTraceSummary`,
`compareAutomationStudioTransition`, `runAutomationStudioGraph`. The only change
is the declaration kind of the three functions: `FunctionDeclaration` becomes
`ExportSpecifier`, which is what a facade is. `runtime/index.ts` still resolves
all 15.

**Line-level body diff — the ordering evidence.** Every function was extracted
as a contiguous `sed` range from the original, so nothing inside a try/catch or
the step loop could be resequenced. Proven rather than asserted: the original
body (lines 8-876) against all 14 modules with import headers stripped, blank
lines removed, the `export ` prefix normalised off, sorted:

```
before non-blank lines: 824
 after non-blank lines: 824
$ diff body-before.txt body-after.txt
IDENTICAL: every line of logic preserved, nothing added or dropped
```

A grep for top-level statements other than imports, types and function
declarations returned only multi-line signature closers — there is no
module-level state or side effect whose evaluation order could have shifted.

**Scoped tests — identical before and after.** The same six files both times:

```
$ npx vitest run runtime/tests/{executor,io-bridge,native-node-runtime,adaptive-orchestrator,live-patch,composite-executor}.test.ts
before: Test Files 6 passed (6)   Tests 51 passed (51)
after:  Test Files 6 passed (6)   Tests 51 passed (51)
```

**Adjacent runtime tests no other worker owns** (after only):

```
$ npx vitest run runtime/tests/{asfacade-index-probe,region-compiler,pipeline-model,policy-model,state-linker,training-modes,intervention-mode,router-runtime}.test.ts
Test Files 7 passed (7)   Tests 32 passed (32)
```

(`asfacade-index-probe.test.ts` did not report as an eighth file; the seven
listed ran and passed.)

**Runtime probe of the facade, then deleted.** `export *` chains are a runtime
concern tsc cannot fully settle, and two public functions have no consumer in
source. A throwaway `zz-exec-split-probe.test.ts` inside `executor/` gave
`Test Files 1 passed (1)  Tests 4 passed (4)`. It confirmed all three functions
are callable values through both `../executor.ts` and `../index.ts`, are
identity-equal across the two, that the facade exposes exactly those three
runtime values and nothing more, and that `automationStudioTraceSummary` and
`compareAutomationStudioTransition` return correct results. The file was
removed; `executor/` holds 15 files.

**Typecheck:**

```
$ npx tsc --noEmit -p packages/fluxiq/tsconfig.json
tsc exit=0
```

**Structure audit** (`node scripts/structure-audit.mjs --json`, after
`git add -N` on the new files so `git ls-files` enumerates them):

```
failures 35  | under runtime/executor: none
warnings 112 | under runtime/executor: none
```

All 35 failures belong to other in-flight scopes (`storage/project/*`,
`runtime/flow-bootstrap/plan.ts`, `runtime/llm/harness.ts`, `apps/web/…`) or to
`working-docs`. The audit exits 1 because of those, not because of this scope.

**Two baseline entries are now dead**, not merely lowered:
`file-lines … executor.ts = 876` (the file is 1 line, so no finding is produced
at all) and `imports … executor.ts = 2` (now 0). They appear in neither
`failures` nor `lowerable`, so the supervisor's `pnpm structure:baseline` will
drop both. Per the brief I did not run it.

## Not verified

- `pnpm check`, `pnpm test` and `pnpm build` in full. Three other workers are
  editing `runtime/service.ts`, `runtime/llm/harness.ts` and `api/handlers.ts`
  concurrently, so a whole-package run would mix their in-flight state with
  mine. Every check above was scoped deliberately.
- The four pre-existing `packages/fluxiq` test failures named in `Current State`
  (`service.test.ts`, `service-subflow-pagination.test.ts`,
  `runtime-llm-grants.test.ts`). Those files are another worker's; I did not run
  them and cannot report a delta.
- Live behaviour of a real Flow run beyond what the 51 scoped cases exercise.
  The line-level identity diff is the substitute, and it is strong: no statement
  changed, only which file holds it.
- `biome check` is not a gate here — `biome.json` uses an explicit allowlist
  that excludes `packages/fluxiq/src/programs/automation-studio/`. Pre-existing
  configuration, unchanged by this work.

## Open questions or contradictions found

- **`automationStudioTraceSummary` has no consumer anywhere in source.** The
  only hits outside `executor/` are in the stale build artifact
  `packages/fluxiq/dist/.../executor.d.ts`. It is public API that nothing calls
  and no test covered before this work. The brief required the export surface to
  stay identical, so it stayed; flagging it as a candidate for removal in a later
  pass, which would be a real if small surface change.
- **Nothing tests `compareAutomationStudioTransition` directly either**, though
  it is exercised transitively on every node attempt via `nodeAttemptFromResult`,
  and `live-patch` / `adaptive-orchestrator` assert on the `transitionComparison`
  it produces.
- The baseline records `directory-files … runtime = 34`, but `runtime/` holds
  fewer source files than that since the Phase 3 `llm/` and `flow-bootstrap/`
  moves. Outside my scope and not acted on; noted because the supervisor's
  baseline regeneration will lower it.
