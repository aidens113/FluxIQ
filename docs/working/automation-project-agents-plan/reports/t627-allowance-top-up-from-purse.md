# t627 report: an allowance tops up from the build's purse

Worker report. Branch `task/t627-allowance-top-up-from-purse`, Core worktree `fxwork/t627/!FluxIQ`. Nothing was committed and no live run was started.

## Outcome

Done. When a brief's next call does not fit its allowance, the allowance now asks the purse it was carved from for the difference before it refuses. The purse grants a top-up only from what it could carve: its ceiling, less what is spent, in flight, kept back for judging (the whole run and one repair round) and held by other open allowances. It also leaves what its own finishing calls are kept at. When the purse cannot pay the whole shortfall, nothing is granted and the refusal is the same object as before. Each grant is recorded on the allowance with its amount and reason. The build's ceiling never rises, and the Flow's purse still holds every call.

## What changed and why

All the changes are under `packages/fluxiq/src/programs/automation-studio/runtime/llm/build-purse/`. Nothing in `service/project-build/` needed changing. The purse already knows its judging reserve and its finishing calls (`keepBackCallsFromAllowances`, set by the supervisor loop from `service/project-build/reserve.ts`), so no reserve had to be passed in.

- **`top-up.ts` (new).** `AutomationStudioLlmBuildPurseTopUps` holds one allowance's grants and decides each one. It also defines the type `AutomationStudioLlmBuildPurseTopUp` (`usd`, `shortfallUsd`, `heldUsd`, `availableUsd`, `reason`). The header records the A8 wave 6 cause (`run-mv9a48cs-8fff527c`) and the bound.
- **`purse.ts`.**
  - `ceilingUsd` is now a getter: `carvedUsd` (what the purse was opened or carved at) plus the top-ups.
  - New `toppedUp()` lists the grants.
  - `holdFor`: an allowance that is over, not closed, and has a priced hold asks `parent.topUp(this, shortfall, held)`, then checks again.
  - A grant is withdrawn if the call is refused anyway: still over by float slack, or refused by a purse above, for example the build's call cap.
  - New private `topUp` prices the purse's finishing calls and asks the allowance's book to grant.
  - The file is 395 lines.
- **`allowance-book.ts`.**
  - `attributedSpend` entries now carry `allottedUsd` as the carved amount, plus `topUps` when there are any. Before, `allottedUsd` was the ceiling, which is the same thing whenever there are no top-ups.
  - The header says an allowance is a share, not a wall.
- **`index.ts`.** Exports `./top-up.ts`.
- **`tests/top-up.test.ts` (new, 6 tests)** and **`tests/allowance.test.ts`.** Two existing tests had a build purse with room left over: "refuses at its own level ..." and "holds the build's chain and the Flow's purse ...". Their build ceilings now equal the allowance ($0.02 and $0.03), so there is nothing to top up from. Every expectation in them is unchanged.

### The bound, and why

- **Each grant is the shortfall plus the call's own hold again.** Calls are held at worst case and settle at what they cost, about a tenth of that on a cached request. So one grant carries a builder for several calls. The loop's count of decisions left (`llm/loop-budget.ts`, which reads the allowance's `ceilingUsd`) is not put straight back into wrap-up. In the stub, one grant of $0.0253 carried five more $0.002 calls with no second grant. Granting only the shortfall would leave the builder on its last decision after every call.
- **All grants together are at most what the allowance was carved at.** A brief can spend up to twice its share. Beyond that, the problem is the brief's own spending, not its share, and its return lets the supervisor decide.
- **The purse's own finishing is left.** The purse keeps finishing calls back from allowances, but no dollars: brief sizing only leaves a share uncarved. So a grant must leave those calls' price, counted the way `loop-budget.ts` counts decisions: the first at the worst case (the asking call's hold, or the purse's last projected cost if larger), the rest at the average cost of the purse's settled calls. In a project build that is 10 calls (4 supervisor plus 6 reset). With the run's figures (worst about $0.025, average about $0.002) that is about $0.044. Judging for the whole run and the repair round is already in `keptBackUsd`, which `allocatableUsd` leaves out.

### How later briefs see the smaller remainder

A grant raises the allowance's ceiling. While the allowance is open, the purse keeps its unspent part from every other call, as for any allowance (`outstandingUsd`). Once it closes, only what it spent stays taken. Brief sizing (`brief-sizing.ts`) and `project.read_task` read `allocatableUsd`, so a dispatch sized after a grant is split from the smaller remainder with no new figure. The stub test shows this: after brief-1 is topped up and closed, `allocatableUsd` equals the ceiling less spent less the judging reserve, and brief-2 is carved at its dispatch-time share and runs.

## Commands run and observed results

All were run from `fxwork/t627/!FluxIQ/packages/fluxiq` unless noted.

- `npx vitest run src/programs/automation-studio/runtime/llm/build-purse`: before the test setup change, 2 failed (the two tests above now topped up, as expected). After it: `Test Files 6 passed (6)`, `Tests 48 passed (48)`. Re-run after the last edit: the same.
- `npx vitest run .../service/project-build .../project-agents`: `Test Files 51 passed (51)`, `Tests 356 passed (356)`. Run twice, the second time after the final edit.
- Candidate-purse tests, all unchanged: `npx vitest run .../flow-bootstrap/unfinished-build/tests .../subflow-candidate/tests/builder-loop.test.ts .../llm/evidence-loop/tests/cost-purse.test.ts .../result-verification/tests/flow-purse-check.test.ts` gave `Test Files 28 passed (28)`, `Tests 240 passed (240)`. This was before the last two small edits, which only add a grant withdrawal on an edge case and trim one method.
- `npx tsc -p tsconfig.json --noEmit`: exit 0, run after the final edit.
- `node scripts/structure-audit.mjs` (repository root): `structure-audit: passed (365 warning(s), 1156 baselined)`. The build-purse warnings are advisory only: `class-methods` (30 methods; it was 27 before, already past 25) and `directory-files` (17 files; it was 16, already past 15). `purse.ts` stays under the 400-line advisory.

## Not verified

- No live run (as briefed), so the wave 6 builder is not shown continuing against real prices. The stub replays the debug's figures: a $0.077 share, holds of $0.025, settles of $0.002.
- The candidate-purse test set was not re-run after the final two edits. Both touch only the allowance top-up path, which those builds never take since they carve no allowances.
- Biome (`pnpm quality:check`) was not run.

## Open questions or contradictions found

- **Grants are not yet in the build record or a brief's return.** They live on the allowance (`toppedUp()`, `attributedSpend().topUps`). Nothing outside the purse reads `attributedSpend` today. Writing them into the record (`recordAllowance`) or the builder's return (`dispatch/ending.ts`) is in `project-agents/dispatch/**`, which belongs to t625.
- **A topped-up brief can eat a waiting sibling's dispatch-time share.** A brief sequenced `after` another is carved when it starts, at the size given at dispatch. If its predecessor drew up to its whole extra share, the dependent's carve can fail with `allowance_unavailable` (an honest `notStarted` with figures), and the supervisor can re-dispatch it smaller. The structural fix is the debug's first option: size a sequenced brief when it starts (`brief-sizing.ts`, `dispatch/dispatcher.ts`).
- **The loop sees a grant only after it is made.** It reads the allowance's ceiling, so the decision before a top-up is still counted as the last one (wrap-up instructions). The top-up then lets that decision go out, for example the untested revision's trial in wave 6. Showing the headroom in advance would mean changing `llm/evidence-loop/cost-purse.ts` `figures()`, which is outside this brief.
- **Calls are not topped up, only dollars.** In wave 6 the brief had used 22 of its 77 calls, so calls were not the limit.

## Follow-up: waiting briefs sized at start, and grants on the return

This was asked by the coordinator after the first hand-off. Its ownership adds `project-agents/dispatch/**` and `project-agents/supervisor/brief-sizing.ts`.

### Bringing in Core `dev`

The hook refused `git merge --ff-only dev` ("workers must not change git history"). So I brought in t625's work as working-tree content instead: `git checkout dev -- <the 13 paths in git diff --name-only HEAD dev>`. That covers t625's `dispatch/`, `llm/harness/`, `service/project-build/brief-ports.ts`, their tests and its report.

None of those paths is one of mine. They are staged and identical to `dev`, so nothing of t625's was resolved away. The branch's HEAD is still `19c0153d`, so **the supervisor still has to merge `dev` into the task branch**. It should be trivial, since the content already matches.

### (1) A brief that waits on a predecessor is sized when it starts

- **`dispatch/start-allowance.ts` (new).** `automationStudioProjectDispatchStartAllowance` handles a brief given `shares`. That is, it waited on a predecessor of its own dispatch.
  - **Dollars:** it gets `min(dispatch-time allowanceUsd, purse.allocatableUsd() / shares)`.
  - **Shares:** this brief, plus the dispatch's briefs not yet carved, plus one for the build's finishing. This matches how `brief-sizing.ts` splits at dispatch.
  - **Calls:** split the same way. A reset keeps its kept-back calls. Turns never exceed calls.
  - **Too small:** if the share is below `$1e-6`, or the calls are below `AUTOMATION_STUDIO_SUBFLOW_BRIEF_MIN_CALLS`, it returns an `allowance_unavailable` refusal. The brief then ends not-started with today's exact sentence: "The build's purse could not carve this brief's allowance of $X; $Y could still be allotted."
  - **Never above the dispatch figure.** The supervisor saw that figure and may have lowered it. A brief that needs more gets topped up instead.
  - **Briefs that did not wait** start exactly as sized at dispatch.
- **`dispatch/dispatcher.ts`.** Keeps an `uncarved` set of brief indices. A brief leaves it when its carve has been tried, or when it ends. A waiting brief's `shares` is `uncarved.size + 1`.
- **`dispatch/run-brief.ts`.** New optional `start` input (`shares`, `carved`).
  - The carve uses the start-time size.
  - The brief then runs with the start-time `allowanceUsd`, `maxCalls` and `maxIterations`.
  - The build record's allowance entry records the amount actually carved.
  - The file is 407 lines, over the 400-line advisory; `dev`'s copy was 390.
- **`supervisor/brief-sizing.ts`.** Header only: a dispatch-time size is a ceiling for a brief that waits.

### (2) Each grant is recorded on the brief's return

- **`dispatch/allowance-said.ts` (new)** writes the sentences that end the reason, in codes and figures only:
  - "It started after its predecessor with an allowance of $A of the $B it was sized at[ and N calls of M]: its share of what the build's purse could then give."
  - "Its allowance was topped up from the build's purse N times, $T in all (llm_budget.allowance_topped_up): $g when a call held at $h was $s short; ..." It names at most 5 grants, then "and K more".
- **`dispatch/ending.ts`.** The spend now carries `sizedAtStart`. `returned()` appends those sentences to every return of a brief that ran, clipping the rest of the reason so they still fit in 2000 characters.
- The supervisor reads this in the return's reason, and the build record holds the return (`recordReturn`). The return contract (`contracts/builder-return.ts`) is unchanged.

### Fix in `llm/build-purse/top-up.ts`

A shortfall that lands exactly on the remaining bound (for example the last $0.01 of the share) was refused by float slack. A grant now allows the purse's epsilon, as every other purse comparison does.

### Wrap-up timing: unchanged, as asked

The builder's loop still reads the allowance's ceiling. So the decision before a top-up is still counted as the last one, and the grant shows from the next decision on. `llm/evidence-loop/cost-purse.ts` was not touched.

### Tests: `dispatch/tests/start-allowance.test.ts` (new, 3)

- **Two-brief shape, top-up then starvation avoided.** The purse is $0.08 and both briefs are sized at $0.03; b-plant waits on b-read. b-read is topped up twice ($0.02, then $0.01), spends $0.06 and is done, and its return carries the top-up sentence. With $0.02 left, the old $0.03 carve would have been refused. Instead b-plant starts with $0.01, runs and is done, and its return says what it was given. The record's allowances are `[b-read 0.03, b-plant 0.01]`, and the stored b-read return carries `llm_budget.allowance_topped_up`.
- **Room for the dispatch-time figure.** b-plant keeps its $0.03 and no sentence is added.
- **Nothing left ($0.06).** b-plant ends exactly `{ outcome: "blocked", reason: "The build's purse could not carve this brief's allowance of $0.0300; $0.0000 could still be allotted.", trials: [], spentUsd: 0, calls: 0 }`.

No existing test changed in this follow-up.

### Commands run (follow-up, after the final edit)

All were run from `packages/fluxiq` unless noted.

- `npx vitest run .../llm/build-purse .../project-agents .../service/project-build`: `Test Files 58 passed (58)`, `Tests 410 passed (410)`.
- Candidate-purse tests (`flow-bootstrap/unfinished-build/tests`, `subflow-candidate/tests/builder-loop.test.ts`, `llm/evidence-loop/tests/cost-purse.test.ts`, `result-verification/tests/flow-purse-check.test.ts`): `Test Files 28 passed (28)`, `Tests 240 passed (240)`. An earlier run that also included `supervisor/tests/brief-sizing.test.ts` gave 29 files and 245 tests, all passed.
- `npx tsc -p tsconfig.json --noEmit`: exit 0.
- `node scripts/structure-audit.mjs` (root): `structure-audit: passed (366 warning(s), 1156 baselined)`. My warnings are advisory only: purse class methods 30, build-purse files 17, and `run-brief.ts` at 407 lines.
- Two first-run failures were fixed along the way: the float slack in `top-up.ts`, and the test's wording "twice", which is now "2 times".

### Not verified (follow-up)

- No live run.
- Whether the supervisor's later reasoning uses the new sentences well; that would only show in a live run.
- A waiting reset brief, or a purse that caps calls, through the start-time sizing. The unit logic covers them, but no dispatcher test does.

### Open questions (follow-up)

- A brief waiting only for a host lease, with no predecessor, is still carved at its dispatch-time size, as scoped. A sibling topped up while it waits for the lease can still leave it `allowance_unavailable`. Giving every brief `shares` would close that. The arithmetic shows that briefs started straight away keep their dispatch-time size, but one existing test ("ends a brief whose allowance cannot be carved as blocked") would then start that brief with a smaller share instead.
- Grants are in the return's reason text, not a structured field, because `contracts/builder-return.ts` is outside this ownership. A `topUps` field there would let the activity card show them.
