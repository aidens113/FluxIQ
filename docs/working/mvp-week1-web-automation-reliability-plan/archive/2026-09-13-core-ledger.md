# Core ledger archive — MVP Week 1 web automation reliability

Settled Work Ledger entries moved verbatim from
[the plan](../../mvp-week1-web-automation-reliability-plan.md) to keep it under
its line limit. Part one, archived 2026-09-13: the five 2026-09-12 entries.

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

