# MVP Week 1 — Web Automation Reliability Plan (Core share)

Status: Active
Status detail: Every Core contract this plan owes downstream exists and is verified; the two published-surface changes of 2026-09-12 — the `fluxiq/automation-studio/fingerprinting` exports subpath and the element matcher's missing-versus-contradicted identifier weights — are recorded here, and the matcher weight is now coupled to a downstream spec that must ship with it.
Created: 2026-09-11
Last updated: 2026-09-12
Owner: Senior supervisor agent
Scope: Core's share of the downstream web extension's MVP Week 1 plan: the failure-category enum, record, parser, and carriers on the gateway, runtime, dispatch, node, attempt, and LLM-context types; structured-first failure classification; the target-resolution outcome on the attempt trace; loading a domain's panel host through Core's public exports; the structure-audit baseline ratchet; the expectation-evaluator seam (C3, Wave 3); and the two 2026-09-12 element-matcher changes — publishing the matcher for a browser bundle, and charging a missing stable identifier less than a contradicted one.
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

**Two further Core changes landed for this plan on 2026-09-12, both on published
surfaces.** First, `fafe7c7` added the `fluxiq/automation-studio/fingerprinting`
exports subpath, so a browser build can use Core's element matcher without
resolving `node:crypto` and `node:perf_hooks` — which the neighbouring
`automation-studio` barrel reaches through `dsl/` and `testing/`. `fluxiq` went
to **0.2.1** in that commit, an additive export, and
`fingerprinting/tests/index.test.ts` walks the barrel's import closure so the
browser-safety claim fails a test rather than resting on a comment. Second,
`a575df2` split `compareExactSignal`'s single −0.55 penalty in
`fingerprinting/element-fingerprint.ts` into
`MISSING_STABLE_IDENTIFIER_SIMILARITY` (−0.1: the candidate carries no such
identifier) and `CONTRADICTED_STABLE_IDENTIFIER_SIMILARITY` (−0.8: it carries a
different one). That is downstream decision **D13**; its exhaustive 9,720-profile
proof, the before-and-after figures, and the two alternatives rejected by
measurement live downstream, in the paired plan and in `reports/v-core-scoring.md`.

**The published seam moved, and an integrator needs the figure from Core, not
only from downstream.** A candidate matching visible text and accessible name
exactly but carrying no `id` rises from confidence **0.428 to 0.577**. Core's
element-target ladder in `runtime/io-policy.ts` is destructive 0.9, privileged
0.82, review 0.68, safe 0.45, default 0.5 — so that candidate now clears **`safe`
and the default rung**, where it cleared neither before, while `review`,
`privileged` and `destructive` still refuse it. Recomputed here from the current
source rather than copied from the commit message: 24 + 24 − 2.6 over a possible
74 is 0.614 normalized, times the two-strong-match multiplier 0.94, is 0.577; at
the old −0.55 it was 33.7 / 74 = 0.455 × 0.94 = 0.428. Which rungs refuse is a
fact about *that* candidate, not about every candidate — measured while writing
the migration note, one agreeing exactly on every other recorded signal and
missing a single identifier crosses `destructive` as well (missing `statePath`
0.883 → 0.917). No rung is categorically out of reach; what protects the high
ones is how much else a candidate must answer to get near them.

**Core cannot change that constant on its own any more.** Flipping
`MISSING_STABLE_IDENTIFIER_SIMILARITY` back to −0.55 was measured downstream to
turn the `reworded-aria` case in
`apps/extension/e2e/content/tests/identity-resolution.spec.ts` red. The Core
constant and that downstream spec are one unit: changing the weight breaks the
downstream repository, and the two `dev` branches must be pushed together.

**The behaviour change now has a version and a note.** `fluxiq` is at **0.3.0**,
and `docs/architecture/package-boundaries.md` carries a `0.3.0` Migration Notes
entry with the measured figures, the rungs crossed and refused, the ranking
inversion, and what an integrator should check; the coupling above is recorded
in that document too, not only here. Minor rather than patch, and why is under
Decisions. `0.2.1` stays ambiguous by construction — two builds shipped under
it — and the note says so rather than pretending otherwise.

**One question is open for Core, raised downstream on 2026-09-12:** a client's
`clientType` and `capabilities` are taken straight from its `hello` frame, so
nothing that gates on either is an authentication. Detail under Open Questions;
do not treat a downstream gate on those values as a security boundary until it
is answered.

**Gates (2026-09-12, over the seam):** `pnpm check` exit 0, `pnpm docs:check`
exit 0, `pnpm package:lint` exit 0, `pnpm build` exit 0, each captured by
redirect rather than through a pipe. `packages/fluxiq` tests: **128 of 128 files
green** under `npx vitest run --no-file-parallelism`. The two later commits each
recorded the same four gates at exit 0 with 129 of 129 files green, the extra
file being the fingerprinting subpath test; the documentation change on top of
them re-ran `pnpm check` and `pnpm docs:check` only, both exit 0.

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

**Next steps:** no further Core contract is owed to this plan; downstream Wave 3
binds the seam. The version question is answered and closed. What is left in
Core is one decision, not an implementation: whether a client's declared
identity should be bound at pairing time (Open Questions).

**Blockers:** none.

---

## Decisions

- **A behaviour change on a published surface takes a minor version and a
  migration note.** The matcher weights shipped under the `0.2.1` an unrelated
  additive export had already published, so `fluxiq` is now **0.3.0** with a
  `0.3.0` entry under Migration Notes. Not a patch, for three reasons: Core's
  policy attaches migration notes to the minor rung, so a change that needs one
  has no home at the patch rung; the 0.2.0 note already carries an
  un-opt-out-able behaviour change under a minor increment, which is the same
  case; and this change moves a number the runtime's own element-target gates
  read, so under a caret range a `destructive` gate would move with no host code
  changing. Rejected alternative: declaring scoring weights outside the
  compatibility promise. `confidence` is a published output and the ladder's
  thresholds are Core's own, so excluding the weights would leave the ladder
  meaningless as a contract. `package-boundaries.md` now states that
  "compatible" is judged on what a consumer observes, not on the type surface.
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
- **The browser gets the matcher through a new exports subpath, not a
  restructure.** `fingerprinting/` already had its own barrel and compiles to
  JavaScript with no imports; only its publication was missing. Adding
  `./automation-studio/fingerprinting` to `packages/fluxiq/package.json` was
  therefore the whole fix, and the guarantee is held by
  `fingerprinting/tests/index.test.ts` rather than by a comment (`fafe7c7`).
- **An absent stable identifier is weaker evidence than a contradicting one, and
  the scale now says so** (downstream D13, `a575df2`). −0.1 against −0.8, as two
  named constants. Core accepted the measured cost on its published seam: a
  candidate with exact text and no `id` crosses the `safe` and default confidence
  rungs. The alternatives — lowering the downstream floor, or normalizing over
  answerable weight — were rejected by measurement downstream, not by preference.
- **`MISSING_STABLE_IDENTIFIER_SIMILARITY` is a cross-repository constant.** A
  downstream e2e case is calibrated against its value, so Core changes it only
  together with that spec, and the two repositories' `dev` branches ship the
  change in the same work unit.

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

### 2026-09-12 — The element matcher published for a browser bundle

- Agent: supervisor (commit `fafe7c7`); recorded here afterwards by
  worker p-core-docs.
- Changed: `packages/fluxiq/package.json` (version 0.2.0 -> 0.2.1 and the
  `./automation-studio/fingerprinting` exports entry), a new
  `programs/automation-studio/fingerprinting/tests/index.test.ts`,
  `scripts/validate-packages.mjs`, `docs/architecture/automation-studio.md`,
  `docs/architecture/package-boundaries.md`, `docs/working/README.md`.
- Why: downstream D1 assumed the matcher was already importable from a browser
  bundle. It was not — not because the code is Node-bound, but because the only
  published path to it was the `automation-studio` barrel, which re-exports
  `dsl/` and `testing/` and so reaches `node:crypto` and `node:perf_hooks`. A
  packaging change, not a restructure: `fingerprinting/` already had a barrel.
- Validation: the commit records `check`, `docs:check`, `package:lint` and
  `build` each exiting 0, with `packages/fluxiq` at 129 of 129 test files green
  under `--no-file-parallelism`. Re-checked against the tree by p-core-docs
  rather than taken from that text: `packages/fluxiq/package.json` is at
  `0.2.1` and carries the subpath exactly as the new test asserts it
  (`node -e` over the manifest printed both), and the test walks the barrel's
  import closure so a runtime import added anywhere in it fails.
- Outcome: Accepted

### 2026-09-12 — A missing stable identifier charged less than a contradicted one

- Agent: supervisor (commit `a575df2`); recorded here afterwards by
  worker p-core-docs.
- Changed: `programs/automation-studio/fingerprinting/element-fingerprint.ts`
  (the two named constants replacing one −0.55 branch) and a paragraph in
  `docs/integrations/automation-studio-importing-repos.md` telling importers to
  omit an identifier a candidate lacks rather than fill it with a placeholder.
- Why: downstream D13. Level 2 target scoring downstream could not succeed,
  because reaching it requires the recorded identifiers to be absent and absence
  was charged nearly as heavily as a contradiction.
- Validation: the commit records `check`, `docs:check`, `package:lint` and
  `build` each exiting 0, with `packages/fluxiq` at 129 of 129 test files green
  under `--no-file-parallelism`. Independently recomputed from the current
  source by p-core-docs, not read out of the commit message: with
  `MISSING_STABLE_IDENTIFIER_SIMILARITY` at −0.1, a candidate matching visible
  text and accessible name exactly and carrying no `id` scores
  (24 + 24 − 2.6) / 74 = 0.614 normalized and 0.614 × 0.94 = **0.577**
  confidence, against 33.7 / 74 = 0.455 and **0.428** at the old −0.55 — the
  same two figures the commit claims. Read back from
  `runtime/io-policy.ts`, the ladder it crosses is destructive 0.9, privileged
  0.82, review 0.68, safe 0.45, default 0.5.
- Found: the version bump to 0.2.1 belongs to `fafe7c7` earlier the same day,
  not to this commit; this behaviour change to a published seam carries no
  version increment and no entry under Migration Notes in
  `docs/architecture/package-boundaries.md`. Raised under Open Questions.
- Outcome: Accepted

### 2026-09-12 — Core's document brought current with both changes

- Agent: worker p-core-docs.
- Changed: this document (header, Current State, Decisions, this ledger, Open
  Questions) and `docs/working/README.md`.
- Why: Core's `Current State` still ended at the expectation-evaluator seam, so
  the moved confidence seam, the constant a downstream spec is now calibrated
  against, and the client-identity question raised downstream on 2026-09-12
  existed only in the downstream repository.
- Validation: `pnpm check` -> exit 0 and `pnpm docs:check` -> exit 0, each run
  with output redirected to a file and the exit status echoed, never through a
  pipe. Every claim written into Current State was checked against Core source
  first: `element-fingerprint.ts:282-288` for the two constants,
  `io-policy.ts:291-300` for the ladder, `client-gateway/service/lifecycle.ts:70-90`
  for the hello ordering, and `packages/fluxiq/package.json` for the subpath.
- Outcome: Accepted

### 2026-09-12 — The matcher behaviour change given a version and a note

- Agent: worker p-core-version.
- Changed: `packages/fluxiq/package.json` (0.2.1 -> **0.3.0**),
  `docs/architecture/package-boundaries.md` (version line; "compatible" judged
  on what a consumer observes, not the type surface; the cross-repository
  coupling of the two matcher constants; a `0.3.0` Migration Notes entry), this
  document, `docs/working/README.md`.
- Why: `a575df2` changed a published matcher's behaviour under the `0.2.1`
  `fafe7c7` had already published for an unrelated additive export, with no
  migration note, so `fluxiq@0.2.1` names two different behaviours.
- Validation: `pnpm check` (exit 0, `structure-audit: passed`, four packages
  `check: Done`), `pnpm package:lint` (exit 0, reading `fluxiq v0.3.0`) and
  `pnpm build` (exit 0) on the final tree; `pnpm docs:check` exit 0 twice over
  these edits (`Validated local links in 99 ... files.`, `Deterministic
  framework reference is current.`) and red on a third run only after another
  worker edited `nodes/parameter-bindings.ts` at 18:28, which staled the
  generated `docs/reference/framework-reference.md`; that file carries no
  version string and no source here was touched, so it is not this change's.
  Everything captured by redirect, never a pipe. The figures were re-measured
  against the compiled matcher rather than copied: 0.428 -> 0.577 exactly.
- Found: three things the commit did not claim, measured here and now in the
  note. `matchedSignals`/`failedSignals` are unchanged, so a diagnostic sees
  nothing move; two candidates can swap rank (18.3 -> 42.6 against a flat 27.6),
  so the *selected* element can change; and a candidate agreeing exactly on
  every other recorded signal crosses `destructive` too (0.883 -> 0.917) — the
  commit's "review, privileged and destructive still refuse it" is true of one
  candidate, not of every candidate.
- Not verified: `pnpm test` is not green, and every red belongs to another
  worker's in-flight source rather than to this change. `packages/fluxiq` ran
  128/129 files with the recorded TypeDoc-budget case (which passes alone at
  12.30 s), then 129/130 with six cases in `nodes/parameter-bindings.test.ts`,
  whose subject and test are both modified in the tree; `apps/web` ran 227/228
  and then 228/228 once the worker editing it moved on. Re-run once the tree
  settles.
- Outcome: Accepted

### 2026-09-12 — A value resolved out of state is withheld from the persisted trace

- Agent: supervisor (downstream session finishing Week 1). The code was found
  uncommitted and recorded nowhere, most likely left by session `fluxiq-df` as
  the Core leg `p-secret-binding` named; no other Claude session was running, so
  it was verified and taken over rather than discarded.
- Changed: `runtime/executor/graph-run.ts` (withholding seeded from each node's
  declared bindings against the run's inputs and variables, applied to the
  finished trace), `executor/node-execution.ts` (records what resolution
  supplied before any early return), `executor/index.ts` (exports
  `AUTOMATION_STUDIO_WITHHELD_VALUE`), `flow-bootstrap/plan/validation.ts`
  (`allowStateBinding: false` and empty paths enforced at every depth, through
  the resolver's own predicate), their tests, a new
  `executor/tests/trace-withholding.test.ts`, and
  `docs/architecture/automation-studio.md` and
  `automation-studio-native-nodes.md`. `trace-withholding.ts` itself was already
  committed in `368b3c9`, unwired.
- Why: once `368b3c9` resolved bindings below the top level, the resolved
  answer, not the request, travels into the `policy.output.dispatch` effect,
  the attempt, and the persisted trace, so a replay credential would be written
  to disk. Compatibility: a persisted trace now reads `[withheld]` wherever a
  run resolved a value; a plan nesting a binding inside a literal-only parameter
  now fails validation with `bootstrap.invalid_state_binding`.
- Found: the two recording points were each untested. Removing the seed alone,
  or the per-node record alone, left all 26 executor tests green. Two tests were
  added: a run that fails before the bound node executes, and a binding answered
  by an earlier node's output.
- Validation: `npx vitest run .../runtime/executor .../runtime/flow-bootstrap
  --no-file-parallelism` -> `Test Files 6 passed (6)`, `Tests 74 passed (74)`.
  Mutations, each restored byte-identical (`git diff --stat` unchanged at
  `7 files changed, 238 insertions(+), 16 deletions(-)`): no `apply` -> 4 of 28
  fail; no seed -> 1 fails, "fails before the bound node ever executes"; no
  per-node record -> 1 fails, "a binding took from an earlier node's output";
  neither -> 4 fail; no nested validation -> 2 of 25 fail. `pnpm check` with the
  change staged -> exit 0, `structure-audit: passed (120 warning(s), 256
  baselined)`. `pnpm test` -> exit 0. `pnpm docs:check` -> exit 1,
  `framework-reference.md is stale`; `pnpm docs:reference` regenerated it (the
  new export and two moved line numbers only), then `pnpm docs:check` -> exit 0,
  `Deterministic framework reference is current.`
- Not verified: `pnpm build`, deferred until the downstream workers finish,
  because the downstream packages import `fluxiq` through `dist`. Committed
  locally; pushed only after that build passes.
- Outcome: Accepted

### 2026-09-13 — A late recording message is discarded, not a failed connection

- Agent: downstream worker `g-core-late-event`, briefed by the downstream
  supervisor (its brief and report live in the downstream plan's `briefs/` and
  `reports/`); verified by that supervisor.
- Changed: `programs/automation-studio/client-gateway/bridge.ts` (a private
  `appendOrDiscard` around every append a client message causes: the direct
  recorded input, the queued entry flush, and the `client.error` marker),
  `client-gateway/tests/bridge.test.ts` (four rows),
  `docs/architecture/automation-studio/client-gateway.md`, and the two generated
  `framework-reference.md` copies.
- Why: Stop finalizes a recording before the bridge forgets it, so a message
  arriving in that gap still finds it active and the service throws
  "Finalized recordings are immutable." (`runtime/service.ts:1017`). On the
  direct path the throw escaped `gateway.receive`, the WebSocket host answered
  `server.error` `gateway.receive_failed`, and the extension marked a healthy
  connection failed; on the 25 ms timer flush it was an unhandled rejection that
  lost the entry silently. Now a refused append re-reads the recording, and when
  `endedAt` is set the messages are audited as discarded against that recording;
  any other failure still propagates. The service refuses with an uncoded
  `Error`, so the match is the condition the service tests, never its message
  text. No error frame is sent to the client: that is a Week 2 contract.
- Validation: supervisor `npx vitest run
  .../client-gateway/tests/bridge.test.ts --no-file-parallelism` -> `Tests 15
  passed (15)`; `pnpm check` -> exit 0, `structure-audit: passed (120
  warning(s), 256 baselined)`; `pnpm docs:reference` -> one line changed in each
  copy (`AutomationStudioClientGatewayBridge` moved from `bridge.ts:84` to
  `:91`); `pnpm docs:check` -> exit 0, `Deterministic framework reference is
  current.` Worker: before the fix `3 failed | 13 passed` with one unhandled
  rejection; four mutations each failed their rows, restored byte-identical.
- Found: `appendRecordingDomainEvent` never checks `endedAt`, so a late event
  with no registered input is written into a finalized recording (a probe, not
  fixed here); briefed downstream as part of `g-core-target-gate`.
- Not verified: `pnpm build` and `pnpm test` (the Lab will run against a pinned
  worktree of this commit); the extension's behaviour after the fix, live.
- Outcome: Accepted

### 2026-09-13 — A rejected expected state fails its action attempt

- Agent: downstream worker `w19-c1`, briefed by the downstream supervisor
  (`briefs/finish-week1.md`, `reports/w19-c1.md` in the downstream plan);
  verified by that supervisor.
- Changed: `programs/automation-studio/runtime/executor/transition-comparison.ts`
  and `executor/tests/node-execution.test.ts`.
- Why: a probe of this executor gave a click whose expected state the host
  rejected as `auth_required` -> `"runStatus": "succeeded"`, the attempt
  `"failure": null`, the comparison only `"blocked"`, and the next node
  dispatched, so an expectation could never fail a run. Now a rejection returns
  the attempt as `status: "failed"`, `route: "failed"`, with a `message` and
  `failure` set to the host's record when it parses and Core's
  `expected_state_missing` record otherwise, keeping `transitionComparison`.
  Non-succeeded attempts and `builtin.policy.expectation` are untouched.
- Compatibility: this is a behaviour change for every host that binds
  `expectationEvaluator` on a node carrying `expectedState`; the downstream web
  domain declares the parameter but nothing writes it yet. It ships in the same
  minor release as the target-gate change.
- Found: nothing in Core honours a node's `failureRoute`, even for a failed
  dispatch (a probe routed a `failureRoute: "success"` failure as `failed`), so a
  rejection routes exactly as a failed dispatch does; that gap is a Week 2 item.
  The `expected_state_missing` record is copied from an unexported constant in
  `nodes/policy/expectation.ts`; the downstream `w19-c2` brief exports it once
  and deletes the copy.
- Validation: supervisor, `npx vitest run .../executor/tests/node-execution.test.ts
  .../transition-comparison.test.ts .../trace-withholding.test.ts
  --no-file-parallelism` -> `Test Files 3 passed (3)`, `Tests 28 passed (28)`.
  Worker: removing the transform -> `4 failed | 7 passed`; removing the record
  parse -> `1 failed | 10 passed`; both restored byte-identical; `pnpm check` ->
  exit 0; `pnpm docs:check` -> exit 0.
- Not verified: `pnpm build`, root `pnpm test`, and the Lab.
- Outcome: Accepted

## Open Questions

- **A client's declared identity is not authenticated, so nothing that gates on
  it is a boundary.** In `packages/fluxiq/src/client-gateway/service/lifecycle.ts`,
  `handleHello` calls `applyHello` at line 73 — before the token check on line 74
  and unconditionally — and `applyHello` assigns `session.clientType` (line 85)
  and `session.capabilities` (line 88) straight from the `hello` frame. The token
  path that follows binds only the identifier: `resumeTrustedSession` rejects
  unless `trustedClient.clientId === session.clientId` (line 99) and never
  reconciles the declared type or capability list against what was paired. So
  both values are client-supplied claims for the whole life of the session,
  including after the session becomes ready.
  The consequence downstream, raised 2026-09-12: the extension-only filter in
  `domain/src/io/gateway-output-dispatcher.ts:44-56` (mirrored in
  `domain/src/runtime/adapter.ts:136-147`) selects sessions by
  `clientType === "extension"` plus a declared `web.actions` capability, so it is
  a convention for picking the right client, not an authentication. Downstream
  redaction guards that honour a client-declared flag are therefore defence in
  depth against our own producers, not protection against a hostile client, and
  the same holds for anything else in Core or a domain that reads those two
  fields. An enforceable boundary would have to bind the declared type and
  capabilities to the trusted client at pairing time, where the operator's
  approval already is, and refuse or re-derive them on reconnect. Not designed
  here, deliberately: it changes the pairing contract and both sides of the
  gateway. Raised by downstream work 2026-09-12; owner: senior supervisor agent
  (Core).
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
