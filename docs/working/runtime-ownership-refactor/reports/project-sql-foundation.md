# Project SQL foundation: exact ownership design

Status: USER STOP acknowledged; implementation release revoked. Initial mechanical ownership writes are saved, unverified and frozen. No further source/test edit, test/compiler/audit/build or migration continuation is authorized. Root/user requires an actual plan before continuation.
Brief: `../briefs/project-sql-foundation.md`; context: Current State and remaining-backend-owner-map release 1.
Paths below are relative to `packages/fluxiq/src`; no tests/compiler/audit/build ran for this discovery.

## Bounded source map

| Original owner | Actual canonical destination / exact slice |
| --- | --- |
| `programs/automation-studio/storage/project/database.ts` | `framework/persistence/project/sql/{database,pool}.ts`: original connection and pool classes, with their own existing private helpers/state; no wrapper or copied pool. |
| Same file's six exported types | `sql/contracts/{run-result,wal-checkpoint-mode,wal-checkpoint-result,executor,database-lease,pool-options}.ts`, one complete original declaration per leaf. Lease still names the actual database class. |
| `project/statement-cache.ts` | `sql/statement-cache.ts`: original cache class, 128-entry LRU, regexes/native helpers; its complete cached-run-result alias gets a contract leaf, reusing the identical run-result authority. |
| `project/store-unavailable-error.ts` | `sql/store-unavailable-error.ts`: original class and exact code/cause-chain check; preserve constructor object, message strings and code. |
| `project/unit-of-work.ts` | `mutations/{unit-of-work,digest,serialization}.ts`: original class, digest function and ONE shared stableStringify helper; original replay error/private row/validation helpers stay with UnitOfWork. |
| Same file's five exported types | `mutations/contracts/{record-status,record,touched-entity,context,idempotent-result}.ts`, complete original fields, optionals and generic parameter. |
| EXACT `project/administration.ts` type slice | Move only `AutomationStudioChangeFeedOperation = "create"|"update"|"delete"|"touch"` to `mutations/contracts/change-feed-operation.ts`; old administration imports/reexports that same authority. |
| EXACT administration default array | Move ONE original `AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS` initializer to `migrations/defaults.ts`, including its inline 0001 object and existing referenced migration objects. Administration and UnitOfWork consume this same array. |
| `storage/schema-migrations.ts` | `migrations/{runner,checksum}.ts`: original runner/helpers and actual checksum function; all migration queue/readiness state remains solely in runner. |
| Same file's five exported types | `migrations/contracts/{migration,backup-context,runner-options,result,state}.ts`, exact original fields and callbacks; database/executor types come from canonical sql. |
| `project/schema/**` | Full original DDL/constants/helper ownership to the schema map below; old files become exact exports. No SQL rewriting. |

Every new directory has an index. Preserve original declaration names/constructor names internally; neutral barrels may expose aliases without wrapper classes/functions. Old database/cache/error/unit/migration exports resolve to those exact originals. Existing `project/schema.ts` can retain its one-line reexport; old schema/index becomes exact canonical exports. Other project/storage parents need no worker edit.

## Exact schema grouping

The current schema has 25 production files including index; moving its multi-export leaves unchanged would violate new-owner structure.
Single-authority leaves retain `schema/{domain-resources,relation-indexes,mutations,compiled-plans,ui-query-indexes,result-checks,graph-judgements,instruction-node-scope}.ts`.
`adaptations.ts` -> `schema/adaptation/evidence.ts`; `adaptation-matching.ts` -> `schema/adaptation/matching.ts`.
`conversations.ts` / `conversation-turn-decision.ts` -> `schema/conversation/{tables,turn-decision}.ts`.
`flow-settings.ts` / `flow-scoped-keys.ts` -> `schema/flow/{settings,scoped-keys}.ts`.
`runtime-runs.ts` / `runtime-run-interrupted-status.ts` -> `schema/runtime/{summary-envelope,interrupted-status}.ts`.
`recording-stream.ts` / `recording-description.ts` -> `schema/recording/{stream,description}.ts`.
Split original `event-streams.ts` declarations once into `schema/event/{spool,cursor,retention}.ts`.
Split `routers.ts` -> `schema/router/{scaling,summary-detail,target-reference}.ts`.
Split `run-datasets.ts` -> `schema/dataset/{tables,answers}.ts`.
Split `reusable-llm-contexts.ts` -> `schema/reusable-context/{tables,audit,validation,keyed-digest}.ts`.
Split the four original `table-names.ts` arrays -> `schema/tables/{domain,search,mutation,stream-spool}.ts`.
Move original foreignKeyGuards to `schema/guards/foreign-key.ts` with internal guards/index; preserve its absence from the public schema barrel. No copied trigger builder.
All schema source imports are presently just the original migration type and/or foreignKeyGuards; no model, service, authority capability or UI object is required.

## Default and private ownership invariants

The administration default is exactly 30 entries: original 0001 plus 29 original constant references. Preserve reference order, duplicate numeric prefixes, full IDs, mutable runtime objects/array and cooked statement bytes/checksums; do not sort, renumber or freeze.
The schema exports `0035_reusable_llm_context_keyed_digest`, but this migration is NOT in that default array. Preserve that omission; extension stores append their own later migrations and are outside this cut.
Pool entries, lease counts, grace timers and closesInFlight remain one state per original pool. Acquire/release race checks, original path `root/projects/<id>/project.sqlite`, Windows namespaced native open, pragma order and idle-close drain remain exact.
The database keeps one operationTail/pending count/closed latch/closePromise/cache. A transaction remains contiguous begin-immediate -> original operation -> commit/rollback; finalization precedes actual close. Cache failed-statement eviction, NULL binding and uncached get stay intact.
Runner migrationQueues stays keyed by original filePath; readyByConnection stays keyed by original connection object; setFingerprints stays keyed by the original migration ARRAY. New connection/schema-cookie/state changes still invalidate readiness. Keep original backup, lock-token/timeout, ledger insertion and failure-state behavior.
UnitOfWork validates original validateAdmission INSIDE the actual transaction BEFORE initial work and every replay. Preserve digest/response bytes, persisted failure semantics, mutation IDs and original lease close.
Canonical UnitOfWork must never import administration: that module's CanonicalAuthorityWholeSql validate/receipt/instanceof checks stay untouched with its guarded repositories. No capability, registration, command or admission algorithms move here.

## Public seam and graph

Root should publish server-only `fluxiq/framework/persistence/project` from the new project/index, with sql, mutations, migrations and schema exports; existing framework/persistence integration remains Root-owned. No browser entry/polyfill and no need for four new public subpaths.
Canonical value direction: pool -> database -> statement-cache -> existing framework performance; UnitOfWork -> runner/defaults; defaults -> schema; schema -> its guards plus migration contracts TYPE-only. Runner uses SQL types directly, not old project/index. No canonical old alias/Programs edge is permitted, even erased types.
Use internal sibling barrels across directories; defaults must stay OUTSIDE schema/index, avoiding defaults -> schema -> defaults. SQL classes may import their same-directory owners; contracts' database reference is TYPE-only. Verify full graph/initialization rather than bypass barrels.

## Precise decisions required before code release

No extra source owner is needed beyond the named files/slices plus the change-feed union; all other dependencies are already canonical or native Node/sqlite3.
Moving existing code must not transfer baselines. Queue waiters in database.close/enqueue and runner.migrate can use the equivalent `then(() => undefined, () => undefined)` form; packed private helpers can be formatted without altering bodies/bytes.
There are pre-existing real cleanup policies to pin explicitly: database.open drops a failed close; transaction drops a failed rollback; StatementCache.finalize ignores its callback error; UnitOfWork.open/persistFailure and runner.recordFailure can replace the primary error if cleanup also fails. This discovery does not authorize changing those semantics or claiming their failures are acknowledged. Root should release any required retained-primary/AggregateError correction with narrow fault oracles, rather than move a baseline/exemption.
This ownership move grants NO observed completion to legacy project database/cache/migration/backup/clock callbacks. Existing canonical native Repository ports remain the separate accepted ACK owner; no fulfilled-Promise proof or broad pure/frame declaration is added.

## Named acceptance, after coordinated source freeze

Existing six selectors: `storage/project/tests/{database,unit-of-work,schema,administration}.test.ts` and `storage/tests/{schema-migrations,schema-migrations-ready-memo}.test.ts` (prefix `src/programs/automation-studio/`).
Database covers real lease sharing/reacquisition/idle-close races/failed-open identity, contiguous transactions, native long paths, NULL/cache/finalization and actual close. Migration subjects cover checksums, concurrent callers, backup-before-migrate, failure rollback, locks and real schema-cookie/connection memo invalidation.
Retain all seven `storage/project/schema/tests/{adaptation-matching,conversation-turn-decision,flow-scoped-keys,instruction-node-scope,recording-description,recording-stream,runtime-run-interrupted-status}.test.ts` oracles and their original migration/table bytes.
Actual existing SQL consumer: `src/tests/native-repository-completion.test.ts` (6 real durable cases, already accepted before this proposed move); use old aliases to prove same original pool/lease/SQL behavior after migration.
Add minimal canonical-only real SQLite and original-alias identity tests at the actual owners/legacy facade boundary; mixed administration/schema consumers remain at their nearest common integration owner, never behind a canonical reverse-import exception.
Require original-body/complete type equality plus actual cooked SQL/checksum/default-array-object identity; full canonical source/type/erased/declaration closure 0 Programs/built; strict narrow roots; complete-context scoped rules filtered only after evaluation. Root runs documented package/whole-structure/build gates. No check ran for this plan.

## Exact stopped handoff

The released generator finished its current complete write batch before Stop: 112 saved files (81 new canonical leaves/barrels and 31 old facade/administration paths), 63 moved declarations. Exact paths: `.fluxiq/refactor/project-sql-foundation-moved.json`. Individual files are fully written; the WORK UNIT is partial. There is no half-written active file or running command/session.
Saved: complete original SQL/cache/pool/error/UOW/runner/default/schema declarations, their private state/helpers and generated internal barrels; exact old named exports; ONLY administration's default-array/ChangeFeedOperation extraction. Original `project/schema.ts` is unchanged. Root public parent/package/config, guard/admission/store/native SQL/performance/capture files were not edited.
NOT done: approved cleanup/finalizer/rollback/failure-report/native-callback retention and pool drain changes, private cleanup helper, fault tests, canonical closure/type/structure/parity/runtime/declaration checks or public integration. Existing original cleanup defects remain in the moved bodies. One known unreviewed generated cross-directory TYPE import in `migrations/contracts/runner-options.ts` reaches `sql/database.ts` instead of its barrel; no corrective write followed Stop. No passing/current-build claim.
Recovery evidence is intact: `.fluxiq/refactor/project-sql-foundation-originals.json` contains exact pre-move bytes for all32 original files; `...-declarations.json` holds137 declarations/member hashes/literal facts; `...-recipe.json` maps63 destinations/default30/order/excluded0035/state owners; `...-release-recipe.md` holds20 finite proposed fault rows; `...-move.cjs` is the completed generator. The generator verified all32 originals unchanged immediately before writing. Do not recapture over these originals.
No rollback/removal/git action was performed. A recovery checkpoint, if Root/user chooses it, restores ONLY manifest-listed old paths from the original capture and removes/quarantines ONLY manifest-listed new owned paths (never the whole project directory or Root files), then verifies the original narrow gates. A forward validated checkpoint instead needs the complete plan approved, remaining corrections/import review and narrow acceptance; this partial batch is not ready to merge or label validated. Current source/evidence stay preserved meanwhile.

Outcome: Partial
Changed: Exact112 saved source paths in moved manifest; this own report and ignored recovery/recipe assets.
Validation: Original-byte guard and mechanical extraction completed; NO post-move compiler/tests/audit/build/parity or integration ran.
Not verified: Saved migration closure/type/budgets/SQL parity/runtime, every cleanup correction/fault oracle and public integration.
Report: docs/working/runtime-ownership-refactor/reports/project-sql-foundation.md
Notes: STOPPED; all source/tests frozen, no active command. No git/shared docs/package/config/baseline/native SQL changes. Prior implementation release is revoked; Root/user plan review comes next.
