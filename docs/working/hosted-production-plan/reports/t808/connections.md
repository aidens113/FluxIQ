# t808/connections (lane C0)

Outcome: Done

## What changed
- `programs/_shared/state-connections.ts`: `programStateConnections` is now a module-private `ProgramStateConnections` registry (one `SQLiteConnectionPool` per storage root). `forRoot(dir)`, `close(dir)` (closeAll + forget, no-op when none), `roots()`. Root = `programStateRoot(dir)?.dir ?? path.resolve(dir)`.
- `programs/_shared/storage.ts` lines 334 and 342: `connections: programStateConnections.forRoot(current)`.
- `automation-studio/runtime/service.ts` line 2449 (`runRuntimeSession`): `programStateConnections.keepWhile(` became `(this.projectPaths.root ? programStateConnections.forRoot(this.projectPaths.root) : { keepWhile: <T>(operation: () => Promise<T>) => operation() }).keepWhile(`. The service stores no storage-dir field; `projectPaths.root` is `<storageDir>/projects` or undefined, and `programStateRoot` walks up to the owning root. Without a storage dir the operation runs unkept.
- New `programs/_shared/tests/state-connections.test.ts` (real-sql group): subdirectory resolves to same pool; `close(B)` leaves A's kept connection open and A's run completes (kept connection reused, closed when A's keepWhile ends); `close(A)` (via a subdirectory) closes and forgets it.

## Results
- `vitest-groups --groups=parallel,real-sql src/programs/_shared`: parallel 14 files / 123 tests passed, real-sql 5 files / 20 tests passed (includes the new 3).
- `vitest-groups ... src/programs/automation-studio/runtime/tests/in-run-repair src/.../service-adaptation/tests/modes.test.ts` (both run runRuntimeSession): 2 files, 13 tests passed.
- tsc --noEmit (in the lock): one error only, the expected one: src/framework/index.ts(212,43) TS2339 Property closeAll does not exist on type ProgramStateConnections. No errors in secret-keys/** at that moment.

## Notes
- A first run of the `_shared` directory with a 110s external timeout died with "Worker exited unexpectedly" (my timeout killing it); rerun without it passed.
- The shared lock dir was stale once (no tsc process running, held 17+ min); I removed it once. Other agents then took it.
