# W9: a person's Stop on a check halts the engine

## Outcome

Done. If a person presses Stop on a robot check during a saved Flow's run, the run now halts before the engine takes the check step's `failed` route. The fix is inside answer-first only. No engine change was needed.

## Phase 1: why no engine change is needed

- `engine/automation/step-loop/ask-or-park.ts:77-103`: Stop settles the person-needed ask and returns `proceed` with `routeOverride: "failed"`.
- `engine/automation/graph-run.ts:495-576`: after that, the engine only does bookkeeping. It skips state-routing, the failed-attempt ladder and before-next because a route override is set. It then chooses the edge (549), checks stop-after (571), sets `currentNode` to the edge's target (574) and records a region transition (576). None of these steps reach the site.
- `graph-run.ts:367-368`: the next pass of the loop checks `options.signal?.aborted` before it executes `currentNode`. If the signal is aborted, it returns a `cancelled` trace and the failed-route target never runs.
- `runtime/flow-authoring/bootstrap/verification/detached/execution.ts:136-138`: an aborted signal gives receipt `cancelled` and code `candidate.execution_cancelled`. `flow-run.ts` already reads that code as `{ kind: "stopped" }`.
- A Flow with no failed edge: `graph-run.ts:553` returns a failed trace, but the signal is aborted, so execution.ts still reports `candidate.execution_cancelled`. That case also reads as `stopped`.

So the change is: the port aborts the run's own signal before it hands Stop back to the engine.

What the run records: the check attempt keeps its ask as `answered` with route `failed` (`ask-or-park.ts:93`). The trace ends `cancelled` with "Run cancelled.", and its `currentNodeId` is the failed-route target, which never ran. `automationStudioAnswerFirstFlowRun` returns `{ kind: "stopped" }`. `flow-stage.ts` sees `personStopped` and returns `stopped_by_person`. `ports.arrived()` is not called on this path. That matches the existing attempt-Stop path, and `arrived` only matters to rounds that never run here.

## What changed and why

- `packages/fluxiq/src/framework/automation-service/service/answer-first/flow-run/flow-run.ts`
  - Lines 64-68: the run now has its own `halt` AbortController. The signal the run uses is `AbortSignal.any([attempt's signal, halt.signal])`, or `halt.signal` alone when the attempt has no signal. `stopped()` reads this signal.
  - Line 79: `halt` is passed to `run`.
  - Lines 96 and 107: `run` takes `halt` and gives it to the person-check port.
  - Lines 130-131: `gatedOptions` takes a signal that is always defined. The old `?? new AbortController().signal` fallback is gone because the new signal covers that case.
  - Lines 23-26: header comment updated.
- `.../answer-first/flow-run/person-check-port.ts`
  - Line 36: new required parameter `halt: () => void`.
  - Lines 51-58: on `AUTOMATION_STUDIO_PERSON_NEEDED_STOP_OPTION`, the port calls `person.stopped?.()`, then `halt()`, then returns the answer.
  - Lines 17-28: header comment updated (it used to say Stop goes down `failed`).
- `.../answer-first/attempt/flow-stage.ts`: unchanged. Its `personStopped` flag is still what turns `stopped_by_person` into the ending, because the attempt's own signal is not aborted.
- `.../answer-first/flow-run/tests/person-check-port.test.ts`
  - The port calls pass the new third argument.
  - The port-only Stop/Continue test also checks that `halt` runs once on Stop and never on Continue.
  - The test "a Stop on a check mid-run" now expects `{ kind: "stopped" }`. It used to expect `ran`/`reachedEnd: false`.
  - New describe block "a check whose step has a failed route that presses something" (about lines 202-252). It runs four saved steps: read; close prompt `on_failed` → step 3; press the card; read. It has three tests:
    - A control test: a plain failure on the prompt takes the failed route and presses the card. This shows the route really leads to a press.
    - Stop: the outcome is `{ kind: "stopped" }`, the card is pressed 0 times and there is 1 read.
    - Continue: step 4 passes, step 3 is `not_reached`, the card is pressed 0 times and there are 2 reads.
- New file `.../answer-first/attempt/tests/flow-stage-person-stop.test.ts`. It uses the real service, the real engine and a scripted model, with the same four steps kept as the task's best steps.
  - Stop: the attempt ends `stopped_by_person` with path `run_flow`, 0 card presses, 1 engine read, 0 decisions and 0 judge calls.
  - Continue: the attempt does not end as stopped, the card is pressed 0 times and there are 2 engine reads.

## Commands run and observed results

All vitest runs were from `packages/fluxiq` with `--maxWorkers 2 --minWorkers 1`, never at the same time as the typecheck.

- `pnpm exec vitest run .../flow-run/tests/person-check-port.test.ts .../attempt/tests/flow-stage-person-stop.test.ts` with the fix in place: `Test Files 2 passed (2)`, `Tests 14 passed (14)`.
- The same two files with `halt()` temporarily removed from the port (put back afterwards; a grep found no leftover markers): `Tests 4 failed | 10 passed (14)`.
  - Attempt Stop: `expected 1 to be +0`. The card was pressed after the person pressed Stop, which is the bug, reproduced end to end.
  - flow-run Stop on the failed-route Flow: `expected { kind: 'ran', reachedEnd: true, …(1) } to deeply equal { kind: 'stopped' }`. The run took the failed route through the press to its end.
  - Port Stop/Continue: `expected +0 to be 1`, because `halt` was never called.
  - Old three-step Stop test: `expected { Object (kind, reachedEnd, ...) } to deeply equal { kind: 'stopped' }`.
  - With the fix restored, the run printed `Tests 14 passed (14)`.
- `pnpm --filter fluxiq check` (from the repo root): build-cache step `fluxiq:check` ran tsc, `EXIT=0`.
- `pnpm structure:check`: `structure-audit: passed (531 warning(s), 1097 baselined).`, `EXIT=0`. None of the warnings name a changed file.
- Extra narrow check, because the signal is now derived for every run: `pnpm exec vitest run .../flow-run/tests/flow-run.test.ts` gave `Tests 23 passed (23)`.

## Not verified

- I did not run the other answer-first suites: `later-attempt.test.ts` (its Stop-during-run test also goes through the new signal), `saved-flow-road.test.ts`, the endings tests and the whole-package vitest. Only the flow-run tests beside the changed file were run.
- No live browser or Lab run.
- I did not exercise a check inside a called child Flow. By reading the code, the child receives the same signal and halts the same way (top of its loop, `child-bounds.ts`).

## Open questions or contradictions found

- This is a pre-existing problem, outside my scope. An `on_failed` saved shape (step N `on_failed` → N+1, then a step after both) never reads as reaching its end when the recovery step is not needed. With no check involved at all, the four-step Flow above ends `executor.graph.unvisited_nodes` ("The run reached an end with steps it never ran."), `reachedEnd: false`. The cause appears to be that the assembly adds no End node and `graph-run.ts:563` then requires every node to have been visited. This would push a saved Flow with an `on_failed` recovery into the rounds after every run where the recovery was not needed. Because of it, the Continue tests here do not assert `reachedEnd`. The lead should decide whether this needs its own task (assembly or engine).
- On Continue, the check step still reads `ran: "failed"` in steps-ran ("The page needs a person before the step can go on."), even though the run went on. This was already the case and is not touched here.

```text
Outcome: Done
Changed: packages/fluxiq/src/framework/automation-service/service/answer-first/flow-run/flow-run.ts, .../flow-run/person-check-port.ts, .../flow-run/tests/person-check-port.test.ts, .../attempt/tests/flow-stage-person-stop.test.ts (new)
Validation: `vitest run person-check-port.test.ts flow-stage-person-stop.test.ts` -> 14 passed (4 fail with halt() removed); `pnpm --filter fluxiq check` -> exit 0; `pnpm structure:check` -> passed, exit 0; extra `vitest run flow-run.test.ts` -> 23 passed
Not verified: other answer-first suites (later-attempt, saved-flow-road, endings), whole-package vitest, live/Lab, a check inside a child Flow
Report: C:/Users/osrs_/FluxStuff/fxwork/t877/!FluxIQ/docs/working/answer-first-plan/reports/live/lane-c/w9-stop-halts-engine.md
Notes: No engine change needed; the engine checks the run's signal at graph-run.ts:368 before the failed-route target executes.
Pre-existing, out of scope: an on_failed saved shape ends executor.graph.unvisited_nodes when its recovery is not needed (no End node).
```
