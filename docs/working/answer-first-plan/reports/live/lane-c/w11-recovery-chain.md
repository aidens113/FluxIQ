# W11: excuse an unneeded `on_failed` recovery from `executor.graph.unvisited_nodes`

## Outcome

Done. A Flow with an `on_failed` recovery branch no longer ends `executor.graph.unvisited_nodes` when the recovery was not needed. The engine now has a second named exemption that mirrors the optional-shape exemption. No assembly change and no End node. All acceptance checks pass. The answer-first person-check Continue case now reads `reachedEnd: true`.

One deviation from the brief's wording, made on evidence: the exemption is keyed on **where the run went** (from the step straight into its join), not on the step's attempt having `status: "succeeded"`. With a status guard the person-check Continue case still ended `unvisited_nodes`. On a person's Continue the engine keeps the step's attempt as `status: "failed", route: "failed"` and overrides only the route it follows (`engine/automation/graph-run.ts:495-528`, `routeOverride`). The debug trace showed attempts `s1 succeeded, s2 failed/failed, s4 (Merge) succeeded, s5 succeeded`, with s3, the recovery, unvisited. In the recovery shape the failure edge leads into the recovery and never into the join, so a step followed directly by its join went on by its success.

## What changed and why

All paths are under `C:/Users/osrs_/FluxStuff/fxwork/t877/!FluxIQ/packages/fluxiq/src/`.

- `engine/automation/step-skip/recovery-chain.ts` (new, lines 1-52). This file has one export, `automationStudioStepRecoveryChain(flow, node) -> { join, steps } | undefined`. It mirrors `guarded-group.ts`. It requires the node's `success` edge (via `chooseAutomationStudioEdge`) to go straight into a `builtin.control.merge`. It requires the node's `failed` edge to start a chain of at least one step that reaches that same Merge, where each step has a `success` way on and no `failed` route, with at most 32 steps and none revisited. The chain must not loop back to the node. A `failed` edge straight into the Merge is the optional shape, so the function returns nothing for it.
- `engine/automation/step-skip/index.ts` (lines 5-8 header, line 12 export). This adds the barrel line and a header mention.
- `engine/automation/graph-navigation/navigation.ts`:
  - Line 11 imports the new file directly, not through the barrel. This matches how `optional-step.ts` is imported, to avoid barrel cycles.
  - Lines 48-56 extend the header comment to name the recovery shape as the optional shape's mirror, with the W10 failure it fixes.
  - Lines 71-75 update the loop comment.
  - Lines 89-96 add the new exemption. For each attempt whose node has the recovery shape and whose next attempt is that shape's join, the chain's steps count as visited.
  - Nothing else changed: the optional exemption, the state-route, handler, zero-pass-loop and entered-later rules are untouched.
- `engine/automation/tests/graph-navigation/tests/recovery-branch.test.ts` (new, 11 tests, beside `optional-groups.test.ts`).
  - Positive cases: the recovery is not needed and the run goes on through the join. A two-step recovery is excused in full. A failed attempt sent on down the success route (a person's Continue) is excused. A step run on two passes is excused.
  - Control case: the recovery was needed and ran.
  - Negative cases, each still flagged: a run that stopped at the join, or before it. A recovery that does not rejoin the Merge. A failure branch that branches again. A step whose success detours before the Merge. A join that is not a Merge. A `failed` edge straight into the Merge is not a recovery chain.
- `runtime/flow-authoring/bootstrap/authoring/tests/draft-routing.test.ts` (lines 500-526, under "the Flow a derived graph makes when it runs"). The new test assembles three `dispatching` steps, with step 1 `on_failed -> d2`, and every dispatch succeeds. It expects dispatches `["renew", "confirm"]`, attempts `action, merge, action`, no failure code, and `trace.status` `succeeded`.
- `framework/automation-service/service/answer-first/flow-run/tests/person-check-port.test.ts` (lines 246-247). The Continue case now expects `reachedEnd: true`, and the "Not `reachedEnd`" comment is replaced.

## Commands run and observed results

All vitest runs used `pnpm exec vitest run <paths> --maxWorkers 2 --minWorkers 1`, from `packages/fluxiq`, one run at a time.

1. **Before the navigation change:** `recovery-branch.test.ts` and `draft-routing.test.ts`. Result: `Tests 4 failed | 37 passed (41)`.
   - Engine: "does not count the recovery as left behind...", "excuses a recovery of several steps..." and "excuses it on every pass..." each failed with `expected true to be false`.
   - Draft routing: "succeeds when every step does..." failed with `expected 'executor.graph.unvisited_nodes' to be undefined`.
   - All negative cases passed.
2. **First fix, with the `status === "succeeded"` guard:** the same two files plus `person-check-port.test.ts`. The engine and draft-routing tests passed. The person-check Continue case failed with `- "reachedEnd": true / + "reachedEnd": false`, steps `1 passed, 2, 3 not_reached, 4 passed`. A temporary debug print in `navigation.ts`, since removed, showed s2's attempt as `failed/failed`, followed by the Merge s4. I then removed the status guard.
3. **Exemption line disabled temporarily (`false as boolean && ...`), then restored:** `recovery-branch.test.ts` gave `Tests 4 failed | 7 passed (11)`. The four positives failed with `expected true to be false`, including the new Continue-shaped case. All negatives and the needed-recovery case passed.
4. **Acceptance run** -> `Test Files 24 passed (24)`, `Tests 220 passed (220)`. The test folders in the run:
   - `src/engine/automation/tests/graph-navigation/tests`
   - `src/engine/automation/graph-navigation/tests`
   - `src/framework/automation-service/executor/graph-navigation/tests` (holds `zero-pass-loop.test.ts`)
   - `src/engine/automation/step-skip/tests`
   - `src/framework/automation-service/executor/node-execution/tests`. This is the "executor/node-execution" folder: `already-in-state`, `already-in-state-rerun`, `cleared-layers-activity`.
   - `src/engine/automation/node-execution/tests`, added for completeness.
   - plus `draft-routing.test.ts` (31 tests) and `person-check-port.test.ts` (12 tests, Continue case included).
5. `pnpm --filter fluxiq check` (repository root) -> `{"build-cache":"build","step":"fluxiq:check",...,"ms":94613}`, `EXIT=0`.
6. `pnpm structure:check` (repository root) -> `structure-audit: passed (534 warning(s), 1097 baselined).`, `EXIT=0`. The only warnings naming a touched file are the advisory `[file-lines]` ones for `draft-routing.ts` (800 lines, not edited) and `draft-routing.test.ts` (711 lines; it was 684 before this change, so it was already past 400).

## Not verified

- No Lab run, no web build, and no full Core suite was run.
- No ordinary build trial and no playback of an `on_failed` Flow was run end to end. The engine path these share was exercised through `runAutomationStudioGraph` (draft-routing) and the answer-first service run (person-check-port).
- `steps-ran.ts` still reports the unneeded recovery step as `not_reached` (the person-check Continue case shows step 3 `not_reached`). Whether it should read `skipped` is a cosmetic follow-up outside this grant.
- Script-authored `on failed:` branches written by a model are not tested. If one has the same shape (success straight into a Merge, a non-branching failure chain rejoining it), it gets the same exemption.
- I did not add a check that a chain step is entered only from the chain. If a recovery step is also the target of another node's untaken edge, it is excused here too. The optional exemption has the same property, and the assembler never wires a recovery step that way (`draft-routing.ts:183-200` consumes it).

## Open questions or contradictions found

- Brief vs. evidence: the brief says "when such a step succeeded". On a person's Continue, the engine records the step as failed and still goes on by its success route. Keying on the attempt's status would have left the person-check Continue case failing, so I keyed the exemption on the transition into the join. The negative cases above show this does not widen the exemption to a run that took the failure route: that run's next attempt is the recovery, not the join.

```text
Outcome: Done
Changed: packages/fluxiq/src/engine/automation/step-skip/recovery-chain.ts (new); packages/fluxiq/src/engine/automation/step-skip/index.ts; packages/fluxiq/src/engine/automation/graph-navigation/navigation.ts; packages/fluxiq/src/engine/automation/tests/graph-navigation/tests/recovery-branch.test.ts (new); packages/fluxiq/src/runtime/flow-authoring/bootstrap/authoring/tests/draft-routing.test.ts; packages/fluxiq/src/framework/automation-service/service/answer-first/flow-run/tests/person-check-port.test.ts; this report
Validation: `pnpm exec vitest run <graph-navigation x3, step-skip, node-execution x2, draft-routing, person-check-port> --maxWorkers 2 --minWorkers 1` -> 24 files, 220 tests passed; `pnpm --filter fluxiq check` -> exit 0; `pnpm structure:check` -> passed (534 warnings, 1097 baselined), exit 0; the 4 new positives fail with the exemption disabled (4 failed | 7 passed)
Not verified: Lab/build-trial/playback end to end; steps-ran still says not_reached for the unneeded recovery; script-authored on-failed branches
Report: C:/Users/osrs_/FluxStuff/fxwork/t877/!FluxIQ/docs/working/answer-first-plan/reports/live/lane-c/w11-recovery-chain.md
Notes: The exemption is keyed on the run going from the step straight into its join, not on attempt status: a person's Continue keeps the step's attempt failed/failed (graph-run.ts:495-528), and a status guard left person-check Continue at reachedEnd false.
```
