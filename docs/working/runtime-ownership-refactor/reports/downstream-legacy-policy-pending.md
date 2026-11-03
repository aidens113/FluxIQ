# Guarded downstream graph-test cancellation

Outcome: Done. SOURCE/TESTS FROZEN; both worker readers ended naturally.

The first unresolved test was `domain/src/output-nodes/target-preparation/tests/legacy-policy.test.ts`, "carries an element target miss to the attempt trace and a target override candidate". Its only awaited phase before any trace/candidate/projection oracle is `runAutomationStudioGraph`; both preceding direct-dispatch/matcher cases complete.

Actual guarded RED: from t843 Down, with `DOMAIN_TEST_BUILD_LABEL=b-legacy-policy-pending`, `pnpm.cmd --filter @fluxiq-web-extension/domain test output-nodes/target-preparation/tests/legacy-policy.test.ts` -> current built Core confirmed; 2 passed, 0 assertion failures, 4 cancelled, exit 1. First graph case cancelled after 27.38ms with "Promise resolution is still pending but the event loop has already resolved". Log `.fluxiq/refactor/b-legacy-policy-pending.log`.

Cause: target miss is intentionally retryable. The graph's existing four-attempt policy waits 250/1000/2000ms; `recovery/run.ts` selects retry_node and `step-loop/failed-attempt.ts` awaits `automationStudioRunWait`. The CURRENT built `dist/runtime/environment/wait.js` deliberately unrefs its native timer, matching its source/legacy contract. This migrated node:test fixture supplied no delay/other referenced handle, so Node exits before the first wait fires. `domain/scripts/test-domain.mjs` uses actual external built Core and ordinary node:test imports; no source overlay was involved. Trace/projection/privacy assertions were not failing or reached.

Root approved one test-only correction: supply `delay: async () => undefined` on that first graph invocation. Production backoff/four-attempt floor, source timer behavior, all original target/failure/trace/candidate/withheld-value assertions and runner remain unchanged.

Bounded family inspection: the other two legacy-policy graph cases intentionally succeed (no-candidate delegation and saved-command privacy); moved opaque-target patch tests rerun successful constant/end nodes. Root-owned io-bridge uses one successful match and a nonretryable missing-fingerprint refusal. No other intentional native retry wait was found in these named migrated callers; those files/cases were not changed.

Guarded GREEN: identical command with fresh `DOMAIN_TEST_BUILD_LABEL=b-legacy-policy-delay` -> current Core guard confirmed; 6/6 passed, 0 failed/cancelled, exit 0, TAP 101.98ms. Original failing graph case reached and passed every original trace/candidate/projection oracle; the later privacy case also passed. Log `.fluxiq/refactor/b-legacy-policy-delay.log`.

Changed: Only the existing legacy-policy test's graph option and this own report. No Core, production Down, runner, config, baseline, provider or git changes. The prepared native-log Stage2 implementation remains HELD.
Not verified: Full guarded Down focused cohort, package-wide checks, extension/browser behavior or live providers; Root owns common integration. No extra runtime check was launched.
Report: docs/working/runtime-ownership-refactor/reports/downstream-legacy-policy-pending.md
