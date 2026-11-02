# Router foundation readiness

Outcome: Done. The lead released implementation after independently accepting A2. Actual neutral router compilation, condition matching and route execution now live in the canonical engine, with canonical executable DTOs and exact legacy function reexports. Owned source is frozen; the final 46 focused tests, strict owned/consumer checking, structure, value/type import closure, whitespace and 1,329 JSON-byte comparisons pass. Parent engine/package integration remains lead-owned.

## Actual extraction boundary

- `programs/automation-studio/runtime/router-runtime.ts` owns deterministic rule compilation, routing, condition evaluation, diagnostic/decision projection and one Studio default-subflow adapter. The neutral mechanism can move to `engine/automation/router/**` without store/editor or host dependencies.
- Existing canonical DTOs already cover `ExecutableRouter<TRule>`, `ExecutableRouteRule`, `ExecutableSubflowTarget`, `ExecutableRouteTarget`, `ExecutableRouteDecision`. `ExecutableFlowRunStatus` is canonical under `flows/executable/execution`; conditions already originate in `@fluxiq/contracts/state` through an old Studio type reexport.
- Add generic execution input/compiled-rule/diagnostic/plan/evaluation/result DTO leaves under the owned canonical routing directory. Retain actual rich rule/subflow objects and references through generics; narrowing everything to the minimal target would erase required legacy projection types.
- Keep `defaultAutomationStudioSubflowForFlow` in the old Studio file with its exact artifact projection. Old callable/type names forward to canonical mechanisms/DTOs; no Studio type edge, even erased, belongs in the new engine closure. Root/package barrels remain lead-owned.

## Compatibility facts to preserve

- Compile sorts a copied rule array by numeric order then `ruleId.localeCompare`; target lookup is a `Map` with existing last-duplicate behavior. It records missing target diagnostics in sorted rule order, including disabled rules, then checks fallback. No rule/target cloning occurs.
- The clock is called once after compilation, including failure. First active match wins; disabled rules and preceding mismatches retain ordered rejected IDs/evaluations. Active fallback and configured fail messages preserve current omission/truthiness behavior.
- Decision metadata records total evaluation count, at most16 reason projections, reason/unavailable truncation at300, original reroute source and diagnostic projections. It never includes observed state values. Full returned evaluations remain untruncated.
- All condition/group behavior and reason bytes must remain: empty all/none match, empty any misses; weighted score uses each child weight; numeric comparison uses existing `Number` coercion; text matching/normalization and invalid-regex refusal retain exact behavior. Unsupported transition operators remain unsupported.
- `adaptationPolicy` occurs only in the old input type; the matcher never reads it. Preserve the old Studio alias's exact optional policy type while the canonical callable accepts that unused slot opaquely, avoiding a new neutral-to-Studio dependency. Do not remove the slot from a reexported callable and break direct legacy object-literal calls.

## Existing consumers and acceptance scope

- The named old subject test is `runtime/tests/router-runtime.test.ts`, six cases using the real Studio expansion fixture. Keep all six unchanged, including default projection and reroute metadata.
- Real route-building integration uses `runtime/flow-bootstrap/authoring/tests/routes.test.ts`; `route-state/router-state.ts` retains host observation/composition and its old input/result types. Detached verification consumes the same rich result type. These remain adapters; no edits to those owners are planned.
- New canonical tests should independently cover compilation/order/reference preservation, conditions/groups, full failure/fallback/clock/metadata bytes and legacy function identity. Use small canonical route data and frozen clocks, with no Studio fixture imports.
- Planned narrow acceptance after release: exact old/new router files plus the existing authoring routes file; isolated strict NodeNext across owned code/legacy aliases and real consumers; scoped structural/AST review and an import-closure check proving no Studio edge in the new canonical engine/DTO closure. No package builds/full suites/providers/browser/panel.

## Read-only preparation (historical)

Read the bounded brief, relevant Current State, residual-runtime routing rows, old router/subject test, canonical route/run-status DTOs and condition reexport; searched actual router-input/type/function consumers to verify the unused adaptation-policy claim and generic rich projection needs. No router tests/typechecks/builds ran during preparation. No source/git/configuration/baseline/shared working-document edits occurred; only this owned report was added.

## Implemented ownership

- `packages/fluxiq/src/engine/automation/router/**`: actual `compileExecutableRouterPlan`, `runExecutableRouter` and `evaluateExecutableRouteCondition`; cohesive compilation, run/failure/decision-metadata leaves and condition group/atomic/numeric/pattern/text/path leaves. Each new production leaf exports one authority, and each directory has a barrel.
- `packages/fluxiq/src/flows/executable/routing/execution/**` plus the owned routing parent barrel: generic execution input, compiled rule, diagnostic, plan, evaluation, result and narrow condition input/result DTOs. Existing executable router/target/rule/decision, canonical run status and `@fluxiq/contracts/state` remain the authorities; no Studio types are imported, even erased.
- `programs/automation-studio/runtime/router-runtime.ts`: compatibility reexports of the exact canonical function objects under all three old names; old rich DTO aliases; the original Studio artifact-to-default-subflow projection. The neutral algorithms are removed from Studio. The unused adaptation-policy slot stays opaque in the canonical input, while the old input alias retains its exact optional Studio policy type.
- Generic compilation retains original rich rule objects, and execution retains each original rich subflow object/type. Existing target/metadata projections, coercions, fallback truthiness/omissions, diagnostic order/text and one clock read are preserved. No semantic fixes, migrations or oracle changes were introduced.
- Canonical tests import no Studio fixtures. The original six Studio fixture cases remain; two additional legacy cases prove actual function identity and rich input/policy/result compatibility. Existing authored-route integration remains unchanged.

## Final frozen acceptance

Exact final focused command:

```powershell
pnpm.cmd --filter fluxiq exec vitest run src/engine/automation/router/tests/compile.test.ts src/engine/automation/router/tests/run.test.ts src/engine/automation/router/condition/tests/evaluate.test.ts src/programs/automation-studio/runtime/tests/router-runtime.test.ts src/programs/automation-studio/runtime/flow-bootstrap/authoring/tests/routes.test.ts --maxWorkers 2 --minWorkers 1 *> .fluxiq/refactor/router-foundations-final.log
```

Observed exit 0, 5/5 files and 46/46 tests, 20.98s: canonical compilation 3, canonical run 8, canonical conditions 22, legacy fixture/identity 8, unchanged real authored-route integration 5. The first focused run also passed 46/46 in 20.58s.

Final static/probe commands, all observed exit 0:

- `node --max-old-space-size=4096 .fluxiq/refactor/router-types.cjs` -> strict isolated NodeNext, 29 owned files plus 4 actual consumer files, 0 errors. Checks the real route-state, detached verification and API handler callers without editing them; emits no build output. Initial strict acceptance found only two throw-only test getters inferred as void; explicit existing condition return types corrected those test annotations.
- `node .fluxiq/refactor/router-structure.mjs` -> 29 owned files, 15 official rule passes plus new-leaf authority/barrel AST review, 0 failures, 0 warnings. Old compatibility type aliases remain aliases in the existing shim, with no new duplicate authority. Initial finding was one packed two-statement test getter line, corrected before final acceptance. No baseline/configuration writes or budget moves/increases.
- `node .fluxiq/refactor/router-closure.cjs` -> 261 actual local modules in source and erased-import closure, 0 Studio or unresolved edges. Traverses real value/type import/export edges from the canonical engine and executable routing barrels; old compatibility adapters are intentionally outside the neutral roots.
- `node --experimental-strip-types .fluxiq/refactor/router-parity.mjs` -> 1,329 actual pre-extraction/current JSON-byte comparisons, 0 differences. The ignored reference is the exact current router file copied before this extraction and transpiled without its type-only imports; it uses no historical checkout or source overlay. Covers all 14 atomic operators across primitive/structured/missing values, groups/weights, compile/route target/status/fallback combinations and bounded metadata. Probe logs only summaries or a failing case label, with synthetic data only.
- `node .fluxiq/refactor/router-whitespace.cjs` -> 29 owned files, 0 whitespace/EOF failures.

Logs are `.fluxiq/refactor/router-foundations-final.log`, `router-types.log`, `router-structure.log`, `router-closure.log`, `router-parity.log`, and `router-whitespace.log`. All checks/processes completed; no further owned tests or guards are planned.

## Handoff and limits

Lead-owned `engine/automation/index.ts` and package exports may expose the canonical router barrel; this worker did not edit them. The owned `flows/executable/routing/index.ts` already exports the new execution DTOs. No service, route-state, SQL, admission, candidate, host, native/output, configuration, baseline or shared working-document edits occurred.

Not verified: whole-package checks/builds/full suites, complete service/producer integration, downstream/browser/provider behavior, or changes to existing routing semantics beyond extraction parity. No package/full suite/build/provider/browser/panel/git actions ran; no real user data was read. Changes remain uncommitted under lead-only git policy.
