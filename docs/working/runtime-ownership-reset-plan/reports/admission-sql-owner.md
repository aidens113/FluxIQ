# Admission and command-ledger SQL owners

Status: P1 implementation complete; owned SQL source frozen for Root integration. Original body/declaration parity, direct aliases, source/type closure and focused acceptance pass. Exact outside consumer retargeting is now complete; emitted/global gates remain Root-owned.

## Pre-edit original/canonical declaration manifest

Paths are relative to packages/fluxiq/src/. Each original becomes a direct compatibility export of the same canonical declaration; no distinct same-name aliases. Private declarations move with their original module.

| Original | Canonical | Original declarations (private marked) |
| --- | --- | --- |
| `programs/automation-studio/storage/project/command-ledger/admission.ts` | `framework/persistence/project/command-ledger/admission.ts` | AutomationStudioCommandRunAdmission |
| `programs/automation-studio/storage/project/command-ledger/contracts.ts` | `framework/persistence/project/command-ledger/contracts.ts` | AutomationStudioCommandLedgerOperation; AutomationStudioCommandLedgerMutationProof; AutomationStudioCommandRunObservation; AUTOMATION_STUDIO_COMMAND_SCAN_LIMIT; AUTOMATION_STUDIO_COMMAND_SCAN_PAGE; AutomationStudioCommandConsumptionOwner |
| `programs/automation-studio/storage/project/command-ledger/index.ts` | `framework/persistence/project/command-ledger/index.ts` | barrel only |
| `programs/automation-studio/storage/project/command-ledger/migration.ts` | `framework/persistence/project/command-ledger/migration.ts` | AUTOMATION_STUDIO_COMMAND_LEDGER_MIGRATION |
| `programs/automation-studio/storage/project/command-ledger/store.ts` | `framework/persistence/project/command-ledger/store.ts` | ClaimRow (private); ReceiptRow (private); UnknownRow (private); AutomationStudioProjectCommandLedgerStore |
| `programs/automation-studio/storage/project/execution-admission/admission.ts` | `framework/persistence/project/execution-admission/admission.ts` | reserveExecutionAdmission; enterExecutionAdmission |
| `programs/automation-studio/storage/project/execution-admission/codec.ts` | `framework/persistence/project/execution-admission/codec.ts` | executionAdmissionDecode; executionAdmissionEntry; executionAdmissionRow; executionAdmissionKey; executionAdmissionEventValue; flag (private); revision (private); nullableText (private) |
| `programs/automation-studio/storage/project/execution-admission/command-inventory.ts` | `framework/persistence/project/execution-admission/commands/inventory.ts` | ExecutionCommandInventory |
| `programs/automation-studio/storage/project/execution-admission/command-link.ts` | `framework/persistence/project/execution-admission/commands/link.ts` | ExecutionAdmissionCommandLink |
| `programs/automation-studio/storage/project/execution-admission/command-proof.ts` | `framework/persistence/project/execution-admission/commands/proof.ts` | readExecutionCommandLinkProof |
| `programs/automation-studio/storage/project/execution-admission/commands.ts` | `framework/persistence/project/execution-admission/commands/create.ts` | createExecutionAdmissionCommandLink |
| `programs/automation-studio/storage/project/execution-admission/context.ts` | `framework/persistence/project/execution-admission/context.ts` | ExecutionAdmissionStorageContext |
| `programs/automation-studio/storage/project/execution-admission/event.ts` | `framework/persistence/project/execution-admission/event.ts` | ExecutionAdmissionEvent |
| `programs/automation-studio/storage/project/execution-admission/evidence.ts` | `framework/persistence/project/execution-admission/evidence.ts` | appendExecutionAdmissionEvidence |
| `programs/automation-studio/storage/project/execution-admission/finish.ts` | `framework/persistence/project/execution-admission/finish.ts` | finishExecutionAdmission |
| `programs/automation-studio/storage/project/execution-admission/index.ts` | `framework/persistence/project/execution-admission/index.ts` | barrel only |
| `programs/automation-studio/storage/project/execution-admission/inventory.ts` | `framework/persistence/project/execution-admission/inventory.ts` | LIMIT (private); readExecutionAdmissionInventory; apply (private); validateJoins (private) |
| `programs/automation-studio/storage/project/execution-admission/migration.ts` | `framework/persistence/project/execution-admission/migration.ts` | AUTOMATION_STUDIO_EXECUTION_ADMISSION_MIGRATION |
| `programs/automation-studio/storage/project/execution-admission/mutation.ts` | `framework/persistence/project/execution-admission/mutation.ts` | mutateExecutionAdmission |
| `programs/automation-studio/storage/project/execution-admission/proof.ts` | `framework/persistence/project/execution-admission/proof.ts` | executionAdmissionEventDigest; verifyExecutionAdmissionEvent |
| `programs/automation-studio/storage/project/execution-admission/release.ts` | `framework/persistence/project/execution-admission/release.ts` | releaseExecutionAdmission |
| `programs/automation-studio/storage/project/execution-admission/rows.ts` | `framework/persistence/project/execution-admission/rows.ts` | ExecutionAdmissionRows |
| `programs/automation-studio/storage/project/execution-admission/scope.ts` | `framework/persistence/project/execution-admission/scope.ts` | openExecutionAdmissionScope |
| `programs/automation-studio/storage/project/execution-admission/snapshot.ts` | `framework/persistence/project/execution-admission/snapshot.ts` | ExecutionAdmissionSnapshot |
| `programs/automation-studio/storage/project/execution-admission/state.ts` | `framework/persistence/project/execution-admission/state.ts` | executionAdmissionAncestors; requireActiveExecutionEntry; inspectExecutionAdmission; executionAdmissionTouches; executionAdmissionFrontier |
| `programs/automation-studio/storage/project/execution-admission/store.ts` | `framework/persistence/project/execution-admission/store.ts` | AutomationStudioProjectExecutionAdmissionStore |
| `programs/automation-studio/storage/project/execution-admission/write.ts` | `framework/persistence/project/execution-admission/write.ts` | writeExecutionAdmissionEvent |

Accepted bulk baseline `inventory.ts`: SHA-256 `fc8ef8463a4aced7b194fb5135053817f2bbb86ec7a096012b49eb361964446b`.

Accepted bulk baseline `proof.ts`: SHA-256 `83213c0502799342a52f8337a0b728931259cbfa8c8cff0300d0a147bb33c1d3`.

## Original owned test/support files

- `programs/automation-studio/storage/project/command-ledger/tests/process-restart.test.ts`
- `programs/automation-studio/storage/project/command-ledger/tests/run-fence.test.ts`
- `programs/automation-studio/storage/project/command-ledger/tests/store.test.ts`
- `programs/automation-studio/storage/project/execution-admission/tests/command-source.ts`
- `programs/automation-studio/storage/project/execution-admission/tests/commands.test.ts`
- `programs/automation-studio/storage/project/execution-admission/tests/fixture.ts`
- `programs/automation-studio/storage/project/execution-admission/tests/inventory.test.ts`
- `programs/automation-studio/storage/project/execution-admission/tests/proof-index.test.ts`
- `programs/automation-studio/storage/project/execution-admission/tests/store.test.ts`

## Validation

Not run yet by this worker. No source edited when this manifest was recorded.

## Outside consumer manifest (Root-authorized exact replacements applied)

Root exclusively assigned these 17 outside files / 19 exact module specifiers for a surgical follow-up; all listed replacements are now applied. This covers direct static/type/dynamic-string imports to the original 27 source modules; old test-fixture imports remain in their original owner and are not moved.

| Outside consumer | Exact specifier changes |
| --- | --- |
| `programs/automation-studio/runtime/candidate-trials/authority/tests/configured-source.test.ts` | line 4: `../../../../storage/project/execution-admission/index.ts` -> `../../../../../../framework/persistence/project/execution-admission/index.ts` |
| `programs/automation-studio/runtime/candidate-trials/authority/tests/source.test.ts` | line 7: `../../../../storage/project/execution-admission/index.ts` -> `../../../../../../framework/persistence/project/execution-admission/index.ts` |
| `programs/automation-studio/runtime/candidate-trials/partial/tests/admission.test.ts` | line 4: `../../../../storage/project/execution-admission/index.ts` -> `../../../../../../framework/persistence/project/execution-admission/index.ts` |
| `programs/automation-studio/runtime/project-agents/record-completion/tests/fixture.ts` | line 5: `../../../../storage/project/execution-admission/index.ts` -> `../../../../../../framework/persistence/project/execution-admission/index.ts` |
| `programs/automation-studio/runtime/project-agents/record-completion/tests/store-completion.test.ts` | line 8: `../../../../storage/project/execution-admission/index.ts` -> `../../../../../../framework/persistence/project/execution-admission/index.ts` |
| `programs/automation-studio/runtime/service/execution-admission/binding.ts` | line 4: `../../../storage/project/execution-admission/index.ts` -> `../../../../../framework/persistence/project/execution-admission/index.ts` |
| `programs/automation-studio/runtime/service/execution-admission/command-bridge.ts` | line 2: `../../../storage/project/command-ledger/index.ts` -> `../../../../../framework/persistence/project/command-ledger/index.ts` |
| `programs/automation-studio/runtime/service/execution-admission/context.ts` | line 3: `../../../storage/project/command-ledger/index.ts` -> `../../../../../framework/persistence/project/command-ledger/index.ts`; line 5: `../../../storage/project/execution-admission/index.ts` -> `../../../../../framework/persistence/project/execution-admission/index.ts` |
| `programs/automation-studio/runtime/service/execution-admission/controller.ts` | line 3: `../../../storage/project/execution-admission/index.ts` -> `../../../../../framework/persistence/project/execution-admission/index.ts`; line 4: `../../../storage/project/command-ledger/index.ts` -> `../../../../../framework/persistence/project/command-ledger/index.ts` |
| `programs/automation-studio/runtime/service/execution-admission/gateway.ts` | line 4: `../../../storage/project/execution-admission/index.ts` -> `../../../../../framework/persistence/project/execution-admission/index.ts` |
| `programs/automation-studio/runtime/service/execution-admission/run.ts` | line 3: `../../../storage/project/execution-admission/index.ts` -> `../../../../../framework/persistence/project/execution-admission/index.ts` |
| `programs/automation-studio/runtime/service/execution-admission/tests/gateway.test.ts` | line 4: `../../../../storage/project/execution-admission/index.ts` -> `../../../../../../framework/persistence/project/execution-admission/index.ts` |
| `programs/automation-studio/runtime/service/project-build/tests/reset-calls.test.ts` | line 9: `../../../../storage/project/execution-admission/index.ts` -> `../../../../../../framework/persistence/project/execution-admission/index.ts` |
| `programs/automation-studio/runtime/service/tests/spend-completion.test.ts` | line 9: `../../../storage/project/execution-admission/index.ts` -> `../../../../../framework/persistence/project/execution-admission/index.ts` |
| `programs/automation-studio/storage/project/index.ts` | line 36: `./command-ledger/index.ts` -> `../../../../framework/persistence/project/command-ledger/index.ts` |
| `programs/automation-studio/storage/project/tests/administration.test.ts` | line 15: `../command-ledger/index.ts` -> `../../../../../framework/persistence/project/command-ledger/index.ts` |
| `tests/native-repository-completion.test.ts` | line 13: `../programs/automation-studio/storage/project/execution-admission/index.ts` -> `../framework/persistence/project/execution-admission/index.ts` |

## Result and preserved ownership

Moved the original coupled 27 source modules to 28 canonical files, adding only the narrow commands barrel. Admission and command-ledger stores share the original canonical project SQL/UOW/migration owners and original claim/proof transaction; no store, authority, map, registry, cache or wrapper implementation was duplicated. The accepted transaction-local mutation-proof index and command_link direct SQL path are unchanged.

Original execution-admission/command-ledger source files now contain direct export declarations only, including direct type reexports (no new same-name type aliases). Every original export name and runtime binding is retained. Admission command-inventory/link/proof and existing commands creator moved into commands/{inventory,link,proof,create}.ts. The narrow commands/index.ts does not export either store, preventing the new ledger/admission value cycle that a root-barrel proof import would introduce.

Canonical project/index.ts exports both new owners through the existing server-only framework/persistence public seam. No package.json or other persistence/runtime/engine implementation changed. All migration, table, source/owner key, digest and failure/error behavior stays as before. No behavioral correction was bundled with the move.

## Owned consumer/test import manifest

Only 7 module specifiers in 6 existing owned test/support files changed. Original test assertions and fixture bodies were preserved.

- `programs/automation-studio/storage/project/command-ledger/tests/run-fence.test.ts:8`: `../index.ts` -> `../../../../../../framework/persistence/project/command-ledger/index.ts`
- `programs/automation-studio/storage/project/command-ledger/tests/store.test.ts:7`: `../index.ts` -> `../../../../../../framework/persistence/project/command-ledger/index.ts`
- `programs/automation-studio/storage/project/execution-admission/tests/commands.test.ts:5`: `../../command-ledger/index.ts` -> `../../../../../../framework/persistence/project/command-ledger/index.ts`
- `programs/automation-studio/storage/project/execution-admission/tests/commands.test.ts:8`: `../index.ts` -> `../../../../../../framework/persistence/project/execution-admission/index.ts`
- `programs/automation-studio/storage/project/execution-admission/tests/fixture.ts:5`: `../index.ts` -> `../../../../../../framework/persistence/project/execution-admission/index.ts`
- `programs/automation-studio/storage/project/execution-admission/tests/proof-index.test.ts:5`: `../index.ts` -> `../../../../../../framework/persistence/project/execution-admission/index.ts`
- `programs/automation-studio/storage/project/execution-admission/tests/store.test.ts:4`: `../index.ts` -> `../../../../../../framework/persistence/project/execution-admission/index.ts`

Added `owner-identity.test.ts` in each immediate legacy test directory (not canonical directories): snapshot-derived original export-name sets and every runtime value/function identity are checked, together with store constructor/prototype identity and nominal constructor assignability. No real database opens in these two identity-only files.

## Validation observed

- `pnpm.cmd --filter fluxiq exec vitest run src/programs/automation-studio/storage/project/execution-admission/tests src/programs/automation-studio/storage/project/command-ledger/tests/store.test.ts src/programs/automation-studio/storage/project/command-ledger/tests/run-fence.test.ts src/programs/automation-studio/storage/project/command-ledger/tests/owner-identity.test.ts --minWorkers=1 --maxWorkers=2` -> **8 files / 60 tests passed**, exit 0. All current original admission store/inventory/commands/proof-index and command-ledger store/run-fence cases ran, plus four new alias/constructor checks. Wall **45.65 s**; transform 11.58 s, collection 43.30 s, test time 19.27 s (reported phases overlap across workers).
- Preserved acceptance includes fixed native proof gets **0 / 0** at 8 / 24 completed children, zero missing-proof native fallback, every old-proof corruption case, project isolation, late commit rejection rolling claim/link/event back atomically, one-send contenders, immutable receipt reconciliation, unknown/required fences and original reopened counter behavior. No original assertion was weakened or removed.
- Strict narrow TypeScript program rooted at `framework/persistence/project/{execution-admission,command-ledger}/index.ts`, inheriting packages/fluxiq/tsconfig.json compiler options with noEmit and incremental disabled -> **271 Core source modules, 0 diagnostics, 0 program modules**, exit 0. This is an owner closure check, not the package-wide check.
- Snapshot/TypeScript token comparison -> **all 49 original top-level declarations exact**, including complete class/method/state bodies and all SQL/migration literals. Only owner-relative import-type module addresses are normalized for comparison. **0 declarations were omitted or behaviorally mutated.**
- Original-alias AST inspection -> **all 27 old modules contain export-from declarations only**; no retained implementations or distinct type aliases.
- Canonical relative source scan -> **28 files / 165 relative import/export/type edges, 0 unresolved targets, 0 direct program imports**.
- File-local budget inspection -> all three canonical directories have barrels, source counts **18 / 5 / 5**, maximum file length **439**, maximum class methods **31**, **0 packed statement pairs**. This is a local structural inspection, not the repository audit.

## Deferred gates and exact limits

- Outside consumer retargeting is complete: Root exclusively assigned the exact **17 files / 19 specifiers** listed above. Every replacement destination resolves, and reverse reconstruction recovers every before-file byte exactly. No other bytes or files changed in this follow-up. Broader public/type integration remains Root-owned.
- Original `command-ledger/tests/process-restart.test.ts` was intentionally not executed against stale dist. Its emitted child probe and killed-after-effect/reopen oracle remain unchanged; Root must run it with FLUXIQ_COMMAND_PROCESS_RESTART_PROBE=1 after rebuilding the exported package. Its native SQLite work happens in child processes, not this Vitest process.
- Root owns rebuilt `fluxiq/framework/persistence` runtime import acceptance, full package/structure/public/browser graph gates, and the original composed benchmark on one coherent source freeze. No package-wide check/build/audit, composed run, browser, panel or paid call was launched here.
- The narrow type closure and tests are current observations. They do not establish the previous stalled-build cause or an end-to-end timing improvement. This move preserved the already accepted proof optimization; it did not add another optimization.

## Exact worker-touched source/test paths

- `packages/fluxiq/src/framework/persistence/project/command-ledger/admission.ts`
- `packages/fluxiq/src/framework/persistence/project/command-ledger/contracts.ts`
- `packages/fluxiq/src/framework/persistence/project/command-ledger/index.ts`
- `packages/fluxiq/src/framework/persistence/project/command-ledger/migration.ts`
- `packages/fluxiq/src/framework/persistence/project/command-ledger/store.ts`
- `packages/fluxiq/src/framework/persistence/project/execution-admission/admission.ts`
- `packages/fluxiq/src/framework/persistence/project/execution-admission/codec.ts`
- `packages/fluxiq/src/framework/persistence/project/execution-admission/commands/create.ts`
- `packages/fluxiq/src/framework/persistence/project/execution-admission/commands/index.ts`
- `packages/fluxiq/src/framework/persistence/project/execution-admission/commands/inventory.ts`
- `packages/fluxiq/src/framework/persistence/project/execution-admission/commands/link.ts`
- `packages/fluxiq/src/framework/persistence/project/execution-admission/commands/proof.ts`
- `packages/fluxiq/src/framework/persistence/project/execution-admission/context.ts`
- `packages/fluxiq/src/framework/persistence/project/execution-admission/event.ts`
- `packages/fluxiq/src/framework/persistence/project/execution-admission/evidence.ts`
- `packages/fluxiq/src/framework/persistence/project/execution-admission/finish.ts`
- `packages/fluxiq/src/framework/persistence/project/execution-admission/index.ts`
- `packages/fluxiq/src/framework/persistence/project/execution-admission/inventory.ts`
- `packages/fluxiq/src/framework/persistence/project/execution-admission/migration.ts`
- `packages/fluxiq/src/framework/persistence/project/execution-admission/mutation.ts`
- `packages/fluxiq/src/framework/persistence/project/execution-admission/proof.ts`
- `packages/fluxiq/src/framework/persistence/project/execution-admission/release.ts`
- `packages/fluxiq/src/framework/persistence/project/execution-admission/rows.ts`
- `packages/fluxiq/src/framework/persistence/project/execution-admission/scope.ts`
- `packages/fluxiq/src/framework/persistence/project/execution-admission/snapshot.ts`
- `packages/fluxiq/src/framework/persistence/project/execution-admission/state.ts`
- `packages/fluxiq/src/framework/persistence/project/execution-admission/store.ts`
- `packages/fluxiq/src/framework/persistence/project/execution-admission/write.ts`
- `packages/fluxiq/src/framework/persistence/project/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/command-ledger/admission.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/command-ledger/contracts.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/command-ledger/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/command-ledger/migration.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/command-ledger/store.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/command-ledger/tests/owner-identity.test.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/command-ledger/tests/run-fence.test.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/command-ledger/tests/store.test.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/admission.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/codec.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/command-inventory.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/command-link.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/command-proof.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/commands.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/context.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/event.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/evidence.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/finish.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/index.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/inventory.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/migration.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/mutation.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/proof.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/release.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/rows.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/scope.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/snapshot.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/state.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/store.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/tests/commands.test.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/tests/fixture.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/tests/owner-identity.test.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/tests/proof-index.test.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/tests/store.test.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/write.ts`

Initial owner move: **64 source/test files plus this report**. The three original owned test/support files absent from this list were read and retained unchanged. The subsequent authorized consumer follow-up adds the 17 exact files from the consumer table above: **81 total source/test files plus this report**. No shared document was edited.

## Surgical outside-consumer follow-up

Root exclusively assigned the previously recorded TEMP/t843-admission-sql-outside-consumers.json manifest after the owner move: 17 files and 19 import/export/type module specifiers. No other file, statement, declaration, fixture, assertion, function, receiver, runtime behavior, or line ending was authorized or changed. Main service.ts, engine, runtime/environment and other workers' source were not edited.

Observed check: a Node/TypeScript manifest-bounded preflight located every exact original module specifier and verified all replacement targets; current before-bytes were retained outside the repository. After replacement, reversing only those 19 specifiers reproduced each complete original Buffer exactly. Result: **17 files, 19 replacements, 2 existing canonical destination barrels, 0 unresolved destinations and 0 unrelated changed bytes**. The only destinations are framework/persistence/project/{execution-admission,command-ledger}/index.ts.

No test, typecheck, package-wide source reader, build or audit was run in this follow-up while the callback worker remained active. Earlier 60-test/271-module acceptance belongs to the owner move before this import-only follow-up; fresh integrated gates remain Root's responsibility. All assigned source is frozen again.

Outcome: Done
Changed: Original P1 owner move and report as listed above, plus precisely 17 assigned outside-consumer files / 19 specifiers
Validation: Owner move -> 8 files / 60 tests passed, 271-module strict closure with 0 diagnostics/programs, 49 exact declarations; consumer follow-up -> 19 existing destinations resolved and complete before-byte recovery for all 17 files
Not verified: Fresh integrated type/test/build/public-emission gates after consumer retargeting, emitted process-restart acceptance and original composed benchmark
Report: docs/working/runtime-ownership-reset-plan/reports/admission-sql-owner.md
Notes: All assigned source frozen again. No test/package-wide reader in consumer follow-up; no git, agents or shared-plan edits.
