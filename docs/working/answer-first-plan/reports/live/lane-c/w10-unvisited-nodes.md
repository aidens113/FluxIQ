# W10: why an unneeded `on_failed` recovery ends `executor.graph.unvisited_nodes`

## Outcome

Done (diagnosis only; no source edited). The answer is **both, read precisely**: the assembly builds no End node (for any routed Flow, not only answer-first), and the engine then applies its "every node must have run" rule, which has an exemption for the optional/`only_if` diamond but **not for its mirror, the `on_failed` diamond**. The engine rule is deliberate for general untaken branches, so the defect is the missing mirror exemption. It is not answer-first specific: every mode that runs a Flow assembled from a draft with `on_failed` (ordinary build trials, playback, Answer First) fails the same way whenever the recovery is not needed.

Recommended fix: engine side, a narrow mirror of the existing optional-shape exemption in `hasUnvisitedAutomationStudioNodes`. An assembly-side fix (append an End node) also works, but it is a weaker fix (see "Fix").

## What decides it (files and lines)

- `runtime/flow-authoring/bootstrap/authoring/draft-routing.ts:186-201` assembles `on_failed` as: step.failed -> recovery, step.success -> new Merge (`join`), recovery falls through to the join's `branches`, join -> next step. No End is added. Nothing under `runtime/flow-authoring/**` (non-test) emits `builtin.control.end`, and `normalizeAutomationStudioFlowBuildPlan` (`bootstrap/adaptation.ts:172-305`) copies the plan's nodes and edges only.
- Answer First uses that same assembler. `answer-first/flow-run/assemble.ts:33` calls `checkAutomationStudioFlowBootstrapCompletion`, which is also what the ordinary build (`service.ts:1603`), candidate submission (`bootstrap/candidate/submission/submission.ts:207`) and `attempt/draft-save.ts:32` call. `flow-run.ts:109` then runs it with `runAutomationStudioDetachedCandidate`, the same runner a build's trial uses.
- `engine/automation/graph-run.ts:563-569`: when the terminal node has no outgoing edge and is not an End, the run succeeds only if `!hasUnvisitedAutomationStudioNodes(...)`. Otherwise it fails with `executor.graph.unvisited_nodes`. `step-loop/already-done.ts:147` uses the same predicate.
- `engine/automation/graph-navigation/navigation.ts:56-85` (`hasUnvisitedAutomationStudioNodes`). Lines 59-76 exempt only "the optional shape's guarded success chain". That covers a node whose run **failed or was skipped**, whose `failed` edge goes into a Merge, and whose success chain reaches that Merge through steps that do not branch (`step-skip/optional-step.ts:29-35`, `step-skip/guarded-group.ts:32-50`). The comment at 62-63 says plainly: "General untaken branches, disconnected nodes and a mandatory continuation still count."
- Engine tests pin the general rule on purpose: `engine/automation/tests/graph-navigation/tests/optional-groups.test.ts:23-36` and `framework/automation-service/executor/graph-navigation/tests/zero-pass-loop.test.ts:78-84` ("still counts an untaken branch inside a loop that did run").

Why `only_if` passes and `on_failed` does not: the drafted `only_if` graph is `guard.failed -> join`, `guard.success -> act -> join`. That is exactly the optional shape, so when the guard fails the skipped `act` is exempt. `on_failed` is the inverse diamond, `step.success -> join` and `step.failed -> recovery -> join`. When the step succeeds, the recovery node is on an untaken branch that no exemption covers.

## Reproduction (scratch tests, run then deleted)

Both scratch files were uncommitted, named `zz-scratch-w10-unvisited.test.ts`, and are deleted. Afterwards `git status --short | Select-String zz-scratch` printed nothing.

1. `packages/fluxiq/src/runtime/flow-authoring/bootstrap/authoring/tests/zz-scratch-w10-unvisited.test.ts` (deleted). The shared draft assembler (`assembleAutomationStudioFlowDraftPlan`) and the shared engine (`runAutomationStudioGraph`) ran with no answer-first code. Command: `pnpm exec vitest run <file> --maxWorkers 2 --minWorkers 1` from `packages/fluxiq`. Result: `Tests 3 passed (3)`. Printed:
   - graph: `s1:failed -> s2:in`, `s1:success -> s3:in`, `s2:success -> s3:branches`, `s3:success -> s4:in` (s3 = `builtin.control.merge`, no End)
   - `ON_FAILED, recovery not needed: failed executor.graph.unvisited_nodes | attempts: s1:success s3:success s4:success | message: Node s4 completed without an outgoing edge before the Flow visited every node. Add an edge to continue or an End node to finish explicitly.`
   - `ON_FAILED, recovery used: succeeded`
   - `ON_FAILED + explicit End, recovery not needed: succeeded | attempts: ... s4:success end:end`
   - `optional` (step passes / fails) and `only_if` (guard passes / fails): all `succeeded`
   - a simulated mirror exemption (scratch-only code, see "Fix"): `today: true | proposed: false`. It still returns `true` for a run that stopped at the join, and for a recovery that does not rejoin.
2. `packages/fluxiq/src/framework/automation-service/service/answer-first/flow-run/tests/zz-scratch-w10-unvisited.test.ts` (deleted). This is the worker's four steps on the real service, with no check and no failure. The test assertion passed. The file was then failed only by the repository's real-SQL marker guard, which is harness metadata ("opened a real SQLite database ... without the real-SQL marker"). Printed:
   - `PLAN EDGES s2:failed -> s3:in | s2:success -> s4:in | s1:success -> s2:in | s3:success -> s4:branches | s4:success -> s5:in` (s4 = Merge)
   - `OUTCOME {"kind":"ran","reachedEnd":false,"steps":[{"position":1,"ran":"passed"},{"position":2,"ran":"passed"},{"position":3,"ran":"not_reached"},{"position":4,"ran":"failed","happened":"The run reached an end with steps it never ran."}],"failing":{"position":4,...,"code":"executor.graph.unvisited_nodes"}}`

## Other modes affected

All of them, for a Flow assembled from a draft step with `on_failed`. This follows from reading the code; only the engine-level run was exercised.

- Ordinary build trials: the same assembler, and the same `runAutomationStudioDetachedCandidate`. Its receipt is `failed` when the trace failed (`bootstrap/verification/detached/execution.ts:136-138`). The build model is then told it is a wiring fault: "Check the Flow's connections and required steps..." (`service/candidate-trial/feedback.ts:425`). The draft dry run excuses the recovery step (`draft/routing.ts:185`, reason `fallback`), but the judged whole run does not.
- Playback of a saved or published Flow: the same `graph-run.ts:563` rule on the same stored graph.
- Answer First: as above. Every normal run that does not need the recovery reads `reachedEnd: false`, so the attempt falls back to rounds.

## Fix

**Recommended: engine side, mirror the optional exemption.** It changes two files plus a barrel export.

- New `engine/automation/step-skip/recovery-chain.ts` (one export, beside `guarded-group.ts`; export it from the `step-skip` barrel). It returns `{ join, steps }` for a node whose `success` edge enters a `builtin.control.merge` directly and whose `failed` edge starts a chain of steps that do not branch (each has a `success` way on and no `failed` route), reaching that same Merge within the same 32-step bound. Otherwise it returns nothing.
- `engine/automation/graph-navigation/navigation.ts`, in the loop at 59-76: when an attempt **succeeded** on such a node and `attempts[index + 1]?.nodeId === join`, add the chain's steps to `visited`. Update the header comment (lines 27-55) to say so.

This keeps the rule's stated purpose ("an unreached node is a Flow that stopped early"). A recovery that was not needed is not owed work, which is what `draft-routing.ts:193` says: the recovery "runs when the step it recovers fails and at no other time". It also repairs graphs that are already saved, which an assembly change would not. The scratch simulation shows it excuses exactly the unneeded recovery and nothing else: a run that stopped at the join, and a recovery that does not rejoin, still count. By reading, the existing negative tests are unaffected. In `optional-groups.test.ts:35` and `zero-pass-loop.test.ts:78-84` the success target is a constant, not a Merge.

**Assembly-side alternative (possible, not recommended).** Append a `builtin.control.end` after the terminal node in `routeAutomationStudioFlowDraftSteps` (`draft-routing.ts`) or `assemble-draft.ts` when a step says `on_failed`. Scratch case 1 shows the engine then succeeds. Its costs:
- An End short-circuits the unvisited check for the whole frame (`graph-run.ts:563`), so it would hide any real unreached node in that Flow.
- It adds a node that every graph reader meets (step cards, `answer-first/flow-run/steps-ran.ts`, act claims, judge listings). `draft-from-flow.ts:115` and `repair-directive.ts:313` already strip Start/End.
- It does not fix Flows already saved without one.
- The library must offer the End node.

**Tests that would fail without the fix:**
- New `engine/automation/tests/graph-navigation/tests/recovery-branch.test.ts`, modelled on `optional-groups.test.ts`. The graph is `step.failed -> recovery -> join.branches`, `step.success -> join`, `join -> next`. Attempts `[step(succeeded), join, next]` should give `false`; today the result is `true`. Negative cases: `[step, join]` stays `true`, and a recovery that does not rejoin stays `true`.
- In `runtime/flow-authoring/bootstrap/authoring/tests/draft-routing.test.ts`, under "the Flow a derived graph makes when it runs" (around :470), add: three `dispatching` steps with step 1 `on_failed -> d2`, every dispatch succeeding, expect `trace.status` `succeeded`. Today it fails with `executor.graph.unvisited_nodes`, as reproduced above.
- Then tighten `answer-first/flow-run/tests/person-check-port.test.ts:242-250` (the Continue case) to expect `reachedEnd: true`, and remove its "Not `reachedEnd`" comment at :246.

## Commands run and observed results

- `pnpm exec vitest run src/runtime/flow-authoring/bootstrap/authoring/tests/zz-scratch-w10-unvisited.test.ts --maxWorkers 2 --minWorkers 1` (run twice; the second run added the simulation) -> `Test Files 1 passed (1)`, `Tests 3 passed (3)`. Output quoted above.
- `pnpm exec vitest run src/framework/automation-service/service/answer-first/flow-run/tests/zz-scratch-w10-unvisited.test.ts --maxWorkers 2 --minWorkers 1` -> `Tests 1 passed (1)`, then the suite failed on the real-SQL marker guard only. Output quoted above.
- Both scratch files were then deleted, and `git status --short` shows no `zz-scratch` file.
- No typecheck, no Lab, no mutating git.

## Not verified

- The proposed engine change itself: it was only simulated in scratch code, not written into `navigation.ts`, and no existing engine suite was rerun against it.
- I read the ordinary-build and playback impact from the code. I did not run a build trial or a playback of an `on_failed` Flow end to end.
- What `steps-ran.ts` reports for the not-needed recovery step once the run reaches its end (today: `not_reached`). Showing `skipped` there may be a cosmetic follow-up.
- Script-authored `on failed:` branches (the candidate path). Those are wired by the model, not by `draft-routing.ts`, and I did not test them. A detour that rejoins only through a Merge would get the same exemption.

## Open questions or contradictions found

- The engine's comment (`navigation.ts:62-63`) and its tests make untaken branches count on purpose. The fix therefore needs the lead to accept a second, named exemption. It sits beside the optional-shape, zero-pass-loop, handler and forward-state-route exemptions.
- The worker's W9 report blamed "no End node". That is true, but no draft-assembled Flow has an End. Straight-line, optional, `only_if` and repeat Flows all pass without one, so the End is not the defect.

```text
Outcome: Done
Changed: docs/working/answer-first-plan/reports/live/lane-c/w10-unvisited-nodes.md (report only; no source edited)
Validation: `pnpm exec vitest run <scratch authoring test> --maxWorkers 2 --minWorkers 1` -> 3 passed: on_failed with recovery unneeded = failed executor.graph.unvisited_nodes; with explicit End = succeeded; optional/only_if both ways = succeeded; simulated mirror exemption today:true proposed:false. Answer-first scratch -> reachedEnd:false, code executor.graph.unvisited_nodes (assertion passed; file then failed only on the real-SQL marker guard). Both scratch files deleted.
Not verified: the proposed engine change in source; ordinary-build trial and playback runs (read from code); steps-ran wording after the fix; script-authored `on failed:` branches
Report: C:/Users/osrs_/FluxStuff/fxwork/t877/!FluxIQ/docs/working/answer-first-plan/reports/live/lane-c/w10-unvisited-nodes.md
Notes: Fault = the engine's unvisited-node exemption covers the optional/only_if diamond but not its on_failed mirror; the assembler adds no End for any routed Flow.
Affects every mode that runs a draft-assembled on_failed Flow. Smallest fix: engine/automation/graph-navigation/navigation.ts plus a new step-skip/recovery-chain.ts.
An assembly-side End node also works, but it masks other unreached nodes and does not repair saved graphs.
```
