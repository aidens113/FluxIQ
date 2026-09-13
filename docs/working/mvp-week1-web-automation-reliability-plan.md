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

The completed Week 1 Core briefs are archived verbatim at
[archive/2026-09-13-core-worker-briefs.md](./mvp-week1-web-automation-reliability-plan/archive/2026-09-13-core-worker-briefs.md).

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

### 2026-09-13 — An honest element-target trace, the recorded element's identity, and no late domain events

- Agent: downstream worker `g-core-target-gate` (`reports/g-core-target-gate.md`
  in the downstream plan); verified by the downstream supervisor.
- Changed: `nodes/contracts.ts` (the target resolution is a union keyed on
  `status`); `runtime/io-policy.ts` (with no candidates the resolution is
  `{ status: "unresolved_no_candidates", candidateCount: 0 }`, with no
  `minimumConfidence` claimed as applied); `model/action-element-target.ts` and
  the mapper-target region of `runtime/service.ts` (a recorded action's target
  takes its identity from `parameters.element`, maps `implicitRole` to `role`,
  and never copies the typed `parameters.text` into `visibleText`; the action's
  own `selector` and `statePath` still win); `appendRecordingDomainEvent` in
  `runtime/service.ts` refuses a finalized recording, and `client-gateway/bridge.ts`
  audits such an event as `recording.event_discarded`; their tests;
  `docs/architecture/automation-studio.md`, `automation-studio-native-nodes.md`,
  `package-boundaries.md`; both generated framework references;
  `.structure-baseline.json` (`service.test.ts` lowered from 4789 to 4787).
- Why: the downstream `i-resolver-safety` investigation found the element-target
  gate is inert for web and was misreporting itself: its trace presented a
  confidence floor no candidate was ever measured against, and the mapper built a
  type node's target with the typed text as its visible text. A probe also showed
  a late domain event with no registered input written into an already-finalized
  recording.
- Decisions: the `bridge.ts` and `bridge.test.ts` edits, outside the brief, are
  accepted: without the bridge wrap the refusal would reject `gateway.receive`
  and reopen the connection-failing defect `267a2ca` closed. Wiring candidates
  into the gate (B.3) is Week 2. The `minimumConfidence` type change can break a
  host that reads it unconditionally, so this and the expectation verdict change
  go out as a minor release, with the migration note taken out of "Unreleased".
- Validation: supervisor, `npx vitest run .../runtime/tests/io-policy.test.ts
  .../model/tests/action-element-target.test.ts
  .../client-gateway/tests/bridge.test.ts .../runtime/tests/service.test.ts
  --no-file-parallelism` -> `Test Files 4 passed (4)`, `Tests 142 passed (142)`;
  `pnpm check` -> exit 0, `structure-audit: passed (120 warning(s), 256
  baselined)`, `1 baseline entries can be lowered`; `pnpm docs:check` -> exit 0.
  Worker: every new row failed before its fix; six mutations each failed only
  their row, restored byte-identical. Its full sweep failed four executor rows
  only because `w19-c1` was editing those files at the same time, a
  coordination slip by the supervisor; `6f172b9` is that work, verified
  separately.
- Not verified: a generated Flow's click node carrying the recorded identity and
  its type node carrying no typed text, in the Lab; a live late domain event;
  `pnpm build` and root `pnpm test`.
- Outcome: Accepted

### 2026-09-13 — A recording mapper can claim the state its action should leave, and sees what followed

- Agent: downstream worker `w19-c2` (`reports/w19-c2.md` in the downstream plan);
  verified by the downstream supervisor.
- Changed:
  - `nodes/importer-sdk.ts`: an optional `expectedState` on
    `AutomationStudioRecordingMapperCandidate`, and a mapper context `following`,
    the next 32 timeline observations.
  - `runtime/recording-flow-proposal.ts`: the candidate's optional `expectedState`.
  - A new `runtime/service/recordings/proposal-candidates.ts`. It builds the
    mapper calls, keeps a plain-object `expectedState` as a clone and drops
    anything else, and writes it into an approved Flow node's
    `parameterValues.expectedState`.
  - `runtime/service.ts`, from which that construction moved (6919 to 6807
    lines); one export line in `runtime/service/recordings/index.ts`; the new test
    `runtime/service/recordings/tests/proposal-candidates.test.ts`.
  - `docs/architecture/automation-studio.md`, which also gets `w19-c1`'s
    paragraphs, and `automation-studio-native-nodes.md`; both generated
    framework references.
  - `.structure-baseline.json`: `service.ts` file-lines 6919 to 6807;
    `AutomationStudioService` class-methods 224 to 223.
- Why: the downstream W19 fix gives a recorded click a URL claim naming the page
  it landed on. To find that page the mapper needs the entries after the click,
  and the claim must reach the node the executor checks since `6f172b9`.
- Compatibility: additive.
  - A mapper that ignores `following` still type-checks, but code that calls a
    mapper directly must pass it.
  - Stored proposals read as before.
  - With `6f172b9`, a host binding `expectationEvaluator` fails a recorded action
    whose claimed state it rejects. Nothing downstream proposes one yet.
- Decisions:
  - The barrel line outside the brief stands.
  - Approving a proposal as a node definition still drops `expectedState`; that
    is Week 2.
  - An empty `{}` expectation is still kept. The downstream
    `g-core-expectation-record` makes it count as none, and exports the shared
    `expected_state_missing` record.
- Validation: supervisor, from `packages/fluxiq`:
  - `npx vitest run .../recordings/tests/proposal-candidates.test.ts
    --no-file-parallelism` -> `Tests 4 passed (4)`;
  - `.../runtime/tests/service.test.ts` -> `Tests 108 passed (108)`;
  - executor `node-execution` and `transition-comparison` -> `Tests 19 passed (19)`;
  - `pnpm check` -> exit 0, `structure-audit: passed (120 warning(s), 256
    baselined)`, `2 baseline entries can be lowered`;
  - with both lowered, `node scripts/structure-audit.mjs` -> `passed`, nothing
    left to lower;
  - `pnpm docs:check` -> exit 0.
  - Worker: deleting the lift failed the expected-state row. Four more mutations
    (`following`, the plain-object check, the copy, per-mapper construction)
    each failed their row, and all were restored byte-identical.
- Not verified: `pnpm build`; root `pnpm test`; the other proposal-generating
  suites (`service-flow-bootstrap-*`, `apps/web`); the downstream domain compiled
  against these types.
- Outcome: Accepted

### 2026-09-13 — One expectation-rejected record, and an empty expectation counts as none

- Agent: downstream worker `g-core-expectation-record`
  (`reports/g-core-expectation-record.md` in the downstream plan); verified by the
  downstream supervisor, who also brought two architecture sentences up to date.
- Changed:
  - `nodes/policy/expectation.ts` exports `EXPECTATION_REJECTED_FAILURE`, and
    `nodes/policy/index.ts` re-exports it;
  - `runtime/executor/transition-comparison.ts` imports it, and its copy is gone;
  - an `expectedState` with no own keys is not sent to the host
    (`transition-comparison.ts`), and is dropped when a mapper candidate is lifted
    (`runtime/service/recordings/proposal-candidates.ts`);
  - their tests;
  - `docs/architecture/automation-studio.md` and
    `automation-studio-native-nodes.md`;
  - both generated framework references, one citation line
    (`transition-comparison.ts:37` to `:38`).
- Why: `c0e0ce9` kept an empty `{}` expectation, so a host would have been asked
  about the conditions `[{}]` and could fail a recorded action for no reason.
  `6f172b9` had also copied the record.
- Found: importing the policy barrel into the executor creates no cycle, since
  nothing under `nodes/` imports `runtime/`. `{ conditions: [] }` still reaches
  the host, and `expected-transition.ts:8` still records `{}` in the trace.
  Neither changes a verdict.
- Validation: supervisor, from `packages/fluxiq`:
  - `npx vitest run` on `nodes/policy/tests/expectation.test.ts`, the executor's
    `node-execution` and `transition-comparison` tests, and
    `recordings/tests/proposal-candidates.test.ts`, with `--no-file-parallelism` ->
    `Test Files 4 passed (4)`, `Tests 29 passed (29)`;
  - `runtime/tests/service.test.ts` -> `Tests 108 passed (108)`;
  - `pnpm check` -> exit 0, `structure-audit: passed (121 warning(s), 256
    baselined)`;
  - `pnpm docs:check` -> exit 0;
  - the tree also held `g-core-start-order`'s bridge edits.
  - Worker: four mutations each failed their rows and were restored identical:
    the executor's empty check, the lift keeping `{}`, counting keys before the
    clone, and a changed shared record.
- Not verified: `pnpm build`; root `pnpm test`.
- Outcome: Accepted

### 2026-09-13 — A client's recording start is ordered with what follows it, and acknowledged

- Agent: downstream worker `g-core-start-order` (`reports/g-core-start-order.md` in
  the downstream plan); verified by the downstream supervisor, who also updated
  `docs/integrations/client-gateway-websocket.md`.
- Changed: `programs/automation-studio/client-gateway/bridge.ts` and its test;
  `docs/architecture/automation-studio/client-gateway.md`;
  `docs/integrations/client-gateway-websocket.md`.
  - **Pending start.** A `client.start_recording` registers a pending start
    before its first await. Every later message from that client waits for it:
    entries, events, snapshots, state updates, errors and Stop. A second start
    waits for the first.
  - **Acknowledgement.** Once the recording is open, the bridge sends
    `server.start_recording` through `gateway.startRecording`, unless a Stop for
    that recording has already arrived.
  - **Refused starts.** A start that is refused or throws is remembered, so what
    waited is discarded and audited under its recording id.
  - **Audits.** A discard audit carries the message's own `recordingId`. Dropped
    snapshots and state updates are audited, except a state update saying its
    client is not recording.
- Why: the downstream `i-recording-loss` investigation found that the bridge
  opened a client-started recording only after `createRecording` returned, while
  the WebSocket host handles one socket's messages concurrently. Everything
  arriving in between was dropped, some of it with no audit, and Core never
  acknowledged a client start. A probe with the pinned bridge kept 8, 3 and 0 of
  8 entries at start delays of 50, 450 and 1000 ms.
- Compatibility: a behaviour change on the wire.
  - Every gateway client that starts its own recording now receives
    `server.start_recording` for it. A client that reads that message as a new
    start must ignore one for a recording it already has; the downstream
    extension's guard is `f-recording-start-guard`.
  - Messages sent during a start are held until it settles, not dropped.
  - It ships in the same minor release as `6f172b9` and `0e6d3ac`.
- Found: `bridge.ts` is 796 of 800 lines, and the class has 26 methods against an
  advisory of 25.
- Validation: supervisor read the diff. From `packages/fluxiq`:
  - `npx vitest run .../client-gateway/tests/bridge.test.ts --no-file-parallelism`
    -> `Tests 20 passed (20)`;
  - then, with this change and the expectation-record change both in the tree,
    `pnpm check` -> exit 0, `structure-audit: passed (121 warning(s), 256
    baselined)`, all four packages `check: Done`;
  - `pnpm docs:check` -> exit 0, "Deterministic framework reference is current."
  - Worker: seven mutations each failed their target tests, and all were restored
    byte-identical.
- Not verified: the WebSocket host itself, since the tests call
  `gateway.receive`; two starts in flight; a throw after opening; a Stop crossing
  the acknowledgement; `pnpm build`; root `pnpm test`; the Lab.
- Outcome: Accepted

### 2026-09-13 — A recorded entry keeps the event it came from

- Agent: downstream worker `g-core-action-entry-identity`
  (`reports/g-core-action-entry-identity.md` in the downstream plan); verified by
  the downstream supervisor.
- Changed:
  - `client-gateway/bridge.ts`, one line (still 796 lines): a recording event that
    becomes a recorded input passes its own top-level `eventId` in the envelope
    metadata, in place of any `eventId` in the client's metadata.
  - `runtime/io-bridge.ts`: an action entry and an `input.<role>` observation copy
    the envelope's `eventId` and `sourceId` onto their metadata, each only as a
    non-blank string, and nothing else.
  - Their tests, and `docs/architecture/automation-studio/client-gateway.md`.
- Why: the downstream W19 fix links a recorded click to the page it landed on by
  the click's event id. A click recorded through an IO input became an `action`
  entry with no event id, sequence or source, so no mapper could tell which click
  a landing named.
- Compatibility: additive entry metadata keys, with no contract or wire change. A
  `sourceId` in the client's own metadata takes precedence over the bridge's and
  is now stored on the entry, so it is client-declared, not verified.
- Found: a landing's own `sourceId` stays a top-level entry field that mappers
  are not shown, so a tab-based match without an event id still cannot work.
- Validation: supervisor read the diff. From `packages/fluxiq`:
  - `npx vitest run .../runtime/tests/io-bridge.test.ts
    .../client-gateway/tests/bridge.test.ts --no-file-parallelism` ->
    `Test Files 2 passed (2)`, `Tests 33 passed (33)`;
  - `bridge.ts` is still 796 lines;
  - `pnpm check` -> exit 0, `structure-audit: passed (121 warning(s), 256
    baselined)`, all four packages `check: Done`;
  - `pnpm docs:check` -> exit 0.
  - Worker: seven mutations each failed named rows; restored with identical
    SHA-256.
- Not verified: `pnpm build`; root `pnpm test`; the Lab.
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
