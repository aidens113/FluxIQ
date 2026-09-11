# core-adaptation-test-cost

## Outcome

Done. The PIN-gated Adaptation Audit bridging case now finishes in **12110 ms
under full-suite load**, against the unchanged 15 s `testTimeout`, where it
previously finished in **14685 ms** — a 315 ms margin turned into 2890 ms.
Solo, the case went from **4869 ms to 3247 ms**. `testTimeout` was not raised,
the case was given no timeout argument, no assertion was weakened, loosened or
deleted, and no source file was edited.

The measured cause is only partly test-side, and that is the important finding:
about 2.6 s of the case's under-load cost was fixture rebuild, which is removed;
the remaining ~11.5 s is the persistence work of the lifecycle the case asserts
on, which lives in source. Details and the residual risk are below.

## What changed and why

### Where the time actually goes (measured, not assumed)

The case was instrumented with phase timers and run both alone and inside the
full package suite. Under full-suite load (12 cores, another agent running
browser benchmarks concurrently):

| Phase | Under load | Kind |
| --- | ---: | --- |
| construct + createProject | 16 ms | fixture |
| createFlow | 338 ms | fixture |
| saveFlowInstruction | 153 ms | fixture |
| getLlmExecutionBinding | 741 ms | fixture |
| generate (endpoint) | 1533 ms | subject |
| inbox + pre-asserts | 399 ms | subject |
| get (endpoint) | 335 ms | subject |
| approve (endpoint) | 334 ms | subject |
| apply (endpoint) | 3452 ms | subject |
| post-apply asserts | 146 ms | subject |
| runRuntimeSession | 2009 ms | subject |
| revert (endpoint) | 3474 ms | subject |
| createFlow (reject path) | 357 ms | fixture |
| createFlowBootstrapAdaptation (reject path) | 1005 ms | fixture |
| reject (endpoint) | 383 ms | subject |
| **total** | **14674 ms** | |

There is no single hotspot. Roughly 2.6 s is fixture construction rebuilt per
case; roughly 12 s is the endpoint lifecycle whose results the case asserts on,
and that cost is SQLite persistence inside the service.

A probe confirmed the persistence path is not optional: constructing
`AutomationStudioService` without `dataDir` (memory repositories only) makes the
case fail at once with `Error: Unknown Automation Studio project`, so the
lifecycle genuinely requires the on-disk store. There is no cheap in-memory
fixture available to this case.

### The fix: seed once, copy per case

Following `runtime/tests/service-subflow-pagination.test.ts`, both inventories
the file needs are now written once in `beforeAll` by a service that is closed
before the snapshot is taken (so each copy is a complete database, not a copy of
a live one), and every case runs on its own `cp` of the snapshot:

- `proposalSeed` — project, blank instruction Flow, active instruction and a
  proposed bootstrap adaptation. Used by the six cases that called `proposal()`.
- `bridgeSeed` — the API-bridge project with its Flow and instruction, plus the
  reject Flow, its instruction and its proposed candidate, and the recorded
  `getLlmExecutionBinding` result. Used by the bridging case.

The recorded binding is read **last** during seeding, so it describes the
snapshot exactly as each case receives it. Two seeding assumptions are
self-verifying and did verify: the recorded execution digest still matches what
the API reports (`baseExecutionDigest` assertion), and the flow-scoped Inbox
listing still totals 1 despite the pre-seeded candidate sitting on the sibling
Flow.

`validatedPlan()` is now resolved once and handed out via `structuredClone`;
validation walks the whole builtin node registry and callers mutate the plan
they receive.

Effects: the bridging case 4869 → 3247 ms solo and 14685 → 12110 ms under load;
the whole file 52909 → 37368 ms under load, which also lowers the contention
every other file in the suite competes with.

### Teardown, so the reported error is the true one

The concrete leak is `service.test.ts:3158`: the 10,000-subflow scale case opens
`new SQLiteRepository({ rootDir: path.join(tempRoot, ...) })` and **never closes
it** — it is registered in no `services` set and has no `finally`. The shared
`afterEach` then deletes `tempRoot` while that handle is live, which is how a
run reports `EBUSY: resource busy or locked, unlink ...project.sqlite-shm`
instead of the real failure. A timed-out case compounds this: Vitest abandons
the body but the body keeps running and reopens handles after `close()`.

Closing that repository requires editing the case body, which this brief does
not own, so both `afterEach` hooks in `service.test.ts` and the one in the
adaptation file now remove the directory with `maxRetries: 10, retryDelay: 25`.
`fs.rm` retries precisely on `EBUSY`/`EPERM`/`ENOTEMPTY`, so the abandoned
handle is given time to close and a cleanup race can no longer replace the
failure the run is reporting. **Recommended follow-up for the supervisor: add
`await repository.close()` to the scale case at `service.test.ts:3158`** — that
is the actual defect; the retry only stops it from masking other failures.

## Commands run and observed results

All runs on the loaded box described above.

| Command | Observed |
| --- | --- |
| `pnpm --filter fluxiq test service-flow-bootstrap-adaptation.test.ts --reporter=verbose` (before) | 9 passed; bridging case **4869 ms**, file 16070 ms |
| `pnpm --filter fluxiq test --reporter=verbose` (before) | 127 files, 828 passed; bridging case **14685 ms**, file 52909 ms, duration 189.45s |
| `pnpm --filter fluxiq test service-flow-bootstrap-adaptation.test.ts --reporter=verbose` (after) | 9 passed; bridging case **3247 ms**, file 11918 ms |
| `pnpm --filter fluxiq test --reporter=verbose` (after, run A) | `Test Files 127 passed (127)`, `Tests 828 passed (828)`, exit 0; bridging case **12110 ms**, file 37368 ms |
| `pnpm --filter fluxiq test` (after, run B) | `Test Files 127 passed (127)`, `Tests 828 passed (828)`, exit 0, duration 153.22s |
| `pnpm test` at Core root, redirected to a file with `echo $?` (never a pipe) | `ROOT_PNPM_TEST_EXIT=0`; contracts 7 passed, client-gateway-websocket 3 passed, fluxiq **828 passed**, web 1146 passed |
| `pnpm --filter fluxiq check` (`tsc --noEmit`) | exit 0, no output |

Two auxiliary checks:

- **Probe, in-memory service**: removing `dataDir` fails with
  `Error: Unknown Automation Studio project` in 48 ms. Reverted.
- **Failure injection**: the verbose reporter prints only 8 of the file's 9
  passing case lines — the "merges bootstrap and ordinary adaptations" line is
  absent while the count still says 9. Forcing `expect(page.total).toBe(999)`
  made that exact case fail (`AssertionError: expected 2 to be 999`, named in
  the output, `Tests 1 failed | 8 passed (9)`), proving it executes and its
  assertions are live. The file was reverted and re-verified by grep.

An earlier post-fix suite run reported `1 failed | 124 passed (126)` with
`SyntaxError: Unexpected token '*'` in `storage/tests/project-query-plan.test.ts`
and two `Error: Worker exited unexpectedly`. That file passes alone (2 tests),
and both later full runs passed all 127 files, so it was the loaded box killing
workers, not this change. It is worth knowing the box can do that to any file.

## Not verified

- **Margin, not immunity.** 12110 ms against a 15000 ms gate is a 19% margin. It
  was measured under one specific load (full suite plus concurrent browser
  benchmarks). A heavier box could still push this case over, because the ~11.5 s
  that remains is source-side persistence, not test overhead.
- The `EBUSY` masking was **not reproduced directly** — no run during this task
  timed out — so the retry is verified only as "does not break passing runs",
  not as "observed to surface a timeout it previously hid".
- The un-closed repository at `service.test.ts:3158` is **still un-closed**; only
  the masking is mitigated.
- No browser or live validation; this is a Node test-cost change only.
- Per-case `cp` cost was not isolated from the measurements; it is included in
  the after numbers.

## Open questions or contradictions found

1. **The gate cannot be made comfortable without a decision the brief forecloses.**
   Test-side seeding removed everything it can. Getting real headroom needs one
   of: splitting the bridging case into per-stage cases seeded from staged
   snapshots — which would change the suite from **828 to 832 tests**, and the
   brief's definition of done fixes the count at 828, so I did not do it; or
   source-side work on the persistence path (batching the writes that `apply`
   and `revert` perform). Both are the supervisor's call.
2. **The brief's description of the teardown defect is close but not exact.** It
   describes "a service the case never registered in its `services` set". Every
   `AutomationStudioService` in both files *is* registered. The unregistered
   handle is a raw `SQLiteRepository` (`service.test.ts:3158`), and a timed-out
   case's abandoned body reopening pooled handles after `close()` is a second,
   independent path to the same `EBUSY`. The retry covers both; only the first
   has a clean one-line fix, and it sits outside this brief's ownership.
3. **A vitest reporter quirk worth knowing**: the verbose reporter silently omits
   one passing case's line in this file (see the failure-injection check above).
   `-t <pattern>` also did not filter in this setup — both runs with `-t` still
   executed all 9 cases. Neither affects correctness, but both will mislead
   anyone reading `--reporter=verbose` output to count cases.
