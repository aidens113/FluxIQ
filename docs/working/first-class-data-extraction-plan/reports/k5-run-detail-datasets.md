# k5-run-detail-datasets: run detail `datasets` and attempt `recordCount`

## Outcome

**Done.**

What it does:
- Run detail now carries `datasets?`, the run's dataset summaries read from the K2 store. Both the compact detail (`includeCollections: false`, which the web reads) and the full detail include it.
- `datasets` is written only when the run stored at least one dataset.
- Each action attempt converted from a runtime session carries `metadata.recordCount`, read from the saved trace's `$dataset` marker, when that count is a finite number.

Checks:
- The K5 acceptance command passes, 10 of 10, including the million-event case. It was run twice, alone.
- All 7 mutations went red and were restored, verified byte for byte.
- The structure audit's two failures are both in working documents I do not own. My files carry advisory warnings only, and both warnings predate the change.
- `pnpm --filter fluxiq check` exited 2 both times. Every diagnostic was in another worker's in-flight test files (K2's in the first run, K7's in the rerun), and no diagnostic in either run names a file I own. See Commands 3 and 8.

## What changed and why

Path prefix: `AS/` is `packages/fluxiq/src/programs/automation-studio/`.

### `AS/model/flow-adaptation.ts` (type only; no file added, so `AS/model/` stays at 28 files)
- A type import of `AutomationStudioRunDatasetSummary` from `@fluxiq/contracts/automation-studio`, added to the existing import line.
- `AutomationStudioFlowRunDetail.datasets?: AutomationStudioRunDatasetSummary[]`, with a doc comment: read from the run dataset store, absent when the run stored none.

### `AS/storage/project/runtime-stream-store.ts`
- Imports `runDatasetSummariesForRun` from `./run-dataset-store.ts` (a sibling in the same directory) and the contract summary type.
- `getRunDetail`:
  - After the existing `run_summary` check, it reads `runDatasetSummariesForRun(this.lease.database, summary.runId)` once (one indexed query on `run_datasets_run_idx`).
  - Both return paths go through the new private `withRunDatasets(detail, datasets)`: the compact object literal, and `runDetailFromEvents(summary, events)` for the full detail.
- `withRunDatasets` removes any `datasets` key from the detail, then adds `datasets` only when the store returned at least one summary. The key is always named explicitly.
  - **Beyond the report's text:** both paths spread the stored `run_summary` envelope (`...envelope`). A run-summary event appended with a `datasets` key in its payload would otherwise reach the detail. The store is therefore the only source, and a run with no datasets never shows the key.
- The table exists whenever this store is open: `AutomationStudioProjectObjectRepository.open` runs `AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS`, which K2 extended with `0019_run_datasets`.
- `service.ts` is unchanged. Its JSON-fallback detail has no datasets, per the report.

### `AS/runtime/service/summaries/conversions.ts`
- `runtimeActionAttemptsFromSession` computes `recordCount = datasetMarkerRecordCount(attempt.outputs)` and adds `recordCount` to the attempt `metadata` when it is defined.
- New private `datasetMarkerRecordCount(outputs: unknown)` checks the shape at each step (`outputs`, then `outputs.records`, then `outputs.records.$dataset`, each a JSON record). It returns `$dataset.recordCount` only when that is a number and `Number.isFinite`.
  - The argument is `unknown` because session traces are read back from storage.
- Confirmed by reading: `runAutomationStudioGraph` returns the **saved** trace (`graph-run.ts:74`). The service converts the session built from it (`service.ts:3572-3582`), so production attempts hold the marker rather than rows.

### Tests
**`AS/storage/project/tests/runtime-stream-store.test.ts`**, one new case, "joins the run's dataset summaries into compact and full run detail, and writes no datasets for a run that stored none":
- **Setup:**
  - Two runs are written with `putRunDetail`. `run.empty` is passed a caller-supplied `datasets` value, which the envelope writer does not persist.
  - A later `run_summary` event whose payload holds `datasets` is appended to `run.empty`. A `listRuntimeEvents` assertion confirms the event is stored.
  - The real `AutomationStudioProjectRunDatasetStore` writes two datasets to `run.checkout` through `appendBatch`: `listings` with a label, 2 rows and 1 invalid, at 1,000; then `prices`, 1 row, at 2,000.
- **Assertions:**
  - The compact detail (`collectionsPaged: true`) and the full detail (no `collectionsPaged`) both `toEqual` the full summaries, every field named, most recently written first.
  - For `run.empty`, both paths resolve without a `datasets` property.
- **Helpers:** `LISTING_SCHEMA`, `emptyRunDetail` (typed `AutomationStudioFlowRunDetail`, so the model field is type-checked), `datasetSummary`, and `datasetBatch`.
  - `datasetBatch` sets `batchKey` and returns the literal with `as AutomationStudioRunDatasetBatch`. K2's batch-key amendment was in flight, and the assertion keeps the literal valid whether or not the type has `batchKey` yet.

**`AS/runtime/service/summaries/tests/conversions.test.ts`** (new), 2 cases through the barrel's `runtimeSessionToFlowRunDetail`:
- **Read from the marker:** counts 3 and 0 are both recorded. The first attempt's metadata is exactly `{ recordCount: 3 }`.
- **Not written, across 7 attempts:**
  - no `records` output;
  - no `outputs` at all;
  - a `$dataset` marker under `result` only;
  - a raw rows array under `records`;
  - a string count `"3"`;
  - a `null` marker;
  - a marker without a count.

## Commands run and observed results

Every command ran alone, one at a time, in `F:\!FluxIQ`. Outputs are saved in the session scratchpad (`k5-*.txt`, `k5-mutation-results.json`).

1. **Conversions tests:** `pnpm --filter fluxiq exec vitest run src/programs/automation-studio/runtime/service/summaries/tests --no-file-parallelism`
   - `Test Files 1 passed (1)`, `Tests 2 passed (2)`, exit 0.
2. **K5 acceptance:** `pnpm --filter fluxiq exec vitest run src/programs/automation-studio/storage/project/tests/runtime-stream-store.test.ts src/programs/automation-studio/runtime/service/summaries/tests --no-file-parallelism`
   - `Test Files 2 passed (2)`, `Tests 10 passed (10)`, exit 0.
   - Stream store 8 tests, with the million-event case at 18,304 ms; conversions 2 tests; 22.38 s in total.
3. **`pnpm --filter fluxiq check`:** exit 2, one diagnostic, not in my files.
   - `src/programs/automation-studio/storage/project/tests/run-dataset-store.test.ts(320,3): error TS2322` says "Property 'batchKey' is optional in type ... but required in type 'AutomationStudioRunDatasetBatch'".
   - That is K2's test during its batch-key amendment.
4. **K5 acceptance, rerun** after adding the envelope-planting step:
   - `Test Files 2 passed (2)`, `Tests 10 passed (10)`, exit 0.
   - The million-event case took 22,514 ms; 26.77 s in total.
5. **Mutations:** `node scratchpad\k5-mutations.mjs`.
   - **Method:** for each mutation it asserts the target text count, backs up the file, writes the mutation, runs the test, then restores the file in `finally` and verifies it byte for byte. The permission classifier did not refuse, so all ran on real source.
   - **Test commands:** stream-store mutations ran that file filtered with `-t "dataset summaries into compact and full run detail"`, to keep the million-event case out. Conversions mutations ran the summaries tests.
   - **Baselines:** green before and after. The stream file gave `1 passed | 7 skipped`; conversions gave `2 passed`.
   - Printed: `7/7 red; all files restored`.

   | # | Mutation | Result |
   | --- | --- | --- |
   | M1 (report) | `datasets` omitted on the compact path (`}, [])`) | red: `expected undefined to deeply equal [ …(2) ]` at the compact assertion |
   | M2 (report) | `recordCount` read from `outputs.result` instead of `outputs.records` | red, 2 of 2: `expected [ undefined, undefined ] to deeply equal [ 3, +0 ]`; `expected { recordCount: 4 } to not have property "recordCount"` |
   | M3 | inner key `$dataset.count` instead of `recordCount` | red: `expected [ undefined, undefined ] to deeply equal [ 3, +0 ]` |
   | M4 | `datasets` omitted on the full path | red: `expected undefined to deeply equal [ …(2) ]` at the full assertion |
   | M5 | `datasets` written even when empty | red: `expected { schemaVersion: '0.1', …(10) } to not have property "datasets"`, plus an `EBUSY` unlink in `afterEach` (see Open questions 4) |
   | M6 | envelope `datasets` not dropped when the run stored none | red: `... to not have property "datasets"` |
   | M7 | finite-number check removed | red: `expected { recordCount: '3' } to not have property "recordCount"` |

6. **Restore check:** a search of both source files for every mutation's replacement text found no matches.
7. **`pnpm structure:check`:** exit 1, `structure-audit: 2 violation(s) across 1 rule(s).`
   - **Failures, neither mine:**
     - `[working-docs] docs/working/first-class-data-extraction-plan.md: 854 lines exceeds the 800-line compaction threshold`;
     - `[working-docs] docs/working/README.md is out of date`.
   - **Advisory warnings on my files, both already past 400 lines before this change:**
     - `model/flow-adaptation.ts: 414 lines` (was 412);
     - `storage/project/runtime-stream-store.ts: 639 lines` (was 627).
   - No finding names `summaries/tests/conversions.test.ts` or `conversions.ts`.
8. **`pnpm --filter fluxiq check`, rerun once later:** exit 2, two diagnostics, both in K7's in-flight recordings tests.
   - `runtime/service/recordings/tests/candidate-definitions.test.ts(267,58): error TS2379`
   - `runtime/service/recordings/tests/proposal-candidates.test.ts(222,7): error TS2322`, on `recordOutput` under `exactOptionalPropertyTypes`
   - The earlier K2 diagnostic is gone. No diagnostic in either run names a file I own.

`git diff --stat` on the four edited files: 85 insertions, 6 deletions, plus the new untracked `summaries/tests/conversions.test.ts`.

## Not verified

- **A clean `pnpm --filter fluxiq check`.** Other workers' test files failed in both runs, so a fully green type check of this change was never observed. My files produced no diagnostic.
- **Datasets in a real run.** Nothing binds `onRecordBatch` to the store yet (K4b and K4c), so a real run's detail has no `datasets` until then. The join was exercised only with rows written directly through `appendBatch`.
- **The web consumer** (`run-queries.ts`) and any web type mirroring run detail. The web check was not run.
- **The full fluxiq suite, `pnpm test`, and `pnpm build`**, excluded by the brief and the RAM rule. Other tests that snapshot attempt `metadata` from `runtimeSessionToFlowRunDetail` (for example `runtime/tests/io-policy.test.ts`) were not run. They should be unaffected, because `recordCount` is added only when a marker is present.
- **Documentation:** `docs/architecture` and Migration Notes are K10's.

## Open questions or contradictions found

1. **Paged action summaries will not show `recordCount`.**
   - The report says `recordCount` "reaches SQL through `detail_json`". It does, but only `getRunActionDetail` and the full detail read `detail_json`.
   - `listRunActions` builds each row's `metadata` from columns (`actionSummaryFromRow`: `summaryOnly`, `eventSequence`, `durationMs`, `evidenceCount`). The web, which reads the compact detail and pages actions, will not see `recordCount` per attempt without a follow-up: a column, or copying it in `actionSummaryFromRow`.
   - Relevant to K9. I did not change it, because widening the summary projection is beyond this brief.
2. **"Name every field."** I read this as writing `datasets` as an explicitly named key, never through the envelope spread, and asserting every summary field with `toEqual`. The summaries themselves come from K2's `summaryFromRow`, which already names each field, so I did not copy them a second time.
3. **The envelope `datasets` drop** goes beyond the report's text (see What changed). M6 shows the test holds it.
4. **A failing test can leave its SQLite file locked.** Under M5, `afterEach` hit `EBUSY ... project.sqlite`. The failed assertion skipped `store.close()` and `datasets.close()`, which run at the end of the case, not in `finally`. Every case in this file follows that pattern, and green runs are unaffected.
5. **`recordCount` is the capture length** that K4a's marker records (`rows.length`), not the stored count. If the store truncates at `maxRowsPerDatasetPerRun`, an attempt's `recordCount` can exceed what was stored; the run-level `datasets[].recordCount` and `truncated` are the stored truth.
   - A Call Flow attempt's own `outputs.records` holds no marker unless the composite exposes a `records` output, so the child's counts appear only on the child's attempts.
6. **The `as AutomationStudioRunDatasetBatch` assertion** in `datasetBatch` can become a plain annotation now that `batchKey` is required (Command 3 showed it required).
7. **Line endings.** Git warns that all four edited files are LF in the working copy and will be written as CRLF (`core.autocrlf`). Committed content is unaffected.
