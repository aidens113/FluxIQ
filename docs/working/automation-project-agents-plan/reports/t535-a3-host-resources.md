# t535 A3 — host-resource scheduler (worker report)

## Outcome

Done. The domain-neutral host-resource port, scheduler, stale-lease and
port-contract errors, and a stub host with configurable capacity exist under
`packages/fluxiq/src/programs/automation-studio/runtime/project-agents/host-resources/`,
with 20 tests. Nothing is wired; nothing outside the owned directory changed.
Not committed.

## What changed and why

All paths relative to `packages/fluxiq/src/programs/automation-studio/runtime/project-agents/host-resources/`.

- `types.ts`: `AutomationStudioHostResourceHolder` (`{ role, briefId }`),
  `...Grant` (`{ resourceKey, epoch }`), `...Lease` (grant plus holder),
  `...AcquireResult` (grant or `"at_capacity"`), `...Port` (`capacity`,
  `acquire(holder)`, `release(lease)`; either sync or async), `...Snapshot`.
  The port's doc comment states the obligation: a domain declaring capacity
  above 1 guarantees its resources share no lasting state (separate contexts,
  never tabs of one profile); Core cannot check it. It also states that a
  port's epochs must rise strictly per `resourceKey`, and that `at_capacity`
  may come back below the declared capacity.
- `scheduler.ts`: `AutomationStudioHostResourceScheduler`.
  - `acquire(holder, { signal })` -> `Promise<lease>`; `run(holder, work, { signal })`
    acquires, runs, and releases in `finally` (release on holder end, however it ends);
    `release(lease)` -> `Promise<boolean>` (false and no port call for a stale or
    already-released lease); `isCurrent` / `assertCurrent` (throws the stale error);
    `retryWaiting()`; `snapshot()`.
  - Never more than `capacity` leases, counting resources whose port release is
    still in flight, so a new arrival cannot be handed a resource the port has
    not yet freed.
  - One port acquisition in flight at a time, so the head of the FIFO queue is
    always asked first. On `at_capacity` the head stays at the head and the
    queue stops asking until a release or `retryWaiting()` (the domain's hook for
    a resource freed outside Core; without it, `at_capacity` with zero leases
    held by Core would wait forever).
  - Abort: a queued waiter is removed and rejects with `signal.reason`; an
    already-aborted signal rejects without queuing; a waiter that aborts while
    its acquisition is in flight is settled when the port answers, and a late
    grant goes straight back to the port (rejection is the abort reason, or the
    port's release failure if that fails, so nothing is swallowed).
  - Staleness: `isCurrent` compares resourceKey, epoch and holder with the
    lease the scheduler holds; a released or reissued lease is stale.
  - Fail-closed checks: capacity must be a whole number >= 1; a grant without a
    resource key and whole-number epoch, a grant that overlaps a live lease, or a
    reissue whose epoch does not rise rejects the waiter with the contract error
    (the grant is not used; a port that breaks its contract may leak that grant).
  - One lease or wait per holder: a second `acquire` for the same `{role, briefId}`
    while it holds or waits is refused, because with capacity 1 it would wait on
    itself forever. Empty role or briefId is refused with a `TypeError`.
- `stale-lease-error.ts`, `port-contract-error.ts`: one error class each.
- `index.ts`: barrel. `project-agents/index.ts` was not created (t533 owns it).
- `tests/stub-host.ts`: `StubHost` with `capacity`, mutable `heldOutside` (answers
  `at_capacity` below capacity), `asked` count, `acquired` / `released` logs,
  `inUse()`. Test-only, so it lives in `tests/`; if later units' tests elsewhere
  need it, it belongs in the `tests/` of the nearest common directory.
- `tests/scheduler.test.ts`: the brief's seven cases (capacity 2 grants two and
  queues a third; capacity 1 serializes; FIFO hand-off; aborted waiter never
  acquires; `at_capacity` below capacity waits; stale epoch after release and
  reissue; double release harmless) plus: never asks a permissive port beyond
  capacity; capacity 2 runs exactly two at once; a releasing resource counts
  against capacity; already-aborted signal; late grant after abort is given back;
  `retryWaiting`; duplicate holder; empty holder; release on work failure; bad
  capacity; overlapping grant; non-rising epoch; port acquire throwing.

## Commands run and observed results

From `fxwork/t535/!FluxIQ/packages/fluxiq`:

- `pnpm.cmd exec vitest run src/programs/automation-studio/runtime/project-agents/host-resources`
  -> `Test Files 1 passed (1)`, `Tests 20 passed (20)`.
- Mutation checks (scheduler edited by `sed`, test run, file restored from a
  scratchpad copy; final `diff` printed `restored`). Each was caught:
  capacity +1 -> "never asks a port that would grant more than its declared
  capacity" failed; abort removal disabled -> "removes an aborted waiter" failed;
  `blocked` never set -> "waits when the port answers at_capacity" failed; epoch
  ignored in `isCurrent` -> "is stale after release" failed; LIFO queue -> three
  tests failed; releasing not counted -> "counts a resource still being released"
  failed; late grant kept -> "gives back a grant" failed. (The first two of these
  initially passed; the tests were strengthened until they failed.)
- `pnpm.cmd --filter fluxiq check` (from the Core root) -> tsc ran, exit 0.
- `node scripts/structure-audit.mjs` -> `structure-audit: passed (345 warning(s), 1156 baselined).`
  exit 0; no warning names `project-agents` (checked with grep, exit 1). Run both
  with the new files untracked and with them intent-to-add.
- `git diff --check` (with the new files intent-to-add) -> exit 0, no output
  besides LF->CRLF notices. The intent-to-add was then undone with
  `git restore --staged`; `git status --short` shows only
  `?? packages/fluxiq/src/programs/automation-studio/runtime/project-agents/`.

## Not verified

- No consumer exists: nothing issues host commands with a lease or refuses a
  command without one downstream (later units, W1 for the web domain).
- The stub host is in-process; a real domain port with asynchronous browser
  contexts has not been exercised.
- Full suites not run (per the brief).

## Open questions or contradictions found

- The contract writes `acquire(holder) -> { resourceKey, epoch } | at_capacity`;
  this unit lets the port be sync or async (`T | Promise<T>`), since a browser
  context is opened asynchronously.
- The brief does not say what happens when the port answers `at_capacity` while
  Core holds nothing; `retryWaiting()` was added as the domain's hook. The
  supervisor may prefer a port-side availability callback instead.
- The one-lease-per-holder refusal is this unit's own choice (deadlock guard),
  not in the plan; drop it if a holder must ever hold two resources.
- `project-agents/` has no barrel until t533 lands its `index.ts`; whoever
  integrates must add `export * from "./host-resources/index.ts"` there.
