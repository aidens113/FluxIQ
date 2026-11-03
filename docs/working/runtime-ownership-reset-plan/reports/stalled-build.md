# Stalled composed build: bounded phase witness

Status: Root executed the prepared provider-free probe on a frozen closure. Intentional cancellation completed normally; no successful positive or fixed deadlock is claimed. Source remains frozen; next-unit implementation manifest is ignored under `.fluxiq/refactor/`.

## Established source chain

- The original positive is `project-build-trial-reset.test.ts`, selector `runs each trial on the site`. Earlier evidence reached `submit` at 73,668 ms; `test.1` did not answer. Collection took 86.23 s. The 300 s abort began in cleanup and is not a cause witness.
- `brief-ports.ts`'s `placing` calls `reader.capture(signal)` and `automationStudioSiteResetPlacedCall` without the original invocation. `site-reset/act-places.ts` then calls `reader.read(undefined, signal)`, omitting the third invocation argument accepted by `StartCheck.read`.
- `runtime/flow-authoring/execution/observation/producer.ts` only binds the existing parent when `AuthoringExecutionScope.of(invocation)` succeeds. Missing invocation therefore reaches `BuildToolObserver.invoke`'s ordinary-root branch, as the earlier actual stack showed. This is a proven scope handoff gap; its responsibility for the long wait remains unproved.
- The entered wait is `ExecutionObservationSource.prepare` -> `ExecutionAdmissionLifecycle.enter` -> `store.enter` -> `enterExecutionAdmission` -> `mutateExecutionAdmission` -> `UnitOfWork.runIdempotent`'s transaction, then a second inventory transaction.
- Neither store `pipeline` nor lifecycle `track` waits for its own tracking set. Database `enqueue` is the actual FIFO. Inventory replays all admission events, verifies every event with sequential `sql.get`, validates materialized joins and scans command history. Command inventory uses the supplied transaction executor; no recursive database enqueue is established there.

## Discriminating probe ready

Ignored executable artifacts (all under `.fluxiq/refactor/`):

- `stall-reset-config.ts`: extends the original Vitest config; retains the real-SQL guard and unchanged original test.
- `stall-reset-setup.ts`: `beforeAll` installs observation-only prototype wrappers, after collection and the original test's mocks. Wrappers retain original receivers, tuples and returned promises. Fixed labels/counts only; no query values, paths, IDs or shop data.
- `stall-reset-run.mjs`: supervised child runner, log `stall-reset-runtime.log`, hard process-tree bound 240 s including collection. Refuses to run without the frozen-slot environment marker.

Tracked phases: callback prepare/source, tool invocation, store operations, UnitOfWork operation kind, database FIFO issued/active/completed, and native statement issued/completed plus event counts. A sample every 5 s names the oldest pending operation and recent SQL category.

Normal stop is the service's actual build cancellation: 10 s with no operation progress, 20 s of the first `test.1` phase, or 100 s after build start. Original assertions and the original 300 s watchdog are unchanged. An intentional diagnostic cancellation is not a passing positive. External bound is only containment if cancellation cannot drain.

Run from the Core task checkout **only after Root freezes the runtime closure**:

```powershell
$env:FLUXIQ_STALL_RUNTIME_SLOT = 'frozen'
node .fluxiq/refactor/stall-reset-run.mjs
```

Witness interpretation: queued enter plus an older active database operation localizes a FIFO owner; active SQL without completion localizes native/statement waiting; continuing SQL completions and growing inventory counts identify expensive validation rather than an unmoving wait. Callback preparation completion before cancellation falsifies persistence-enter as the present stall. Keep cleanup phases distinct.

Potential fix scope, pending evidence: original-parent handoff in `runtime/service/project-build/brief-ports.ts` and `runtime/flow-bootstrap/site-reset/act-places.ts`; if the witness instead identifies replay cost, the `storage/project/execution-admission` inventory/proof owner. No fix is asserted or authorized by this preparation.

## Elapsed-time reductions with evidence

1. Localize with the prepared phase-bound probe before another whole positive. The previous run spent 226 s between `submit` and watchdog cleanup without a phase witness; this probe stops after a discriminating interval while preserving the test oracle.
2. Address collection in the actual service import/composition boundary as ownership moves land. A read-only explicit-value-import graph found 4,412 local modules / 17.24 MB / 711 barrels for this test; `service.ts` reaches 4,404 of them / 17.18 MB / 709 barrels. Its `service/project-build/index.ts` branch reaches 4,294 modules. This supports narrowing capability barrels and removing unnecessary service composition edges while retaining the real service. It does not establish measured savings or justify replacing the service with a stub. Counts are a static upper bound, not Vite's observed module count.
3. If the probe shows SQL progress, optimize redundant inventory validation in one transaction without weakening durable verification. Every admission mutation currently reads the full inventory inside admission and reads it again after commit; every read performs one mutation-proof `get` per historic event plus all materialized/command inventories. The existing builder progression took roughly 5 s, 6 s, 24 s, 20 s and 18 s between answers before submit. Instrumented statement counts can determine whether repeated verification dominates before choosing a cache/index/bulk-read design. No performance fix is claimed yet.

Do not spend this investigation slimming test-only imports: the actual service already owns 99.8% of the static graph. `observe-builder-calls.ts` reaches 3,012 modules but contributes only one outside the service closure. Graph script/results: `.fluxiq/refactor/stall-reset-import-graph.mjs` / `.json`.

## Verification and limits

- `node .fluxiq/refactor/stall-reset-import-graph.mjs` -> exit 0, no unresolved local import edges; generated the counts above and TypeScript transpilation reported `syntaxErrors:0` for both probe TS files.
- `node --check .fluxiq/refactor/stall-reset-run.mjs` -> exit 0, no syntax diagnostics.
- Preparation performed no runtime work. The later run below was allocated and launched by Root; this worker read its fixed diagnostic lines only. No provider, browser, real user data or source edit was used.

## Executed frozen probe

Root confirmed runner exit 1, `bounded=false` (normal exit; no process-tree kill), 183,747 ms wall time. Vitest reported 182.58 s total: 68.62 s collection, 113.14 s tests, 19.78 s transform, 138 ms setup and 169 ms prepare. Transform is a component of the run, not an extra duration to add to collection. One selected test failed under deliberate cancellation; three were skipped.

| Probe elapsed | Recorded events | Mutation-record gets | Full event inventories |
| --- | ---: | ---: | ---: |
| 16,005 ms | 149 | 23,399 | 314 |
| 52,031 ms | 280 | 82,705 | 591 |
| 101,073 ms: cancellation | 392 | 158,631 | 817 |
| 113,134 ms: drained | 406 | 178,128 | 865 |

Build began at 365 ms. The 100 s build sampling bound cancelled it at 101,073 ms (100,708 ms after build start). Normal cancellation drained in 12,061 ms; final pending span count was zero.

At cancellation the actual sampled owner was `automation.engine` callback preparation, with store enter pending 359 ms, its current active database operation 106 ms and its native `mutation_records` get 0 ms. Every one of 177 store enters later completed. Of 172 callback preparations, 171 completed and the final engine preparation rejected only after cancellation. All 1,080 queued database operations eventually became active and finished. This witness falsifies an unmoving FIFO/native wait on this run. It does not reproduce the earlier persistent start-state wait; the original 300 s positive remains unverified.

The concrete cost is repeated history verification: `proof.ts` fetches one mutation row for each event, while `inventory.ts` already reads the complete bounded admission mutation inventory later in that same transaction. `mutateExecutionAdmission` repeats the full inventory before and after each new mutation. The observed gets grow approximately with the square of event history (158,631 gets at 392 events), matching that source chain. Continuing reads and completed enter operations identify amplification, not a proved deadlock. Native read count is measured; the exact wall-time share and the uninstrumented speedup are not.

Instrumentation limitations:

- Per-statement wrappers and AsyncLocalStorage add work. Do not treat the instrumented timing as production latency or claim a saving until a narrow before/after count test and the unchanged original positive validate it.
- Counter key `sql.run.begin` combines issued run spans with completed SQL BEGIN statements. It is not a count of pending runs. Native `get` totals and the explicit pending-span records do not have this collision.
- The `test.1` phase marker did not fire, so this run used its 100 s build bound, not the planned 20 s trial bound. Callback labels outside the small whitelist are `other`, and samples list at most twelve pending spans; no exact named engine callback is inferred from them.

## Next finite defect unit: transaction-local proof index

Root accepted this separate amplification fix. Exact preparation: `.fluxiq/refactor/stall-reset-proof-index-manifest.md`. No implementation has been applied.

Reuse the existing bounded admission mutation read once per `readExecutionAdmissionInventory` call. Build a local index, validate every ordinary event against its indexed row using the existing full proof checks, and treat a missing indexed row as corruption. Retain the original SQL lookup for `command_link` events and all orphan/status, materialized, frontier and command validation. No schema, persistent cache, registry, second authority or changed transaction boundary.

Minimal production paths are `storage/project/execution-admission/inventory.ts` and `proof.ts`. Narrow regressions must cover bounded SQL work as history grows; missing and tampered old proofs after a successful warm read; separate projects; unchanged positive command/link/replay; and failure after link insertion but before mutation commit rolling back both claim and link. Existing before-claim rejection is insufficient as the only late atomicity witness.

Outcome: Partial
Changed: ignored diagnostic probes/metadata, next-unit manifest and this report only.
Validation: Root's bounded provider-free run -> intentional-cancel exit 1, complete normal drain; source-backed proof-read amplification established.
Not verified: original positive, cause of the earlier 300 s wait, parent-handoff repair, proof-index implementation or any uninstrumented speedup.
Report: docs/working/runtime-ownership-reset-plan/reports/stalled-build.md.
Notes: No active diagnostic process; production source unchanged by this worker. Root retains the freeze.
