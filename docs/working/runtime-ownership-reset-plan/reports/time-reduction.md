# Time reduction investigation

Requested by the user on 2026-11-02 during plan execution. This report distinguishes observed costs from proposed optimizations; it does not replace acceptance or promise a finish date.

## Current findings and controls

| Cost | Evidence | Action preserving acceptance |
| --- | --- | --- |
| Broad composed-test collection | Original diagnostic: 86.23 seconds collection, 391.28 seconds total; saved erased value-import graph has 4,370 local modules. | Debug the named waiting operation through a bounded probe; retain the original positive unchanged for final verification. Prefer direct canonical-owner imports in moved owner tests rather than aggregate Studio imports. Do not assume a focused filename has a small closure. |
| Repeated whole-test timeout | Original test spent approximately 304 seconds in test/cleanup and reached submission without start-state admission returning. Cause still unknown. | Log FIFO-issued/active/completed and admission/inventory phases, preserve original Promise/receiver/arguments, stop after a defined motionless phase or 100-second diagnostic execution bound. Never repeat unchanged five-minute attempts. |
| Rebuilding moving dependencies | Last recorded Core public-package build: 175.896 seconds and 22,127 outputs. Cache refuses to stamp when input source changes during a run. | One coordinated source freeze for package typecheck/build and downstream guarded integration per coherent batch. Owner-local tests while independent files change; no redundant package rebuild per worker. |
| Repeated full suites | Repository rules cap full sweeps at twice/day; full suites are not merge-per-fix gates. | Use changed-owner tests, package typecheck and structure gate; reserve full sweeps for coherent integrated commits. Never suppress a failure or substitute compilation for runtime acceptance. |
| Waiting behind one diagnostic | Three available worker lanes; SQL, callback guards and source-tracing currently own disjoint files. | Keep bounded migrations active while the diagnostic waits for a frozen runtime slot. Root performs verification, schedule/dependency analysis and integration in parallel. |
| Rewriting mechanical moves by hand | Audit verified unchanged SQL state-owning declarations and normalization bodies, with import/export work remaining. | Reuse preserved bodies. For subsequent batches use explicit old/new manifests, deterministic relative-import rewrites, aliases and AST/literal comparisons. Compare module state/identity and run actual behavior tests; text parity alone does not pass a batch. |

## Work already applied

- Three finite briefs active, with disjoint source ownership and explicit stable-test closures.
- Root verified the budget/unknown-frame retained units with 17 tests across three files: 1.95 seconds Vitest duration, 4.33 seconds shell wall time. A separate two-root strict type closure covered 72 local modules with zero diagnostics/program dependencies; scoped structure covered 19 files with zero failures. These figures describe that small unit only, not projected speed of larger features.
- SQL direct-import consumer rewrite is manifest-driven; it will keep legacy aliases and original implementations.
- Callback worker groups related focused acceptance after bounded failing regressions; it records collection versus test time.
- Stall worker prepares a phase-specific probe before any further original whole-case run.

## Candidates requiring evidence before tooling changes

1. Measured by the source-tracing worker: the current value-import graph has 4,412 modules; real service.ts itself reaches 4,404 (99.8%), and project-build/index.ts reaches 4,294. Merely trimming test-helper imports is therefore low value. Focus on the actual service/composition dependency cuts as ownership moves land; do not replace the real service with a surrogate to claim acceptance.
2. Inspect actual build phase costs before changing compiler/cache behavior. The current build deliberately cleans stale moved/deleted outputs and rewrites declarations; removing those steps for speed is not approved.
3. Consider an isolated diagnostic fixture or cached transform session only if it reproduces the same actual wait. A faster surrogate must not replace original composed/public-package acceptance.

## Validation and limits

Source/log inspection only for this investigation so far. No provider, browser, user database or full sweep launched. Historical durations are attributed to their recorded runs, not presented as current benchmarks. SQL worker acceptance: 15 files / 73 tests passed in 45.94 seconds wall time; reported transform 11.12s, collection 44.48s and tests 10.72s overlap across two workers and must not be added. Root verification and the newly identified UOW cleanup case are still pending. Stall probes are prepared but runtime remains held until the tree freezes.

## Decision

Reduce repeated work and dependency waits first. Keep test assertions, retry behavior, durable completion guarantees, migration checksums, public-package guards, browser boundaries, original error objects and final release gates intact. No reliable total speedup percentage or finish ETA is established yet.

## Verified first-window results

- Lead full structure passed in 43.744 s. Core pre-push now uses its existing all-git-visible-input cache and captures failed output once; shell syntax and 21 relevant cache/registry tests passed. Actual hook passed: 52.091 s cold, then 1.609 s unchanged. Documentation changes invalidate the full audit fingerprint.
- Frozen public build passed: FluxIQ 118.852 s / 22,571 outputs, unchanged contracts/gateway reused. Normal emitted persistence import preserves constructors/migration identity.
- Lead SQL 78/78, callback/alias 168/168, and relocated pool/alias 22/22 cases passed. These counts are bounded acceptance, not overall completion.
- Probe ended by planned cancellation, drained normally in 12.061 s and did not reproduce a fixed deadlock. It counted 158,631 proof gets for 392 events before stop; transaction-local reuse of already-loaded proof rows is the next finite performance unit, with original per-record checks retained. No speedup is claimed before its controlled comparison.
