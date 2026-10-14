# t569 supervisor-plans-not-explores: worker report

Worker label: t569-supervisor-plans. Worktree: `C:/Users/osrs_/FluxStuff/fxwork/t569/!FluxIQ`
(branch `task/t569-supervisor-plans-not-explores`). Nothing committed. No model-provider call made.

## Outcome

Done, including both of the supervisor's follow-ups (see "Follow-up" and "Follow-up 2" below). All four original items are
built and tested. The 7 `service/project-build` tests that sent the raw plan are converted and
now pass. The supervisor has its own system instructions. A builder may now propose a success
check when its plan gives none. The whole narrow set passes with 0 failures.

The sections below the follow-up are the first pass, as first reported. Where the follow-up
changed something, the follow-up wins: the 7 failures and the "patch needed" are resolved, and
open questions 1, 2 and 4 are settled.

## Follow-up (supervisor message, same worktree)

**(1) The supervisor has its own system instructions.**
- `project-agents/supervisor/guidance.ts`: new `system.role` and `system.host`. The role says the
  supervisor plans, builders operate the target, its look tools only look, and it completes only
  on a yes. The host line is one sentence naming the bound domain's id.
- `project-agents/supervisor/system-instructions.ts` (new) builds
  `{domainId: "fluxiq.project-supervisor", version: "project-supervisor.1", text}` from those two
  strings. It is exported from the supervisor barrel.
- `service/project-build/supervisor-provider.ts` (new) wraps the build's provider with those
  instructions.
- `service/project-build/run.ts`: the supervisor's `decide` now calls
  `draft.runHarness({...request, provider: supervisorProvider})`. Builders, resets and judges keep
  the build's provider, and so the domain's text.
- One llm line was needed: `llm/domain-instructions/provider.ts` now uses
  `domainInstructions: request.domainInstructions ?? domainInstructions`. The domain's decorator is
  always the innermost one, so it now keeps instructions an outer decorator already set. Without
  an outer decorator, nothing changes.
- The system message keeps Core's rules and Core's task prose. The supervisor's text sits where
  the domain's text went.
- Tests:
  - `llm/domain-instructions/tests/provider.test.ts`: a request that already carries instructions
    keeps them, for both run and measure.
  - `service/project-build/tests/project-build-facade.test.ts`: in a build whose domain binds
    operating text, every supervisor request carries the role and host text and neither
    "You operate a real website" nor "own search". Every builder request carries the domain's text
    exactly.

**(2) The 7 tests converted.** `project-build-reset.test.ts` and `project-build-facade.test.ts`
now send the planning format. The helpers left unused by that (`CHECK`, `checked`, `callable`, the
`router` local) are removed.

**(3) A builder may propose a success check.** In
`flow-bootstrap/subflow-candidate/scoped-submission.ts`:
- `subflow.success_check_changed` is now refused only when the scope has a check and the builder
  wrote a different one.
- When the scope has none, the check the builder writes becomes its subflow's. A script's
  `done when:` already lands in the target's metadata. A JSON plan's check, which the plan reader
  drops, is kept per candidate digest and put back in `proposalOf`.
- Test: when the scope has no check, a check from a JSON plan and one from a script are both
  carried, and writing none carries none. The existing tests that refuse changing a scope's check
  still pass.

**Commands and results (after the follow-up):**
- `npx tsc --noEmit -p packages/fluxiq`: exit 0.
- vitest on `runtime/llm`, `runtime/project-agents`, `flow-bootstrap/candidate`,
  `flow-bootstrap/subflow-candidate` and `service/project-build`: "Test Files 250 passed (250);
  Tests 2322 passed (2322)".
- `node scripts/structure-audit.mjs`: "passed (351 warning(s), 1156 baselined)".
- `git diff --check`: exit 0. It printed only git's notices that line endings will be converted.

**Still open:** no live run. The two open items that were listed here (the builder's
description, and the judge reading only the plan's check) are closed by follow-up 2.

## Follow-up 2 (supervisor message: builder-proposed success check, end to end)

**What the builder is told.** In `flow-bootstrap/subflow-candidate/builder-loop.ts`, the
`core.submit_subflow` description now gets its success-check sentence from
`successCheckRule(scope)`:
- **The scope has a check:** the sentence is the same as before, character for character: "Its
  inputs, outputs and success check are the plan's; leave them out or write exactly those."
- **The scope has none:** the builder is told to propose one with its subflow as a
  `done when: <fact>` line, the script grammar's own term. The sentence says where the line goes:
  "outside every block, after its last step" for a subflow the router runs, or "inside its own
  `part <key>:` block, before its first step" for a callable one. It gives the format's own example
  (`done when: text t11 contains "Booked"`), and says the check becomes this subflow's and the
  trial is judged against it.

**What the judge reads.**
- `service/subflow-trial/types.ts`: the judge input gains an optional
  `successCheck: {check, from: "plan" | "builder"}`.
- `service/subflow-trial/run.ts`: the new `judgedCheck` fills it with the scope's check if there
  is one, otherwise with the check on the tried proposal's own subflow.
- `service/project-build/subflow-trials.ts`: the scoped judge's instruction prints
  "Its success check: ..." for a plan's check. For a builder's it prints "Its success check, as its
  builder proposed it (the plan gives none): ...".

**Tests:**
- `builder-loop.test.ts`: the description, in all three cases (router-run with no check,
  callable with no check, scope with a check).
- `scoped-submission.test.ts`: a callable subflow's `done when:` inside its part is carried onto
  the proposal.
- `service/subflow-trial/tests/run.test.ts`: the judge gets `from: "plan"` with the scope's check,
  and `from: "builder"` with the proposal's check. A proposal carrying the check still runs to
  `succeeded`.
- `project-build-facade.test.ts`: through the actual service, a builder that proposes
  `[{fact: "ended", op: "exists"}]` has every subflow-trial judge request carry the "as its builder
  proposed it" line, and the build is proposed.

**Commands and results:**
- `npx tsc --noEmit -p packages/fluxiq`: exit 0.
- vitest on `runtime/llm`, `runtime/project-agents`, `flow-bootstrap/candidate`,
  `flow-bootstrap/subflow-candidate`, `service/project-build` and `service/subflow-trial`:
  "Test Files 252 passed (252); Tests 2335 passed (2335)".
- `node scripts/structure-audit.mjs`: first one violation (an `as never` cast in my new
  builder-loop test). After replacing it with a typed constant: "passed (351 warning(s), 1156
  baselined)". After that fix, `subflow-candidate` was re-run: "7 passed; 39 passed". tsc was
  re-run: exit 0.
- `git diff --check`: exit 0.

## What changed and why

Evidence read: all four A8 round-1 runs.
- crossborder `run-mv7t07hx`, steps 0003-0018: 7 finds and 1 describe, one of the finds for the word "field".
- bigbox `run-mv7t19hg`: 10 looks trying to dismiss a consent layer or open a picker, then 5 refused `project.write_plan` calls (steps 0025-0034, refusals on `plan.router` missing, `subflows` not an array, `subflows.0.kind`, and `subflows.0.callable` twice).
- social `run-mv7t2xxc` and everything-store `run-mv7t4ozn`: 8 or more finds each before any plan.

**(1) Guidance** (`project-agents/supervisor/guidance.ts`)
- `howToWork` now states the role plainly: the supervisor does not operate the target, and builders explore and act.
- It plans from the task and a short look. It has at most 3 looks, after which looking is withdrawn. Anything the start page does not show belongs to a builder.
- The planning format replaces the raw-plan wording in the tool descriptions for `write_plan` and `dispatch`.
- The lending-library example is rewritten in the new format, with a sentence saying that finding the titles is p1's builder's work.
- New sets of strings:
  - `forward.*`: the next step for each build state.
  - `router.*`: the name and purpose of the subflow Core adds for the router to run.
- `surveyUnavailable` no longer says to look.
- The guidance guard test passes. I avoided the words it forbids, for example "feedback" (it matches `feed`) and "operating" (it matches `rating`).

**(2) Look budget**, done through the loop's existing look withdrawal:
- New loop input `planning?: { toolIds, lookBudget?, next() }`.
  - Type: `llm/evidence-progress/planning-tools.ts`, exported from the barrel.
  - Documented in `llm/loop-configuration.ts`; `resolveLimits` rejects a budget that is not a non-negative integer.
- `llm/decision-handlers/look-withdrawal.ts`:
  - Planning tools are never treated as looks.
  - New `looked(tool)` counts observe-only calls that ran and actually looked at something.
  - Once `lookBudget` is reached, `active()` stays true for the rest of the loop. A mutate does not bring looks back, because the supervisor has no act that would.
  - New `refusalCode()` refuses a look asked for after that point as `llm_evidence_loop.look_budget_spent`. The old `look_withdrawn` code, whose wording tells the model to "run an action", stays for the redirect rule.
  - New `automationStudioLlmEvidenceLookBudget()` puts a one-time `core.look_budget` note in front of the model, with `next` and the caller's sentence, and logs a `looks_withdrawn` row in the decision history.
- `llm/evidence-loop.ts` got three small edits (it is not in my list of paths; see open questions):
  - pass `planning` to the look withdrawal;
  - call the budget hook after each call that ran;
  - use `looks.refusalCode()` for a withdrawn look.
- Budget = 3, in `supervisor/look-budget.ts` with the reasoning: one find for what the task names, one look at how to reach it, and one spare. In every A8 run, the looks after the first one or two added nothing the plan used.

**(3) Redirects name the plan**
- `stall-redirect.ts` takes a new input, `forward` (filled in from `planning.next()` by `redirect-facts.ts`). When it is present, the redirect says the planning step in place of the draft sentences, adds `next: <tool>` and leaves out `draftStepsSoFar`.
- `decision-handlers/searching.ts`, the "searching without acting" note, also says the planning step and adds `next`.
- Loops without `planning` get exactly the same text as before. The candidate loop never sets `planning`, and its tests are unchanged and pass.
- `supervisor/planning.ts` chooses the next step from the build state: write the plan, then dispatch, then assemble, then test; after a "no" verdict, dispatch or amend the plan; after "yes", complete.

**(4) Planning format** (`supervisor/plan-input.ts`, `tools.ts`, `plan-tool.ts`, `brief-input.ts`, `state.ts`, `dispatch-tool.ts`)
- Input shape: `{ taskSpec, subflows: [{ key, name, purpose?, parts, inputs?, outputs?, after? }], reason? }`. A `structurePlan` field is refused as `project.unknown_field`.
- Compile rules:
  - One subflow with no inputs and no outputs becomes the router-run subflow itself.
  - Otherwise each subflow becomes a callable part (role utility) with ports `{id: name, name, valueType: unknown}`. Core adds a router-run `main` subflow (or `main_<n>` if that key is taken) with `partOf: []`.
  - `partOf` comes from `parts`. There is no success check.
- Every refusal path is in the planning format, for example `subflows.N.inputs.M`. Refusal codes:
  - `project.plan_subflow_key` and `project.plan_port_name`: the same naming rules as Core's bootstrap reader.
  - `project.plan_subflow_no_parts`, `project.plan_after_unknown`, `project.plan_after_cycle`, `project.duplicate_subflow`.
  - Unknown-part errors are remapped from `structurePlan.partOf.*` to `subflows.N.parts.M`.
- The `write_plan` answer gains `routerRuns` and an `after` list on each subflow.
- In `dispatch`, a brief's `entry` is optional, and so are `entry.predecessors`. Defaults: `observed-current`, and the plan's `after` for that subflow.
- **Contract edit, outside my paths:** in `project-agents/contracts/structure-plan.ts`, a subflow's `metadata` (its success check) is now optional. If `metadata` is present, it must still contain a non-empty check. Without this, the brief's rule that the supervisor writes no success check could not hold: the contract required a check, and a made-up fact would fail at the subflow's End when the Flow runs. A contract test was added for it.

**Tests**
- New: `supervisor/tests/plan-input.test.ts`, `plan-dispatch.test.ts`, `planning.test.ts`, and `supervisor-script.ts` (the shared scripted-provider runner, moved out of `supervisor-loop.test.ts`). The fixture now builds plans in the new format.
- New: `llm/decision-handlers/tests/look-budget.test.ts`.
- Added cases: `evidence-progress/tests/stall-redirect.test.ts` (3 cases) and `contracts/tests/structure-plan.test.ts` (1 case).

## Commands run and observed results

- `npx tsc --noEmit -p packages/fluxiq`: exit 0, no output (run after the final edits).
- `node scripts/structure-audit.mjs`: "structure-audit: passed (351 warning(s), 1156 baselined)".
  - The first run failed: one import cycle through a value import of `decision-context` in `look-withdrawal.ts`, and two direct imports of `planning-tools.ts` that bypassed the barrel. Fixed by dropping the supersede call (the note is shown only once) and importing through the barrel.
  - Warnings on files I touched are advisory only: the `supervisor/` folder has 22 files (threshold 15); `supervisor-script.ts` exports 13 values (threshold 8); `loop-configuration.ts` is 528 lines and `evidence-loop.ts` 800 (threshold 400).
- `npx vitest run` on `runtime/llm`, `runtime/project-agents`, `flow-bootstrap/candidate`, `flow-bootstrap/subflow-candidate` and `service/project-build`:
  - "Test Files 2 failed | 248 passed (250); Tests 7 failed | 2312 passed (2319)".
  - The 7 failures are all in `service/project-build/tests/project-build-facade.test.ts` (5) and `project-build-reset.test.ts` (2), each failing with `flow_bootstrap.evidence_repeat_without_progress` because the old plan is refused.
- Probe copies of those two tests with only the plan input converted: "Test Files 2 passed; Tests 8 passed". The probe copies were deleted.
- The look-budget replay (`planning.test.ts`) was run with a temporary dump:
  - The `core.look_budget` note appeared after look 3, with `next: project.write_plan`.
  - Every later look was refused `look_budget_spent` without running.
  - `core.no_progress` showed `next: project.write_plan` with the planning sentence and no draft wording.
  - The plan, once written, was dispatched, assembled, tested "yes" and completed.

Patch the supervisor needs in `service/project-build/tests/`:
```
project-build-reset.test.ts, in PLAN:
-  structurePlan: { plan: { router: ROUTER, subflows: [{ key: "main", name: "Main", role: "primary", ...CHECK }] }, partOf: { main: ["p1"] } }
+  subflows: [{ key: "main", name: "Main", parts: ["p1"] }]
project-build-facade.test.ts, in planInput():
-      structurePlan: { plan: { router, subflows: [{ key: "main", name: "Main", role: "primary", ...checked() }] }, partOf: { main: ["p1"] } }
+      subflows: [{ key: "main", name: "Main", parts: ["p1"] }]
-    structurePlan: { plan: { router, subflows: [{ key: "main", name: "Main", role: "primary", ...checked() }, callable("first"), callable("second")] }, partOf: { main: [], first: ["p1"], second: ["p2"] } }
+    subflows: [{ key: "first", name: "first", parts: ["p1"] }, { key: "second", name: "second", parts: ["p2"] }]
```
After the patch, `ROUTER`, `CHECK`, `checked`, `callable` and the `router` local in those tests become unused for the plan. Check whether lint or tsc's unused-locals setting objects; tsc did not complain in my probe run.

## Not verified

- No live run and no provider call. I don't know if a real model now writes the plan after 3 looks.
- The full suites (`pnpm check`, `pnpm test`, the whole of Core's vitest) were not run.
- A supervisor restarted on a build already in progress loses the plan's `after`: it lives only in run state, and the record has no field for it. That supervisor's briefs must name their predecessors.
- Whether a builder can actually propose its own success check when the plan has none: `flow-bootstrap/subflow-candidate/scoped-submission.ts` refuses `done when:` with `subflow.success_check_changed` when the plan has no check. So today such subflows simply have no check. Changing that is in `flow-bootstrap/**`, which I was told not to touch.

## Open questions or contradictions found

1. **The supervisor's system prompt is the builder's.** The crossborder request's system message says "You operate a real website ... To reach a product ... use the site's own search (type into its field[search] and submit)". That pushes directly against the role guidance. It comes from the domain or harness instructions (`service.ts` / domain), not from `project-agents/`, so I did not change it. Likely worth a follow-up.
2. These files were outside my list and edited out of need:
   - `llm/evidence-loop.ts`: 3 lines. Needed to connect the budget to the loop.
   - `llm/decision-handlers/searching.ts`: brief item (3) names the searching note.
   - `project-agents/contracts/structure-plan.ts` and its test: success check made optional; see above.
3. The supervisor still is not a discovery-only loop. If it were ever given a `budget`, its wrap-up would offer no tools at all. Today it has no budget, so this does not happen.
4. `service/project-build/tests/*` need the patch above before this merges.
