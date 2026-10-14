# t578 a8-subflow-trial-setup: worker report

## Outcome

Partial. Both fixes are built and tested inside the files this brief owns:

- A subflow trial starts on a loaded start page.
- The subflow trial gate undoes the build's acts the way the whole-candidate gate does.

Neither fix is active in a live `project` build yet. The arrival node, the per-brief ledger and the reader live only in
files the brief told me not to touch (`service/project-build/**`, `project-agents/**`, `builder-loop.ts`), and the
trial port goes through three wrappers there. The exact wiring still needed is listed under "Open questions". Until
it lands, A8 behaves as it did in run-mv8186yr.

## What changed and why

All paths are under `packages/fluxiq/src/programs/automation-studio/runtime/`.

**Fix 1: start page (cause A)**

- `flow-bootstrap/verification/detached-subflow.ts`
  - New optional input `arrival: { node, parameter, location }` and exported type `AutomationStudioDetachedSubflowArrival`.
  - When `arrival` is given, the throwaway root's first step after `start` is the arrival node, with
    `parameters: { [parameter]: location }` and `consequences: []`. The version comes from the registry.
  - A router-run target with no predecessors still gets a first root that holds only the arrival.
  - An arrival node the registry does not offer refuses the trial with `subflow.execution_arrival_unavailable`
    before anything runs.
  - If the arrival fails, the entry is not prepared and nothing after it runs.
  - Without `arrival`, nothing changes.
- `service/subflow-trial/types.ts`: new optional port `arrival?: { node, parameter }` (the domain's
  `runsNodes.arrival`).
- `service/subflow-trial/run.ts`: when both `ports.arrival` and `ports.startLocation` are set, the run passes
  `arrival` to the detached runner. That happens after the start hook.

**Fix 2: undo the build's acts before every trial**

- `flow-bootstrap/subflow-candidate/subflow-trial-gate.ts`
  - New constructor input `reset?: AutomationStudioSiteResetTrialReset`, the same type the whole-candidate gate takes.
  - New exported type `AutomationStudioSubflowTrialPreparingPort`: the port plus an optional
    `prepareStart({scope, revision, digest, signal})`.
  - `test()` now follows the order of `candidate/trial-gate.ts:225-237`:
    1. `prepareStart`, only when there is a reset and the port offers it.
    2. `reset.beforeTrial(signal, cannotUndo, prepared === "reset" ? {startReset: true} : undefined)`.
    3. A refusal is returned as is with `retry_allowed`. It counts as no trial and asks the port nothing.
    4. On admit, the trial runs, and the request carries `startedWith` from `automationStudioCandidateStartedWithSaid`.
    5. After the trial, `reset.trialRan(acts, trialRunId)`.
  - The evidence now carries `startedWith`, `absorbedByStartReset` and `leftOnSite`.
  - The tool takes an optional `cannotUndo`, validated as the whole gate validates it. The tool description now says
    to put the site back first.
  - Without a reset, behaviour is unchanged, apart from the new optional input and the description text.
- `service/subflow-trial/port.ts`: when the deployment has a hook, the port offers `prepareStart`.
  - The start it makes is kept by brief, revision and digest, because briefs share one port and can run at once.
  - The next trial of that brief, revision and digest uses that start, so the hook is not run twice.
  - Another build gets `"none"`.
- `service/subflow-trial/run.ts`: takes an optional `preparedStart`.
  - When nothing runs (for example, a missing predecessor), the record keeps the prepared start rather than
    `not_run`, because the site was still put back.
  - The header no longer claims the gate undoes the acts. It now says what each path does (debug finding at
    `run.ts:9-10`).
- `service/subflow-trial/start.ts` (new): one function, `automationStudioSubflowTrialStart`, which calls the start
  hook the same way as before. Both `run.ts` and `port.ts` use it. It replaces the private `startPorts` in `run.ts`.
  The barrel exports it.

**Order effect:** with the reset wired, the hook runs before the predecessor check. A trial that answers
`predecessor_missing` therefore still leaves the site put back. That is the pile-up the debug saw after briefs 2-3
and 6-8.

**Tests:**

- `verification/tests/detached-subflow.test.ts`: 4 new tests.
  - The arrival runs first and declares `[]`.
  - A failed arrival leaves the entry unprepared.
  - An unavailable node is refused.
  - A router-run target with no predecessors still arrives.
- `subflow-candidate/tests/subflow-trial-gate.test.ts`: 3 new tests.
  - The order is hook, then reset with `startReset`, then trial, then `trialRan`, with what the hook took back and
    what the trial left.
  - A refusal runs no trial. A retest with `cannotUndo` runs, and `startedWith` reaches the request.
  - A malformed `cannotUndo` is refused, and with no reset the hook never runs early.
- `service/subflow-trial/tests/port.test.ts`: 1 new test. The prepared start is per brief and used once; another
  build gets none.
- `service/subflow-trial/tests/site-reset.test.ts` (new): the definition-of-done stub. It drives the real
  `AutomationStudioSiteResetLedger`, the gate, the port and the detached runner against a stub site. In that site a
  builder's act added a line and the tab was left on `/elsewhere`.
  - With a hook: the hook runs once, the act is absorbed (`absorbedByStartReset` names act-1 and call.7), and the
    steps run in the order GO, PRESS, PRESS, all on the start page. The record shows `start: reset`. Only the trial's
    own acts (act-2, act-3) remain in place.
  - With a hook and a missing predecessor: nothing runs, but the site is reset and the ledger is clear.
  - Without a hook: the first test is refused `candidate.trial_reset_required` (act-1, with `stillThere`) and opens
    no session. After the undo, the trial runs on the start page even though the undo left the tab on `/cart`.
  - The port has no `prepareStart` when there is no hook.

## Commands run and observed results

All commands ran in the Core worktree `C:/Users/osrs_/FluxStuff/fxwork/t578/!FluxIQ`.

- `pnpm check` in `packages/fluxiq`:
  - The first run passed, before the tests were written.
  - After the tests were added it failed: 4 TS errors, all in my new test (`ran.evidence` typing).
  - After the fix it passed with no errors (`fluxiq:check ... stored in the shared store`).
- Vitest on `service/subflow-trial`, `flow-bootstrap/subflow-candidate`, `flow-bootstrap/verification`,
  `service/candidate-trial` and `flow-bootstrap/candidate/tests/trial-gate*`: **39 files passed, 1 skipped; 363 tests
  passed, 2 skipped.**
  - The skips are in an existing verification test, and the same skip appeared before my changes (16 passed,
    1 skipped).
  - The whole-candidate gate sets passed unchanged: `trial-gate.test.ts` 26, `trial-gate-reset.test.ts` 12,
    `trial-gate-slow-down.test.ts` 6.
- Vitest on `service/subflow-trial` and `service/project-build` (consumers of the port), after the final edit:
  **11 files, 43 tests passed.**
- `node scripts/structure-audit.mjs`: **passed (356 warnings, 1156 baselined).** None of the warnings are in the
  files I touched.
- No live run, and nothing that could reach a model provider.

## Not verified

- Live or Lab behaviour. In particular, I have not verified that the web domain's arrival node, run as a plan node
  inside the throwaway root, loads the page the way the builder loop's arrival does.
- That a real `project` build uses any of this. It does not until the wiring below lands.
- That the brief-ports reader's `compare` and `compareAt` behave inside a builder's trial the way the stub's look
  does.
- Full suites. They were not run, per the twice-a-day rule.

## Open questions or contradictions found

1. **Wiring needed, all in files this brief forbade:**
   - `service/project-build/subflow-trials.ts`
     - Pass `arrival: binding.runsNodes?.arrival` in the ports. Without this, fix 1 is inert.
     - Its wrapper `port` must keep `prepareStart`. Type it `AutomationStudioSubflowTrialPreparingPort` and copy
       `trials.port.prepareStart`.
   - `service/project-build/brief-ports.ts` (builder)
     - Build `reset` from `request.ledger` and `reader`, as `candidate/authoring-loop.ts:109-111` does.
     - Copy `prepareStart` onto its `trial` wrapper.
     - Stop its own `request.ledger.trialRan(...)` at line 108, because the gate's `reset.trialRan` now records
       trial acts and would record them twice. Keep `input.acts.trialRan`.
   - `project-agents/dispatch/run-brief.ts:127`: `receipts.wrap` must keep `prepareStart` and pass `reset` along.
   - `flow-bootstrap/subflow-candidate/builder-loop.ts:128,140`: accept `trial.reset` (and the preparing port type)
     and pass `reset` to the gate.
2. **Undo calls without a hook.** A builder's loop does not offer `undoes` on `core.run_node`. Only reset briefs get
   `automationStudioSiteResetUndoesTool` (`brief-ports.ts:122`). Without a hook, a builder asked to undo cannot name
   the act, so its undo cannot be credited. Builders need that tool mapping too. With the Lab's hook this never
   comes up, because `startReset` admits every trial.
3. **Per-brief ledgers against "the build's acts".** The user rule is to undo the build's own acts. The gate's reset
   is the brief's ledger, which holds only that brief's acts. `project-ledger.ts:10-13` says another brief's act is
   not on this brief's site. At capacity 1 that is not true: briefs share the site one after another, and brief-4's
   store switch was still there for brief-5. A hook resets everything, but without one a brief's trial would not
   ask for an earlier brief's leftover acts. The supervisor should decide whether a builder's reset should read the
   project ledger at capacity 1.
4. The arrival shows up as a step in trial feedback, so later step numbers shift by one or two (the stub's trial acts
   read "trial step 5"). It is true to what ran, but builders will see a step they did not write.
