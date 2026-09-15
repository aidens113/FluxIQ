# ex-b-core: Core investigation for first-class data extraction

Path prefixes, all relative to `F:\!FluxIQ`:
`AS/` = `packages/fluxiq/src/programs/automation-studio/`,
`FX/` = `packages/fluxiq/src/`, `WEB/` = `apps/web/src/`.

## Outcome

Done. This was a read-only investigation. All six questions are answered below with file:line
references. One brief premise conflicts with Core's code: Core's run detail
attempt records carry no node outputs (see Open questions).

## What changed and why

Only this report was created. No source, docs, builds, tests, or servers were
touched.

## Findings

### 1. How outputs and action results are persisted per run

**The chain from an action result to disk.**

1. A domain output's result payload becomes node output `result`:
   `AS/runtime/io-policy.ts:113` for the runtime or client-gateway path, and
   `AS/runtime/io-policy.ts:49` for the in-process adapter path.
2. Those outputs are merged into the attempt at
   `AS/runtime/executor/node-execution.ts:141-164`.
3. `nodeAttemptFromResult` copies them onto the attempt trace as `outputs`
   (`AS/runtime/executor/attempt-trace.ts:31`). The trace type is
   `AS/runtime/executor/contracts.ts:110-139`, with `inputs`, `outputs` and
   `effects` at 118-120.
4. The graph run also writes every output into the run's `values` map under two
   keys, `nodeId.port` and bare `port` (`AS/runtime/executor/graph-run.ts:189-192`).
5. The returned trace is the saved, withheld copy
   (`AS/runtime/executor/graph-run.ts:43-59`, apply at :55). That trace is stored in the runtime session
   (`AS/model/runtime.ts:40`) as `projects/{id}/runtime/sessions/{runId}.json`
   (`AS/runtime/service.ts:5185-5187`).
6. It is read back by `get-runtime-session`
   (`AS/api/handlers/runtime-sessions.ts:22-30`).

**Run detail does not carry outputs.**
- `runtimeSessionToFlowRunDetail` (`AS/runtime/service/summaries/conversions.ts:86-113`)
  maps attempts through `runtimeActionAttemptsFromSession` (:137-174).
- The resulting `AutomationStudioFlowRunActionAttemptRecord`
  (`AS/model/flow-adaptation.ts:277-292`) keeps status, route, message, failure, and
  metadata (regionId, diffSummary, recovery, stateRefs, targetResolution;
  conversions.ts:163-171). It keeps **no `inputs` and no `outputs`**.
- The detail is saved by `writeRuntimeSession` → `saveFlowRunDetail`
  (`AS/runtime/service.ts:5198`; `AS/runtime/service/summaries/store.ts:92-113`).
- It goes to the project SQLite event stream when available (store.ts:103, 312-319).
  Otherwise it goes to JSON and JSONL files (store.ts:104-110).

**Run detail DTOs and read paths.**
- `AutomationStudioFlowRunDetail`: `AS/model/flow-adaptation.ts:308-322`.
- Handlers: `get-flow-run-detail`, which honours `compact`, at
  `AS/api/handlers/runs.ts:27-36`; list and detail for actions at runs.ts:37-55.
- Service methods: `AS/runtime/service.ts:3840-3891`.
- SQLite projection:
  - `getRunDetail` at `AS/storage/project/runtime-stream-store.ts:232-255`.
  - Each action attempt becomes one `action_attempt` event (:461).
  - Attempts are also stored as `runtime_action_summaries.detail_json` (:408-431), served by
    `getRunActionDetail` (:284-289).

**Withholding rules.**
- `runAutomationStudioGraph` withholds every value resolved from a `$state`
  binding, plus every run input, from the saved trace (`AS/runtime/executor/trace-withholding.ts:1-46`).
  - The rewrite applies under data keys `payload`, `outputs`, `inputs`, `values`,
    `metadata`, `data`, and others (:64), and prose keys (:67).
  - Every scalar inside a resolved subtree is collected (:156-167).
  - Text replacement is substring-wide via `fluxiqRuntimeTextWithholding`
    (`docs/architecture/package-boundaries.md:233-238`).
- The run-detail envelope withholds `inputs` (`runtime-stream-store.ts:514`).
- The framework command attempt withholds only command parameters and result
  `message` and `error` (`FX/runtime/service.ts:424-436`). `result.payload` is explicitly not
  withheld there (`package-boundaries.md:214-215`).
- **Consequence for extraction:** if a run typed a state-bound value such as a
  search term, every extracted string containing it reads `[withheld]` inside
  the saved trace's outputs. Datasets derived from the saved trace would be corrupted.

**Size limits found.**

| Limit | Value | Where |
| --- | --- | --- |
| Event chunk | 4 MiB | `AS/storage/project/event-chunk-store.ts:57-58` |
| Run detail rebuild | reads at most 5,000 events | `runtime-stream-store.ts:235` |
| Action message summary | 1,000 chars | `runtime-stream-store.ts:416` |
| Action page | 1-100 | `AS/runtime/service.ts:3858` |
| Event page | 1-500 | `runtime-stream-store.ts:220` |
| Object threshold | 256 KiB | `AS/storage/object-store.ts:9` |
| UI cache entry | 256 KiB | `AS/storage/project/ui-cache-store.ts:7` |
| Web state asset | 20 MiB | `WEB/app/api/programs/automation-studio/state-assets/[projectId]/[sha256]/route.ts:13` |
| Graph run | `maxSteps` default 250 | `AS/runtime/executor/graph-run.ts:165` |

No gateway message byte cap was found by grep in `FX/`.

**Existing related concepts.** None of them is a dataset: a grep for `dataset` in non-test `FX/` finds nothing.
- **Flow document variables.** Declared on the Flow at `AS/model/flows.ts:151-158`.
- **Flow interface.** Typed ports whose value type can be `record`, `array`, or `schema` with a schemaId
  (`AS/model/flows.ts:119-143`). They are used only by Call Flow output mapping
  (`AS/runtime/composite-executor.ts:67-72`).
- **Runtime variables do not survive between nodes.**
  - The execution context builds a fresh `new Map(options.variables)` for every node
    (`AS/runtime/executor/node-execution.ts:102`).
  - So `builtin.data.set-variable` writes, including `append-list`
    (`AS/nodes/data/set-variable.ts:28-37`), are lost before the next node.
- **Database nodes do nothing in Core.**
  - `builtin.database.query` and `builtin.database.insert` emit effects and return `records: []`
    (`AS/nodes/database/query.ts:30-35`, `insert.ts:20-25`).
  - No Core handler exists: `database.query.requested` appears only at query.ts:34.
- **Generic record repositories.** The database-manager program provides them
  (`FX/programs/database-manager/types.ts:7-37`, `storage/sqlite-repository.ts:23`), exported as
  `fluxiq/data` (`packages/fluxiq/package.json:23`).
- **Node state view model.** Sources `learned`, `observed`, `runtime` and phases
  `input`, `action`, `expected_output`, `actual_output`
  (`AS/model/node-state.ts:3-38`). This describes page state, not output records.
- **Signals** carry extractor provenance (`AS/model/signals.ts:6-7`).
- **Object documents and content store.**
  - Content-addressed project objects with owner and purpose, plus optional protection
    (`AS/runtime/service/object-documents.ts:6-30`; `AS/storage/project/content-store.ts:38-60`).
  - State snapshots use this path (`runtime-stream-store.ts:348`).

### 2. Iteration, loops, and data passing

**Loop.**
- `builtin.control.loop` (`AS/nodes/control-flow/loop.ts:4-22`) takes a `condition`
  input and has `body` and `done` branches.
- Its execute only chooses the route from the condition and echoes
  `maxIterations`, `startIndex` and `increment` (:21; `control-flow/shared.ts:4-10`).
- It keeps no counter and no item. Grep finds no `maxIterations` or `forEach` use in
  `AS/runtime`, `AS/dsl` or `AS/model`, so the only bound is `maxSteps`.

**Other control and routine nodes.**
- `parallel` and `merge` only echo values (`parallel.ts:26`, `merge.ts:26`).
- `subroutine` only emits an effect (`routine/subroutine.ts:31-36`).
- Routing follows the edge whose `sourcePortId` equals the route
  (`AS/runtime/executor/graph-navigation.ts:5-11`).

**Data nodes.**
- `filter-list` works on an array input with an optional field path
  (`AS/nodes/data/filter-list.ts:42-51`).
- `map-object` has pick, rename and merge modes (`map-object.ts:27-39`).
- `constant` returns its value (`constant.ts:23`).
- `get-variable` reads the per-node map (`get-variable.ts:18-23`).

**How later nodes reference earlier outputs.**
- **(a) The values map.** Keys are `nodeId.port` and bare `port`
  (`graph-run.ts:189-192`). The bare key is overwritten by each later node.
- **(b) Data edges.** Any edge whose `targetPortId` is not `in` copies
  `values["source.port"]` into `inputs[targetPortId]`
  (`AS/runtime/executor/node-inputs.ts:4-12`). The whole values map is also merged into
  inputs (:11).
- **(c) `$state` parameter bindings** (`AS/nodes/contracts.ts:66-72`;
  `AS/nodes/parameter-bindings.ts:41-52`).
  - They resolve against inputs, variables, values and edge inputs
    (`node-execution.ts:25-30`).
  - A path lookup tries an exact key first, then walks dot segments
    (`parameter-bindings.ts:118-128`).
  - **Gap:** recording-derived node ids contain dots (`recorded.candidate.<id>`,
    `AS/runtime/service/recordings/proposal-candidates.ts:93`). A path such as
    `recorded.candidate.x.result.extracted` therefore never resolves. Only the exact key
    `…result`, or the ambiguous bare `result.extracted`, works.
  - Every resolved value is withheld from the trace (`node-execution.ts:34`;
    `docs/architecture/automation-studio-native-nodes.md:128-160`).
- **(d) Call Flow** output bindings (`composite-executor.ts:67-69`).
- **(e) No expression or template engine.**
  - `expression` exists only as a parameter valueType label (`AS/nodes/contracts.ts:44`).
  - The Flow DSL forbids executable expressions (`AS/dsl/source.ts:25`).
- **Web UI.** The parameter editor edits `$state` path plus fallback
  (`WEB/features/automation-studio/parameters/ParameterEditor.tsx:62,84-86`).
- **Importer node ports** carry only a `valueType` enum with no schema
  (`AS/nodes/contracts.ts:20-38`). Native results with undeclared output ports are
  rejected (`AS/runtime/native-node-runtime.ts:104-114`).

### 3. Recording-to-Flow proposal pipeline, and how a domain proposes an extract node

1. **Recording the event.** A domain registers a `RecordingDomainDefinition` event type
   (`AS/model/recording-domain.ts:83-103`; registry :116-132). The event payload is validated against a
   `RecordingEventJsonSchema` (:11-20, :150-169). `processRecordingDomainEvent` appends a `domain_event` timeline entry
   (:186-203) and optionally an `observation` entry through `observationExtractor` (:79-81, :228-239).
   Mapper timeline compaction drops only state checkpoints and state observations
   (`AS/runtime/service/recordings/timeline.ts:7-13`). An extract `domain_event` or `action` entry
   therefore reaches mappers.
2. **Mapping.** Mappers are declared in the importer manifest
   (`AS/nodes/importer-sdk.ts:9,53`) and bound in the implementation bundle (:94).
   `createRecordingFlowProposals` (`AS/runtime/service.ts:2368-2458`) calls each mapper
   per entry with the observation and up to 32 `following` entries (service.ts:2401-2405;
   `proposal-candidates.ts:17,28-39`). An `action` entry with no mapper candidate gets
   a fallback candidate (service.ts:2411).
3. **Candidate.** The mapper returns `AutomationStudioRecordingMapperCandidate`
   (`importer-sdk.ts:19-31`), whose fields are `outputId`, `parameters`, `sourceInputIds`,
   `expectedConfirmation`, `expectedState`, `confidence`, `label`.
   `recordingFlowActionCandidate` (`proposal-candidates.ts:47-83`) requires the output to be registered (:51) and
   declared by the mapper (service.ts:2426). It also requires source inputs to be action-role (:52-57), and
   normalizes the element target (:65, :163-167). `expectedState` is kept only as a
   non-empty plain object (:66, :150-161). The proposal artifact is written at service.ts:2441-2454
   (`AS/runtime/recording-flow-proposal.ts:12-58`).
4. **Approval.** `reviewRecordingFlowProposal` (service.ts:2460) →
   `appendRecordingProposalToFlow` (service.ts:2517; `proposal-candidates.ts:90-133`) writes each
   candidate as **`builtin.policy.action`** (:99). Its `parameterValues` are `outputId`,
   `parameters`, confirmation, and `expectedState` (:102-107). Nodes are chained
   `success`→`ready` (:124-131). A node destination instead makes definitions (service.ts:2535).

**Therefore, today** a domain can already propose extraction with no Core change:
- Its mapper returns `{ outputId: "web.dom.extract_list", parameters: { element/target, fields… }, label }`
  for a recorded extract event.
- The approved node dispatches through `policy.output.dispatch` (`AS/nodes/policy/action.ts:40`)
  → `createRuntimePolicyEffectDispatcher` (`io-policy.ts:75-122`).
- It keeps element-target resolution (`io-policy.ts:195-226`) and
  expected-effect comparison (`AS/runtime/executor/expected-transition.ts:46`).
- Records land in `outputs.result` (`io-policy.ts:113`).

**Missing for first-class extraction:**
- The candidate and node have no field for a record schema, dataset name, or records path
  (`importer-sdk.ts:19-31`; `action.ts:15-33`).
- The node declares no `records` port (action.ts:11-14).
- Nothing persists records outside the trace.

### 4. Import/export and storage usable for datasets

- **Framework IO route.** `GET /api/framework/io` returns only the IO adapter snapshot
  (`WEB/app/api/framework/io/route.ts:6-18`). It is not a data import/export facility.
- **Program API route is JSON only.** It wraps every response in `NextResponse.json`
  (`WEB/app/api/programs/[programId]/[endpoint]/route.ts:27,45`).
- **Binary download precedent.** A dedicated authenticated route streams bytes with a media type
  (state-assets `route.ts:16-41`).
- **Export precedents.**
  - `export-flow-run-audit` (`AS/api/contracts/endpoints.ts:147`;
    `AS/runtime/service/summaries/run-audit.ts:35-82`) produces JSON with a sha256 integrity field (:72) and
    retention flags (:76-80).
  - The web turns it into a Blob download (`WEB/features/automation-studio/runtime/RunActionLogView.tsx:214-236,267,334-343`).
  - A generic download helper exists (`WEB/features/programs/components/data/CodeViewer.tsx:10-13`).
- **Storage options.**
  - Project SQLite schema, one module per table group in migration order
    (`AS/storage/project/schema/index.ts:1-17`), holding `runtime_runs` and
    `runtime_action_summaries` (`runtime-stream-store.ts:202,270`).
  - Content-addressed objects with owner kind and purpose, plus optional protection
    (`content-store.ts:38-60`).
  - Program JSON store (`FX/programs/_shared/storage.ts:33`).
  - database-manager repositories (item 1).
  - File layout `runtime/runs/{runId}/` (`docs/architecture/automation-studio/persistence.md:64-68`).
- **Recommended home for per-run datasets:**
  - Store them in the project SQLite database beside `runtime_runs`, in new tables through a new
    schema migration.
  - Store bodies over 256 KiB as content objects owned by the run.
  - Use a `runtime/runs/{runId}/datasets/` JSONL fallback when there is no project database, mirroring store.ts:104-110.

### 5. `apps/web` surfaces and domain contributions

- **Runtime Debug.** View `runtime-debug`
  (`WEB/features/automation-studio/views/canonical-view-definitions.tsx:141-147`; contract
  `runtime/functionality-contract.ts:2-30`). It pages actions and events and loads compact detail
  (`RunActionLogView.tsx:84-116`), and has an **Export Audit** button (:267).
- **Action detail.** The action detail panel has a "data" tab rendering `attempt.inputs` and
  `attempt.outputs` (`runtime/RunDetailPanels.tsx:216-240`). Stored action records carry no
  outputs (item 1), so this shows `{}` for SQL-paged runs. Only a session-shaped
  `trace.attempts` fallback carries outputs (`runtime/run-detail-model.ts:2-7`).
- **Run history** lives in the same view (alias `runs-history`, canonical-view-definitions.tsx:142).
- **Other views.** State View (:135) and Inspector (:156) exist.
- **Table component.** A generic `DataTable` (`WEB/features/programs/components/data/DataTable.tsx:5-13`) is
  available for previews.
- **Views are a fixed list** of canonical ids (canonical-view-definitions.tsx:79-156;
  definition contract `views/view-definition-types.ts:65-96`).
- **How a domain contributes.** The host module is `FLUXIQ_HOST_MODULE`, whose
  `registerFluxIQHost(fluxiq)` must be synchronous (`WEB/lib/fluxiq.ts:148-190`). It is
  server-side only: `registerDomain`, `registerIo`, `registerDomainIo`,
  `bindAutomationStudioNativeNodeRuntime`, `bindAutomationStudioReusableLlmContext`
  (`FX/framework/index.ts:211-238`).
- **No web view or command contribution path exists.**
  - The importer manifest's `stateVisualizers` is validated only
    (`importer-sdk.ts:56,141-157`); grep finds no consumer in `WEB/` or `FX/`.
  - Program live views are a hard-coded import map (`WEB/features/programs/ProgramLiveViews.tsx:8-45`).
  - Domain program URLs just redirect (`WEB/app/domains/[domainId]/programs/[programId]/page.tsx:3-6`).
  - The data UI must therefore be Core-owned and driven by schema data.

### 6. Recommended minimal generic Core design

**Principle.** Extraction stays an ordinary `builtin.policy.action` node dispatching
a domain output such as `web.dom.extract_list`. This keeps target resolution,
transition comparison, the recovery ladder and adaptation working unchanged. A new
node type would lose the policy-action special cases (`expected-transition.ts:46`,
`node-execution.ts:182`, `io-policy.ts:195-226`). Core adds a
generic **record output** declaration, per-run dataset persistence, iteration,
and a UI.

**Data model and contracts.** They go in `@fluxiq/contracts/automation-studio`, which is browser-safe and
zod-only (`package-boundaries.md:9,13-15`). New files go in a new `packages/contracts/src/record-sets/` directory.
- `AutomationStudioRecordSchema`:
  - `schemaVersion`
  - `fields[{ id, label, valueType: string|number|boolean|url|datetime|json, required? }]`
  - `primaryKey?`
- `AutomationStudioRecordOutput`: `{ datasetId, label?, recordsPath, schema, writeMode: "append"|"replace", maxRecords? }`.
- `AutomationStudioRunDatasetSummary`: `{ runId, datasetId, nodeIds, schemaDigest, recordCount, truncated, invalidCount }`.
- `AutomationStudioRunDatasetPage`: `{ summary, schema, rows, nextCursor }`.
- `parseAutomationStudioRecordSchema` and `validateAutomationStudioRecords`, pure.
- `encodeAutomationStudioRecordsCsv`, pure, with formula-injection escaping.

**Runtime capture.**
- `builtin.policy.action` gains an optional `recordOutput` parameter (additive;
  `action.ts:15-33`) and a declared `records` data port.
- In `io-policy.ts` (:104-115 and :42-50), after success Core reads `result.payload` at
  `recordsPath` and validates rows against the schema. It emits `outputs.records`, so a data edge
  `node.records`→`filter-list.items` works (`node-inputs.ts:4-12`). It also emits a structured
  record batch on the node result.
- The batch is persisted **from the executed result, not the saved trace**.
  - Add an executor hook `onRecordBatch` to `AutomationStudioGraphExecutionOptions`
    (`AS/runtime/executor/contracts.ts:153-192`).
  - A service collaborator writes each batch as it arrives.
  - The saved trace keeps only `{ datasetId, recordCount, schemaDigest }`. This avoids withholding
    corruption, the 4 MiB chunk limit, and 5,000-event limits.
- Dataset summaries are added to `AutomationStudioFlowRunDetail` as `datasets?`
  (`flow-adaptation.ts:308-322`) and `recordCount` to attempt metadata
  (conversions.ts:163-171). Write fields by name, following the contract-spread rule
  (`docs/architecture/code-structure.md:206-215`).

**Persistence.**
- Migration `AS/storage/project/schema/run-datasets.ts`, which becomes the 15th file, plus table names.
  - `run_datasets (run_id, dataset_id, schema_json, schema_digest, record_count, invalid_count, truncated, updated_at_ms)`.
  - `run_dataset_rows (run_id, dataset_id, ordinal, attempt_id, row_json)`, or object refs for large bodies.
- Store `AS/storage/project/run-dataset-store.ts`; project/ has 21 source files, under the cap.
- Collaborator `AS/runtime/service/datasets/` (new directory). Do not grow the baselined
  `service.ts` (`code-structure.md:204-205`).
- Retention and protection follow `content-store.ts:45-51`.

**API.**
- New endpoints in `AS/api/contracts/endpoints.ts`, with a handler file
  `AS/api/handlers/datasets.ts` (handlers/ is at 21 files):
  - `list-run-datasets`
  - `get-run-dataset-page` (cursor, limit 1-500)
  - `export-run-dataset` (JSON or CSV under a byte cap, for Blob download like
    the audit export)
- A streaming route `WEB/app/api/programs/automation-studio/run-datasets/[projectId]/[runId]/[datasetId]/route.ts`
  for large CSV/JSON, authenticated like state-assets `route.ts:16-41`.

**Iteration.**
- Add `builtin.control.for-each` (`AS/nodes/control-flow/for-each.ts`).
  - Input `items` (array); branches `body` and `done`; outputs `item`, `index`, `count`.
  - `maxIterations` is enforced.
- The executor keeps per-run loop state keyed by node id (`graph-run.ts:145`), passed through an additive
  `iteration?` field on `AutomationNodeExecutionContext` (`AS/nodes/contracts.ts:104-113`).
- Make runtime variables run-scoped: one Map per run instead of per node
  (`node-execution.ts:102`), so `set-variable` `append-list` accumulates.
- Add `builtin.data.write-records` for loop bodies. Its effect is handled by a Core record-sink
  dispatcher chained before the policy dispatcher (`node-execution.ts:141-164`).
- Fix output references by one of:
  - a `$output: { nodeId, portId, path }` binding, or
  - making `readRecordPath` try the longest own-key prefix (`parameter-bindings.ts:118-128`).

  Decide whether prior node outputs, which are already persisted, are exempt from withholding
  (see Open questions).

**Recording proposal.**
- Add optional `recordOutput` to `AutomationStudioRecordingMapperCandidate`
  (`importer-sdk.ts:19-31`) and `RecordingFlowActionCandidate`
  (`recording-flow-proposal.ts:12-29`).
- Lift and clone it the way `expectedState` is lifted (`proposal-candidates.ts:150-161`).
- Write it to `parameterValues.recordOutput` (:102-107) and to node-destination definitions
  (service.ts:2535).
- The domain keeps DOM specifics in its mapper and adapter.

**UI.**
- New feature directory `WEB/features/automation-studio/datasets/`:
  - `RunDatasetsPanel.tsx`
  - `RunDatasetTable.tsx`, using `DataTable` with cursor paging and schema-driven columns
  - `dataset-commands.ts`
  - CSV/JSON export buttons
- Mount it in `RunActionLogView` beside Export Audit. Make the action "data" tab
  show the attempt's dataset summary.
- Schema editing is a JSON-valued parameter in the existing inspector
  (`ParameterEditor.tsx`). A dedicated canonical view is optional and later.

**Public exports.**
- Contracts via `@fluxiq/contracts/automation-studio`.
- Runtime types, store and nodes flow through the existing `fluxiq/automation-studio` layer barrels
  (`AS/index.ts:9-13`). No new subpath.

**Ordered steps.**
1. Contracts, schema validation and CSV encoder, with tests.
2. Schema migration and dataset store, with tests.
3. `recordOutput` parameter and `records` port on the policy action, plus io-policy capture.
4. Executor `onRecordBatch` hook and the service datasets collaborator writing batches.
5. Run detail `datasets`.
6. Run-scoped variables, `for-each` and `write-records` nodes, output-reference resolution.
7. Mapper candidate `recordOutput` lift and approval write.
8. Endpoints, handler, and streaming export route.
9. Web datasets panel and export.
10. Docs: `persistence.md` layout, `automation-studio-native-nodes.md`, package versions, Migration Notes.
11. Run `pnpm check`, `pnpm test`, `pnpm build`, `pnpm package:validate`.

**Tests.** One-to-one test placement per `code-structure.md:112-141`.
- `packages/contracts/src/record-sets/tests/*.test.ts`
- `AS/runtime/tests/io-policy.test.ts`: records extracted, validated, bad shape fails.
- `AS/runtime/executor/tests/graph-run.test.ts` and `node-execution.test.ts`: for-each bound,
  run-scoped variables, record hook fires with unwithheld rows.
- `AS/runtime/executor/tests/trace-withholding.test.ts`: saved trace carries a summary only.
- `AS/runtime/service/recordings/tests/proposal-candidates.test.ts`: `recordOutput` lifted and written.
- `AS/storage/project/tests/run-dataset-store.test.ts` and `schema.test.ts`.
- `AS/api/handlers/tests/datasets.test.ts`.
- `AS/runtime/tests/service.test.ts`: a mock adapter returns `extracted`, then persist, page, export.
- `WEB/features/automation-studio/datasets/tests/*.test.tsx`.
- A route test beside the new route.

**Compatibility and versioning.** Rules at `package-boundaries.md:86-94`; current `fluxiq` is 0.4.0
(`packages/fluxiq/package.json:3`).
- **Additive and patch-level:** new contracts; the `recordOutput` parameter; the `records` port;
  `datasets?` on run detail; new endpoints; new nodes; the `recordOutput` candidate field.
- **Observable behaviour changes:**
  - run-scoped variables (set/get across nodes);
  - `$state` path resolution through dotted ids;
  - any withholding exemption;
  - the policy action outputs gaining `records`.
- These require `fluxiq` 0.5.0 with a Migration Notes entry (`package-boundaries.md:102`).
- Contracts additions alone would be `@fluxiq/contracts` 0.2.1.

## Commands run and observed results

- Read-only `ls`, `find`, `wc -l`, `cat -n`, `sed -n` and `grep` through Bash, plus the
  Read and Grep tools, over the paths cited above. Output was read and cited directly.
- Line numbers from multi-file `cat -n` runs were renumbered per file.
- Key observations:
  - A grep for `dataset|Dataset` in non-test `FX/` finds no dataset concept.
  - A grep for `maxIterations|forEach|iterat` in `AS/runtime|dsl|model` found no matches.
  - `stateVisualizers` appears only in `importer-sdk.ts`.
  - `database.query.requested` appears only in `nodes/database/query.ts:34`.
- No build, test, server, or git command was run.

## Not verified

- `AS/runtime/router-runtime.ts` and `AS/model/validation/condition.ts` matched
  `expression`; I did not read them in detail.
- Not read:
  - `AS/storage/project/retention-store.ts`
  - `WEB/features/automation-studio/inspector/panel-registry.tsx`
  - `FX/domains/index.ts` (`DomainOutputDefinition` metadata shape)
  - `WEB/app/api/framework/io/validate/route.ts`
  - the `contractSpreadPaths` list
- Whether `@fluxiq/client-gateway-websocket` enforces a message byte cap.
- How the downstream Lab actually reads `extracted`; that code is outside Core.
- File counts come from `ls`. `AS/model/` already holds 28 source files by count,
  presumably baselined, so new model code must go in a subdirectory.

## Open questions or contradictions found

1. **Contradiction:** the brief says the Lab reads records from "Core's run detail
   attempt results". Core's run detail attempt records have no outputs
   (`conversions.ts:150-172`; `flow-adaptation.ts:277-292`). Records exist only
   at `session.trace.attempts[].outputs.result` in the session, read via `get-runtime-session`.
   That copy is subject to trace withholding.
2. Should dataset rows have run-withheld texts removed before storage, stay raw
   but protected and retention-bound, or follow a new explicit policy? Core's rule is that safety is
   proved, not declared (`trace-withholding.ts:1-46`).
3. Should `$output` references to already-persisted node outputs be exempt from
   withholding? Without an exemption, a record-driven loop withholds every record text in the saved trace.
4. Is `sideEffectClass: "external"` for every `builtin.policy.action`
   (`node-execution.ts:182`) acceptable for read-only extraction, or should a
   domain output's safety level lower it?
5. Should the default `recordsPath` come from the node parameter only, or also from the domain
   output definition's metadata?
