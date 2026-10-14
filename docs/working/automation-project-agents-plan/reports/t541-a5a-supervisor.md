# t541 A5a: project supervisor (report)

Worker label: t541-a5a-supervisor. Worktree `fxwork/t541/!FluxIQ`, branch `task/t541-project-supervisor-loop`. The supervisor committed the first pass (`06233634`) and merged dev (`ce0417d4`). The follow-up below is uncommitted.

## Outcome

Done. The project supervisor is built in `runtime/project-agents/supervisor/`. It is not wired into `service.ts`; A5c does that. The `submitComposed` seam is in `flow-bootstrap/candidate/submission.ts`. The tests cover every definition-of-done item, using a stub provider, a stub dispatch port, a stub ledger and a stub whole trial. The four narrow checks pass (results below).

## What changed and why

Paths are relative to `packages/fluxiq/src/programs/automation-studio/runtime/`.

- `llm/harness-options/bootstrap-completion.ts` (follow-up, structural):
  - The check is now one sequence with one exported entry, `checkAutomationStudioFlowBootstrapPlanCompletion(input)`. `origin: "model"` takes today's input; `origin: "composed"` takes `{ plan, summary, … }`, typed `AutomationStudioFlowBootstrapComposedCompletionInput`.
  - `checkAutomationStudioFlowBootstrapCompletion` is now a one-line wrapper (`origin: "model"`), so every caller is unchanged.
  - After reading, both origins go through a private `checkPlan`: parse, size limits, element step, validation, the looped-replace rule, the capability notes, the instructed acts, and building the verdict or refusal.
  - It branches on `origin` only where the two genuinely differ:
    - Reading: draft or reply for a model's result; the plan as given for a composed one.
    - Elements: domain resolution for a model's plan; for a composed plan, `composedElements`, which refuses any handle still named with `bootstrap.composed_handle_unresolved`, filed under `flow_bootstrap.evidence_completion_parameters_unresolved`.
    - Instructed acts: run only for a model's result.
    - Size limits: a composed plan is held to the limits for a plan Core assembled (`"draft"`).
    - Refusal wording: a failure with no account of its own gets Core's own sentence for a composed Flow, and the parameter guidance as before for a model's.
  - The barrel exports the new function and both input types.
- `llm/harness-options/tests/bootstrap-completion-composed.test.ts` (new):
  - A composed plan keeps part interfaces and plan metadata. The same plan sent as a model's reply loses them.
  - A leftover handle is refused in Core's words.
  - Validation refuses an invalid composed plan.
- `flow-bootstrap/candidate/submission.ts`:
  - `submit` delegates to a private `submitChecked(result, history, check)`; behaviour is unchanged.
  - `submitComposed({ plan, summary }, history)` calls `checkAutomationStudioFlowBootstrapPlanCompletion({ ...this.input, origin: "composed", plan, summary })`. It shares the revision counter, the digest and the unchanged and refuted rules, and runs the binding check.
  - The earlier copied `checkComposed` and its `candidate.composed_refused` code are gone. Refusals now carry the completion check's own feedback (`flow_bootstrap.completion_refused`, with `refusal` naming the failure code).
  - Why the reply path cannot take a composed plan, found by probing: its reader drops every part's `interface`, all subflow `metadata` and `plan.metadata`. It also treats the plan as model-written, which refuses resolved elements.
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
  - A `reset` coming back `done` with no proposal is read as done. After the dev merge, this relies on the contract fix in `contracts/builder-return.ts`; the supervisor's own tolerance (in `dispatch-tool.ts`) is removed.
- `supervisor/` stays flat at 20 source files. A `supervisor/tools/` kind folder was tried and fails the structure audit's depth rule: `[naming] … 10 path segments exceeds the 9-segment depth limit`, 11 failures. So it was reverted, and the advisory warning stands. The 20 files remain under the hard cap of 25.

## Commands run and observed results

All commands were run from the worktree.

First pass:
- Supervisor, assembly, dispatch-order, role-tools, guidance and composed-submission tests: 25 passed.
- `project-agents/`, `candidate/tests/` and `subflow-candidate/tests/`: 39 files, 296 tests passed.
- `pnpm.cmd --filter fluxiq check`: exit 0, after fixing two test type errors.
- Structure audit: passed.
- `git diff --check`: exit 0.

Follow-up:
- `pnpm.cmd exec vitest run src/programs/automation-studio/runtime/llm/harness-options src/programs/automation-studio/runtime/flow-bootstrap/candidate/tests/`, after the refactor: `Test Files 40 passed (40)`, `Tests 351 passed (351)`. The existing `bootstrap-completion.test.ts` passed unchanged.
- With the `tools/` folder in place: the structure audit failed with `11 violation(s) across 1 rule(s)` (depth). This is why the folder was reverted.
- Final run, after the revert:
  - `pnpm.cmd --filter fluxiq check`: `check exit 0`.
  - `node scripts/structure-audit.mjs`: `structure-audit: passed (350 warning(s), 1156 baselined)`. The advisory warnings are on the 20 files in `supervisor/`, the 9 exports in the fixture, and `bootstrap-completion.ts` at 775 lines.
  - `git diff --check`: `diffcheck exit 0`.
  - Combined vitest run (`project-agents/`, `candidate/tests/`, `subflow-candidate/tests/`, `llm/harness-options`): `Test Files 65 passed (65)`, `Tests 522 passed (522)`.

## Not verified

- No live run and no provider call; everything uses a stub provider and stubs.
- Not run against the real A5b dispatcher, which is now on dev; the supervisor tests still stub it. No test goes from the supervisor through the real dispatcher (that is A5c wiring).
- Composed submission was tested only against the refusal-test registry and its stub domain, not against the web domain's real resolver. The assumption that a resolved element target (`{selector}`) in a success check passes validation was tested with that registry only.
- Full suites were not run, per the rules.

## Open questions or contradictions found

1. Resolved: the composed checks now live in `bootstrap-completion.ts`, as one sequence shared with a model's Flow (above).
2. Resolved on dev: a done reset without a proposal (contract fix); the supervisor's tolerance is removed.
3. **The whole trial's own acts are not in the project ledger.** Acts the whole trial leaves on the site are not attributed to any brief. A reset brief's "ledger clean" check (A5b) therefore cannot see them. The supervisor works around this by requiring a reset after any whole trial that left acts, and treating a done reset as clearing them. A5c should decide whether trial acts go into the project ledger under the supervisor.
4. **A builder refused by the Flow purse also ends the supervisor.** When a builder's call is refused at the Flow purse level (the parent), `purse.refuse` marks every frame of that purse on the async chain, the supervisor's run frame included. The supervisor's run then throws `AutomationStudioLlmBuildPurseRefused` and ends "out of money". That is honest when the Flow purse is exhausted. A refusal at the builder's own allowance does not affect the supervisor.
5. **`read_task` is offered only once.** The evidence loop does not offer `project.read_task` again after the opening call until something changes the epoch. The guidance now says the answer stays in evidence, rather than telling the model to reread.
