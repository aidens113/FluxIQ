# Sweep 2026-11-04b: the four Core test failures

## Outcome

Done. None of the four is a product defect. Two writers cannot both proceed. One test did needless waiting and now reads differently; three had limits below what they really do, and those limits now have room. A fifth failure turned up in the same web file, and it is fixed too. No assertion changed.

The common cause of items 2, 3 and 4: a process that imports the built package now loads about 3,600 modules (the probe's comment says 2,200, measured 2026-10-19). That costs 5.7-7.7 s of CPU and 8-19 s of wall clock here, nearly all of it Node's per-module file checks, not any module's own code (slowest module 41 ms). The old limits of 15 s and 5 s sat at twice that CPU cost or below it.

## What changed and why

| Test | Measured cause | Fix | Before (alone) | After (alone) |
| --- | --- | --- | --- | --- |
| `source-closure` | 191 files, about 0.7 s of CPU. Awaited reads took 0.1-7.8 s of the 0.4-8.7 s wall; CPU stayed flat. | `readFileSync`: reads drop to 34-83 ms. Limit unchanged at 15 s. | 6 of 6, test 0.57-1.5 s | 5 of 5, test 0.36-0.65 s |
| `claim-restart` | Three children at 8-15 s each, over 95% of it the import (6.5-7.7 s CPU). Real work 0.2-0.5 s, `recover` 0.14-0.34 s, exit within 2 ms of closing. No wait on the dead writer's locks. | Each child limit `REAL_SQL_TEST_TIMEOUT_MS`, test limit 3 times that. | 6 of 6, 17-27 s; sweep killed `recover` at 15 s, test 41 s | 3 of 3, 22-26 s |
| `whole-process` | See below. `ready` is the import: 11-19 s wall. | `receive` limit is `REAL_SQL_TEST_TIMEOUT_MS`; the 30 s overrides are gone, so the marker's 60 s applies. | 5 of 6 (run 3 failed 4 tests); sweep failed at 17.1 s | 3 of 3, 16 of 16 tests, slowest test 12-15 s |
| `fluxiq` ES host | The host's native import alone is 5.7-5.9 s of CPU, 7-12 s wall; the rest of the test is 0.05-0.13 s. The 5 s default is below the CPU cost. | Test limit 60 s, same value and reasoning as the constant, which `apps/web` cannot import. | 0 of 6 | 3 of 3, 6.6-8.0 s |
| `fluxiq` sole host domain (new) | The runtime's first close lazily imports `server/provisioning-listener`. In a file run alone that is Vite's first transform: 3.7-5.1 s waiting, 0.3-0.4 s CPU here. Timed first, that import took 5.1 s and close 3 ms. A sweep has it cached (374-490 ms). | Static import in the test file, so collection pays for it. | Failed 2 of 6, and 1 of 3 on the first fix | 3 of 3 |

### Item 3: can two writers both proceed?

No. `CanonicalAuthorityWholeOperation.reserve` runs in one `begin immediate` transaction on the single `global.sqlite`. Inside it, the writer refuses if the project has any operation not `completed`, then `lifecycle.admit` refuses on a pending key, then it inserts its own row. The winner's row is committed before its first effect, and the probe's pause comes after a commit, so it holds no lock.

The loser waits on nothing: refused 55-107 ms after `go` with `canonical_whole.unresolved`; the winner paused 0.36-7.3 s after `go`. A measurement with six writers released together, sql and file, two rounds each: all 24 contenders resolved to exactly one `paused` and five `unresolved`, losers in 64-313 ms. The worst outcome of a lock wait is `SQLITE_BUSY` after 10 s, raised before any effect. That is safe, and it was never seen.

The sweep's failure was `ready`: 17.1 s minus the 15 s limit leaves 2.1 s, too short for an import of at least 5.7 s of CPU. Limit-free, the 16 tests took 8.8-26.9 s each.

## Commands run and observed results

All from the package directory, with `--minWorkers 1 --maxWorkers 1`, while other lanes ran (CPU at 100%, queue length 27-40, 18,000 pages/s, 1.3-1.8 GB free).

- `pnpm.cmd exec vitest run src/flows/executable/dsl/tests/source-closure.test.ts --reporter=dot`: 5 runs, each 1 passed.
- `pnpm.cmd exec vitest run src/framework/persistence/automation/project/recording-stream/tests/claim-restart.test.ts --reporter=dot`: 3 runs, each 1 passed.
- `pnpm.cmd exec vitest run src/framework/persistence/automation/canonical-authority/tests/whole-process.test.ts --reporter=verbose`: 3 runs, each 16 passed, 195-222 s.
- `pnpm.cmd exec vitest run src/lib/tests/fluxiq.test.ts --reporter=verbose` (`apps/web`): 3 runs, each 30 passed, on the final file. The earlier 3 runs, before the static import: 2 passed, 1 failed on the sole-domain test at 5,007 ms.
- With four extra import loops running: async walk 3.3-6.7 s against sync 0.36-0.75 s, in alternating runs; the limit-free `whole-process` copy passed 16 of 16.
- `pnpm.cmd exec tsc --noEmit -p <temp config over the three package tests>`: exit 0.
- `node scripts/structure-audit.mjs`: "passed (494 warning(s), 1097 baselined)".

Measurement scripts and logs are in the scratchpad's `sweep-core-measure` folder. The temporary tests are deleted, and no source was rebuilt.

## Not verified

- A full sweep. These ran alone, so the fixes are not yet proven inside one.
- That the sweep's own 15 s in `source-closure` was reads. That moment was not instrumented. The worst I reproduced was 8.7 s, 7.8 s of it reads, and the test runs no product code.
- An upper bound on `whole-process`. The slowest completed test was 26.9 s; run 3's failures stopped at 30 s, so their true length is unknown. 60 s is about twice the observed range, not a proof.
- `apps/web`'s typecheck. The change there is a bare import and an options argument.

## Open questions or contradictions found

- `canonical-authority/tests/process.test.ts` has the same 15 s `receive` limit and probably the same exposure. I did not measure it, and it is outside my paths.
- The 2,200 in `whole-process-probe.mjs`'s comment is stale. Import cost grows with the module count, and every process-boundary test and server start pays it. Not a defect in these tests, but the lead may want to weigh it.
- Earlier I assumed the sole-domain failure was fallout from the timed-out test before it. The timings disproved that, hence the separate fix.
