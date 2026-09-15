# k12-data-view: a first-class Data window and record-output field editor

Worker: `k12-data-view`. Date: 2026-09-15. Read-only investigation in FluxIQ Core.

Path prefixes:
- `FX/` is `packages/fluxiq/src/`.
- `AS/` is `FX/programs/automation-studio/`.
- `WEB/` is `apps/web/src/`.
- `ASW/` is `WEB/features/automation-studio/`.

## Outcome

Done. Every brief question is answered with file:line in sections 1-3. One recommended design, with files, steps, tests, and mutation targets, is in sections 4-9.

Headlines:
- **Views are a closed registry.** Automation Studio's windows are tabs in main panes, a right sidebar, and a bottom dock. Each tab is one of 12 canonical views, declared in one typed registry. About ten closed lists and tests pin them, so adding a view is a known checklist (1.3).
- **No domain views.** A domain cannot contribute a view today. `DomainRegistration.componentPacks` and `programExtensions` are declared but never read (section 2).
- **`recordOutput` needs its own editor.** Today's `json` parameter editor is a flat key/value list. It would turn K3's `recordOutput` into `{ field: "" }` or a string on first touch, so a dedicated field editor is required. It should land right after K3 and before K7 or downstream X4 put `recordOutput` into real Flows (section 3).
- **Recommended Data window.** A project-scoped canonical view, id `project-datasets`, labelled "Data". It needs two new bounded endpoints (`list-project-datasets`, `list-dataset-runs`), a `flow_id` column plus a small catalog table in K2's migration, and a `datasetId` option on K8's delete. It reuses K9's table, export, and download link, and keeps an empty slot for K11's encryption status.
- **Fold the server share into existing briefs.** K2, K3, K4b, and K8 have not started, so their briefs can absorb it. The web work then splits into two workers:
  - K12d, the record-output editor, after K1 and K3;
  - K12c, the Data window, after K8 and K9.

## What changed and why

Only this report file was written, as the brief requires. No source, document, or configuration was edited.

## 1. How the web panel organizes windows and views today

### 1.1 From URL to Automation Studio

- **Page.** `/programs/automation-studio` resolves an optional `?domainId=` to a domain and renders `ProgramWorkspace` (`WEB/app/programs/automation-studio/page.tsx:15-39`).
  - `/domains/{d}/programs/{p}` redirects there with `?domainId=` (`WEB/app/domains/[domainId]/programs/[programId]/page.tsx:3-6`).
- **Workspace.** `ProgramWorkspace` renders Automation Studio full-screen (`WEB/app/programs/[programId]/ProgramWorkspace.tsx:64,73-88`) through `LiveProgramMain`.
  - `LiveProgramMain` is a hard-coded `switch (programId)` that lazy-loads one component per global program (`WEB/features/programs/ProgramLiveViews.tsx:8-11,45-58`).
  - It is re-exported at `WEB/app/programs/[programId]/ProgramLiveViews.tsx:1`.
- **Composition root.** `AutomationStudioLive` only re-exports the composition root (`ASW/AutomationStudioLive.tsx:3`). The root is held to 250 lines, no JSX, no state, and no API calls (`ASW/tests/architecture-contract.test.ts:565-582`).
- **Project gate.** Without an open project the session shows the project catalog gate. With one, it renders `AutomationStudioWorkspaceComposition` (`ASW/live/components/AutomationStudioSession.tsx:634-656`).

### 1.2 Windows: panes, tabs, regions, Add Tab

- **Layout preferences** (`ASW/workspace/layout/defaults.ts`):
  - main editor panes with tabs; the default is one pane holding Nodes (`:26-28`);
  - a right sidebar with tabs, Inspector by default (`:30-32`);
  - a bottom dock (`:34-36`);
  - per-view saved state in `viewStates` (`:62`);
  - layout presets (`:4-20`).
- **Region.** A view's region comes from its definition. The one exception is the bottom-dock preview (`ASW/workspace/layout/regions.ts:4-9`).
- **Add Tab.**
  - The palette groups options under Flow, Evidence, and Workspace (`ASW/workspace/components/window-adder.tsx:20,59-89`).
  - `automationViewAdderOptions` drops non-addable views and views for another region. It disables a view whose `requires` is unmet ("Open a project first", and similar) or that is already open (`ASW/workspace/view-adder.ts:23-51`).
  - The context comes from the current selection; `hasProject` is always true inside a project (`ASW/live/components/AutomationStudioWorkspaceComposition.tsx:84-104`).
- **Instances.** Flow- and subflow-scoped views open one instance per Flow, with id `baseId::object::<flowId>`. Project- or selection-scoped views have a single instance (`ASW/views/view-registry.ts:75-81`; `AutomationStudioWorkspaceComposition.tsx:108-115`).
- **Header.** The toolbar's Play button falls back to opening Runtime Debug (`ASW/workspace/shell/WorkspaceHeader.tsx:76`; command type `ASW/workspace/shell/contracts.ts:18`; binding `AutomationStudioSession.tsx:626-631`).
- **The 12 canonical views** (`ASW/views/canonical-view-definitions.tsx:77-162`):

| View | Scope |
| --- | --- |
| Connected Clients | project |
| Timeline | recording |
| Nodes | subflow |
| Router | top-level Flow |
| Subflows, Instructions, Adaptations, Settings | Flow |
| State View | selection |
| Runtime Debug | Flow |
| Problems | right sidebar, project |
| Inspector | right sidebar, selection |

### 1.3 How a view is registered (the checklist K12c follows)

1. **Definition.** One entry in `defineAutomationStudioViews({...})` with these fields (`ASW/views/view-definition-types.ts:65-90`):
   - `id`, `aliases`, `kind`, `label`, `icon`;
   - `group` (Flow, Evidence, or Workspace), `region`, `allowedRegions`, `scope`;
   - `requires`, `isAvailable`, `addable`;
   - `lifecycle`, `cache`, `functionality`, `host`.

   Ids, the id map, and the list are derived from it (`canonical-view-definitions.tsx:185-191`). The host registry is built from the definitions, keyed by `kind` (`ASW/views/view-host-registry.tsx:33-56`).
2. **Kind.** `kind` must be a member of `AutomationViewType` (`ASW/views/view-types.ts:3-15`).
3. **Instances.** One instance is created per definition (`ASW/views/view-instances.ts:11-33`). The test holds this equal to the id list (`ASW/views/tests/view-instances.test.ts:7-10`).
4. **Connector.** Each view id needs a connector in `connectorByViewId` (`ASW/live/view-host/connected-view-entries.tsx:163-176`). The map must equal the id list (`architecture-contract.test.ts:381-415`).
   - A connector declares `placeholder`, `projectScopes`, optional `runtimeScopes` and `selectionScopes`, `selectModel`, `activationKey`, `onActive`, and `query` (`ASW/live/view-host/direct-view-connector.tsx:58-78`).
   - It subscribes to stores only while active (`architecture-contract.test.ts:405-407`).
5. **Commands.** Commands are keyed by view id (`ASW/live/view-host/useAutomationConnectorCommands.ts:65-106`) and wired in the session (`AutomationStudioSession.tsx:519-549`).
6. **Metadata.** The window title comes from the definition label (`ASW/workspace/components/view-metadata.ts:6-7`). The description needs its own line; otherwise it falls back to "Open this workspace view." (`:29-48`).
7. **Architecture test lists** (`ASW/tests/architecture-contract.test.ts`):
   - `canonicalEntryViews` (`:33-50`). Entry views may not call `useProgramApi`, `api.get` or `api.post`, or import `program-api` (`:274-287`).
   - `productDomains` (`:58-72`). A sibling domain may import another only through its barrel (`:417-420`; `ASW/architecture-test-helpers.ts:240-260`).
   - `approvedTopLevelDirectories`, a closed set (`:74-79`, `:306-312`).
   - Raw view-id string literals are allowed only in the definition and migration files (`:52-56`, `:323-328`). An id equal to its `kind` string needs a special case, as `adaptations` has (`:142-149`).
8. **Diagnostics and functionality.**
   - Every registered id needs a diagnostics policy (`ASW/views/tests/canonical-diagnostics-disclosure.test.ts:7-30`).
   - It also needs a functionality contract: purpose, scope, cache keys, seven behaviour states, a bounded scale, commands (destructive ones with confirmation text), and three browser-only certification items (`ASW/flow-editor/tests/canonical-view-functionality.test.ts:15-101`; example `ASW/runtime/functionality-contract.ts:1-122`).
9. **Styles.** CSS may live only in a closed set of style domains, imported by the Studio manifest (`ASW/styles/tests/styles-architecture.test.ts:16-24`; `WEB/app/programs/automation-studio/automation-studio.css:1-37`).
10. **Documentation.** `docs/architecture/automation-studio/workspace.md` covers registration at `:284-301` and has the canonical view table at `:569-582`.
11. **Frozen structure-baseline entries on files a new view touches:**
    - `canonical-connected-views.tsx` is frozen at 12 exported components (`.structure-baseline.json:44`, rule `exported-values` starting `:27`).
    - `canonical-view-definitions.tsx` is frozen at 17 and `connected-view-entries.tsx` at 3 under `imports` (`:93`, `:106`, rule starting `:92`).
    - `views::view` (11) and `runtime::run` (5) are frozen shared-prefix groups under `naming` (`:248`, `:256`, rule starting `:247`).
    - Therefore a new connector needs its own file, new imports should target barrels, and no new three-file kebab prefix group may appear.

### 1.4 How a view is routed and navigated to

- **URL.** The browser URL carries only `project`, `flow`, `subflow`, `view`, and `detail=<kind>:<id>`, where kind is run, adaptation, recording, node, or state (`ASW/navigation.ts:7-45`). Ordinary view state must stay out of the URL (`architecture-contract.test.ts:454-463`).
- **Hierarchy tree.**
  - Node kind maps to a view (`ASW/hierarchy/routing.ts:48-66`); `run` opens Runtime Debug and `client` opens Connected Clients (`:53`, `:55`).
  - The creatable categories list only Flows (`ASW/hierarchy/contracts.ts:8-10`).
  - Workspace selections are `clients` or `runs` (`ASW/shared/selection-contracts.ts:6`).
- **In-session opens** call `openView(viewId, "preview")` (`AutomationStudioSession.tsx:339,629`; `ASW/live/hooks/useAutomationHierarchyCommandBridge.ts:115-117`).
- **Cross-view context** travels in saved view state. Adaptations reads `prefs.viewStates[instance].selectedAdaptationId` (`ASW/live/view-host/canonical-connected-views.tsx:257-267`).
  - Runtime Debug has no such input. It focuses a run only after its own launch (`ASW/runtime/FlowRunView.tsx:223`; `ASW/runtime/RunHistory.tsx:100-101`).

### 1.5 How a view loads data with bounded queries

- **Injected transport.** Views fetch through an injected `ProgramCommandTransport` (`ASW/data/program-transport.ts:3-6`), built in a per-domain host hook (`ASW/runtime/runtime-host.ts:55-85`).
  - Entry views never call the Program API directly (`architecture-contract.test.ts:274-287`).
  - Each view has a `...Content` variant that takes the commands, which tests inject (`RunHistory.tsx:12-18`; `ASW/runtime/tests/runtime-views.test.tsx:33-38`).
- **Request policy.** Catalog and summary requests may not use the 12 full-document endpoints, and retired endpoints are blocked (`ASW/data-request-policy.ts:7-55`).
- **Preloading** warms bounded first pages at low priority: 25 runs, 50 events, 50 actions (`data-request-policy.ts:84-122`; `workspace.md:271-282`).
- **Server paging.** Run pages clamp to 1-100, default 25 (`AS/runtime/service/summaries/store.ts:539`).
  - `flowId` is optional, so a project-wide run list already exists (`AS/api/handlers/runs.ts:17-18`; `store.ts:547,554`).
- **Domain scope.** Every call carries `?domainId=` (`WEB/features/programs/program-api.ts:120-127`).
- **Per-view page sizes** live in each view's functionality contract, for example Runtime Debug page 50, mounted budget 100, fixture 100,000 (`ASW/runtime/functionality-contract.ts:45-51`).

### 1.6 Runtime Debug, the precedent K9 extends

- **Structure.** `FlowRunView` has Runs and Replays tabs (`FlowRunView.tsx:325-334`). `RunHistory` switches between a list and `RunActionLogView` (`RunHistory.tsx:18-27,119`).
- **Export Audit** fetches JSON and downloads a Blob (`ASW/runtime/RunActionLogView.tsx:214-237,266-268`).
- **Limitation.** Runtime Debug requires a selected Flow (`canonical-view-definitions.tsx:141-147`). A panel inside it therefore cannot show datasets across Flows. That is the gap K12 closes.

### 1.7 Global program live views

Each global program has one live component (`WEB/features/programs/live-views.tsx:1-8`). None has inner views or a registry. Datasets are project data in `project.sqlite` (CD16), so the Data window belongs inside Automation Studio, not as a new global program.

## 2. Can a domain contribute a view? No

- **Unused registration fields.** `DomainRegistration` declares `componentPacks?` and `programExtensions?` (`FX/domains/index.ts:51-55`). A grep of `FX/` and `WEB/` found no reader; the only matches are those declaration lines. `DomainManifest` has no UI fields (`:5-16`).
- **Closed program UIs.** Program UIs are a closed switch (`ProgramLiveViews.tsx:45-58`).
- **Closed Studio views.** Automation Studio views, connectors, and top-level directories are closed compile-time lists (`canonical-view-definitions.tsx:77-162`; `connected-view-entries.tsx:163-176`; `architecture-contract.test.ts:74-79`).
- **How a domain does reach the panel:** only as the `domainId` scope (`WEB/app/programs/automation-studio/page.tsx:15-19`), and through data it proposes (recording candidates, CD19).
- **Recommendation.** The Data window is domain-neutral Core UI. K12 adds no view-contribution seam. Domain affordances, such as picking fields on a live page, stay in the extension (downstream X4 and Phase 3.7).

## 3. How `json` node parameters are edited today

- **Mount point.** The Inspector mounts `AutomationNodeParameterEditor` for a selected editor node (`ASW/inspector/InspectorView.tsx:37-62`). It renders one field per parameter (`ASW/parameters/ParameterEditor.tsx:15-57`).
- **Source selector.** A Manual or State selector appears unless `allowStateBinding === false` (`:66-80`).
- **Object and json editor.** `valueType` `object` or `json` renders `AutomationObjectParameterEditor` (`:149-156`), a flat list of key/value text rows (`:322-343`):
  - values are coerced from typed text: `true`, `null`, and numbers (`:454-464`);
  - a nested object or array shows as JSON truncated at 90 characters (`:448-452,466-470`), and typing in that row replaces the nested value with a string;
  - "Add field" inserts `field: ""` (`:338`), and rows with blank keys are dropped (`:326`).
- **Validation.** It only checks for a non-array object (`:386`); an empty value passes when not required (`:373-375`). The same function feeds graph Problems (`ASW/flow-editor/graph-validation.ts:37`).
- **No structured control.** UI controls are a closed union of `text`, `textarea`, `identifier`, `path`, `field`, `reference`, and `value` (`AS/nodes/contracts.ts:47-51`). None edits a structure.
- **Defaults.** A `json` parameter without a default starts as `{}` (`ASW/graph/node-parameters.ts:12`).

**Consequence for K3's `recordOutput`.** K3 declares it as `valueType: "json"`, `defaultValue: null`, `allowStateBinding: false` (`k-datasets-execution.md:541-542`). With today's editor:
- it shows an empty object editor, and "Add field" writes `{ field: "" }`;
- a proposal-written value shows `schema` as truncated JSON, and one keystroke turns it into a string;
- the node then fails before dispatch (CD13). That is safe, but the schema is lost.

So `recordOutput` needs its own control, shipped right after K3 and before K7 approvals or downstream X4 put real values into Flows.

## 4. Recommended design

### 4.0 What the user sees (example)

Project "Shop monitor" has a Flow "Catalog scrape". Its extraction node saves a table `products` with fields Name, Price, and Link, and a "Card number" field set to Exclude column.

1. The user clicks **Data** in the Studio toolbar, or Add Tab, then Evidence, then Data. A Data tab opens in the main editor.
2. **Tables** lists one row per Flow and table, for example `Products | Catalog scrape | 12 runs | last run 240 rows | 2 min ago`. An "All Flows" dropdown and a search box filter it.
3. Picking that row lists its **Runs**, newest first: `run.8f2c | succeeded | 240 rows`, then `run.77a1 | failed | 31 rows`. A status filter and a run-id search narrow the list.
4. Picking a run shows the **table**.
   - Columns are Name, Price, and Link. Card number never appears.
   - Rows load 50 at a time with **Load more**, and links show as text.
   - Buttons: **Export CSV**, **Export JSON**, **Open run**, and **Delete this run's table**.
   - Delete asks for confirmation and writes an audit record.
   - A very large table exports through a download link instead of inside the page.
5. **Open run** jumps to Runtime Debug with that run's action log open.
6. After K11, a badge next to the table name reads, for example, "Encrypted columns: active", and encrypted cells show masked values with Reveal. Before K11 the badge area shows nothing.

### 4.1 The Data window view

**Definition** (key `datasets`, in `canonical-view-definitions.tsx`, importing from the `../datasets` barrel so the `imports` baseline does not grow):
- id `project-datasets`, kind `datasets`, label "Data", icon `Database` (lucide, already imported at `ProgramWorkspace.tsx:8`);
- group Evidence, region and `allowedRegions` main, scope "Current project";
- `requires: "hasProject"`, `isAvailable: available("hasProject")`, `addable: true`;
- `lifecycle(true)`, `cache` schemaVersion 1;
- functionality: `("project-datasets", "Browse, preview, export, and delete extracted datasets across Flows and runs.", ["project", "flow"], ["dataset directory page"], ["dataset run page", "row page", "export", "encryption status"], "paged")`.

Two properties follow from these choices:
- The id differs from the kind, so the raw-literal audit needs no special case (`architecture-contract.test.ts:142-149`).
- The view is project-scoped, so it has one instance (`view-registry.ts:79-80`).

**Host binding** (`ASW/datasets/datasets-view-host.ts`):
- `DatasetsViewHostModel = { projectId: string | null; flows: Array<{ flowId: string; name: string }>; requested: { flowId: string | null; datasetId: string | null; runId: string | null } }`.
- `DatasetsViewHostCommands = { onOpenRun?(flowId: string, runId: string): void; onSelectionChange?(selection: { flowId: string | null; datasetId: string | null; runId: string | null }): void }`.
- `useDatasetDirectoryCommands()` builds its commands on `useProgramTransport("automation-studio")`, like `runtime-host.ts:55-70`:
  - `listProjectDatasets` and `listDatasetRuns` (new);
  - `getRunDatasetPage` and `exportRunDataset` (K9 queries);
  - `deleteRunDatasets` with `datasetId?` (K9 command).
- `DatasetsView` wraps `DatasetsViewContent(props & { commands })`, so tests inject commands.

**Connector** (`AutomationDatasetsConnectedView`, in new file `ASW/live/view-host/datasets-connected-view.tsx`, because the canonical file cannot grow, baseline `:44`):
- `projectScopes: () => [automationEntityScope("flows")]`.
- `selectModel` returns:
  - `projectId`;
  - top-level Flow options from `scope.projectView.read().projectFlows`, filtered as the recording connector does (`canonical-connected-views.tsx:205`);
  - `requested` read from `prefs.viewStates[scope.viewInstanceId]`, as Adaptations does (`:257-267`).
- It adds no new entity kind to the project data store (`ASW/stores/project-data-store.ts:37-38`). Pages stay in component state, as in Runtime Debug.

**Layout and limits:**
- Tables, Runs, and Table sit side by side when wide and stack when narrow.
- Rows render through K9's `RunDatasetTable` on `DataTable` (`WEB/features/programs/components/data/DataTable.tsx:5-13`).
- Page sizes: tables 50 (1-200), runs 25 (1-100), rows 50 (1-200), per CD20 and `store.ts:539`.
- Selection changes call `onSelectionChange`, which saves `{ flowId, datasetId, runId }` for warm restore.

**Export and delete:**
- Inline export downloads a Blob, as `RunActionLogView.tsx:225-233` does. When the response is `tooLarge`, the page uses K9's `download-href.ts`, which appends `domainId`.
- Delete opens an `AlertDialog` that names the table and run and says the rows are removed permanently and the deletion is audited.
- `flows.write` is enforced only by the server; the web `CurrentUser` carries no permissions (`WEB/features/programs/types.ts:1-7`). So the button stays enabled and a 403 shows inline, as the runtime contract's `permission` state describes (`ASW/runtime/functionality-contract.ts:43`).

**Entry points:**
- **Toolbar button.** "Data" in `WorkspaceHeader.tsx:72-80` calls a new `openDatasets()` header command. It is added to `workspace/shell/contracts.ts:18`, passed through `AutomationStudioWorkspaceComposition.tsx:55-60,135-142`, and bound in `AutomationStudioSession.tsx:626-631` as `openView(automationStudioViewId.datasets, "preview")`.
  - The name avoids confusion with the development-only Data Flow Inspector (`openDataInspector`, `AutomationStudioWorkspaceComposition.tsx:138`; `ASW/development/DataInspector.tsx:106`).
- **Add Tab** works automatically from the definition.
- **From K9's `RunDatasetsPanel`.** An "Open in Data" link goes through a new `RuntimeViewHostCommands.onOpenDatasets?(flowId, runId, datasetId)` (`runtime-host.ts:18-21`). The session writes the Data view state and opens the view.
- **Open run.** The session writes Runtime Debug's view state `{ flowId, requestedRunId }`, selects the Flow, and opens Runtime Debug.
  - `RuntimeViewHostModel` gains `requestedRunId?` (`runtime-host.ts:8-16`), read by the runtime connector as Adaptations reads its request (`canonical-connected-views.tsx:284-302`).
  - `FlowRunView` passes it as the `focusRunId` fallback (`FlowRunView.tsx:223`).
- **No hierarchy-tree entry and no new URL `detail` kind.** `view=project-datasets` deep links work through `navigation.ts:22` once the view is registered.

### 4.2 Endpoints and storage

**Identity of a table across runs.** A table is the pair (`flowId`, `datasetId`).
- `datasetId` comes from the node's `recordOutput` and repeats across runs; two Flows may reuse the same id.
- `flowId` is the run's Flow, `runtime_runs.flow_id` (`AS/storage/project/schema/domain-resources.ts:281-297`). This includes rows captured inside Call Flow children (CD14).

**Storage (amend K2 before dispatch; if migration 0019 has already shipped, make these migration 0020):**
- `run_datasets.flow_id text not null`, set inside `appendBatch` from `runtime_runs`. The run row always exists first (`k-datasets-execution.md:475-477`), so the capture hook signature does not change.
- New `run_dataset_catalog` table:
  - primary key `(flow_id, dataset_id)`;
  - columns `label`, `latest_run_id`, `latest_updated_at_ms`, `run_count`, `latest_record_count`, `latest_truncated`, `schema_digest`;
  - index `run_dataset_catalog_updated_idx (latest_updated_at_ms desc, flow_id, dataset_id)`;
  - upserted in the same `appendBatch` transaction, and recomputed for affected keys in `deleteRunDatasets`.
- New index `run_datasets_flow_dataset_idx (flow_id, dataset_id, updated_at_ms desc, run_id)`.
- Add the catalog to `schema/table-names.ts`, which K2 already edits (`k-datasets-execution.md:481-482`).
- **Why a catalog:** grouping `run_datasets` by key and ordering by the newest run would scan every group on every page. The catalog keeps the directory an index-ordered cursor page, like other summaries.

**Store methods** (K2's `run-dataset-store.ts`):
- `listProjectDatasets({ flowId?, search?, limit, cursor })`:
  - cursor owner `project-datasets`;
  - values `{ updatedAt, flowId, datasetId }`;
  - filter hash over `flowId` and `search`.
- `listDatasetRuns({ flowId, datasetId, status?, runId?, limit, cursor })`, joined to `runtime_runs` for `status` and `started_at_ms`.
- `deleteRunDatasets(runId, { datasetId?, actorId? })`.

**Contracts** (`@fluxiq/contracts/automation-studio`, additive within 0.2.1, after K1):
- `packages/contracts/src/record-sets/project-dataset-summary.ts`:
  - `AutomationStudioProjectDatasetSummary { flowId, datasetId, label?, latestRunId, latestUpdatedAt, runCount, latestRecordCount, latestTruncated, schemaDigest, encryptedFieldIds? }`;
  - its page type `{ datasets, nextCursor }`.
- `packages/contracts/src/record-sets/dataset-run-summary.ts`:
  - `AutomationStudioDatasetRunSummary`, which is `AutomationStudioRunDatasetSummary & { flowId, runStatus, runStartedAt }`;
  - its page type.

**Endpoints** (amend K8):

| Endpoint | Permission and checks | Request | Response |
| --- | --- | --- | --- |
| `list-project-datasets` | `programs.read`; domain check first | `{ projectId, flowId?, search?, limit?, cursor? }` | `{ datasets, page: { nextCursor, limit } }` |
| `list-dataset-runs` | `programs.read`; domain check first | `{ projectId, flowId, datasetId, status?, runId?, limit?, cursor? }` | `{ runs, page: { nextCursor, limit } }` |
| `delete-run-datasets` (K8) | `flows.write`; audited | adds `datasetId?`, validated against `^[A-Za-z0-9._:-]{1,200}$` | unchanged |

- K8's `get-run-dataset-page`, `export-run-dataset`, and streaming route serve the preview and export unchanged.
- Both new endpoints are ordinary `summary` requests (`data-request-policy.ts:36-45`), and the permission matrix covers them automatically (`k-datasets-execution.md:190-191`).
- K4b's collaborator (`AS/runtime/service/datasets/`, `k-datasets-execution.md:614-644`) gains the two list methods and the `datasetId` option.
- **CD17 amendment:** a delete removes either all of a run's datasets or one (`datasetId`). Both write `deleted` audit rows; the audit table already carries `dataset_id` (`k-datasets-execution.md:244-251`).

### 4.3 Record-output field editor

**Core (fold into K3):**
- Add `"record-output"` to the `ui.control` union (`AS/nodes/contracts.ts:48`).
- Set `ui: { control: "record-output" }` on the `recordOutput` parameter K3 adds to `AS/nodes/policy/action.ts:15-33`.

**Web routing** (in `ParameterEditor.tsx`):
- `ui.control === "record-output"` renders `RecordOutputEditor`, checked before the object/json branch (`:149`).
- `automationParameterError` returns `recordOutputParameterError(value)`, checked before the object check (`:386`). Graph Problems then show an invalid record output through `graph-validation.ts:37`.
- The Manual/State selector stays hidden because of `allowStateBinding: false` (`:66`).

**New directory `ASW/parameters/record-output/`.** `ASW/parameters/record-output/RecordOutputEditor.tsx` is 8 path segments, within the cap.
- **`RecordOutputEditor.tsx`**, in this order:
  1. A "Save extracted records" switch. Off writes `null`, so K3's payload is byte-identical to today.
  2. Table id (identifier, `^[A-Za-z0-9._:-]{1,200}$`).
  3. Table name.
  4. Records path (required, CD19).
  5. Write mode, Append or Replace.
  6. Max records (1-10,000, default 1,000).
  7. The fields table, with a note that changing fields changes the table shape for later runs while earlier runs keep theirs. A shape change inside one run is rejected (`k-datasets-execution.md:495`).
- **`RecordFieldRow.tsx`** (one row per field):
  - Field name: the label, 1-200 characters, unique.
  - Field id: auto-derived from the name, editable, `^[A-Za-z0-9_-]{1,100}$`, unique.
  - Value type: Text (`string`), Number, Yes/No (`boolean`), Link (`url`), Date and time (`datetime`), JSON.
  - Required.
  - Key: a single primary key.
  - Move up and Move down, because column order is CSV order.
  - Remove.
- **`FieldHandlingControl.tsx`:** a segmented Include / Exclude column / Encrypt column control, with `Tooltip` info hovers (`WEB/features/programs/components/layout/Tooltip.tsx:7-15`).
  - **Exclude column** hover (downstream D12): the column is left out entirely. The page never reads it, so it is absent from the node's output, the saved table, the preview, and exports. Use it for passwords, card numbers, or personal details you do not want collected, saved, or exported. It stays listed so field detection does not propose it again.
  - **Encrypt column** before K11: disabled, with "Encrypt column arrives with project record keys" (issue `record_schema.encrypt_unavailable`). After K11 it is enabled, and an encrypted field cannot be the key.
- **`record-output-draft.ts`:** pure edits (toggle, add up to 200 fields, remove, move, set handling, set key, derive id from name) that write every contract field by name.
- **`record-output-issues.ts`:** `recordOutputParameterError(value)`, which runs K1's `parseAutomationStudioRecordOutput` and maps issue codes to plain messages.

**Rules and dependencies:**
- **Exclude keeps the field.** It stays in the node's schema with `handling: "exclude"`, and storage drops it (`storedAutomationStudioRecordSchema`; plan Design, "Contracts (owned here)").
- **The parser must be reachable from the web.** `apps/web` never imports `@fluxiq/contracts` directly (no match under `apps/web`); it uses `fluxiq/...` subpaths (`ParameterEditor.tsx:3-8`). K1's parser therefore has to be re-exported through a `fluxiq` subpath. If K1 does not already do this, K12d adds it.

### 4.4 K11 encryption slot

- `ASW/datasets/EncryptionStatusSlot.tsx` takes `status?: AutomationStudioRecordEncryptionStatus | null` (`k11-encrypted-fields.md:600-602`) and `encryptedFieldIds?`. It renders nothing when `status` is undefined.
- K11 step 9 fills it from the record-keys `status` endpoint (`k11-encrypted-fields.md:640-641`). In the same step K11:
  - adds masked cells and Reveal inside `RunDatasetTable`;
  - adds the export `encryptedFields` choice;
  - adds the project "Encrypted columns" panel (`:663-665`);
  - enables Encrypt in `FieldHandlingControl`.

### 4.5 Alternatives rejected

| Alternative | Why rejected |
| --- | --- |
| A cross-Flow tab inside Runtime Debug | Its definition requires a Flow (`canonical-view-definitions.tsx:141-147`). |
| A new global program | Datasets live in one project's `project.sqlite` (CD16) and need the project, Flow, and run context. |
| A JSON text box for `recordOutput` | It exposes ids, invites invalid schemas, and does not match the extension's Include / Exclude / Encrypt vocabulary (D12, D13). |
| Domain-contributed views | No seam exists (section 2), and records are domain-neutral. |
| A `group by` directory without a catalog | Every page would scan all groups. |

## 5. Files and ownership (partitioned by file)

| Work unit | Owns | Runs after, or serial with |
| --- | --- | --- |
| K3 amendment | `AS/nodes/contracts.ts`, `AS/nodes/policy/action.ts`, `AS/nodes/policy/tests/action.test.ts` | inside K3 |
| K2 amendment | `AS/storage/project/schema/run-datasets.ts`, `AS/storage/project/schema/table-names.ts`, `AS/storage/project/run-dataset-store.ts`, `AS/storage/project/tests/run-dataset-store.test.ts` | inside K2 |
| K4b amendment | `AS/runtime/service/datasets/**` | inside K4b |
| K8 amendment | `AS/api/contracts/endpoints.ts`, `AS/api/contracts/dataset.ts`, `AS/api/handlers/datasets.ts`, `AS/api/handlers/tests/datasets.test.ts`, `packages/contracts/src/record-sets/project-dataset-summary.ts`, `packages/contracts/src/record-sets/dataset-run-summary.ts`, the record-sets `index.ts` and its tests | inside K8; after K1 (record-sets barrel) |
| K12d record-output editor | `ASW/parameters/ParameterEditor.tsx`, `ASW/parameters/tests/ParameterEditor.test.tsx`, `ASW/parameters/record-output/**` (new) | after K1 and K3 |
| K12c Data window | see the file list below | after K9 and the K8 amendment |
| K10 amendment | `docs/architecture/automation-studio/persistence.md` (catalog, two endpoints, delete by dataset), `docs/architecture/automation-studio-native-nodes.md` (record-output editor) | inside K10 |

**K12c file list:**
- **New, in `ASW/datasets/`:** `DatasetsView.tsx`, `datasets-view-host.ts`, `DatasetDirectory.tsx`, `DatasetRunList.tsx`, `DatasetPreview.tsx`, `DatasetDeleteConfirmation.tsx`, `EncryptionStatusSlot.tsx`, `directory-state.ts`, `functionality-contract.ts`, and `tests/`.
- **Edited K9 files:** `ASW/datasets/index.ts`, `dataset-queries.ts`, `dataset-commands.ts`, `RunDatasetsPanel.tsx`.
- **Views:** `ASW/views/view-types.ts`, `ASW/views/canonical-view-definitions.tsx`, `ASW/views/tests/canonical-diagnostics-disclosure.test.ts`.
- **Live host:**
  - new `ASW/live/view-host/datasets-connected-view.tsx` and `ASW/live/view-host/tests/datasets-connected-view.test.tsx`;
  - `connected-view-entries.tsx`, `useAutomationConnectorCommands.ts`, `canonical-connected-views.tsx` (runtime `requestedRunId` only, no new export);
  - `ASW/live/components/AutomationStudioSession.tsx`, `AutomationStudioWorkspaceComposition.tsx`.
- **Workspace:** `ASW/workspace/shell/contracts.ts`, `WorkspaceHeader.tsx`, `ASW/workspace/components/view-metadata.ts`.
- **Runtime:** `ASW/runtime/runtime-host.ts`, `FlowRunView.tsx`, `ASW/runtime/tests/runtime-views.test.tsx`.
- **Architecture tests:** `ASW/tests/architecture-contract.test.ts`, `ASW/flow-editor/tests/canonical-view-functionality.test.ts`.
- **Styles:** `ASW/styles/datasets/01-data-window.css`, `ASW/styles/tests/styles-architecture.test.ts`, `WEB/app/programs/automation-studio/automation-studio.css`.
- **Docs:** `docs/architecture/automation-studio/workspace.md`.

**Size and naming limits:**
- `ASW/datasets/` holds 15 source files (K9's 6 plus 9), under the 25 cap.
- K9 already has two `dataset-` kebab files. The names above avoid a third, which would create a new frozen-rule violation (`naming`, `.structure-baseline.json:247-271`).
- `AutomationStudioSession.tsx` is 657 lines against the 700-line web ceiling (`architecture-contract.test.ts:422-427`). K12c should add only a few binding lines there and put handler bodies in an existing hook.

## 6. Ordered steps

1. **K3 brief.** Add the `record-output` control (union and parameter `ui`) and assert it in `action.test.ts`.
2. **K2 brief.** Add `flow_id`, the catalog table and indexes, catalog maintenance in `appendBatch` and in `deleteRunDatasets(runId, { datasetId? })`, and `listProjectDatasets` and `listDatasetRuns`.
3. **K4b brief.** Add the collaborator methods.
4. **K8 brief.** Add the contracts, endpoint names, and handlers (domain check first), and `datasetId?` on delete.
5. **K12d**, after K1 and K3. Create `parameters/record-output/`, add the routing and error branch in `ParameterEditor.tsx`, and write the tests.
6. **K12c.1**, after K9 and step 4. Create the `datasets/` view files and tests, and extend K9's queries and commands.
7. **K12c.2, registration:**
   - view type;
   - definition, imported through the `../datasets` barrel;
   - connector file and entries map;
   - connector commands;
   - metadata description;
   - diagnostics policy;
   - functionality contract and its test list;
   - architecture lists `canonicalEntryViews` (`datasets/DatasetsView.tsx`) and `productDomains` (`datasets`).
8. **K12c.3, entry points.** Header `openDatasets`; "Open in Data" from `RunDatasetsPanel`; "Open run" into Runtime Debug through `requestedRunId`.
9. **K12c.4.** Add the `datasets` style domain and manifest import; add a `workspace.md` table row and a registration mention.
10. **K10.** Update the persistence and native-node docs.
11. **K11 step 9, with Phase 3.7.** Fill the encryption slot, add masked cells and the export choice, and enable Encrypt.
12. **Validation, one command at a time** (this machine's RAM fault):
    1. targeted `pnpm --filter @fluxiq/web exec vitest run src/features/automation-studio/datasets src/features/automation-studio/parameters src/features/automation-studio/tests/architecture-contract.test.ts src/features/automation-studio/views/tests src/features/automation-studio/flow-editor/tests/canonical-view-functionality.test.ts --no-file-parallelism`;
    2. `pnpm --filter @fluxiq/web check`;
    3. `pnpm structure:check`;
    4. the plan's full gates.

    A live browser pass needs the user's authorization to run the panel.

## 7. Tests

**Server:**
- `run-dataset-store.test.ts`:
  - the first append creates a catalog row;
  - `run_count` increases once per new run;
  - `latest_*` follow the newest run;
  - `flow_id` equals the run's Flow;
  - `listProjectDatasets` filters by Flow and by search, orders newest first, round-trips its cursor, and rejects a cursor from another filter;
  - `listDatasetRuns` pages newest first and filters by status and run id;
  - a delete with `datasetId` removes only that dataset and recomputes the catalog;
  - deleting the last run removes the catalog row.
- `datasets.test.ts`:
  - both list endpoints enforce `programs.read` and reject a domain mismatch;
  - `limit` is clamped;
  - `datasetId` on delete is validated and scoped.
- `action.test.ts`: `recordOutput.ui.control === "record-output"`.
- `permission-matrix.test.ts` runs unchanged.

**K12d:**
- `record-output-draft.test.ts`:
  - toggling off writes `null`;
  - Exclude keeps the field with its `handling`;
  - adding stops at 200;
  - moving preserves the other fields;
  - removing the key field clears the key;
  - derived ids are unique.
- `record-output-issues.test.ts`: plain messages for `record_schema.encrypt_unavailable`, a duplicate id, and a missing records path; `null` gives no error.
- `RecordOutputEditor.test.tsx`:
  - renders the fields table and never the generic object editor;
  - Encrypt is disabled with its reason;
  - the Exclude hover text is present;
  - no Manual/State selector appears.
- `FieldHandlingControl.test.tsx`: selecting an option writes `handling`; accessible names.
- `ParameterEditor.test.tsx`: the `record-output` control routes to the new editor; `automationParameterError` returns the record-output message.

**K12c:**
- `datasets/tests/directory-state.test.ts`: request limits are clamped, a filter change resets the cursor, and saved selection is restored.
- `datasets/tests/DatasetsView.test.tsx`:
  - empty state;
  - the Flow filter sends `flowId`;
  - picking a table requests that key's runs;
  - picking a run requests its row page;
  - commands are injected, with no Program API.
- `datasets/tests/DatasetPreview.test.tsx`:
  - columns follow the schema;
  - inline export takes the Blob path;
  - the `tooLarge` link carries `domainId`;
  - delete confirms first and sends `datasetId`;
  - a 403 shows its message.
- `datasets/tests/EncryptionStatusSlot.test.tsx`: undefined renders nothing, `active` renders a badge, and `caller_not_holder` renders a notice.
- `live/view-host/tests/datasets-connected-view.test.tsx`: Flow options exclude subflow graphs; the requested selection is read from view state.
- **Edited gates:**
  - architecture contract: entry view and product domain;
  - diagnostics disclosure policy for `project-datasets`;
  - functionality contracts list;
  - styles domains;
  - `runtime-views.test.tsx`: `requestedRunId` opens that run's log.

## 8. Mutation targets

Each should be observed red, then reverted.

**Server:**
- catalog upsert removed from `appendBatch`;
- `flowId` filter ignored in `listProjectDatasets`;
- cursor filter-hash check removed;
- `deleteRunDatasets` ignores `datasetId`, so it deletes every dataset of the run;
- catalog not recomputed after delete;
- domain check removed from a list handler;
- delete permission weakened to `programs.read`.

**K12d:**
- routing branch removed, so the generic object editor renders;
- toggling off writes `{}`;
- Exclude removes the field instead of keeping it;
- Encrypt enabled before K11;
- field order lost on move;
- duplicate ids accepted;
- the state source selector shown.

**K12c:**
- `flowId` dropped from the list request;
- page limit not clamped;
- delete sent without confirmation;
- `domainId` dropped from the download link;
- slot renders a status when it is undefined;
- the definition's `requires` removed or `addable` set to false;
- connector removed from the entries map (existing architecture test).

## 9. Sequencing with K8, K9, X4, and Phase 3.7

- **Now.** K1 is running (Current State "In progress"). K2, K3, K4b, and K8 have not started (Current State "Not done"), so amend their briefs before dispatch rather than editing their files a second time.
- **After K1 and K3.** Run K12d, which shares no files with K2, K4a, K4b, K5, or K6.
- **After K8 and K9.** Run K12c, which shares K9's `datasets/`, `runtime-host.ts`, and the architecture test.
- **K10** documents K12's server and editor parts; K12c documents `workspace.md`.
- **Downstream X4** (recordable extraction with the K7 lift; downstream plan phase table, X4 row) should wait for K12d, so that approved extraction nodes are editable in Studio without corrupting their schema.
  - The X5 Lab proof can use the Data window if K12c is in, but does not need it; K9's run panel suffices.
- **Downstream Phase 3.7** (Week 3; downstream plan "Week 3's Phase 3.7 then builds...") runs with K11 step 9. That step fills the slot and enables Encrypt, which K12 leaves ready.
- **Worker capacity.** At most four code workers run at once (Current State). K12d fits any free slot after K3; K12c is one worker.

## Commands run and observed results

- **Directory counts.** PowerShell `Get-ChildItem` over `ASW/` printed per-directory file counts, for example `live 65`, `runtime 25`, `views 30`, `parameters 2`, `workspace 82`. It listed four top-level files: `architecture-test-helpers.ts`, `AutomationStudioLive.tsx`, `data-request-policy.ts`, `navigation.ts`.
- **File listings.**
  - `ASW/views/`, `ASW/runtime/`, `ASW/parameters/`, and `WEB/features/programs/`.
  - `ASW/live/` and `ASW/workspace/` source files with line counts, for example `components\AutomationStudioSession.tsx 657`, `view-host\canonical-connected-views.tsx 384`, `view-host\connected-view-entries.tsx 164`.
  - `WEB/app/`.
- **Everything else** was Read, Grep, and Glob.
- **Not run:** builds, tests, type checks, the structure audit, or the web panel. The brief forbids them because other workers share a machine with faulty RAM.

## Not verified

- **No design code or checks were executed.** Every test and mutation target above is a plan, not an observation.
- **Structure audit details.**
  - Rule names were inferred from the baseline's `rules` key ranges (`.structure-baseline.json:20-272`), not read in `scripts/structure-audit.mjs`.
  - Whether the `naming` rule groups PascalCase components by prefix is not read. The single `runtime::run: 5` entry, with five `Run*.tsx` and five `run-*.ts` files present, suggests it counts only kebab files.
- **Session handler bodies.** The implementations of `openAdaptation` and `selectAdaptation` in the session were not read. The pattern "write view state, then open a view" is inferred from the Adaptations connector reading `viewStates`.
- **Parser export path.** Whether K1 will export `parseAutomationStudioRecordOutput` through a `fluxiq` subpath the web can import.
- **Unread APIs.** The `AlertDialog` API, `JsonToggle`'s location, and the K4 section of `k-datasets-execution.md` beyond the grep lines cited.
- **Server-side hierarchy.** How the server produces `client` and `run` tree nodes.
- **Graph validation.** `graph-validation.ts` beyond line 37.
- **Live behaviour.** No browser behaviour was exercised.

## Open questions or contradictions found

Each has a recommended answer.

1. **K2's table has no Flow column** (`k-datasets-execution.md:460-466`), so the Data window cannot filter by Flow. Recommended: amend K2 with `flow_id` and the catalog before dispatch; use migration 0020 only if 0019 has already shipped.
2. **CD17 deletes all of a run's datasets; the Data window deletes one table.** Recommended: add `datasetId?` to `delete-run-datasets` and amend CD17's wording. The audit table already carries `dataset_id`.
3. **K3's `recordOutput` meets today's generic json editor**, which corrupts a proposal-written value on the first edit. Recommended: K3 adds `ui.control: "record-output"`, and K12d lands before K7 or downstream X4 approvals write real values.
4. **K9 adds `datasets` only to `approvedTopLevelDirectories`** (`k-datasets-execution.md:927`). Once K12c adds it to `productDomains`, `runtime/RunActionLogView.tsx` must import `RunDatasetsPanel` through `../datasets` (the barrel), or the sibling-import audit counts it (`architecture-test-helpers.ts:249-255`). Recommended: say so in K9's brief now.
5. **K9 names no stylesheet** for its panel, and the styles test holds a closed domain set (`styles-architecture.test.ts:16-24`). Recommended: K9 or K12c adds a `datasets` style domain once, not both.
6. **Frozen baseline entries** block the natural edits: 12 components in `canonical-connected-views.tsx` (`:44`), and imports in `canonical-view-definitions.tsx` (`:93`) and `connected-view-entries.tsx` (`:106`). Recommended: a separate connector file and barrel imports. Confirm with `pnpm structure:check --rule imports` and `--rule exported-values` when K12c runs.
7. **Label clash.** The label "Data" sits beside the development-only "Data Flow Inspector" (`workspace.md:565-567`). They are distinct, but the header command should be named `openDatasets`, never `openData...`, to keep the code unambiguous.
