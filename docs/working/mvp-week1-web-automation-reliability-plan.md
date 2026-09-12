# MVP Week 1 — Web Automation Reliability Plan (Core share)

Status: Active
Status detail: Core work unit pulled ahead of downstream Wave 2 — failure taxonomy and carriers (C1, C2, D9), domain-host loading through public exports, and the structure-baseline ratchet; three workers dispatched 2026-09-11.
Created: 2026-09-11
Last updated: 2026-09-11
Owner: Senior supervisor agent
Scope: Core's share of the downstream web extension's MVP Week 1 plan: the failure-category enum, record, parser, and carriers on the gateway, runtime, dispatch, node, attempt, and LLM-context types; structured-first failure classification; the target-resolution outcome on the attempt trace; loading a domain's panel host through Core's public exports; the structure-audit baseline ratchet; later, the expectation-evaluator seam (C3, Wave 3).
Paired document: `F:\!FluxIQWebExtension\docs\working\mvp-week1-web-automation-reliability-plan.md`
Related: [package boundaries](../architecture/package-boundaries.md), [code structure](../architecture/code-structure.md), downstream audits `audit-core-runtime.md` section (c) and `audit-failures.md` under `F:\!FluxIQWebExtension\docs\working\mvp-week1-web-automation-reliability-plan\reports\`

---

## Current State

**Phase: Core work unit in progress.** On 2026-09-11 the user directed that
changes belonging in Core are made in Core, never approximated downstream.
This unit replaces three downstream stand-ins and one planned one: a failure
code carried in a gateway result's `metadata`, a domain-local failure-category
list, a downstream host deep-importing Core's `dist`, and a baseline command
that grandfathers new violations. The user was alerted before the first Core
edit (areas: `packages/contracts`, `packages/fluxiq`, the web app's domain-host
loader, `scripts/structure-audit/`; impact: additive optional fields, new enum
members under the minor bump the user approved as downstream decision D9).

**Done:** this document and the five unit briefs; core-structure-baseline,
core-host-loading, core-failure-taxonomy, core-web-test-health, and
core-runtime-test-health verified (ledger). **C3, the expectation-evaluator
seam, is complete and verified** — every Core contract this plan owes the
downstream plan now exists.

The seam landed in a different shape than the brief described, and the
supervisor ratified it: the evaluator is an optional method **on
`AutomationStudioHostRuntimeBoundary`**, not a separate `bindExpectationEvaluator`
on the service, so a host that already binds a runtime boundary gets it through
the same `bindHostRuntime` call and `runtime/service.ts` needed no change.
Detail and rationale in
[reports/core-expectation-evaluator.md](./mvp-week1-web-automation-reliability-plan/reports/core-expectation-evaluator.md).
The downstream consequence is that the binding belongs on the boundary object,
so it was folded into the downstream `w3-host-runtime` brief instead of being
briefed on its own.

**Gates (2026-09-12, over the seam):** `pnpm check` exit 0, `pnpm docs:check`
exit 0, `pnpm package:lint` exit 0, `pnpm build` exit 0, each captured by
redirect rather than through a pipe. `packages/fluxiq` tests: **128 of 128 files
green** under `npx vitest run --no-file-parallelism`.

**Core's parallel test suite is unsound on this machine, and it predates this
work.** `pnpm test` in parallel loses one or two test files per run to `Error:
Worker exited unexpectedly`, and once died with a segmentation fault; the file
lost differs between runs. The cause surfaces as `SQLITE_CORRUPT: malformed
database schema (fk_subflows_parent_flog_id_insert)` in
`global-automation-studio-workspaces.test.ts` — Core's suite uses a native
SQLite module, so the corruption usually kills the worker outright instead of
failing a test. Verify Core with `--no-file-parallelism` here, and treat a
parallel worker crash as an environment result rather than a regression. Note
for anyone bisecting this: a single clean parallel baseline run does not clear a
change, because the flake is intermittent — the sequential run is the sound
comparison.

**Next steps:** none in Core for this plan. Downstream Wave 3 binds the seam.

**Blockers:** none.

---

## Decisions

- **Core owns failure names, the record, its parser, and every carrier; the
  domain produces values.** One enum only — `AutomationStudioAdaptiveFailureClass`
  extended, never a second taxonomy in Core or downstream (downstream D3).
- **Every addition is optional, with one deliberate exception.** A host that
  sets none of the new fields still gets Core's own failure records for
  timed-out, rejected, and unconfirmed dispatches and for element-target misses,
  and a failed dispatch's error becomes the attempt message, so the legacy regex
  classifier (kept only for records without the structured field) now sees it.
  That is the purpose of C1; the migration note records it.
- **Category mapping.** Downstream plan names map to Core members by the table in
  `reports/core-failure-taxonomy.md`. `STATE_MISMATCH` → `expected_state_missing`
  and `ACTION_REJECTED` → `blocked_by_capability_or_policy` are accepted; a
  producer may still use `unexpected_state` when an unexpected element is the cause.
- **The failure-record parser drops a record that breaks its rules, whole.** Six
  categories are never retryable, and target categories name only the
  `target_resolution` stage; every producer's tests therefore parse what it emits.
- **`@fluxiq/client-gateway-websocket` stays at 0.1.0.** It only re-exports the
  gateway result, whose new `failure` field is optional; `@fluxiq/contracts` and
  `fluxiq` move to 0.2.0.
- **Value imports inside `packages/contracts/src` use `.ts` specifiers.** The web
  app compiles contracts source through Turbopack, which does not map `.js` back
  to `.ts`; the build rewrites them to `.js` in `dist`.

## Worker Briefs

Report paths are under `docs/working/mvp-week1-web-automation-reliability-plan/reports/`.
Workers follow Core's `AGENTS.md` (Repository Boundary, Code Structure,
Validation) and write file content with the Write or Edit tool, never a Bash
heredoc (the Bash tool corrupts `\\`, and commands over about 8 KB fail).

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
## Work Ledger

### 2026-09-11 — Document created; Core unit briefed
- Agent: supervisor
- Changed: this document.
- Why: the user directed that Core-owned changes go in Core; the downstream
  plan's C1 and C2 move ahead of its Wave 2, joined by the host-loading and
  baseline fixes.
- Validation: not validated — documentation only.
- Outcome: Accepted
- Follow-up: dispatch the three workers.

### 2026-09-11 — Structure baseline ratchet fixed
- Agent: supervisor, with core-structure-baseline
- Changed: `scripts/structure-audit/baseline.mjs`, `scripts/structure-audit.mjs`,
  new `scripts/structure-audit/tests/baseline.test.mjs`; the root
  `structure:test` script covers the new tests folder (supervisor). Also:
  core-failure-taxonomy was granted `runtime/executor/node-execution.ts` and
  the gateway transport on its request.
- Validation: `pnpm structure:test` -> `# tests 48 # pass 48 # fail 0`;
  `pnpm structure:check` -> `passed (117 warning(s), 256 baselined)`; the
  worker's scratch-clone demonstration: a planted new violation and a grown
  entry each make `--update` exit 1 with the baseline byte-identical, and a
  `--rule` update keeps other rules' entries.
- Decisions: a grown entry blocks `--update` like a new one; a full update
  drops entries for rules that no longer report anything.
- Outcome: Accepted
- Follow-up: mirrored downstream in the same work unit.

### 2026-09-11 — Domain hosts load through native import()
- Agent: supervisor, with core-host-loading
- Changed: `apps/web/src/lib/fluxiq.ts` loads `FLUXIQ_HOST_MODULE` with a native
  `import()` (`loadFluxIQHostModule`), awaited once at server start by the new
  `apps/web/src/instrumentation.ts`; `packages/fluxiq/package.json` unchanged.
  Supervisor: `docs/operations/data-and-state.md` and
  `docs/integrations/automation-studio-importing-repos.md` now say the host is an
  ES module that imports public entry points.
- Decision: dynamic `import()`, not a CommonJS entry — the packages are ESM-only
  by policy, `package:lint` checks them with attw's `esm-only` profile, and Node
  22.11 lacks `require(esm)`.
- Contract: an entry point other than Next that builds the web runtime with
  `FLUXIQ_HOST_MODULE` set must first `await loadFluxIQHostModule()`; none exists.
- Validation: loader tests -> `13 passed (13)`; `pnpm package:lint` -> exit 0;
  worker: `pnpm check` exit 0, web build exit 0, and a copy of the downstream host
  using the public `fluxiq/automation-studio` import loads through the new loader
  with the native runtime bound (`"definitionCount":11`). The web suite has five
  failing Automation Studio tests that do not reference the loader.
- Outcome: Accepted
- Follow-up: the downstream host becomes an ES module with the public import.

### 2026-09-11 — Failure taxonomy and carriers
- Agent: supervisor, with core-failure-taxonomy
- Changed: `packages/contracts/src/failure/` (the category list, the failure record,
  its parser); the `failure` carriers on the gateway, runtime, dispatch, node,
  attempt, run-record, and LLM-context types; structured-first classification; the
  `target_not_found` and `target_ambiguous` comparison statuses; `@fluxiq/contracts`
  and `fluxiq` at 0.2.0 with a migration note; four architecture pages.
- Validation: `pnpm check` -> exit 0, `structure-audit: passed (117 warning(s),
  256 baselined)` (supervisor); worker: `pnpm build` -> exit 0; `pnpm test` ->
  fluxiq `Tests 5 failed | 817 passed (822)`: three fail identically on a clean
  `git archive` of `HEAD`, two pagination tests time out only under full-suite
  load. The five Automation Studio web tests still fail after both workers
  finished (supervisor rerun).
- Outcome: Accepted
- Follow-up: core-runtime-test-health and core-web-test-health; `pnpm
  docs:reference`; the downstream adoption.

### 2026-09-11 — Five stale Automation Studio tests brought current
- Agent: supervisor, with core-web-test-health
- Changed: five test files under `apps/web/src/features/automation-studio/`; no
  source. The tests expected plain view IDs, but commit `2a6b8a5` gave Flow- and
  subflow-scoped views object-qualified IDs (documented in
  `docs/architecture/automation-studio/workspace.md`), and `5361951` turned a
  preloader key into a constant with the same value. No assertion was loosened;
  two were added. Supervisor: the framework reference was regenerated (`pnpm
  docs:reference`; `pnpm docs:check` -> "Deterministic framework reference is
  current.").
- Validation: `pnpm --filter @fluxiq/web test` -> `Test Files 227 passed (227)`,
  `Tests 1146 passed (1146)` (supervisor); worker: the same five fail on a clean
  `git archive` of `HEAD` (`e522f17`).
- Outcome: Accepted

### 2026-09-11 — Runtime test health: three lost writes fixed
- Agent: supervisor, with core-runtime-test-health
- Changed: `runtime/service.ts`, `runtime/service/flows/` (`mapping`, `store`,
  `writer`, `graph-patch`), and two test files. Three of the five failures were
  defects, not stale tests. The `build_and_adapt` grant test had never passed:
  the gate and the test arrived together in `5361951`, and the composition the
  test used binds no native node runtime, so the refusal was correct; the test
  now binds a host-style runtime. The two service cases were source defects from
  `0271d60`, which made `getFlow` return the canonical SQL graph without routing
  writes to match, losing a write three ways: an unpinned graph version came back
  as the sentinel `legacy` and failed the next save (now `flowNodeFromGraphRecord`,
  one conversion shared with `graph-patch.ts`, which carried the same fault with
  no test over it); a proposal approval reconciled from the graph it was
  replacing (now the saved document); and a plain `saveFlow` never reached the
  canonical graph (now `reconcileCanonicalGraphFromDocument`, which skips when
  there are no revisions and when the graph is unchanged, so a metadata-only save
  cannot invalidate an editor base revision). The pagination cases were test
  design: each test has its own database, and the timeout came from about 300 ms
  of per-subflow setup in the test bodies, so inventories are now seeded once and
  copied, and the raised budget was removed rather than kept. Supervisor: the
  million-event stream case writes about 158 MB, and its scratch root moved to
  the OS temp directory.
- Validation: `pnpm --filter fluxiq test` -> 827 passed of 828, twice (worker),
  the single failure being the million-event case. Supervisor, before and after
  the scratch-root move: `pnpm --filter fluxiq test runtime-stream-store` ->
  `Tests 6 passed (6)`, that case 49819 ms then 17072 ms against its 60 s budget.
  The rewritten pagination tests still discriminate: raising the bound to 64
  fails one, and breaking both hydration guards fails the other.
- Outcome: Accepted

### 2026-09-11 — Adaptation Audit case under budget; Core suite green
- Agent: supervisor, with core-adaptation-test-cost
- Changed: `runtime/tests/service-flow-bootstrap-adaptation.test.ts`, and the
  teardown of `runtime/tests/service.test.ts`. The cost was fixture rebuilding,
  not the endpoints the case asserts: seeding once and copying per case took it
  from 14685 ms to 12110 ms under full-suite load against the unchanged 15 s gate,
  and from 4869 ms to 3247 ms solo. Both teardowns now retry the directory
  removal so an EBUSY cannot replace the failure a run is reporting. Supervisor:
  the worker explanatory comments were removed, because they grew a baselined file
  past its 4789-line entry and the ratchet refuses growth; the reasoning is kept
  here and in the report instead.
- Validation: supervisor, `node scripts/structure-audit.mjs` -> passed, 0
  violations; `pnpm test` at the Core root, redirected with the exit status echoed
  rather than piped -> exit 0, contracts 7 of 7, client-gateway 3 of 3, fluxiq 828
  of 828, web 1146 of 1146. An earlier supervisor run failed at 827 of 828 on an
  unrelated documentation case, recorded under Open Questions.
- Found: the worker suggested follow-up, closing a repository opened directly in
  one case, does not exist as an API; that class opens and closes per operation.
- Outcome: Accepted
## Open Questions

- **Problems-panel visibility uses an exact view-ID match.**
  `useAutomationGraphRuntime.ts` compares the Problems view with `===`, while
  scoped views can carry object-qualified IDs. It is correct today because
  Problems opens only with the plain ID; if anything opens it with the qualified
  form, graph validation stops without an error. Not changed: the intended
  behaviour is undocumented and the area belongs to other Automation Studio
  plans. Raised with the user 2026-09-11; owner: senior supervisor agent.
- **Two runtime service tests are load-sensitive, and their teardown hides why.**
  In a full `pnpm test` run sharing the machine with other work,
  `runtime/tests/service.test.ts` (turns mapped observations into reviewed Flow
  actions) and `runtime/tests/service-flow-bootstrap-adaptation.test.ts` (bridges
  a generated proposal ID through the PIN-gated endpoints) exceed the 15 s
  `testTimeout` in `packages/fluxiq/vitest.config.ts`. Run alone, the same two
  files pass: `Tests 147 passed (147)`, exit 0. The timeout aborts the body
  before every service reaches the set that `afterEach` closes, so removing the
  temporary directory fails with `EBUSY ... unlink project.sqlite-shm`, and that
  is the error vitest reports instead of the timeout. Two defects, not one: the
  setup cost that makes 15 s tight, and a teardown that masks the real failure.
  Raised 2026-09-11; owner: senior supervisor agent.
  Update, after core-adaptation-test-cost: the cost half is fixed. The case runs
  12110 ms under full-suite load, from 14685 ms, against the unchanged 15 s gate,
  by seeding the fixture once and copying it per case; the directory removal now
  retries so an EBUSY cannot replace the failure a run is reporting. The cause of
  the EBUSY is still unidentified, and two hypotheses are now disproved. Mine,
  that a service escapes the set `afterEach` closes, and the worker follow-up
  suggestion to call `await repository.close()` on the repository opened directly
  in the Subflow-scale case: `SQLiteRepository` holds no handle between
  operations, since every operation opens and closes inside a `finally`
  (`database-manager/storage/sqlite-repository.ts`), and the class exposes no
  `close` method at all, so that call would not compile. The masking was never
  reproduced, so the retry is verified only as not breaking passing runs, and the
  residual cost is source-side SQLite persistence, so a slower machine can still
  exceed the gate.
- **A TypeDoc reference case loses its budget by a hair under load.** In
  `programs/tests/global-docs.test.ts`, the case generating the TypeDoc-backed
  framework reference timed out at 15041 ms against its own explicit 15 s budget
  in one full-suite run, and passed in three others, including a supervisor run
  at 828 of 828. The budget was set on 2026-09-10 in `e55a141`, so it is not a
  stale number. The cost is inherent: the case runs TypeDoc across the whole
  repository. The same suite already budgets two comparably heavy cases at 30 s.
  Not changed, deliberately: widening a gate that currently passes lowers
  sensitivity rather than fixing anything, and making the generation cheaper, or
  moving it out of the unit suite, is a Core design call. Raised 2026-09-11;
  owner: senior supervisor agent.
