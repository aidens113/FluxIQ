# Step log page reader, passed explicitly

## Outcome
Done. Every loop that starts an evidence loop now receives the reader.

## What changed and why
- Removed `step-log/page-text.ts` (the module-level `Set`). Deleted in the working tree only (workers cannot `git rm`).
- New `step-log/page-reader.ts` (reader type). `automationStudioLlmStepLogTool(run, env, pageText?)` writes `page.txt` from it; none given means no file, no error.
- Loop option `stepLogPageText` (`loop-configuration.ts`), handed to the tool step by `progress-trace.ts`. Never read by the loop, never in a model request.
- `AutomationStudioNativeNodeRuntime` (native-node-runtime.ts, where the registration was, not importer-sdk.ts) keeps summaries per instance and exposes `stepLogPageText(evidence)`.
- Recovery: optional `stepLogPageText` on recovery ports (`annotation/ports.ts`), set in `service.ts` `recoveryPorts()`, passed `annotate.ts` -> `annotation/exploration.ts` -> `runtime-exploration.ts` into the exploration loop.

## Every place that starts an evidence loop or step-log tool
- Build loop and Flow-test replay tool (`service.ts`): passed directly.
- Candidate authoring loop, project build (`run.ts`, `brief-ports.ts`): get it through the `loop:` options in `service.ts`, which they spread. `brief-ports.ts` strips only purse, signal, budget, maxIterations, tools, executeTool, nodeOf from `draft.loop`, so builder and reset ports inherit it.
- Subflow builder loop, reset loop, supervisor loop: spread `ports.loop` / `input.loop`, so they inherit it; no edit in supervisor/**.
- Recovery exploration: newly threaded.
- `evidence-loop.ts` and `progress-trace.ts` are the only code that makes the tool step.

## Tests
- tool-step.test.ts: explicit reader; none means none; two runs with different readers in one process stay apart.
- native-node-runtime.test.ts: a runtime reads only its own summaries.
- recovery/tests/runtime-exploration-step-log.test.ts (new): seen failing with the threading line removed (`expected [] to deeply equal [ 'the page as the domain reads it' ]`), then restored.
- dispatch/reset/tests/loop-step-log.test.ts (new): reset loop writes page.txt from its ports.
- project-build/tests/project-build-brief-ports.test.ts: a real service build writes page.txt in supervisor steps, the builder brief's opening look and the reset brief's (two `tool-look` folders).

## Commands run and observed results
- vitest over step-log, evidence-loop/tests, native-node-runtime.test.ts, recovery/tests, dispatch/reset/tests, supervisor/tests (`--minWorkers 1 --maxWorkers 2 --reporter=dot`): 87 files, 966 tests passed.
- brief-ports test `-t "step log"`: 1 passed.
- check and structure audit: in the final return contract.
- Search for the old name in both worktrees: only a stale dist .d.ts and the history mention in reports/web-boundary.md.

## Not verified
- Reset and service-level tests were not seen failing before the threading: loops honour the option by spread, so a loop-level test passes regardless of the service. My mutation run removing it from `service.ts` never finished (hit the hang guard; stopped), so proves nothing. `service.ts` restored (4 occurrences of `stepLogPageText`).
- Two-runs test not run against the old registry (needs old code; no git stash in a shared tree).
- No live run.

## Open questions
- Brief named importer-sdk.ts; the registration was in native-node-runtime.ts.
