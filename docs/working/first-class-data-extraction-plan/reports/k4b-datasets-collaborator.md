# k4b-datasets-collaborator: the run datasets service collaborator

## Outcome

**Done.** `AS/runtime/service/datasets/` holds `AutomationStudioRunDatasets` with
every member the brief names, the service barrel exports it, and
`contractSpreadPaths` now carries the directory.

- The new tests pass: **4 files, 27 tests**, run alone.
- `pnpm --filter fluxiq check` (`tsc --noEmit`) exits **0**, with K2's `batchKey`
  amendment already landed, so nothing is pinned to an unamended store.
- `pnpm structure:check` fails only on `docs/working/README.md`, a shared
  document I do not own. It failed the same way on a rerun.
- **11 of 11 code mutations went red and every file was restored.** The two
  structure-audit mutations were uninformative for a reason that matters to the
  campaign: see "Open questions" 1 and 2.

## What changed and why

Paths are under `packages/fluxiq/src/programs/automation-studio/`.

### `runtime/service/datasets/run-datasets.ts` (new), class `AutomationStudioRunDatasets`

- Constructor `(projects, pool, limits = AUTOMATION_STUDIO_RUN_DATASET_EXPORT_LIMITS)`.
  The third parameter is the only departure from the report's signature: it exists
  so the caps are testable without writing 5 MiB or 256 MiB of rows. K4c
  constructs it with two arguments exactly as the report writes.
- `readonly available` is `pool !== undefined`. Without a pool every method
  throws `Run datasets require project storage.`, and K4c binds no hook.
- **`recordBatchHandler(projectId, runId)`** returns the `onRecordBatch` hook. Per
  batch it opens the K2 store, calls `appendBatch` with the batch's `batchKey`
  and `schemaDigest` (below), and closes the store in `finally`. It throws when
  there is no pool, when the store cannot be opened, or when the store refuses
  the batch (CD16: fail closed, no JSONL fallback).
- **`listRunDatasets`**, **`getRunDatasetPage`** (the store clamps 1-200,
  default 50), **`deleteRunDatasets`** with an optional `datasetId` (CD17), and
  K12's **`listProjectDatasets`** and **`listDatasetRuns`**, each delegating to
  the store.
- **`exportRunDataset`** answers `null` for an unknown dataset, `tooLarge` with
  the streaming route's `downloadPath` past `inlineMaxRows` or `inlineMaxBytes`,
  and otherwise an inline body **only after** its `exported` audit event is
  written. Any failure writes `export_failed` and rethrows.
- **`streamRunDataset`** answers `null` for an unknown dataset, else an object
  that *is* the `AsyncIterable<string>` the report specifies and also carries
  `format`, `fileName`, and `contentType`, so K8's route has its headers without
  rebuilding them. It is single-use, and **nothing is opened until the first
  chunk is pulled**, so a stream that is never read leaks no lease. One audit
  event is written when it settles: `exported`, `export_truncated` at a cap, or
  `export_failed` on a read failure or an early stop.
- Every read first calls `projects.findProjectSummary(projectId)`, so an unknown
  project is refused before a database is created for it.
- No object spread anywhere: the directory is now under `contract-spread`.

### Supporting files (new, all in the same directory)

- **`schema-digest.ts`** — `sha256:` plus the hex SHA-256 of `stableJson(storedAutomationStudioRecordSchema(schema))`.
  Excluded fields and key order therefore cannot change it, and it matches the
  store's digest pattern.
- **`export-encoder.ts`** — one encoder per format. CSV delegates to the K1
  contract encoders. JSON writes an array of rows holding **only the stored field
  ids, in schema order** (a second allowlist copy behind capture and the store).
  It exposes `footerMaxBytes` so a byte cap can keep room for `]`.
- **`export-body.ts`** — the shared body generator: header, one chunk per 500-row
  page, footer, each chunk carrying running totals, returning
  `{ rowCount, byteCount, truncated }`. It stops **before** the first row that
  would pass `maxRows`, or whose bytes plus the largest footer would pass
  `maxBytes`, so a cut body ends on a whole row, still parses, and never exceeds
  the cap. Inline export and the stream are two thin wrappers over it, which is
  why their caps behave identically.
- **`types.ts`**, **`index.ts`** — the barrel exports the class and the request
  and answer types only; the encoder, body, and digest stay internal.

### Two one-line edits outside the directory

- `runtime/service/index.ts`: `export * from "./datasets/index.ts";`.
- `scripts/structure-audit/config.mjs`: the `contractSpreadPaths` entry, **without
  a trailing slash** (Open question 1), with its `reason` and `remedy`.

## Commands run and observed results

Each ran alone, in `F:\!FluxIQ`.

1. `pnpm --filter fluxiq exec vitest run src/programs/automation-studio/runtime/service/datasets/tests --no-file-parallelism`
   — `Test Files 4 passed (4)`, `Tests 27 passed (27)`, 8.49 s. Re-run after all
   mutations: `27 passed (27)` again, which is the restore check.
2. `pnpm --filter fluxiq check` — `exit=0`, no diagnostics. The package reports
   `fluxiq@0.5.0`.
3. `pnpm structure:check` — `exit=1`, `structure-audit: 1 violation(s) across 1
   rule(s)`. The only `FAIL` is `[working-docs] docs/working/README.md is out of
   date`, which is not my file. Run twice with the same result; the log is
   `scratchpad\k4b-structure-2.log`, and a grep of it for `service/datasets`
   returns nothing.
4. Mutations on real source (the permission classifier did not refuse) with
   `scratchpad\k4b-mutations.mjs`, which asserts each target is unique, backs up
   the bytes, runs the command, restores in `finally`, and verifies the restore.
   Results in `scratchpad\k4b-mutation-results.json`.

   | # | Mutation | Result |
   | --- | --- | --- |
   | M1 | digest taken over the declared schema, not the stored one | red, 2 failed |
   | M2 | batch stored under its attempt id instead of its `batchKey` | red, 1 failed |
   | M3 | the unknown-project check removed from every read | red, 1 failed |
   | M4 | inline row cap compared with `>=` instead of `>` | red, 1 failed |
   | M5 | the inline `exported` audit event not written | red, 3 failed |
   | M6 | an inline export's failure not audited | red, 1 failed |
   | M7 | a stream the consumer stops early not audited | red, 1 failed |
   | M8 | the stream's store never closed | red, 3 failed |
   | M9 | the footer's bytes not reserved under the byte cap | red, 2 failed |
   | M10 | row cap compared with `>` instead of `>=` | red, 1 failed |
   | M11 | JSON rows written whole instead of by stored field ids | red, 1 failed |
   | M12 | a conditional spread into the `tooLarge` answer | **green** — see below |
   | M13 | the same spread with a trailing slash on the configured path | **green** — see below |

   The runner recorded exit codes and failure counts, not the failing test names.
5. **Why M12 and M13 proved nothing, and what does.** `structure-audit` takes its
   file list from `git ls-files` (`scripts/structure-audit/context.mjs:89-95`), so
   my new, uncommitted files are invisible to every rule. `scratchpad\k4b-audit-harness.mjs`
   therefore builds the real context, appends my ten files to `trackedFiles`, and
   runs the rules:
   - clean source, **every** rule: no finding names my files;
   - with the conditional spread: `contract-spread` gives **1 `fail` at line 235**;
   - the same spread with the path written **with** a trailing slash: **0 findings**.

   The source was restored and verified.

## Not verified

- **Nothing routes through `AutomationStudioService`.** My brief said to test
  against a temporary project store, so these cases from the report's §4 K4 test
  list remain for **K4c.1-2**: rows persisted through a real run equal the rows
  the executor validated (`IoRegistry` output returning `{ rows: [...] }`, pattern
  `runtime/tests/service.test.ts:211-212`); the hook reaching the store through
  `graphOptions.onRecordBatch`; and **"a closed pool fails the attempt"** — I
  proved the handler *throws*, not that the attempt then fails, which is K4a's
  behaviour plus K4c's wiring. Also unverified: whether retries and live patches
  (`service.ts:3540-3547,3594-3600`) keep the same `runId`.
- **The audit has not actually examined these files** (untracked). The harness is
  a stand-in; the real gate runs once the supervisor stages them.
- **Real caps at real size.** `streamMaxRows` 100,000 and `streamMaxBytes` 256 MiB
  were exercised only through injected small limits and the body's unit tests; the
  10,001-row `tooLarge` case is real.
- The K8 streaming route, its headers, and its cancellation path; `pnpm test`,
  `pnpm build`, and the web check (the RAM rule and this brief's scope).
- Concurrent writers, and documentation (K10 owns `persistence.md` and the
  Migration Notes).

## Open questions or contradictions found

1. **The report's `contractSpreadPaths` path would have been dead.** §4 K4b writes
   it with a trailing slash; the rule matches `file === entry.path` or
   `file.startsWith(entry.path + "/")` (`rules/contract-spread.mjs:83-90`), so a
   trailing slash never matches and the rule would have been silently off. Proved
   both ways in the harness. The entry is written without one. **The same trap
   applies to the downstream repository's entries.**
2. **`pnpm structure:check` cannot see any worker's new files** until they are
   tracked. A green audit during this campaign is evidence only about files
   already committed, and every new directory's first real audit happens at the
   supervisor's commit.
3. **`tooLarge` writes no audit event.** Nothing left the store, and the event
   vocabulary is fixed (`exported`, `export_truncated`, `export_failed`,
   `deleted`). The stream that follows audits itself.
4. **A consumer that stops a stream early is audited as `export_failed`** with the
   rows and bytes already sent. It is not a failure, but partial exports should
   not go unaudited and no better event type exists. K8's route must call
   `return()` on the iterator when the client disconnects, or the store lease and
   that audit row are both missed.
5. **The stream's schema is the one read by the pre-check.** A dataset deleted
   between the check and the first chunk yields a header-only body audited as
   `exported`. Within a run the digest cannot change, so no other drift is possible.
6. **The persist failure's cause is still dropped** (K4a's open question 4).
   Nothing server-side logs why `appendBatch` refused a batch; the node fails with
   the fixed `record_output.persist_failed` message. A log line belongs in K4c.
7. **Batch keys with `/` are accepted** by K2's amended store, tested with
   `call.attempt.2/extract.attempt.1` against the real store.
8. K12 §4.2's endpoint envelope `{ datasets, page: { nextCursor, limit } }` is not
   built here; the collaborator returns the store's pages and K8 shapes them.
