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

---

# Follow-up (same worktree, after e27c95f3 and the merge of t579-t582): the wiring

## Outcome

Done. Both fixes now run in a real `project` build. A stub end-to-end test through the actual service shows both:

- Builder 1's trial undoes its own act and starts on the start page.
- Builder 2's trial undoes both builders' acts.

## What changed and why

All paths are under `packages/fluxiq/src/programs/automation-studio/runtime/`.

**`service/project-build/subflow-trials.ts`**

- Passes `arrival: binding.runsNodes?.arrival` to the subflow trial ports.
- Its wrapper port is typed `AutomationStudioSubflowTrialPreparingPort` and copies the inner port's `prepareStart`.

**`service/project-build/trial-reset.ts` (new): the decision on open point 3.** It builds one reset over the project
ledger.

- Before a trial it asks the trialling brief's own ledger and every other ledger that recorded an act (the
  supervisor's whole-trial ledger included) the same `beforeTrial` question.
- It shares one start comparison per ask, then answers as one:
  - after a start hook, every ledger absorbs its acts;
  - otherwise any refusal refuses the trial, with all the acts to undo merged and the first
    `candidate.trial_reset_required` leading;
  - if all ledgers admit, their `startedWith` values are merged.
- `trialRan` records the trial's acts in the brief's own ledger and starts a new phase in each other ledger. It
  returns every act still on the site, from all ledgers.
- Each act stays in its owner's ledger, which keeps judging its undo. Nothing that existed before the build is ever
  asked for.

**`service/project-build/brief-ports.ts`**

- **The builder's calls go through `automationStudioProjectBuildResetCalls(project.ledger, request.ledger)`,** as a
  reset brief's do. An undo that names another brief's act goes to that act's ledger; the builder's own acts still
  go to its own ledger.
- **Builders now get `undoes` on their run-node calls** (`automationStudioSiteResetUndoesTool`), as the
  whole-candidate loop gets it when it has a reset (point 3).
- **The builder ports return `reset`**, built from the trial reset above with `input.acts.trialRan` called after the
  ledger records. A trial's acts are therefore recorded once, by the gate's reset, and then written to the build
  record. The duplicate `request.ledger.trialRan` in the trial wrapper is gone.
- **The trial port is now the build's port itself,** so `prepareStart` comes with it.
- **Entry acts are still recorded directly** into the brief's ledger and the build record, because no gate is
  involved there.
- **A builder compares the whole start only when its captured start is the build's start.** A builder's reader keeps
  the start it saw at its opening. That is the build's start only when nothing of the build was on the site then
  (`startIsBuilds`, set after entry preparation). Otherwise `compare` answers `{moved: false}` with no `differs`,
  and the ledger judges each act on its own page.
  - Without this, builder 2's start would contain builder 1's leftover act. After undoing that act, the reset would
    report the start as different and tell the model to put the act back.
- **Proposals (point 4).** t580 did duplicate the registry: brief-ports made its own
  `new AutomationStudioProjectBuildProposals()` and recorded verdicts into it again. Brief-ports now takes the build's
  one registry, passed in from `run.ts` (one-line change), which `subflow-trials.ts` already records into.

**`service/project-build/entry-preparation.ts` (point 4):** new optional `arrival` input. With the environment's
start location, the entry run loads the start page first. Brief-ports passes the binding's arrival.

**Pass-through to the gate**

- `project-agents/dispatch/run-brief.ts`: `receipts.wrap` keeps `prepareStart` (`kept` helper) and passes
  `trial: { port, reset }`.
- `project-agents/dispatch/types.ts`: `AutomationStudioProjectBuilderPorts.trial` is now the preparing port type, and
  it gains `reset?`. **This file is outside the listed paths,** but it is the type both ends of that pass-through
  need.
- `flow-bootstrap/subflow-candidate/builder-loop.ts`: `trial?: { port: PreparingPort; reset? }`, and `reset` is
  passed to the gate.

**`project-agents/supervisor/guidance.ts:47` (point 5).** The false claim that Core "permits exactly the lasting acts
its parts ask for" now reads:

> A lasting act its parts do not ask for that moves money, deletes or sends goes to the person first; any other
> lasting act runs, is recorded as this build's, and the builder is told it was outside its brief.

**Defect found by the e2e test and fixed in `flow-bootstrap/verification/detached-subflow.ts`.**

- A domain node that declares an output action needs `outputActionId` in the plan. The web domain's navigation
  declares a fixed one (`domain/src/output-nodes/definitions.ts:249`).
- My first-pass arrival step left the id out. Every trial would therefore have been refused before running, with
  `candidate.execution_plan_invalid` / `bootstrap.missing_output_action`, which would have failed live A8 at once.
- The arrival now derives the id with authoring's own `derivedOutputActionId`.
- To import it through a barrel, as the imports rule requires, I published that one function from
  `flow-bootstrap/authoring/index.ts`, with a comment. **This file is also outside the listed paths.** I chose this
  over copying the rule.

**Tests**

- `service/project-build/tests/project-build-trial-reset.test.ts` (new) runs through the actual service: a stub shop
  with no start hook, an arrival node with a fixed output action, and two builders, where "second" runs after
  "first". It asserts:
  - first's `test.1` is refused `candidate.trial_reset_required` with act-1, after it added oat milk on the product
    page and went to /account;
  - it undoes act-1 with `undoes`, and `test.2` answers yes;
  - first's trial, second's entry and second's trial each load the start page as the run's first act;
  - second's `test.1` is refused naming act-2 (first's rye bread) and act-3 (its own jam);
  - both undos succeed, and act-2's undo is routed to first's ledger;
  - second's trial began on the product page and its run loaded the start page itself;
  - the full act list is as scripted, the cart ends as it began (`["dish-soap"]`), and the domain never saw `undoes`.
- `service/project-build/tests/project-build-reset.test.ts`: in both cases the builder now makes its act after its
  own passing trial (otherwise that trial would now undo it). `maxIterations` went from 6 to 12, because the press
  after the trial fell in the wrap-up. All the original assertions stand unchanged: the whole trial is refused, the
  reset brief comes back done, and the build record is as before. This also covers point 6's requirement that a
  whole-candidate trial is unchanged.

## Commands run and observed results

All commands ran in the Core worktree.

- `pnpm check` (packages/fluxiq), final run: no errors.
- Vitest on subflow-trial, project-build, project-agents, subflow-candidate, verification, candidate-trial and
  `flow-bootstrap/candidate/tests/trial-gate*`: **75 files passed, 1 skipped; 604 tests passed, 2 skipped.** The
  skips are the same pre-existing skip as before.
- Vitest on the project-mode consumers outside those sets (`api/handlers/tests/llm-generation`,
  `conversations/commands/tests/build`, `llm/evidence-loop/tests/wrap-up-not-offered`,
  `llm/evidence-progress/tests/stall-redirect`, `llm/tests/loop-budget`,
  `service/flow-bootstrap-commands/tests/generation-request`): **6 files, 106 tests passed.**
- `node scripts/structure-audit.mjs`: **passed (356 warnings, 1156 baselined).**
  - The intermediate failure was the `imports` rule, from a deep import of `../authoring/assemble.ts`. It is fixed
    through the barrel export described above.
- Intermediate failures, all resolved:
  - the two reset tests, at first because their builders acted before their own trial, then because the brief's 6
    turns put the post-trial press in the wrap-up;
  - the e2e test, from the `missing_output_action` defect above.
- No live run, and no provider calls.

## Not verified

- Live or Lab behaviour, including the real web navigation node run as the trial's first plan node and the Lab
  hook's `prepareStart` path in a full build. The hook path is covered only by the stub tests in
  `service/subflow-trial/tests/site-reset.test.ts`, not through the service.
- Capacity above 1: there the cross-brief reset would ask for another resource's acts. The web domain declares 1.

## Open questions or contradictions found

1. **Two edits outside the listed paths, both minimal:**
   - `project-agents/dispatch/types.ts`: the port type and `reset`;
   - `flow-bootstrap/authoring/index.ts`: one named export.
2. **`guidance.ts:73` (the DISPATCH tool text) makes the same false claim:** "permits each brief exactly the lasting
   acts its parts ask for". I was cleared for one sentence, so I left it. It needs the same rewording.
3. **The `undoes` key's description in `flow-bootstrap/site-reset/undoes-tool.ts` says "the act id
   core.test_candidate listed".** Builders now see it, and for them it is `core.test_subflow`. The text should be made
   generic ("the act id a test listed"). The file is not mine.
4. **Entry preparation runs the start hook,** which undoes every earlier act, but it does not mark those acts absorbed
   in the project ledger. The next trial's `startReset` absorbs them, so the ledger corrects itself. Until then the
   ledger shows them in place, so a builder that ends without a trial could cause a needless reset brief, which
   would then find them gone.
5. Without a hook, entry preparation runs the predecessors on top of any acts earlier briefs left behind; it does not
   undo first.
6. As before, the arrival step shifts trial step numbers by one or two.
