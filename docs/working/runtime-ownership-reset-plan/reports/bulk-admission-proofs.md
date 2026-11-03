# Transaction-local admission proof index

Status: Approved five-file change implemented; owner-local acceptance passed. Source frozen for Root's verification and comparative composed slot.

Scope: Approved five-file manifest, separate from parent-handoff repair and ownership migrations. No composed/provider/browser run.

## Red witness

Before production edits, ran from `packages/fluxiq`:

```text
pnpm.cmd exec vitest run src/programs/automation-studio/storage/project/execution-admission/tests/proof-index.test.ts src/programs/automation-studio/storage/project/execution-admission/tests/commands.test.ts --minWorkers 1 --maxWorkers 1
```

Observed exit 1: 2 failed / 11 passed across 13 tests, 11.43 s total (3.03 s collection, 7.19 s tests).

- Actual native gets for an inventory with 8 / 24 completed children were **18 / 50**, expected **0 / 0**. Inspection still returned the expected pending root, so this measures proof work on real history rather than an absent inspection.
- Missing oldest proof after a successful warm inventory caused **1** native fallback get, expected **0**. It still failed closed; the new guarantee removes the unnecessary lookup.
- Six other old-proof corruption cases (owner, owner kind, operation, request digest, status and response), project isolation and all four command cases passed on the original implementation.
- New late-commit rejection passed: SQLite trigger first proved the current claim, link and command-link event were staged, then aborted their mutation commit. The transaction left zero claim/link/event rows and no send authorization.

## Implemented change

Reused only the existing bounded admission mutation query, indexed its rows inside one inventory call, and kept every original proof validator. `command_link` keeps its original direct SQL lookup. Missing indexed proofs fail without fallback. No persistent cache, schema/filter/bound/transaction change.

Changed production:

- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/inventory.ts`: reads bounded event/mutation rows once, builds a local mutation index, supplies it only for non-command events and reuses the same mutation rows for the original orphan/status validation.
- `packages/fluxiq/src/programs/automation-studio/storage/project/execution-admission/proof.ts`: optional local row index selects the existing proof row; every digest/owner/kind/request/status/response expression remains unchanged. The original two-argument direct SQL path remains compatible.

Changed tests:

- `.../execution-admission/tests/proof-index.test.ts`: new real-SQL fixed-work, old-proof corruption/no-fallback and two-project cases.
- `.../execution-admission/tests/fixture.ts`: optional project ID for the existing authority helper; original default unchanged.
- `.../execution-admission/tests/commands.test.ts`: late rejection after real claim/link/proof staging verifies rollback and zero send authorization; original cases retained.

## Green acceptance

Ran from `packages/fluxiq` after the two production edits:

```text
pnpm.cmd exec vitest run src/programs/automation-studio/storage/project/execution-admission/tests/proof-index.test.ts src/programs/automation-studio/storage/project/execution-admission/tests/inventory.test.ts src/programs/automation-studio/storage/project/execution-admission/tests/commands.test.ts src/programs/automation-studio/storage/project/execution-admission/tests/store.test.ts --minWorkers 1 --maxWorkers 1
```

Observed exit 0: **24 / 24 passed** across four files, 13.36 s total (2.18 s collection, 9.27 s tests). Proof-index 9, commands 4, inventory 7 and store 4. The same native-get assertions now observe **0 / 0** at 8 / 24 completed children; the missing-oldest-proof case observes **0** native fallback gets while still rejecting corrupted admission. All seven old-proof damage cases, cross-project isolation, late atomic rollback, original command-link replay/unknown behavior, bounded overflow, materialized/event/orphan corruption and parent/frontier/fencing cases passed.

`git diff --check -- <four modified tracked source/test paths>` -> exit 0; only Git's normal LF-to-CRLF notices. Reviewed the production diff: the existing mutation SELECT/filter/LIMIT/byte accounting and all verifier expressions are unchanged; the query was moved/reused, not duplicated.

## Remaining limits

No whole positive, runtime timing comparison, global typecheck/build/audit, provider or browser was run by this worker. Root owns package/structure verification on the integrated frozen tree and the next composed slot. This removes ordinary-event native lookup amplification; history replay/hash/materialized/command validation still runs and its remaining cost is not claimed eliminated. The earlier 300 s stall cause and end-to-end completion remain separate acceptance gates.

Outcome: Done
Changed: the five source/test paths listed above and this report.
Validation: red -> 2 expected failures / 11 passes; green owner-local command -> 24 / 24 passes; native gets 18/50 -> 0/0, missing-proof fallback 1 -> 0.
Not verified: package check/structure, unchanged original composed positive or an uninstrumented elapsed-time improvement.
Report: docs/working/runtime-ownership-reset-plan/reports/bulk-admission-proofs.md.
Notes: All owned source frozen; no active test process. No git mutation, shared-document edit or agent dispatch.
