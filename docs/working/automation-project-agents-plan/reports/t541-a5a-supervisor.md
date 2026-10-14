# t541 A5a: project supervisor (report)

Worker label: t541-a5a-supervisor. Worktree `fxwork/t541/!FluxIQ`, branch `task/t541-project-supervisor-loop`. Nothing committed.

## Outcome

Done. The project supervisor is built in `runtime/project-agents/supervisor/`. It is not wired into `service.ts`; A5c does that. The `submitComposed` seam is in `flow-bootstrap/candidate/submission.ts`. The tests cover every definition-of-done item, using a stub provider, a stub dispatch port, a stub ledger and a stub whole trial. The four narrow checks pass (results below).

## What changed and why

Paths are relative to `packages/fluxiq/src/programs/automation-studio/runtime/`.

- `flow-bootstrap/candidate/submission.ts`:
  - `submit` now delegates to a private `submitChecked(result, history, check)`. Behaviour is unchanged: the existing candidate and subflow tests all pass.
  - New `submitComposed({ plan, summary }, history)` runs a module-private `checkComposed`. That check runs the plan parse, the size limits (as for a plan Core assembled), a refusal of any handle still named, `validateAutomationStudioFlowBootstrapPlan` and the record-replace-in-repeat rule. `submitChecked` then runs the binding check plus the existing unchanged, refuted and digest rules on the same revision counter.
  - Refusals use the code `candidate.composed_refused`.
  - Why it does not call `checkAutomationStudioFlowBootstrapCompletion`: I probed it. Its reply reader (`acceptAutomationStudioFlowBootstrapResult` with `{plan}`) drops every part's `interface`, all subflow `metadata` (success checks, requires) and `plan.metadata`. It also sets `writtenByModel: drafted === undefined` (`bootstrap-completion.ts:380`), which refuses a resolved element in a fact target (`plan-parameter-resolution.ts:221`).
- `project-agents/supervisor/` (new):
  - `ports.ts`: everything A5c builds. That is the record store and ref, the instruction digest, sources, the dispatch port, a `proposals(ref)` lookup, the project ledger (`snapshot`), the submission controller input, the trial port, the purse and reserve, and the signal.
  - `supervisor-loop.ts` (`runAutomationStudioProjectSupervisorLoop`):
    - Runs the evidence loop with `draft:false, dryRun:false`. No `discoveryOnly`, no `budget`.
    - The run is inside `withAutomationStudioProjectAgent({role:"supervisor"})` and `automationStudioLlmBuildPurseRun(purse, …)`.
    - It reads the build record first, or creates it.
    - It calls `keepBackForJudging(reserve)` and records the supervisor's allowance.
    - On a yes it returns `status:"candidate"` and writes no ending; the caller promotes, then ends the record `promoted`.
    - Every other ending it records itself: honest, out of money, cancelled, or the loop stopped short.
  - `tools.ts`, `tool-ids.ts`, `role-tools.ts`:
    - Tools are `project.read_task` (the `initialObservation`, run with no provider call), `write_plan`, `amend_plan`, `dispatch` (`mutate`), `assemble`, and `core.test_candidate` (`mutate`).
    - Host tools are filtered to observe-only domain tools plus `core.describe_nodes` and `core.recall_result`, with their `initialObservation` stripped.
  - `plan-input.ts` and `plan-tool.ts`: Core computes the digests. Every issue is reported, including words not copied exactly and uncovered parts. Amend logs a `re_plan` decision. The plan card is emitted.
  - `brief-input.ts`, `dispatch-order.ts`, `dispatch-tool.ts`:
    - Core fills in the brief id, plan digest and interface.
    - Briefs are put in dependency order, and a predecessor that is neither done nor in the same call is refused, as is a cycle.
    - The total allowance must fit `purse.allocatableUsd()`, so the reserve is never allocatable.
    - Briefs are recorded, and the decision is logged as `dispatch` or `triage`. Brief and return cards are emitted.
    - A return that does not match its brief is read as `blocked`.
  - `assembly.ts` and `assemble-tool.ts`:
    - The plan is composed with each subflow's latest done proposal (fetched through the ports and checked by revision, digest and brief).
    - The one router-run subflow without a proposal becomes `builtin.control.call-subflow` steps in dependency order. Each input is bound to `$node.s<j>.<name>` from the latest earlier output with the same name, or else to the Flow's own `{ $state: { path: name } }`. These are reported as `flowInputs`.
    - The result is submitted through `submitComposed`.
  - `whole-trial.ts`:
    - The whole trial is refused with `project.trial_reset_required` (`retry_allowed`) while the project ledger has acts in place, or while the last whole trial left acts and no reset has come back done since.
    - Otherwise it runs `AutomationStudioFlowCandidateTrialGate.test`, records a `candidate_trial` receipt and emits the receipt card.
  - `completion.ts`: completion is accepted in two cases. One is the exact latest assembled `{revision, digest}` with a gate yes. The other is an honest ending, `{ended: blocked|partial, reason}`, accepted only once a brief came back blocked or partial or a whole trial failed.
  - `guidance.ts`: every string the model sees. The example is a lending library. No string uses the word "digest": the model completes and tests with the `complete` object that assembly returns.
  - `state.ts`, `context.ts`, `read-task.ts`, `tool-answer.ts`, `index.ts`.
- `project-agents/index.ts`: added the `./supervisor/index.ts` export line.
- After the coordinator's note about A5b:
  - Survey briefs are refused (`project.brief_survey_unavailable`) and left out of the tool's kind enum. The guidance points the model at the observe-only look tools instead.
  - The guidance says `maxIterations` must leave room for subflow trials, and that a brief whose predecessor comes back blocked comes back blocked too.
  - A `reset` coming back `done` with no proposal is read as done.

## Commands run and observed results

All commands were run from the worktree.

- `pnpm.cmd exec vitest run src/programs/automation-studio/runtime/project-agents/supervisor/tests/ src/programs/automation-studio/runtime/flow-bootstrap/candidate/tests/submission-composed.test.ts`: 6 files, 25 tests passed. The files are supervisor-loop (12), assembly (3), dispatch-order (2), role-tools (1), guidance (3) and submission-composed (4).
- `pnpm.cmd exec vitest run src/programs/automation-studio/runtime/project-agents/ src/programs/automation-studio/runtime/flow-bootstrap/candidate/tests/ src/programs/automation-studio/runtime/flow-bootstrap/subflow-candidate/tests/`, final run after the type fixes: `Test Files 39 passed (39)`, `Tests 296 passed (296)`.
- `pnpm.cmd --filter fluxiq check`:
  - First run: failed with two type errors in my test files (an `interface: undefined` spread, and a JsonValue fallback in the fixture).
  - After both were fixed: `check exit 0`.
- `node scripts/structure-audit.mjs`: `structure-audit: passed (350 warning(s), 1156 baselined)`. Two advisory warnings are mine, and neither fails the audit:
  - `project-agents/supervisor/` has 20 source files, past the 15-file advisory threshold. The hard cap is 25.
  - `supervisor/tests/supervisor-fixture.ts` has 9 exported values, past the advisory threshold of 8.
- `git diff --check`: exit 0; only the LF→CRLF notices.

## Not verified

- No live run and no provider call; everything uses a stub provider and stubs.
- Not run against the real A5b dispatcher, which is being built in parallel. Its returns and proposals are stubbed.
- Composed submission was tested only against the refusal-test registry and its stub domain, not against the web domain's real resolver. The assumption that a resolved element target (`{selector}`) in a success check passes validation was tested with that registry only.
- Full suites were not run, per the rules.

## Open questions or contradictions found

1. **Composed checks live in `submission.ts`, not `llm/`.** The proper home for `checkComposed` is beside the reply and draft paths in `llm/harness-options/bootstrap-completion.ts`, as a host-composed entry. That file was out of my ownership, so the sequence is duplicated in `submission.ts`. A later unit should move it there.
2. **Reset returns break the return contract.** A `reset` brief returns `done` with no proposal (A5b). `automationStudioProjectBuilderReturn.issues` reports that as `project.return_done_without_proposal`. The supervisor tolerates it, but the build record store's `recordReturn`, which the dispatcher calls, will refuse a reset's done return. This needs a contracts fix in `contracts/builder-return.ts`, which I did not own.
3. **The whole trial's own acts are not in the project ledger.** Acts the whole trial leaves on the site are not attributed to any brief. A reset brief's "ledger clean" check (A5b) therefore cannot see them. The supervisor works around this by requiring a reset after any whole trial that left acts, and treating a done reset as clearing them. A5c should decide whether trial acts go into the project ledger under the supervisor.
4. **A builder refused by the Flow purse also ends the supervisor.** When a builder's call is refused at the Flow purse level (the parent), `purse.refuse` marks every frame of that purse on the async chain, the supervisor's run frame included. The supervisor's run then throws `AutomationStudioLlmBuildPurseRefused` and ends "out of money". That is honest when the Flow purse is exhausted. A refusal at the builder's own allowance does not affect the supervisor.
5. **`read_task` is offered only once.** The evidence loop does not offer `project.read_task` again after the opening call until something changes the epoch. The guidance now says the answer stays in evidence, rather than telling the model to reread.
