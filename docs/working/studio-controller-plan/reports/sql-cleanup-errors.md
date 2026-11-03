# sql-cleanup-errors

## Outcome
Done.

## What changed and why
Ported the four cleanup-error branches from t843 commit bbac7d7d9 into dev's files under packages/fluxiq/src/framework/persistence/automation/project/:
- database.ts open(): setup failure then close failure -> AggregateError([setup, close], cause=setup); close success rethrows the identical primary.
- database.ts transaction(): operation/commit failure then rollback failure -> AggregateError([primary, rollback], cause=primary); rollback success rethrows the identical primary. (Removed the two `.catch(() => undefined)` swallows.)
- unit-of-work.ts open(): migration failure then lease release failure -> AggregateError; else identical primary.
- unit-of-work.ts runIdempotent(): callback failure then persistFailure failure -> AggregateError; else identical primary.
Added tests/database-cleanup.test.ts and tests/unit-of-work-cleanup.test.ts (copied from t843, imports adapted to this layout: ../database.ts, ../statement-cache.ts, ../unit-of-work.ts, ../../schema-migrations.ts).

## Commands run and observed results
- `pnpm.cmd exec vitest run src/framework/persistence/automation/project/tests --minWorkers 1 --maxWorkers 2` (packages/fluxiq) -> 27 files, 222 tests passed. New cases: database-cleanup.test.ts (6): "throws the identical setup error when closing succeeds", "throws the identical operation error after a successful real rollback" (primary identity); "retains setup and native close errors when both fail", "retains the original operation/commit and rollback errors" (both retained). unit-of-work-cleanup.test.ts (5): migration failure with release ok (identity) / release fails (both); failure record ok (identity) / fails (both); nested AggregateError retained.
- `node scripts/structure-audit.mjs --rule swallowed-failure` -> "passed (0 warning(s), 29 baselined)". No new findings.
- `git grep -nE "execution-admission|execution-observation|executionPorts" -- packages/fluxiq/src/framework/persistence/automation/project` -> no matches (exit 1).

## Not verified
- Whether the database.ts swallowed-failure count dropped: the audit does not print per-file counts and .structure-baseline.json (not mine to touch) still lists database.ts at 2. Two swallows were removed (open close, rollback); other `.catch(() => undefined)` remain in database.ts (idle close, pool entry, close/operationTail chains), so the lead should run `pnpm structure:baseline` to see the new count.
- Package typecheck not run, per brief.

## Open questions
None. No t843 execution-admission/observation/clock content was brought over.
