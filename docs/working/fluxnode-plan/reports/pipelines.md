# P7 Data pipelines: worker report

Worker: Sonnet 5.5, task t883 (branch `task/t883-data-pipelines`). Nothing committed.

## Outcome

Done. The engine side of the frozen data contracts exists in
`packages/fluxiq/src/framework/automation-service/service/pipelines/`, exported through the service barrel
(`service/index.ts`, one line added). No collision with existing exports (typecheck clean).

## What changed and why

- `expression/`: `evaluateExpression` for the 28 operators; no model, no code. Semantics: missing field is null; a
  test over unusable values is false; arithmetic over non-numbers or divide by zero is null; `if` and `coalesce` are lazy;
  truthy = not null/false/0/"".
- `steps/`: filter, transform (expression, or SDK callback in batches through the port), dedupe, join (inner/left,
  null never matches, left fields win or go under `as`), sort (null last both ways, stable), limit, aggregate (9 ops),
  validate (`drop`, or `reject` throwing `PipelineRejectedError` with every problem). `deriveRecord` adds one
  `derived` lineage entry (run, flow, step, pointers into the step input) to the lineage the record carried; capped at 64.
- `sinks/`: dataset (port), JSON/CSV file (`createDirectoryFileWriter(dir)` refuses anything outside `dir`),
  webhook (injected fetch, POST; re-checks the sink against the contract schema so credentials, non-https and
  `..` paths are refused; non-2xx fails the step), SDK callback (port).
- `map/`: `mapStep` over an injected `FlowCaller(target, inputs, signal)`, `runLimited` concurrency pool, incremental
  (`skipProcessedBy`, key remembered only after the call succeeded), cached (`reuseResultsForMs`, key = canonical
  target + inputs). Per-project storage is the `PipelineState` port; `createMemoryPipelineState` is the in-memory one.
  Call lineage is rebased under the `as` field.
- `run/`: `runPipeline` (direct runner: source, steps, input and output type checks) and `loadPipelineSource`
  (dataset = `read`, input = `input` with pointer, flow = the Flow's own lineage per record or a `read`).
- `compile/`: `compilePipeline` gives an `ExecutableGraph` (+ name, metadata.interface): source node, one node per
  step, edges for wiring, join right side on port `right`. A map is a node of `CALL_FLOW_NODE_TYPE`.
  `runCompiledPipelineFlow` walks that graph with the same executors.

## Commands run and observed results

- `npx vitest run src/framework/automation-service/service/pipelines` (from packages/fluxiq): 6 files, 39 tests passed.
- `tsc --noEmit --incremental` in packages/fluxiq (the `check` script's command): no output, no error. Free memory was
  3.0 GB beforehand (0.96 GB on one earlier reading, so I ran tests only until it recovered).
- `node scripts/structure-audit.mjs` from the worktree root: `structure-audit: passed (534 warning(s), 1097 baselined)`;
  none of the warnings are in `service/pipelines`. (An earlier run failed two `as-never` casts in my tests; fixed.)
- Same result from both paths is a test: `compile/tests/compile-pipeline.test.ts` runs an 8-step pipeline (filter, map, transform,
  aggregate, join by step, sort, limit, dataset sink, output type) both ways and compares records with lineage,
  datasets, counts, calls and stored rows.

## Not verified

- No real FluxNode runner, no real run-datasets store, no browser. All ports are faked in tests.
- Full `pnpm check` / whole fluxiq suite not run (plan: narrow gates only).

## Open questions or contradictions found

1. **Compiled node types are not registered.** `builtin.data.pipeline-source` and `builtin.data.pipeline-step` are
   named in `compile/node-types.ts` but not in the component registry (outside my paths). The existing `builtin.data.*`
   nodes (filter-list compares one field to one value; write-records needs a record-output schema) cannot carry a declared
   expression without changing what it computes, so none were reused. The graph is complete data, and
   `runCompiledPipelineFlow` shows how to run it; registering executors that call `executeDataStep` is the follow-up
   (P-runner lane). The Call Flow node's executor is the other lane's.
2. **No sink event in the contracts.** Only `transform_needed` exists; the SDK sink goes through `PipelineSdkPort.sink`
   and the runner must choose its event shape (suggest adding a `sink_records` event to the contract).
3. **Run datasets binding.** `writeDataset` and `readDataset` are ports; I did not wire `AutomationStudioRunDatasets`,
   whose API is batch-by-executor and not name-by-dataset. The runner lane decides the binding.
4. **Memory-only state.** `createMemoryPipelineState` forgets on restart, so incremental skipping lasts one process
   until the host supplies a persistent `PipelineState` (per project). Same-key duplicates inside one run are not
   skipped, because a key is marked only after its call succeeds.
5. **CSV formula injection** (a cell starting `=`, `+`, `-`, `@`) is not neutralised; RFC 4180 only.
6. Dedupe by `keep: "last"` keeps each record at its last position (not first-seen position).
