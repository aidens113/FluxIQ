# k2-run-dataset-store: migration 0019 and the run dataset store

## Outcome

**Done, including the supervisor's amendment.** One check is red, and not from my files: `pnpm --filter fluxiq check` currently fails on two type errors in another worker's recordings tests (see A8).

**What shipped**
- Migration `0019_run_datasets`, with `flow_id` and the `run_dataset_catalog` table from K12, is wired into the schema barrel, `table-names.ts`, and the administration migration list.
- `AutomationStudioProjectRunDatasetStore` has every method the brief names, and `runDatasetSummariesForRun` is exported.
- K12's two contracts, with their tests and barrel lines.

**The amendment**
- `appendBatch` now takes `batchKey` and replaces an earlier batch with the same run, dataset, and batch key, not the same `attempt_id`. `attempt_id` is still stored for reference.
- A new `run_dataset_batches` table stores each batch's row count, invalid count, and truncated flag. Replacing a batch subtracts its earlier counts, so a dataset's `invalid_count` and `record_count` always equal the sums over its current batches.

**Verification after the amendment**
- The acceptance command passed: 29 of 29.
- The contracts record-sets tests passed (46 of 46), and the contracts `check` exited 0.
- Mutations 15-18 all went red, each on its intended test, and the source was restored.
- The whole storage `project/tests` folder then passed: 22 files, 117 tests.
- `pnpm --filter fluxiq check` exited 0 with the amendment in place. After a later one-helper fix, it failed twice (the second run was the allowed rerun). Both failures are the same two type errors, in `runtime/service/recordings/tests/candidate-definitions.test.ts` and `proposal-candidates.test.ts`. Those files are not mine.
- The structure audit's two failures are both shared working documents (the plan file's size, and `README.md`). No finding names my files.

## What changed and why

Path prefix: `AS/` is `packages/fluxiq/src/programs/automation-studio/`.

### Migration `0019_run_datasets` (`AS/storage/project/schema/run-datasets.ts`, new)

Edited in place for the amendment, since 0019 has not shipped.

**Tables**
- `run_datasets`: primary key `(run_id, dataset_id)`. Columns: `flow_id not null`, `label`, `schema_json`, `schema_digest`, `node_ids_json default '[]'`, `record_count` and `invalid_count` (at least 0), `truncated` (0 or 1), `created_at_ms`, `updated_at_ms`.
- `run_dataset_rows`: primary key `(run_id, dataset_id, ordinal)`. Columns: `ordinal >= 1`, `attempt_id`, `batch_key` (amendment), `row_json`.
- `run_dataset_batches` (amendment): primary key `(run_id, dataset_id, batch_key)`. Columns: `attempt_id`, `node_id`, `row_count`, `invalid_count` (both at least 0), `truncated` (0 or 1), `created_at_ms`, `updated_at_ms`.
- `run_dataset_audit_events`, typed columns only:
  - `event_id` (primary key);
  - `event_type`, checked to one of `exported`, `export_truncated`, `export_failed`, `deleted`;
  - `run_id`, plus nullable `dataset_id` and `actor_id`;
  - `format`, checked to `csv`, `json`, or null;
  - `row_count` and `byte_count`, not null, default 0, at least 0;
  - `created_at_ms`.
- `run_dataset_catalog` (K12 §4.2): primary key `(flow_id, dataset_id)`. Columns: `label`, `latest_run_id`, `latest_updated_at_ms`, `run_count >= 1`, `latest_record_count`, `latest_truncated`, `schema_digest`.

**Indexes and guard**
- `run_datasets_run_idx`, `run_datasets_flow_dataset_idx`, `run_dataset_audit_events_run_idx`, and `run_dataset_catalog_updated_idx`, all as the reports specify.
- **Added** `run_dataset_rows_batch_idx (run_id, dataset_id, batch_key)`. It was `run_dataset_rows_attempt_idx` before the amendment. Without it, every retry would scan the dataset's rows.
- Guard: `foreignKeyGuards("run_datasets", "run_id", "runtime_runs", "run_id", false)`.

**Wiring**
- `schema/index.ts` exports the migration.
- `schema/table-names.ts` adds `run_datasets`, `run_dataset_rows`, `run_dataset_audit_events`, and `run_dataset_catalog` to `AUTOMATION_STUDIO_PROJECT_DOMAIN_TABLES`.
- `run_dataset_batches` is **not** in that list, because the amendment limited edits to three files (see Open questions). The store test asserts the table's columns instead.
- `administration.ts` imports the migration and appends it last to `AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS`.

### `AutomationStudioProjectRunDatasetStore` (`AS/storage/project/run-dataset-store.ts`, new; exported from `storage/project/index.ts`)

**`open` and `close`**
- `open({ pool, projectId })` takes a lease and runs the administration migrations, as `reusable-llm-context-store.ts` does. A project database created before 0019 therefore gains the tables, and a store that cannot be opened throws (CD16: the attempt fails).
- `close()` releases the lease.

**`appendBatch`** returns an `AutomationStudioRunDatasetSummary`. Input: `{ runId, datasetId, label?, nodeId, attemptId, batchKey, schema, schemaDigest, writeMode, rows, invalidCount, truncated, now? }`.

Validation runs before the transaction, so a refusal writes nothing:
- `runId` matches `^[A-Za-z0-9._:-]{1,200}$`.
- `datasetId` follows the contract's `datasetIdPattern` and refuses `.` and `..`.
- **Amendment:** `nodeId` and `attemptId` (at most 1,000 characters) and `batchKey` (at most 4,000) may be any text without control characters. K4a notes that node ids carry no character restriction, and the executor's attempt ids and escaped batch keys are built from them (for example `call.attempt.2/inner%2Fnode.attempt.1/extract.attempt.1`). The first implementation held them to the id pattern, which would have refused real captures. They are only ever bound as parameters.
- The schema goes through `parseAutomationStudioRecordSchema` (so `encrypt` is refused until K11), then `storedAutomationStudioRecordSchema`.
- The digest is 1-200 characters of `[A-Za-z0-9._:-]`.
- Each row must be a plain object whose every key is a stored field id and whose JSON is at most `rowMaxBytes`.

One `database.transaction` does the rest:
- The stored digest must match, else it throws `Run dataset schema changed within one run.`
- For a new dataset, `flow_id` is set from `runtime_runs` with a subselect. For an unknown run, the `run_id` guard aborts first.
- `replace` deletes the dataset's rows and its batches, and resets the count, invalid count, and truncated flag.
- `append` (amendment) first looks up an existing batch with the same `batchKey`. If one exists, it deletes that batch's rows (by batch key, never by attempt id) and subtracts that batch's `row_count` and `invalid_count` from the dataset's totals. Rows then continue from `max(ordinal)+1`.
- The cap is `maxRowsPerDatasetPerRun`. Rows past the remaining room are dropped, and the batch is truncated when its input said so or rows were dropped.
- The batch row is upserted with its own counts, and the dataset adds them.
- The dataset's `truncated` becomes the stored flag OR the batch's flag. When the replaced batch had been truncated, it is instead re-derived from the remaining batches. The first implementation left the flag set for good.
- `label` is coalesced, `node_ids_json` gains `nodeId` if absent, and `updated_at_ms` never moves backwards.

Catalog upsert, in the same transaction:
- `run_count` gains 1 only when this batch created the run's dataset row.
- The `latest_*` columns, `label`, and `schema_digest` move only for the same run, a later `updated_at_ms`, or an equal time with a smaller `run_id`, matching `order by updated_at_ms desc, run_id`.
- After a replacement, `latest_record_count` follows the dataset's corrected `record_count`.

**Reads**
- `listDatasets(runId)` delegates to `runDatasetSummariesForRun`.
- `getPage({ runId, datasetId, limit?, cursor? })`:
  - returns `AutomationStudioRunDatasetPage`, or null for an unknown dataset;
  - the limit defaults to 50 and is clamped to 200;
  - cursor owner `run-dataset:${runId}:${datasetId}`, filter hash `{}`, values `{ ordinal }`;
  - reads the summary and the rows in one `database.execute`.
- `readRows({ runId, datasetId, afterOrdinal?, limit? })` returns `{ rows, lastOrdinal, hasMore }`, with the limit clamped to 1-500.

**Audit and deletion**
- `appendAuditEvent` writes typed columns only, with id `run-dataset-audit:<uuid>`. `listAuditEvents({ runId, datasetId?, limit? })` returns events oldest first.
- `deleteRunDatasets(runId, { datasetId?, actorId?, now? })`, in one transaction:
  - deletes the rows, batches (amendment), and dataset row of each targeted dataset;
  - writes one `deleted` event per dataset with its removed row count, and keeps every audit row;
  - recomputes each affected catalog key, removing it when no run is left;
  - returns `{ datasetCount, rowCount }`.

**Data window lists** (K12 §4.2)
- `listProjectDatasets({ flowId?, search?, limit?, cursor? })`:
  - cursor owner `project-datasets`, filter hash over `{ flowId, search }`, values `{ updatedAt, flowId, datasetId }`;
  - `search` is trimmed and lowercased, at most 200 characters, and matched with `instr` against `dataset_id` or `label`.
- `listDatasetRuns({ flowId, datasetId, status?, runId?, limit?, cursor? })`:
  - inner join to `runtime_runs`;
  - cursor owner `dataset-runs:${flowId}:${datasetId}`, filter hash over `{ status, runId }`, values `{ updatedAt, runId }`.

**Exports**
- Function `runDatasetSummariesForRun(sql, runId)`, for K5.
- Types `AutomationStudioRunDatasetRow`, `AutomationStudioRunDatasetAuditEventType`, `AutomationStudioRunDatasetAuditEvent`, `AutomationStudioRunDatasetAuditEventInput`, `AutomationStudioRunDatasetBatch` (now with `batchKey`), `AutomationStudioRunDatasetRowBatch`, and `AutomationStudioRunDatasetDeletion`.

### Contracts (`packages/contracts/src/record-sets/`, unchanged by the amendment)

- `project-dataset-summary.ts`: `AutomationStudioProjectDatasetSummary` (with `encryptedFieldIds?`) and `AutomationStudioProjectDatasetSummaryPage { datasets, nextCursor }`.
- `dataset-run-summary.ts`:
  - `AutomationStudioDatasetRunSummary = AutomationStudioRunDatasetSummary & { flowId, runStatus, runStartedAt: number | null }`, plus `AutomationStudioDatasetRunSummaryPage`;
  - `AUTOMATION_STUDIO_DATASET_RUN_STATUSES` and `AutomationStudioDatasetRunStatus`, the stored `runtime_runs.status` values.
- Tests use `expectTypeOf`, enforced by the package `check`. The barrel gains both export lines.

### Tests (`AS/storage/project/tests/run-dataset-store.test.ts`, 21 cases)

**Test helper.** `batch()` keys each batch by its attempt id unless a test sets `batchKey`, as the executor does outside a Call Flow.

**Cases added or changed by the amendment**
- **Replacing a batch by key.** A retried batch key replaces its rows and subtracts its row and invalid counts exactly once. That includes a batch whose rows were all invalid.
- **Counts match batches.** After each replacement, the dataset's `invalidCount` and `recordCount` equal the sums over `run_dataset_batches`, and the stored rows per batch key equal each batch's `row_count`. The catalog's `latestRecordCount` follows.
- **Equal attempt ids, different keys.** Two batches with attempt id `extract.attempt.1` but different keys (a parent's, and a nested Call Flow child's escaped key) both persist. Retrying the child replaces only the child's rows, and the catalog stays correct.
- **Unrestricted ids.** Node ids and keys with spaces and slashes are accepted. An empty or control-character batch key is refused.
- **Truncated flag.** It clears only when no remaining batch is truncated.
- **Tables are cleaned.** `replace`, `deleteRunDatasets`, and the unknown-run refusal all leave `run_dataset_batches` clean.
- **Migration.** The test asserts `run_dataset_rows_batch_idx`, the columns of `run_dataset_batches`, and the `batch_key` column on `run_dataset_rows`.

**Unchanged cases**
- Ordinals, the stored schema, digest and row-key refusals, and the cap at exact, over, and partial fit.
- Paging and cursor binding, and the 500-row stream reads.
- Audit, deletion, and the guard.
- The catalog's first entry, run count, and newest run.
- `listProjectDatasets` and `listDatasetRuns` filters and cursors.
- Delete-by-id catalog recompute, and `runDatasetSummariesForRun`.

## Commands run and observed results

Each command ran alone.

### Initial implementation

1. `pnpm --filter @fluxiq/contracts build` exited 0.
2. `pnpm exec vitest run src/record-sets` (in `packages/contracts`): 8 files, 46 tests passed.
3. `pnpm --filter @fluxiq/contracts check` exited 0.
4. K2 acceptance, `pnpm --filter fluxiq exec vitest run src/programs/automation-studio/storage/project/tests/run-dataset-store.test.ts src/programs/automation-studio/storage/project/tests/schema.test.ts --no-file-parallelism`:
   - First run: 1 failed, 26 passed. That was a defect in the test data: the digest case sent rows the schema did not have, so the row-key check refused them first. I fixed the data.
   - Rerun: 27 passed.
5. `pnpm --filter fluxiq check` exited 0.
6. `pnpm structure:check` exited 1 on one violation only: `FAIL [working-docs] docs/working/README.md is out of date`. That is a shared document I do not own. No finding named my files.
7. Mutations 1-14 (scratch script `k2-mutations.mjs`) against the pre-amendment source printed `restored all files; 14/14 red`:
   - 1: `replace` delete removed;
   - 2: `append` starts at ordinal 1;
   - 3: row-key check removed;
   - 4: cap `>` changed to `>=`;
   - 5: cursor owner reduced;
   - 6: catalog upsert removed;
   - 7: `flowId` filter ignored;
   - 8: filter-hash check removed;
   - 9: delete ignores `datasetId`;
   - 10: catalog not recomputed after delete;
   - 11: attempt replacement removed (superseded by mutations 15 and 17);
   - 12: digest check removed;
   - 13: `run_id` guard removed;
   - 14: contract `runStartedAt` renamed (contracts `check` exited 2).

   Each failed on its intended test.
8. After those mutations, the storage `project/tests` folder passed: 22 files, 114 tests, exit 0.

### Amendment (batch keys and per-batch counts)

A1. `pnpm exec vitest run src/record-sets` (in `packages/contracts`): 8 files, 46 tests passed, exit 0.

A2. `pnpm --filter @fluxiq/contracts check` exited 0.

A3. K2 acceptance (same command as item 4): 2 files, 29 tests passed (21 store, 8 schema), exit 0.

A4. `pnpm --filter fluxiq check` exited 0 (log `k2b-fluxiq-check.log`).

A5. `pnpm structure:check` exited 1 with `2 violation(s) across 1 rule(s)`. Both are `[working-docs]` failures in shared documents I do not own:
- `docs/working/first-class-data-extraction-plan.md: 854 lines exceeds the 800-line compaction threshold`;
- `docs/working/README.md is out of date`.

Searching the log for my paths found no finding of any severity.

A6. Mutations 15-18 (scratch script `k2-mutations-batchkey.mjs`) printed `restored all files; 4/4 red`. Each ran the store test file, and each failed on its intended test:

| # | Mutation | Result | Failing test and assertion |
| --- | --- | --- | --- |
| 15 | replace by `attempt_id` instead of `batchKey` (the batch lookup and the row delete) | red, 1 of 21 | "keeps batches whose attempt ids are equal but whose batch keys differ": the child's batch overwrote the parent's, `{ recordCount: 5, invalidCount: 3 }` not matched |
| 16 | invalid count added, not replaced (subtraction removed) | red, 2 of 21 | the replacement test (`{ recordCount: 4, invalidCount: 3 }` not matched) and the equal-attempt-ids test (the child retry's `{ recordCount: 3, invalidCount: 1 }` not matched) |
| 17 | the replaced batch's rows not deleted | red, 2 of 21 | the replacement test (ordinals `[1..6]` against `[1..4]`) and the equal-attempt-ids test (duplicate child rows) |
| 18 | `truncated` not re-derived when a truncated batch is replaced | red, 1 of 21 | "clears the dataset's truncated flag only when no remaining batch is truncated": `{ truncated: false, recordCount: 9 }` not matched |

Afterwards, a search of the store found the original statements present and no mutation markers.

A7. After mutations 15-18, `pnpm --filter fluxiq exec vitest run src/programs/automation-studio/storage/project/tests --no-file-parallelism` passed: `Test Files 22 passed (22)`, `Tests 117 passed (117)`, exit 0.

A8. **Defect found and fixed after A1-A7.**
- A byte scan showed that the Write tool had turned the ` `, ``, and `` escapes in the store's `CONTROL_CHARACTER` regex into raw 0x00, 0x1F, and 0x7F bytes. The regex still worked, but the file read as binary to grep, and git would diff it as binary too.
- A scratch script (`k2-fix-control-regex.mjs`) replaced the regex with a `hasControlCharacter` helper that uses no escapes, and reported `control bytes now 0`. The store test and the migration had 0 control bytes throughout.
- Mutations 15-18 ran before this fix. The fix touches only that validation helper, not the statements they mutated.
- Reruns, one at a time:
  - Acceptance: 29 passed, exit 0.
  - `pnpm --filter fluxiq check`: exit 2. It failed only in files I do not own:
    - `src/programs/automation-studio/runtime/service/recordings/tests/candidate-definitions.test.ts(267,58): error TS2379` (an argument missing `AutomationStudioFlowArtifact` properties);
    - `src/programs/automation-studio/runtime/service/recordings/tests/proposal-candidates.test.ts(222,7): error TS2322` (`recordOutput: ... | undefined` is not assignable under `exactOptionalPropertyTypes`).
  - The one allowed rerun gave the same two errors, exit 2.
  - The audit gave the same two shared-document failures as A5, exit 1.

## Not verified

- No end-to-end run from K4a's record-batch hook through a K4b collaborator into this store. Nothing wires them together yet, so `batchKey` is exercised only through this store's tests.
- The other production callers are also absent (K5 run detail, K8 endpoints and streaming route).
- Behaviour and speed at 100,000 rows per dataset. The cap test seeds `record_count`, and no query plan was inspected.
- Re-deriving `truncated` after replacing a truncated batch scans that dataset's batches. It was not measured for runs with thousands of batches in one dataset.
- Concurrent writers from more than one process, and case folding of non-ASCII search text.
- `pnpm test` and `pnpm build` across the repository were not run (the RAM rule and this brief's scope).
- A clean `pnpm --filter fluxiq check` after the regex fix. The two type errors in the recordings tests (A8) belong to another worker's in-progress edits. The same check passed at A4, and the fix changed only one validation helper inside `run-dataset-store.ts`.
- Documentation (`persistence.md`, Migration Notes, the contracts `0.2.1` version) was not updated, because I do not own it.

## Open questions or contradictions found

1. **Resolved by the amendment:** the over-counted `invalid_count` on a replaced batch, and the collision between equal attempt ids across Call Flow children. The old "truncated stays true" limitation is also gone, because `truncated` is re-derived when a truncated batch is replaced.
2. **`run_dataset_batches` is missing from `AUTOMATION_STUDIO_PROJECT_DOMAIN_TABLES`** in `schema/table-names.ts`. The amendment limited edits to three files, so `schema.test.ts`'s table loop does not cover it. A one-line follow-up.
3. **Relaxed id rules.** `nodeId`, `attemptId`, and `batchKey` accept any text without control characters, within length limits, instead of the id pattern. The reason is K4a's comment that node ids carry no character restriction.
4. **Capture order after a retry.** Retrying a batch that is not the latest still places its rows after the highest ordinal, so ordinal order no longer matches capture order. Paging stays consistent.
5. **`AUTOMATION_STUDIO_DATASET_RUN_STATUSES` is a new contracts value export**, and `listDatasetRuns`' cursor owner is my choice; the reports name neither.
6. **The contracts version bump** to `0.2.1`, Migration Notes, and `persistence.md` remain for K10 or the supervisor.
