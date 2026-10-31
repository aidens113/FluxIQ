# t813-bgtasks (lane C1) report

## Outcome
Done.

## What changed and why
- `packages/fluxiq/src/programs/background-tasks/runtime/service.ts`: added `close()` and `activity()`. `close()` clears the scheduler interval, clears and flushes a pending debounced persist (only if tasks were loaded), and sets a closed flag. It is idempotent. `run()` after close throws "Background tasks service is closed". `startTimer()` is a no-op once closed, so `snapshot()` or `load()` cannot restart it. `schedulePersist()` is a no-op once closed, so a run that settles after close is not persisted and leaves no timer. `run()` now counts runs in progress and delegates to a private `runOnce`. `activity()` returns `{running, scheduled}`. It never loads storage or starts anything. `scheduled` is 0 when the tasks are not loaded or the service is closed.
- `programs/_shared/runtime.ts`: removed `ObservedBackgroundTasksService` and its unused imports. It builds a plain `BackgroundTasksService`, and `activity()` reads `backgroundTasks.activity()` into the same field names.
- `framework/index.ts` `close()`: `await this.programs.backgroundTasks.close()` in its own try, before `clientGateway.close()`.
- Tests: four cases in `programs/background-tasks/tests/index.test.ts` (activity before load, counts, close and idempotence and refused run, flush of a pending write). One new case in `framework/tests/instance-leak.test.ts`: it loads the tasks via `snapshot()`, closes, asserts the scheduler is stopped, the instances are collected and Timeout handles do not grow.

## Commands run and observed results
- `tsc --noEmit -p .` in packages/fluxiq: clean (no output).
- `pnpm test src/programs/background-tasks src/framework src/programs/_shared`: parallel group 24 files / 178 tests passed; real-sql group 10 files / 51 tests passed; "all groups passed". The leak test file had 5 tests passing.
- Bite check: with the close call commented out, `pnpm test src/framework/tests/instance-leak.test.ts` failed: "stops the background task scheduler ... AssertionError: expected true to be false" (4 others passed). The line was then restored (`grep` shows line 229 intact) and the full run above was taken before the bite check.
- Root `pnpm structure:check`: first run FAILED on statement-packing in my test (line 21). I fixed it, and the rerun printed "structure-audit: passed (469 warning(s), 1152 baselined)". After the fix `pnpm test src/programs/background-tasks` passed (5 tests).
- Root `pnpm docs:check`: "Deterministic framework reference is current." No `docs:reference` run needed.

## Not verified
- The wider `src/programs/tests/global-background-tasks.test.ts` and the web manager were not run (outside the named groups). Nothing else referenced `runningCount`/`scheduledCount` (grep found no other users).
- A run in flight at close time is not awaited; its final state is not persisted.
- During the bite check the `framework/index.ts` edit was live in the shared tree for several minutes, while waiting for the heavy lock, so other tests run against that tree in that window could have seen the missing close.

## Open questions
None.
