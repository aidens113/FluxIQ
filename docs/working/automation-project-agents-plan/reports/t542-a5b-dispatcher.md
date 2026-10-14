# t542 A5b dispatcher: report

Worker: t542-a5b-dispatcher. Worktree `fxwork/t542/!FluxIQ`, branch `task/t542-project-dispatcher`. Nothing committed.

## Outcome

Partial. The dispatcher implements `AutomationStudioProjectDispatchPort` and meets every definition-of-done item except one. A reset brief runs and completes once its ledger is clean, but the build record then refuses its `done` return. `contracts/builder-return.ts:39` refuses `done` without a proposal for every brief kind except `survey`. Contracts are on this brief's must-not-touch list, so the test for this case is written and `it.skip`ped, with a comment that names the rule. Unskipped, it fails with exactly `project.return_done_without_proposal at return.proposal`, and the reset loop itself had worked (completion refused while an act was in place, then `done`).

## What changed and why

All new files are in `runtime/project-agents/dispatch/`. `port.ts` is unchanged.

- `types.ts`: what the dispatcher reaches outside itself (`AutomationStudioProjectDispatcherInput`):
  - the record store and its ref, the build purse, the host-resource port and the project ledger;
  - a structural `AutomationStudioProjectDispatchCancellation` (`child` and `signal`), which `AutomationStudioBuildCancellation` satisfies, so nothing here imports `service/`;
  - a per-brief port factory, `ports.builder(request)` and `ports.reset(request)`. The request is the brief, its scope, `ledger.forBrief(briefId)`, the lease and the child signal. The factory supplies the loop's harness wiring, the submission surroundings and the subflow trial port;
  - optional `maxCalls(brief)`;
  - `runBuilder`, replaced only by tests.
- `host-lease.ts`: a module-level `WeakMap` from host port to one strict `AutomationStudioHostLeaseScope` over one scheduler, never one per build.
- `dependencies.ts`: a brief waits on the other briefs of the same dispatch whose `subflowKey` its `entry.predecessors` names, never on a brief of its own subflow. Tarjan finds briefs that wait on each other in a ring.
- `scope.ts`: maps a brief onto `AutomationStudioSubflowScope` under the record's latest plan:
  - parts become the task spec's verbatim quotes;
  - the interface comes from the brief, and the success check from the plan's subflow metadata;
  - siblings are the plan's other keys, and the subflow name goes to attribution.
  - It refuses a stale plan digest.
- `run-brief.ts`: one brief, in this order:
  1. `cancellation.child(work, stop)`;
  2. a lease, with holder `{role, briefId}`, waiting on the child signal;
  3. `purse.allowance({role, briefId, usd: allowanceUsd, maxCalls})`, written with `recordAllowance` as soon as it is carved;
  4. `withAutomationStudioProjectAgent({role, briefId, subflowName})`;
  5. `automationStudioLlmBuildPurseScope(allowance)`, so the partial trial's judge calls are held against the brief's allowance too;
  6. the builder loop, with `loop.purse = allowance`, `maxIterations = brief.maxIterations`, the child signal on the loop and the submission, and `callScope = briefId` only when capacity is above 1.
  - The trial port is wrapped to collect receipt references.
  - The allowance closes in `finally`.
  - Role is `repair` for a repair brief and `builder` otherwise.
  - A failed record write is carried past the brief's catch and rethrown. Every other throw becomes a return.
- `reset-loop.ts`: a reset brief runs `runAutomationStudioLlmEvidenceLoop` with `draft:false, dryRun:false`, the allowance as its purse and no proposal. `checkCompletion` refuses with `project.reset_acts_in_place` and the acts still to undo until `remainingActs()` is empty. The default for `remainingActs` is the project ledger snapshot's acts still `inPlace`.
- `receipts.ts`: one `subflow_trial` reference per trial. `receiptId` is the trial run id, or `<briefId>.trial-N` when there is none. `digest` is a project digest of the receipt id, identity, revision, digest, verdict and `entryPrepared`. The latest 100 are kept, which is the contract's limit.
- `ending.ts`: every ending mapped to a return:
  - `done` only when the latest proposal's trial answered yes, or when a reset leaves nothing to undo;
  - `partial` when a proposal stands but is untried, not yes, or the builder was stopped or threw after one was accepted;
  - otherwise `blocked`.
  - Each return has a plain-words reason, with allowance refusals named by code. Spend and calls are read from the allowance, and are 0 when it was never carved.
- `dispatcher.ts`, `createAutomationStudioProjectDispatcher(input)`:
  - It refuses before anything runs when called outside the supervisor's build scope, when the record is missing, or when a brief is unknown, duplicated in the request, or under a stale plan.
  - Each brief waits for its predecessors (or for `stop`, which is the request signal or the supervisor scope's signal). It then ends `blocked` without starting if a predecessor ended `blocked` or it is in a ring. Otherwise it runs.
  - Every return is written with `recordReturn`, one file per brief.
  - It waits for every brief to settle (`allSettled`), then throws the first record failure if there was one. Otherwise it returns the briefs' returns in the order given.
- `index.ts`: the barrel now also exports types, dispatcher, dependencies and host-lease.
- `tests/dispatch-fixture.ts`, `tests/dispatcher.test.ts` (13 tests), `tests/dependencies.test.ts` (3), `tests/brief-loops.test.ts` (2 running and 1 skipped):
  - The fixture uses an in-memory record with a three-part task on a garden-seed catalogue, which matches no Lab scenario. It also uses the stub host from `host-resources/tests/stub-host.ts`, imported rather than moved, because moving it would edit `host-resources/`.
  - `brief-loops` runs the real `runAutomationStudioSubflowBuilderLoop` with `subflow-fixture.ts`'s stub domain. That run reaches `done` with its proposal, a trial receipt and the record entry.

Definition-of-done coverage:

| Requirement | Test |
| --- | --- |
| Capacity 2 runs two briefs at once and the dependent third waits | starts in order read, then open; plant starts only after read ends; at most 2 at once |
| Capacity 1 runs three in order | the event sequence is checked exactly |
| Allowance refusal or throwing builder gives `blocked` and the rest continue | both covered |
| A builder ending never aborts a sibling | the sibling's signal is not aborted |
| A Flow cancel aborts the runner, the lease waiter and the dependency waiter | all three come back `blocked` as stopped, and the host ends with no resource in use |
| `callScope` only above capacity 1 | covered |
| A reset brief completes on a clean ledger | skipped; blocked by the contract (see Outcome) |
| Returns and allowances land in the record | covered |

Further tests:
- repair runs under the repair role;
- a stopped builder that had a proposal comes back `partial`;
- a ring of waits ends at once;
- a predecessor that ended `blocked` stops its dependent;
- the refusals before anything runs.

## Commands run and observed results

- `pnpm.cmd --filter fluxiq check`, from the worktree root: `CHECK-EXIT 0`.
  - The first run exited 2 with two TS2322 errors in `dispatch-fixture.ts`, because the interface's `required: boolean` did not fit `true`. The constant is now typed, and the rerun exits 0 with no `error TS` lines.
- `pnpm.cmd exec vitest run src/programs/automation-studio/runtime/project-agents/dispatch`, from `packages/fluxiq`: `Test Files 3 passed (3)`, `Tests 18 passed | 1 skipped (19)`.
- The same command over `src/programs/automation-studio/runtime/project-agents`: `Test Files 13 passed (13)`, `Tests 115 passed | 1 skipped (116)`. This was run once, before the final fixture type fix; the fix touched only the fixture's types.
- `node scripts/structure-audit.mjs`: `structure-audit: passed (348 warning(s), 1156 baselined)`, with no finding under `project-agents/dispatch`.
  - An earlier advisory warning (11 exported values in the fixture) was fixed by un-exporting four helpers.
- `git diff --check`: exit 0. The new, untracked files were checked with `git diff --no-index --check /dev/null <file>`, which printed only LF/CRLF notices and no whitespace errors.
- Unskipping the reset test reproduced the contract refusal: `AutomationStudioProjectRecordRefusal: project.return_done_without_proposal at return.proposal`, thrown from `store.ts:163` through `recordReturn`.
- One fix during the work: `reset-loop.ts` first imported `runAutomationStudioLlmEvidenceLoop` from `llm/index.ts`, and under vitest it arrived undefined (`is not a function`, a module cycle). It now imports from `llm/evidence-loop.ts`, as `builder-loop.ts` does, and the audit passes.

## Not verified

- Live or browser behaviour. Nothing is wired into `service.ts` yet; that is A5c.
- A real reset with site-reset tools. The default `remainingActs` reads the project ledger's `inPlace`, but an act is only marked undone inside `AutomationStudioSiteResetLedger.beforeTrial` (comparison or start reset). So A5c's reset ports must run that check, or supply `remainingActs`, or a clean site will still read as acts in place.
- Survey briefs. They return `blocked` ("not run by the dispatcher yet") without a lease or allowance, because the brief did not specify how a survey runs or completes.
- Real allowance exhaustion inside a running real loop, and a real trial judge's calls under the allowance's call cap. The cap defaults to `maxIterations`, and judge calls count against it.

## Open questions or contradictions found

1. **Contract contradiction (blocking the reset definition-of-done item).** `contracts/builder-return.ts:39` should exempt `reset` from `project.return_done_without_proposal`, i.e. `brief.kind !== "survey" && brief.kind !== "reset"`. The same rule should probably refuse a `proposal` on a reset, as line 37 does for a survey. After that, unskip `tests/brief-loops.test.ts` "completes a reset only once nothing of the build is left to undo".
2. **Allowance `maxCalls`.** The brief says "usd and maxCalls from the brief", but a brief has no `maxCalls`. The default is `brief.maxIterations`, and `input.maxCalls(brief)` can override it. Because the brief runs inside its allowance's purse scope, the partial trial's judge calls count toward that cap too, so a builder with `maxIterations` N gets fewer than N decisions once it tests. A5c or A5a should size this, or add a separate field.
3. **Stub host location.** The brief allowed moving the shared stub host to `project-agents/tests/`, but `host-resources/` is must-not-touch, so it is imported in place.
4. **Dependent of a `blocked` predecessor.** This is a design choice not stated in the brief: the dependent is not started and ends `blocked`, since its entry cannot be prepared. A `partial` predecessor does let it run.
5. **When the allowance is carved.** It is carved after the lease is granted, not when the brief is queued. A waiting brief holds no money, but a sibling running in the meantime can leave too little for it, and the waiting brief's allowance refusal then comes back as `blocked`.
