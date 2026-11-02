# Exploration policy implementation

Dispatch: [bounded implementation brief](../briefs/exploration-policy-implementation.md); accepted design: [exploration policy plan](exploration-policy-plan.md).

Status: **SOURCE FROZEN**. Implementation and focused acceptance complete; no source/test edits pending and no worker processes running.

The canonical owners are `runtime/adaptation/exploration/{budget,scope,progress,outcome}/`, `runtime/adaptation/deadline/`, and `runtime/agents/loop/failure-code.ts`. The four old recovery policy files reexport the exact original constructors, functions and constant objects; the old evidence-loop failure-code declaration aliases the canonical union. Wire strings, clamps, policy ordering, digest calculation and exhaustive failure maps are unchanged.

The budget ledger accepts the canonical environment timer port, cancels its captured original handle at most once, detaches its external abort listener, skips scheduling for an already-aborted caller, handles synchronous timer firing and cleans failed construction. Native timers keep `unref`. External cancellation retains `AbortError`; expiry retains `TimeoutError`. Cancellation failures from timer/abort callbacks are retained for the owner's final close. The actual exploration runner preserves a primary failure together with a cleanup failure in `AggregateError`.

Root added the separate optional `graphOptions.clock` companion to retain the original broad environment timer and clock pair without changing the region-only `graphOptions.startTimer`. Annotation captures the original clock receiver and methods before awaiting, starts the whole-recovery deadline on that clock, and forwards the same pair through recovery exploration to the ledger. Legacy `graphOptions.now` remains the fallback. Summary metadata is not the budget clock.

Changed scope: the two canonical adaptation feature trees, the canonical agent failure-code leaf/barrel, four old policy facades, the old result union alias, three approved consumer slices, and immediate pure/identity/consumer test subjects. Root owns parent/public exports and the additive graph/environment contract changes.

Observed checks:

- Pure policy/timer/facade cohort: 7 files, 84 tests passed (32.00s).
- Final exact cohort: **11 files, 161 tests passed (52.49s)**. This includes all unchanged budget/progress/outcome cases, facade identity, independent canonical policy/type closure, timer lifecycle, actual recovery runner error aggregation, existing annotation behavior, and both real clock-forwarding cases.
- Canonical strict source check: 42 roots, 625 source files, 0 diagnostics.
- Canonical value and erased-type closure: no Studio source reached.
- Strict owned/consumer check: 56 roots, 5,044 source files, 0 diagnostics against the coordinated source hold.
- Final scoped official 15-rule audit: 56 owned files, 0 failures, 0 whitespace findings; nine existing advisory warnings and one unchanged baseline finding. No baseline/config changes.

The final reader window was coordinated with Root, C and the writer; both test and strict readers ended before the worker released its hold. Broader integration/build gates remain Root-owned. No full suite, package build, provider, browser, panel, git or real-data operation was run. A new-file patch initially resolved against the session checkout; those newly created files were removed there and recreated under the authorized paired Core path before existing sources were changed.

Exact final test command, from `packages/fluxiq`:

```powershell
pnpm.cmd exec vitest run src/runtime/adaptation/exploration/budget/tests/ledger.test.ts src/runtime/adaptation/exploration/tests/policy.test.ts src/runtime/adaptation/tests/source-closure.test.ts src/programs/automation-studio/runtime/recovery/tests/exploration-budget.test.ts src/programs/automation-studio/runtime/recovery/tests/progress-guard.test.ts src/programs/automation-studio/runtime/recovery/tests/exploration-outcome.test.ts src/programs/automation-studio/runtime/recovery/tests/exploration-identity.test.ts src/programs/automation-studio/runtime/recovery/tests/runtime-exploration.test.ts src/programs/automation-studio/runtime/recovery/annotation/tests/exploration.test.ts src/programs/automation-studio/runtime/recovery/annotation/tests/annotate.test.ts src/programs/automation-studio/runtime/recovery/annotation/tests/clock.test.ts --minWorkers 1 --maxWorkers 3
```

Strict check used the installed TypeScript API with the package's parsed `tsconfig.json`, `noEmit: true`, `incremental: false`, and these 56 roots: every `.ts` file under `runtime/adaptation/` except the parent-owned `index.ts`, both `runtime/agents/loop/` files, the four old policy facades, the old result alias, the three approved consumer sources, and their seven immediate compatibility/consumer test or fixture files. `getPreEmitDiagnostics` returned zero across the full transitive closure.

The scoped official audit used `createContext`, the unchanged `loadBaseline`/`applyRatchet`, and these rules filtered to those same 56 owned files and directories: `as-never`, `class-methods`, `directory-files`, `exported-values`, `failure-as-empty`, `file-lines`, `import-cycles`, `imports`, `naming`, `regexp-template-escapes`, `restricted-references`, `shared-temp-root`, `statement-packing`, `swallowed-failure`, `test-placement`. Separate trailing-whitespace/final-newline scans returned zero. Existing advisory warnings concern the legacy recovery/evidence-loop directory sizes, legacy annotation/runtime file sizes and the unchanged test-harness export count; the sole baseline finding is unchanged.
