# k6-iteration-and-variables: run-scoped variables, For Each, Write Records, dotted paths

## Outcome

**Done.** K6 per `reports/k-datasets-execution.md` §4 K6, with CD18:

- Runtime variables are **run-scoped**: one map per graph run, seeded once from
  `options.variables`, so a `set-variable` write reaches the nodes after it. A
  Call Flow child gets its own map, seeded from the same options, so neither
  side sees the other's writes.
- A node can keep an **iteration state** under its own id for as long as the run
  executes (`AutomationNodeIterationState`, `context.iteration`).
- New **`builtin.control.for-each`** (`body`/`done` branches, `item`/`index`/`count`
  data outputs, `maxIterations` default 100 and ceiling 10,000,
  `maxStepsPerIteration` default 50).
- The executor grants **`maxStepsPerIteration` more steps per body pass**, under a
  whole-run ceiling of **100,000 steps** that also caps what a caller asks for.
- New **`builtin.data.write-records`** emitting `records.write`, which the executor
  captures itself, with no dispatcher, under a `batchKey` built exactly as a
  dispatched batch's.
- `$state` paths reach a recorded node's dotted id through a
  **longest-own-key-prefix** lookup.

Checks: the K6 acceptance command passes, 193 of 193 (146 before this work);
`pnpm --filter fluxiq check` is clean (exit 0); the structure audit's only
failure is `docs/working/README.md`, which this brief does not own, identical on
a rerun; every mutation was observed red on real source and every file restored.

## What changed and why

`AS/` is `packages/fluxiq/src/programs/automation-studio/`.

### `AS/nodes/contracts.ts`
- **`AutomationNodeIterationState`**: `{ items: JsonValue[]; index: number }`.
- **`AutomationNodeExecutionContext.iteration?`**: `{ get(), set(state?) }`, bound to
  the node's id by the executor; `set()` with nothing clears the state. Absent
  when a node is executed outside a graph run, which For Each refuses.
- `variables` is documented as the run's one map.

### `AS/runtime/executor/run-state.ts`
- `automationStudioRunState(options)` now takes the execution options (K4a left
  it parameterless and noted K6 would add this) and returns `records`,
  `variables` (seeded from `options.variables`), and `loops` (by node id).

### `AS/runtime/executor/node-execution.ts`
- The execution context gets `variables: runState.variables` in place of the
  per-node `new Map(...)`, and `iteration` bound to `node.id`.
- `dispatchAutomationStudioEffects` walks the result's effects by index. A
  `records.write` effect is **not** offered to any dispatcher: it is captured from
  the effect itself, and the effect the attempt keeps is replaced with the one
  capture returns. Every other effect takes the dispatcher path unchanged; with
  no dispatcher bound those effects are skipped, as before.
- `withStoredBatch` now holds the hook call, the persist failure, and the
  recording of rows for both capture paths. A written batch that the hook
  refuses fails with `record_output.persist_failed` and the message
  "The records could not be saved." (the dispatched path keeps K4a's wording).

### `AS/runtime/executor/record-capture.ts`
- New `captureAutomationStudioWrittenRecords({ effect, nodeId, attemptId, callFlowAttemptPath })`
  returns `{ result, effect, batch? }`.
  - The record output is parsed as K3 parses one, with `recordsPath` replaced by
    `records`: a `records.write` effect carries its rows itself, so an authored
    path is ignored (the parser requires one, so a path is substituted rather
    than made optional).
  - Rows are validated by the same allowlist copy, written to `outputs.records`,
    and put back in the effect as **the same array**, so the saved trace replaces
    them with a `$dataset` marker by identity.
  - **Beyond the report's text:** when nothing is captured (an invalid or
    `encrypt` record output, or `records` that is not a list) the effect's rows
    are withheld. Without this the raw rows, excluded fields and all, reach the
    saved trace through `attempt.effects` and the trace's own `effects`, which
    CD14 forbids. A payload that is not an object is withheld whole.
  - Failures: `record_output.invalid` / `record_output.encrypt_unavailable` /
    `record_output.records_missing`, all
    `graph_validation_or_unknown_node`, `retryable: false`, with no `stage`,
    because nothing was dispatched.
- `recordBatch` now takes only the identifying fields, so both capture paths
  share the batch and the `batchKey`.

### `AS/runtime/executor/graph-run.ts`
- `automationStudioRunState(options)` seeds the run's variables.
- `AUTOMATION_STUDIO_MAX_RUN_STEPS = 100_000` caps the caller's `maxSteps` and
  every grant. It stays module-private: `executor/index.ts` is not this brief's
  file.
- `withIterationAllowance` adds `maxStepsPerIteration` to the budget after each
  For Each attempt that succeeded on `body`, keyed by definition id, as
  `graph-navigation.ts` keys Start. `stepsPerIteration` reads the authored value
  (which cannot be state-bound) and otherwise the definition's own default, so
  the number 50 is written once.

### `AS/nodes/control-flow/for-each.ts` (new, 82 lines), registered in `control-flow/index.ts`
- The first pass reads `items`, checks the limit, and keeps its place; later
  passes read the place, so a list that changes under the body does not change
  the iteration. Items are handed on **by reference**, so a captured row is still
  found by identity when the saved trace marks it.
- `done` clears the state, so a For Each reached again — an inner one inside an
  outer one's body — starts over.
- Failures, all not retryable: `for_each.max_iterations_exceeded` and
  `for_each.iteration_unavailable` as `blocked_by_capability_or_policy` (a safety
  limit and a missing host capability; both are never-retryable categories in the
  contract), `for_each.items_invalid` as `graph_validation_or_unknown_node`.
- **Decision:** `scope: "both"`, not `"routine"` like `builtin.control.loop`, so a
  policy Flow can iterate the rows a Run Output extracted.

### `AS/nodes/data/write-records.ts` (new, 69 lines), registered in `data/index.ts`
- Input `records`, one `records` data output, and a manual-only `recordOutput`
  json parameter on the `record-output` control, as K3's is.
- `execute` parses as K3 does and refuses an invalid or `encrypt` record output
  **before** emitting anything; otherwise it emits
  `{ type: "records.write", payload: { recordOutput, records } }` with the input's
  array as it holds it. The node writes no outputs itself: capture writes
  `records`.

### `AS/nodes/parameter-bindings.ts`
- After the exact-key miss, `readRecordPath` tries own keys from the longest
  dotted prefix down to one segment and walks the rest with the new
  `readSegments`. The one-segment case reproduces the previous walk exactly, so
  exact keys and state-snapshot paths are unchanged, and a shorter prefix is
  used only when the rest of the path is not under a longer one.

### Tests
- **New `nodes/control-flow/tests/for-each.test.ts` (11 cases):** iteration in order
  and by reference, a later pass reading the kept place, `done` then starting
  over, an empty list, the limit (its own, the default 100, the 10,000 ceiling),
  a list exactly as long as the limit, no iteration context, `items` that is not
  a list, and the declared ports, limits and defaults.
- **New `nodes/data/tests/write-records.test.ts` (11 cases):** the effect payload
  with the rows by reference, an ignored records path (including an invalid one),
  `encrypt` refused with no effect, six invalid record outputs refused with no
  effect, and the declared ports and parameter.
- **`nodes/tests/parameter-bindings.test.ts` (+3):** a recorded node's dotted id
  resolves; the longest own key wins over the first segment, with a fallback to a
  shorter one; exact keys, plain walks and snapshot paths unchanged.
- **`runtime/executor/tests/graph-run.test.ts` (+6):** `append-list` accumulating
  across three nodes; variables not carrying between two runs and not written
  back to the options; 300 items through a two-node body (904 attempts, past the
  default 250 steps); a nested For Each pair running every pairing; the 100,000
  ceiling against a caller's larger `maxSteps` and against a For Each grant; each
  `item` a `$datasetRow` marker in the saved trace while the executed trace holds
  the row itself.
- **`runtime/executor/tests/node-execution.test.ts` (+3):** `records.write`
  persisted through the hook with no dispatcher, with markers in the attempt's
  outputs and in both effect lists; a throwing hook failing with
  `record_output.persist_failed`; no dispatcher ever handed a `records.write`.
- **`runtime/executor/tests/record-capture.test.ts` (+11):** written rows validated,
  the same array in `records`, the effect and the batch; the records path ignored;
  the batch key; `records_missing` for a string, an object and an absent value;
  an invalid, absent or `encrypt` record output; a payload that is not an object.
- **`runtime/tests/composite-executor.test.ts` (+1):** a child's variables kept apart
  from its parent's, in both directions.

## Commands run and observed results

All commands ran alone, one at a time; no suite and no build (this machine's RAM).

1. **Baseline, before any edit** — the K6 acceptance command
   (`pnpm --filter fluxiq exec vitest run src/programs/automation-studio/nodes src/programs/automation-studio/runtime/executor/tests src/programs/automation-studio/runtime/tests/composite-executor.test.ts --no-file-parallelism`,
   run from `packages/fluxiq`): `Test Files 15 passed (15)`, `Tests 146 passed (146)`.
2. **The same command after the change:** `Test Files 17 passed (17)`,
   `Tests 193 passed (193)`, 9.05 s. The two 100,000-step ceiling tests take about
   0.45 s each.
3. **`pnpm --filter fluxiq check`** (`tsc --noEmit`): `exit=0`, no diagnostics
   (`scratchpad/k6-check-1.txt`). The package reports `fluxiq@0.5.0`.
4. **`pnpm structure:check`:** `exit=1`,
   `structure-audit: 1 violation(s) across 1 rule(s)`. The only `FAIL` is
   `[working-docs] docs/working/README.md is out of date with the documents' header blocks`,
   which this brief does not own. **Rerun once:** identical. No warning names a
   file this brief added or changed; `executor/: 17 source files` is the
   pre-existing advisory K4a already reported, and this brief added no file
   there. Outputs: `scratchpad/k6-structure-1.txt`, `k6-structure-2.txt`.
5. **Mutations, run on real source.** The permission classifier did not refuse, so
   nothing was proved on a scratch copy. Runner: `scratchpad/k6-mutations.mjs`,
   results in `scratchpad/k6-mutation-results.json`. For each mutation it asserts
   the target text occurs exactly once, writes the mutation, runs the acceptance
   command, then restores the original bytes in `finally` and verifies them.

   | Run | Mutation | Result |
   | --- | --- | --- |
   | Baseline before | none | `193 passed (193)` |
   | M1 (report) | per-node `new Map` restored | `4 failed \| 188 passed` |
   | M2 (report) | index increment removed | `1 failed \| 176 passed` |
   | M3 (report) | prefix loop reversed | `1 failed \| 191 passed` |
   | M4 (report) | step allowance not granted | `2 failed \| 190 passed` |
   | M5 (report) | ceiling not enforced on the caller's limit | `1 failed \| 191 passed` |
   | M6 (report) | ceiling not enforced on a For Each grant | `1 failed \| 191 passed` |
   | M7 | `records.write` not captured, left to a dispatcher | `3 failed \| 189 passed` |
   | M8 | written rows left raw in the effect the trace keeps | `3 failed \| 189 passed` |
   | M9 | unvalidated written rows not withheld | `5 failed \| 187 passed` |
   | M10 | written rows not validated by allowlist copy | `3 failed \| 189 passed` |
   | M11 | Call Flow child seeded from its parent's live variables | `1 failed \| 191 passed` |
   | M12 | For Each maximum-items ceiling ignored | `1 failed \| 191 passed` |
   | M13 | Write Records keeps an authored records path | `3 failed \| 189 passed` |
   | M14 | iteration state shared instead of kept per node | see below |
   | Baseline after | none | `193 passed (193)` |

   (M1-M6 are the report's five targets, with the ceiling split into the caller's
   limit and the grant. M7-M14 are this brief's own.)

6. **M14 needed a second form.** Read under a shared key while writes stay per
   node, For Each never advances, so the 300-item test spun to the step ceiling
   and vitest reported `Worker exited unexpectedly` — exit 1, but a crash rather
   than an assertion, twice. I therefore added the nested-For-Each test, which
   pins per-node keying cheaply, and reran the mutation against it alone:
   `FAIL ... keeps each For Each node's place its own`,
   `AssertionError: expected 'failed' to be 'succeeded'`, `Tests 1 failed | 1 passed`.
   `node-execution.ts` was restored and verified (`scratchpad/k6-m14b.txt`).
7. **Restoration checked afterwards:** `runState.loops.get(nodeId)` and
   `variables: runState.variables` are back in `node-execution.ts`,
   `maxSteps = withIterationAllowance(...)` in `graph-run.ts`, and no mutation
   text survives anywhere under `automation-studio/`.
8. **Must-not-touch files.** `git diff` confirms this brief changed none of them.
   `nodes/index.ts` (+1 line, `export * from "./record-output.ts"`),
   `nodes/importer-sdk.ts` (+10) and `runtime/service.ts` (−49) are other workers'
   K12d and K7 changes, unrelated to iteration, variables, the step budget or
   record writing.

## Not verified

- **`pnpm check` at the repository root, `pnpm test`, `pnpm build`, and the web
  package's check.** The brief forbids suites and builds on this machine; only
  the fluxiq package's `check` was run.
- **Other suites that run Flows through the executor** (`runtime/tests/service.test.ts`,
  `io-policy.test.ts`, `recordings/tests/*`, `live-patch.test.ts`). Run-scoped
  variables are a real behaviour change for any Flow using `set-variable`, and
  the 100,000-step ceiling now bounds `service.ts`'s pass-through `maxSteps`. A
  repository-wide search found no other test referencing `builtin.data.set-variable`
  or `builtin.data.get-variable`, and no caller asking for more than 100,000
  steps (`live-patch.ts` caps at 50), but those files were not run here.
- **Real persistence.** Written records reached only a fake `onRecordBatch`; K2's
  store, a real `schemaDigest`, and replacement by `batchKey` were not exercised.
- **The web editor** for the two new nodes: the `record-output` control (K12d) has
  not been seen against `write-records`, where the records path is unused, nor the
  For Each node in the palette or on the canvas.
- **`pnpm docs:check`** and the generated framework reference (see below).
- **No live browser or panel testing** (not applicable).

## Open questions or contradictions found

1. **A copying data node still puts captured rows into the saved trace in clear.**
   Markers are found by identity, but `set-variable` and `map-object` deep-copy
   their input through `jsonValue`, so a copy is no longer the captured row.
   Accumulating rows with For Each plus `set-variable` in `append-list` mode —
   an obvious use of what K6 adds — therefore writes row text, though not
   excluded fields, into the saved trace. Filter List keeps identity and is safe.
   The For Each body in this brief's marker test uses a node that does not copy.
   This predates K6 but K6 makes the pattern likely; it may deserve a decision
   beside CD14.
2. **Binding resolution still reads `options.variables`, not the live run map.**
   The report scoped the node-execution change to the execution context, so a
   `$state` path bound to a variable still resolves against the run's seed, and a
   mid-run `set-variable` write is invisible to it. Making bindings read the live
   map would also make those values withheld substring-wide, which is a larger
   decision than this brief carries.
3. **Two `records.write` effects in one attempt share a batch key**, as two
   dispatched record outputs in one attempt already do, so K2's replacement by
   `batchKey` would keep only the last. Nothing emits two today.
4. **The generated framework reference will be stale.** `nodes/contracts.ts` gained
   a public type and line numbers moved, and `docs/reference/framework-reference.md`
   is generated from public exports with `pnpm docs:reference` and checked by
   `pnpm docs:check`. That check is not part of `pnpm check`; K10 or the supervisor
   owns regenerating it.
5. **For Each's `done` emits only `count`.** `item` and `index` keep their last body
   values in the run's `values`, as any node's outputs do. If a Flow reading
   `item` after `done` should see nothing, that is a decision to take.
6. **`maxStepsPerIteration` is manual-only** (`allowStateBinding: false`), because the
   executor reads the authored value before any binding is resolved. The editor
   should not offer a binding for it.
