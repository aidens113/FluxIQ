# Flow unification inventory: retiring "subflow" and "project part"

Read-only inventory, 2026-11-09. Scope: Core `!FluxIQ` (packages, apps/web, docs/architecture) and the extension repo
(apps/extension, domain, packages, docs/architecture); node_modules, dist, build outputs and docs/working excluded.
Counts come from ripgrep, case-insensitive. "Lines" = matching lines (`rg -c`); "occurrences" = `rg -o`. Categories
below are assigned by path regex, so the split is approximate (a few shared files could sit in either neighbour).

## 1. Totals

Occurrences / files, by term (terms overlap, so do not add them):

| Term | Core | Extension |
| --- | --- | --- |
| subflow / sub-flow / Subflow / SUBFLOW | 23,253 / 1,717 files | 2,071 / 258 files |
| project part / projectPart / project-parts | 1,239 / 111 | 45 / 7 |
| run_part / runPart | 101 / 22 | 15 / 7 |
| call-subflow / call_subflow / callSubflow | 307 / 141 | 20 / 11 |
| known part / shortlist | 195 / 31 | 20 / 6 |

Any of the terms (lines / files) by area:

| Area | Core | Extension |
| --- | --- | --- |
| Tests, e2e, fixtures, test-runner | 7,703 / 847 | 1,368 / 219 |
| Runtime and service logic | 2,893 / 340 | 31 / 10 |
| Model-facing text and loops (supervisor, authoring, tool text, activity wording) | 3,096 / 276 | 3 / 3 |
| UI text and screens (web studio, ui-components, panel) | 1,361 / 185 | 62 / 19 |
| DSL, graph, engine (saved-Flow shape) | 486 / 35 | 0 |
| Stored data (SQL schema, migrations, stores, JSON) | 660 / 41 | 0 |
| Architecture docs | 264 / 14 | 38 / 6 |
| Wire and contract types | 136 / 18 | 11 / 1 |
| Generated IAM action catalog | 21 / 3 | 0 |
| Total | 16,620 / 1,759 | 1,513 / 258 |

Reading: about 46% of Core hits and 90% of extension hits are tests or the Lab. The extension has almost no
production use of the concept; it relays Core's endpoints and renders Core's Library screen.

Docs with the most hits: Core `automation-studio.md` 84, `persistence.md` 49, `llm-flow-bootstrap.md` 45,
`workspace.md` 23, `subflow-library.md` 22 (the library doc, whole file), `client-gateway.md` 21; extension
`testing-facility.md` 37, `extension-client.md` 18.

## 2. Rename map and what cannot simply be renamed

The data model is the real obstacle. Today there are TWO different things called subflow.

1. A **Subflow of a Flow**: a child unit inside one Flow (`subflows` table, role primary / integration / recovery /
   fallback / utility, its own graph stored as a hidden Flow row with `parent_flow_id`, `owning_subflow_id`,
   metadata `subflowGraph`, `parentFlowId`, `parentSubflowId`, `flowRepresentationKind: "subflow_graph"`). Routers
   route between them. Flows already have a second, hidden level.
2. A **project part**: a Subflow graph copied into the project library (`project_parts*` tables, versions, trust,
   `core.run_part`, Library screen), called by pinned `Call Subflow` steps.

Unification means folding (1) into "a Flow that another Flow calls" and deleting (2) as a separate store. That is a
data-model change, not a rename. Proposed vocabulary:

| Today | Becomes |
| --- | --- |
| Subflow (child of a Flow), `subflowId` | Flow (a Flow row), `flowId`; ownership goes via folder and call edges, not `owning_subflow_id` |
| Call Subflow, `builtin.control.call-subflow` | Call Flow (a definition id; Core already has `createCallFlowNode`, `CALL_FLOW_METADATA_KEY` and `AutomationStudioCallFlowTarget` in `flows/executable/composite`, so a call-a-Flow-by-id path partly exists) |
| project part, `partId` + `version` pin | Flow, `flowId` + `version` (Flow versions are `graph_revision`; the pin becomes a Flow revision) |
| subflow library, Library screen | the project's Flow tree (screen keeps its tree/search/inspect/run) |
| `core.run_part`, `core.submit_subflow`, `core.test_subflow` | `core.run_flow`, `core.submit_flow`, `core.test_flow` |
| `plan.subflows`, `brief.subflowKey`, subflow brief | `plan.flows`, `brief.flowKey`, flow brief |
| subflow_card contract | flow_card |
| subflow role (primary, recovery...) | keep as a Flow `role`; "recovery Subflow" becomes "recovery Flow" |
| `maxNodesPerSubflow`, `allowModifySubflows`, `allowCreateSubflows`, `maxRecoveryAttemptsPerSubflow` | per-Flow equivalents; stored in `flow_settings` JSON |

### Places that cannot simply be renamed (each needs compatibility)

| Place | Why | Compatibility |
| --- | --- | --- |
| SQL tables `subflows`, `subflow_categories`, `project_parts`, `project_part_versions`, `project_part_version_sources`, `project_part_facets`, `project_part_runs`, `project_parts_fts`, `part_calls` | Real tables, one project DB per project, created by numbered migrations (`0026_sa_project_parts`, ...) | Forward migration only: new migration copies each subflow and part into Flow rows (+ call edges), then drops the old tables. Never edit a past migration. Needs a copy-then-verify step because parts are immutable (triggers forbid update and delete on `project_part_versions`). |
| Columns `subflow_id` (7 tables), `target_subflow_id`, `fallback_subflow_id`, `owning_subflow_id`, `source_subflow_id` | Foreign keys across routers, routes, runs, adaptations, judgements, instruction scope | Same migration; rewrite keys to the Flow id of the former subflow's graph row (already a Flow row, so the id exists). |
| `flows.parent_flow_id`, `owning_subflow_id` | Encodes the hidden second level | Keep `parent_flow_id` as the folder/organizing parent only if wanted; drop `owning_subflow_id`. |
| Flow metadata keys: `subflowGraph`, `parentFlowId`, `parentSubflowId`, `flowRepresentationKind` values `orchestration` / `subflow_graph` / `legacy_single_graph`, `hierarchySubflows`, `subflowCategories` (+ legacy alias `subflowFolders`) | Persisted in saved Flow documents; read by `flows/authoring/dsl/generator.ts`, `flow-generation.ts` in the studio and `flows/mapping.ts` | Versioned reader: reader accepts old and new keys; writer emits new; one migration pass rewrites stored Flows. `flowRepresentationVersion` already exists (value 1), so bump it to 2. |
| Graph node `definitionId = "builtin.control.call-subflow"` and its `subflowTarget` config | Every saved Flow graph that calls a subflow or a pinned part contains this id | Alias: the registry keeps the old id as a read-only alias of Call Flow and the loader rewrites it on read; a migration rewrites stored graphs. Run history (`subflow_target_json`, `frame_path_json`, `subflow_execution`) is stored evidence: leave old rows readable, do not rewrite it. Node metadata keys `fluxiq.entry`, `fluxiq.checkpoint`, `fluxiq.successCheck`, `replay` carry no subflow word and stay. |
| Failure and result codes (`executor.call_subflow.*`, `missing_router_or_subflow_target`, `subflow.trial_*`, `subflow_card.invalid_*`, `project.duplicate_subflow`, `bootstrap.invalid_subflows`) | Stored in run records, judgements, activity logs and asserted by tests | Add new codes; keep old codes readable in history; do not rewrite stored rows. |
| Wire: client-gateway endpoints `list-flow-subflows`, `create/update/rename/duplicate/delete/archive/enable/disable-flow-subflow`, `get-flow-subflow`, `list-flow-subflow-targets`, `list/get/save/run-project-part` | The extension relay (`parts-relay.ts`) and the web studio call these by name | Dual-register old and new endpoint names for one release; old ones answer from the new handler. The extension is the only other client, so a lock-step change is feasible, but keep the alias until both repos have landed. |
| Generated IAM actions (`studio:CreateFlowSubflow`, `studio:RunProjectPart`, 21 lines in `packages/contracts/src/iam/actions.generated.ts`, plus `platform/iam/catalog/generated/*`) | Generated from endpoint names; stored policies may name them | Regenerate after the endpoint rename; keep old actions as aliases in the policy evaluator, otherwise stored allow/deny policies silently stop matching. |
| Protocol constants `AUTOMATION_PANEL_MESSAGES.listFlowSubflows`, `listParts`, `getPart`, `savePart`, `runPart` (extension `shared/protocol.ts`, `onScreen.subflowId`) | Messages between panel and background | Renamed together inside the extension; no persistence. Safe unless a persisted `onScreen` is kept. |
| Public exports: Core `@fluxiq/contracts` (`AutomationStudioSubflowCard*`, `parseAutomationStudioSubflowCard`, `AutomationStudioSubflowCardPort`), `@fluxiq/ui-components` (`SubflowCard`, `SubflowLibraryPort`, `SubflowDetail`, 20+ types), Core `fluxiq/automation` | Imported by the extension's Library port (`panel/library/*`) | Re-export old names as deprecated aliases for one release; remove after the extension migrates. |
| Saved Flow source and the DSL: authoring grammar accepts `subflow`, `block`, `part` words and `run/call/enter the subflow X` (`bootstrap/authoring/parse.ts`); script examples in the extension (`domain/.../script-examples/format.ts`, `saved-flow.ts`) show `subflow notice:` | Model-written scripts and stored Flow source (`writeFlowSourceFile`) use these words | Parser keeps the old words as accepted synonyms (it already treats subflow/block/part as one set); generator and model guidance emit only `flow`. Saved source needs no rewrite; it re-compiles to the new graph. |
| Legacy file store: `projects/<id>/subflows.json`, `subflow.json` (read by `migration-cutover.ts`, `storage-migration.ts`) | Cutover reader for old installs | Leave the readers untouched (they read the old format); only change names on the output side. |
| Web studio state keys: `subflowFolders`, `subflowsFolderNodeId`, `customHierarchyNodes` entries pointing at subflow nodes (stored in `hierarchy/nodes.json`) | Persisted workspace hierarchy | Reader maps old node kinds; hierarchy nodes are filing, not data, so a loss is recoverable but a silent drop is not acceptable. |
| Lab and test-runner constants (`DEMO_SUBFLOW_NAME`, `test_subflow` steps, `core.submit_subflow` in script fixtures) | Pinned test worktrees and recorded evidence use these | Rename with the tool names in the same batch; recorded evidence under `test-runs/` is not rewritten. |

Safely renamable (no persistence, no wire): TypeScript identifiers inside `framework/automation-service/service/*`,
`runtime/project-agents/*`, `runtime/flow-authoring/bootstrap/subflow-candidate/*` (directory names too),
`engine/automation/frames/call-subflow.ts`, web studio components (`SubflowSettingsView`, `SubflowsView`,
`RouterView`), CSS class names (`router-subflows/*.css`), and all prose in docs, prompts and tool descriptions.

## 3. Do Flows have a folder or path today?

No. A Flow has no path field. What exists, none of it a Flow path:
- `flows` row: `flow_id`, `parent_flow_id`, `owning_subflow_id`, `name`, `scope_kind`, `scope_id`; no folder column.
- `subflow_categories` table: per-Flow folders for the Subflows inside one Flow (category tree with
  `parent_category_id`, `sort_key`). It organizes subflows, not Flows.
- Workspace hierarchy: `customHierarchyNodes` (kind `folder`, `client`, `flow`, ...) with `parentId` in
  `projects/<id>/hierarchy/nodes.json`. It is an operator's filing layer ("filing, not data": deleting a folder
  never touches Flows, see persistence.md "The workspace hierarchy is filing, not data"). The web studio also
  generates tree nodes from Flows (`hierarchy/flow-generation.ts`). Placement of a Flow here is a client-side view
  concern, not a Core property, so the extension, FluxNode and other clients do not see it.
- Flow documents on disk are keyed `projects/<id>/flows/<flowId>/` (flow directory by id), not by path.
- The extension has no folder concept for Flows (grep found none); its Library tab shows Core's library tree.

Where folders should live: Core. Recommended: a `flow_folders` table (`folder_id`, `parent_folder_id`, `name`,
`sort_key`, reusing the shape of `subflow_categories`) plus a `folder_id` column on `flows`, in the per-project DB,
exposed on the Flow summary contract and on `create-flow` and a new `move-flow` endpoint. A plain `folder_path`
column is simpler and matches the plan's `web/market.example/cheapest-listings` strings, but a table makes
renaming or moving a whole folder one row. Keep identity by `flow_id` so calls survive moves (O2). The workspace
hierarchy should then be derived from it, and `customHierarchyNodes` folders migrated in. Add a `placed_by`
(`auto` or `person`) field so "people win" is enforced, not guessed.

## 4. Where automatic foldering can hook in (Flow creation points)

All Flow rows are written through `AutomationStudioFlowWriter.saveFlowInternal` (`service/flows/writer.ts`), so a
single placement call there catches everything, provided the caller supplies runtime, site/app and task. Entry
points, by client:

| Creation point | Where | Notes |
| --- | --- | --- |
| Studio create / blank Flow | `service/flows/creation.ts` `AutomationStudioFlowCreation.createFlow` (called by `service.ts:1320`, the `create-flow` endpoint) | Person-made: place where they chose; default unfiled or by hierarchy dialog (`hierarchy/commands/create-executor.ts`). A person's choice wins. |
| Extension chat task / answer-first build | Project build path: `service.ts` `createFlowBootstrapAdaptation` (~1739) and `service/project-build/*`; answer-first runs in `runtime/answer-first/*`; best-attempt save in `answer-first/result` | Here runtime (web), site (page host) and task name are known. Best hook: when the draft or Flow is first saved. The extension supplies the site through `domain` (web-panel-host); Core derives the path. |
| Project parts save, "Save this" | `service/project-parts/keep.ts` (person's keep), `save-applied-flow.ts` (on Flow save), `save-applied-adaptation.ts` (on build apply), `draft-parts.ts` (answer-first draft, before apply) | After unification these become "save the reusable part as its own Flow in the same folder with a plain name" (O2). `known-parts.ts` and `runtime/project-parts/shortlist/*` (rank, filter) are the detection point for repeated parts. |
| Recording to Flow | recording proposals (`createRecordingFlowProposals`, origin `recording`) | Place by recorded site. |
| Adaptation / repair re-author | `createFlowBootstrapAdaptation`, adaptation apply writes a new graph revision | Revision of an existing Flow; must not move it. |
| FluxNode run (planned) | New Core entry | Dotted name maps to path (`market.cheapest-listings` to `market/cheapest-listings`); uses the same placement function. |
| Legacy migration | `service.ts` ~2273 (`legacy_single_graph`), `migration-cutover.ts` | Migrated Flows start unfiled. |

Suggested design: one pure Core function `placeFlowInFolder({ runtime, site, task, existingPlacement?, placedBy })`
called inside `saveFlowInternal` on first write only; never on later saves; a person's move sets `placedBy: "person"`.

## 5. Batch plan (partitioned by file ownership)

Order constraint: the data-model decision (B0) must be fixed before dependents start; later batches then run in
parallel on disjoint trees. Core tests live beside the files they cover, so each batch owns its own tests.

| Batch | Owns (paths) | Parallel? | Risk |
| --- | --- | --- | --- |
| B0 Design | working doc only: decide fold-in model (subflow becomes Flow row + call edge), pin/version semantics, folder table vs column, alias policy and release order | first, serial | Highest leverage: a wrong choice redoes B1 to B4. Needs the lead's and the user's confirmation that a part's pinned version maps to a Flow revision. |
| B1 Stored data and migration | `framework/persistence/automation/project/*` (schema, parts/, migration-cutover, flow-resource-repository, accepted-state) and the new migration; `framework/storage-migration.ts` | after B0; blocks B3, B4 | Highest. Irreversible data move; parts are immutable by trigger; routers and runs hold subflow ids. Needs copy-verify, a dry run on a copy of a project DB and a rollback note. Never point tests at the user's real data. |
| B2 Contracts, wire, IAM | `packages/contracts/src/*` (subflow-card, client-gateway, iam generated), `packages/fluxiq/src/api-contracts/*`, `programs/automation-studio/api/handlers/subflows.ts` and endpoint registry | parallel with B1 once endpoint names are agreed in B0 | High: breaking for the extension and stored IAM policies; dual-register old names. Regenerate generated files with the owning script, never by hand. |
| B3 Engine and graph | `engine/automation/frames/call-subflow.ts`, `components/automation/control-flow/*`, `flows/executable/*`, `flows/authoring/*` (dsl, model, validation, composite), `runtime/flow-authoring/version`, `service/runtime-session/subflow-frame.ts`, `service/subflow-trial/*`, `service/offline-trial/*` | after B1 | High: invocation frames, entries, checkpoints and the success check must survive (O1); cycle and depth guards (`AUTOMATION_STUDIO_PART_CALL_MAX_DEPTH`) move with them. Definition-id alias required. |
| B4 Service layer | `framework/automation-service/service/{flows,project-parts,project-build,summaries,adaptations,runtime-session,...}` and the `service.ts` facade; includes Flow folder placement (section 4) | after B1 and B3 | High: `service.ts` is a very large file at its method budget; many `project-build` tests. Folder placement lands here. |
| B5 Model-facing text and loop | `runtime/project-agents/*` (supervisor, dispatch, single-subflow, contracts), `runtime/flow-authoring/bootstrap/*` (subflow-candidate dir rename, plan, authoring, verification), `runtime/llm/node-tools/*`, `runtime/automation-activity/*`, `runtime/conversations/instructions/*`, `runtime/project-parts/*`, `runtime/result-verification/*` | prose can start early; tool ids after B3 | Medium to high: the biggest hit count (3,096 lines). Model guidance must stay generic and never teach to the test (standing rule). Tool ids `core.submit_subflow`, `core.test_subflow`, `core.run_part` appear 354 times, mostly tests and Lab fixtures. Loop behavior can regress without a live run: needs a provider-free harness pass and one supervised live check (spends money; state it before running). |
| B6 UI | `apps/web/src/features/automation-studio/*` (subflows/, settings/SubflowSettingsView, router/, hierarchy/, model/, styles/router-subflows), `packages/ui-components/src/screens/library/*`, `chat/stream/step/project-words.ts`, `testing/library/*` | parallel with B5 once B2 names are fixed | Medium: person-visible words ("Library", "Find it in your Library"); web studio hierarchy must read Core's folders instead of local `customHierarchyNodes`. |
| B7 Docs | Core `docs/architecture/automation-studio.md`, `automation-studio/{persistence,llm-flow-bootstrap,workspace,client-gateway}.md`, `subflow-library.md` (becomes the Flow tree doc), `package-boundaries.md`; extension `extension-client.md`, `testing-facility.md` | parallel; final pass after others | Low. Must change in the same work as the contracts (repo rule). |
| B8 Extension repo | `apps/extension/src/shared/protocol.ts`, `background/automation-relay/parts-relay.ts`, `panel/library/*`, `panel/tasks/core-tasks-port.ts` (`subflowToKeep`, `keepSubflow`), `panel/automations/automations-tab.ts`, `domain/src/runtime/llm-evidence/script-examples/*`, `plan-resolution`, `web-panel-host.ts` labels | after B2 (Core names stable); lands after Core per the repo-boundary rule, with Core aliases covering the gap | Medium. Panel messages are in-repo only. Chat keeps working through the alias window. |
| B9 Tests, Lab, test-runner | test files beside each batch (owned by that batch); extension `packages/test-runner/*` and `apps/extension/e2e/*` (1,368 lines in 219 files); Core `apps/web/e2e/support/{seed,verify}-fixtures.mjs` | tracks B5 and B8; renames mechanical | Medium: seeded fixtures encode old table and key names; Lab runs use only the ten realistic scenarios; recorded evidence not rewritten. Narrow checks per batch (typecheck, tests in changed dirs, structure audit); the full sweep belongs to the twice-a-day run. |

Parallel groups: [B0] then [B1, B2] then [B3] then [B4, B5 prose, B6, B7] then [B5 tool ids, B8, B9]. B1, B3 and B4
are serial on the same persistence and service files. Directory renames (`subflow-candidate`, `single-subflow`,
`subflow-trial`, `router-subflows`) need one owner per directory in one commit, because the structure audit
(`pnpm structure:baseline`) and barrels reference them.

## Open questions for the lead

1. Does a part's `version` pin become a Flow revision pin, and may a called Flow change under a running caller? (Parts are immutable by trigger today.)
2. Does a Flow keep an in-Flow router (routes between its own entries), or does routing become Call Flow plus conditions? Routers reference `subflow_id` heavily (`router_routes`, `fallback_subflow_id`).
3. Folder table with `placed_by` versus a plain path column: the table is recommended.
4. How long do old endpoint names, IAM action names and exported types stay as aliases?
