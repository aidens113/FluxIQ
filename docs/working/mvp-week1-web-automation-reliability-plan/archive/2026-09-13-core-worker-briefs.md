# Core Week 1 worker briefs, archived

Moved verbatim from the plan's Worker Briefs section on 2026-09-13, when the
plan reached 842 lines. Every brief here was completed and recorded in the
Work Ledger on 2026-09-11 or 2026-09-12.

### Brief: core-failure-taxonomy
- Repository: FluxIQ Core
- Task: C1 and C2, one work unit.
  1. One failure-category enum: extend `AutomationStudioAdaptiveFailureClass`
     (`packages/fluxiq/src/programs/automation-studio/runtime/adaptive-orchestrator.ts:6`)
     with `target_not_found`, `target_ambiguous`, `navigation_unexpected`,
     `output_not_observed`, `page_changed`, `auth_required`,
     `user_intervention_required`; every one of the downstream plan's eleven categories
     maps to exactly one member, reusing existing members where the meaning matches
     (timeout, expected-state mismatch, unknown). Make the list usable by
     `packages/contracts` without a second copy, placed per
     `docs/architecture/package-boundaries.md`. Add `target_not_found` and
     `target_ambiguous` to `AutomationStudioTransitionComparisonStatus`
     (`runtime/executor/contracts.ts:8`).
  2. A public failure record `{ category, code, retryable, stage?, expected?, actual?,
     evidenceDigest? }` with an exact-field parser and consistency assertions modelled on
     the flow-bootstrap diagnostic, carried as optional `failure` on
     `ClientGatewayActionResult` (`packages/contracts/src/client-gateway.ts:98`),
     `FluxIQRuntimeCommandResult` (`packages/fluxiq/src/runtime/contracts.ts:80`), and
     `AutomationStudioFlowRunActionAttemptRecord` (`model/flow-adaptation.ts:276`).
  3. The propagation chain in downstream `audit-core-runtime.md` section (c): optional
     `status` on `OutputDispatchResult` (`src/io/index.ts:29`); optional `message` and
     `failure` on `AutomationNodeExecutionResult` (`nodes/contracts.ts:82`); propagation
     in `runtime/io-policy.ts` and `runtime/executor/attempt-trace.ts`; optional
     `targetResolution` beside `stateRefs` on the attempt trace, from `io-policy.ts`'s
     resolution; structured-first classification in `transition-comparison.ts` and
     `adaptive-orchestrator.ts`; the attempt record and `conversions.ts`; the category in
     `compactRecentActionForLlm` (`llm/harness/context-packet.ts`).
  4. The minor version bump with one migration note covering the new members.
- Required reads: the files above; `docs/architecture/package-boundaries.md`;
  downstream `reports/audit-core-runtime.md` lines 257-378 and `reports/audit-failures.md`
  lines 215-300.
- Owns (may edit): those files and their `tests/`; the `version` field of
  `packages/fluxiq/package.json` and `packages/contracts/package.json`; the migration
  note (follow Core's existing convention); `docs/architecture/` pages for these contracts.
  Granted during the work, on the worker's request: `runtime/executor/node-execution.ts`
  (`dispatchAutomationStudioEffects` rebuilt the node result from outputs, status, and
  route only, dropping `message`, `failure`, and `targetResolution`) and the gateway
  transport's `forwardGatewayEvent` (it copied `client.action_result` field by field and
  would drop `failure`), with their `tests/`.
- Must not touch: `apps/web/`, `scripts/structure-audit/`, anything downstream.
- Definition of done: Core `pnpm check`, `pnpm test`, `pnpm build` pass (quoted); tests
  show a timed-out action with the structured field classifying as `timeout` and a legacy
  record without it still classifying by regex; the report lists each new export with
  its import path and the eleven-category mapping table.
- Report to: `reports/core-failure-taxonomy.md`

### Brief: core-host-loading
- Repository: FluxIQ Core
- Task: the downstream panel host (`F:\!FluxIQWebExtension\domain\src\web-panel-host.ts`,
  built by `domain/scripts/build-web-panel-host.mjs`) deep-imports
  `AutomationStudioNativeNodeRuntime` from Core's `dist`, because the public
  `fluxiq/automation-studio` export fails when Core loads the host:
  `apps/web/src/lib/fluxiq.ts` loads domain hosts with `createRequire`, and
  `packages/fluxiq/package.json` declares only `import` conditions
  (`ERR_PACKAGE_PATH_NOT_EXPORTED`). Fix it on Core's side so any domain host can use
  Core's public exports — loading hosts with dynamic `import()`, or publishing a
  CommonJS-resolvable entry — choosing per `docs/architecture/package-boundaries.md` and
  justifying the choice. Prove it with a scratch copy of the downstream host whose deep
  import is replaced by the public one (never edit the downstream repository), loaded
  through the panel's loader, plus the existing web tests.
- Required reads: `apps/web/src/lib/fluxiq.ts` and its tests;
  `packages/fluxiq/package.json`; `docs/architecture/package-boundaries.md`; the
  downstream host and its build script (read-only).
- Owns (may edit): the host-loading code in `apps/web/` and its tests. If the fix needs a
  `packages/fluxiq/package.json` change, report the exact change instead of editing
  (another worker edits that file).
- Must not touch: `packages/`, `scripts/structure-audit/`, anything downstream.
- Definition of done: Core `pnpm check` and the web tests pass; the scratch host loads
  through the panel's loader with the public import (output quoted).
- Report to: `reports/core-host-loading.md`

### Brief: core-structure-baseline
- Repository: FluxIQ Core
- Task: Core's `AGENTS.md` says a baseline entry "may shrink but never grow, and a new
  violation fails outright", but `pnpm structure:baseline`
  (`scripts/structure-audit/baseline.mjs`, `buildBaseline`) records any current violation
  that lacks an entry at its current value, grandfathering it; and `--update --rule <id>`
  rebuilds the baseline from the selected rules only, dropping every other rule's
  entries. Make `--update` lower or remove existing entries only; when a current
  violation has no entry, write nothing and exit non-zero naming each new violation; a
  rule-scoped update keeps other rules' entries. Tests beside the audit's existing tests.
- Required reads: `scripts/structure-audit.mjs`, `scripts/structure-audit/baseline.mjs`,
  the audit's existing tests.
- Owns (may edit): those two scripts and new tests for them.
- Must not touch: `.structure-baseline.json` except through a passing `--update`,
  `AGENTS.md`, `packages/`, `apps/`, anything downstream.
- Definition of done: `pnpm structure:test` and `pnpm structure:check` pass; on a scratch
  copy, a planted new violation makes `--update` fail and leaves the baseline
  byte-identical, and a rule-scoped update preserves other rules (outputs quoted).
- Report to: `reports/core-structure-baseline.md`

### Brief: core-web-test-health
- Repository: FluxIQ Core
- Task: five `@fluxiq/web` tests fail, all Automation Studio UI contract tests under
  `apps/web/src/features/automation-studio/`: `graph/tests/derivation-job.test.ts`,
  `hierarchy/tests/phase7-contracts.test.ts`,
  `testing/tests/synchronous-interaction-trace.test.ts`,
  `views/tests/GraphEditorViews.test.ts`, `workspace/cache/tests/cache.test.ts`. Neither
  the host loader nor the failure taxonomy touches them. First establish whether each
  fails on `HEAD`, on a clean `git archive HEAD` copy as `core-failure-taxonomy` did (its
  report says how) — never stash or check out over the working tree. Then, from
  `git log -p` and the Automation Studio working documents, find whether the test or the
  code is wrong for each, and fix that side. Never loosen an assertion just to pass; if
  the intended behaviour is unclear, report it with the evidence.
- Required reads: the five tests and the code they cover; `reports/core-failure-taxonomy.md`
  (the archive method); `reports/core-host-loading.md` (the failure output).
- Owns (may edit): the five test files and the source they cover under
  `apps/web/src/features/automation-studio/`.
- Must not touch: `apps/web/src/lib/fluxiq.ts`, `apps/web/src/instrumentation.ts`,
  `packages/`, `scripts/`, anything downstream.
- Definition of done: `pnpm --filter @fluxiq/web test` passes (counts quoted), or each
  remaining failure is reported with evidence; `pnpm check` passes.
- Report to: `reports/core-web-test-health.md`

### Brief: core-runtime-test-health
- Repository: FluxIQ Core
- Task: three `fluxiq` tests fail identically on `HEAD` — one in
  `_shared/tests/runtime-llm-grants.test.ts` ("issues a sanitized build grant …":
  "Flow bootstrap generation runtime is unavailable.") and two in
  `runtime/tests/service.test.ts` — and two in `service-subflow-pagination.test.ts` time
  out under full-suite load with `EBUSY` on a shared `global.sqlite`, passing alone. Find
  each cause from `git log -p` and the working documents, fix the wrong side without
  loosening any assertion, and make the pagination tests independent of suite load (for
  example a temporary database per test). Report any failure whose intended behaviour is
  a product decision.
- Required reads: the three test files, what they exercise, and
  `reports/core-failure-taxonomy.md` (the failure output and the files it changed).
- Owns (may edit): those three test files, their shared test support, and source in
  `packages/fluxiq/src/` only where a test exposes a real defect (list each).
- Must not touch: `packages/contracts/src/failure/`, `apps/`, `scripts/`, anything
  downstream; a needed change to a file core-failure-taxonomy edited is reported first.
- Definition of done: `pnpm --filter fluxiq test` passes twice in a row and `pnpm test`
  passes apart from core-web-test-health's files (counts quoted); `pnpm check` passes.
- Report to: `reports/core-runtime-test-health.md`

### Brief: core-adaptation-test-cost
- Repository: FluxIQ Core (`F:!FluxIQ`)
- Task: in `runtime/tests/service-flow-bootstrap-adaptation.test.ts`, the case
  that bridges a generated proposal ID through the PIN-gated Adaptation Audit
  endpoints exceeds the 15 s `testTimeout` whenever the whole suite runs, and
  passes when its file runs alone. Find what the case actually spends its time
  on and make it cheap, the way `service-subflow-pagination.test.ts` was: seed
  shared setup once and copy it per case instead of rebuilding it per case. Do
  not raise `testTimeout` and do not give the case its own timeout; the budget
  is the gate. Second defect in the same area: when a case times out, the
  `afterEach` removes the temporary directory while a service the case never
  registered is still open, so the run reports `EBUSY ... unlink
  project.sqlite-shm` instead of the timeout. Make teardown close what the case
  opened, so the reported error is the real one. If the cost turns out to be in
  source rather than the test, stop and report it instead of editing source.
- Required reads: the two test files named below; `packages/fluxiq/vitest.config.ts`;
  `runtime/tests/service-subflow-pagination.test.ts` for the seed-once pattern.
- Owns (may edit): `packages/fluxiq/src/programs/automation-studio/runtime/tests/
  service-flow-bootstrap-adaptation.test.ts`; the teardown only of
  `.../runtime/tests/service.test.ts`.
- Must not touch: any source file, `vitest.config.ts`, any other test.
- Definition of done: no assertion weakened, loosened, or removed; `pnpm --filter
  fluxiq test` -> 828 passed, run twice; `pnpm test` at the Core root -> exit 0
  captured without a pipe. Report the case duration before and after.
- Note: another agent is running browser benchmarks on this machine, so the box
  is loaded; that load is the condition the case must survive. Avoid shell
  heredocs here, they corrupt backslashes; write files with the editing tools.
- Report to: `docs/working/mvp-week1-web-automation-reliability-plan/reports/core-adaptation-test-cost.md`
### Brief: core-expectation-evaluator (C3)
- Repository: FluxIQ Core (`F:!FluxIQ`). Not yet dispatched; written at Wave 3
  planning so the downstream briefs can code against it.
- Task: add an optional expectation evaluator so a host can decide whether an
  expected state actually holds, instead of Core counting keys. Signature:
  `expectationEvaluator?(conditions, mode, timeoutMs, context)`. The
  `builtin.policy.expectation` node awaits it, and
  `compareAutomationStudioTransition` uses it to evaluate `expectedState` against
  the host current snapshot. A host that binds nothing keeps today behaviour
  exactly. Bind it beside `bindHostRuntime` in `runtime/service.ts`.
- Files named by the downstream plan: `programs/automation-studio/nodes/policy/
  expectation.ts`, `runtime/executor/contracts.ts`,
  `runtime/executor/transition-comparison.ts`, `runtime/service.ts`.
- Verified at planning, so do not redo it: C1 and C2 are complete. All seven
  adaptive failure classes exist, both target comparison statuses exist, and
  `classifyTransitionComparisonStatus` already classifies structured-first. The
  timeout-classification defect the downstream plan attributes to this unit is
  already fixed.
- Definition of done: a Core test proving an expectation node routes `failed`
  when a bound evaluator rejects, and that an unbound host is unchanged; Core
  `pnpm check`, `pnpm test`, `pnpm build`, `pnpm docs:check` and
  `pnpm package:lint` each exit 0, captured by redirect rather than through a
  pipe.
- Report to: `docs/working/mvp-week1-web-automation-reliability-plan/reports/core-expectation-evaluator.md`
