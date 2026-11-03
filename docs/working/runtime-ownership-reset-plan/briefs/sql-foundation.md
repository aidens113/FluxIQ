Role: Heavy worker; model gpt-6.1-sol; effort max.
Goal: Finish the preserved project SQL/schema/migration/UOW ownership batch.
Owned: packages/fluxiq/src/framework/persistence/project/**; framework/persistence/index.ts; original Studio storage/project/{database,statement-cache,store-unavailable-error,unit-of-work,administration}.ts, storage/project/schema/** and storage/schema-migrations.ts; their immediate tests.
Consumer migration: exact old SQL import lines in Studio storage/** only, preserving unrelated content; record manifest before edits.
Must not touch: execution-admission, clock, exchange-log, service/runtime, package.json, shared plans/indexes, downstream, git.
Read: AGENTS.md boundary/validation; reset plan Current State + Restart Audit; reports/wip-salvage.md; architecture/code-structure.md.
Preserve original declarations, SQL bytes/order/checksums, constructor/cache/lease identity and aliases. Add project barrel/server public export.
Fix named barrel/statement-packing gates without weakening baseline. Treat cleanup-loss as a separate defect substep: first reproduce primary/rollback/close failures; preserve original error objects and expose cleanup failure, using existing error patterns. Record exact semantics and changed paths separately.
Run only tests whose dependency closures are stable; do not run package-wide typecheck/audit/build until Root freezes tree. Real-SQL tests use temporary fixtures and proper marker.
Acceptance: original database/schema/migration/UOW tests + canonical/legacy identity and source/type closure; no canonical imports into programs; all local owned consumers retargeted; public seam importable.
Report finite completion with commands/results, exact touched path manifest, preserved/mutated declarations, remaining blockers.
Report: docs/working/runtime-ownership-reset-plan/reports/sql-foundation.md.
No commit/push, shared-doc edits or agents. End with required return contract.
