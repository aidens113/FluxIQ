# k-datasets-execution: Core phases K1-K10 made executable

Path prefixes, all relative to `F:\!FluxIQ`:
`AS/` = `packages/fluxiq/src/programs/automation-studio/`, `FX/` = `packages/fluxiq/src/`,
`CT/` = `packages/contracts/src/`, `WEB/` = `apps/web/src/`.
Every `file:line` below was read in this investigation unless listed under Not verified.

## Outcome

Done. This was a read-only investigation. Every phase K1-K10 below lists:
- files with the function or type touched;
- new exports;
- test files and cases;
- an acceptance command;
- mutation targets.

Open questions 1-4 are answered in section 3. Checking the Design against code turned up
twelve corrections (section 1.2). Four change what gets built:
1. **`export-flow-run-audit` has no handler.** The Export Audit button therefore has nothing
   working to copy.
2. **Summarizing only `outputs.records` still saves rows in the trace.** They are copied through
   the values map, every later attempt's inputs, and `outputs.result`.
3. **The framework runtime writes `result.payload` to disk** in `attempt.json`. Rows, and any
   `exclude` column a domain sends anyway, reach disk outside the dataset store.
4. **Capture belongs in node execution, not `io-policy.ts`.** `io-policy.ts` has three dispatch
   paths.

## What changed and why

Only this report was created. No source, document, build, test, or server was touched.

## 1. Checking ex-b-core and the Design against code

### 1.1 Confirmed

| Claim | Evidence |
| --- | --- |
| A domain payload becomes node output `result` | `AS/runtime/io-policy.ts:49` (in-process), `:113` (runtime) |
| Runtime variables are rebuilt for every node | `AS/runtime/executor/node-execution.ts:102` |
| Values are keyed `nodeId.port` and bare `port` | `AS/runtime/executor/graph-run.ts:189-192` |
| The saved trace is the withheld copy | `graph-run.ts:48,55`; `trace-withholding.ts:64,117-123` |
| A dotted recorded node id defeats path lookup | `AS/nodes/parameter-bindings.ts:118-128` (exact key, then a walk from segment 0) |
| Run-detail attempts carry no inputs or outputs | `AS/runtime/service/summaries/conversions.ts:137-174`; `AS/model/flow-adaptation.ts:277-292` |
| Approval writes `builtin.policy.action` with `expectedState` | `AS/runtime/service/recordings/proposal-candidates.ts:90-133`, `:106` |
| `expectedState` is lifted only as a plain, non-empty object | `proposal-candidates.ts:150-161` |
| Executor options type | `AS/runtime/executor/contracts.ts:153-192` |
| Loop keeps no state; `maxSteps` defaults to 250 | `AS/nodes/control-flow/loop.ts:21`; `graph-run.ts:165` |
| Package versions | `fluxiq` 0.4.0 (`packages/fluxiq/package.json:3`); `@fluxiq/contracts` 0.2.0 (`packages/contracts/package.json:3`) |
| Directory counts | `schema/` has 14 files, `storage/project/` 21, `api/handlers/` 21 (listed with `ls`) |

### 1.2 Corrections and new findings

**C1. `export-flow-run-audit` has no registered handler.**
- The endpoint name exists (`AS/api/contracts/endpoints.ts:147`), and so does its
  implementation (`AS/runtime/service.ts:3892-3894`, `AS/runtime/service/summaries/run-audit.ts:35-82`).
- No file under `AS/api/handlers/` references it. A grep over `FX/` non-test sources finds only
  those three files.
- The web calls it (`WEB/features/automation-studio/runtime/run-commands.ts:29`) from the Export
  Audit button (`RunActionLogView.tsx:214-236,267`).
- The registry answers an unregistered endpoint with `endpoint.not_found`
  (`FX/programs/_shared/api.ts:50-57`), which the route maps to 404 (`WEB/lib/program-route.ts:7`).
- Web tests stub the command, so nothing catches the gap
  (`runtime/tests/runtime-views.test.tsx:37`, `runtime/tests/runtime.test.tsx:95`).
- Consequences: the "Export Audit precedent" is only a UI pattern, and step K8.0 registers the
  handler.

**C2. "The saved trace keeps a summary only" does not follow from summarizing `outputs.records`.**
- `collectNodeInputs` merges the whole values map into every later attempt's `inputs`
  (`AS/runtime/executor/node-inputs.ts:11`).
- Each output is also written under two keys (`graph-run.ts:189-192`).
- Rows therefore appear in `values` and in every later attempt's `inputs`.
- `outputs.result` separately holds the raw payload (`io-policy.ts:49,113`), including any excluded
  field.
- The fix (K4): summarize by identity, over whole arrays and single rows, across the trace. At
  capture, also replace the `recordsPath` subtree of `outputs.result` with the validated array.

**C3. Framework runtime command attempts store `result.payload`.**
- `settleAttempt` saves `withheldResult(result)` (`FX/runtime/service.ts:283`). That function
  rewrites only `message` and `error` (`:430-437`).
- `saveCommandAttempt` writes the whole attempt to `command-attempts/<attemptId>/attempt.json`
  (`FX/runtime/storage.ts:51-57,67-69`).
- `docs/architecture/package-boundaries.md:214-215` states that `result.payload` is not withheld.
- This affects every dispatch that goes through the runtime (`io-policy.ts:86-102`).
- Downstream D12 (an excluded column is absent from anything stored) cannot hold without a change
  here. This becomes step K4d.

**C4. Capture belongs in `node-execution.ts`, not `io-policy.ts`.**
- Three dispatch paths exist:
  - `createIoPolicyEffectDispatcher` (`io-policy.ts:59-73`);
  - `createRuntimePolicyEffectDispatcher` (`:75-122`), with an in-process fallback at `:86`;
  - any `effectDispatcher` a host supplies.
- The single point where they merge is `dispatchAutomationStudioEffects`
  (`node-execution.ts:141-164`).
- A new `records.write` effect (K6) has no dispatcher at all; an unhandled effect is skipped at
  `:144`.

**C5. `contractSpreadPaths` is empty in Core.**
- See `scripts/structure-audit/config.mjs:39`. The Design's "write fields by name" is therefore
  a review obligation, not a check.
- K4b adds the new datasets collaborator directory to that list, so the rule applies from its
  first commit.

**C6. Nothing purges runs.**
- `archiveChunksBeforeSequence` (`AS/storage/project/retention-store.ts:35-54`) and
  `sweepUnreferencedObjects` (`:56-58`, `content-store.ts:132-140`) have no production caller. A
  grep over `FX/` and `WEB/` non-test sources confirms this.
- See section 2.3 for what that means for datasets.

**C7. Run endpoints check no domain scope.**
- `runs.ts:9-125`, `runtime-sessions.ts:6-31`, and the state-assets GET route
  (`WEB/app/api/programs/automation-studio/state-assets/[projectId]/[sha256]/route.ts:16-24`)
  require only `programs.read`.
- Only the reusable LLM context handlers call `service.assertProjectDomainAccess`
  (`caches.ts:51,60,70,79,89,98,107`; `service.ts:1689-1692`).
- Authenticating "like state-assets" alone would therefore leave dataset rows readable across
  domains. Section 2.2 adds the check.

**C8. The service class and file are frozen.**
- `.structure-baseline.json` freezes `AutomationStudioService` at 223 class members and
  `AS/runtime/service.ts` at 6807 lines.
- `class-methods` counts methods, accessors, and arrow-function properties
  (`scripts/structure-audit/rules/class-methods.mjs:3-24`). A plain `readonly` field is not counted.
- New endpoints therefore reach the collaborator through a `readonly runDatasets` field, never
  through new service methods.
- Every line added to `service.ts` must be offset in the same change. A proposed move (K4c.0)
  frees about 45 lines.

**C9. Three more frozen or full locations.**
- `AS/model/` is frozen at 28 files, so no new model files may be added there.
- `AS/runtime/tests/service.test.ts` is frozen at 4787 lines.
- `AS/runtime/tests/` already holds 25 test files, and a `tests/` folder carries the 25-file cap
  (`docs/architecture/code-structure.md:138-140`).
- New service-level dataset tests therefore go under `AS/runtime/service/datasets/tests/`. The
  precedent is `recordings/tests/proposal-candidates.test.ts`, which runs through the service.

**C10. The web feature list is closed.**
- `WEB/features/automation-studio/tests/architecture-contract.test.ts:74-78` lists the allowed
  top-level directories, and `:305-311` asserts an exact match.
- A new `datasets/` directory therefore needs that list updated.
- The browser endpoint policy is a blocklist (`WEB/features/automation-studio/data-request-policy.ts:22-31,51-53`),
  so new endpoints need no allowlist entry.

**C11. Page limit.**
- The shared helper clamps to 1-200 with a default of 50 (`AS/storage/paging.ts:4-5,14-17`), as
  `listRunActions` does (`runtime-stream-store.ts:259`).
- Use the helper, not the Design's 1-500.

**C12. The JSONL fallback has no reachable case.**
- The project database pool exists whenever a data directory exists (`service.ts:713-721`).
- Without one, `paths.root` is unset and the existing fallback writes nothing
  (`summaries/store.ts:338,378`).
- The only other trigger is an exception that `tryWithRuntimeStreamStore` swallows (`:347-349`).
- Recommendation: drop `runtime/runs/{runId}/datasets/*.jsonl`. When the store cannot be opened,
  fail the attempt instead (fail closed).

## 2. Settled facts

### 2.1 Versions and where Migration Notes live

- **Versions.** `@fluxiq/contracts` is 0.2.0 and `fluxiq` is 0.4.0 (`package.json:3` of each). The
  same numbers are stated in `docs/architecture/package-boundaries.md:86`.
- **Release policy** (`:87-94`):
  - a compatible change is a patch version;
  - a change a consumer observes is a minor version with a Migration Notes entry, even when
    every signature stays the same.
- **Migration Notes** is `package-boundaries.md:102`. Entries run newest first: 0.4.0 at `:104`,
  0.3.0 at `:335`, 0.2.0 at `:413`.
- **Plan.**
  - `@fluxiq/contracts` goes to 0.2.1, because it only adds exports.
  - `fluxiq` goes to 0.5.0, with an entry above `:104`, because K4-K6 change observable behaviour
    (listed in K10).

### 2.2 Permission and domain-scope check per dataset endpoint

The existing handlers show the pattern:
- `registry.register({ permission })` is enforced before the handler runs
  (`_shared/api.ts:39-47,59-69`).
- `await service.assertProjectDomainAccess(projectId, request.scope.domainId)` comes from
  `caches.ts:51`.
- The web route builds the scope from `?domainId=` (`WEB/lib/program-route.ts:11-13`), and the
  browser client appends it (`WEB/features/programs/program-api.ts:120-127`).

| Endpoint | Permission | Domain scope | Actor |
| --- | --- | --- | --- |
| `list-run-datasets` | `programs.read` (as `get-flow-run-detail`, `runs.ts:30`) | `service.assertProjectDomainAccess(projectId, request.scope.domainId)` | none |
| `get-run-dataset-page` | `programs.read` | same | none |
| `export-run-dataset` | `programs.read` | same | `request.actor!.userId`, for the audit event |
| Streaming GET route | session cookie, then `auth.role.permissions.includes("programs.read")` (state-assets `route.ts:19-23`) | `fluxiq.programs.automationStudio.assertProjectDomainAccess(projectId, programDomainScope(request.url).domainId)`; on failure return 404 | `auth.user.id` |

`FX/programs/tests/permission-matrix.test.ts:15-49` covers new endpoints automatically. Every
permission must come from its closed set (`:31-33`).

### 2.3 How runs, sessions, and content objects are kept and purged today, and how datasets follow

**Today:**
- **Runtime sessions** (`projects/{id}/runtime/sessions/{runId}.json`, `service.ts:5187`) and
  **run details**, in SQLite `runtime_runs`, `runtime_action_summaries`, and
  `runtime_event_chunks` or the JSON fallback, are **never deleted** individually.
- **Project deletion** removes the whole project directory (`service.ts:4833-4855`). That is
  `automationDataDir/projects/{id}` (`service/paths/project.ts:11-14`; `service.ts:719-721`), the
  same directory that holds `project.sqlite` (`storage/project/database.ts:84-88`).
- **Event-chunk archiving** exists but nothing calls it (`retention-store.ts:35-54`).
- **Content objects** are removed only when unreferenced (`content-store.ts:132-140`). Nothing
  calls that sweep in production.
- **Recording deletion** prunes unreferenced objects (`service/recordings/deletion.ts:144-151`).
- **Reusable LLM contexts** are the only data with a time-to-live and a purge:
  - store `reusable-llm-context-store.ts:218-221`;
  - endpoint `purge-expired-reusable-llm-contexts`, requiring `flows.write` (`caches.ts:94-101`).

**Datasets follow:**
- **Storage and removal.** Rows live in `project.sqlite` and are removed with the project directory.
- **No per-row objects** (section 2.4). Datasets therefore do not depend on the sweep that nothing
  runs.
- **Delete method.** `AutomationStudioProjectRunDatasetStore.deleteRunDatasets(runId)` deletes rows
  and dataset records and writes a `deleted` audit event. This is the hook a future run purge
  calls.
- **No scheduler** is added, since none exists.
- **"Retention-bound" therefore means "lives as long as the project" today.** Say this plainly in
  `persistence.md`.

### 2.4 Row and byte caps (decisions, with the evidence they rest on)

| Cap | Value | Evidence and reason |
| --- | --- | --- |
| Schema fields | at most 200; ids `^[A-Za-z0-9_-]{1,100}$`, unique; labels 1-200 characters, unique | no precedent; CSV headers use labels |
| `datasetId` | `^[A-Za-z0-9._:-]{1,200}$` | the id rule in `runtime-stream-store.ts:620` |
| Rows per capture | `maxRecords` default 1,000, ceiling 10,000 | rows stay in the executed `values` map, in memory |
| Row size | at most 64 KiB of UTF-8 JSON; a larger row counts as invalid | far below the object threshold of 256 KiB (`AS/storage/object-store.ts:9`), so no per-row content objects are needed |
| Rows per dataset per run | 100,000; beyond that `truncated: true` and later rows are dropped | no precedent; bounds a stream to about 6.1 GiB worst case |
| Page | 1-200, default 50, via `automationStudioPageLimit` | `paging.ts:14-17` (C11) |
| Inline export (`export-run-dataset`) | at most 10,000 rows and 5 MiB, else `{ tooLarge: true, rowCount, downloadPath }` | the program route serializes the whole JSON with no cap (`WEB/app/api/programs/[programId]/[endpoint]/route.ts:27,45`); the state-asset cap is 20 MiB (`state-assets route.ts:13`) |
| Stream | at most 100,000 rows and 256 MiB; a byte overrun ends the body and records `export_truncated` | headers are already sent by then |

### 2.5 Export audit events

**Precedent:** `reusable_llm_context_audit_events`:
- migration 0017, `AS/storage/project/schema/reusable-llm-contexts.ts:39-56`;
- insert `reusable-llm-context-store.ts:243-248`;
- detail limited to 16 keys and 200-byte strings, forbidden keys rejected (`:328-333`).

**`adaptation_audit_events`** uses a check-constrained `event_type` (`schema/adaptations.ts`,
migration 0009).

**Design:** a `run_dataset_audit_events` table in migration 0019, with typed columns only and **no
free-text detail**, so no value can be written into it:
- `event_id` (primary key);
- `event_type`, checked to be one of `exported`, `export_truncated`, `export_failed`, or `deleted`;
- `run_id`, `dataset_id`, `actor_id`;
- `format`, checked to be `csv`, `json`, or null;
- `row_count` and `byte_count` (integers);
- `created_at_ms`.

**When events are written:**
- `exportRunDataset` writes `exported` or `export_failed`.
- The streaming route writes `exported` when the body completes, `export_truncated` on a byte
  overrun, or `export_failed` on an error.
- `deleteRunDatasets` writes `deleted`.

Page reads are not audited, matching run reads. K11 later adds `revealed`.

### 2.6 Streaming-route authentication, following state-assets

Route: `WEB/app/api/programs/automation-studio/run-datasets/[projectId]/[runId]/[datasetId]/route.ts`,
GET only.
1. `readSessionId()` reads the cookie, and `identityAccess.validateSession`
   (`state-assets route.ts:19-22,84-87`); return 401 on failure.
2. Require `programs.read`; return 403 otherwise (`:23`). Bearer tokens are not accepted; the
   state-assets GET route does not accept them either.
3. Validate `projectId`, `runId`, and `datasetId` with `^[A-Za-z0-9._:-]{1,200}$`, and `format`
   with `csv|json`; return 400 otherwise.
4. Run `assertProjectDomainAccess(decodedProjectId, programDomainScope(request.url).domainId)`;
   return 404 when it throws. This goes beyond state-assets (C7).
5. Build a `new ReadableStream({ pull })` over `service.runDatasets.streamRunDataset(...)`.
6. Set these headers:
   - `Content-Type`: `text/csv; charset=utf-8` or `application/json; charset=utf-8`;
   - `Content-Disposition: attachment; filename="fluxiq-dataset-<runId>-<datasetId>.<ext>"`, with
     the name sanitized to `[A-Za-z0-9._-]`;
   - `Cache-Control: private, no-store`, not `immutable` as at `:34`, because a `replace` write
     changes the content;
   - `X-Content-Type-Options: nosniff`.

### 2.7 How `handling: exclude|encrypt` threads through capture, with `encrypt` refused until K11

1. **K1 contract.**
   - `parseAutomationStudioRecordSchema(value, { allowEncrypt })` returns issue
     `record_schema.encrypt_unavailable` for `encrypt` unless `allowEncrypt` is true. Nothing
     passes it before K11.
   - `storedAutomationStudioRecordSchema(schema)` returns the schema without any `exclude`
     fields. That result is what is stored and hashed, so excluded field ids never reach disk.
2. **K3, before dispatch.**
   - `builtin.policy.action` `execute` parses `recordOutput` and returns `failed` with **no
     effect** when parsing fails, so the domain output is never dispatched. The failure record is
     `graph_validation_or_unknown_node`, code `record_output.encrypt_unavailable` or
     `record_output.invalid`, not retryable, stage `dispatch`.
   - The parameter sets `allowStateBinding: false`, so no binding can replace the schema at run
     time.
3. **K4, capture.**
   - `validateAutomationStudioRecords` copies only include fields by id, in schema order. It is an
     allowlist copy, never a delete, so unknown keys also drop.
   - Capture replaces the `recordsPath` subtree of `outputs.result` with the validated array.
     Excluded values therefore leave the node's outputs, the values map, and the saved trace.
4. **K4d, command attempts.** A dispatch that carries `recordOutput` sets `withheldResultPayload`,
   so `attempt.json` stores `"[withheld]"` in place of `result.payload` (C3).
5. **K2, store.** `appendBatch` rejects any row key not in the stored schema. This is a second
   check behind capture.
6. **K8 and K9, preview and export.** Columns come from the stored schema only. The CSV encoder
   writes only the stored field ids.
7. **K7, proposal lift.** An invalid or `encrypt` `recordOutput` **throws** and rejects the
   candidate, like an undeclared output (`proposal-candidates.ts:49-51`). It is not dropped the way
   `expectedState` is (`:150-161`). Dropping it would leave excluded fields in `outputs.result`.

## 3. Open questions 1-4 answered

**OQ1: how dataset rows are withheld.** **Store rows raw, protected, and kept as long as the
project**, as recommended. Do not strip withheld text.
- **Why not strip.** Withholding replaces substrings (`trace-withholding.ts:39-42,122`), so an
  extracted "Apple iPhone" containing a searched term would be corrupted in stored data.
- **What protects rows:**
  - `programs.read` plus `assertProjectDomainAccess` (2.2);
  - identity markers keep rows out of the saved trace (K4);
  - excluded columns never reach any store (2.7);
  - command attempts withhold the payload (C3).
- **Retention** is the project lifetime (2.3).
- **Encryption.** Rows in SQLite are not sealed. `putBytes({ protect: true })`
  (`content-store.ts:48-51`) needs a host provider and would apply only to object bodies, which
  datasets do not use. Per-column encryption is K11.

**OQ2: whether output references and withholding exempt persisted rows.** **No exemption; no
`$output` binding.**
- The executed values map already holds the rows in memory. Use the longest own-key prefix in
  `readRecordPath` (`parameter-bindings.ts:118-128`) instead of a new binding kind.
- Keep withholding as it is. Safety is proved, not declared (`trace-withholding.ts:20-27`).
- An exemption keyed on identity would leave an unprotected copy wherever a node copies a row. The
  saved trace is readable with `programs.read` and no domain check (C7), which is weaker than the
  dataset endpoints.
- Instead, the identity summary replaces captured arrays and rows with markers first.
- The withholding walk must treat the marker objects `{ $dataset: … }` and
  `{ $datasetRow: … }` as executor-owned structure (`trace-withholding.ts:43-46`). Otherwise a
  `recordCount` equal to a withheld number would be rewritten.

**OQ3: side-effect class for read-only extraction.** **No change; the question has no effect on
execution.**
- `sideEffectClassForNode` (`node-execution.ts:179-185`) is called only at `:65`, on the path for
  nodes without `execute`.
- `builtin.policy.action` has `execute` (`nodes/policy/action.ts:36-41`), so its `external` class
  at `:182` is never passed anywhere.
- Recording-derived definitions are turned back into `builtin.policy.action` at run time
  (`service.ts:5830-5844`).
- The output safety level (`FX/domains/index.ts:43-47`) is already read for the element-target
  confidence floor (`io-policy.ts:294-304`).
- Deriving `read` would change nothing a consumer observes today. Do not build it ahead of a real
  consumer (`code-structure.md:40-43`).

**OQ4: default `recordsPath`.** **The domain output declares a default and the node parameter
overrides it, resolved when the proposal is lifted and stored on the node.**
- Resolution order:
  1. `candidate.recordOutput.recordsPath`;
  2. `io.getOutput(domainId, outputId)?.definition.metadata?.recordsPath`, a string. `metadata`
     exists on the output definition (`FX/domains/index.ts:49`), with precedent for reading it at
     `io-policy.ts:205,295`.
  3. Otherwise the candidate is rejected.
- `recordsPath` is **required** in the stored `AutomationStudioRecordOutput`, so a Flow says
  exactly what it reads, and a hand-authored node must state it.
- Core never hard-codes `extracted`, because domain vocabulary stays out of the framework
  (`trace-withholding.ts:29-34`).

## 4. Phases

Every acceptance command runs alone, one at a time (the machine has faulty RAM). Fluxiq test
paths are relative to `packages/fluxiq`. After a phase's tests, run
`pnpm --filter <package> check`. "Mutation target" means: break the named guard, observe the named
test fail, then revert. Record the pair in the working document's ledger.

### K1: record-set contracts (`@fluxiq/contracts`)

**Create `CT/record-sets/`:**
- `index.ts`: the barrel.
- `schema.ts`:
  - types `AutomationStudioRecordValueType` (`string|number|boolean|url|datetime|json`),
    `AutomationStudioRecordFieldHandling` (`include|exclude|encrypt`),
    `AutomationStudioRecordField` (`id`, `label`, `valueType`, `required?`, `handling?`), and
    `AutomationStudioRecordSchema` (`schemaVersion: "0.1"`, `fields`, `primaryKey?: string[]`);
  - constants `AUTOMATION_STUDIO_RECORD_VALUE_TYPES`, `AUTOMATION_STUDIO_RECORD_FIELD_HANDLINGS`,
    `AUTOMATION_STUDIO_RECORD_SCHEMA_LIMITS`.
- `output.ts`:
  - type `AutomationStudioRecordOutput` (`datasetId`, `label?`, `recordsPath` required, `schema`,
    `writeMode: append|replace`, `maxRecords?`);
  - constant `AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS` holding the section 2.4 values.
- `dataset.ts`:
  - types `AutomationStudioRunDatasetSummary` (`runId`, `datasetId`, `label?`, `nodeIds`,
    `schemaDigest`, `recordCount`, `truncated`, `invalidCount`, `updatedAt`),
    `AutomationStudioRunDatasetPage` (`summary`, `schema`, `rows: JsonObject[]`,
    `nextCursor: string|null`), and `AutomationStudioRunDatasetExportFormat`;
  - constant `AUTOMATION_STUDIO_RUN_DATASET_EXPORT_LIMITS`.
- `parse-schema.ts`:
  - `parseAutomationStudioRecordSchema(value, options?) → { ok: true; schema } | { ok: false; issues: string[] }`;
  - `parseAutomationStudioRecordOutput(value, options?)` with the same result shape;
  - `storedAutomationStudioRecordSchema(schema)`.
  - Issue codes are stable strings, for example `record_schema.duplicate_field_id` and
    `record_schema.encrypt_unavailable`.
- `validate-records.ts`: `validateAutomationStudioRecords(rows: unknown, schema, { maxRecords }) → { rows: JsonObject[]; invalidCount; truncated; issues }`.
  - Only a finite number passes as `number`.
  - `url` must parse with `URL` and use `http:` or `https:`.
  - `datetime` must pass `Date.parse`.
  - A missing required field, or a row over 64 KiB (measured with `TextEncoder`), makes the row
    invalid.
- `encode-csv.ts`: `encodeAutomationStudioRecordsCsvHeader(schema)` and
  `encodeAutomationStudioRecordsCsvRows(schema, rows)`.
  - Quoting follows RFC 4180.
  - Formula-injection escaping: prefix `'` to string, url, and json cells that start with
    `= + - @ \t \r`. Number, boolean, and datetime cells are never prefixed.

**Change:**
- `CT/automation-studio.ts:7`: add `export * from "./record-sets/index.ts";`, following the
  `failure/` pattern.
- No `tsconfig.build.json` change. It excludes `src/**/*.test.ts`, so `tests/` must hold only
  `.test.ts` files.

**Tests:**
- `CT/record-sets/tests/parse-schema.test.ts`:
  - a valid schema round-trips;
  - duplicate id or label rejected;
  - bad id pattern, more than 200 fields, and unknown `valueType` rejected;
  - `encrypt` refused by default and accepted with `allowEncrypt`;
  - `storedAutomationStudioRecordSchema` removes `exclude` fields and leaves the input unmodified;
  - a `recordOutput` without `recordsPath`, or with a bad `datasetId`, rejected;
  - `maxRecords` above the ceiling rejected.
- `CT/record-sets/tests/validate-records.test.ts`:
  - an allowlist copy drops `exclude` fields and unknown keys;
  - schema field order kept;
  - each value type coerced or rejected;
  - required field missing counts as invalid;
  - a 64 KiB row passes and 64 KiB plus one byte is invalid;
  - `maxRecords` boundary: N passes and N+1 is truncated;
  - a non-array input returns an issue.
- `CT/record-sets/tests/encode-csv.test.ts`:
  - quotes, commas, and newlines are quoted;
  - `=1+1`, `+`, `-`, `@`, tab, and carriage-return strings are prefixed;
  - a negative number cell is not prefixed;
  - the header uses labels;
  - a column missing from the schema is never written.

**Acceptance:**
`pnpm --filter @fluxiq/contracts exec vitest run src/record-sets/tests --no-file-parallelism`,
then `pnpm --filter @fluxiq/contracts check`.

**Mutation targets:**
- `allowEncrypt` default flipped;
- the allowlist copy replaced by a spread, so an excluded field survives;
- `=` removed from the formula prefix set;
- the truncation comparison `>` changed to `>=`;
- the row byte check removed.

### K2: schema migration and `run-dataset-store`

**Create `AS/storage/project/schema/run-datasets.ts`:** the constant
`AUTOMATION_STUDIO_PROJECT_RUN_DATASET_MIGRATION`, id `0019_run_datasets`. The last existing id is
`0018` (`reusable-llm-contexts.ts:58`). Order comes from the array, not the id: `0009` is used
twice (`adaptations.ts:6`, `ui-query-indexes.ts:6`). It creates:
- **`run_datasets`**:
  - `run_id` and `dataset_id` (text), primary key `(run_id, dataset_id)`;
  - `label`, `schema_json`, `schema_digest`;
  - `node_ids_json`, default `'[]'`;
  - `record_count` and `invalid_count` (integer, at least 0);
  - `truncated` (0 or 1);
  - `created_at_ms` and `updated_at_ms`.
- **`run_dataset_rows`**:
  - `run_id`, `dataset_id`;
  - `ordinal`, at least 1;
  - `attempt_id`, `row_json`;
  - primary key `(run_id, dataset_id, ordinal)`.
- **`run_dataset_audit_events`**: as in 2.5.
- **Indexes:** `run_datasets_run_idx (run_id, updated_at_ms desc, dataset_id)` and
  `run_dataset_audit_events_run_idx (run_id, dataset_id, created_at_ms, event_id)`.
- **Foreign-key guard:** `...foreignKeyGuards("run_datasets", "run_id", "runtime_runs", "run_id", false)`,
  following `schema/adaptations.ts:51-60`. The run row exists before the first node runs, because
  the running session is written at `service.ts:3448-3461`.

**Change:**
- `schema/index.ts`: add an export line.
- `schema/table-names.ts:3-46`: add the three tables to `AUTOMATION_STUDIO_PROJECT_DOMAIN_TABLES`.
  `storage/project/tests/schema.test.ts:25` asserts every entry exists.
- `storage/project/administration.ts:2` (import) and `:150`: append the migration to the end of
  `AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS`.

**Create `AS/storage/project/run-dataset-store.ts`:** class
`AutomationStudioProjectRunDatasetStore`.
- `static open({ pool, projectId })` takes a lease, as `runtime-stream-store.ts:102-123` does.
- `close()` releases it.
- `appendBatch({ runId, datasetId, label?, nodeId, attemptId, schema, schemaDigest, writeMode, rows, invalidCount, truncated, now? }) → AutomationStudioRunDatasetSummary`:
  - runs in one `database.transaction` (`database.ts:146-159`);
  - `replace` deletes the dataset's rows first;
  - `append` continues from `max(ordinal)+1`;
  - applies the 100,000-row cap;
  - throws `Run dataset schema changed within one run.` when the stored digest differs;
  - throws when a row key is not in the stored schema.
- `listDatasets(runId)`.
- `getPage({ runId, datasetId, limit, cursor })`:
  - clamps with `automationStudioPageLimit`;
  - encodes the cursor with `encodeAutomationStudioPageCursor`, owner
    `run-dataset:${runId}:${datasetId}`, filter hash `automationStudioFilterHash({})`, values
    `{ ordinal }`, following `runtime-stream-store.ts:261-280`.
- `readRows({ runId, datasetId, afterOrdinal, limit })`: limit at most 500, for streaming.
- `appendAuditEvent(...)` and `listAuditEvents({ runId, datasetId?, limit })`.
- `deleteRunDatasets(runId, { actorId? })`: deletes rows and datasets, keeps audit rows, and writes
  `deleted`.
- Exported function `runDatasetSummariesForRun(sql, runId)`, used by K5.

**Also change** `storage/project/index.ts`: add `export * from "./run-dataset-store.ts";`.

**Tests:** `AS/storage/project/tests/run-dataset-store.test.ts`, following
`runtime-stream-store.test.ts:1-35`: use a temporary root, seed the flow, and write a run summary
with `upsertRunSummary`.
- append assigns ordinals 1..N, then N+1..;
- `replace` resets to 1;
- a digest mismatch throws;
- a row with a non-schema key throws and writes nothing;
- the dataset cap sets `truncated`;
- the page cursor round-trips, `limit: 999` clamps to 200, and a cursor from another dataset is
  rejected;
- audit insert and list work;
- `deleteRunDatasets` removes rows and keeps audit;
- an unknown `run_id` is rejected by the guard.

`storage/project/tests/schema.test.ts` needs no new case; its `:25` loop covers the tables.

**Acceptance:**
`pnpm --filter fluxiq exec vitest run src/programs/automation-studio/storage/project/tests/run-dataset-store.test.ts src/programs/automation-studio/storage/project/tests/schema.test.ts --no-file-parallelism`

**Mutation targets:**
- the `replace` delete removed;
- `append` starts at ordinal 1;
- the row-key check removed;
- the cap comparison changed;
- the cursor owner check removed.

### K3: `recordOutput` parameter and `records` port on the policy action

**Change `AS/nodes/policy/action.ts`:**
- Outputs `:11-14`: add `{ id: "records", label: "Records", valueType: "array", role: "data" }`.
- Parameters `:15-33`: add
  `{ id: "recordOutput", label: "Save extracted records", valueType: "json", defaultValue: null, allowStateBinding: false }`.
- `execute`, `:36-41`:
  - when `parameters.recordOutput` is not null, call `parseAutomationStudioRecordOutput` (no
    `allowEncrypt`);
  - on failure, return `{ status: "failed", route: "failed", effects: [], outputs: { error }, message, failure }`
    (2.7);
  - on success, add `recordOutput: parsed.output` to the effect payload;
  - with no `recordOutput`, the payload is byte-identical to today.

Core does not forward the schema to the domain. The dispatch payload is `action.parameters` only
(`io-policy.ts:38,93`).

**Tests:** new `AS/nodes/policy/tests/action.test.ts`.
- a valid `recordOutput` is carried in the effect;
- `encrypt` fails with no effect and code `record_output.encrypt_unavailable`;
- a malformed schema fails with no effect;
- an absent `recordOutput` yields the unchanged payload;
- the `records` port is declared;
- `allowStateBinding` is false.

Also run `AS/nodes/tests/registry.test.ts`. It references `builtin.policy.action`, and I did not
read whether it pins the ports.

**Acceptance:**
`pnpm --filter fluxiq exec vitest run src/programs/automation-studio/nodes/policy/tests/action.test.ts src/programs/automation-studio/nodes/tests --no-file-parallelism`

**Mutation targets:** the early return removed, so `encrypt` would dispatch; `recordOutput` left
out of the payload.

### K4: capture, saved-trace summary, record-batch hook, datasets collaborator, command-attempt payload

**K4a: executor (`AS/runtime/executor/`).**
- **`contracts.ts:153-192`:** add
  `onRecordBatch?: (batch: AutomationStudioRecordBatch) => Promise<AutomationStudioRunDatasetSummary> | AutomationStudioRunDatasetSummary`.
  Export type `AutomationStudioRecordBatch`: `{ nodeId, attemptId, datasetId, label?, writeMode, schema, schemaDigest?, rows, invalidCount, truncated }`.
- **Create `record-capture.ts`:** `captureAutomationStudioRecordBatch({ effect, dispatched, nodeId, attemptId }) → { result, batch? }`.
  - It acts only when `effect.type === "policy.output.dispatch"`, the payload has a
    `recordOutput` object, and `dispatched.status !== "failed"`.
  - It re-parses `recordOutput`.
  - It reads `outputs.result` at `recordsPath`. A non-array fails with category
    `output_not_observed` (`CT/failure/adaptive-class.ts`), code `record_output.records_missing`,
    retryable true.
  - It validates the rows, writes `outputs.records` as the validated array, and replaces the
    `recordsPath` subtree of `outputs.result` with **the same array reference**.
- **Create `record-summary.ts`:** `automationStudioRecordTraceSummary()` returns:
  - `record(batch, firstOrdinal)`;
  - `include(captured)`, for a Call Flow child;
  - `captured()`;
  - `apply<TTrace>(trace)`. It walks at most 64 levels, the same bound as
    `trace-withholding.ts:77`. It replaces each captured array with
    `{ $dataset: { datasetId, recordCount, schemaDigest } }`, where `recordCount` is the batch
    length, and each captured row object with `{ $datasetRow: { datasetId, ordinal } }`. It
    returns the trace unchanged when nothing was captured.
- **Create `run-state.ts`:** `automationStudioRunState(options) → { records }`. K6 adds
  `variables` and `loops`.
- **`node-execution.ts`:**
  - the signature (`:13-20`) gains `runState` after `withholding`. The only callers are
    `graph-run.ts:179,181`.
  - in `dispatchAutomationStudioEffects` (`:141-164`), after each successful dispatch, run capture.
    With a batch:
    - `await options.onRecordBatch?.(batch)`, then `runState.records.record(batch, summary)`;
    - if the hook throws, fail the result with category `action_failed`, code
      `record_output.persist_failed`, retryable false. Do not swallow the error.
- **`graph-run.ts`:**
  - `:48`: create the run state.
  - `:51-54`: also `include` each child's captured set, from a new `WeakMap` like `:21`.
  - `:55`: `saved = withholding.apply(withholdRunInputs(runState.records.apply(executed), inputs))`.
  - The map at `:56` gains the captured set.
- **`trace-withholding.ts:172-196`:** return an object whose only key is `$dataset` or
  `$datasetRow` untouched.
- **`executor/index.ts`:** export `AutomationStudioRecordBatch` as a type.

**K4b: collaborator (`AS/runtime/service/datasets/`, new directory).**
- **`index.ts`.**
- **`run-datasets.ts`**, class `AutomationStudioRunDatasets`:
  - constructor `(projects: AutomationStudioProjectStore, pool: AutomationStudioProjectDatabasePool | undefined)`;
  - `readonly available: boolean`;
  - `recordBatchHandler(projectId, runId)`: opens the K2 store for each batch, computes
    `schemaDigest` as SHA-256 of the stable JSON of the stored schema (`service/stable-json.ts`
    exists; its export name was not read), calls `appendBatch`, and **throws** when the store
    cannot be opened (C12);
  - `listRunDatasets({ projectId, runId })`;
  - `getRunDatasetPage({ projectId, runId, datasetId, limit, cursor })`;
  - `exportRunDataset({ projectId, runId, datasetId, format, actorId })`, applying the inline caps
    and returning `tooLarge` otherwise, with audit;
  - `streamRunDataset({ ..., actorId }) → AsyncIterable<string>`, reading pages of 500 rows, with
    caps and audit;
  - `deleteRunDatasets({ projectId, runId, actorId })`.
- **`service/index.ts`:** add `export * from "./datasets/index.ts";`.
- **`scripts/structure-audit/config.mjs:39`:** add
  `{ path: "packages/fluxiq/src/programs/automation-studio/runtime/service/datasets/", reason, remedy }`
  (C5).

**K4c: service wiring (`AS/runtime/service.ts`, serial).**
- **0. Pure move first.** Move `recordingCandidateDefinition`, `recordingCandidateParameters`, and
  `materializeRecordingNode` (`service.ts:5799-5844`) into
  `AS/runtime/service/recordings/candidate-definitions.ts`. Export them from `recordings/index.ts`
  and import them in `service.ts`. The service shrinks by about 45 lines.
- **1. Readonly field.** Add `readonly runDatasets: AutomationStudioRunDatasets;` beside
  `:673-680`, and construct it beside `:740-747` from `this.projects` and
  `this.runtimeProjectDatabasePool`.
- **2. Hook wiring.** In the run options block (`:3421-3436`), add
  `if (input.projectId && this.runDatasets.available) graphOptions.onRecordBatch = this.runDatasets.recordBatchHandler(input.projectId, session.runId);`.
- Retries and live patches reuse the same options (`:3540-3547,3594-3600`), so check whether they
  keep the same `runId` (see Not verified).
- Afterwards run `pnpm structure:baseline` to ratchet the lower line count.

**K4d: command-attempt payload (`FX/runtime`, then `io-policy`).**
- **`FX/runtime/contracts.ts:163-173`:** add `withheldResultPayload?: boolean` to
  `FluxIQRuntimeDispatchContext`, documented as "the attempt the runtime keeps and saves holds
  `FLUXIQ_RUNTIME_WITHHELD_VALUE` in place of `result.payload`; the caller still receives it".
- **`FX/runtime/service.ts`:** carry the flag the way `withheldValues` reaches `settleAttempt`
  (`:278-287`), and apply it in `withheldResult` (`:430-437`). The file is 454 lines.
- **`AS/runtime/io-policy.ts:96-102`:** add `...(payload.recordOutput ? { withheldResultPayload: true } : {})`.

**Tests:**
- `AS/runtime/executor/tests/record-capture.test.ts`:
  - rows captured;
  - an excluded field absent from both `outputs.records` and `outputs.result`;
  - `outputs.result.<path> === outputs.records`, by identity;
  - a non-array fails with `record_output.records_missing`;
  - a failed dispatch is not captured;
  - no `recordOutput` returns the result by identity.
- `AS/runtime/executor/tests/record-summary.test.ts`:
  - arrays and rows replaced by identity;
  - an array with equal values but a different reference left untouched;
  - `include` from a child;
  - nothing captured returns the same trace.
- `AS/runtime/executor/tests/node-execution.test.ts`, extended:
  - the hook is called once, with validated rows, before the attempt is returned;
  - a throwing hook fails with `record_output.persist_failed`;
  - with no hook, `records` is still emitted.
- `AS/runtime/executor/tests/graph-run.test.ts`, extended:
  - `JSON.stringify(saved)` contains no synthetic row text while the executed trace does, in
    `values` and in a later node's `inputs`;
  - `node.records` flows over a data edge into `builtin.data.filter-list` `items`;
  - a Call Flow child's rows are markers in the parent's saved trace.
- `AS/runtime/executor/tests/trace-withholding.test.ts`: a `$dataset.recordCount` equal to a
  withheld number is kept.
- `AS/runtime/tests/io-policy.test.ts` (add cases only; the folder is full):
  - through `RuntimeService` with `FileRuntimeStore` (`:7`), a `recordOutput` dispatch saves
    `result.payload` as `"[withheld]"` in `attempt.json` while the dispatcher result keeps the rows;
  - without `recordOutput`, the payload is unchanged.
- `AS/runtime/service/datasets/tests/run-datasets.test.ts`, run through
  `AutomationStudioService` with an `IoRegistry` output returning `{ rows: [...] }` (pattern
  `runtime/tests/service.test.ts:211-212`):
  - persisted rows equal the validated rows;
  - list and page work;
  - export as CSV and JSON;
  - `tooLarge` at 10,001 rows;
  - an audit event is written;
  - delete works;
  - a closed pool fails the attempt.
- `AS/runtime/service/recordings/tests/candidate-definitions.test.ts`: the moved functions give the
  same output as before the move (a characterization test written before the move).
- The FX runtime service test gets a `withheldResultPayload` case. The FX runtime test folder
  location was not read.

**Acceptance:**
`pnpm --filter fluxiq exec vitest run src/programs/automation-studio/runtime/executor/tests src/programs/automation-studio/runtime/tests/io-policy.test.ts src/programs/automation-studio/runtime/service/datasets/tests src/programs/automation-studio/runtime/service/recordings/tests --no-file-parallelism`,
then `pnpm --filter fluxiq check` and `pnpm structure:check`.

**Mutation targets:**
- the allowlist copy replaced by a spread;
- the `outputs.result` rewrite skipped, so row text appears in the saved trace;
- `records.apply` removed from `graph-run.ts:55`;
- the child `include` removed;
- the hook error swallowed;
- `withheldResultPayload` ignored;
- the marker skip in the withholding walk removed.

### K5: run detail `datasets` and attempt `recordCount`

**Change:**
- **`AS/model/flow-adaptation.ts:308-322`:** add `datasets?: AutomationStudioRunDatasetSummary[]`,
  a type import from `@fluxiq/contracts/automation-studio`.
- **`AS/storage/project/runtime-stream-store.ts`, `getRunDetail` (`:232-255`):** join
  `runDatasetSummariesForRun(sql, runId)` from K2 in both the compact path (`:237-253`, which the
  web uses: `run-queries.ts:42-43`) and the full path (`:254`). Write `datasets` only when it is
  non-empty, and name every field.
  - A join at the store level keeps `service.ts` unchanged.
  - The JSON-fallback detail (`service.ts:3844-3845`) has no datasets, consistent with C12.
- **`AS/runtime/service/summaries/conversions.ts:163-171`:** add `recordCount` to the attempt
  metadata from `attempt.outputs.records.$dataset.recordCount` when it is a finite number. It
  reaches SQL through `detail_json` (`runtime-stream-store.ts:419`).

**Tests:**
- `AS/storage/project/tests/runtime-stream-store.test.ts`: `datasets` present in compact and full
  detail, and absent when no dataset exists.
- New `AS/runtime/service/summaries/tests/conversions.test.ts`: `recordCount` read from the marker,
  and absent when there is no marker.

**Acceptance:**
`pnpm --filter fluxiq exec vitest run src/programs/automation-studio/storage/project/tests/runtime-stream-store.test.ts src/programs/automation-studio/runtime/service/summaries/tests --no-file-parallelism`.
The runtime-stream-store suite includes a million-event case of about 158 MB
(`runtime-stream-store.test.ts:9-15`), so run it alone.

**Mutation targets:** `datasets` omitted on the compact path; `recordCount` read from the wrong key.

### K6: run-scoped variables, `for-each`, `write-records`, dotted paths

**Changes:**
- **`AS/runtime/executor/run-state.ts`:** add `variables: Map`, seeded once from
  `options.variables`, and `loops: Map<nodeId, { items, index }>`.
- **`node-execution.ts:102`:** use `variables: runState.variables`, plus
  `iteration: { get, set }` bound to `node.id`.
- **`AS/nodes/contracts.ts:104-113`:** add `iteration?: { get(): AutomationNodeIterationState | undefined; set(state?: AutomationNodeIterationState): void }`
  and type `AutomationNodeIterationState = { items: JsonValue[]; index: number }`.
- **Create `AS/nodes/control-flow/for-each.ts`**, exporting `forEachNode`, id
  `builtin.control.for-each`:
  - inputs `items` (array, required);
  - outputs `body` and `done`, which become branch ports automatically
    (`nodes/shared/definition.ts:48`), and `item`, `index`, `count` as data;
  - parameters `maxIterations` (default 100, range 1-10,000) and `maxStepsPerIteration`
    (default 50);
  - `execute`:
    - without state, read `items` and fail with code `for_each.max_iterations_exceeded` when there
      are too many;
    - while `index < count`, route `body`, emit `item`, `index`, `count`, and store `index+1`;
    - otherwise clear the state and route `done`;
    - with no `iteration` in context, fail.
- **`AS/nodes/control-flow/index.ts:9`:** add `forEachNode`.
- **`graph-run.ts:165-166` (step budget):**
  - when the current node is `builtin.control.for-each` and the attempt routed `body`, add
    `maxStepsPerIteration` to the run's budget;
  - cap the whole budget at `AUTOMATION_STUDIO_MAX_RUN_STEPS = 100_000`.
  - Precedent for a definition-id special case: `graph-navigation.ts:8`.
  - Without the allowance, 100 items with a 3-node body need 400 steps, above the default 250.
- **Create `AS/nodes/data/write-records.ts`**, exporting `writeRecordsNode`, id
  `builtin.data.write-records`:
  - input `records` (array);
  - parameter `recordOutput` (json, not bindable; `recordsPath` ignored);
  - `execute` parses as K3 does and emits effect
    `{ type: "records.write", payload: { recordOutput, records } }`.
- **`AS/nodes/data/index.ts:7`:** add `writeRecordsNode`.
- **`AS/runtime/executor/record-capture.ts`:** also capture `records.write` from the node result
  directly, since no dispatcher handles it (`node-execution.ts:144`).
- **`AS/nodes/parameter-bindings.ts:118-128`:** after the exact-key miss, try own keys from the
  longest dotted prefix down to one segment, then walk the rest.

**Tests:**
- New `AS/nodes/control-flow/tests/for-each.test.ts`: iterates, then `done`; the maximum is
  exceeded; state is missing; an empty list goes straight to `done`.
- New `AS/nodes/data/tests/write-records.test.ts`: the effect payload; `encrypt` refused with no
  effect.
- `AS/nodes/tests/parameter-bindings.test.ts`:
  - `recorded.candidate.x.result.extracted` resolves;
  - the longest prefix wins over segment 0;
  - the exact key and state-snapshot paths are unchanged.
- `AS/runtime/executor/tests/graph-run.test.ts`:
  - `set-variable` in `append-list` mode accumulates across three nodes;
  - variables do not carry between two runs;
  - `for-each` over 300 items with a 2-node body completes;
  - the 100,000-step ceiling fails;
  - each `item` in the saved trace is a `$datasetRow` marker.
- `AS/runtime/executor/tests/node-execution.test.ts`: `records.write` persisted through the hook
  with no dispatcher.
- `AS/runtime/tests/composite-executor.test.ts` (add a case): a child's variables are isolated from
  its parent's.

**Acceptance:**
`pnpm --filter fluxiq exec vitest run src/programs/automation-studio/nodes src/programs/automation-studio/runtime/executor/tests src/programs/automation-studio/runtime/tests/composite-executor.test.ts --no-file-parallelism`

**Mutation targets:**
- the per-node `new Map` restored;
- the index increment removed;
- the prefix loop reversed;
- the step allowance not granted;
- the ceiling not enforced.

### K7: mapper candidate `recordOutput` lift and approval write

**Changes:**
- **`AS/nodes/importer-sdk.ts:19-31`:** add
  `recordOutput?: Omit<AutomationStudioRecordOutput, "recordsPath"> & { recordsPath?: string }`.
- **`AS/runtime/recording-flow-proposal.ts:12-29`:** add
  `recordOutput?: AutomationStudioRecordOutput`, documented as "carried into node definitions,
  unlike `expectedState`".
- **`AS/runtime/service/recordings/proposal-candidates.ts`:**
  - after `:66`, compute
    `const recordOutput = liftedRecordOutput(io, input.domainId, outputId, input.candidate.recordOutput)`;
  - it resolves the path in OQ4 order, clones with `structuredClone`, parses, and throws
    `Recording mapper candidate for ${outputId} has an invalid recordOutput: ${issues}`;
  - at `:75`, add `...(recordOutput ? { recordOutput } : {})`;
  - in `appendRecordingProposalToFlow`, `:102-107`, add
    `recordOutput: candidate.recordOutput ? structuredClone(candidate.recordOutput) : undefined`.
- **`AS/runtime/service/recordings/candidate-definitions.ts`,** the file K4c.0 created:
  - `recordingCandidateDefinition` metadata gains `recordOutput`;
  - `materializeRecordingNode` parameter values gain
    `...(isJsonRecord(definition.metadata?.recordOutput) ? { recordOutput: definition.metadata.recordOutput } : {})`.
- **`docs/architecture/automation-studio-native-nodes.md:268-269`** says `expectedState` is not
  carried into node definitions. `recordOutput` must be carried, or excluded fields would reach
  `outputs.result` (2.7).

**Tests:**
- `AS/runtime/service/recordings/tests/proposal-candidates.test.ts`:
  - explicit `recordsPath` lifted;
  - default taken from output `metadata.recordsPath`;
  - neither present throws;
  - `encrypt` throws;
  - a mapper mutating its object after returning does not change the proposal;
  - approval into a Flow writes `parameterValues.recordOutput`;
  - approval into a node definition, then a run, persists a dataset.
- `.../recordings/tests/candidate-definitions.test.ts`: `materializeRecordingNode` carries
  `recordOutput`.

**Acceptance:**
`pnpm --filter fluxiq exec vitest run src/programs/automation-studio/runtime/service/recordings/tests --no-file-parallelism`

**Mutation targets:** throw replaced by a drop; the metadata default ignored; `materializeRecordingNode`
drops `recordOutput`.

### K8: dataset endpoints, handler, streaming route

**K8.0 (C1).** In `AS/api/handlers/runs.ts`, register `AUTOMATION_STUDIO_ENDPOINTS.exportFlowRunAudit`
with `permission: "programs.read"`. The handler calls
`service.exportFlowRunAudit(projectId, runId)` and returns `{ audit }`, matching the shape the web
reads (`run-commands.ts:29`). Add `AS/api/handlers/tests/runs.test.ts` with this case.

**Changes:**
- **`AS/api/contracts/endpoints.ts`:** add `listRunDatasets: "list-run-datasets"`,
  `getRunDatasetPage: "get-run-dataset-page"`, and `exportRunDataset: "export-run-dataset"`.
- **Create `AS/api/contracts/dataset.ts`:** `RunDatasetListRequest`, `RunDatasetPageRequest`
  (`datasetId`, `limit?: unknown`, `cursor?: string|null`), and `RunDatasetExportRequest`
  (`datasetId`, `format`). Each extends `FlowProjectRequest & { runId }`, as `run.ts:3-6` does.
  Export them from `api/contracts/index.ts`.
- **Create `AS/api/handlers/datasets.ts`:** `registerRunDatasetEndpoints(dependencies)`, three
  registrations per 2.2. Each handler asserts domain access first, then calls
  `service.runDatasets.*`.
- **`AS/api/handlers/register.ts:39`:** call `registerRunDatasetEndpoints(dependencies)` after
  `registerRunEndpoints`.
- **Create the streaming route** described in 2.6.

**Tests:**
- New `AS/api/handlers/tests/datasets.test.ts`, using `test-service.ts` and `test-actor.ts`:
  - permission enforced;
  - domain mismatch rejected;
  - `limit` clamped;
  - an unknown dataset returns `null`;
  - export body correct and `tooLarge` returned.
- `FX/programs/tests/permission-matrix.test.ts`: run it unchanged; it covers the new endpoints.
- New `WEB/app/api/programs/automation-studio/run-datasets/[projectId]/[runId]/[datasetId]/tests/route.test.ts`,
  mocking `next/headers` and `lib/fluxiq` as `WEB/app/api/programs/[programId]/[endpoint]/tests/route.test.ts:1-30`
  does:
  - 401 for no cookie and for an invalid session;
  - 403 without `programs.read`;
  - 400 for a bad id or format;
  - 404 for a domain mismatch;
  - 200 with the correct headers and formula-escaped CSV.

**Acceptance:**
`pnpm --filter fluxiq exec vitest run src/programs/automation-studio/api/handlers/tests src/programs/tests/permission-matrix.test.ts --no-file-parallelism`,
then `pnpm --filter @fluxiq/web exec vitest run src/app/api/programs/automation-studio --no-file-parallelism`.

**Mutation targets:**
- `assertProjectDomainAccess` removed from a handler or the route;
- the route's permission check removed;
- `Cache-Control` switched to `immutable`;
- CSV escaping skipped in the stream.

### K9: web datasets panel and export

**Create `WEB/features/automation-studio/datasets/`:**
- `index.ts`;
- `dataset-queries.ts`, following `runtime/run-queries.ts:15-17`;
- `dataset-commands.ts`;
- `download-href.ts`: URL-encodes the ids and appends `domainId` as `program-api.ts:121-127` does;
- `RunDatasetsPanel.tsx`;
- `RunDatasetTable.tsx`:
  - uses `DataTable` (`features/programs/components/data/DataTable.tsx:5-13`) with columns from the
    stored schema labels;
  - reads cells by field id;
  - a "Load more" button follows `nextCursor`;
  - URLs render as text, never as `href`;
  - JSON cells use `JsonToggle`.

**Change:**
- **`runtime/runtime-host.ts:34-41,60-70`:** add `datasets` commands to `RuntimeDetailCommands`, so
  tests keep injecting commands.
- **`runtime/RunActionLogView.tsx`:** mount `RunDatasetsPanel` beside Export Audit (`:267`) with
  `runDetail.datasets`. Inline export downloads a Blob as `:225-233` does; `tooLarge` uses
  `download-href`.
- **`runtime/RunDetailPanels.tsx`:** inline in the data tab of `RuntimeActionDetailPanel`
  (`:216-240`), show `metadata.recordCount`. Do not add an exported component; the file is frozen
  at 9 components.
- **`tests/architecture-contract.test.ts:74-78`:** add `"datasets"` (C10).

**Tests:**
- `datasets/tests/RunDatasetTable.test.tsx`: column order follows the schema; paging; a URL
  rendered as text.
- `datasets/tests/RunDatasetsPanel.test.tsx`: empty state; inline export; `tooLarge` uses the
  stream link.
- `datasets/tests/download-href.test.ts`.
- `runtime/tests/runtime-views.test.tsx:37`: add a datasets stub and a mount assertion.

**Acceptance:**
`pnpm --filter @fluxiq/web exec vitest run src/features/automation-studio/datasets src/features/automation-studio/runtime/tests/runtime-views.test.tsx src/features/automation-studio/tests/architecture-contract.test.ts --no-file-parallelism`,
then `pnpm --filter @fluxiq/web check`. Live browser checking needs the user's authorization to
manage the panel.

**Mutation targets:** columns taken from row keys instead of the schema; a URL rendered as a link;
`domainId` dropped from the download link.

### K10: documentation, versions, gates

- **Versions.** `packages/contracts/package.json:3` becomes 0.2.1 and
  `packages/fluxiq/package.json:3` becomes 0.5.0. Update `docs/architecture/package-boundaries.md:86`.
- **Migration Notes.** Add an entry above `package-boundaries.md:104`: "0.5.0: extracted records
  are saved as run datasets, runtime variables last the whole run, and state paths reach dotted
  node ids (`fluxiq`, `@fluxiq/contracts`)". It covers:
  - variables scoped to the run;
  - the longest-prefix path lookup;
  - saved-trace `$dataset` and `$datasetRow` markers, and `outputs.result` holding validated rows,
    only for nodes that declare `recordOutput`;
  - `withheldResultPayload`;
  - the `for-each` step allowance and its ceiling;
  - the `records` port and `recordOutput` parameter on `builtin.policy.action`;
  - migration 0019;
  - the three endpoints and the streaming route;
  - `export-flow-run-audit` now registered.
- **`package-boundaries.md:188-215` (withholding):** add `withheldResultPayload`.
- **`docs/architecture/automation-studio/persistence.md`:** add a "Run datasets" section after the
  paging contracts at `:322`, covering the tables, caps, retention as in 2.3, audit events,
  endpoints, and the route. Update the endpoint notes at `:434-439` and `:496-501`.
- **`docs/architecture/automation-studio-native-nodes.md`:**
  - add a section on record outputs, `for-each`, `write-records`, run variables, and path
    resolution;
  - add dataset markers to the section at `:128-190`;
  - add the `recordOutput` lift to `:242-283`.
- **Generated reference.** Regenerate `docs/reference/framework-reference.md` and
  `packages/fluxiq/docs/reference/framework-reference.md` with `pnpm docs:reference`
  (`scripts/docs-reference.mjs:8-9,17`). `pnpm docs:check` fails when they are stale (`:74-77`).
- **Gates, one at a time:** `pnpm check`, `pnpm test`, `pnpm docs:check`, `pnpm build`,
  `pnpm package:validate`.

## 5. Worker partition and dependency order

| Worker | Owns (exclusive) | Needs |
| --- | --- | --- |
| W1 K1 | `CT/record-sets/**`, `CT/automation-studio.ts` | none |
| W2 K4d | `FX/runtime/contracts.ts`, `FX/runtime/service.ts`, its FX runtime test, `AS/runtime/io-policy.ts`, `AS/runtime/tests/io-policy.test.ts` | none |
| W3 K4c.0 move | `AS/runtime/service.ts`, `AS/runtime/service/recordings/candidate-definitions.ts`, `recordings/index.ts`, `recordings/tests/candidate-definitions.test.ts` | none |
| W4 K8.0 | `AS/api/handlers/runs.ts`, `AS/api/handlers/tests/runs.test.ts` | none |
| W5 K2 | `schema/run-datasets.ts`, `schema/index.ts`, `schema/table-names.ts`, `storage/project/administration.ts`, `storage/project/run-dataset-store.ts`, `storage/project/index.ts`, `storage/project/tests/run-dataset-store.test.ts` | W1 |
| W6 K3 | `nodes/policy/action.ts`, `nodes/policy/tests/action.test.ts` | W1 |
| W7 K4a | `executor/contracts.ts`, `record-capture.ts`, `record-summary.ts`, `run-state.ts`, `node-execution.ts`, `graph-run.ts`, `trace-withholding.ts`, `executor/index.ts`, `executor/tests/*` | W1 |
| W8 K4b | `AS/runtime/service/datasets/**`, `AS/runtime/service/index.ts`, `scripts/structure-audit/config.mjs` | W5, W7 (batch type) |
| W9 K4c.1-2 | `AS/runtime/service.ts` | W3, W8 |
| W10 K7 | `nodes/importer-sdk.ts`, `runtime/recording-flow-proposal.ts`, `recordings/proposal-candidates.ts`, `recordings/candidate-definitions.ts`, `recordings/tests/*` | W1, W3 |
| W11 K5 | `model/flow-adaptation.ts`, `storage/project/runtime-stream-store.ts` and its test, `service/summaries/conversions.ts`, `service/summaries/tests/conversions.test.ts` | W5, W7 |
| W12 K6 | `nodes/contracts.ts`, `nodes/control-flow/{for-each.ts,index.ts,tests/}`, `nodes/data/{write-records.ts,index.ts,tests/}`, `nodes/parameter-bindings.ts` and its test, and the executor files W7 owned, plus `runtime/tests/composite-executor.test.ts` | W7 (serial on executor files) |
| W13 K8 | `api/contracts/endpoints.ts`, `api/contracts/dataset.ts`, `api/contracts/index.ts`, `api/handlers/datasets.ts`, `api/handlers/register.ts`, `api/handlers/tests/datasets.test.ts`, `WEB/app/api/programs/automation-studio/run-datasets/**` | W8, W9 |
| W14 K9 | `WEB/features/automation-studio/datasets/**`, `runtime/runtime-host.ts`, `runtime/RunActionLogView.tsx`, `runtime/RunDetailPanels.tsx`, `runtime/tests/runtime-views.test.tsx`, `tests/architecture-contract.test.ts` | W13 |
| Supervisor or W15 K10 | versions, `package-boundaries.md`, `persistence.md`, `automation-studio-native-nodes.md`, both reference files, the baseline ratchet, gates | all |

**Files that must be edited in series:**
- `AS/runtime/service.ts`: W3, then W9.
- `recordings/candidate-definitions.ts`: W3, then W10.
- Executor files (`node-execution.ts`, `graph-run.ts`, `record-capture.ts`, `run-state.ts`,
  `executor/tests/graph-run.test.ts`, `executor/tests/node-execution.test.ts`): W7, then W12.
- `.structure-baseline.json`: only through `pnpm structure:baseline`, after W9.
- Generated reference files: K10 only.

**Order:**
1. W1, W2, W3, W4 in parallel.
2. W5, W6, W7, W10 once W1 lands (W10 also needs W3).
3. W8 and W11 once W5 and W7 land.
4. W9 and W12.
5. W13.
6. W14.
7. K10.

Editing can run in parallel. Each worker runs its acceptance command alone.

**Structure budgets after the work:**

| Location | Budget after |
| --- | --- |
| `AS/storage/project/` | 22 files |
| `schema/` | 15 files |
| `runtime/executor/` | 20 files |
| `service/recordings/` | 9 files |
| `service/datasets/` | 2 files |
| `nodes/control-flow/` | 10 files |
| `nodes/data/` | 8 files |
| `api/contracts/` | 18 files |
| `api/handlers/` | 22 files; 14 in `handlers/tests/` |
| `executor/tests/` | 9 files |
| `service.ts` | about 6,765 lines, at most 6,807, still 223 members |
| `runtime-stream-store.ts` | about 640 lines, under 800 |
| `AS/model/`, `AS/runtime/tests/` | untouched |

Path depth matches existing siblings; `recordings/proposal-candidates.ts` sits at the same depth.
No three files in one directory share a prefix: `executor/` has `record-capture` and
`record-summary` only, and `datasets/` has `dataset-queries` and `dataset-commands` only.

## Commands run and observed results

- `git log --oneline -3` and `git status --short` in `F:\!FluxIQ`:
  - HEAD `098e01b`;
  - only `docs/working/first-class-data-extraction-plan.md` modified, a change I did not make.
- Read-only `grep`, `ls`, `wc -l`, `sed -n`, `cat -n`, and `node -e` summaries of
  `.structure-baseline.json` and package manifests, plus the Read and Grep tools. Outputs were read
  and cited directly. Key observations:
  - baseline `service.ts` is 6807 lines with 223 members;
  - `model/` has 28 files;
  - `runtime/tests/service.test.ts` is 4787 lines;
  - `maxPathSegments` is 9;
  - no handler references `exportFlowRunAudit`;
  - the retention and sweep methods have no production caller;
  - `executeAutomationStudioNode` is called only from `graph-run.ts:179,181`;
  - migration ids run 0002-0018, with `0009` twice.
- No test, type check, build, server, or history-changing git command was run. The session was
  also interrupted once by a machine crash before this report existed; the reads were redone where
  needed.

## Not verified

- **Framework runtime path.** How `withheldValues` reaches `settleAttempt` (`FX/runtime/service.ts`
  between `:230` and `:278`), and where the framework runtime test folder is.
- **Client gateway.** Whether its service persists command result payloads anywhere besides the
  runtime's `attempt.json`.
- **Retries.** Whether `retryRuntimeSessionAfterAutoAppliedPatch` and live-patch reruns keep the
  same `runId` (`service.ts:3299,3540-3547`). If they do, attempt ids restart at `.attempt.1` and
  `append` would duplicate rows. W9 should check and, if so, make `appendBatch` replace an existing
  batch with the same `attempt_id`.
- **Unread helper names and shapes:**
  - the export name in `service/stable-json.ts`;
  - the `foreignKeyGuards` signature (only its usage was read);
  - the fields of `FlowProjectRequest`.
- **Editor and code-owned Flows.** Whether `nodes/tests/registry.test.ts` pins the policy action's
  ports; whether `ParameterEditor.tsx` edits `json`-typed parameters; whether code-owned Flow
  generation (`dsl/`) handles a `json` parameter.
- **Web contract test.** Whether `productDomains` (`architecture-contract.test.ts:58-72,418`) must
  also gain `datasets`.
- **Other side-effect reader.** How `authorizedExternalSideEffects` (`service.ts:3534,3588`) is used,
  in case it reads a per-node side-effect class.
- **Runtime environment.** `ReadableStream` behaviour in the Next.js route runtime.
- **Proposal revalidation.** Whether it must recheck `recordOutput` (native nodes doc, around `:280`).

## Open questions or contradictions found

1. **C1:** `export-flow-run-audit` has no handler, so the Export Audit button cannot work. K8.0
   fixes it; the supervisor should confirm it belongs in this plan.
2. **C3:** `attempt.json` stores `result.payload`. K4d is a framework change to `FX/runtime`. It is
   additive, but still a boundary decision for the supervisor.
3. **Run retention does not exist.** Datasets add volume. Should a run purge be planned, or should
   "kept for the project's lifetime" be accepted and documented?
4. **The Design's JSONL fallback (C12) and per-row content objects** are recommended for removal.
   The Design section needs updating if accepted.
5. **The `for-each` step allowance and its 100,000-step ceiling** is a new behaviour rule and needs
   the supervisor's approval.
6. **`recordOutput` is carried into node definitions and rejects invalid candidates.** This
   deliberately departs from `expectedState`, for the reason in 2.7.
7. **Cap values** in 2.4 are decisions without code precedent: 64 KiB per row, 100,000 rows,
   10,000 rows or 5 MiB inline, 256 MiB streamed.
