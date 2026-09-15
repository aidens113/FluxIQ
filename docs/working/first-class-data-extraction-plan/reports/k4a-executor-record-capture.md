# k4a-executor-record-capture: record capture, saved-trace markers, and the record-batch hook in the executor

## Outcome

**Done.** When a Run Output node declares `recordOutput`, the executor now handles the rows it gets back:
- They are captured after a successful dispatch.
- They are validated by allowlist copy and written to the node's `records` output.
- The same array is put back inside `result`.
- The rows go to an optional `onRecordBatch` hook, which the executor waits for.
- Each batch carries a `batchKey` that no Call Flow child shares with its parent or with another invocation, and that a rerun reproduces (supervisor amendment).
- The saved trace holds `$dataset` and `$datasetRow` markers in place of the rows, including rows that reach a Call Flow parent.

Checks:
- The executor tests pass (100 of 100, up from 63), including the batch-key amendment.
- `pnpm --filter fluxiq check` passes.
- The structure audit's only failure is `docs/working/README.md`, a file this brief does not own. It failed the same way on a rerun.
- Every mutation run on real source turned the tests red, and every file was restored.

Nothing wires the hook into the service yet; that is K4b and K4c.

## What changed and why

Paths are under `packages/fluxiq/src/programs/automation-studio/runtime/executor/`.

### `contracts.ts`
- **New type `AutomationStudioRecordBatch`:** `{ nodeId, attemptId, datasetId, label?, writeMode, schema, schemaDigest?, rows, invalidCount, truncated }`, as report §4 K4a gives it.
- **New option `onRecordBatch?`** on `AutomationStudioGraphExecutionOptions`:
  - signature `(batch) => Promise<AutomationStudioRunDatasetSummary> | AutomationStudioRunDatasetSummary`;
  - documented: it is called once per capture, before the attempt is returned, and a throw fails the attempt;
  - without a hook, `records` is still emitted and the trace still holds markers.
- **Amendment: `batchKey: string`** on the batch; `attemptId` is unchanged.
  - The key is the attempt ids of the Call Flow attempts enclosing the capturing run, outermost first, then the capturing attempt's own id, joined with `/`.
  - Node ids have no character restriction in the model, so no plain separator is guaranteed absent from an attempt id. Each id is therefore escaped, `%` as `%25` and then `/` as `%2F`, so `/` occurs only between ids. The escape can be reversed, so two different paths never produce one key.
  - Examples: a root run gives `extract.attempt.1`; a grandchild gives `call.attempt.2/inner.attempt.1/extract.attempt.1`.
- **Amendment: new option `callFlowAttemptPath?: string[]`.** The executor extends it on the options it hands `compositeExecutor`. A composite executor passes those options on to the child run, as the canonical one does by spreading them (`composite-executor.ts:57`). A host starting a run leaves it unset.
- **Barrel.** The type is exported through the existing `export * from "./contracts.ts"`, and `runtime/executor.ts` re-exports the executor barrel. `index.ts` therefore needed no edit and is unchanged.

### `record-capture.ts` (new, 146 lines)
`captureAutomationStudioRecordBatch({ effect, dispatched, nodeId, attemptId }) -> { result, batch? }`

**When it acts.**
- It acts only on `policy.output.dispatch` whose payload has a `recordOutput` that is present and not `null`. This is the presence rule K3 and K4d use. Anything else returns `dispatched` by identity.

**A failed dispatch.**
- Nothing is captured.
- `outputs.result`, when present, becomes `[withheld]`, because a payload from a failed dispatch may still hold excluded fields. *This goes beyond the report's text; see Open questions 2.*

**A successful dispatch.**
- It re-parses `recordOutput` with `parseAutomationStudioRecordOutput` (no `allowEncrypt`).
  - If parsing fails, the effect came from a node other than the policy action, and the dispatch has already happened. The node fails with K3's failure: `graph_validation_or_unknown_node`, code `record_output.encrypt_unavailable` or `record_output.invalid`, not retryable, stage `dispatch`. `outputs.error` is `{ code, issues }`, `result` is withheld, and nothing is captured.
- It reads `outputs.result` at `recordsPath` with `parseAutomationStudioRecordsPath`.
  - The walk follows own properties of plain objects only. An array or a missing key on the way means nothing is there.
  - A non-array fails with `output_not_observed`, code `record_output.records_missing`, retryable `true`, and no stage (the report names none). The message names the authored `recordsPath`, and `result` is withheld.
- It validates the rows with `validateAutomationStudioRecords(found, schema, { maxRecords })`.
- It writes `outputs.records`, and replaces the `recordsPath` subtree of `outputs.result` with **the same array reference**. Only the objects along the path are copied, so the dispatcher's own answer is never changed; a test holds this.

**The batch.**
- `schema` is `storedAutomationStudioRecordSchema(output.schema)`: the dataset is never told an excluded field's id. *This goes beyond the report's text.*
- `schemaDigest` is not set here; K4b computes it.
- `batchKey` is built by the private `recordBatchKey(callFlowAttemptPath, attemptId)` from the request's new `callFlowAttemptPath?` field (amendment).

### `record-summary.ts` (new, 138 lines)
`automationStudioRecordTraceSummary()` returns `{ record, include, captured, apply }`, plus `isAutomationStudioRecordTraceMarker`.

- **Identity, not value.**
  - `record(batch, stored?)` maps the captured array to `{ $dataset: { datasetId, recordCount: rows.length, schemaDigest? } }`.
  - It maps each captured row object to `{ $datasetRow: { datasetId, ordinal } }`.
- **Ordinals follow K2's store rules:** `replace` restarts at 1; `append` continues per dataset.
  - When the hook answered, the first ordinal is `stored.recordCount - rows.length + 1` (at least 1), because the store also counts rows this run cannot see, such as a child's.
  - Otherwise the summary keeps its own per-dataset count.
  - `schemaDigest` comes from the hook's answer.
  - An answer without an integer `recordCount` of 0 or more, and a string `schemaDigest`, is ignored.
  - *The report wrote `record(batch, firstOrdinal)`. I moved the ordinal arithmetic into the summary so the node-execution call is `record(batch, summary)`, as the report's node-execution section writes it.*
- **`apply`** walks at most 64 levels, copying only what changes. A trace with nothing captured comes back by identity.
  - Past the bound, when anything was captured, the subtree is withheld whole rather than passed through (fail closed, as `trace-withholding.ts` does).
- **`include` and `captured()`** merge and copy the identity map, for Call Flow children.
- **Issued markers are tracked in a module `WeakSet`.** `isAutomationStudioRecordTraceMarker` answers true only for markers a summary issued.

### `run-state.ts` (new, 15 lines)
- `automationStudioRunState() -> { records }`.
- *It takes no `options`, unlike the report's `automationStudioRunState(options)`: nothing reads options yet, and K6 can add the parameter along with variables and loops.*

### `node-execution.ts`
- `executeAutomationStudioNode` gains `runState` after `withholding`. Its only callers are the two in `graph-run.ts`.
- `dispatchAutomationStudioEffects` gains a `{ runState, nodeId, attemptId }` target. Both paths that dispatch effects pass it: the native node path and the built-in node path.
- **Amendment.** The Call Flow path hands `compositeExecutor` the options from `callFlowChildOptions(options, attemptId)`, which appends this attempt's id to `callFlowAttemptPath`. Capture is passed `options.callFlowAttemptPath ?? []`.
- After each dispatcher answer, the new `withCapturedRecords` runs capture. When there is a batch:
  - it awaits `options.onRecordBatch?.(batch)`, then calls `runState.records.record(batch, stored)`;
  - if the hook throws or rejects, the rows are still recorded, so the saved trace still holds markers, and the result fails with `action_failed`, code `record_output.persist_failed`, retryable `false`, and the fixed message "The output ran, but the records it returned could not be saved."
  - the hook's error text is not copied into the trace, because the trace must hold no row.

### `graph-run.ts`
- Creates the run state beside the withholding.
- Adds a `capturedBySavedTrace` `WeakMap`, like `withheldBySavedTrace`. Each child attempt's captured set is included.
- The saved trace is now `withholding.apply(withholdRunInputs(runState.records.apply(executed), inputs))`. Markers are applied first, while the trace still holds the arrays capture produced, since the later rewrites copy what they change.
- The saved trace's captured set is stored in the map.
- I checked that identity survives the canonical Call Flow path: `composite-executor.ts:66-69` builds parent outputs straight from `executedChild.values`, with no copy.

### `trace-withholding.ts`
- The walk returns a value untouched when `isAutomationStudioRecordTraceMarker(value)`.
- *The report said to skip "an object whose only key is `$dataset` or `$datasetRow`". I skip by identity instead:* a producer-returned object of the same shape is ordinary data, and a withheld value inside it is still withheld. A test pins both halves.

### Tests (`tests/`)

**`record-capture.test.ts` (new, 17 cases):**
- validated rows and the batch, with the stored schema;
- excluded and unknown fields absent from `records`, `result`, and the batch;
- the `result` path holds the same array as `records` and `batch.rows`, siblings are kept, and the dispatcher's answer is unchanged;
- label and `maxRecords` truncation;
- `records_missing` for a string, a missing key, an array on the path, and no payload, with the failure record exact and surviving `parseAutomationStudioFailureRecord`;
- a failed dispatch is not captured and its payload is withheld;
- identity is returned for no `recordOutput`, a `null` one, another effect type, and a non-object payload;
- a record output that fails parsing at capture (encrypt, no `recordsPath`, `false`) gives K3's codes, a withheld payload, and no capture;
- `batchKey` (amendment): no path gives the attempt id; a two-level path gives `call.attempt.2/inner.attempt.1/extract.attempt.1`; a `/` inside an id is escaped; and an id holding a literal `%2F` stays distinct from an escaped `/`.

**`record-summary.test.ts` (new, 7 cases):**
- arrays and rows replaced by identity in `values`, `inputs`, `outputs.result`, and a filtered list;
- equal-content copies untouched, with the trace returned by identity;
- `include` from a child;
- nothing captured returns the same trace;
- ordinals: append continues per dataset, replace restarts;
- digest and first ordinal taken from the stored summary;
- depth bound fails closed.

**`node-execution.test.ts` (+6 cases):**
- the hook is called once with validated rows and awaited: a 5 ms delayed hook completes before the next node dispatches, and the executed `records` is the same array as `batch.rows`;
- a throwing hook and a rejecting hook both fail with `persist_failed`, dispatch nothing after, and leave no row text in the saved trace;
- with no hook, `records` is still emitted and the saved trace holds a marker;
- a native node's record output is captured;
- `records_missing` calls no hook;
- the first case also asserts `batchKey` is `extract.attempt.1` for a root run (amendment).

**`record-summary.test.ts` helper (amendment):** the `batch()` builder gained `batchKey`, which the now-required field needs.

**`graph-run.test.ts` (+6 cases):**
- `JSON.stringify(saved)` holds no row text, while the executed trace holds it in `values` and in a later node's `inputs`, and the executed trace holds no excluded field;
- `extract.records` flows over a data edge into `builtin.data.filter-list` `items`: the kept row is the same object in the executed trace and a `$datasetRow` marker in the saved trace;
- a Call Flow child's rows are markers in the parent's outputs, its values, and its child trace;
- batch keys (amendment), with a test composite executor that passes its options on to the child as the canonical one does:
  - a parent `extract` and a grandchild `extract` both have attempt id `extract.attempt.1`, with keys `extract.attempt.1` and `call.attempt.2/inner.attempt.1/extract.attempt.1`;
  - one Call Flow node run twice in a loop starts the same child twice: both captures have attempt id `extract.attempt.1`, with keys `inner.attempt.1/extract.attempt.1` and `inner.attempt.2/extract.attempt.1`;
  - running the same parent Flow twice gives identical key lists.

**`trace-withholding.test.ts` (+1 case):**
- a `$dataset.recordCount` of 2 is kept while a binding resolved 2, which the effect payload withholds;
- a look-alike `{ $dataset: { recordCount: 2 } }` from the dispatcher reads `[withheld]`.

## Commands run and observed results

All commands ran alone, one at a time, in `F:\!FluxIQ`.

1. **Baseline, before any edit:** `pnpm --filter fluxiq exec vitest run src/programs/automation-studio/runtime/executor/tests --no-file-parallelism`
   - `Test Files 7 passed (7)`, `Tests 63 passed (63)`.
2. **The same command after the change:**
   - `Test Files 9 passed (9)`, `Tests 96 passed (96)`, 4.03 s.
   - Per file: node-execution 25, trace-withholding 11, graph-run 6, record-capture 16, record-summary 7; the other four files are unchanged.
3. **`pnpm --filter fluxiq check`** (`tsc --noEmit`): `exit=0`, no diagnostics. The output was saved to `scratchpad\k4a-check-1.txt`. No other worker's files failed, so no rerun was needed.
4. **`pnpm structure:check`:** `exit=1`, `structure-audit: 1 violation(s) across 1 rule(s)`.
   - The only `FAIL` is `[working-docs] docs/working/README.md is out of date with the documents' header blocks`, which is not my file.
   - Advisory warnings on my paths:
     - `executor/: 17 source files is past the 15-file advisory threshold`. The directory now has 20 `.ts` files including `index.ts`. I did not open the rule to see what it counts.
     - `executor/tests/node-execution.test.ts: 456 lines is past the 400-line advisory threshold`.
   - No other line names a file I own.
   - **Rerun once**, as the brief asks: identical result, the same single `FAIL` and the same two warnings. Output saved to `scratchpad\k4a-structure-1.txt` and `k4a-structure-2.txt`.
5. **Mutations, run on real source.** The permission classifier did not refuse.
   - Runner: `scratchpad\k4a-mutations.mjs`.
   - For each mutation it asserts the target text occurs exactly once, backs the original up to `scratchpad\k4a-mutation-backups\`, writes the mutation, runs the executor test command above, then restores the original bytes in `finally` and verifies them.
   - Results are in `scratchpad\k4a-mutation-results.json`.
   - Afterwards, a search of the executor sources found none of the mutation replacement texts.
   - One target from the report was not run: "`withheldResultPayload` ignored" is K4d's, in `io-policy.ts` and `FX/runtime`, which this brief does not own.

   | Run | Mutation | Result |
   | --- | --- | --- |
   | Baseline before | none | `96 passed (96)` |
   | M1 (report) | allowlist copy replaced by a spread of the raw rows | `12 failed \| 84 passed`: record-capture rows, exclusion, identity; graph-run all 3; node-execution 5 capture cases; trace-withholding marker case |
   | M2 (report) | `outputs.result` rewrite skipped | `10 failed \| 86 passed`, including graph-run's 3 saved-trace cases and record-capture's exclusion and identity cases |
   | M3 (report) | `records.apply` removed from `graph-run.ts` | `9 failed \| 87 passed`: graph-run 3, node-execution 5, trace-withholding marker case |
   | M4 (report) | child `include` removed | `1 failed`: the Call Flow case |
   | M5 (report) | hook error swallowed (`return result`) | `2 failed`: throws and rejects `persist_failed` cases |
   | M6 (report) | marker skip in the withholding walk removed | `1 failed`: the trace-withholding marker case |
   | M7 | rows not recorded when the hook throws | `2 failed`: both `persist_failed` cases (row text in the saved trace) |
   | M8 | failed-dispatch payload not withheld | `1 failed`: the failed-dispatch case |
   | M9 | failed dispatch captured | `1 failed`: the failed-dispatch case |
   | M10 | marker skip by shape instead of identity | `1 failed`: the trace-withholding look-alike assertion |
   | M11 | stored summary ignored for the first ordinal | `1 failed`: the stored-summary case |
   | M12 | depth bound passes the subtree through | `1 failed`: the depth case |
   | M13 | rows not recorded after the hook succeeds or with no hook | `7 failed \| 89 passed` |
   | M14 | hook not awaited | `2 failed`, `Errors 1 error`: the ordering case and the rejects case |
   | M15 | declared schema, not the stored one, handed to the hook | `2 failed`: record-capture batch and exclusion cases |
   | M16 | child captured set not kept for the saved trace | `1 failed`: the Call Flow case |
   | M17 | payload of an invalid record output not withheld | `3 failed`: all three invalid-at-capture cases |
   | Baseline after | none | `96 passed (96)` |

6. **Batch-key amendment.** The Claude Code process crashed partway through.
   - **After the crash**, a search of the executor sources found every `batchKey` and `callFlowAttemptPath` edit in place and none of the mutation texts.
   - **`pnpm --filter fluxiq check`, first run after the edits:** `exit=2`, `TS2375` at `tests/record-summary.test.ts(8,3)`. The test's `batch()` helper built a batch without the now-required `batchKey`. It is my file, so I added the field to the helper.
   - **`pnpm --filter fluxiq check` again:** `exit=0`, no diagnostics (`scratchpad\k4a-check-3.txt`). The package now reports version `fluxiq@0.5.0`; I did not change that.
   - **Executor tests,** once before the helper fix and once after it: both `Test Files 9 passed (9)`, `Tests 100 passed (100)`.
   - **Mutations on real source** with `scratchpad\k4a-mutations-batch-key.mjs`, by the same method (results in `scratchpad\k4a-mutation-batch-key-results.json`). The test run just before served as the baseline. A search afterwards found none of the mutation texts.

   | Run | Mutation | Result |
   | --- | --- | --- |
   | M18 (supervisor) | key built from `attemptId` alone | `3 failed \| 97 passed`: both graph-run key cases (child apart from parent; two invocations) and the record-capture key case |
   | M19 | key segments not escaped | `1 failed \| 99 passed`: the record-capture key case |
   | M20 | Call Flow child options not extended with the attempt | `2 failed \| 98 passed`: both graph-run key cases |
   | M21 | capture not told the Call Flow path | `2 failed \| 98 passed`: both graph-run key cases |
   | Baseline after | none | `100 passed (100)` |

   - The rerun case stays green under every mutation, as it should: each mutation is still deterministic.
   - `pnpm structure:check` was not rerun after the amendment (not requested). The amendment added no file, and no changed file is near the 800-line limit.

## Not verified

- **The full K4 acceptance command** (`runtime/tests/io-policy.test.ts`, `service/datasets/tests`, `service/recordings/tests`). The brief names only the executor tests; `service/datasets/tests` does not exist until K4b.
- **Production wiring.** No service code binds `onRecordBatch` (K4b and K4c). Persistence through the K2 store, and a real `schemaDigest`, were exercised only with a fake hook.
- **Ordinals when the store truncates at 100,000 rows.** `recordCount - rows.length + 1` understates the first ordinal once rows are dropped. It is clamped at 1 and not tested against the real store.
- **Retries and live patches through `service.ts`,** which reuse options and may reuse a `runId`.
- **Batch keys through `runCanonicalAutomationStudioFlow`.** The key tests use a test composite executor that passes its options on, as `composite-executor.ts:57` does; the canonical executor itself was not run. A host composite executor that builds fresh child options drops the path, and its children's keys fall back to their bare attempt ids.
- **The structure audit after the amendment** (not requested).
- **The full fluxiq suite, `pnpm test`, `pnpm build`, and the web check** (the brief forbids suites and builds on this machine).
- **Other test files that run `builtin.policy.action` through the executor** (for example `runtime/tests/executor.test.ts`, `io-policy.test.ts`, `recordings/tests/*`). The change is inert without `recordOutput`: capture returns the answer by identity, and `apply` returns the trace by identity when nothing was captured. I did not run them.
- **Documentation** of the trace markers and the hook (K10 owns `docs/architecture`).
- No live browser or panel testing (not applicable).

## Open questions or contradictions found

1. **Resolved by the amendment: attempt ids are not unique across a Call Flow.** An attempt id is `${node.id}.attempt.${n}`, numbered per graph run.
   - `composite-executor.ts:57` spreads the parent's options into the child's, so a child inherits `onRecordBatch` and writes under the same `runId`.
   - K2's rule "a batch with an existing `attempt_id` replaces the earlier one" would therefore let a child node replace a parent batch whose node has the same id at the same attempt position. The same applies across the composite executor's child retries, which may be intended.
   - The supervisor confirmed this. Batches now carry `batchKey`, and K2 switches its replacement key to it separately; I edited no storage file.
   - **Still open:** the composite executor's own child retries (`maxAttempts`, `composite-executor.ts:58-63`) run inside one Call Flow attempt. A retry's batches therefore get the same keys as the failed try's and replace them. That looks intended, since a retried child should not leave duplicate rows, but it is a choice the supervisor may want to confirm.
2. **Withholding `result` when nothing is captured.** On a failed dispatch, a `records_missing` failure, and an invalid record output at capture, `outputs.result` becomes `[withheld]`.
   - The purpose is that excluded fields never reach the trace (D12, parity with K4d).
   - The cost: a user with a wrong `recordsPath` cannot see the payload's shape in Runtime Debug. A keys-only view of `result` would be a middle ground.
3. **No refusal before dispatch for native or importer nodes.** Only `builtin.policy.action` parses `recordOutput` before dispatch (K3). A native node's invalid or `encrypt` record output is caught after the output ran, so nothing is stored, but the output did run. A pre-dispatch check could live in `dispatchAutomationStudioEffects`; I did not add it, because it is beyond the brief.
4. **The persist-failure message is fixed.** The hook's error, for example K2's "Run dataset schema changed within one run.", is dropped rather than risk quoting a row value. K4b may want to log it on the server.
5. **Line endings.** After the edits, the working copies of `contracts.ts`, `graph-run.ts`, `trace-withholding.ts`, and the graph-run and trace-withholding tests are LF; git warns it will write CRLF (`core.autocrlf=true`). Committed content is unaffected.
6. **The structure audit's `directory-files` warning** counts 17 source files in `executor/`, while 20 `.ts` files sit there. It is advisory only (the failure threshold is 25); I did not investigate what it excludes.
