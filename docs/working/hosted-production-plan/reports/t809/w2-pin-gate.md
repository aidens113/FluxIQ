# t809 w2: PIN-gate run-migration, sync, rollback

## Outcome
Done in Core. Web callers still need work (outside owned paths, see Open questions).

## What changed and why
- `programs/deployment-sync/api/handlers.ts` (`sync`, `rollback`) and `programs/database-manager/api/handlers.ts` (`run-migration`): `classification` `destructive-ungated` -> `destructive`. The registry now runs `authorizeProgramPin` before these handlers. None of the three handlers checked a credential itself.
- `programs/tests/endpoint-classification.test.ts`: the three moved into `PIN_GATED`; `DECLARED_UNGATED` is now empty.
- Docs: `docs/architecture/package-boundaries.md` ("No declared gaps") and `docs/architecture/automation-studio/persistence.md` ("Declared gaps" now says none are left, and what a caller must send).

## IAM decisions changed
Action names and access levels are unchanged: `ops:Sync`, `ops:Rollback`, `ops:RunMigration` were `Write` and still are (`destructive` and `destructive-ungated` both default to `Write`). The IAM allow/deny decision is unchanged. The only change is the registry's pre-handler PIN check: an authorized caller without a valid `authorizationPin` plus `authSessionId` now gets "PIN is required for this action" (or the PIN failure). `destructive-actions.generated.ts` already lists all three (it counts both classifications), so nothing is stale. `packages/contracts/src/iam/actions.generated.ts` was not touched.

## Commands run and observed results
- From packages/fluxiq under the lock: `pnpm test src/programs/deployment-sync src/programs/database-manager src/programs/tests src/programs/_shared src/platform/iam` -> "Test Files 15 passed (15)", "Tests 79 passed (79)", "[vitest-groups] all groups passed: parallel, real-sql". The platform/iam directory was added to cover parity and escalation tests.
- `pnpm docs:check` -> "structure-audit: passed (0 warning(s), 0 baselined)." and "Deterministic framework reference is current."

## Not verified
- (docs:check passed, see above.)
- B3's named parity/escalation suites under `apps/web` and `src/programs/automation-studio/api` were not run.
- No live PIN flow exercised.

## Open questions or contradictions found
Callers will now be refused until fixed (apps/web, not owned):
1. `apps/web/src/lib/program-route.ts` `SESSION_BOUND_PROGRAMS` lacks `deployment-sync`, so `authSessionId` is never stamped on `sync`/`rollback`; add it. `database-manager` is already stamped.
2. `apps/web/src/features/programs/live-views/deployment-sync.tsx` posts `sync`/`rollback` with no `authorizationPin` (it uses `openConfirmation`); it needs the `AuthorizationDialog` flow used by the dataset delete. Its test `deployment-sync-recovery.test.tsx` mocks the API, so it will not notice.
3. No UI caller of `database-manager/run-migration` was found in apps/web (only the operator-only path list and the request-coordinator timeout).
4. Paired-client tokens can never call these (classification not read/authoring), unchanged.

```text
Outcome: Done
Changed: packages/fluxiq/src/programs/deployment-sync/api/handlers.ts, packages/fluxiq/src/programs/database-manager/api/handlers.ts, packages/fluxiq/src/programs/tests/endpoint-classification.test.ts, docs/architecture/package-boundaries.md, docs/architecture/automation-studio/persistence.md
Validation: `pnpm test src/programs/deployment-sync src/programs/database-manager src/programs/tests src/programs/_shared src/platform/iam` -> Test Files 15 passed, Tests 79 passed, all groups passed
Not verified: pnpm docs:check result; apps/web callers (need session stamp + PIN dialog)
Report: docs/working/hosted-production-plan/reports/t809/w2-pin-gate.md
Notes: IAM action names/access levels unchanged; actions.generated.ts untouched.
Notes: apps/web fix needed: add deployment-sync to SESSION_BOUND_PROGRAMS and a PIN dialog in deployment-sync.tsx.
```
