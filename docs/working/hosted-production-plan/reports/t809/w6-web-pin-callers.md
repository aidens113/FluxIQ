# t809 w6: web callers of PIN-gated sync / rollback

## Outcome
Partial. Code and tests are written; not one check has run, because the heavy-check lock stayed held and Core's dist was never rebuilt.

## What changed and why
- `apps/web/src/lib/program-route.ts`: `deployment-sync` added to `SESSION_BOUND_PROGRAMS` (same set as `database-manager`), so `authSessionId` is stamped on its payloads.
- `apps/web/src/lib/tests/program-route.test.ts`: asserts a spoofed `authSessionId` on a `deployment-sync` payload is replaced by the trusted one.
- `apps/web/src/features/programs/live-views/deployment-sync.tsx`: the Modal confirmation for rollback and branch checkout is replaced by the shared `AuthorizationDialog` with `requirements={{ pin: true }}` (the dataset-delete pattern in `RunDatasetsPanel.tsx`). The PIN goes out as `authorizationPin` on `sync`/`rollback` only; dry-run sends none. `run` now returns `{ ok, error? }`. On refusal the prompt stays open, the PIN is cleared and the server's error shows. On success the prompt closes. Cancel clears the credentials.
- `apps/web/src/features/programs/live-views/tests/deployment-sync-recovery.test.tsx`: new tests for these cases:
  - the confirm button is disabled until the PIN is at least 4 digits, for both checkout and rollback;
  - the post carries `authorizationPin` and, for rollback, `versionSha`;
  - a refused PIN keeps the prompt open and clears the field;
  - dry-run sends no PIN.
  The target-capture and duplicate-confirm tests now enter a PIN.
- Other callers: grep found no UI caller of `database-manager/run-migration` (only `is-operator-only-path.ts` and `program-request-coordinator.ts`, neither of which posts it). `sync` and `rollback` are called only from `deployment-sync.tsx`.

## Commands run and observed results
- Waited about 40 minutes for `C:/Users/osrs_/FluxStuff/fxwork/t809/build-dist.log`. It never appeared. `build-dist.sh` is queued on `heavy-check.lock`, and that lock directory (mtime Oct 29 20:30, held by another job) was still present at 21:13.
- A single-file `pnpm exec vitest run` of the recovery test was refused at startup with "Core's library build is 52 minute(s) behind its source", as the brief predicted.
- `tsc` and the vitest runs were not started: they need the lock, and the vitest ones also need the dist rebuild.

## Not verified
- `pnpm exec tsc --noEmit -p .` (apps/web) and `pnpm exec vitest run src/lib src/features/programs`: not run.
- The new and updated tests have never executed. Risks to check first:
  - the real `AuthorizationDialog`/`Modal` under react-test-renderer: the test file mocks only `Modal` from shared-ui, and the dialog imports its own;
  - `button("Cancel")`/`button("Checkout")` text matching against the shared `Button` component's children;
  - the `findByType("input")` single-input assumption.
- `deployment-sync.test.ts` source-string checks ("Confirm Rollback", "Confirm Branch Checkout") should still hold, since the titles are unchanged. Not run.
- `pnpm structure:check`: not run.

## Open questions or contradictions found
- The lock has been held for 40+ minutes by something other than the lead's dist build. The lead should check whether it is stale.
- Files use CRLF; the edits kept it.

```text
Outcome: Partial
Changed: apps/web/src/lib/program-route.ts, apps/web/src/lib/tests/program-route.test.ts, apps/web/src/features/programs/live-views/deployment-sync.tsx, apps/web/src/features/programs/live-views/tests/deployment-sync-recovery.test.tsx
Validation: `pnpm exec vitest run src/features/programs/live-views/tests/deployment-sync-recovery.test.tsx` -> refused at startup, Core dist 52 minutes behind; tsc and the suites not run (lock held, dist not rebuilt)
Not verified: tsc, vitest for src/lib and src/features/programs, structure:check, all new tests
Report: docs/working/hosted-production-plan/reports/t809/w6-web-pin-callers.md
Notes: After the dist rebuild, run tsc and vitest from apps/web under the lock. The dialog tests are unrun, so expect small selector fixes in the recovery test.
