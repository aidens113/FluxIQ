# t809 w7: web fixes

## Outcome
Partial. Both fixes are done and verified on narrow runs. The full lock-gated `tsc` and the four-directory vitest run did not run, because `heavy-check.lock` (created 22:01) was still held 30 minutes later and no tsc or vitest process was running. It looks stale.

## What changed and why
1. Recovery test. The cause was in the test, not the component. It mocked `Modal` through the `shared-ui` barrel, but `AuthorizationDialog` imports `./Modal` directly. The real Modal portals into `document.body`, so under react-test-renderer it rendered nothing and every PIN test saw no input and no confirm button. The mock now targets `../../components/overlays/Modal`, the same approach as `RunDatasetsPanel.test.tsx`. The real `AuthorizationDialog`, its PIN field and its buttons are exercised.
2. Drain refusal moved from `lib/` into `server/drain/`.
   - `lib/program-drain-refusal.ts` is now `server/drain/program-start-refusal.ts`, importing `./drain-state`.
   - Its test is now `server/drain/tests/program-start-refusal.test.ts`.
   - `server/drain/index.ts` re-exports it.
   - The route imports `programDrainRefusal` from `server/drain`.
   - `lib/` is down to two `program-` files.
3. Statement packing. Every line I added or changed in `deployment-sync.tsx` and the recovery test now has one statement per line. `pnpm structure:baseline` lowered two entries and admitted nothing new: `deployment-sync-recovery.test.tsx` 66 to 63, and `deployment-sync.tsx` 16 to 11.

All edited files keep CRLF.

## Commands run and observed results
- `pnpm exec vitest run tests/deployment-sync-recovery.test.tsx`, before the fix: 8 failed, 21 passed. After the mock fix: 29 passed.
- `pnpm exec vitest run src/server/drain src/app/api/programs` from apps/web, run without the lock because it is small: 9 files passed, 93 tests passed.
- `pnpm structure:check` from the repo root, run without the lock (a read-only audit): "structure-audit: passed (467 warning(s), 1152 baselined)".
- `pnpm structure:baseline`: "baseline written: 1152 entries across 13 rules (2 lowered, 0 removed)".

## Not verified
- The recovery test was re-run after the reformat: 29 passed.
- `pnpm exec tsc --noEmit -p .` from apps/web did not run.
- `pnpm exec vitest run src/server src/lib src/app src/features/programs` did not run. Parts of it passed in the narrow runs above.
- A queued script is waiting on the lock to run both. It writes to `C:/Users/osrs_/AppData/Local/Temp/w7-tsc.log` and `w7-vitest.log`, ending with an "exit N" line. It dies when this session ends, so the lead should rerun them.

## Open questions or contradictions found
- `heavy-check.lock` was created at 22:01 and was still held at 22:31, with only playwright (t804) node processes running. If it is stale, the lead should remove it. I did not, per the rules.

```text
Outcome: Partial
Changed: apps/web/src/features/programs/live-views/deployment-sync.tsx, apps/web/src/features/programs/live-views/tests/deployment-sync-recovery.test.tsx, apps/web/src/server/drain/program-start-refusal.ts, apps/web/src/server/drain/tests/program-start-refusal.test.ts, apps/web/src/server/drain/index.ts, apps/web/src/app/api/programs/[programId]/[endpoint]/route.ts, .structure-baseline.json (lib/program-drain-refusal* deleted by move)
Validation: `vitest run tests/deployment-sync-recovery.test.tsx` -> 29 passed (also after the reformat); `vitest run src/server/drain src/app/api/programs` -> 9 files, 93 tests passed; `pnpm structure:check` -> passed
Not verified: tsc, full four-directory vitest (lock held 30+ minutes)
Report: docs/working/hosted-production-plan/reports/t809/w7-web-fixes.md
Notes: heavy-check.lock created 22:01 looks stale. Rerun the recovery test and tsc once it is free.
```
