# P2b pipelines on the FluxNode runner: worker report

Worker: Sonnet 5.5, worktree `fxwork/t886/!FluxIQ`, branch `task/t886-fluxnode-runner`. Nothing committed.

## Outcome

Done, with one gap in the checks: the packages/fluxiq typecheck was not run (the brief reserved that slot), so type safety of the Core files rests on the vitest runs and on reading. The SDK typecheck and tests pass.

## What changed and why

### Runner (S = `packages/fluxiq/src/framework/automation-service/service`)

New directory `S/fluxnode/pipeline/` (barrel `index.ts`, one export per file):
- `registered-pipeline.ts`, `registered.ts`, `is-registered-pipeline.ts`: `FluxNodeRegisteredPipeline` (a registered FluxNode without `spec`, with `pipeline`), the union `FluxNodeRegistered`, and the guard.
- `run-fluxnode-pipeline.ts`: `runFluxNodePipeline`. Compiles with `compilePipeline`, runs `runCompiledPipelineFlow` with the ports bound below, returns a `FluxNodeRunOutcome`.
- `fluxnode-flow-caller.ts`: the pipelines' `FlowCaller` bound to the runner. A map or source `{ fluxNode: name }` finds the registered name, starts a **full child run** through the service's own `launch` (same registry, event log, `finish`, so replay at $0 when learned), waits for it, and returns its outputs and lineage. The child's `correlationId` is the parent's, else the parent's run id; the parent tells `step` events (`call.<childRunId>`) naming each child run. The parent's Stop stops the child in flight. A `{ flowId }` target throws `pipeline.unsupported_target`; a pipeline calling itself throws `pipeline.self_call`.
- `call-ended.ts` (`PipelineCallEnded`) and `spend.ts` (`PipelineSpend`): a call that ended other than achieved ends the pipeline the same way (budget_out, stopped, waiting_for_person with its `waitingFor`); cost is summed over calls; `path` is the furthest any call went (replayed when none went further, including no calls).
- `sdk-port.ts`: the pipelines' `PipelineSdkPort` over `transform_needed` / `transform_answer`. Chunks at 1000 records. A callback that raised, or no answer because of Stop, stops the pipeline.
- `datasets.ts`: sink datasets in memory (newest 64), the dataset reader for sources and joins.
- `result.ts`: `FluxNodeRunResult` for a pipeline: outputs are the final records' data, lineage moved to point at `/<index>/...`, datasets, `specHash` is the pipeline hash, `outputsType` inferred when no outputs type is declared. `achieved` with a declared type is `{ confirmed, by: "type" }`, otherwise `unverified`.
- `input-issues.ts`: the declared inputs checked at start, answered `invalid_inputs`.
- `fluxnode-pipeline-context.ts`, `directory-file-writer.ts` (moved here, see below).

Edited in `S/fluxnode/`:
- `owner-flows.ts`: `registerPipeline(pipeline)`, idempotent by name and `dataPipelineHash`, through a shared `registerNamed` (the same registry map as FluxNodes, so `{ name }` finds it). The Flow is created by `createFlow` and filed by `fluxNodeNameToFlowPath`; its metadata `fluxNode` holds `{ name, specHash, flowPath, pipeline }`, so `readBack` rebuilds it after a restart.
- `create-fluxnode-service.ts`: `register` and `start` take `pipeline` (no more "not yet"); `start` also runs a registered pipeline by name and resumes a pipeline run; `finish` dispatches to `runFluxNodePipeline` or `runFluxNode`. New optional source fields: `pipelineState`, `pipelineFetch` (default: the global `fetch`), `pipelineWriteFile` (default none).
- `run-registry.ts`, `flow-export.ts`: types widened to `FluxNodeRegistered`. `fluxnode-service.ts` is untouched.

### Executors (item 2)

Registry file: `packages/fluxiq/src/components/automation/data/index.ts` (the `dataNodes` array, which `components/automation/registry.ts` spreads into `builtinAutomationNodeDefinitions`). New directory `components/automation/data/pipeline/` with `source-node.ts` (`builtin.data.pipeline-source`, calls `loadPipelineSource`), `step-node.ts` (`builtin.data.pipeline-step`, calls `executeDataStep`), `node-context.ts`, `node-records.ts`, a barrel and a test. A node's execution context carries no ports, so a step needing one (map, dataset, file, callback) answers a `failed` result naming the missing port, and the records travel on the `records` port as `{ data, lineage }`. The FluxNode runner runs a whole pipeline with ports through `runCompiledPipelineFlow`, not through these nodes.

### SDK (`packages/sdk`, 0.1.0 to 0.2.0)

`FluxIQ.registerPipeline(built)`, `runPipeline<R>(built, inputs, options)`, `streamPipeline`, `resumePipeline`. The built callbacks are served over `transform_needed` (`options.transforms` over them); an achieved run's records are checked against the declared output type (`invalid_outputs` otherwise). New files in `src/client/`: `build-pipeline-run-request.ts`, `finish-pipeline-run.ts`, `pipeline-run-options.ts`, `pipeline-run-types.ts`, `with-run-options.ts` (extracted from `build-run-request.ts`). `DEFAULT_ENGINE_URL` is `http://127.0.0.1:3000`; README updated (address, pipeline section). The fake engine gained pipelines (register, run by name, resume) and `tests/fake-engine/pipeline-scenario.ts`. The `4780` left in `keys/signing/tests` is an arbitrary audience string, not the address.

## Decisions and deviations

1. **The compiled graph is stored in the Flow's metadata (`pipelineGraph`), not as nodes.** `saveFlow` refuses nodes on a top-level Flow ("Top-level orchestration Flows cannot own Nodes or edges", `flows/writer.ts:228`, until Flow unification lands). The run compiles from the registered pipeline anyway. When P6 lets a Flow own nodes, `pipelineFlowFor` should save `compiled.nodes` and `compiled.edges` and the editor will show it.
2. **The Node-only `createDirectoryFileWriter` moved** from `S/pipelines/sinks/` to `S/fluxnode/pipeline/` (exported from the fluxnode barrel). The audit's browser-imports rule failed because registering the executors in `components/automation` pulls the pipelines barrel, and the extension's browser bundle reaches it. Its test import was updated. Nothing else imported it.
3. **A sink reuses `transform_needed`** (the contracts have no sink event). The program runs its callback and answers; the runner ignores the answer's records. The SDK's sink wrapper answers with the records back, which is harmless.
4. **No failed ending.** A mapped call that is budget_out/stopped/waiting ends the pipeline the same way with the summed cost so far. The records of earlier steps are not kept ("with what it has" means cost and status only: `runCompiledPipelineFlow` does not expose partial records). A step that cannot run as declared (callback raised, port never given, outputs of the wrong type) ends `stopped` after a failed `step` event with Core's words; a rejected outputs type gives verdict `refuted` by `type`.
5. **Child runs get their own purse.** `request.options` overrides are passed to each child unchanged; the pipeline has no aggregate budget.
6. **Children that need a check or a person** raise `check_needed` / `person_needed` on their own run (named in the parent's step event), not on the parent's stream. A mapped FluxNode with `hasCheck: true` waits there. The test uses a FluxNode with no check.
7. **Same-Flow children run one at a time** (the registry serializes runs per Flow), so a map's concurrency over one FluxNode does not run attempts in parallel; the second record replays what the first learned.
8. **The two new builtin nodes are visible to the model's node catalog** (it reads the builtin registry). They are tagged `pipeline`. If the catalog should not offer them, a hide mechanism is needed in the catalog; none exists today.
9. Datasets and the incremental/cache state are in memory (`pipelineState` can be given); a restart forgets them.

## Commands run and observed results

All from `packages/fluxiq` unless noted.
- `node ../../scripts/vitest-groups.mjs --groups=parallel,real-sql src/framework/automation-service/service/fluxnode src/framework/automation-service/service/pipelines src/components/automation`: parallel group 29 files, 226 tests passed. real-sql group (after fixing one old assertion, below) 3 files, 15 tests passed: `pipeline/tests/pipeline-runs.test.ts` (5), `tests/fluxnode-registry.test.ts` (5), `tests/fluxnode-runs.test.ts` (5).
- `pipeline-runs.test.ts` proves: a pipeline maps the registered `library.find-loans` over two input records; outputs typed and equal to the two loan records; lineage entries at `/0/found/loans/0` and `/1/found/loans/0`; the first run made 2 model decisions in total (the second record replayed the first's learned Flow); registering again answers `created: false` and the same `dataPipelineHash`; running `{ name }` a second time made 0 model requests, `cost { calls: 0, tokens: 0, usd: 0 }`, path `replayed`. Also: SDK callbacks answered over `transform_needed` (transform and sink); callback error and unregistered FluxNode end `stopped` with a failed step; a child with a tiny budget ends the pipeline `budget_out` with a resume handle; a bad input is `invalid_inputs`; Stop during a waiting callback ends `stopped`.
- `src/components/automation/data/pipeline/tests/pipeline-nodes.test.ts` (3 tests, in the group above): both node types are registered once with an executor; running the compiled nodes one by one gives the same record data as `runPipeline`; a missing port is a failed result, not a throw.
- One existing assertion changed: `fluxnode-registry.test.ts` expected a pipeline `{}` refused as "not yet"; it now expects `register({})` refused `invalid_request`.
- packages/sdk: `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` -> exit 0. `pnpm test` -> `Test Files 18 passed (18)`, `Tests 88 passed | 2 skipped (90)` (the new `pipeline-run.test.ts` has 6).
- `node ../../scripts/vitest-groups.mjs --groups=parallel src/runtime/flow-authoring/bootstrap/plan src/runtime/llm/harness-options src/engine/automation` -> 147 files, 1338 tests passed (the two new builtin nodes change no model-catalog test).
- `node scripts/structure-audit.mjs` (worktree root) -> one violation, not mine: `[failure-as-empty] .../answer-first/caller/held.ts` line 27 (another worker's path). After my fixes (browser-imports, barrel imports, `pipeline-` prefix names) nothing else fails. It reported 4 violations of mine before the fixes.

## Not verified

- **packages/fluxiq `tsc`** was not run. Unchecked: `exactOptionalPropertyTypes` details in the new files (e.g. the `fetch` default, the `writeFile?: ... | undefined` field) and the union types in `create-fluxnode-service.ts`.
- A restart: `readBack` for a pipeline Flow is written but not tested.
- Whole-suite checks, the extension, live browser behavior, and the HTTP routes for `pipeline` requests (`packages/fluxiq/src/server/**` was off limits; its request parsing comes from the contracts, so it should pass `pipeline` through).
- A webhook sink with the real `fetch`, and a file sink with `createDirectoryFileWriter` through the runner (the sink tests are the pipelines lane's, at the port level).
- Only the parallel group ran for the catalog check below; the real-sql group of those directories did not.

## Open questions or contradictions found

- Flow unification (decision 1) is the blocker for showing a pipeline in the editor as nodes.
- Whether the catalog should hide `builtin.data.pipeline-*` from models (decision 8).
- A sink event in the contracts would remove decision 3.
