# t672 unread input not a blocker: worker report

## Outcome

Done.

- **Hand-off input left unread:** the submission passes. The proposal carries
  `unneededInputs`, the builder's accepted answer carries a `note`, and the
  brief's return says the plan needs no change.
- **Flow input left unread:** still refused `subflow.input_unread`. The text
  now tells the builder to read the value, and no longer tells it to end the
  brief blocked.
- **One rule decides which is which.** It now lives in
  `project-agents/dispatch/call-order.ts`. Assembly and the dispatch scope
  both use it.

## History

A first pass reported Blocked. The scope check could not tell which inputs
another subflow hands on, and the files needed to carry that were not owned.
The supervisor then extended ownership and asked for the rule to be extracted
from assembly, so that only one copy of it exists.

## What changed and why

Paths are under `packages/fluxiq/src/programs/automation-studio/runtime/`.

### New file: `project-agents/dispatch/call-order.ts`

- It exports `automationStudioProjectCallOrder(callees, predecessors)` and the
  type `AutomationStudioProjectCall`.
- The order is unchanged: each subflow runs after the predecessors its brief
  names, in plan order between equals, and a circle gives `undefined`.
- Each input records `from`, the position of the latest earlier subflow that
  hands back an output of the same name. With no `from`, the input is the
  Flow's own value.
- It is the code taken out of `assembly.ts` (`dependencyOrder` and the binding
  loop that was at :196-201).
- It sits in `dispatch/` because `supervisor/ports.ts` already imports the
  dispatcher and the dispatcher never imports the supervisor. A file in
  `supervisor/` would have created an import cycle.
- Exported from `dispatch/index.ts`, with that barrel's header updated.

### `project-agents/supervisor/assembly.ts`

- It calls `automationStudioProjectCallOrder`. `callsInOrder` writes each
  binding from `call.inputs`, so the output is the same as before.
- Its private `dependencyOrder` is removed, and the header points to the
  shared rule.

### `flow-bootstrap/subflow-candidate/contracts.ts`

- `AutomationStudioSubflowScope.handedOn?: readonly string[]`.
- `AutomationStudioSubflowProposal.unneededInputs?: readonly string[]`.
- Neither field enters the proposal digest.

### `project-agents/dispatch/scope.ts`

- It sets `scope.handedOn` with the shared rule.
- The subflows ordered are the plan's subflows that have an interface.
- For predecessors it uses each subflow's latest recorded brief under the same
  plan digest, with this brief's own predecessors for its own subflow.
- `handedOn` is the brief's inputs that have a `from`. It is left out when
  empty.
- Header paragraph added.

### `flow-bootstrap/subflow-candidate/callable-target.ts`

- The probe takes `handedOn`.
- An unread input in `handedOn` is collected into `unneeded` and returned next
  to `probe`.
- Any other unread input is still refused. Its text now ends: "No other subflow
  hands this value on: it is one the person gives the Flow, and this subflow is
  where the plan uses it. Read it where this subflow uses it." The way out of
  ending blocked is gone.
- Header updated: the t581 sentence is qualified and a t672 paragraph added.

### `flow-bootstrap/subflow-candidate/scoped-submission.ts`

- It passes `this.scope.handedOn` to the probe.
- An accepted candidate's `unneeded` inputs are stored by its candidate
  digest, alongside the existing `proposedChecks`.
- `proposalOf` sets `proposal.unneededInputs` from that store.
- Header paragraph added.

### `flow-bootstrap/subflow-candidate/builder-loop.ts`

- Only the accepted-submission answer changed. It gains a `note` from a new
  helper, `unneededNote`, which says the revision stands, the supervisor is
  told, and the `input:` line stays.
- Header paragraph added.

### `project-agents/dispatch/ending.ts`

- Every return whose proposal carries `unneededInputs` says: `No step of this
  subflow reads its input "<name>", which an earlier subflow hands on: this
  subflow did not need it, and the plan needs no change for that.`
- That sentence is passed with the money suffix to `withMoney`, so clipping
  never cuts it off.
- `INPUT_UNREAD_ADVICE` is still reached, because a Flow-input refusal can still
  stall a builder. It is reworded: give the value to the subflow that uses it
  with `project.amend_plan`, or send a changed brief saying where this subflow
  uses it.
- The t630 header paragraph is updated and a t672 paragraph added.

### Comment-only changes

- `flow-bootstrap/subflow-candidate/route-outputs.ts`: the header and the
  `WAY_OUT` comment no longer say the output way out is shared with unread
  inputs.
- `project-agents/supervisor/dispatch-tool.ts:119`: the comment now says the
  check refuses only an unread input the person gives the Flow.

### Left unchanged

- `flow-bootstrap/plan/issue-feedback.ts`: the code is still a refusal and is
  still listed.
- `service/project-build/brief-ports.ts:163` and
  `service/candidate-failure/submission-refusals.ts:15`: both record what the
  t630 run did, and that is still true.
- No dead code is left: the old `dependencyOrder` is removed, and every new
  field is read.

### Tests

- New `project-agents/dispatch/tests/call-order.test.ts` covers:
  - binding to the latest earlier subflow, and to the Flow's own value when
    none hands the name on;
  - predecessors setting the order, so a producer that runs later hands
    nothing on;
  - a predecessor outside the list not being waited on;
  - a circle.
- New `project-agents/dispatch/tests/scope.test.ts` covers:
  - `handedOn` names the hand-off input and leaves the person's value out;
  - a producer ordered after the consumer gives no `handedOn`;
  - the garden plan, whose inputs are all the person's, gives none.
- New `flow-bootstrap/subflow-candidate/tests/callable-target.test.ts`: an
  unread hand-off input is noted and the probe is built; an unread Flow input
  is refused with the new text and without "blocked".
- `scoped-submission.test.ts`: a new case shows a hand-off input left unread
  passes with `unneededInputs: ["query"]`, a read one carries nothing, and the
  person's value is refused with the new text.
- `builder-loop.test.ts`: a new case shows the accepted answer carries the
  `note`, the builder tests and completes, and `outcome.proposal.unneededInputs`
  is set.
- `dispatch/tests/brief-return-reason.test.ts`:
  - a new case shows a done return says the note, in singular and plural, and
    says nothing when there are no unneeded inputs;
  - the t630 case expects the reworded advice.
- `service/project-build/tests/project-build-brief-ports.test.ts`: the t630
  end-to-end case expects the reworded advice. Its `titles` input is a Flow
  input, so it is still refused.

## Commands run and observed results

Commands ran in the t672 Core worktree. Run from `packages/fluxiq`:

- `npx tsc --noEmit -p tsconfig.json`: no output, exit 0. It ran before the
  tests were added and again after.
- `npx vitest run src/programs/automation-studio/runtime/flow-bootstrap/subflow-candidate/tests src/programs/automation-studio/runtime/project-agents/dispatch/tests src/programs/automation-studio/runtime/project-agents/supervisor/tests src/programs/automation-studio/runtime/service/project-build/tests/project-build-brief-ports.test.ts`:
  "Test Files 1 failed | 57 passed (58); Tests 1 failed | 348 passed (349)".
  The one failure was the brief-ports t630 case, which still expected the old
  advice text. I updated that expectation.
- `npx vitest run src/programs/automation-studio/runtime/service/project-build/tests/project-build-brief-ports.test.ts -t "never reads the input"`:
  "Tests 1 passed | 3 skipped (4)".

Run from the repository root:

- `node scripts/structure-audit.mjs`: "structure-audit: passed (389
  warning(s), 1156 baselined)". The only warnings on changed files are the
  advisory 400-line ones on `scoped-submission.ts` (472) and `ending.ts` (461).
  Both files were already over 400 lines before this change (459 and 441).

## Not verified

- No live or Lab run. I did not check that a real `project` build now gets past
  the case seen in `run-mvan7giv-4246aafb`.
- No end-to-end service test runs a dependent builder that leaves a hand-off
  input unread through the project build. The path is covered piece by piece:
  scope, probe, controller, builder loop, and return.
- The other three cases in `project-build-brief-ports.test.ts` passed in the
  first run, which used the same code. They were not run again after the one
  test-file edit.

## Open questions or contradictions found

- **Where the two applications of the rule can differ.**
  - At dispatch, the rule sees only the predecessors of briefs recorded so far.
    At assembly, it sees the predecessors of the latest done briefs. If a later
    brief changes a subflow's predecessors, the call order can change between
    dispatch and assembly.
  - Assembly also skips subflows that some proposal already calls. Dispatch
    cannot know that.
  - In both cases the rule is the same and only its inputs differ. If they do
    differ, the worst case is that a builder's unread input is refused, as
    before, or accepted while assembly binds it to the Flow's value. In the
    second case the value is unread either way.
- **Documentation.** No architecture document under `docs/architecture/`
  describes `subflow.input_unread`, so none was updated. The supervisor may
  want to add a line on the call-order rule to the automation-project-agents
  plan's section on how data crosses subflows.
