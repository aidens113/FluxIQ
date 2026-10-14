# t570-calls-and-defaults: project calls and brief defaults

Worker report for `### Brief: project-calls-and-brief-defaults`, worktree
`fxwork/t570/!FluxIQ`, branch `task/t570-project-calls-and-brief-defaults`. Nothing committed.

## Outcome

Done for items 1-4. Item 5 (the addendum on subflow-trial exclusion evidence) was dropped by the
supervisor partway through. I edited no file under it: no `read-account/**`, no `request-rows/`, no
`exclusion-evidence/`, no `verdict.ts`, no `service/subflow-trial/**`. My findings on it are under
Open questions, in case t574 can use them.

## What changed and why

**A cause the brief did not name (found in the evidence).** Builder loops ran without any budget.
`service/project-build/brief-ports.ts` removes the build's `budget` from the loop it gives a brief,
and `builder-loop.ts` never set one. In the evidence loop, `remaining = input.budget && ...` is
therefore always undefined. The result: no `core.budget` note ever reached a builder (I grepped
every `request.txt` in both runs and found none), and a builder never started its wrap-up, not even
by iterations. That explains the `llm_evidence_loop.iteration_limit` endings with no submission.

1. **Calls are carved the way dollars are** (`llm/build-purse/`)
   - `allowance-book.ts`:
     - A request's `maxCalls` is refused, with its figures, when it exceeds `from.allocatableCalls()`. The refusal now carries `requestedCalls` and `allocatableCalls`.
     - New `outstandingCalls(except)`: the calls each open, capped allowance has not yet spent.
     - New request flag `fromKeptBack`, which lets a reset brief carve from the calls kept back for it.
   - `purse.ts`:
     - `keepBackCallsFromAllowances(n)`: calls that no allowance may be carved from unless it says `fromKeptBack`.
     - `unspentCalls()`.
     - `allocatableCalls({fromKeptBack})`: unspent calls, less the judging reserve's calls, less what open allowances may still call, less the kept-back calls.
     - `callsLeft()`: the fewest calls left along the chain up to the top purse.
     - `holdFor` now also leaves other open allowances' unspent calls alone. The refusal carries `allottedCalls`.
     - `judgingFits` also leaves those calls.
   - `types.ts`: added `allottedCalls?` to the call refusal.
   - A purse with no allowances behaves exactly as before. A test checks this.
2. **The builder's wrap-up and budget note read its own allowance**
   - `builder-loop.ts` runs its loop with `budget: { countCalls: { keptForFinishing: 4 } }`. The 4 is the judge calls of the two trials the wrap-up can make.
   - Exported constants:
     - `AUTOMATION_STUDIO_SUBFLOW_FINISHING_JUDGE_CALLS` = 4.
     - `AUTOMATION_STUDIO_SUBFLOW_BRIEF_MIN_CALLS` = 5 wrap-up decisions + 4 judge calls = 9.
   - This needed three small edits outside the named files (flagged under Open questions):
     - `llm/loop-budget.ts`: an opt-in `countCalls` bound. It counts the purse's `callsLeft` less `keptForFinishing`, is never below 1 (the same rule as cost), shows `callsLeft` in the budget note, and validates the field.
     - `llm/evidence-loop/cost-purse.ts`: `figures()` adds `callsLeft` when some purse in the chain caps calls.
     - `llm/evidence-loop.ts`: a one-symbol addition to an existing re-export line (the wrap-up constant), so that builder-loop imports it through an allowed path.
   - Budgets without `countCalls`, which includes every candidate build's, are unchanged.
3. **Core sizes briefs** (new `project-agents/supervisor/brief-sizing.ts`, exported from the barrel)
   - What can still be given is split into equal shares. The shares are:
     - each brief being sent;
     - each plan subflow that has parts, has no done proposal and is not in this request;
     - one more share for the build's own finishing.
   - Money is split from `allocatableUsd()` and calls from `allocatableCalls()`.
   - A reset gets the calls kept back for it, less the supervisor's own finishing decisions.
   - If the supervisor writes `allowanceUsd` or `maxIterations` above the share, the share stands. Below the share, its figure stands.
   - `maxIterations` defaults to the call share, or to 30 when the purse caps no calls.
   - The dispatch is refused (`project.allowance_unavailable`, with `canGiveUsd`, `canGiveCalls` and `shares`) only when a share has no money, or has fewer calls than a builder needs to finish (9; 2 for a reset).
   - Changes in the other files:
     - `dispatch-tool.ts` sizes the briefs before reading them, and each compact return carries `given: {allowanceUsd, maxIterations, maxCalls}`.
     - `brief-input.ts` applies the sizes.
     - `tools.ts`: `allowanceUsd` and `maxIterations` are now optional, and `permittedActs` is removed.
     - `guidance.ts`: step 3, the dispatch description and the `allowanceUnavailable` wording are updated.
     - `read-task.ts`: `money` shows `canGiveCalls`.
     - `ports.ts` adds `finishing`, and `supervisor-loop.ts` calls `keepBackCallsFromAllowances(supervisorCalls + resetCalls)`.
     - `service/project-build/reserve.ts`: `AUTOMATION_STUDIO_PROJECT_BUILD_FINISHING_CALLS` = {supervisorCalls 4, resetCalls 6}. `run.ts` passes it in.
     - `brief-calls.ts` uses `brief.maxCalls` when set. Otherwise it falls back to the old three calls per turn.
     - `run-brief.ts` passes `fromKeptBack` for a reset, and its carve-refusal reason names the calls.
     - `contracts/subflow-brief.ts`: new optional `maxCalls` field (a whole number of at least 1, at most 10,000).
4. **Core derives `permittedActs` from the parts.**
   - `brief-input.ts` always sets them to the union of the parts' `lastingActs` from the task spec, and to none for a reset.
   - Anything the supervisor wrote is ignored, so `project.brief_act_not_asked` can no longer be reached from a dispatch.
5. **The brief shows its exact interface lines** (`builder-loop.ts`, submit tool description)
   - It names the brief's parts in the person's words and says that other parts belong to other builders.
   - For a callable subflow it gives the exact lines: `part <key>: <what it does>`, then `  input: <name>` for each input and `  output: <name> = $step.<label>.<output>` for each output. It no longer offers a JSON plan for a callable subflow, since that path is refused for one.
   - For a router-run subflow it says to write the steps outside every block.
   - The success-check rule lost its wrong "leave them out" advice for inputs and outputs. A callable part that leaves out its `input:` lines is refused, which is the crossborder refusal.

Tests added or changed:
- New:
  - `service/project-build/tests/project-build-call-shares.test.ts`: the definition-of-done stub. It uses the real dispatcher and the real builder loop on a 64-call purse, with the supervisor having spent 3 calls planning. Three briefs are sent with no money, turns or acts, and each is sized to 11 calls. Each builder explores until its calls-based budget note says it is wrapping up, then submits, runs its trial (two judge calls) and completes inside its share. Afterwards the judging fits, a reset can be carved, and the callable brief's description shows `part open_packet: <what it does>\n  input: packet\n`.
  - `supervisor/tests/brief-sizing.test.ts`.
- Added to existing files:
  - `allowance.test.ts`: call carving, outstanding calls, and the purse with no allowances being unchanged.
  - `loop-budget.test.ts`: the `countCalls` bound, and its absence leaving the result unchanged.
  - `subflow-brief.test.ts`: `maxCalls`.
  - `builder-loop.test.ts`: the brief words and the budget.
- Updated:
  - `supervisor-loop.test.ts`: a request of 0.35 is now lowered to its share (0.1495), not refused, and a brief with no figures is sized.
  - `plan-dispatch.test.ts`: the parts' acts are now permitted, so a reset runs before the test, and a new assertion checks the derived `permittedActs`.
  - `builder-loop.test.ts`: the success-check wording.
  - `dispatch-fixture.ts`: a `maxCalls` option, and briefs that can be sized after the record exists.

## Commands run and observed results

- `npx tsc --noEmit -p tsconfig.json` in packages/fluxiq: no output (passed).
- `pnpm --filter fluxiq check`: completed (`build-cache ... step fluxiq:check`), no errors.
- `npx vitest run` over project-agents, service/project-build, llm/build-purse, flow-bootstrap/subflow-candidate, service/subflow-trial, llm/tests, llm/evidence-loop, flow-bootstrap/candidate and activity/project: 114 files, 1223 tests passed.
- `npx vitest run` over llm (all of it), service/flow-bootstrap-commands and flow-bootstrap/unfinished-build: 246 files, 2305 tests passed.
- `node scripts/structure-audit.mjs`: exit 0, "passed (352 warning(s), 1156 baselined)". The first run had two barrel-import failures, which I fixed.
- I did not run the root `pnpm check`, under the rule that full suites run at most twice a day.
- No model-provider call and no live run.

## Not verified

- Live behaviour. Whether real builders now submit within their share, and whether 64 calls is enough for a four-subflow plan like bigbox: its first dispatch sizes to about 9 calls per brief, which is exactly the minimum.
- The production path where the creation purse caps no calls (`testCalls` undefined): there only dollars are sized, turns default to 30, and the call cap falls back to three calls per turn. This path is covered only by unit tests.
- Service-level wiring of `finishing` through `run.ts` into a real build. It compiles, but no test drives it through the service.

## Open questions or contradictions found

- **Files outside the named list.** I edited `llm/loop-budget.ts` and `llm/evidence-loop/cost-purse.ts` (opt-in additions only), plus a one-symbol re-export in `llm/evidence-loop.ts`. The builder's wrap-up cannot read its allowance's calls any other way. I did not touch `service.ts` or `flow-bootstrap/candidate/**`.
- **Task-spec quality.** Crossborder's parts said `modify_existing` for an Add to cart. Deriving acts from the parts now permits exactly that, so a builder's `create_new` press would still go to the person's gate. Better acts in the task spec are the supervisor's guidance problem, not something sizing can fix.
- **"Not yet dispatched"** is read as "plan subflows with parts and no done proposal". That includes a subflow that came back blocked, since it needs a share again.
- The supervisor's own loop also gets no budget note (`run.ts` removes `budget` too). This was not in scope.
- **Item 5, for t574.** Both trials already share the same evidence builder (`automationStudioCandidateTrialSummary`) and the same judge (`automationStudioBuildTestJudge`). Replaying the run-mv7vmvhd judges offline with the dist build showed two judge-side causes:
  - Judges quoted the request's words in a different sentence from the one naming the rows.
  - In 0072, an empty `""` value in the reply shifted the quote pairing in `request-rows/unquoted-rows.ts` (`quotesOf`). Removing `""` turns 0072 into a pass.

  I made no edit there.
