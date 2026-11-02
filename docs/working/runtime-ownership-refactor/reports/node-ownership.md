# Node Ownership Migration

Outcome: Done

## Result

Moved the 93 neutral Automation Studio node source modules into `components/automation/`. The retained Studio importer SDK stays program-owned. The original production paths remain compatibility facades and resolve to canonical singleton implementations; leaf facades name their existing values and types through their canonical directory barrels.

Closed support ownership (paths below relative to `packages/fluxiq/src/`):

- `programs/automation-studio/model/action-consequences/**` -> `components/automation/action-effect/consequences/**`.
- `AutomationStudioFlowScope` -> `flows/executable/scope.ts`; extracted from the old model before handing that file to the executor worker.
- Validation issue/severity/result and result builders -> `flows/executable/validation/**`.
- Permission request DTOs, parser, sentence builder and consequence contract -> `runtime/action-permissions/**`.
- Conversation ask DTOs/helpers, run ask views/drafts and ask-effect builder -> `runtime/interaction/**`. Legacy paths retain the same exported names and wire schema.
- Canonical node failure/actionability imports use `@fluxiq/contracts/runtime` and its neutral type/function names.
- `automationStudioSourceNodeRoot` names the canonical source directory. Existing custom/project storage addresses are unchanged.

The previously oversized `shared/definition.ts` implementation is split by ownership into builtin construction, visual ports, execution results and typed value/path readers. The shared path remains a facade. No baseline violations were copied or raised. The malformed runtime-contract-call test uses `Reflect.apply` rather than `as never`. Random precision readers now use the math barrel.

Canonical feature barrel additions:
- control-flow: branch.ts, call-subflow.ts, end.ts, for-each.ts, handler-end.ts, handler.ts, loop.ts, merge.ts, parallel.ts, repeat.ts, shared.ts, start.ts, switch.ts
- data: constant.ts, filter-list.ts, get-variable.ts, map-object.ts, set-variable.ts, shared.ts, write-records.ts
- database: insert.ts, query.ts, shared.ts, update.ts
- logic: and.ts, compare.ts, not.ts, or.ts, shared.ts
- math: add.ts, clamp.ts, divide.ts, multiply.ts, round.ts, shared.ts, subtract.ts
- policy: action.ts, expectation.ts, recovery.ts, shared.ts
- random: jitter.ts, random-choice.ts, random-number.ts, shared.ts, weighted-choice.ts
- routine: approval.ts, shared.ts, task-policy.ts
- timing: debounce.ts, retry.ts, shared.ts, timeout.ts, wait.ts


The root canonical pack still excludes the Studio SDK. Original Studio feature barrels retain their original named surface even where canonical feature barrels now expose leaf authorities for compatibility facades.

## Tests

Relocated 21 original node test files to canonical owning `tests/` folders. Split the original registry file's two SDK tests into the retained `programs/automation-studio/nodes/tests/importer-sdk.test.ts`.

Added canonical source-dependency closure tests (including erased type imports), neutral interaction and permission wire-contract regressions, Studio node singleton/API identity tests, and a Studio runtime compatibility test. Canonical tests contain no Studio imports; compatibility assertions live on the legacy Studio side.

Validation: `pnpm.cmd --filter fluxiq exec vitest run src/components/automation src/runtime/interaction/tests src/runtime/action-permissions/tests src/programs/automation-studio/nodes/tests src/programs/automation-studio/runtime/tests/framework-contract-compatibility.test.ts src/programs/automation-studio/runtime/parking/tests/settlement.test.ts src/programs/automation-studio/runtime/action-permissions/tests/gate.test.ts src/programs/automation-studio/runtime/action-permissions/tests/destructive.test.ts` -> `30 passed (30) files; 246 passed (246) tests; 34.69s`.

Validation: `node --input-type=module` (inline createContext probe scoped to this worker's source paths, excluding matcher-owned importer SDK; rules imports/exported-values/as-never/naming/directory-files/file-lines/statement-packing/import-cycles/test-placement) -> `268 script files; 0 failures and 0 warnings across 9 rules`.

Earlier observation: initial moved test run passed 235/236 tests; the sole failure was a hardcoded contracts-directory address in the moved record-process test. Corrected the relative address, then the focused run passed 243/243, followed by the final 246/246 after structural/facade-test refinements. The PowerShell `pnpm.ps1` shim is blocked by shell policy; `pnpm.cmd` works.

## Coordination

Lead approved the extra `programs/automation-studio/runtime/parking/ask.ts` DTO-authority move and `programs/automation-studio/runtime/tests/framework-contract-compatibility.test.ts` for legacy identity assertions.

Released after completing my changes:

- `components/automation/contracts.ts` to the matcher worker for its honest unresolved-without-matcher status.
- Old Studio `runtime/parking/ask.ts` and `ask-effect.ts` to the executor worker for parser/parking closure. Informed that its facade exports must target the canonical interaction barrel.
- Old `model/flows.ts` to the executor worker after scope extraction.
- `flows/executable/index.ts` to the lead, initially exporting only `scope.ts` and `validation/index.ts`.

The retained importer SDK is matcher-owned. A scoped probe observed its two barrel skips and six packed lines during that worker's edits; sent those exact findings to the owner. They are excluded from my final source-scope check.

Not verified: package-wide typecheck/build (deferred by brief until other source workers settle), whole-repository structure audit, public package exports/config/root-barrel integration, manual browser/live behavior. No full suite, paid provider call, panel management or git command was run.

Report: docs/working/runtime-ownership-refactor/reports/node-ownership.md
