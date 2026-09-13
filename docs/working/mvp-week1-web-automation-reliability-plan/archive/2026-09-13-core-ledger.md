# Core ledger archive — MVP Week 1 web automation reliability

Settled Work Ledger entries moved verbatim from
[the plan](../../mvp-week1-web-automation-reliability-plan.md) to keep it under
its line limit. Part one, archived 2026-09-13: the five 2026-09-12 entries. Part
two, archived 2026-09-13: the seven 2026-09-11 entries.

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

## Part two, archived 2026-09-13

The seven 2026-09-11 entries, archived when the timeout margin and start-node commits were recorded.

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
