# Core WIP salvage audit

Audited 2026-11-02, read-only, on `task/t843-runtime-foundations` at Core HEAD `407112d9c`. This is an audit of uncommitted source against HEAD, not fresh runtime validation. The sibling downstream checkout was clean. No tests, builds, providers, browsers, source edits or git mutations were run.

## Disposition

Preserve every group. Retain means a coherent candidate for narrow validation; finish means useful implementation with an identified integration gap; quarantine means preserve the draft outside a release until its owning implementation exists. None is declared passing.

All paths below are relative to `packages/fluxiq/src/`; brace expressions enumerate files, not additional files to discover. The inventory accounts for all **49 modified tracked source files and 109 untracked source files**.

| Group | Tracked / new | Disposition | Evidence and remaining work |
| --- | ---: | --- | --- |
| Project SQL, schema, migrations and mutations | 31 / 81 | Finish | Bodies and state preserved; missing project barrel/export, program consumers and tests remain. Details below. |
| Execution option descriptors | 7 / 6 | Finish | Coverage and option-copy checks use descriptors, but both new property-read adapters have zero consumers outside definitions/barrels. Actual callback reads remain direct. |
| Native clock extraction and log clock integration | 2 / 4 | Finish | Log invocation uses the new identity check; engine coverage still trusts live-environment wrappers that call mutable global delegates. No new clock tests. |
| Exchange-log barrel exports | 4 / 0 | Retain | Exposes existing framework-owned functions/classes through their owning barrels; no body or state copied. Validate public imports and existing narrow tests. |
| Run-cost ceiling relocation | 3 / 12 | Retain | Original implementation and original behavioral tests moved intact; legacy module aliases the canonical runtime exports and has an identity test. No fresh test execution. |
| Generic unknown-frame helper | 2 / 1 | Retain | Delegates through the original private observation binding and original source; existing frame tests now exercise it and reject copied observations. No fresh execution. |
| Model exchange-log contracts | 0 / 5 | Quarantine | Type-only draft, no consumers/implementation outside its own contract files, no feature barrel and no tests. Do not count this as completed logging migration. |

### Exact non-SQL inventory

- Descriptor tracked: `engine/automation/execution-admission/{copy.ts,internal/coverage.ts,kernel/index.ts,kernel/callback/index.ts,kernel/callback/unknown.ts,options/index.ts,options/record-batch.ts}`. New: `kernel/callback/{observed-property,property,unknown-sync}.ts` and `options/{data,descriptor,enumerable}.ts` under that same admission directory.
- Clock tracked: `framework/observability/exchange-log/native/{functions,invocation}.ts`. New: `framework/clock/index.ts`, `framework/clock/native/{functions,index,read}.ts`.
- Log exports tracked: `framework/observability/exchange-log/{index.ts,folder/index.ts,listing/index.ts,writer/index.ts}`.
- Budget tracked: `runtime/agents/budget/index.ts`, `programs/automation-studio/model/run-cost-ceiling/{run-cost-ceiling-env.ts,tests/run-cost-ceiling-env.test.ts}`. New under `runtime/agents/budget/run-cost-ceiling/`: `{default,env-key,index,maximum,resolve-test,resolve,scope-key,test-default}.ts`, `internal/{environment,index,process-environment}.ts`, `tests/run-cost-ceiling-env.test.ts`.
- Frame helper tracked: `runtime/execution-observation/{index.ts,tests/frame-unknown.test.ts}`. New: `runtime/execution-observation/mark-unknown.ts`.
- Log scaffolding new: `runtime/models/exchange-log/contracts/{exchange,index,legacy,port,presentation}.ts`.

## SQL move: preservation and gaps

Tracked origins are `programs/automation-studio/storage/schema-migrations.ts`, `storage/project/{administration,database,statement-cache,store-unavailable-error,unit-of-work}.ts`, and every one of the 25 `.ts` files directly in `storage/project/schema/`. All but administration are compatibility re-exports now; administration retains its repositories and their behavior.

The 81 new files under `framework/persistence/project/` are:

- `migrations/` (10): `{checksum,defaults,index,runner}.ts`, `contracts/{backup-context,index,migration,result,runner-options,state}.ts`.
- `mutations/` (11): `{digest,index,serialization,unit-of-work}.ts`, `contracts/{change-feed-operation,context,idempotent-result,index,record-status,record,touched-entity}.ts`.
- `sql/` (13): `{database,index,pool,statement-cache,store-unavailable-error}.ts`, `contracts/{cached-run-result,database-lease,executor,index,pool-options,run-result,wal-checkpoint-mode,wal-checkpoint-result}.ts`.
- `schema/` (47): root `{compiled-plans,domain-resources,graph-judgements,index,instruction-node-scope,mutations,relation-indexes,result-checks,ui-query-indexes}.ts`; `adaptation/{evidence,index,matching}.ts`; `conversation/{index,tables,turn-decision}.ts`; `dataset/{answers,index,tables}.ts`; `event/{cursor,index,retention,spool}.ts`; `flow/{index,scoped-keys,settings}.ts`; `guards/{foreign-key,index}.ts`; `recording/{description,index,stream}.ts`; `reusable-context/{audit,index,keyed-digest,tables,validation}.ts`; `router/{index,scaling,summary-detail,target-reference}.ts`; `runtime/{index,interrupted-status,summary-envelope}.ts`; `tables/{domain,index,mutation,search,stream-spool}.ts`.

### Body, state and migration comparison

A static TypeScript 5.9.3 AST/token comparison inspected every top-level declaration from the 31 changed storage origins against the current origins and all 81 destination files. It ignores the `export` modifier and trivia outside literals; literal spellings, SQL payloads, declaration order within each body and executable tokens remain part of comparison.

- Of 137 original declarations: **35 remain exact at their original path, 101 moved exactly, one has an equivalent type alias, zero are missing**. Prioritizing retained declarations avoids falsely classifying administration's three unchanged helper functions as moved duplicates.
- The one text change is `AutomationStudioCachedSqlRunResult`: formerly `{ changes: number; lastID: number }`, now an alias of `AutomationStudioSqlRunResult`, whose body is that exact shape.
- Database and pool class bodies, statement-cache body/constants/helpers, unit-of-work body/helpers, migration runner and checksum function, and the default migration array are preserved. No new SQL behavioral declaration was introduced by the move.
- Connection state (`operationTail`, counters, close state, statement cache), pool maps/timers/closing state, and migration module state (`migrationQueues`, `readyByConnection`, `setFingerprints`, lifecycle schema and ready probe) all moved with their original owners. The old modules re-export those owners, so source inspection finds one constructor and one set of module caches, not a second compatibility implementation.
- All 30 named schema migration constants, four table-name arrays, schema helpers, and the default array's inline administration migration/order are preserved. The old schema barrel's recursive export surface remains **34 names before and after**, with no lost or added name. Existing SQL rebuild/rekey operations were not redesigned here.

The schema split maps old leaves to new locations as follows; unchanged basenames omitted from the table remain directly under the new `schema/` directory.

| Old schema leaves | New schema locations |
| --- | --- |
| `adaptations`, `adaptation-matching` | `adaptation/evidence`, `adaptation/matching` |
| `conversations`, `conversation-turn-decision` | `conversation/tables`, `conversation/turn-decision` |
| `event-streams` | `event/{spool,cursor,retention}` |
| `flow-scoped-keys`, `flow-settings` | `flow/scoped-keys`, `flow/settings` |
| `foreign-key-guards` | `guards/foreign-key` |
| `recording-description`, `recording-stream` | `recording/description`, `recording/stream` |
| `reusable-llm-contexts` | `reusable-context/{tables,audit,validation,keyed-digest}` |
| `routers` | `router/{scaling,summary-detail,target-reference}` |
| `run-datasets` | `dataset/{tables,answers}` |
| `runtime-runs`, `runtime-run-interrupted-status` | `runtime/summary-envelope`, `runtime/interrupted-status` |
| `table-names` | `tables/{domain,search,mutation,stream-spool}` |

### Incomplete ownership and loss risk

1. `framework/persistence/project/index.ts` is missing, and `framework/persistence/index.ts` does not export project persistence. Existing package export `fluxiq/framework/persistence` therefore does not expose this canonical area. Do not mistake compatibility-path availability for the completed public owner boundary.
2. An AST import/export scan of Core `packages/**/*.ts(x)` found **254 direct edges to the changed old SQL paths: 147 program production edges and 107 test edges**. No direct runtime, engine or framework edge to those old paths was found in that scan. The move has not migrated those consumers or tests. Administration's metadata/change-feed/outbox/job repositories remain executable program backend code, as do the other unchanged project stores outside this WIP.
3. Of 152 import/export specifiers in the new SQL tree, all **144 relative specifiers resolve**, and none resolves back into `programs/`. The SQL implementations now point at framework performance owners rather than program aliases. The type import in `migrations/contracts/runner-options.ts` still bypasses the SQL barrel (`../../sql/database.ts`).
4. The greatest immediate loss risk is discarding or failing to stage the 81 untracked destinations while keeping tracked origin stubs: nearly all old bodies then disappear from a commit and the imports break. Preserve origins and destinations as one unit. Import edits must retain original constructors, cache identity, migration IDs, literal SQL, checksum function and default ordering; renaming an applied migration or changing SQL can invalidate the applied checksum ledger.
5. Static preservation does not prove upgrade safety, close/lease races, rollback durability or successful emitted imports. Those remain unverified. Do not run migrations against user data for acceptance.

Root separately reported its read-only structure audit failed on the new SQL paths: barrel bypass in `runner-options.ts`; statement packing in `serialization.ts` and `unit-of-work.ts`; swallowed failures in `sql/database.ts`. I inspected the referenced bodies, but did not execute that audit. Body parity explains why inherited violations can become newly gated at their destination; no permission to suppress the gates is implied.

## Descriptor and clock integration

The descriptor utilities walk own/inherited data descriptors without evaluating their accessors; copy checks cover enumerable own string and symbol fields. `record-batch.ts` reuses the descriptor lookup; coverage uses `automationDataProperty` for callback/host selection; `copy.ts` checks observed source and changes before spreading.

However, `automationExecutionProperty` and `automationObservedProperty` appear only in their definitions and export barrels. For a concrete unresolved path, `engine/automation/execution-admission/kernel/native-call.ts:8` still reads `options.nativeNodeExecutor` before callback admission. A getter installed after the initial coverage check would therefore be evaluated before this new refusal/fence adapter could run. This is source evidence of incomplete integration, not a runtime reproduction. The generic `markObservedExecutionFrameUnknown` helper itself preserves the original private-binding route and should be retained.

`NativeClock.available` checks the current container and method descriptors against bootstrap originals, and logging now re-checks availability before the clock read. Coverage adds original `Date.now`/`Math.random` only when that check passes. But it unconditionally trusts `automationStudioLiveRunEnvironment.now/random`; their unchanged bodies in `runtime/environment/live.ts:13,15` call current `Date.now`/`Math.random`. Those wrapper identities can remain unchanged after a global replacement. Native clock extraction therefore is not complete clock coverage. Finish the observed delegate path and add negative tests; do not claim all clocks are pinned.

## Small retained units and quarantined draft

- **Budget:** original runtime/test defaults remain `$0.25` / `$0.10`, the test environment scope is unchanged and the maximum remains `$10`; this move does not change the separate Lab allowance. All implementation declarations match their originals. The original behavioral test is byte-identical after line-ending normalization at its new path; the old test is replaced with namespace-name and value/function identity parity against the canonical module. `runtime/agents/index.ts` already exports budget, so its new budget barrel export is reachable from the existing agents entry point. Retain and narrowly validate.
- **Frame helper:** `markObservedExecutionFrameUnknown` reads the original `ExecutionObservationBindings` and invokes its original source. The altered frame test calls it twice, checks another invocation is refused and checks a copied observation is rejected. Retain; the test changes are claims until executed.
- **Log exports:** folder, listing, writer and root native barrel additions expose existing framework objects. Retain these four export-only edits separately from the new model contracts and clock behavior.
- **Log contracts:** `NativeModelLogPort`, `NativeModelLogExchange`, `NativeModelLogPresentation`, `NativeModelLogLegacyObserver` are references only inside their five contract files. There is no `runtime/models/exchange-log/index.ts`, implementation, caller or test. Preserve as a quarantined design draft until the real model-observer lifecycle owns it; do not broaden current scope to finish it during this audit.

## Smallest next acceptance checks (not run)

After authorized implementation, run `pnpm --filter fluxiq check` and `pnpm structure:check`; fix the concrete destination-path violations instead of increasing a baseline. No whole-suite sweep is needed for salvage acceptance.

- SQL: `pnpm --filter fluxiq exec vitest run src/programs/automation-studio/storage/project/tests/database.test.ts src/programs/automation-studio/storage/tests/schema-migrations.test.ts src/programs/automation-studio/storage/tests/schema-migrations-ready-memo.test.ts src/programs/automation-studio/storage/project/tests/administration.test.ts src/programs/automation-studio/storage/project/tests/unit-of-work.test.ts src/programs/automation-studio/storage/project/schema/tests`. Add/move owner-local identity tests and an isolated old-schema upgrade with representative rows to prove rekeys/rebuilds preserve rows and applied IDs/checksums. Exercise the normal public persistence package seam after adding its barrel.
- Descriptors: `pnpm --filter fluxiq exec vitest run src/engine/automation/execution-admission/tests`. Add own/inherited callback getters, getters installed after admission, symbol-key option copies and a durable unknown-frame check covering the actual adapters rather than only helper calls.
- Clock/log: `pnpm --filter fluxiq exec vitest run src/framework/observability/exchange-log/native/tests/invocation.test.ts src/framework/observability/exchange-log/writer/tests/native.test.ts src/framework/observability/exchange-log/folder/tests/operation.test.ts src/framework/observability/exchange-log/listing/tests/operation.test.ts`. Add owner-local `NativeClock` tests and live-wrapper mutation checks; verify original thrown error and unsupported-state behavior.
- Budget/helper: `pnpm --filter fluxiq exec vitest run src/runtime/agents/budget/run-cost-ceiling/tests/run-cost-ceiling-env.test.ts src/programs/automation-studio/model/run-cost-ceiling/tests/run-cost-ceiling-env.test.ts src/runtime/execution-observation/tests/frame-unknown.test.ts`.
- Log contracts: no acceptance claim while quarantined. If resumed, implement their lifecycle and verify original callback tuple, receiver/environment identity, failed/succeeded/reply accounting and actual durable writes before integrating.

## Audit commands and observed results

All commands ran in `C:/Users/osrs_/FluxStuff/fxwork/t843/!FluxIQ` unless stated otherwise. These are source inspections, not passing product checks.

| Command | Observed result |
| --- | --- |
| `git status --short`; `git branch --show-current`; `git log -5 --oneline` | WIP inventory above; branch `task/t843-runtime-foundations`; HEAD `407112d9c`, prior checkpoint `c0dee9bbe`. |
| `git status --short` in sibling downstream | Empty output. |
| `git diff --stat`; `git -c core.autocrlf=false diff -- <assigned descriptor/log/budget/helper paths>` | 49 tracked files, 123 insertions and 2952 deletions; inspected actual diffs. Initial command emitted LF/CRLF notices; no git state was changed. |
| `git ls-files --others --exclude-standard packages/fluxiq/src` | 109 untracked sources: 81 SQL, 6 descriptor, 4 clock, 12 budget, 1 helper, 5 log-contract files. |
| `git show HEAD:<origin>` plus Node stdin static probes using `typescript.createSourceFile/createScanner` and `fs.readFileSync` | 137 original declarations accounted for; 101 exact moved, 35 exact retained, 1 equivalent alias, 0 missing. Recursive schema exports: 34 before/after; no lost/added symbols. |
| Node stdin AST import/export probes over `rg --files packages -g '*.ts' -g '*.tsx'` and all new SQL files | 254 old-path consumer edges; 144 relative SQL specifiers resolve; 0 new SQL imports into programs. |
| `rg -n 'automationExecutionProperty\|automationObservedProperty\|markAutomationCallbackFrameUnknownSync\|NativeClock\|originalNativeClockFunctions\|NativeModelLog(Port\|Exchange\|Presentation\|LegacyObserver)' packages/fluxiq/src` (extended-regex alternatives used) | Descriptor adapters and model contracts have no production consumers outside their own definitions/barrels; actual clock integration limited to coverage and exchange-log. |
| `rg -n 'Date.now\|Math.random\|now:\|random:' packages/fluxiq/src/runtime/environment` (extended-regex alternatives used); direct `Get-Content` of `live.ts`, `native-call.ts` and moved SQL owners | Confirmed mutable environment clock delegates, pre-admission direct native callback read, and preserved representative state/migration bodies. |

Outcome: Done
Changed: docs/working/runtime-ownership-reset-plan/reports/wip-salvage.md only
Validation: Read-only git/diff/AST/import inspection -> all WIP source groups accounted for; no tests/builds run by instruction
Not verified: Runtime behavior, SQL upgrades/data preservation on disk, typecheck, structure audit execution, emitted public imports, composed acceptance
Report: docs/working/runtime-ownership-reset-plan/reports/wip-salvage.md
Notes: Preserve all WIP; retain small coherent moves, finish SQL/descriptor/clock integration, quarantine isolated log contracts. No source or git mutation.
