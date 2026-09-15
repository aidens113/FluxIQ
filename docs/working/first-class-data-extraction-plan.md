# First-Class Data Extraction Plan (Core share)

Status: Active
Status detail: Core design recorded 2026-09-15 from ex-b-core; Core phases K1-K10 start with the downstream plan's X1 at the start of Week 2.
Created: 2026-09-15
Last updated: 2026-09-15
Owner: Senior supervisor agent
Scope: Core's share of making structured data extraction a fundamental FluxIQ capability: domain-neutral dataset contracts (records with a schema), per-run persistence, table preview, CSV/JSON export, iteration over records by later nodes, the web-panel UI for them, and the recording-proposal seam through which a domain proposes extract nodes.
Paired document: `F:\!FluxIQWebExtension\docs\working\first-class-data-extraction-plan.md`
Related: [package boundaries](../architecture/package-boundaries.md), [code structure](../architecture/code-structure.md), [persistence](../architecture/automation-studio/persistence.md), [native nodes](../architecture/automation-studio-native-nodes.md), [ex-b-core report](./first-class-data-extraction-plan/reports/ex-b-core.md)

---

## Current State

**Phase, as of 2026-09-15: design recorded; no Core code changed.** The
downstream user decided that structured data extraction is a fundamental FluxIQ
capability, Core included. The downstream document owns the plan, phases X0-X6,
and sequencing; this document owns the domain-neutral dataset contracts and
Core's phases K1-K10. Path prefixes: `AS/` is
`packages/fluxiq/src/programs/automation-studio/`, `WEB/` is `apps/web/src/`.

**What is true in Core today** (read-only `ex-b-core`, file:line in its report):
- A domain output's payload becomes node output `result`
  (`AS/runtime/io-policy.ts:113`) and is saved only in the runtime session trace
  (`projects/{id}/runtime/sessions/{runId}.json`), read with
  `get-runtime-session`. Run-detail attempt records carry no inputs or outputs
  (`AS/runtime/service/summaries/conversions.ts:137-174`).
- The saved trace withholds every `$state`-resolved value and run input,
  substring-wide, so extracted text containing a run input reads `[withheld]`
  (`AS/runtime/executor/trace-withholding.ts:1-46`).
- No dataset concept exists. `builtin.control.loop` keeps no counter or item;
  runtime variables are rebuilt per node, so `set-variable` writes are lost
  (`AS/runtime/executor/node-execution.ts:102`); `$state` paths cannot reach
  recorded nodes' outputs because their ids contain dots
  (`AS/nodes/parameter-bindings.ts:118-128`).
- A domain mapper can already propose `web.dom.extract_list`; approval writes it
  as `builtin.policy.action` with `expectedState`
  (`AS/runtime/service/recordings/proposal-candidates.ts:90-133`), keeping target
  resolution, transition comparison, recovery, and adaptation.
- The program API returns JSON only; domains cannot contribute web views or
  commands; Runtime Debug has an Export Audit precedent and a generic
  `DataTable`.

**Done:** the Core investigation `ex-b-core` and the design below.

**Not done:** phases K1-K10.

**Next steps:** K1 with the downstream X1 at the start of Week 2; settle open
questions 1-2 before K4 persists rows.

**Blockers:** none.

---

## Design

### Principle

Extraction stays an ordinary `builtin.policy.action` dispatching a domain output.
Core adds a generic record-output declaration, per-run dataset persistence,
iteration, and UI. A new node type would lose the policy-action paths for
target resolution, expected transitions, and adaptation.

### Contracts (owned here)

In `@fluxiq/contracts/automation-studio`, new `packages/contracts/src/record-sets/`:
- `AutomationStudioRecordSchema`: `schemaVersion`,
  `fields[{ id, label, valueType: string|number|boolean|url|datetime|json,
  required? }]`, `primaryKey?`.
- `AutomationStudioRecordOutput`: `{ datasetId, label?, recordsPath, schema,
  writeMode: append|replace, maxRecords? }`.
- `AutomationStudioRunDatasetSummary`: `{ runId, datasetId, nodeIds,
  schemaDigest, recordCount, truncated, invalidCount }`.
- `AutomationStudioRunDatasetPage`: `{ summary, schema, rows, nextCursor }`.
- Pure `parseAutomationStudioRecordSchema`, `validateAutomationStudioRecords`,
  and `encodeAutomationStudioRecordsCsv` with formula-injection escaping.

### Runtime capture and persistence

- `builtin.policy.action` gains an optional `recordOutput` parameter and a
  declared `records` data port; `io-policy.ts` reads `result.payload` at
  `recordsPath`, validates rows, and emits `outputs.records`.
- An executor hook `onRecordBatch` on `AutomationStudioGraphExecutionOptions`
  persists each batch from the executed result, before trace withholding; the
  saved trace keeps `{ datasetId, recordCount, schemaDigest }` only.
- Migration `AS/storage/project/schema/run-datasets.ts`: `run_datasets` and
  `run_dataset_rows`, with bodies over 256 KiB as run-owned content objects and a
  `runtime/runs/{runId}/datasets/` JSONL fallback without a project database.
- Store `AS/storage/project/run-dataset-store.ts`; collaborator
  `AS/runtime/service/datasets/` (the baselined `service.ts` does not grow).
- `AutomationStudioFlowRunDetail.datasets?` and attempt `recordCount`.

### Iteration and output references

- `builtin.control.for-each`: input `items`, branches `body` and `done`,
  outputs `item`, `index`, `count`, enforced `maxIterations`, per-run loop state.
- Runtime variables become run-scoped, so `append-list` accumulates.
- `builtin.data.write-records` for loop bodies, through a record-sink dispatcher.
- Output references: a `$output: { nodeId, portId, path }` binding, or a
  longest-own-key path lookup in `parameter-bindings.ts`.

### Recording proposal, API, and UI

- `recordOutput` on `AutomationStudioRecordingMapperCandidate` and
  `RecordingFlowActionCandidate`, lifted like `expectedState` and written to
  `parameterValues` and node-destination definitions.
- Endpoints `list-run-datasets`, `get-run-dataset-page` (cursor, limit 1-500),
  `export-run-dataset` (JSON or CSV under a byte cap) in
  `AS/api/handlers/datasets.ts`; a streaming route
  `WEB/app/api/programs/automation-studio/run-datasets/[projectId]/[runId]/[datasetId]/route.ts`
  authenticated like state-assets.
- `WEB/features/automation-studio/datasets/`: `RunDatasetsPanel`,
  `RunDatasetTable` on `DataTable` with cursor paging and schema-driven columns,
  CSV/JSON export beside Runtime Debug's Export Audit.

### Compatibility

Additive and patch-level: the contracts (`@fluxiq/contracts` 0.2.1),
`recordOutput`, the `records` port, `datasets?`, new endpoints, new nodes, and the
candidate field. Observable behaviour changes (run-scoped variables, output
references through dotted ids, any withholding change, policy actions gaining
`records`) require `fluxiq` 0.5.0 with a Migration Notes entry.

## Phases

| Core phase | Work | Downstream phase |
| --- | --- | --- |
| K1 | Record-set contracts, schema validation, CSV encoder | X1 |
| K2 | Schema migration and `run-dataset-store` | X2 |
| K3 | `recordOutput` parameter, `records` port, `io-policy` capture | X2 |
| K4 | `onRecordBatch` hook and datasets collaborator | X2 |
| K5 | Run detail `datasets` | X2 |
| K6 | Run-scoped variables, `for-each`, `write-records`, output references | X2 |
| K7 | Mapper candidate `recordOutput` lift and approval write | X4 |
| K8 | Dataset endpoints, handler, streaming export route | X2 |
| K9 | Web datasets panel and export | X2 |
| K10 | Docs (`persistence.md`, native nodes, versions, Migration Notes) and gates | X2, X4 |

## Validation

- One-to-one tests per `code-structure.md`: record-set contract tests;
  `io-policy`, `graph-run`, `node-execution`, and `trace-withholding` tests
  (the saved trace carries a summary only); `proposal-candidates`,
  `run-dataset-store`, `schema`, `datasets` handler, service, route, and web
  datasets tests.
- `npx vitest run <files> --no-file-parallelism`, then `pnpm check`,
  `pnpm docs:check`, `pnpm build`, `pnpm package:validate`, one at a time.
- A mutation proof for each guard; downstream Lab proof through X4 and X5.

## Worker Briefs

The Core brief `ex-b-core` is recorded in the downstream document's Worker
Briefs section.

## Work Ledger

### 2026-09-15 — Core design recorded from ex-b-core
- Agent: downstream supervisor; worker `ex-b-core`
- Changed: this document
- Why: record Core's dataset, iteration, persistence, API, and UI design and
  phases for the downstream extraction plan
- Validation: not validated; planning document only, no Core code changed
- Outcome: Accepted
- Follow-up: K1 with downstream X1

### 2026-09-15 — Paired plan created; Core investigation dispatched
- Agent: downstream supervisor; worker `ex-b-core`
- Changed: this document
- Why: the downstream plan crosses into Core for domain-neutral datasets
- Validation: not validated; planning document only, no Core code changed
- Outcome: Partial
- Follow-up: record Core contracts from the downstream plan

## Open Questions

1. **Dataset-row withholding.** Store rows raw but protected and retention-bound,
   strip run-withheld text before storage, or a new explicit policy. Owner:
   senior supervisor agent; recommendation, raw rows protected and
   retention-bound with the domain's sensitivity rules applied at capture, never
   copied into the saved trace. Ties to the user's E53 decision downstream.
2. **Output references and withholding.** Whether `$output` references to
   already-persisted rows are exempt from trace withholding. Owner: senior
   supervisor agent; recommendation, resolve from the dataset store and record
   only a summary in the trace.
3. **Side-effect class.** Every policy action is `external`; read-only extraction
   could derive `read` from the domain output's declared `safe` level. Owner:
   senior supervisor agent; recommendation, derive it, additively.
4. **Default `recordsPath`.** Node parameter only, or also from domain output
   metadata. Owner: senior supervisor agent; recommendation, the domain output
   declares a default (`extracted`) and the node parameter overrides it.
