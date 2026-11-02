# Core sweep fixture repairs

Outcome: SOURCE FROZEN, partial acceptance. All eleven fixture-related failures are corrected in seven authorized test files; production is unchanged. The three candidate-gate retest failures expose a production protocol conflict, so their original assertions remain intact pending a separate production brief. Current-tree acceptance awaits the lead's coordinated freeze/build.

## Historical proof

The exact pre-refactor t844 pair is downstream `c9056f1a` / Core `16b5043c`, provisioned and built by the lead. From t844 Core:

`pnpm.cmd --filter fluxiq exec vitest run src/programs/automation-studio/runtime/recovery/tests/runtime-exploration-views.test.ts src/programs/automation-studio/runtime/flow-bootstrap/candidate/tests/trial-gate.test.ts src/programs/automation-studio/runtime/llm/harness/tests/run-size.test.ts src/programs/automation-studio/runtime/result-verification/build-test/tests/task-checklist.test.ts src/programs/automation-studio/runtime/service/candidate-trial/tests/consequences.test.ts src/programs/automation-studio/runtime/service/end-view/tests/passive-result.test.ts src/programs/automation-studio/runtime/service/subflow-trial/tests/environment.test.ts src/programs/automation-studio/runtime/service/candidate-trial/tests/environment/tests/trial-environment.test.ts`

Observed: exit 1, 8 failed files, 14 failed / 55 passed / 69 total, 40.16 seconds. All 14 failure subjects and outcomes match the original daily sweep. Ignored evidence: t844 Core `.fluxiq/refactor/core-eight-baseline.log`. No historical source or oracle was edited.

## Corrected fixture contracts

- `recovery/tests/runtime-exploration-views.test.ts`: historical views have immutable references to their own original call, with the complete latest view under `core.current_view`. The test now checks both first and later exact historical records and the exact full current payload at both decisions.
- `llm/harness/tests/run-size.test.ts`: the printed instruction token budget changes the sent request's own size when the window goes from a seven-digit probe to its smaller actual width. Calibrate using the actual width, then require an exactly one-token-over request to be refused before provider invocation with the exact measured size. The companion fitting-window and unsent-catalog oracles remain.
- `result-verification/build-test/tests/task-checklist.test.ts`: bounded parsing of the historical diff proved the only absent-vs-undefined request differences were the fresh wall-clock values at `context.resultSummary.referenceNow` (1793615402573 vs 1793615402597). Freeze `Date.now` for this byte-equivalence test and restore it afterwards. The full byte comparisons and exact checklist-only removal are retained.
- `service/candidate-trial/tests/consequences.test.ts` and both environment tests: the production runner deliberately copies graph options to add `referenceNow` at trial start. Replace impossible container identity with exact whole-object equality including that frozen time, preserve exact executor/signal references, and assert caller options remain untouched. Exact trial-vs-normal declared consequences, native host context and authorization domains remain unchanged. Scoped-environment tests additionally check the frozen time.
- `service/end-view/tests/passive-result.test.ts`: checked runtime snapshots bind methods to the original runtime receiver. Exercise that receiver inside the actual passive callback instead of requiring a bound function to equal its source function. Keep actual candidate/saved-summary data, invocation count, no execution-tool call, signal and denied-permission assertions.

## Production conflict requiring separate ownership

The three `flow-bootstrap/candidate/tests/trial-gate.test.ts` cases for `execution_failed`, `not_judged` and `unsure` retain their existing positive retest assertions unchanged. The actual trial gate emits `effectApplied: true`, `targetsUnchanged: false`, and only `resultReason: "retry_allowed"`. At an observed unchanged state, the repeat guard correctly requires validated transient/retryable/unacted failure control plus `effectApplied: false` to exempt a retry; a reason string grants nothing. The gate's promised bounded retest and the current protocol disagree. Fabricating unacted failure metadata or changing these tests to accept refusal would weaken safety/repair semantics.

Owners for a separate bounded production brief: `runtime/flow-bootstrap/candidate/trial-gate.ts`; `runtime/llm/repeat-guard/outcomes.ts`; `runtime/llm/repeat-guard/retry-later.ts`. These domain-policy checks remain in Studio in the current tree; no canonical agent source change has been established as necessary. Lead was notified before any production change. No shared helper changes are required by the seven fixture repairs.

## Verification

Lead authorized a virtual TEST-only overlay of exactly these eight t843 test sources onto unchanged t844 production/helpers. The ignored config is t843 Core `.fluxiq/refactor/vitest-sweep-overlay.config.mts`; it preserves the historical Vitest configuration and contracts aliases and replaces only the eight named test bodies. Normal current-tree acceptance awaits coordinated source freeze/build.

Overlay command, from t844 Core: `pnpm.cmd --filter fluxiq exec vitest run --config C:/Users/osrs_/FluxStuff/fxwork/t843/!FluxIQ/.fluxiq/refactor/vitest-sweep-overlay.config.mts` -> exit 1, 65 passed / 4 failed, 6 passed / 2 failed files, 41.89 seconds. The three untouched trial-gate assertions still fail. The fourth failure was the companion `executeTool` spy check on a bound function, exposed after the callback identity fix; it now checks the original spy, preserving the no-tool-call oracle.

Isolated final rerun: the same overlay command with `service/end-view/tests/passive-result.test.ts` -> exit 0, 3/3 passed, 50.67 seconds (the actual tests took 133ms; collection took 49.63 seconds). Log t844 Core `.fluxiq/refactor/core-passive-overlay.log`.

Across these final scoped checks, all 66 tests outside the three original protocol conflicts pass, including the eleven previously failing fixture cases. The eight-subject overlay did not pass as a whole, and no current-tree suite/typecheck is claimed. No additional repetition is needed until the production conflict or current source readiness changes.

No providers, paid calls, browser/panel runs, full suites, source aliases, package changes, git actions or production edits were performed.
