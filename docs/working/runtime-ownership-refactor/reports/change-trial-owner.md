# Change-trial owner: first evaluator boundary

Status: first coherent production/test step saved and SOURCE FROZEN for the coordinated checkpoint. Six disjoint runtime subjects passed39distinct cases; legacy trial and strict/closure/scoped checks remain pending. Broader trial/evidence/replay migration remains paused by the lead. Dispatch: `../briefs/change-trial-owner.md`.

The actual trial no longer substitutes a host Proxy or returns newly bound host methods. `flow-change/trial.ts` keeps the caller's original host and uses the engine's diagnostic collector. The original executed/saved traces, step budget, start node, seed inputs, origin parsing, evidence projection and verdict algorithm remain in place. This first step intentionally does not claim that the remaining trial/evidence/replay bodies have moved out of Studio.

## Actual engine observation

New owner: `engine/automation/expectation-observation`.

- `companion/fact.ts` defines the complete readonly diagnostic fact: attemptId, source, declaredCount, checkedCount, outcome. No conditions, result values, messages or authority fields are retained.
- `companion/collector.ts` stores the latest fact per attempt/source. A same-source recheck replaces its earlier answer. Multiple sources leave the result unknown permanently for that attempt, including after another same-source recheck. Stored facts are copied field by field and frozen.
- `companion/registry.ts` is the sole diagnostic WeakMap from actual options to collectors. It carries no Scope, Source, proof, reservation, callback contract or completion authority. Nested trial copies retain the outer collector and add their own. The original collector method is pinned, so recording does not invoke a supplied override.
- `invoke.ts` delegates the ORIGINAL receiver/function/argument tuple to the existing `invokeAutomationCallback`. It records the answer afterward; on failure it records unknown then rethrows the SAME error. With no collector, it returns the existing callback invocation directly and does not inspect diagnostic result fields.

The three released engine leaves now call this helper at their original evaluator invocation points: node execution's policy evaluator, transition comparison and effect recheck, and recovery readiness. Host and evaluator are pinned together before awaiting. Existing recovery/comparison catches and actual source permission remain unchanged.

`execution-admission/copy.ts` inherits the diagnostic companion alongside its existing execution/retry companions, including the deferred-parent/null branch. It imports ONLY `expectation-observation/companion/index.ts`; it does not import the invoker/feature parent and create an invocation/copy value cycle. No public options field, own symbol, serialized property or new execution-context registry was added.

## Exact outcome semantics

The lead resolved the brief's partial-check wording against the original negative oracle: `evaluation.passed === false` is failed even when the count is absent or short. It never grants positive evidence. A positive answer is passed only for a nonempty condition list whose checked count covers every declared condition. Empty/partial/uncounted positive answers remain unknown. Original evaluator failure records unknown before the original error propagates. No old fixture or assertion was changed to alter this distinction.

## Owned files saved

Production (12 files): new `expectation-observation/{index,invoke}.ts` and `companion/{index,fact,collector,registry}.ts`; exact `node-execution/attempt.ts`, `transitions/comparison.ts`, `recovery/run.ts`, `execution-admission/copy.ts`, additionally released `graph-run.ts:142-145`; old `programs/automation-studio/runtime/flow-change/trial.ts`.

Tests (5 files): new `expectation-observation/tests/{collector,companion,invoke}.test.ts`; additive cases in `execution-admission/tests/copy.test.ts` and old `flow-change/tests/trial.test.ts`. All original trial assertions are retained, including explicit negative without checked count, short positive, no evaluator, throwing evaluator, full step budgets, actual host capture, retry replacement and withheld saved trace behavior.

The new cases cover immutable counts-only facts; same-source recheck and unresolved source conflict; original frozen host/private-field receiver/function/context/result identity; held evaluation without an early fact; original thrown error; no result getter inspection when unbound; ordinary/deferred/nested option copies with no enumerable or admission fields; configured original callback registration through a real graph; and an evaluator counter that acts then throws, with the next copied call refused and coverage pending. The trial composite regression reads its actual child options and requires the SAME host and original evaluator/capture functions, so the removed Proxy would fail the new oracle.

## Public integration

Canonical feature exports available now: `AutomationExpectationFact`, `AutomationExpectationCollector`, `AutomationExpectationDiagnostics`, `invokeAutomationExpectation`. Root owns any engine parent/public package export. No new public subpath is required for this private diagnostic prerequisite. The companion-only barrel is deliberately independent of the invoker value closure. No accepted instruction/policy/Source/Bindings/receipt/model/spend/store source was edited.

## Pending focused checkpoint

Suggested command from the repository root:

```powershell
pnpm.cmd --filter fluxiq exec vitest run src/engine/automation/expectation-observation/tests/collector.test.ts src/engine/automation/expectation-observation/tests/companion.test.ts src/engine/automation/expectation-observation/tests/invoke.test.ts src/engine/automation/execution-admission/tests/copy.test.ts src/programs/automation-studio/runtime/flow-change/tests/trial.test.ts src/engine/automation/tests/transition-comparison.test.ts src/engine/automation/tests/recovery-ladder.test.ts
```

After all source owners freeze, run strict roots for these 17 files, focused declaration emit for the new feature, typed/erased canonical closure with zero Studio edges, and scoped structure/cycle/option-copy rules with no baseline growth. Current imports were inspected; compiling behavior remains unverified until that window. Ignored ready probes: `change-trial-types.cjs` and `change-trial-scoped.mjs`; neither has run.

The lead authorized independent closed runtime checks while other disjoint source lanes continued. Erased-value discovery for collector/companion found118source modules, zero model/budget/Studio/project-record imports and zero unresolved relative imports; the exact list is `.fluxiq/refactor/change-trial-closed.json`. Only these two subjects ran: `pnpm.cmd --filter fluxiq exec vitest run src/engine/automation/expectation-observation/tests/collector.test.ts src/engine/automation/expectation-observation/tests/companion.test.ts` -> 2files4passed, exit0 in2.98s; log `.fluxiq/refactor/change-trial-closed-tests.log`. The process ended naturally; production/tests remained fixed.

Further exact erased discovery is saved per selector in `.fluxiq/refactor/change-trial-remaining.json`: invoke49modules, copy767, transition-comparison860, recovery-ladder860; these have no model values, no values from ANY programs/authoring modules, or exact active project-record owner imports. Old trial1729modules intersected69of the active persistence worker's160owned paths (now161after a cycle correction), so its runtime and broad types remain held for the joint window. These counts describe this source snapshot, not a permanent architecture guarantee. No runtime reader entered mutable imported source.

Under the lead's conditional release the four independent subjects ran: invoke9, transition14, recovery7, copy4/5 passed (34/35, exit1 in11.27s); `.fluxiq/refactor/change-trial-engine-tests.log`. The ONLY failure was the NEW configured graph's missing diagnostic fact, after original host/function identities, evaluator counter1 and actual successful graph had already passed. This was a real companion-loss bug, not a fixture error: `graph-run.ts:142` stripped options through object-rest before passing that alias to the helper, then restored execution binding alone. The lead released that exact seam. It now copies ORIGINAL options first, normalizes/deletes/restores referenceNow with the original precedence/absence/property-order semantics, and needs no same-parent execution-only restoration. Already-owned Call Flow child options had the same stripping pattern; they now copy ORIGINAL, delete priorAttemptCount, and retain the identical callFlowAttemptPath. No changed-parent binding was removed. Root owns the structural copy-guard extension against stripped-source aliases.

Exact failed-subject rerun: `pnpm.cmd --filter fluxiq exec vitest run src/engine/automation/execution-admission/tests/copy.test.ts` ->5/5, exit0 in9.29s; `.fluxiq/refactor/change-trial-copy-final.log`. Its configured graph now retains the original diagnostic answer and clear original callback coverage; effect-then-throw still leaves pending/counter1 and refuses another copied call. Because graph startup changed, the two affected existing consumers also reran on current bytes: `pnpm.cmd --filter fluxiq exec vitest run src/engine/automation/tests/transition-comparison.test.ts src/engine/automation/tests/recovery-ladder.test.ts` ->21/21, exit0 in9.40s; `.fluxiq/refactor/change-trial-engine-final.log`. The unchanged closed invoke9 and collector/companion4 complete six subjects/39distinct passed cases. All reader processes ended naturally. The new legacy composite regression also requires diagnostic presence on its actual child options, pending its immutable window.

The next authorized phase still needs actual configured engine/native execution through the production live-patch caller with and without remainingSteps/evaluator, retained original context and run/retry proof, actual effect/lost-ACK/forged result with changed candidate/reopened owner giving zero second send, and distinct authored invocations. Those are NOT claimed by the first-step tests. Then move the actual trial/evidence/replay mechanisms and complete rich contracts to their canonical owners with exact old facades; no shortened DTO or permanent Studio backend exception.

Outcome: Partial
Changed: 12 production and 5 test files listed above; this report
Validation: six disjoint subjects39distinct passed; exact erased-value discovery recorded; legacy trial/strict/declarations/scoped checks pending
Not verified: legacy trial runtime, strict/declarations/scoped full closure, configured live-patch/native/reopen acceptance, broader ownership moves or built integration
Report: docs/working/runtime-ownership-refactor/reports/change-trial-owner.md
Notes: First-step sources/tests FROZEN; no readers active. No git/spawn/build/provider/browser/baseline changes. Root owns checkpoint and public integration.
