Role: Heavy worker; model gpt-6.1-sol; effort max.
Goal: Implement the approved transaction-local bulk proof optimization, independently of parent-handoff fixes or ownership moves.
Owned production: packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/{inventory,proof}.ts.
Owned tests: same directory tests/{proof-index.test.ts,fixture.ts,commands.test.ts}; no other source edits.
Read: reset plan Current State; reports/stalled-build.md; exact ignored .fluxiq/refactor/stall-reset-proof-index-manifest.md; named source/tests.
Use one local index of rows already read by the existing bounded mutation query. No persistent cache, new query/filter/schema/authority, proof skipping, or orphan/materialized/frontier relaxation.
Keep command_link on original direct SQL proof path. Explicitly supplied missing-key index fails closed with no fallback. Current command validation remains transaction-local/atomic.
Preserve every per-record digest/owner/kind/request/status/response check. Preserve all original receivers/tuples, bounds and error behavior.
Tests: fixed SQL-get work for increasing 8/24-child histories; oldest missing/tampered proof after warm read; two projects; real late claim/link commit-trigger rollback. Keep original inventory/commands/store tests.
Source release: Root followup message after checkpoint push. Until then prepare only ignored tooling, no actual source or tests.
Run only stable owner-local acceptance once regressions defined; no global check/build/audit/provider/browser.
Report: docs/working/runtime-ownership-reset-plan/reports/bulk-admission-proofs.md with exact changed paths, red/green evidence, work counts and limits.
After tests pass, freeze source and notify Root for comparative original positive slot. Do not rerun composed case yourself without slot.
No git/shared-doc edits/agents. End return contract.
