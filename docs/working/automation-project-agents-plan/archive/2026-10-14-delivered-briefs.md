# Delivered briefs, 2026-10-13 to 2026-10-14

Moved from the plan's Worker Briefs once their units merged (A9-A13, A15-A18, A21, A10b, t569, t570); each unit's
result is in the plan's Work Ledger.

### Brief: A9-judge-task-checklist
- Repository: FluxIQ Core, the paired worktree the dispatch prompt names. Lands before A8.
- Task: in mode `project`, the judge receives the task spec's parts and `notAsked` list as a checklist beside the
  original instructions (plan: Contracts, Task spec). The instructions stay the only authority: the checklist is a
  clearly labelled supplementary section saying what the instructions ask, part by part, and what they do not ask,
  so a result that adds a filter, column or exclusion nobody asked for is judged against it. Add an optional
  checklist input to the build-test judge (`result-verification/build-test/judge.ts` and the prompt it builds);
  without one the judge's request is byte-identical to today's (candidate mode unchanged). Build it from the build
  record's latest task spec for the whole trial (`service/project-build/whole-trials.ts`) and from the brief's parts
  for a subflow trial (`service/project-build/subflow-trials.ts`). Never mirror a realistic scenario in any example
  or wording (copy the guard lists from `llm/harness/tests/in-run-repair-slot.test.ts:106-125` into your test).
- Owns: the judge and its prompt assembly under `result-verification/build-test/`, the two project-build files,
  their tests; report.
- Must not touch: `service.ts`, `project-agents/**`, `flow-bootstrap/**`, `llm/**`.
- Definition of done: judge request unchanged without a checklist (byte comparison); with one, both lists present
  and labelled as subordinate to the instructions; whole and subflow trials pass it; guard test; narrow checks.

### Brief: A12-assembly-dataset-ids
- Repository: FluxIQ Core, the paired worktree the dispatch prompt names. Lands before A8.
- Task: a builder's helper parts are re-keyed `<subflowKey>-<label>` (`flow-bootstrap/subflow-candidate/part-keys.ts`)
  but keep their step ids (`narrow-s1`), so two briefs could derive the same dataset id or step id in the assembled
  Flow. Make the re-keying also make step ids (and whatever dataset ids derive from) unique per subflow, and make
  `project-agents/supervisor/assembly.ts` refuse an assembled plan with a duplicate step id or dataset id across
  subflows, naming both briefs. Find first how dataset ids are derived (grep the read-list/dataset owner).
- Owns: `flow-bootstrap/subflow-candidate/part-keys.ts`, `project-agents/supervisor/assembly.ts`, their tests; report.
- Must not touch: `service.ts`, `service/project-build/**`, `result-verification/**`.
- Definition of done: two briefs whose builders both name a helper `narrow` with a read step assemble into a plan
  with distinct step and dataset ids; a forced duplicate is refused at assembly; existing subflow-candidate and
  supervisor tests pass; narrow checks.

### Brief: A10-A11-ask-routing-and-start-hook-lease
- Repository: FluxIQ Core, the paired worktree the dispatch prompt names. Needed above capacity 1.
- Task: (A10) `conversations/commands/answer-ask.ts:76-88` resolves an answer without an ask id to the newest pending
  ask, so with two builders asking at once an answer can land on the wrong one. When more than one ask is pending
  in the thread, an answer must name its ask id, or it is refused with a message that names the open asks; one
  pending ask keeps today's behaviour. (A11) The trial start hook (`prepareStart`, `service/candidate-trial/contracts.ts`
  and its uses in `service/candidate-trial/` and `service/subflow-trial/`) takes no lease, so above capacity 1 a
  site reset could act outside the holder's resource. Pass the holder's lease, when there is one, to the hook, and
  document that a domain's hook resets only that resource; no lease keeps today's behaviour.
- Owns: the files named and their tests; report.
- Must not touch: `service.ts`, `project-agents/**`, `service/project-build/**`.
- Definition of done: tests for both, including unchanged single-ask and no-lease paths; narrow checks.

### Brief: A13-build-purse-split
- Repository: FluxIQ Core, the paired worktree the dispatch prompt names.
- Task: `llm/build-purse/purse.ts` grew to 476 lines (advisory 400) with t534's allowances. Split it by
  responsibility (holds and settlement, refusal, judging reserve, allowance carving) into focused files in the same
  directory, one exported thing per file, the barrel unchanged for callers. Behaviour-preserving: no test changes
  except imports; never extract-and-drop.
- Owns: `llm/build-purse/**`; report. Must not touch: anything outside it.
- Definition of done: every test that names the purse passes unchanged in meaning (grep `build-purse|BuildPurse`);
  `purse.ts` under 400 lines; narrow checks.

### Brief: A15-A18-core-retired-paths-cleanup
- Repository: FluxIQ Core, the paired worktree the dispatch prompt names.
- Task: four leftovers the sweeps found. (A17) `createDefaultFlow` makes owner-bound Flows that can never hold
  instructions, so they can never run; only tests call it: retire it and move its tests to canonical Flows. (A16)
  `storage_required` cannot be reached through `runRuntimeSession` for a run with no project: remove the dead branch
  or report why it must stay. (A18) SQL stores `adaptation_review` scopes as `flow` and `on_error` as `error`, unlike
  the summary index: make both paths answer the same at their boundary (a mapping, no stored-data change), and
  extend `runtime/service/summaries/tests/instruction-scope-parity.test.ts`. (A15) A build refused for missing
  instructions no longer carries the Flow Bootstrap diagnostic (stage, provider fields): find every caller that
  classifies build failures by it (Core and the downstream Lab: grep both), and restore the fields on that refusal
  if any does.
- Owns: the files these touch, `runtime/service.ts` in place (lines may only go down), their tests; report.
- Must not touch: `project-agents/**`, `service/project-build/**`, `llm/build-purse/**`, `result-verification/**`.
- Definition of done: tests beside each change; narrow checks; the report lists each item's outcome.

### Brief: A21-instruction-scope-write-error
- Repository: FluxIQ Core, the paired worktree the dispatch prompt names.
- Task: t558 found that an instruction whose scope names a node not in `graph_nodes` is silently left out of project
  SQL: the write's error is swallowed (`runtime/service.ts` ~3249), so a SQL listing omits an instruction the summary
  index still lists. Find why the write fails (a foreign key to `graph_nodes`?) and make the two stores agree without
  swallowing anything: either the save refuses a scope that names no node of the Flow, with a clear error, or the
  scope is stored so that it does not depend on the node row; choose by what the instruction scope contract says
  (`docs/architecture/automation-studio/`), and say why. Extend the parity test
  (`runtime/service/summaries/tests/instruction-scope-parity.test.ts`) with this case.
- Owns: the write path you find, `runtime/service.ts` in place (lines may only go down), the store's tests; report.
- Must not touch: `project-agents/**`, `service/project-build/**`, `conversations/**`.
- Definition of done: no swallowed write; parity holds for a node-scoped instruction; tests beside each change; narrow checks.

### Brief: A10b-chat-sees-ask-ids
- Repository: FluxIQ Core, the paired worktree the dispatch prompt names.
- Task: since t556 a typed answer that names no ask is refused when more than one ask waits, but Core's chat model
  never sees ask ids, so it can never name one and a typed answer can settle neither. Give the chat model the waiting
  asks with their ids in its own context (the conversation's model context, not the thread), so its answer command
  can name the ask the person meant, and say in its guidance how to choose. The person still never sees an id
  (t276: no codes in the thread). Guidance examples use a different kind of site than any realistic scenario.
- Owns: the conversation model context and guidance under `runtime/conversations/` and their tests; report.
- Must not touch: `project-agents/**`, `service/project-build/**`, `runtime/service.ts`.
- Definition of done: with two asks waiting, a stub chat model that reads the context names the right ask and the answer
  settles it; one waiting ask behaves as before; no id appears in any thread text (test); narrow checks.

### Brief: supervisor-plans-not-explores
- Repository: FluxIQ Core, the paired worktree the dispatch prompt names. Before A8 resumes.
- Task: the first live `project` build (run-mv7t07hx-fe96a174, crossborder, 18 steps, $0.0056; steps in
  `C:/Users/osrs_/FluxStuff/lab-runs/2026-10-14/run-mv7t07hx-fe96a174/steps/`) ended
  `flow_bootstrap.evidence_repeat_without_progress` / `llm_evidence_loop.searching_without_acting` after the supervisor
  read the task and then made 7 `web.find_on_page` calls and one `web.describe_element` without ever writing a plan.
  Its own reasons show it trying to explore like a builder ("I'll type Voltbay into the site's search box (t8)") with
  only observe tools, using `find_on_page` (one query was just "field") as a stand-in for acting. Fix the supervisor
  so it plans from a short look and leaves exploring and acting to builders: (1) guidance
  (`project-agents/supervisor/guidance.ts`, the `project.read_task` answer and the tool descriptions) states its role
  plainly: it does not operate the site; after the task and at most a couple of looks at the current page it writes
  the task spec and structure plan, and a part it cannot see from the start page is a builder's to find; examples
  from a different kind of site than any realistic scenario (keep the guard test); (2) a look budget: after a small
  number of observe calls (choose and justify, about 3) the observe tools are withdrawn through the loop's existing
  look withdrawal (`llm/decision-handlers/look-withdrawal.ts` and its input) so only planning, dispatch, assembly and
  test remain; (3) the stall redirect and the searching-without-acting feedback, when they reach the supervisor,
  name `project.write_plan` (or the next planning step) as the way forward, through the loop's finishing-tools style
  input t537 added, not supervisor-specific branches in `llm/`; the candidate loop's wording stays byte-identical.
- Second defect, from run-mv7t19hg-1d51f430 (bigbox, steps 0025-0034): after the same over-looking the supervisor
  wrote an excellent task spec (verbatim quotes, goal facts, a sound not-asked list) but every `project.write_plan`
  was refused (`structurePlan.plan.router` missing, then `subflows.0.callable` unknown): it is asked to write Core's
  raw `AutomationStudioFlowBootstrapPlan` (router rules, interface ports `{id, name, valueType}`, structured success
  checks) and guesses. (4) Give the supervisor a planning format it can write and Core compiles
  (`project-agents/supervisor/plan-input.ts`, `plan-tool.ts` input schema and description): `subflows: [{ key, name,
  purpose, parts: [partId], inputs: [name], outputs: [name], after: [key] }]` and nothing else. Core builds the
  structure plan from it: one subflow with no inputs and outputs is the router-run subflow itself; several become
  callable parts with interfaces built from their names, the router-run body is composed at assembly as now, `partOf`
  from `parts`, entry predecessors from `after`; a success check is the builder's to propose, not the supervisor's.
  Refusals name the planning format's own fields. Keep the raw plan path out of the model's reach.
- Required reads: the run's steps (request/response of 0003, 0011, 0017, and the last), `project-agents/supervisor/`,
  `llm/evidence-progress/stall-redirect.ts`, `llm/decision-handlers/look-withdrawal.ts`, `llm/loop-budget.ts`.
- Owns: `project-agents/supervisor/**`; the inputs and wording paths in `llm/evidence-progress/`, `llm/decision-handlers/look-withdrawal.ts`,
  `llm/loop-configuration.ts` needed for (2)-(3), each with tests; report.
- Must not touch: `service.ts`, `service/project-build/**` (unless one line to pass the new input; say so), `flow-bootstrap/**`.
- Definition of done: a stub-provider test with the planning format (one-part and three-part tasks) gives valid structure plans and dispatches; a stub-provider test replaying the crossborder run's shape (a supervisor that searches repeatedly) gets
  the look tools withdrawn after the budget and a redirect naming the plan, and a stub that then writes the plan
  proceeds to dispatch; candidate loop tests unchanged; the guidance guard test; narrow checks. No live run.

### Brief: project-calls-and-brief-defaults
- Repository: FluxIQ Core, the paired worktree the dispatch prompt names. Before A8 resumes.
- Task: A8 round 1 after t569 (run-mv7vk3ol-9e11b266 crossborder, run-mv7vl89u-917d62a6 bigbox; steps under
  `C:/Users/osrs_/FluxStuff/lab-runs/2026-10-14/`): the supervisor now plans and dispatches, and builders act, but
  both builds ended `flow_bootstrap.run_budget_calls_exhausted` at about $0.07-0.08 of $0.25, bigbox before any
  builder submitted. (1) Calls: an allowance reserves dollars but not calls (t534 open question), so one builder
  spends the run's calls and its own wrap-up never triggers. Carve each brief's call cap from the parent purse's
  remaining calls the way dollars are carved (never from what assembly, the whole trial and judging keep back), and
  have the builder loop's wrap-up and budget notes read its own allowance, so a builder submits before its share
  ends (`llm/build-purse/` allowance book, `service/project-build/` where allowances and loop limits are set,
  `flow-bootstrap/subflow-candidate/builder-loop.ts`). (2) Core sizes briefs: when the supervisor gives no
  `allowanceUsd`/calls, split what can still be given out over the briefs being sent and those the plan has not yet
  dispatched; the supervisor may still lower one; `project.allowance_unavailable` should no longer be reachable by
  guessing (it was hit twice). (3) Core derives each brief's `permittedActs` from its parts' lasting acts
  (`project.brief_act_not_asked` was hit three times); the supervisor no longer writes them. (4) A builder's brief
  shows the exact `input:` and `output:` lines its part must declare, by name (`subflow.interface_input_mismatch`:
  "collect_coupon is given exactly itemUrl; this part declares no value").
- Required reads: the two runs' steps (supervisor dispatch calls and results, the builder refusals), the Core plan's
  Contracts (Allowance), `llm/build-purse/`, `service/project-build/`, `project-agents/{supervisor,dispatch}/`,
  `flow-bootstrap/subflow-candidate/builder-loop.ts`.
- Owns: the files named and their tests; `project-agents/contracts/subflow-brief.ts` if a field becomes optional; report.
- Must not touch: `service.ts` beyond one in-place line if unavoidable (say so); `flow-bootstrap/candidate/**`.
- Definition of done: a stub test where three builders share a 64-call build: each gets a call share, each wraps up and
  submits within it, and calls remain for assembly and the whole trial; briefs sent without allowances get sizes that
  fit; permitted acts come from parts; the brief shows interface lines; candidate builds' purse behaviour unchanged.
  The whole project-agents, project-build, build-purse, subflow-candidate sets; check; audit. No live run.
