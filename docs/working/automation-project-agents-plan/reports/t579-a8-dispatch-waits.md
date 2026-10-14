# t579 a8-dispatch-waits-for-passing-predecessor

## Outcome

Done. Bigbox debug cause B, fix 3 is in place: a dependent brief now starts only after each of its predecessors in the same dispatch came back `done` with a proposal.

## What changed and why

- `packages/fluxiq/src/programs/automation-studio/runtime/project-agents/dispatch/dispatcher.ts`
  - The old rule held a waiter back only when its predecessor ended `blocked`. The new rule holds it back unless every predecessor came back `outcome === "done"` with a `proposal` (`passed()`).
  - `ending.ts` returns `done` with a proposal only when the latest trial answered yes. That makes done-with-proposal the only return whose subflow `proposals.ts` keeps as passing. Every other predecessor return leaves the dependent's trials answering `subflow.trial_predecessor_missing`.
  - A held-back waiter ends through `ending.notStarted`: `blocked`, nothing spent, no trials. Its reason names the predecessor brief and subflow, and says why it holds the waiter back. The three possible whys:
    - `ended blocked`
    - `ended partial: its revision N stands, but no trial of it answered yes`, or `ended partial with no proposal of its subflow`
    - `ended done without a proposal of its subflow` (for example a reset)
  - Each reason also carries the predecessor's own reason, clipped to 600 characters. This lets the supervisor see the cause, which it could not in dispatch 2 of the bigbox run.
  - The header comment is updated to state the rule.
  - Concurrency, leases, cycles and stop handling are unchanged.
- `.../dispatch/tests/dispatcher.test.ts` has four new stub tests:
  - The predecessor ends partial because its trial answered `no`. The dependent ends blocked with 0 calls, $0 and no trials. Its reason names b-read/list_seeds, the "no trial of it answered yes" wording, and the predecessor's "latest trial answered no". It never started.
  - The predecessor ends partial and untried (`trial: undefined`). The dependent is held back.
  - The predecessor is a reset brief that ends `done` with no proposal. The dependent is held back with "ended done without a proposal of its subflow", and no builder ran.
  - A passing predecessor releases its dependent: start b-read, end b-read, start b-plant, end b-plant, both done.
- The existing capacity-2 test still passes unchanged: two at once, the dependent waits, `mostAtOnce` is 2. So does the existing blocked-predecessor test.

## Commands run and observed results

- `npx vitest run src/programs/automation-studio/runtime/project-agents` (in packages/fluxiq) -> `Test Files 23 passed (23)`, `Tests 182 passed (182)`.
  - On the first run the reset stub had `tools: []` and failed with `llm_evidence_loop.invalid_configuration`. I fixed the test stub (a tool is now declared) and reran.
- `npx vitest run src/programs/automation-studio/runtime/service/project-build` (a neighbouring consumer, as a sanity check) -> `8 passed`, `27 passed`.
- `npx tsc --noEmit -p .` (packages/fluxiq) -> no errors, exit 0.
  - The first run had one TS2322 in my own test: removing `trial` from the outcome type. I fixed it by setting `trial: undefined` and reran clean.
- `node scripts/structure-audit.mjs` -> `structure-audit: passed (356 warning(s), 1156 baselined).`

## Not verified

- No live or Lab run, as the brief directs.
- Full suites not run.
- No check that the supervisor's prompt makes good use of the new reasons.

## Open questions or contradictions found

- The rule looks only at predecessors inside the same dispatch, as `dependencies.ts` already did.
  - Case 1: in a later dispatch, a predecessor brief ends partial, but an earlier dispatch had already produced a passing proposal for that subflow. `proposals.ts` still holds the earlier passing proposal, so the dependent could in fact have been trialled. Holding it back there is conservative.
  - Case 2: a predecessor subflow that is not in the dispatch and never passed is not waited on, so the dependent still starts. Closing either case needs the passing-proposal state passed into the dispatcher, which lives in `service/**` and is out of scope.
- These still describe the old "ended blocked" rule and may need updating by the supervisor:
  - `docs/working/automation-project-agents-plan.md`
  - `docs/working/automation-project-agents-plan/reports/t542-a5b-dispatcher.md`

## Follow-up: predecessors outside the dispatch, and earlier passes

### Outcome

Done. This closes the cross-dispatch gap from the open questions above.

### What changed and why

All changes are in `dispatcher.ts` and its test.

- **The rule comes from the build record.** `earlierReturns(view)` reads the record view the dispatcher already loads at dispatch start, from `view.record.briefs` and `view.returns`. It indexes the returns by subflow, in `recordedAt` order, and keeps two things:
  - which subflows have a return that is `done` with a proposal;
  - each subflow's latest return, used for the reason.
  - That return is the same "passing" test as `passed()`, because `ending.ts` returns done with a proposal only when the trial answered yes.
  - Nothing is imported from `proposals.ts`. Its passing map is an in-memory object inside `service/project-build/run.ts` and is not reachable from the dispatcher without editing `service/**`.
- **A predecessor outside this dispatch** is one named in `entry.predecessors` that is neither the brief's own subflow nor any brief's subflow in this dispatch.
  - If no earlier return of it passed, the dependent ends `blocked` at once: `notStarted`, nothing spent, no wait.
  - The reason reads: `Subflow <key>, which this subflow starts after, is not in this dispatch and has no proposal whose trial answered yes: <why>.`
  - `<why>` is either `its latest brief, <id>, ended partial: ...` (the same wording as before, plus that brief's own reason) or `no brief of it has returned in this build`.
  - If an earlier return passed, the dependent starts.
- **An earlier pass also counts for a predecessor inside this dispatch.** A dependent is released once its predecessor subflow either passed in this dispatch or passed earlier in the build. This matches `proposals.ts`: `passed` is set only on yes and is never cleared, so a later failing revision does not take away an earlier pass. The dependent still waits for the in-dispatch predecessor to end, as before.
- **Four new tests in `tests/dispatcher.test.ts`:**
  - A predecessor outside the dispatch that has never returned: blocked, 0 calls, $0, no builder ran, exact reason checked.
  - A predecessor that ended partial (trial `no`) in an earlier dispatch: the dependent in a second dispatch is blocked, and the reason names b-read and its partial why. Only b-read ever ran.
  - A predecessor that passed in an earlier dispatch: the dependent in a second dispatch starts and ends done.
  - An earlier pass of list_seeds, then a second dispatch with a retry of list_seeds that ends partial plus the dependent: the dependent starts after the retry ends and comes back done.

### Commands run and observed results

- `npx vitest run src/programs/automation-studio/runtime/project-agents src/programs/automation-studio/runtime/service/project-build` (packages/fluxiq) -> `Test Files 31 passed (31)`, `Tests 213 passed (213)`. Run twice: before and after removing an unused script from the first new test.
- `npx tsc --noEmit -p .` (packages/fluxiq) -> no output, `tsc exit 0`.
- `node scripts/structure-audit.mjs` -> `structure-audit: passed (356 warning(s), 1156 baselined).`
- I tried biome on the dispatch directory. Biome's config ignores that path ("No files were processed"), so it was not linted.

### Not verified

- No live or Lab run.
- I did not check the wiring in `service/project-build/run.ts`, where the record and the in-memory `proposals` map are both used in one process. The two can disagree if a build's process restarts:
  - The record keeps the returns, but a new `AutomationStudioProjectBuildProposals` starts empty. The dispatcher would then release a dependent whose trials still answer `predecessor_missing`.

### Open questions or contradictions

- **A partial return can hide an earlier pass.** If a brief's revision 1 trial answered yes and its revision 2 answered no, the brief returns partial. `proposals.ts` still holds revision 1 as passing, but the record has no verdicts, only receipt digests. So the dispatcher holds the dependent back, which is conservative.
  - An exact rule needs the passing state handed to the dispatcher: an optional `passing(subflowKey)` on `AutomationStudioProjectDispatcherInput` in `types.ts`, wired from `run.ts`, or verdicts kept in the return.
  - This does not have to live in `proposals.ts`, which already exposes the state. It needs a `types.ts` field and the `run.ts` wiring (owner: t580 or the supervisor).
- **Stale sentences** (not edited, as instructed):
  - `packages/fluxiq/src/programs/automation-studio/runtime/project-agents/dispatch/dependencies.ts:5-6`: "A predecessor that is not in this dispatch was built earlier and is not waited on." It is still not waited on, but the dispatcher now holds the dependent back unless that predecessor passed.
  - `docs/working/automation-project-agents-plan/reports/t542-a5b-dispatcher.md:46` ("ends `blocked` without starting if a predecessor ended `blocked` or it is in a ring") and `:71` ("a predecessor that ended `blocked` stops its dependent").
  - `docs/working/automation-project-agents-plan.md:244-247` (`Concurrent dispatch`) says only that briefs queue in dependency order. It could add that a dependent starts only after a passing predecessor, from this dispatch or an earlier one. Lines 425-434 are the t579 brief itself, so they are not stale.
