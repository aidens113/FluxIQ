# t534 A2: allowances, per-run refusal, cancellation tree, retry jitter

Worker report for brief `t534-a2-allowances` (unit A2) of
`docs/working/automation-project-agents-plan.md`. Worktree
`fxwork/t534/!FluxIQ`, branch `task/t534-project-agents-allowances`. Nothing
committed.

Paths below are relative to `packages/fluxiq/src/programs/automation-studio/runtime/`.

## Outcome

Done. All four parts are built and tested, and the four narrow checks pass. No
file outside the brief's ownership was edited.

## What changed and why

### (1) Allowances: a chain of purses (`llm/build-purse/`)

- `purse.ts`: an allowance is now an `AutomationStudioLlmBuildPurse` with a
  `parent` and an `attribution` (`{ role, briefId }`). That keeps every existing
  reader of the current build purse working unchanged, including the loop's
  `cost-purse.ts`, the judge and the harness hold. New members:
  - `allowance({ briefId, role, usd, maxCalls? })` returns
    `{ ok: true, allowance }`, or `{ ok: false, refusal }` where the refusal is
    `llm_budget.allowance_unavailable` with `requestedUsd`, `allocatableUsd`,
    `keptBackUsd` and `outstandingUsd`. It throws on programming errors: an
    empty brief or role, a non-finite amount, a brief that already has an open
    allowance, or carving from a closed allowance.
  - `allocatableUsd()` is the ceiling minus what is spent, what is in flight,
    `keptBackUsd()` (the judging reserve) and what open allowances still hold.
    This is why the reserve can never be allocated.
  - `close()` works only on an allowance. After it, no new call is held (the
    refusal is `run_cost_limit` with `closed: true`), calls already in flight
    still settle, and whatever was left goes back to the parent.
  - `isClosed()`.
  - `attributedSpend()` lists every allowance carved, open or closed, with
    nested allowances flattened in carve order:
    `{ role, briefId, allottedUsd, spentUsd, calls, closed }`.
  - `hold(call)` now delegates to a private `holdFor(call, via)`. The purse first
    checks its own limits. These include the call limit, the judging reserve and,
    new here, the unspent amount of every open allowance except `via`. After its
    own checks pass, it holds the call against its parent, which repeats the same
    steps up the chain. If the parent refuses, the call is refused at this level
    too: `this.refusal` is set to the parent's refusal and nothing stays in
    flight. When the call settles, each purse in the chain is charged what was
    reported, so `onSettled` on the build's own purse still fires for spend that
    came through an allowance.
  - The refusal types gain three optional fields: `allowance` (the attribution,
    on both codes), plus `allottedUsd` and `closed` on the cost refusal. Plain
    purses never set them, so every existing refusal is byte-identical (the
    existing `toEqual` tests pass unchanged).
  - `judgingFits()` now also subtracts outstanding allowances. That amount is 0
    when no allowance exists.
- `allowance-book.ts` (new): the class that tracks open and carved allowances,
  their outstanding amounts and their attributed spend, plus the
  request/refusal/attribution types. It imports only types from `purse.ts`, so
  there is no value cycle.
- `harness-hold.ts`: holds the Flow purse only when it is not already in the
  build purse's chain (`carvedFrom`). When the Flow purse is the parent, the
  call is held on it once, not twice. A refusal raised by an allowance's own
  limit is worded "The allowance for brief X's spending limit ..." and its
  metadata includes `allowance`. Build and Flow wording and metadata are
  unchanged.
- `index.ts` exports `allowance-book.ts`.

**Allowance role type.** It is `role: string`, not A1's
`supervisor | builder | repair`. `llm/` must not depend on `project-agents/`,
and A1 is being built in parallel. A5 can narrow it at the call site.

### (2) Per-run refusal (`llm/build-purse/run-frame.ts` new, `run.ts`, `purse.ts`)

- Each `automationStudioLlmBuildPurseScope` and `automationStudioLlmBuildPurseRun`
  opens a frame `{ purse, refusal, parent }` that travels with the async work
  (one AsyncLocalStorage, replacing the old purse store).
- `purse.refusal` is now a getter and setter:
  - The getter returns the refusal of the innermost frame of this purse on the
    current async chain. Outside any frame, it returns the purse's own last
    refusal.
  - The setter writes every frame of this purse on the current chain, plus the
    last refusal.
- A run's frame starts cleared and clears the enclosing frames of the same
  purse, as `run.ts:45` always did. A scope's frame inherits what was already
  there.
- Along a single async chain this is exactly the old single field, so behaviour
  for one run is unchanged. Two runs that diverge share only the frames above
  the point where they split, and each run reads its own frame.
  `automationStudioLlmBuildPurseRun` reads its refusal inside its own frame.
- External code that reads or writes `purse.refusal` was left untouched and
  benefits automatically. That is `evidence-loop/cost-purse.ts:59`,
  `result-verification/build-test/judge.ts:213,237` (the before/after compare
  now sees only its own chain) and
  `service/flow-bootstrap-commands/creation-purse.ts:88,117` (sets it inside the
  run).
- `automationStudioLlmCurrentBuildPurse()` returns the innermost frame's purse,
  which is the same as before.

### (3) Cancellation tree (`service/flow-bootstrap-commands/cancellation.ts`)

- The scope store now holds `{ controller, key }`. `run()` delegates to a
  private `enter(key, work, parent?)` and behaves exactly as before.
- New `child(work, stop?)`:
  - It runs `work` in a child of the current scope, registered under the same
    Flow key.
  - It is aborted by the parent's abort, by a Flow `cancel`, or by its own
    `stop` signal. A `stop` aborts that child alone.
  - However the child ends (finishes, fails, or is stopped), the parent and its
    siblings keep running.
  - It throws if called outside a running build.
- The two existing packed lines (baseline 2) are untouched and no new ones were
  added.

### (4) Jitter (`llm/provider-retry/`)

- `limits.ts`: new `jitterRatio: 0.5`. The old note "No jitter: Core runs one
  loop against one endpoint" is replaced by the rule and its stated bounds: a
  1 s backoff becomes 1 to 1.5 s, a 3 s backoff becomes 3 to 4.5 s, and no wait
  goes past `maxWaitMs`.
- `decision.ts`: optional `jitter` input, a draw clamped to [0, 1].
  `backoff = round(table * (1 + ratio * draw))`. A provider hint still wins
  when it is longer, and the call-deadline and run-allowance projections use the
  spread wait actually taken, so the bounds stay verifiable.
- `endpoint-load.ts` (new): a per-endpoint in-flight counter keyed by
  `[metadata.provider, metadata.endpoint ?? ""]`, plus Core's process-wide
  instance.
- `call.ts`: each call counts itself in flight from its first attempt to its
  last, waits included. A draw is passed only when another call shares the
  endpoint at that decision. The call takes two optional inputs, `endpoints`
  and `random`, so tests can inject them. A single loop therefore waits the
  table exactly, as before. Nothing in `llm/harness/run.ts` needed to change.
- `index.ts` exports `endpoint-load.ts`.

### Tests added

- `llm/build-purse/tests/allowance.test.ts` (13 tests):
  - the chain holds and charges at both levels
  - a refusal at the allowance's own level leaves the parent untouched
  - a refusal at the parent's level carries the parent's figures and leaves
    nothing in flight
  - the carve excludes the judging reserve and outstanding allowances; the
    reserve is never allocatable
  - an open allowance's unspent amount is kept from the supervisor's direct
    calls (`allottedUsd`) and returned on close
  - a closed allowance refuses new calls but in-flight calls still settle
  - one open allowance per brief; validation errors
  - the allowance's own call limit applies
  - nested attribution
  - two allowances spending concurrently through interleaved runs never take
    the parent past its ceiling (checked after every step), and only the one
    that ran out ends
  - the Flow purse is held once when it is the parent
  - allowance refusal wording and metadata through the harness hold
  - a Flow purse refusal ends the allowance's run on cost
- `llm/build-purse/tests/run-refusal.test.ts` (5 tests):
  - two concurrent runs keep separate refusals. This includes the case the old
    single field got wrong: a refused run whose sibling starts and finishes
    cleanly while the refused run is still going.
  - when one run is alone: the reset at start, a scope seeing a nested run's
    refusal, the externally set refusal pattern `creation-purse.ts` uses, and a
    nested run's refusal ending the outer run
- `llm/provider-retry/tests/jitter.test.ts` (8 tests):
  - the draw bounds, including nonsense draws, provider hints and `maxWaitMs`
  - the run-allowance projection uses the spread wait
  - an exact wait when the call is alone
  - a spread wait when the endpoint is shared, and an exact wait when another
    endpoint is busy
  - two concurrent rate-limited calls draw different waits, both within bounds
  - each call leaves the endpoint exactly once however it ends
- `service/flow-bootstrap-commands/tests/cancellation.test.ts`: 5 tests
  appended:
  - only inside a build
  - each child has its own signal, and the parent's signal is restored after
  - a parent abort reaches children and grandchildren
  - a stopped, failed or finished child never aborts the parent or a sibling
  - a Flow cancel aborts the whole tree but not another Flow's

The existing tests in `purse.test.ts`, `harness-hold.test.ts`,
`call-admission.test.ts`, `call.test.ts`, `policy.test.ts`, the original 4 in
`cancellation.test.ts`, and `service-cancellation.test.ts` were not edited and
pass.

## Commands run and observed results

All runs used `C:/Users/osrs_/FluxStuff/fxwork/t534/!FluxIQ`.

1. **Baseline before any edit** (from `packages/fluxiq`):
   `pnpm.cmd exec vitest run <build-purse tests> <provider-retry tests> <cancellation.test.ts> <service-cancellation.test.ts>`
   gave `Test Files 7 passed (7)`, `Tests 49 passed (49)`.
2. **Unit tests after the change**, same command plus the new files:
   `Test Files 10 passed (10)`, `Tests 80 passed (80)`.
   - An earlier run printed one "Unhandled Rejection". It came from my own
     concurrent-allowance test, whose rejection was attached late. I fixed it by
     catching where the rejection is created, and the rerun is clean.
3. **Regression sweep of consumers** of the purse, refusal and provider-call
   seam (narrow; every test file that names `AutomationStudioLlmBuildPurse`,
   `automationStudioLlmBuildPurseRun`, `automationStudioLlmFlowPurseScope` or
   `automationStudioLlmProviderCall`, plus `creation-purse.test.ts`): 19 files,
   `Test Files 19 passed (19)`, `Tests 186 passed (186)`. They cover:
   - `unfinished-build/tests/*`
   - `evidence-loop/tests/cost-purse.test.ts`
   - `harness/tests/run.test.ts`, `run-size.test.ts`, `paid-refusal.test.ts`
   - `result-verification/build-test/tests/judge.test.ts`
   - `result-verification/tests/verify.test.ts`, `flow-purse-check.test.ts`
4. **Typecheck**: `pnpm.cmd --filter fluxiq check` first failed with
   `jitter.test.ts(111,68): error TS2345: Argument of type '"llm.provider_rejected"' is not assignable`
   (a code that does not exist in the union). I switched it to
   `llm.provider_http_error`, and the rerun gave `check exit: 0`.
5. **Structure audit**: `node scripts/structure-audit.mjs` from the Core root
   gave `structure-audit: passed (346 warning(s), 1156 baselined).` The only new
   finding in my paths is an advisory warning, not a failure:
   `llm/build-purse/purse.ts: 476 lines is past the 400-line advisory threshold`.
   It was 366 lines before.
6. **Whitespace**: `git diff --check` printed nothing (`diffcheck-clean`).
   - New files were written with CRLF to match their directories.
   - `purse.ts` briefly had mixed line endings after my splice and was
     normalized to CRLF.

## Not verified

- **No live or provider-backed run.** Every result above comes from unit tests
  with scripted providers and clocks.
- **Allowances are not wired into the build.** Nothing in `service.ts` carves an
  allowance or calls `child()` yet. That is A5's job.
- **Real concurrency was tested only in-process.** The concurrency tests
  interleave async work in one process. That is the only concurrency Core has,
  but no real concurrent builders were exercised.
- **Jitter detection is limited.** The shared-endpoint check sees only calls
  routed through `automationStudioLlmProviderCall`, which is every harness
  call. A provider that names neither `provider` nor `endpoint` metadata
  distinctly shares a key with others of its kind.
- **No full suites were run**, per the brief and AGENTS.md.

## Open questions or contradictions found

1. **Allowances do not reserve calls, only dollars.** A purse's `maxCalls` is
   not divided between allowances. An allowance may take its own `maxCalls`,
   and every call also counts against the parent's limit, but an open
   allowance's unused calls are not kept from siblings. If A5 needs per-brief
   call guarantees, the book can reserve them the same way it reserves dollars.
2. **Refusals in a shared ancestor scope.** When the parent build purse refuses
   a builder's call, its setter also writes any frame of the parent on the
   builder's chain. That includes the supervisor's enclosing scope frame, if
   the supervisor wraps dispatch in `automationStudioLlmBuildPurseScope(build)`.
   A supervisor that judges *while* builders run would see that refusal in
   `judge.ts`'s before/after compare. A5 should give the supervisor's own
   decisions and judge their own run or scope, which the frames already
   isolate.
3. **`judge.ts` before/after compare.** It is correct per chain now, but it is
   still a compare on shared state. A per-call refusal returned from the hold
   would be cleaner. That is outside A2's ownership (`result-verification/`).
4. **Reserve for one repair round.** The plan's supervisor reserve is "judged
   whole run plus one repair round". `allocatableUsd` only excludes the judging
   reserve (`keepBackForJudging`). A5 can size the repair round by carving it
   as its own allowance up front (for example `role: "repair"`) or by enlarging
   the judging reserve. No separate reserve field was added.
5. **Line-count warning on `purse.ts`.** It is now at 476 lines, past the
   advisory threshold. If it grows further in A5, the hold-chain logic
   (`holdFor`/`holdOwn`) could move into its own module.
