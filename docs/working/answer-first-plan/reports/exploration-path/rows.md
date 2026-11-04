# Rows and witnesses (worker report)

## Outcome
Done. Files are flat in `SVC/answer-first/rows/` and `SVC/answer-first/witnesses/` (the audit's 9-segment depth limit forbids subdirectories), each with a barrel and `tests/`. No `answer-first/index.ts`.

## Exports
`rows/index.ts`:
- `automationStudioAnswerFirstRowSink({ runId, readRowsKey?, onRecordBatch, reader? })` returns `{ fromCall, summary, readBack }`.
  - `fromCall` returns `{ rows, datasetId?, invalidCount, truncated, failure? } | undefined`. `failure.code` is `answer_first.rows_not_stored` or `answer_first.rows_no_columns`, with an error name only.
  - `summary()` is synchronous and as design.md fixes it. `readBack()` is async and adds `fromStore`.
  - `reader` is optional and extra to design.md: `{ listDatasets, getPage, process? }`.
- `automationStudioAnswerFirstSession({ openSession, writeSession, runId, attemptId, now? })` returns `{ session, end(status) }`. `end` is idempotent.
- `automationStudioAnswerFirstResultDataset`, `...ReadRows`, `...ReadColumns`, `...ReadSchema`, `...ReadDatasetId`, and the types.

`witnesses/index.ts`:
- `automationStudioAnswerFirstWitnesses({ read(side: "before" | "after") })` returns `{ beforeFirstLastingAct, atEnd, readings, notes }`.
- Both read methods return `{ kind: "read", reading } | { kind: "unread", note }`, not `undefined`. This differs from design.md. The audit rule `failure-as-empty` refuses a catch that returns `undefined`.

## Behaviour
- **Rows come only from the answer.** They come from the evidence at `readRowsKey`, else `outputs.records`. A call with `failure` has none. The call's input is used only to tell reads apart, so a test with rows in the input stores nothing.
- **Dataset id** is `read.<tool>.<hash>`. The hash covers the tool, its input without paging words (page, offset, cursor, limit and similar, matched by name) and its column set. A later page of the same read therefore adds to the same dataset.
  - The schema is fixed by the first page and reused. A later page whose values do not fit counts in `invalidCount`, because the store refuses a schema that changes within a run.
- **Batch** is a real `AutomationStudioRecordBatch`. Rows pass `validateAutomationStudioRecords` with `maxRecords` at the ceiling (10,000). Minted fields (`^\$|handle|evidence`) are not columns. The `batchKey` is `automationStudioRecordBatchKey([], callId)`.
- **Dedupe.** The store keeps every batch. Whole-row dedupe happens only in `processRunDatasets`. The sink's `summary()` dedupes the same way, and `readBack()` calls `reader.process` first.
  - The driver must bind `process` to `processEndedRunDatasets`, or read back after processing, or the stored rows will hold repeats.
- **Reader binding:**
  - `listDatasets` is `listRunDatasetsForVerification({ projectId, runId })`.
  - `getPage` is `getRunDatasetPage({ projectId, runId, datasetId, limit, cursor })`.
  - `process` is `processEndedRunDatasets({ projectId, runId })`.
  - If any of them fails, `readBack` falls back to the sink's own account with `fromStore: false`.

## Rule for which dataset is the result
The dataset the latest rows-storing read wrote to. A read that stored nothing (empty, failed, no columns) never displaces an earlier one. Earlier reads of other things never replace it. The model never names its rows. Limit: if a domain spells paging words differently from the list in `dataset-of-read.ts`, each page becomes its own dataset, and only the last page is the result.

## Session and listings
- Metadata is `{ explorationAttempt: { attemptId } }`, never `candidateTrial`. It is written as a trial's is: `running`, then the end with `finishedAt`.
- Listing (`SVC/session-listing/`, `summaries/conversions.ts`, read-only): a summary projects only `metadata.candidateTrial`. An exploration session therefore lists as a plain run with its run id and status.
  - Nothing breaks and nothing hides it. It shows until `end()` is written. A crash leaves it `running`, and the orphan sweep makes it `interrupted`.
  - The driver should pick a recognisable run id.

## The real witness read to bind
The Core-side machinery is `automationStudioTrialChangeBegin({ steps, parts, port, look, signal })` and its `finish(acts, signal)` (`S/runtime/flow-authoring/bootstrap/trial-change/session.ts`).
- It needs the trial change ledger port and `look` (the start check's `lookAt`) that the trial gate builds in `candidate/trial/gate.ts`. Its witnesses come from the draft's steps and consequences via `automationStudioTrialWitnesses`.
- So bind `read("before")` to `begin(...)` at the first lasting act and keep its `finish`. Bind `read("after")` to `finish(actsSoFar)`, returning the `siteChange` packet as the JsonObject. The `acts` for `finish` are `automationStudioTrialChangeActs(landed, already)` from the act record.
- Failure semantics already match: an unread side proves nothing.
- The rows worker did not wire this. The driver must decide whether the draft's steps exist at exploration time, since the witnesses are derived from them.

## Commands run and observed
- From `packages/fluxiq`: `pnpm.cmd exec vitest run src/framework/automation-service/service/answer-first/rows src/framework/automation-service/service/answer-first/witnesses --minWorkers 1 --maxWorkers 2` printed `Test Files 4 passed (4)`, `Tests 18 passed (18)`.
- `pnpm.cmd --filter fluxiq check` printed two type errors, both in other workers' files:
  - `src/runtime/answer-first/result/result.ts(31,10)` (missing export `automationStudioFlowLessScreenedWords`)
  - `src/runtime/llm/node-tools/tests/forward-run.test.ts(138,150)`
  - None in my files.
- `node scripts/structure-audit.mjs` printed 4 violations, none in my files:
  - `node-tools/tests` has 26 files.
  - `loop-configuration.ts` imports `replay/forward.ts` directly.
  - `flow-less/judge.ts` imports `../verdict/call-failure-words.ts` directly.
  - `replay/span.ts` has packed statements.

## Not verified
- `check` and the audit could not be made fully green because of the other workers' files above. My files were clean in the last run of each.
- No integration with the driver or the evidence loop. The witness read is not bound to anything real.
- Behaviour on a read whose rows exceed the store's own per-run row cap was not exercised. Truncation was tested only at the 10,000-row batch ceiling, against the stub.
- No live read answer was used. Shapes come from `rerun-checked-rows.ts` and the replay code.
