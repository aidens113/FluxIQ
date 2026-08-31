# Automation Studio Architecture and Live Refactor Working Plan

> Historical tracking notice (2026-08-29): this document preserves its audit and implementation evidence, but it no longer owns current Automation Studio render/runtime status. Current topology and remaining certification work are tracked in [Automation Studio render/data separation plan](./automation-studio-render-data-separation-plan.md) and [Automation Studio workspace architecture](../architecture/automation-studio/workspace.md).

Status: Implementation Complete. Automated validation and documentation are complete; browser-only baseline and certification execution remains pending.
Last updated: 2026-08-28
Primary scope: apps/web/src/features/automation-studio/
Baseline size: 4,606 lines

## Objective

Replace AutomationStudioLive.tsx with a small composition root and explicit, independently testable modules. The refactor must remove the shared render owner that currently combines UI interaction state, project data, loading, synchronization, commands, derived models, and rendering.

This is complete only when ordinary UI interactions cannot execute unrelated project-data logic and the root file is readable without tracing thousands of lines of closures.

## User Outcomes

- Selected rows, tabs, menus, dialogs, and loading surfaces paint immediately.
- UI rendering never waits for API, SQL, filesystem, cache, or graph work.
- Warm views remain mounted with exact state.
- Empty projects are consistently responsive.
- Large projects scale through normalized data, selectors, pagination, and scoped subscriptions.
- Every state value and command has one obvious owner.
- The implementation is browser-neutral and uses no Google Chrome-specific API.

## Audited Responsibilities in the Current File

1. Client boot, URL parsing, and deep-link restoration.
2. Project catalog loading and project/category CRUD.
3. Project open, close, summary hydration, and cache restoration.
4. Change-feed synchronization and cache invalidation.
5. Flow, recording, proposal, timeline, runtime, and node-definition loading.
6. Flow execution and runtime status.
7. Recording create, finalize, normalize, edit, note, marker, and delete commands.
8. Flow draft recovery, save, publish, and deprecate commands.
9. Selection, state-view resolution, and action-preview mapping.
10. Workspace tabs, panes, view activation, layout, and resize behavior.
11. Hierarchy creation, deletion, subflow categories, and cleanup.
12. Selected entity, hierarchy, graph, breadcrumb, and problem derivation.
13. View registry and complete renderer prop assembly.
14. Sidebar, header, pane, timeline, drawer, modal, and palette rendering.
15. More than seven hundred lines of pure conversion, merge, reconciliation, persistence, timeline, parsing, and formatting helpers.

## Non-Negotiable Architecture Rules

### State Ownership

- Server-backed data belongs to normalized domain stores.
- Selection has a dedicated small store.
- Workspace layout and active views belong to the workspace store.
- Dialogs, palettes, and transient Studio controls belong to the Studio UI store or local components.
- Project modal inputs do not belong to project data.
- Runtime command status has a separate status owner.
- No single context contains the complete Studio state.

### Render Isolation

- No local UI action calls a React setter owned by the composition root.
- Store subscriptions use scoped selectors or independent revision channels.
- Selection changes do not notify layout or overlay subscribers.
- Layout changes do not recalculate Flow graphs or hierarchy models.
- Overlay input changes rerender only the overlay.
- Hidden warm views do not rerender because another view becomes active.
- Pointer movement performs no React state updates.

### Command Isolation

- Click handlers commit immediate UI state and dispatch stable commands.
- Network and storage work starts after immediate UI state can paint.
- Commands read current store snapshots at invocation.
- PINs and sensitive input are explicit command arguments or atomic dialog snapshots.
- Commands do not render UI or manipulate DOM.
- Async results are rejected when their project generation is stale.

### Data Rules

- Initial Studio mount loads only the project catalog.
- Project open paints a shell before hierarchy hydration.
- Details load on demand.
- Lazy preload is cancellable and scheduled outside the interaction path.
- Unbounded collections remain SQL-paginated.
- Cache is an accelerator, not a UI state owner.
- Invalidations identify scopes and entity IDs instead of forcing whole-project reloads.

## Target Modules

    automation-studio/
      AutomationStudioLive.tsx
      live/
        AutomationStudioComposition.tsx
        AutomationStudioProviders.tsx
        types.ts
      state/
        project-catalog-store.ts
        project-data-store.ts
        selection-store.ts
        runtime-status-store.ts
        selectors.ts
      project/
        useProjectCatalog.ts
        useProjectLifecycle.ts
        useProjectSynchronization.ts
        project-commands.ts
        project-hydration.ts
      flows/
        flow-commands.ts
        flow-detail-loader.ts
        flow-draft-controller.ts
        flow-model.ts
      recordings/
        recording-commands.ts
        recording-detail-loader.ts
        recording-model.ts
      hierarchy/
        AutomationProjectHierarchySidebar.tsx
        hierarchy-commands.ts
        hierarchy-model.ts
        hierarchy-selection.ts
      workspace/
        AutomationStudioWorkspace.tsx
        AutomationStudioHeader.tsx
        AutomationStudioPaneArea.tsx
        AutomationStudioTimelineDock.tsx
        AutomationStudioOverlays.tsx
        workspace-commands.ts
        workspace-resize.ts
        render-store.tsx
        studio-ui-store.tsx
      views/
        view-registry.ts
        view-model.ts
        view-renderer-adapter.tsx
      model/
        project-summary-converters.ts
        project-change-reconciliation.ts
        timeline-resolution.ts
        workspace-persistence.ts
        live-helpers.ts

Names may be aligned with existing modules, but ownership boundaries may not be collapsed back into a generic mega-hook.

## Store Topology

### Project Catalog Store

Owns projects, categories, loading status, active project ID, and project command status. It does not own project content, workspace layout, semantic selection, or modal inputs.

### Project Data Store

Owns normalized entities by project and ID: Flow summaries/details, recordings, timelines, proposals/adaptations, runtime summaries, state indexes, node definitions, artifacts, and generated hierarchy data.

Requirements:

- stable entity maps and ID lists;
- per-entity detail status;
- revision channels by scope;
- stable selector references;
- page metadata for paginated collections;
- atomic entity transactions.

### Selection Store

Owns semantic selection, pending state-open request, bottom preview entry, and cross-view recording/proposal selection mode. It publishes synchronously with equality guards and performs no project derivation.

### Workspace Store

Owns panes, tabs, mounted views, active pane, right utilities, timeline dock, dimensions, persistent view state, and narrow-screen drawer state. Activation is synchronous; persistence is background work.

### Studio UI Store

Owns only transient dialogs, palettes, and Studio-level menus. It is browser-neutral.

### Runtime Status Store

Owns cross-view command progress and failures. It does not contain project records or form values.

## Performance Acceptance Budgets

- Empty-project local click handler p95: under 16 ms in production.
- Warm tab or sidebar selection paint: within one animation frame.
- Overlay open: zero composition-root renders.
- Overlay typing: only overlay subscriber rerenders.
- Pointer resize movement: zero React updates.
- Project open: shell and loading regions visible immediately.
- No-data view switch: no request dependency before selected UI paint.
- Project entity update: zero workspace-layout renders.
- Workspace update: zero graph conversion and hierarchy regeneration.
- No maximum-update-depth warnings.
- No empty-project click/message handler routinely over 50 ms.

## Phase 0 - Baseline and Guardrails

Status: Complete for implementation and automated guardrails. Browser baseline capture remains pending.

0.1 [Complete] Record the 4,606-line inventory and current module dependencies.
0.2 [Complete] Preserve all unrelated dirty-worktree changes.
0.3 [Complete] Add an empty-project fixture: one project, one empty Flow, no other data.
0.4 [Complete] Add render counters for root, workspace, hierarchy, pane, overlay, and selection boundaries.
0.5 [Implemented; execution pending] Capture project-open, hierarchy click, folder toggle, warm/cold tab, overlay typing, graph selection, resize, and project-close behavior.
0.6 [Complete for automated state; browser capture pending] Record baseline render counts, handler timing, tests, and build state.
0.7 [Complete] Add source-contract tests that tighten as responsibilities leave the root.

Implementation checkpoint - Phase 0 baseline foundation:
- Confirmed the 4,606-line root and recorded the known oversized implementation baseline.
- Added testing/empty-project-fixture.ts with one canonical empty Flow and no optional data.
- Added architecture-contract.test.ts to prevent known oversized files from growing, forbid new implementation files over 700 lines, and prevent new direct API/browser-persistence ownership in view entry files.
- The audit identified TimelineView.tsx as a third pre-existing direct-API view alongside ClientViews.tsx and WorkspaceViews.tsx; it is temporarily allowlisted until the Recording extraction removes that debt.
- Focused Phase 0 baseline suite passes: 2 files, 5 tests.
- Render-counter behavior capture and the broader existing interaction baseline remain pending before Phase 0 can be marked complete.

Gate:

- Reproducible baseline exists.
- Existing behavior is protected.
- Results are recorded here before Phase 1.

## Phase 1 - Pure Helper Extraction

Status: Complete.

1.1 [Complete] Move summary converters to model/project-summary-converters.ts.
1.2 [Complete] Move merge and change-feed functions to model/project-change-reconciliation.ts.
1.3 [Complete] Move timeline/state resolution to model/timeline-resolution.ts.
1.4 [Complete] Move workspace persistence/equality to model/workspace-persistence.ts.
1.5 [Complete] Move URL and compact parsing helpers to navigation/live helpers.
1.6 [Complete] Move only truly shared formatters to shared modules.
1.7 [Complete] Temporarily re-export tested public helpers from AutomationStudioLive.tsx.
1.8 [Complete] Move tests beside each new owner.

Gate:

- No pure conversion, merge, timeline, persistence, or formatting algorithm remains in the root.
- Pure modules import no React.
- Focused tests and web type check pass.
- This document lists moved symbols and results.

## Phase 2 - Derived Model and Indexes

Status: Complete.

2.1 [Complete] Build stable indexes for Flow, task, recording, timeline, proposal, and hierarchy relations.
2.2 [Complete] Add selectors for selected Flow/runnable Flow/task/proposal/recording/timeline/policy/node.
2.3 [Complete] Add selectors for Flow scope, hierarchy nodes, breadcrumbs, graph input, and problems.
2.4 [Complete] Move title and selection-to-entity logic to views/view-model.ts.
2.5 [Complete] Move hierarchy generation to hierarchy/hierarchy-model.ts.
2.6 [Complete] Run graph conversion only in graph subscribers.
2.7 [Complete] Test reference identity after unrelated updates.

Gate:

- No project-wide ad hoc scans remain in the root.
- Workspace/UI changes execute no graph conversion.
- Selector identity tests pass.
- This document records the selector ownership map.

## Phase 3 - Scoped Stores

Status: Complete.

3.1 [Complete] Add project catalog store.
3.2 [Complete] Add normalized project data store with scope/entity revisions.
3.3 [Complete] Add selection store.
3.4 [Complete] Move narrow drawer state to workspace/UI ownership.
3.5 [Complete] Move workspace save status out of root React state.
3.6 [Complete] Add runtime status store.
3.7 [Complete] Align current workspace and Studio UI stores to the topology.
3.8 [Complete] Add selector-aware useSyncExternalStore helpers.
3.9 [Complete] Add atomic transaction helpers.
3.10 [Complete] Remove old controller state in the same step as each migration.

Gate:

- UI, selection, project data, and layout have separate owners.
- No-op writes do not publish.
- Selection does not notify layout/overlay subscribers.
- UI form fields do not notify project-data subscribers.

## Phase 4 - Project Lifecycle

Status: Complete.

4.1 [Complete] Extract project catalog loading.
4.2 [Complete] Extract project/category CRUD and move commands.
4.3 [Complete] Move project modal fields to local/Studio UI ownership.
4.4 [Complete] Extract summary/cache hydration.
4.5 [Complete] Extract project open/close lifecycle.
4.6 [Complete] Publish active project and loading shell before requests.
4.7 [Complete] Make deep-link restoration a one-time adapter.
4.8 [Complete] Cancel project-scoped requests/subscriptions before clear.
4.9 [Complete] Test cancellation, failure, and rapid project switching.

Gate:

- Root performs no project API request.
- Open/close are named commands.
- Project modal typing does not render workspace.
- Shell paint does not wait for hydration.

## Phase 5 - Synchronization and Cache

Status: Complete.

5.1 Extract change-feed ownership to useProjectSynchronization.
5.2 Move invalidation application beside normalized data.
5.3 Replace broad refresh with entity/scope mutations.
5.4 Protect optimistic state from stale background results.
5.5 Feed lazy preload from selectors/request coordinator.
5.6 Keep cache read/write off click paths.
5.7 Test deduplication, abort, stale result, and mutation races.

Gate:

- Root owns no sync client, invalidation, cache, or preload effect.
- Background changes notify only affected selectors.
- Project switch leaves no old subscription.

## Phase 6 - Domain Commands

Status: Complete.

Flow:

6.1 [Complete] Extract detail and node-definition loaders.
6.2 [Complete] Extract run-current-Flow.
6.3 [Complete] Extract draft restore/discard/update/persist/save.
6.4 [Complete] Extract publish/deprecate.
6.5 [Complete] Extract subflow editor resolution.

Recording:

6.6 [Complete] Extract create/finalize/normalize/update/delete.
6.7 [Complete] Extract note/marker.
6.8 [Complete] Extract recording/proposal cleanup transaction.
6.9 [Complete] Extract stopped-gateway monitoring.

State:

6.10 [Complete] Extract state-view and index resolution.
6.11 [Complete] Publish loading/selection before detail work.

Gate:

- Root contains no Flow, recording, proposal, state, or runtime API call.
- Commands test success, failure, cancellation, and stale project.
- Commands use current store snapshots, not render closures.

## Phase 7 - Hierarchy

Status: Complete.

7.1 [Complete] Extract AutomationProjectHierarchySidebar component.
7.2 [Complete] Keep search/filter/expansion/focus/primary row local or hierarchy-UI owned.
7.3 [Complete] Extract node-to-view and node-to-selection rules.
7.4 [Complete] Extract all create/delete hierarchy commands.
7.5 [Complete] Use one atomic dialog transaction per action.
7.6 [Complete] Paint row highlight/view activation before domain selection work.
7.7 [Complete] Memoize rows and retain server pagination for large sibling sets.
7.8 [Complete] Add keyboard, menu, selection, deletion, and large-tree tests.

Gate:

- No hierarchy mutation or hierarchy JSX remains in root.
- Folder toggles and row highlights do not render root.
- Hierarchy commands test without mounting Studio.

## Phase 8 - Workspace

Status: Complete for implementation. Browser timing certification remains tracked by Phase 0 and Phase 12.

8.1 [Complete] Extract view-open, pane-choice, warm activation, add/close/move tab, right-tab, and layout commands.
8.2 [Complete] Extract pointer/keyboard resize helpers.
8.3 [Complete] Extract pane area.
8.4 [Complete] Extract timeline dock.
8.5 [Complete] Extract header and breadcrumbs.
8.6 [Complete] Extract full workspace shell.
8.7 [Complete] Extract responsive drawers.
8.8 [Complete] Subscribe components directly to workspace selectors.
8.9 [Complete] Remove root render callbacks and renderer refs.
8.10 [Complete] Test warm view identity and subscriber isolation.

Gate:

- No pane, tab, resize, header, drawer, or timeline JSX remains in root.
- Workspace interactions use no root React state.
- Empty-project budgets pass.

## Phase 9 - Overlays

Status: Complete.

9.1 [Complete] Extract AutomationStudioOverlays.
9.2 [Complete] Split project, hierarchy, preferences, view-adder, layout, and inspector subscribers.
9.3 [Complete] Give each overlay only required selectors.
9.4 [Complete] Keep typing local.
9.5 [Complete] Dispatch commands on confirmation with command-specific progress.
9.6 [Complete] Remove root overlay render-input arrays.

Gate:

- No modal/palette JSX remains in root.
- Open/typing renders no workspace, hierarchy, or root.
- Overlay tests and budgets pass.

## Phase 10 - Full Automation Studio Feature Refactor

Status: Complete for implementation. Browser-only certification remains tracked by Phase 12.

This is an umbrella phase. The previous renderer-only scope was insufficient because the current view files independently reproduce the same mixed ownership and debugging problems as AutomationStudioLive.tsx.

Execution order:

1. Phase 10A establishes taxonomy, dependency direction, and source budgets.
2. Phase 10B migrates implementation naming and persisted view compatibility.
3. Phase 10C deletes WorkspaceViews.tsx by splitting it across product domains.
4. Phase 10D deletes GraphEditorViews.tsx through Flow editor decomposition.
5. Phase 10E decomposes State Explorer models and rendering.
6. Phase 10F cleans Recording, Inspector, Client, timeline, and shared ownership.
7. Phase 10G audits and completes actual functionality for every supported view.
8. Phase 10H replaces the universal renderer with a typed registry and isolated hosts.
9. Phase 10I reorganizes styling/tests and adds architecture enforcement.

Phase 11 cannot begin until every Phase 10 subphase gate passes.

### Umbrella Completion Gate

- No dumping-ground view implementation remains.
- Every supported view has a clear domain, data contract, command contract, and behavior matrix.
- Naming matches product concepts while persisted workspace compatibility is maintained.
- Views do not directly own API transport, global invalidation events, URL-driven ordinary state, or storage serialization.
- Typed view hosts subscribe only to the selected view model.
- File, dependency, rendering, styling, and testing rules are automatically enforced.

## Phase 10A - Automation Studio File Taxonomy

Status: Complete.

This phase extends the refactor from AutomationStudioLive.tsx to the entire Automation Studio feature. It must execute before Phase 11.

### Audited Structural Problems

- views/WorkspaceViews.tsx is 3,877 lines and contains runtime launching, run history, subflows, router editing, instructions, Flow settings, subflow settings, adaptations, runtime action logs, JSON rendering, and many unrelated helper models.
- views/GraphEditorViews.tsx is 1,946 lines and combines node palette, favorites persistence, routine compatibility, Flow graph canvas, graph editor behavior, node rendering, ports, selection actions, and edge rendering.
- state/view-model.ts is 1,416 lines and combines source collection, signatures, evidence binding, visual overlays, action targeting, comparison, structured data, and raw state transformation.
- views/StateView.tsx is 1,047 lines and combines view orchestration, canvas rendering, evidence inspector, structured/diff/compare/raw panels, geometry, clipping, text fitting, visual classification, and selection conversion.
- views/Renderer.tsx has a single global prop contract containing data and commands for nearly every view.
- views/ClientViews.tsx combines client gateway functionality with a legacy configuration editor and imports layout pieces from InspectorView.
- workspace/components.tsx is a vague shared component bucket rather than a clear workspace-shell module.
- Generic names such as model.ts, view-model.ts, components.tsx, types.ts, and Renderer.tsx require directory context and still hide unrelated responsibilities.
- Implementation names do not match product concepts: AutomationPolicyCanvas is the Flow editor, AutomationFlowMapWorkspace is the Router, and many domain views are called Workspace.
- Direct Program API calls are embedded throughout UI components.
- Ad hoc window CustomEvent channels coordinate subflows, instructions, runtime runs, and settings.
- View-local URL parsing is used for filters and section state even though ordinary Studio interaction must not use browser routing.
- localStorage draft behavior is embedded inside view components.
- Retired proposal/generator compatibility views remain imported and dispatched by the renderer.
- Large files use broad any-based contracts, making ownership and change impact difficult to determine.
- Tests mirror dumping-ground files, including a 1,042-line WorkspaceViews test and a 1,120-line StateView test.

### Current File Disposition Matrix

- AutomationStudioLive.tsx -> live composition plus project/domain/workspace modules; original reduced below 250 lines.
- views/WorkspaceViews.tsx -> deleted after runtime, router, subflows, instructions, settings, adaptations, and problems extraction.
- views/WorkspaceViews.test.tsx -> deleted after domain-focused tests replace it.
- views/GraphEditorViews.tsx -> deleted after flow-editor and legacy routine extraction.
- views/GraphEditorViews.test.ts -> replaced by Flow editor model, interaction, and component tests.
- views/Renderer.tsx -> replaced by typed registry plus a small generic ViewHost.
- views/StateView.tsx -> replaced by StateExplorerView and focused panel/canvas modules.
- state/view-model.ts -> replaced by focused state source, evidence, overlay, comparison, and selection models.
- views/StateView.test.tsx and state/view-model.test.ts -> split by owned behavior.
- views/ClientViews.tsx -> split into clients/ and legacy/config/.
- views/InspectorView.tsx -> split into inspector registry and object-specific panels.
- views/TimelineView.tsx -> moved and split under recordings/.
- views/TimelineDock.tsx -> workspace dock shell separated from recording preview content.
- views/ProposalView.tsx and ProposalGeneratorView.tsx -> retired compatibility migration, then deletion.
- workspace/components.tsx -> split into named workspace shell, pane, tab, palette, preference, and overlay modules.
- workspace/layout.ts -> split into layout contracts, normalization, mutations, and persistence if cohesion/size audit requires it.
- hierarchy/ProjectTree.tsx -> hierarchy tree package with row, children, selection, and keyboard behavior.
- hierarchy/model.ts -> hierarchy contracts, generation, and capability rules split by responsibility.
- graph/view-model.ts -> flow-editor graph conversion modules split by graph direction and node/edge mapping.
- controllers/useAutomationStudioControllers.ts -> removed as domain stores/hooks take ownership.
- root types.ts -> types moved to domain owners; only true public cross-domain contracts remain.
- app/globals.css Automation Studio blocks -> feature/domain-owned styles.

### Required Top-Level Feature Taxonomy

    automation-studio/
      live/
      platform/
      project/
      hierarchy/
      workspace/
      flow-editor/
      router/
      subflows/
      instructions/
      settings/
      adaptations/
      runtime/
      recordings/
      state/
      inspector/
      problems/
      clients/
      legacy/
      shared/

Ownership:

- live: composition only.
- platform: request coordination, cache interfaces, scheduling, telemetry, and browser-neutral adapters.
- project: project catalog, lifecycle, normalized project data, and synchronization.
- hierarchy: tree data, tree UI, hierarchy commands, and pagination.
- workspace: shell, panes, tabs, docks, layout, overlays, and workspace persistence.
- flow-editor: Flow graph editing and node palette.
- router: top-level Flow routing only.
- subflows: subflow directory, categories, and subflow metadata.
- instructions: scoped instruction list, editor, diagnostics, and draft recovery.
- settings: Flow and subflow settings forms and validation.
- adaptations: adaptation list, review, status, details, and promotion actions.
- runtime: run launcher, run history, run detail, event/action logs, and runtime models.
- recordings: recording list, timeline, notes, markers, and processing.
- state: state selection, evidence, visual surfaces, comparison, and raw data.
- inspector: selected-object inspection and editing.
- problems: normalized diagnostics and navigation.
- clients: gateway clients, pairings, and client activity.
- legacy: explicit compatibility adapters with a removal condition.
- shared: small genuinely reused primitives only.

### Directory Rules

10A.1 A domain directory may contain:

    index.ts
    types.ts
    model/
    data/
    commands/
    components/
    hooks/
    tests beside owned source

10A.2 Do not create every subdirectory by default. Add one only when the domain has that responsibility.

10A.3 A domain entry view is named ProductConceptView.tsx.

10A.4 Repeated presentational pieces use ProductConceptPanel, Row, List, Toolbar, Dialog, or Field names.

10A.5 Data access files are named for the resource, such as run-repository.ts or instruction-queries.ts, not api.ts.

10A.6 Command files use product verbs and command suffixes only when useful, such as saveInstruction.ts or adaptation-commands.ts.

10A.7 Pure derivation files use precise names such as route-condition-model.ts or runtime-event-model.ts.

10A.8 Generic components.tsx, model.ts, helpers.ts, utils.ts, and types.ts are prohibited at the Automation Studio root.

10A.9 Domain-local generic filenames are allowed only when the directory makes ownership unambiguous and the file has one cohesive concept.

10A.10 Barrel files expose a domain public surface. Cross-domain code does not import private component files.

10A.11 Tests are colocated with the owning module and named after behavior, not after an old dumping-ground file.

### Dependency Direction

Allowed direction:

    live -> domain public APIs
    workspace -> view registry and shared UI contracts
    domain view -> same-domain hooks/selectors/commands
    commands -> repositories/stores/platform
    selectors -> stores/models
    models -> framework contracts and pure shared types

Forbidden direction:

- model importing React;
- domain command importing a view component;
- workspace shell importing domain-private command implementations;
- one domain view importing another domain's private panel;
- view component calling Program API directly;
- view component dispatching global CustomEvents for data invalidation;
- project data store importing workspace or overlay state;
- shared module importing a concrete domain.

### File Size and Complexity Budgets

- Composition root: at or below 250 lines.
- Domain entry view: target at or below 350 lines.
- Stateful controller hook: target at or below 300 lines.
- Pure model file: target at or below 500 lines.
- Presentational component: target at or below 250 lines.
- Command/repository file: target at or below 400 lines.
- A file over its target requires a recorded cohesion explanation or another split.
- No replacement file may exceed 700 lines.
- No component receives the complete Automation Studio model.
- No view-specific contract exceeds 25 top-level props; use cohesive typed capability objects only when those capabilities share ownership.
- No domain entry view contains endpoint string literals.
- No domain entry view reads window.location for ordinary view state.
- No domain entry view directly owns localStorage serialization.

### Accepted Infrastructure Exceptions

The closed top-level taxonomy test allows the product domains above plus these explicit infrastructure owners:

- `cache/`, `data/`, `stores/`, and `sync/` collectively implement the platform/project data plane. They remain named seams because cache, transport, normalized store, and synchronization dependency direction is enforced independently; no generic controller bucket may return.
- `graph/` and `parameters/` are the reusable Flow graph engine and schema-driven parameter editor shared by Flow Editor and Inspector.
- `model/` contains pure cross-domain project conversion/reconciliation helpers only; it may not import React or own commands.
- `views/` contains only canonical registry, host, migration, instance, and recovery infrastructure rather than product view implementations.
- `development/`, `testing/`, and `styles/` own instrumentation, deterministic fixtures/certification, and feature CSS respectively.

The executable allowlist rejects any new top-level bucket until this ownership record and the architecture test are intentionally updated. Obsolete `legacy/`, `evidence/`, and `timeline/` paths were removed after proving they had no production consumers.

Recorded preferred-budget exception:

- `parameters/ParameterEditor.tsx` is a 367-line schema-driven editor family whose scalar, typed-value, object, and array controls share recursive value ownership and one public command surface. It remains below the hard ceiling; splitting would create cyclic recursive component contracts without isolating state or render ownership. All other current files above 250 lines are domain entries, composition/model/command owners governed by their applicable 300-600 line targets, or test/instrumentation modules.
### Completion Gate

- Taxonomy and dependency rules are represented by source architecture tests or lint rules.
- Existing files have an approved destination map.
- No new dumping-ground filename is introduced.
- This document records exceptions explicitly.

## Phase 10B - Naming and Product Vocabulary Migration

Status: Complete.

### Canonical Component Names

Rename implementation concepts as follows:

- AutomationPolicyCanvas -> FlowEditorView.
- AutomationPolicyGraphEditor -> FlowGraphCanvas.
- AutomationNodePalette -> FlowNodePalette.
- AutomationFlowMapWorkspace -> RouterView.
- AutomationSubflowsWorkspace -> SubflowsView.
- AutomationInstructionsWorkspace -> InstructionsView.
- AutomationAdaptationsWorkspace -> AdaptationsView.
- AutomationProblemsWorkspace -> ProblemsView.
- AutomationRuntimeWorkspace -> FlowRunView.
- AutomationRunsWorkspace and RuntimeRunHistory -> RuntimeDebugView with internal RunList.
- RuntimeActionLogPage -> RunActionLogView.
- AutomationTopLevelFlowSettingsWorkspace -> FlowSettingsView.
- AutomationSubflowSettingsWorkspace -> SubflowSettingsView.
- AutomationTimelineView -> RecordingTimelineView.
- AutomationInspector -> InspectorView.
- AutomationClientGatewayView -> ClientGatewayView.
- AutomationStateView -> StateExplorerView.

### Vocabulary Rules

10B.1 Use Flow, Subflow, Router, Instruction, Adaptation, Recording, Run, State, Inspector, and Problem consistently in component and type names.

10B.2 Reserve Workspace for the multi-pane shell and its regions. Domain views are never named Workspace.

10B.3 Reserve Policy for actual policy contracts. Do not use Policy as an implementation synonym for Flow.

10B.4 Reserve Config for legacy artifacts or framework configuration. User-editable Flow behavior is Settings.

10B.5 Proposal may remain only in persisted/API compatibility fields needed by the adaptation model. It must not appear as a user-facing view concept.

10B.6 [Complete] Stable persisted view IDs are migrated through a typed registry alias table. The canonical registry and current alias migration are implemented; root view construction and retired-view recovery remain.

10B.7 Raw view ID and type strings may appear only in the registry, compatibility migration, and focused tests.

10B.8 Type names describe ownership, not storage shape. Avoid catch-all AutomationData, WorkspaceData, or ViewProps types.

### Compatibility Plan

- Define canonical typed ViewId and ViewKind values.
- Map legacy IDs such as policy-primary and proposal-workbench to canonical registry entries.
- Hydrate old workspace cache through a versioned migration.
- Stop creating retired proposal tabs.
- Render an explicit retired-view recovery surface for old saved tabs, with an action to open Adaptations or Recordings as appropriate.
- Remove legacy proposal components after migration telemetry/tests show no active creator path.

### Completion Gate

- New source uses canonical product names.
- Persisted workspaces still restore.
- User-facing UI contains no retired Proposal view.
- Naming architecture tests pass.

## Phase 10C - Split WorkspaceViews by Domain

Status: Complete.

WorkspaceViews.tsx is deleted at the end of this phase. It must not survive as a forwarding barrel containing implementations.

### Runtime Extraction

Move to runtime/:

- Flow run controls and readiness.
- Runtime input ports, typed validation, and payload construction.
- Runtime post-run summary.
- SQL-paginated run history.
- Run detail loading.
- Action/event pagination.
- Recovery/routing event model.
- LLM/adaptation event model.
- State/effects model.
- JSON detail panels and audit export.

Separate:

    runtime/
      FlowRunView.tsx
      RuntimeDebugView.tsx
      RunList.tsx
      RunDetailView.tsx
      RunActionLogView.tsx
      RunDetailPanels.tsx
      run-commands.ts
      run-queries.ts
      run-input-model.ts
      run-detail-model.ts
      run-format.ts

### Router Extraction

Move to router/:

- Router load/save/delete/test commands.
- Route and group drafts.
- Condition model and summaries.
- Fallback editing.
- Subflow target resolution.
- Router canvas/list UI.

Separate:

    router/
      RouterView.tsx
      RouterEmptyState.tsx
      RouteList.tsx
      RouteEditorDialog.tsx
      RouteGroupEditorDialog.tsx
      FallbackEditor.tsx
      router-commands.ts
      router-queries.ts
      route-condition-model.ts
      route-draft-model.ts

### Subflow Extraction

Move to subflows/:

- Paginated subflow directory.
- Nested category navigation.
- Create/rename/duplicate/archive/delete commands.
- Readiness model.
- Router references.
- Subflow settings ownership resolution.

SubflowsView remains a directory and navigation surface. It never embeds the Flow editor.

### Instruction Extraction

Move to instructions/:

- Paginated directory queries.
- Instruction detail loading.
- Editor and scoped target fields.
- Effective-order model.
- Validation and diagnostics.
- Draft persistence repository.
- Recovery UI.
- Save/delete commands.

localStorage access moves behind instruction-draft-repository.ts.

### Settings Extraction

Move to settings/:

- FlowSettingsView.
- SubflowSettingsView.
- Typed draft conversion.
- Save payload construction.
- General/runtime/LLM/adaptation/limits/safety/interface/dependency validation.
- Effective settings model.
- Port mapping editors.
- Unsaved-change protection adapter.

Flow and Subflow settings share only typed field primitives and inheritance models, not one giant conditional component.

### Adaptation Extraction

Move to adaptations/:

- SQL-paginated list.
- Detail loading.
- Changed-field model.
- Review actions and confirmation.
- Applied/reverted status.
- Links to affected objects.
- JSON detail as a secondary disclosure, not the primary UI.
- Training status where adaptation ownership is appropriate.

### Problems Extraction

Move normalized severity, scoping, sorting, navigation, and ProblemsView into problems/.

### Completion Gate

- WorkspaceViews.tsx is deleted.
- Every endpoint call moved to command/query modules.
- Every global invalidation event is replaced by store transactions.
- Each extracted view has loading, empty, error, and stale-data behavior.
- Existing tests are split by domain and pass.
- No extracted file exceeds the file budgets without a recorded exception.

## Phase 10D - Flow Editor and Graph Decomposition

Status: Complete for implementation. Browser performance certification remains tracked by Phases 0 and 12.

GraphEditorViews.tsx is deleted at the end of this phase.

### Modules

    flow-editor/
      FlowEditorView.tsx
      FlowGraphCanvas.tsx
      FlowNodePalette.tsx
      FlowNode.tsx
      FlowEdge.tsx
      FlowOutline.tsx
      NodePortList.tsx
      NodeSelectionActions.tsx
      graph-interactions.ts
      graph-signatures.ts
      graph-validation.ts
      palette-model.ts
      palette-preferences-repository.ts

### Functional Boundaries

10D.1 FlowEditorView coordinates editor capabilities and selected Flow only.

10D.2 FlowGraphCanvas owns React Flow integration, viewport, graph input, and gesture configuration.

10D.3 FlowNodePalette owns search, filtering, favorites, and node insertion.

10D.4 Favorites persistence moves behind a repository.

10D.5 Node and edge renderers are pure or narrowly subscribed components.

10D.6 Graph signatures and durability classification are pure model modules.

10D.7 Legacy Routine compatibility moves to legacy/routines/.

10D.8 Pointer behavior follows the established interaction contract:

- left click selects;
- left drag on a node moves it;
- right drag on canvas creates a selection box;
- right click on a node is reserved for a node menu;
- no hand/select mode toggle.

10D.9 High-frequency graph selection remains local and does not publish to the composition root.

10D.10 Large graph behavior uses viewport culling/virtualization supported by the graph library and avoids complete graph serialization during pointer interaction.

### Completion Gate

- GraphEditorViews.tsx is deleted.
- Flow editor behavior tests pass.
- Pointer handlers meet interaction budgets.
- Node selection/movement does not render unrelated views.
- Routine compatibility is isolated and removable.

## Phase 10E - State Explorer Decomposition

Status: Complete.

Both state/view-model.ts and views/StateView.tsx are decomposed. Neither remains as a broad implementation file.

### Model Modules

    state/model/
      state-source-index.ts
      state-signatures.ts
      state-facts.ts
      evidence-bindings.ts
      action-targets.ts
      visual-overlays.ts
      state-comparison.ts
      structured-state.ts
      state-selection.ts

### View Modules

    state/
      StateExplorerView.tsx
      StateEvidencePanel.tsx
      StateVisualCanvas.tsx
      StateSurfaceControls.tsx
      StateStructuredPanel.tsx
      StateDiffPanel.tsx
      StateComparePanel.tsx
      StateRawPanel.tsx
      state-geometry.ts
      state-text-layout.ts
      state-visual-classification.ts

### Functional Requirements

- Source selection and detail loading are separate from visual rendering.
- Canvas geometry never rebuilds source indexes.
- Raw JSON is an optional final tab/disclosure.
- Visual, structured, diff, compare, and raw modes retain their state when switching.
- Evidence and fact selection publish through the selection store.
- Large fact sets use bounded/virtualized rendering.
- Screenshot/document surfaces have explicit missing/loading/error states.
- Geometry and text fitting are pure and thoroughly tested.

### Completion Gate

- Entry view and individual panels meet file budgets.
- Pure state models import no React.
- Existing 1,120-line test is split by model and panel behavior.
- State selection does not render workspace or unrelated views.

## Phase 10F - Recording, Inspector, Client, and Shared View Cleanup

Status: Complete.

### Recording

- Split RecordingTimelineView, recording directory/list, notes, markers, processing status, and timeline models.
- Keep data commands out of timeline components.
- Make long timelines virtualized and detail-on-demand.
- Preserve state-opening and action-preview navigation.

### Inspector

- Split InspectorView into object-specific panels selected through a typed panel registry.
- Move editable node parameter behavior to the Flow editor/parameter domain.
- Inspector receives selection ID and scoped selectors rather than complete project arrays.
- Shared InspectorSection is replaced by a neutral shared Section component only if multiple domains genuinely need it.

### Clients

- Move ClientGatewayView and client queries/commands to clients/.
- Move AutomationConfigView to legacy/config/ or delete it after confirming no supported path.
- Remove InspectorView private-component imports from client modules.
- Ensure client polling/subscriptions stop when inactive.

### Timeline Dock

- Keep the workspace dock container in workspace/.
- Keep recording timeline models and rows in recordings/.
- The dock receives a typed preview model, not complete recording objects.

### Shared

- Audit view-utils.ts and other shared buckets.
- Move each helper to its owning domain.
- Keep only proven cross-domain primitives in shared/.
- Shared UI must not depend on Automation Studio domain data.

### Completion Gate

- Client, Inspector, Recording, and timeline responsibilities have clear owners.
- No cross-domain private imports remain.
- Legacy Config path has an explicit removal or compatibility decision.
- Inactive client/runtime subscriptions stop reliably.

## Phase 10G - View Functionality Audit

Status: Complete for implementation. Browser-only certification remains tracked by Phase 12.

Every supported view receives a written contract and a behavior test matrix. A view is not complete merely because its existing JSX was moved.

### Required Contract for Every View

Each view documents and implements:

- product purpose;
- owning entity/scope;
- required summary data;
- optional detail data;
- loading state;
- empty state;
- partial/stale state;
- recoverable error state;
- permission/authorization state;
- pagination or virtualization strategy;
- cache key and invalidation scopes;
- selection behavior;
- commands and pending states;
- destructive confirmation;
- keyboard and screen-reader behavior;
- narrow-screen behavior;
- warm-view state restoration;
- JSON/raw data access when relevant;
- test fixture and performance budget.

### Flow Editor View

- Shows the selected Flow/subflow graph.
- Supports add, connect, move, select, multi-select, delete, undo/redo, draft recovery, validation, and save.
- Uses the required pointer model.
- Provides real loading/empty/error states.
- Handles thousands of nodes through graph-library capabilities and scoped updates.

### Router View

- Exists only for top-level Flows.
- Shows a useful no-subflow state with a create action.
- Supports groups, ordered routes, conditions, fallback, testing, status, and target navigation.
- Loads route/subflow summaries without full subflow graphs.
- Keeps details/dialogs lazy.

### Subflows View

- Lists subflows and nested categories.
- Supports create, rename, duplicate, archive, delete, pagination, search, and status.
- Opens a subflow's Nodes view in the normal Flow editor.
- Never embeds a second editor.
- Displays names, not IDs, except as secondary technical detail.

### Instructions View

- Requires a friendly directory and editor.
- Supports global, Flow, router, subflow, node, on-error, and adaptation-review scopes.
- Supports create, edit, delete, priority/importance, enable/disable, diagnostics, effective order, and draft recovery.
- Uses structured inputs; raw JSON is not the primary editor.
- Keeps SQL pagination and detail-on-demand.

### Settings Views

- Expose all supported settings through typed controls.
- Separate Flow settings from Subflow settings and inheritance.
- Include defaults, validation, effective values, provider/key selectors, adaptation behavior, limits, interfaces, safety, runtime, and dependencies.
- Use one save transaction and clear dirty/error status.
- Do not present a statistics-style header unrelated to settings tasks.

### Adaptations View

- Uses adaptation terminology consistently.
- Supports paginated list, detail, changed fields, evidence, risk/status, review/apply/reject/revert where allowed, and affected-object navigation.
- Defaults to user-friendly summaries.
- Detailed JSON remains available through disclosure.
- Does not create a separate Proposals user concept.

### Runtime Debug View

- Includes mode selection and Run command.
- Previous runs use SQL-level pagination.
- Rows are single-line, clickable, selected, and stable.
- Pagination belongs at the bottom.
- Opening a run loads summary first, then paginated actions/events.
- Action order, node state, recovery/routing, LLM/adaptation activity, effects, state evidence, timing, token/cost data, and raw JSON are available without loading everything at once.
- Large logs use virtualization/pagination and never freeze the browser.
- No manual JSON input is required for ordinary execution.

### Recordings View

- Supports list, timeline, notes, markers, finalize/process status, delete, and state/action navigation.
- Recording is optional evidence, not the primary adaptation generator.
- Long timelines are virtualized and details lazy.

### State Explorer View

- Works globally for Flow, recording, run, node, and timeline selections.
- Provides visual, structured, diff, comparison, evidence, and raw modes.
- Uses explicit loading and unavailable states.
- Avoids loading all state snapshots for a run.

### Inspector View

- Shows and edits only properties relevant to current selection.
- Uses scoped panels and stable typed commands.
- Does not receive every project collection.

### Problems View

- Normalizes severity and scope.
- Supports filtering, current-object focus, navigation, empty state, and actionable messages.
- Does not recompute graph validation while hidden.

### Client Gateway View

- Supports clients, pairing, activity, refresh, and authorized lifecycle actions.
- Polls/subscribes only while active.
- Clearly separates global client state from project data.

### Legacy Views

- ProposalGeneratorView, ProposalView, Routine, and Config receive one of:
  - migrate to a supported canonical view;
  - explicit read-only compatibility surface;
  - deletion after persisted-view migration.
- No retired view remains silently dispatched by default.

### Completion Gate

- Every supported view has the contract above recorded in its domain documentation or tests.
- Every view has loading, empty, error, and narrow-screen coverage.
- Data-intensive views pass large-fixture tests.
- Retired views have no creation path.

## Phase 10H - Typed View Registry and Host

Status: Complete.

Renderer.tsx is replaced by a registry and isolated hosts.

### Registry Contract

Each view definition provides:

- canonical ID;
- legacy aliases;
- kind;
- product label/icon;
- allowed regions;
- required scope;
- sleep/keep-mounted behavior;
- availability selector;
- data selector factory;
- component loader;
- cache schema version;
- optional migration for saved view state.

### Host Rules

- A host subscribes only to the registered view's selector.
- A view receives its own typed model and commands.
- No universal AutomationViewRendererProps object exists.
- Unknown IDs show an explicit recovery view; they do not fall through to State Explorer.
- View modules may be lazily loaded where it improves startup without delaying selected UI feedback.
- Warm mounted hosts preserve DOM/component state.
- Hidden hosts do not receive active selection churn unless their contract requires it.

### Completion Gate

- Renderer.tsx is deleted or reduced to a tiny generic ViewHost.
- Universal prop bag is gone.
- Unknown view fallback is explicit.
- Registry alias migration restores old workspaces.
- Adding a view requires one domain export and one registry entry.

## Phase 10I - Styling, Tests, and Architecture Enforcement

Status: Complete.

### Styling Structure

- Audit the Automation Studio block currently accumulated in app/globals.css.
- Move domain styling to owned feature styles using the repository-supported CSS approach.
- Keep workspace layout variables and shared tokens in workspace-owned styles.
- Keep Flow editor, Router, Runtime, Instructions, Settings, State, and other view styles beside their domain.
- Eliminate selectors that depend on unrelated view DOM nesting.
- Retain responsive and accessibility behavior.
- Add screenshot/layout checks where the current test environment supports them.

### Test Structure

- Split giant tests by domain behavior.
- Prefer pure model tests, command tests, store tests, and focused component tests.
- Keep source architecture tests for dependency and naming rules.
- Add empty and large fixtures for every data-intensive view.
- Add render-count tests for cross-domain isolation.
- Avoid source-string tests when behavior or type contracts can test the requirement directly.

### Enforcement

Add automated checks for:

- forbidden direct Program API imports in view entry components;
- forbidden root generic dumping-ground files;
- raw view IDs outside registry/migration;
- domain-private cross imports;
- files exceeding the hard 700-line ceiling;
- legacy proposal views imported by canonical registry;
- ordinary view state read from URL;
- direct localStorage serialization in view components;
- global CustomEvent mutation channels;
- AutomationStudioLive source limits.

### Completion Gate

- Automation Studio styling and tests follow domain ownership.
- Architecture checks fail on reintroduced dumping grounds.
- Full web checks/tests and docs checks pass.

## Phase 11 - Thin Composition Root

Status: Complete.

11.1 [Complete] Add providers for store lifetime and project disposal.
11.2 [Complete] Add AutomationStudioComposition.
11.3 [Complete] Reduce AutomationStudioLive.tsx to client boundary and composition export.
11.4 [Complete] Remove temporary re-exports after consumer migration.
11.5 [Complete] Delete obsolete hooks, refs, queues, effects, and compatibility paths.
11.6 [Complete] Add automated architecture tests.

Hard limits:

- AutomationStudioLive.tsx at or below 250 lines.
- No function there over 40 lines.
- No Program API call.
- No domain collection scan.
- No modal, pane, hierarchy, graph, or timeline JSX.
- No root-owned interaction state.
- No replacement mega-hook over 600 lines without a recorded split.

Gate:

- Hard limits pass.
- Public behavior remains covered.
- The old shared render owner no longer exists.

## Phase 12 - Validation and Documentation

Status: Complete for automated validation and documentation. Browser-only certification remains pending.

12.1 [Complete] Run focused helper/store/selector tests.
12.2 [Complete] Run lifecycle/sync/command tests.
12.3 [Complete] Run hierarchy/workspace/overlay isolation tests.
12.4 [Complete] Run renderer/graph tests.
12.5 [Complete] Run pnpm --filter @fluxiq/web check.
12.6 [Complete] Run pnpm --filter @fluxiq/web test.
12.7 [Complete] Run pnpm check.
12.8 [Complete] Run pnpm test.
12.9 [Complete] Run pnpm build.
12.10 [Complete] Run pnpm docs:check.
12.11 [Complete] Run git diff --check.
12.12 [Complete] Update authored Automation Studio architecture docs.

Repository instructions prohibit running the web panel for the user. Final manual validation will ask the user to run:

    pnpm --filter @fluxiq/web dev

Manual script:

- open an empty project;
- click every top-level Flow object;
- switch warm and cold tabs;
- select/move nodes and draw selection boxes;
- open/type in all overlays;
- create/delete Flow objects and folders;
- resize every region;
- refresh and verify exact workspace restoration;
- verify no update-depth or long-handler console violations.

## Step Update Protocol

For every implementation step:

1. Mark exactly one step In Progress here.
2. Record symbols and ownership being moved.
3. Make only that extraction.
4. Run focused tests and web type check.
5. Record paths, line-count change, and results here.
6. Mark Complete only when the old responsibility is removed.
7. Then start the next step.

Creating a file does not complete a step. The responsibility must leave AutomationStudioLive.tsx and pass its gate.

## Regression Prohibitions

The refactor must not:

- remove user-visible behavior;
- change Flow/subflow hierarchy semantics;
- restore URL-driven live tab routing;
- block UI paint on data/cache loading;
- replace server pagination with unbounded loads;
- add browser-specific behavior;
- introduce a global rerendering context;
- hide the monolith in one hook/provider;
- revert unrelated dirty changes;
- weaken authorization;
- cross public framework/domain boundaries.

## Risks and Controls

Behavior drift:
Extract pure logic first and preserve exports until consumers move.

Stale closures:
Commands read store snapshots and receive sensitive input explicitly.

Store fan-out:
Use scoped revisions, selector equality, and render-counter tests.

Duplicate truth:
Remove old state in the same step as new ownership.

Project-switch races:
Use generation IDs, cancellation, and project-scoped disposal.

Hidden view remount:
Use mounted identity tests and workspace activity channels.

Too many files:
Group by ownership and behavior, not one file per function.

## Definition of Done

All must be true:

- Root file is at or below 250 lines and readable.
- Root owns no local interaction state or API calls.
- Root derives no complete project model.
- Project data, selection, workspace, and overlays have separate owners.
- UI interactions do not render project data owners.
- Empty and large fixtures meet budgets.
- Existing and new tests pass.
- Checks, docs, and build pass or an external output lock is recorded.
- Authored docs match implementation.
- Every phase and step has a completion record here.
- WorkspaceViews.tsx and GraphEditorViews.tsx no longer exist.
- No canonical view is implemented in a file over the hard 700-line ceiling.
- Product naming is consistent and persisted legacy view IDs migrate safely.
- Every supported view passes its functionality contract, loading/empty/error coverage, and large-fixture budget.
- Direct API calls, storage serialization, global mutation events, and ordinary URL state are absent from domain entry views.
- Architecture checks prevent new dumping-ground files and forbidden dependency directions.

## Progress Log

### 2026-08-28 - Phase 2 Acceptance and Phase 4 Lifecycle Foundation

Phase 2 accepted complete:
- Added stable Flow/task/recording/timeline/proposal/hierarchy indexes, indexed selection resolution, and one memoized project view model.
- Preserved derived references across workspace/selection/problem-only updates and gated graph conversion behind mounted graph subscribers.
- AutomationStudioLive reduced from 3,956 to 3,810 lines; the architecture no-growth baseline is tightened accordingly.
- Parent Phase 2 suite passed: 4 discovered files and 62 tests, including a 5,000-entity fixture and stable-reference contracts.

Phase 4 foundation implemented:
- Added project catalog query and typed project/category CRUD command owners.
- Added synchronous opening-shell publication, generation-based stale-result rejection, abort-on-switch/close, failure handling, and disposal in project/project-lifecycle.ts.
- Lifecycle suite passed: 1 file and 4 tests.
- Phase 4 remains in progress until root adopts the lifecycle/catalog owners, moves modal fields, and removes embedded project API calls/state.

### 2026-08-28 - Implementation Wave 3 Assigned

- Worker I: finish Phase 10C by replacing global mutation CustomEvents with typed transactions and splitting/deleting the 60-test WorkspaceViews compatibility test.
- Worker J: finish Phase 10E by migrating/deleting State compatibility facades and adding bounded-selection/render-isolation contracts.
- Worker K: implement Phase 10I CSS ownership by extracting the Automation Studio block from globals.css into domain partials with architecture enforcement.
- Active Worker G additionally owns the final AutomationStudioLive Flow Editor import migration inside its Phase 2 root scope.
- Parent retains integration review, lifecycle/cache/store planning, architecture gates, and working-document updates.

### 2026-08-28 - Phase 10F Parent Acceptance and Compatibility Cleanup

Accepted:
- Split Recording list/timeline/clip/processing/dialogs/notes/markers, with pure data operations and a 200-entry bounded timeline window.
- Split Inspector into a typed panel registry, identity/reference/state models, reusable section, and a 73-line shell while preserving AutomationStudioSelectionBoundary.
- Split Client Gateway controller/model/query/command ownership and added an activation-aware poller that stops when inactive or disposed.
- Isolated Config under legacy/config with an explicit compatibility-only decision.
- Migrated Renderer/tests to canonical Recording, Client, and legacy Config owners; deleted TimelineView.tsx and ClientViews.tsx and removed their architecture exceptions.
- Canonicalized RecordingTimelineView while preserving an AutomationTimelineView export alias for downstream compatibility.

Validation:
- Parent Phase 10F/barrel-removal suite passed: 7 files and 25 tests.
- Full @fluxiq/web TypeScript check passed.
- Phase 10F remains in progress only because the Inspector legacy prop adapter still receives broad arrays; Phase 10H typed host/selectors must replace that adapter before closure.

### 2026-08-28 - Phase 10C Domain Extraction and Phase 7 Hierarchy Acceptance

Phase 10C accepted extraction work:
- Split Runtime, Router, Subflows, Instructions, Flow/Subflow Settings, Adaptations, and Problems into canonical domain views, models, repositories, query/command modules, and tests.
- Largest remaining domain implementation is 391 lines; SQL pagination, stale-request guards, Subflow directory semantics, and repository-owned instruction drafts are preserved.
- Parent domain suite passed: 9 files and 80 tests.
- Migrated Renderer to canonical domain exports, deleted WorkspaceViews.tsx, and removed its architecture/API/storage exceptions. Barrel-removal suite passed: 4 files and 68 tests.
- Phase 10C remains in progress only for replacing five global mutation CustomEvents with store transactions and splitting the 60-test compatibility file by domain.

Phase 7 accepted hierarchy work:
- Added equality-aware hierarchy UI store, synchronous controller, memoized selectors, atomic intent commands, and bounded large-sibling rendering.
- ProjectTree.tsx reduced from 533 to 359 lines; its previous local effect/state feedback loop is gone and the render metric remains.
- Parent hierarchy/store suite passed: 6 files and 43 tests.
- Phase 7 remains in progress until root hierarchy JSX/generation/dialog mutation move behind the hierarchy boundary and row interaction isolation is certified.

### 2026-08-28 - Phase 10G Typed View Contract Checkpoint

- Added a typed functionality contract for every canonical registry entry: product purpose, owning scope, summary data, detail data, data intensity, and required loading/empty/error/stale/narrow states.
- Retired proposal surfaces explicitly recover to Recordings or Adaptations instead of silently dispatching.
- Data-heavy views are explicitly classified as paged, virtualized, or graph-culling surfaces.
- Registry/contract coverage passed: 2 files and 6 tests.
- Phase 10G remains in progress until each active domain worker proves the declared UI states and large-fixture behavior in component tests.

### 2026-08-28 - Phase 3 Scoped Store Foundation Checkpoint

Implemented in stores/:
- Project catalog store with separate projects and status scopes.
- Normalized project data store with stable per-kind entity maps, entity/detail/page scopes, and active-project ownership.
- Semantic selection store for selection, pending State open, action preview, and recording primary mode.
- Runtime command status store scoped by command ID.
- Generic scoped external-store transactions and selector-aware useSyncExternalStore hook.
- No-op writes do not publish; atomic transactions collapse notifications; unrelated entity and selection scopes stay quiet.

Validation and remaining work:
- Focused store suite passed: 1 file and 4 tests.
- Phase 3 remains in progress until root/controllers adopt the stores, workspace save status moves, and old duplicate React/controller state is deleted.

### 2026-08-28 - Phase 0 Interaction Scenario Completion Checkpoint

- Extended the existing scale-project Playwright performance artifact with root folder collapse/expand, tab-picker open and typing, cold State tab creation, warm Flow/State tab switching, keyboard hierarchy resize, and project close.
- Existing coverage already records project open, hierarchy Flow selection, Nodes open, graph node selection/drag, Runtime Debug, run log, Settings, and Instructions.
- The scenario source is complete, but browser execution is pending the final validation phase because repository instructions prohibit starting the web panel for the user.
- TypeScript validation is temporarily blocked only by in-flight Phase 7 and Phase 10F worker files; exact errors were returned to those owners.

### 2026-08-28 - Architecture Guardrail Tightening Checkpoint

- Tightened the root no-growth baseline from 4,606 to the accepted 3,956 lines after Phase 1.
- Removed resolved oversized-file exemptions for GraphEditorViews, state/view-model, and StateView.
- Removed GraphEditorViews from the direct browser-persistence exception list.
- The hard 700-line gate remains active and is currently enforcing a required split in the in-flight Settings extraction.

### 2026-08-28 - Compatibility Import Migration Checkpoint

Implemented:
- Renderer now imports the Flow editor, State Explorer, and state signature model from their canonical owners.
- ProposalView now imports the embedded Flow graph editor from flow-editor rather than GraphEditorViews.
- Focused Renderer, Proposal, and Flow Editor suite passed: 3 files and 18 tests.

Remaining compatibility consumers:
- AutomationStudioLive still imports one Flow validation helper through GraphEditorViews while the active Phase 2 worker owns that file.
- Inspector state-model compatibility migration is owned by the active Phase 10F worker.
- Compatibility files are retained until those concurrent consumers migrate and focused tests are updated.

### 2026-08-28 - Phase 10D Selection Actions Checkpoint

Implemented:
- Extracted duplicate, keyboard-connect, and delete commands from FlowGraphCanvas into NodeSelectionActions.
- Added the boundary to the Flow Editor public surface and architecture file inventory.
- Flow Editor behavior tests passed: 14 tests; established pointer behavior is unchanged.

Concurrent gate observation:
- The architecture test correctly rejected an in-flight 889-line SettingsViews replacement and the TypeScript gate found three errors in the same worker scope.
- Those failures were returned to the Phase 10C worker; no exception or allowlist was added.
- Phase 10D remains open for compatibility-barrel removal, legacy Routine relocation, and final interaction/render certification.

### 2026-08-28 - Implementation Wave 2 Assigned

Delegated disjoint scopes:
- Worker E: Phase 10F Recording, Inspector, Client, and shared-view cleanup.
- Worker F: remaining Phase 10C Router, Subflows, Instructions, Settings, Adaptations, and Problems extraction from WorkspaceViews.
- Worker G: Phase 2 memoized project view model, entity indexes, selection resolution, and root integration.
- Worker H: Phase 7 hierarchy store/selectors/controller and bounded large-tree behavior.

Parent-owned work during this wave:
- Compatibility import migration, typed registry integration, architecture rules, review, full gates, and this document.
- Each phase remains open until parent review and its documented completion gate pass.

### 2026-08-28 - Phase 1, Runtime, and State Parent Acceptance

Phase 1 accepted complete:
- Extracted summary conversion, reconciliation, timeline/state resolution, workspace persistence/equality, compact parsing/navigation helpers, and shared formatters into React-free model modules.
- Preserved tested public exports through temporary root re-exports.
- AutomationStudioLive.tsx reduced from 4,606 to 3,956 lines; its remaining top-level functions are the composition component, a browser copy side effect, command-status emission, and a stable-event hook.

Phase 10C runtime checkpoint accepted:
- Extracted Flow run launch, SQL-paginated run history, lazy run detail, paginated action logs, opt-in events, evidence panels, queries, commands, formats, and input/detail models into runtime/.
- WorkspaceViews.tsx reduced from 3,877 to 2,675 lines. Runtime page sizes remain 25 runs, 50 actions, and 100 events.
- Phase 10C remains in progress because Router, Subflows, Instructions, Settings, Adaptations, and Problems still occupy WorkspaceViews.tsx.

Phase 10E State checkpoint accepted:
- Replaced the 1,416-line state model and 1,047-line State view with narrow compatibility facades and decomposed model/panel modules; largest production replacement is 382 lines.
- Pure state model scan found no React or workspace imports.
- Phase 10E remains in progress until compatibility imports are migrated and cross-view selection render isolation is certified.

Parent validation:
- Full @fluxiq/web TypeScript check passed.
- Combined acceptance suite passed: 16 files and 176 tests.

### 2026-08-28 - Phase 0 Render Boundary Instrumentation Checkpoint

Implemented:
- Extended the existing ui-render:metric path from the composition root to workspace, hierarchy, pane, transient overlay, and selection/Inspector boundaries.
- Kept all counters on the existing browser-neutral telemetry path.
- Focused component and telemetry suite passed: 4 discovered files and 40 tests.
- Full web TypeScript check exposed active worker integration failures in Phase 1 and Phase 10E scopes; exact errors were returned to those owners and this gate remains open.

Next delegated scope:
- Phase 10F Recording, Inspector, Client, and shared-view cleanup assigned to Worker E after the Flow Editor worker slot was reviewed and released.

### 2026-08-28 - Phase 10D Flow Editor Decomposition Checkpoint

Accepted after parent review:
- Split the 1,946-line GraphEditorViews implementation into flow-editor components, models, renderers, palette ownership, persistence repository, controller, and an isolated legacy routine implementation.
- GraphEditorViews.tsx is now a four-line temporary compatibility barrel; the largest replacement implementation is 637 lines and remains below the 700-line ceiling.
- Preserved left-select/left-move/right-marquee/middle-pan behavior with no hand/select mode toggle.
- Parent graph/editor validation passed: 6 discovered files and 40 tests, including architecture limits.

Still required before Phase 10D completion:
- Migrate remaining imports away from the compatibility barrel and delete GraphEditorViews.tsx.
- Move legacy Routine compatibility from flow-editor/legacy to the planned legacy/routines owner.
- Add the planned NodeSelectionActions boundary or record why existing ownership supersedes it.
- Complete cross-view render isolation and interaction-budget certification after the root/store split.

### 2026-08-28 - Phase 10B Typed View Registry Checkpoint

Implemented:
- Added a canonical typed view registry with view identity, type, icon, region, group, scope, context requirement, addability, and compatibility status.
- Centralized legacy persisted-ID aliases for runs-history, workspace-dock, ai-assistant, node-detail, signals-web, and pipeline-workbench.
- Rewired workspace region resolution, persisted layout migration, deep-link validation, and view-adder rules to the registry.
- Added focused registry tests.

Validation:
- Focused Automation Studio suite passed: 6 files and 36 tests.
- Persisted layout and navigation compatibility tests remain green.
- Phase 10B is intentionally still in progress: root view construction, canonical component renames, retired proposal creator removal, and recovery UI are not complete.

### 2026-08-28 - Implementation Wave 1 Assigned

Parent-owned work:
- Phase 0 baseline, render/source guardrails, integration review, working-doc updates, and validation.

Delegated disjoint scopes:
- Worker A: Phase 1 pure helper extraction from AutomationStudioLive into model modules.
- Worker B: Phase 10D Flow editor and graph decomposition.
- Worker C: Phase 10E State Explorer model and view decomposition.
- Worker D: Phase 10C runtime/run-history/action-log extraction from WorkspaceViews.

Rules:
- Workers do not edit this working document.
- A worker completion is not a plan completion.
- The parent reviews every diff, resolves integration issues, runs gates, and records exact results before marking a step complete.

### 2026-08-28 - Plan Created

- Audited AutomationStudioLive.tsx at 4,606 lines.
- Mapped its responsibilities and exact target boundaries.
- Added measurable performance budgets and hard source limits.
- Added phase gates and the required update protocol.
- Extended the plan across the complete view/file structure, naming system, styling, tests, and per-view functionality.
- No implementation phase is marked complete.

### 2026-08-28 - Phase 10E State Explorer Final Acceptance

Accepted after parent review:
- Removed the temporary `state/view-model.ts` and `views/StateView.tsx` compatibility facades after migrating every consumer to the canonical `state/model` and `state/StateExplorerView` owners.
- Added architecture guards that reject legacy State import paths and prevent State modules from coupling back to `AutomationStudioLive` or workspace ownership.
- Added selection-isolation coverage and a 10,000-fact rendering contract that proves the structured view mounts only its bounded 100-row page.
- Parent State and architecture gate passed: 7 files and 49 tests.

Phase status:
- Phase 10E implementation and compatibility cleanup are complete.
- End-to-end render-count and interaction-budget certification remains a Phase 12 system validation gate rather than State-owned implementation work.
### 2026-08-28 - Phase 10D Compatibility Removal Acceptance

Accepted after parent review:
- Deleted `views/GraphEditorViews.tsx`; canonical consumers now use `flow-editor/` directly.
- Moved the isolated Routine editor from `flow-editor/legacy` to `legacy/routines` and removed it from the Flow editor public surface.
- Replaced the temporary-barrel test with absence guards for both retired paths and added the same rules to the architecture contract.
- Parent Flow editor and architecture gate passed: 2 files and 21 tests.

Phase status:
- All Phase 10D source ownership, decomposition, pointer-contract, and compatibility-removal steps are implemented.
- Phase 10D remains In Progress only for measured browser pointer-handler and unrelated-render budgets, which execute with the consolidated Phase 12 browser certification.
- The full web TypeScript gate reached unrelated in-flight Phase 10I test code and found three strict-index errors; those errors were returned to the CSS owner and no Flow editor errors were reported.
### 2026-08-28 - Canonical Phase Status Reconciliation

The canonical headers now mirror the accepted implementation log:
- Complete: Phase 1 pure helper extraction, Phase 2 derived models/indexes, and Phase 10E State Explorer decomposition.
- In Progress: Phase 0, scoped stores, project lifecycle, hierarchy, the full Phase 10 program, taxonomy, naming, domain view split, Flow editor certification, Recording/Inspector/Client cleanup, view contracts, typed host, and styling enforcement.
- Pending: synchronization/cache root extraction, domain commands, workspace shell, overlays, thin root, and final validation/documentation.

This correction changes no completion claim: only parent-reviewed gates are marked Complete, and active worker output remains In Progress until independently accepted.
### 2026-08-28 - Phase 10I Styling Ownership Acceptance

Accepted after parent review:
- Reduced `app/globals.css` from 15,975 lines to a 42-import ordered manifest.
- Moved 11,383 Automation Studio style lines into 38 domain-owned partials covering workspace, Flow editor, Router/Subflows, Runtime, State, Instructions/Settings/Adaptations/Problems, and Recording/Client/Inspector ownership.
- Moved the remaining unchanged global rules into four explicit application-level pass-through partials while preserving cascade order.
- Added architecture enforcement for manifest completeness, domain ownership, the 700-line ceiling, and prevention of `globals.css` regrowth.
- Parent malformed-token scan found no findings; focused style architecture gate passed: 1 file and 4 tests.

Phase status:
- Phase 10I styling ownership is complete.
- Phase 10I remains In Progress for the remaining test split, large-fixture coverage, render-isolation checks, and full architecture enforcement.
- The production build and full TypeScript gate are temporarily blocked by an unterminated template literal in the active Phase 10C runtime worker scope; the defect was returned to that owner, and CSS parsing had completed successfully before the unrelated TSX failure.
### 2026-08-28 - Phase 5 Synchronization Lifecycle Checkpoint

Implemented in the parent thread:
- Added a `ProjectSynchronizationController` and `useProjectSynchronization` boundary around the existing cursor/backpressure change-feed client.
- Project changes now have an explicit one-client-per-generation lifecycle owner that stops and unregisters the old client before switching.
- Late invalidations from a stopped project generation are ignored, and Program API mutation notifications are filtered to the active Automation Studio project.
- Hook callback refs allow reconciliation and fetch capabilities to update without recreating the synchronization client on ordinary renders.
- Focused synchronization gate passed: 2 files and 10 tests.

Phase status:
- Phase 5 is In Progress. The lifecycle boundary is complete; root adoption, cache/preloader ownership removal from the root, and final selector-notification certification remain.
- Full TypeScript validation is deferred until the active Phase 10C syntax repair lands; focused compilation and behavior tests are green.
### 2026-08-28 - Phase 10C Domain Split Parent Acceptance

Accepted after parent review:
- Deleted both `views/WorkspaceViews.tsx` and its 1,048-line compatibility test after replacing them with Runtime, Router, Subflows, Instructions, Settings, Adaptations, and Problems domain owners and focused tests.
- Moved all Runtime endpoints to `runtime/run-queries.ts` and `runtime/run-commands.ts`; view components no longer own runtime endpoint strings or direct Program API calls.
- Replaced five domain mutation `CustomEvent` paths with the typed, browser-neutral mutation transaction store.
- Preserved SQL/UI page limits of 25 run summaries, 50 actions, and 100 events.
- Parent domain behavior gate passed 15 files and 86 tests. The architecture test's six unaffected rules passed; its no-growth rule correctly rejected a temporary 13-line increase in the concurrently edited root.

Phase status:
- Phase 10C domain ownership, dumping-ground deletion, test split, and owned mutation cleanup are complete.
- Phase 10C remains In Progress until the active root worker replaces the last root-side `fluxiq:subflows-changed` dispatch with a `subflow.changed` transaction and restores the root no-growth gate.
### 2026-08-28 - Phase 3 Scoped Stores Final Acceptance

Accepted after parent review:
- Adopted separate catalog, normalized project-data, selection, runtime-status, workspace-render/save, and Studio UI owners in the live composition.
- Removed migrated React/controller state, including the obsolete layout controller, while retaining narrow hierarchy-local state for Phase 7.
- Added selector-aware subscriptions, no-op guards, atomic cross-store transactions, synchronous warm-view activation, and cross-scope notification isolation tests.
- Replaced the final root `fluxiq:subflows-changed` event with a typed `subflow.changed` mutation transaction.
- Parent root/store/controller/architecture gate passed 6 files and 70 tests; the worker's expanded Phase 3 gate passed 74 tests across 7 files.
- Full web TypeScript check and production Next/Turbopack build passed.

Phase status:
- Phase 3 is Complete; every listed step and functional gate is satisfied.
- The final root transaction adoption also closes Phase 10C, whose domain split and 86 domain tests were accepted in the preceding checkpoint.
### 2026-08-28 - Phase 10D Graph Model Final Decomposition Checkpoint

Accepted after parent review:
- Split the final oversized `graph/view-model.ts` bucket into shared edge routing, interaction geometry, node parameter, Flow/policy conversion, run-log formatting, and legacy Routine graph modules; the largest extracted module is 342 lines.
- Migrated every direct consumer to its precise owner, changed the root to `flow-editor/model/policy-graph`, and deleted the temporary five-line compatibility file.
- Added an architecture absence guard and tightened the accepted `AutomationStudioLive.tsx` no-growth baseline from 3,810 to 3,808 source lines.
- Parent graph, conversion, interaction, and architecture gate passed: 10 files and 55 tests.

Phase status:
- Phase 10D source decomposition, naming, compatibility removal, and established pointer-contract tests are complete.
- Phase 10D remains In Progress only for measured browser pointer-handler and cross-view render budgets in Phase 12 certification.

### 2026-08-28 - Phase 6 Flow Command Foundation Acceptance

Accepted after parent review:
- Added Flow-owned command services for detail/node-definition loading, run-current-Flow, draft restore/discard/update/persist/save, publish/deprecate, and Subflow editor resolution.
- Centralized Flow endpoint ownership and browser draft persistence behind capabilities rather than view code.
- Added explicit success, failure, cancelled, and stale outcomes with AbortSignal and project-generation guards; stale completions cannot publish data or remove recovery drafts.
- Parent Flow command gate passed: 1 file and 16 tests.

Phase status:
- Phase 6 is In Progress. Steps 6.1-6.5 are implemented as tested command services; root/store adoption remains.
- Recording and State command steps 6.6-6.11 remain pending and are assigned in the next implementation wave.
### 2026-08-28 - Implementation Wave 4 Assigned

Delegated disjoint scopes after Phase 3 and graph acceptance:
- Worker I: complete Phase 4 root adoption for project catalog/lifecycle, synchronous shell publication, cancellation, deep-link, and project-modal isolation.
- Worker J: Phase 6 Recording commands 6.6-6.9, including lifecycle mutations, note/marker, cleanup transaction, and stopped-gateway monitoring.
- Worker K: Phase 6 State commands 6.10-6.11, including synchronous loading/selection intent and cancel/stale-safe detail resolution.
- Worker L continues Phase 10H typed registry/host work and owns its current syntax repair.

Parent-owned work during this wave:
- Review and acceptance, compatibility deletion, root baseline enforcement, sequential integration planning, production gates, and this working document.
- Workers may not edit this document; no delegated result changes a phase status until parent review passes.
### 2026-08-28 - Phase 10H Typed Host Foundation Acceptance

Accepted after parent review:
- Added discriminated per-view model/command contracts, typed selector/component registrations, mount/cache metadata, alias validation, and explicit unknown-view recovery.
- Added warm mounting and hidden-view freezing behavior; reduced `views/Renderer.tsx` to a 19-line compatibility entry.
- Isolated the root's unchanged aggregate payload in `views/legacy-renderer-adapter.tsx` so the remaining adoption is explicit and removable.
- Removed Inspector's global graph-selection subscription and parameter-update event; Flow editor selection and editor-node updates now use typed props and draft reconciliation.
- Removed browser `CustomEvent` implementation from the deprecated selection channel retained only for legacy Routine compatibility.
- Parent typed host, Inspector, Flow command/conversion, and architecture gate passed: 7 files and 40 tests; the worker's wider host gate passed 8 files and 62 tests.

Phase status:
- Phase 10H remains In Progress. The typed registry/host foundation is complete, but the root must construct scoped `AutomationViewHostRequest` values directly, delete `legacy-renderer-adapter.tsx`, and move Inspector's remaining broad arrays behind registered selectors.
- Remaining node/edge/palette command events inside the Flow editor are tracked as Phase 10D/10H interaction debt and are not accepted as a typed host boundary.
### 2026-08-28 - Phase 10G/10I Fixture Worker Assigned

- Reused the completed typed-host worker slot for a test-only large-project fixture and domain behavior matrix worker.
- The worker may add deterministic shared fixtures and focused domain tests, but may not edit production code or this document.
- Acceptance requires empty/loading/error/permission/large cases for data-intensive views, bounded mounted output, files below 700 lines, and parent review; source-string tests are disallowed where behavior is directly testable.
### 2026-08-28 - Phase 10D Local Flow Action Isolation Checkpoint

Implemented and parent-tested:
- Added a stable editor-local action context for node deletion, edge deletion/selection, and state opening.
- Removed `window` delete-node, delete-edge, select-edge, update-node-parameters, and palette-focus channels from the primary Flow editor, embedded proposal editor, and isolated legacy Routine editor.
- Palette focus now uses a direct revision prop; Flow state opening uses the typed host callback; editor-node selection/updates remain direct typed capabilities.
- Stable context forwarding prevents action-function identity changes from notifying custom node/edge consumers on ordinary controller renders.
- Parent Flow action, Inspector, and typed-host gate passed: 3 files and 23 tests. Full TypeScript validation reached only the concurrently in-progress Phase 4 root/catalog extraction; exact errors were returned to that worker.

Remaining interaction channels:
- The Phase 4 worker owns removal of the now-orphaned root `automation-studio:open-node-state` listener.
- Global save, viewport capture/restore, and problem-focus are host/workspace commands and remain for Phase 8/9/10H direct capability adoption.
- Browser pointer timing and unrelated-render counts remain Phase 12 certification gates.
### 2026-08-28 - Phase 6 State Command Foundation Acceptance

Accepted after parent review:
- Added State-owned index resolution and open-State-view commands with exact lookup, detail-on-demand hydration, and explicit success/failure/cancelled/stale outcomes.
- The open command publishes lightweight selection/loading intent synchronously, yields before detail work, and prevents stale or aborted responses from publishing resolved State.
- Added project-generation guards, AbortSignal handling, matching loading-key cleanup contracts, and publication-order tests.
- Parent State command/model/isolation gate passed: 4 files and 27 tests.

Phase status:
- Phase 6 steps 6.10-6.11 are implemented as tested command services; root/store/workspace adoption remains.
- The active Phase 4 worker owns the lifecycle generation/cancellation primitives these adapters will consume.
### 2026-08-28 - Phase 10B Retirement Worker Assigned

- Reused the accepted State-command slot for retired Proposal/Proposal Generator registry and view cleanup.
- The worker owns deterministic persisted-ID migration to Adaptations and explicit unavailable-view recovery, but may not edit the active root or fixture worker files.
- Acceptance requires deletion of unsupported canonical proposal hosts/views, no State fallback, no recording-generated proposal path, focused migration tests, architecture guards, and parent review.
### 2026-08-28 - Phase 6 Recording Command Foundation Acceptance

Accepted after parent review:
- Added Recording-owned commands for create, finalize, normalize, update, single/bulk delete, note, and marker workflows.
- Added one deduplicated Recording/proposal cleanup transaction plan and a per-project gateway monitor with exactly-once live/stopped transitions.
- Centralized Recording endpoint ownership and added success/failure/cancelled/stale outcomes, AbortSignal support, project-generation guards, and warning-preserving normalization semantics.
- Stale or cancelled work cannot commit cleanup or publish gateway transitions.
- Parent Recording domain gate passed: 2 files and 17 tests, including the concurrently added large-project behavior cases.

Phase status:
- Phase 6 steps 6.6-6.9 are implemented as tested command services; atomic store/root adoption remains.
- All Phase 6 command foundations (6.1-6.11) now exist. Phase 6 stays In Progress until the composition root uses them and contains no Flow, Recording, proposal, State, or Runtime API calls.
### 2026-08-28 - Phase 10G/10I Large-Project Behavior Acceptance

Accepted after parent review:
- Added a deterministic, configurable, linear large-project fixture with default collections of 2,048 Flows, Subflows, recordings, runs, instructions, adaptations, and clients; 8,192 actions and State facts; and 4,096 hierarchy nodes.
- Each collection is independently bounded to 50,000 entities, and fixture generation remains summary-only where detail is not under test.
- Added a canonical inventory requiring empty and large behavior coverage, or an explicit non-collection reason, for every data-intensive view contract.
- Added focused empty/loading/error/permission and bounded-large cases for Runtime, Recordings, Subflows, Instructions, Adaptations, Settings, Inspector, Clients, and Flow editor; existing Router, State, Problems, and hierarchy cases are inventory-enforced.
- Parent matrix passed: 12 files and 25 tests. Every new file is below 700 lines; the largest fixture/test module is 126 lines.

Phase status:
- Phase 10G's view-contract and large-data behavior foundation is complete; root/store selector adoption and browser render-count certification remain.
- Phase 10I's empty/large fixture and domain test split requirement is complete; remaining enforcement and end-to-end screenshot/performance gates stay open.
### 2026-08-28 - Phase 4 Project Lifecycle Final Acceptance

Accepted after parent review:
- Moved project catalog load, project/category CRUD and moves, summary/hierarchy hydration, open/close lifecycle, and one-time deep-link ownership out of `AutomationStudioLive.tsx`.
- Project open publishes the active shell synchronously before hydration; close/switch aborts requests and tears down project synchronization/cache subscriptions before clearing stores.
- Monotonic project generations prevent stale hydration commits, and catalog success atomically publishes projects, categories, and terminal loading state.
- Project modal fields remain Studio-UI-owned, so typing does not notify workspace/project-data subscribers.
- Removed the orphaned root open-node-state event listener after direct Flow host callback adoption.
- Parent Phase 4 project/root/architecture gate passed 4 files and 66 tests; the worker's wider cancellation gate passed 70 tests.
- Root project endpoint scan is clean. `AutomationStudioLive.tsx` is 3,528 lines, and the architecture no-growth ceiling was tightened accordingly.

Phase status:
- Phase 4 is Complete; every listed step and completion gate is satisfied.
- Full build certification waits only for the concurrent Phase 10B registry migration to finish; no Phase 4 type or bundle errors remain.
### 2026-08-28 - Phase 5 Root Integration Assigned

- Reused the completed Phase 4 root slot for full Phase 5 synchronization/cache/preload adoption.
- The worker owns the root plus synchronization, request coordination, cache, lazy preload, and scoped invalidation modules; it may not touch registry/Proposal, command-service, fixture, hierarchy/workspace UI, CSS, or this document scopes.
- Acceptance requires root removal of direct sync/cache/preload ownership, zero old subscription after project switch, scoped selector notifications, stale/optimistic race protection, no cache work on click paths, the 3,528-line root ceiling, parent tests/check/build, and a documented plan checkpoint.
### 2026-08-28 - Parallel Workspace and Authored Documentation Work Assigned

- Worker M owns the non-root Phase 8/10A split of generic workspace layout/components into precise modules while retaining tiny compatibility barrels for the active root.
- Worker N owns authored Automation Studio architecture/performance documentation updates and may not edit code, generated docs, or this working plan.
- Workspace acceptance requires behavior-preserving tests, sub-300-line targets, and an exact list of root imports preventing barrel deletion.
- Documentation acceptance requires intent/ownership, accepted-vs-pending accuracy, stale architecture removal, browser-neutral cache/sync guidance, manual certification procedure, and docs checks.
### 2026-08-28 - Phase 12 Authored Documentation Acceptance

Accepted after parent review:
- Rewrote the authored Automation Studio workspace architecture around scoped stores, atomic transactions, generation-safe project lifecycle, SQL-paged summaries, detail-on-demand hydration, typed view hosting, and domain-owned views/styles.
- Updated the architecture overview, UI performance profiling runbook, and scale-certification guide with browser-neutral cache/synchronization rules, deterministic large fixtures, source budgets, evidence ownership, and the required manual browser matrix.
- Kept unfinished root adoption and browser measurements explicitly marked pending; no source-only test is represented as browser performance certification.
- Parent documentation gate passed: `pnpm docs:check` validated 48 authored/reference Markdown files and confirmed generated references are current.

Phase status:
- Phase 12.12 is Complete.
- Phase 12 remains Pending until implementation closes and all repository validation plus permitted certification gates run.
### 2026-08-28 - Phase 10F Final Cleanup Worker Assigned

- Reused the accepted documentation worker slot for the remaining non-root Recording, Inspector, Client, Shared, and legacy Config ownership cleanup.
- The worker may not edit the active root, workspace, synchronization/cache, proposal-retirement, CSS, or this working document scopes.
- Acceptance requires concrete behavior-preserving ownership improvements, focused tests, inactive subscription teardown, an explicit Config compatibility decision, no cross-domain private imports, and a precise list of any residual typed-host/root adoption dependency.
- The parent owns review, phase-status changes, integration checks, and this plan checkpoint.
### 2026-08-28 - Phase 10A Workspace Bucket Decomposition Acceptance

Accepted after parent review:
- Split `workspace/layout.ts` into contracts, defaults, mutations, normalization, persistence, regions, and sizing modules.
- Split `workspace/components.tsx` into layout picker, mounted-view activation, primitives, view container, metadata, window adder, and preferences modules.
- Reduced both original files to eight-line compatibility barrels for the still-active root imports; every implementation module is below 300 lines.
- Updated precise workspace consumers and focused tests. Parent gate passed 2 files and 27 tests.

Phase status:
- The Phase 10A workspace layout/components disposition is Complete.
- Phase 8 remains Pending: `AutomationStudioLive.tsx` still imports the compatibility barrels and owns pane/tab/layout JSX and commands. Those barrels are deleted during Phase 8 root adoption.
- Full web type validation remains temporarily blocked by the concurrent Phase 5 root/synchronization integration, not this workspace split.
### 2026-08-28 - Phase 10B Non-Root Proposal Retirement Acceptance

Accepted after parent review:
- Removed Proposal and Proposal Generator from canonical registry contracts, typed host kinds, host registrations, navigation creation paths, and the view adder.
- Deleted `views/ProposalView.tsx`, `views/ProposalGeneratorView.tsx`, and their obsolete tests.
- Added Flow-aware persisted-ID migration to Adaptations and explicit unavailable recovery when no Flow context exists; retired IDs cannot fall through to State Explorer.
- Migrated workspace normalization/persistence and focused renderer/registry/contracts tests.
- Parent focused retirement gate passed 4 files and 13 tests in the final rerun; the worker's wider gate passed 8 files and 44 tests plus 15 adjacent Recording/architecture tests.

Phase status:
- Phase 10B canonical registry/view retirement and persisted workspace migration are Complete.
- Phase 10B remains In Progress until the root's four compatibility constructions/preferences and hierarchy/model compatibility labels migrate during root/hierarchy adoption.
- No current canonical Proposal view component or creation path remains.
### 2026-08-28 - Hierarchy and Domain Transport Workers Assigned

Two disjoint non-root workers were assigned:
- Phase 7 package worker: hierarchy-only selectors, commands, atomic dialog transaction, immediate activation sequencing, bounded/paged rows, and behavior tests. Root adoption is explicitly excluded until the Phase 5 root worker finishes.
- Phase 10G/10H transport worker: Router, Subflows, Instructions, Settings, Adaptations, and Runtime entry views move from direct Program API ownership to typed domain models/commands and lifecycle-safe transport adapters.

Acceptance rules:
- Neither worker may edit the active root, workspace, synchronization/cache, Proposal registry, Recording/Inspector/Client cleanup, CSS, authored docs, or this plan.
- The parent will review actual diffs, run focused and integration gates, record residual wiring precisely, and change phase status only after old ownership is removed.
### 2026-08-28 - Phase 5 Parent Review Gate

Parent validation in progress:
- Direct root synchronization client, cache coordinator, request coordinator, and lazy-preload ownership are removed; the root now composes one project data platform boundary.
- Root size is 3,467 lines. Parent sync/cache/preload/root/architecture gate passed 8 files and 84 tests.
- Acceptance is intentionally withheld: review found that delete feed events mutate affected normalized scopes, while create/update/touch events appeared to invalidate cache without a proven affected-selector revalidation/publication path.
- The gap was returned to the Phase 5 worker. Completion now requires a tested, scoped create/update/touch path that cannot overwrite optimistic state or publish stale project results.
### 2026-08-28 - Phase 5 Synchronization and Cache Final Acceptance

Accepted after parent review:
- Replaced root-owned sync/cache/request/preload effects with one project data platform composition boundary.
- Added one synchronization client per project generation, scoped mutation filtering, cursor/backpressure handling, old-project teardown, and browser-neutral lifecycle capabilities.
- Added read-through cache deduplication, AbortSignal cancellation, generation guards, mutation revisions, and optimistic-write race protection.
- Added bounded create/update/touch revalidation for Flow, Subflow, hierarchy, Recording, timeline, Runtime, Instruction, and Adaptation scopes; delete events retain synchronous local reconciliation.
- Affected commits publish only the matching normalized selector, while stale project and stale mutation results cannot commit.
- Root direct ownership scan is clean and the root is 3,468 lines, below the prior 3,528 ceiling.
- Parent final Phase 5 behavior gate passed 8 owned files and 82 tests. The concurrent architecture suite could not parse because of a malformed regex in the active Phase 10F worker scope; that defect was returned to its owner and is not a Phase 5 failure.

Phase status:
- Phase 5 is Complete; steps 5.1-5.7 and every functional gate are satisfied.
- The root no-growth baseline will be tightened to the final post-wave line count after the concurrent architecture file edit is repaired.
### 2026-08-28 - Phase 6 Root Adoption Assigned

- Reused the completed Phase 5 root slot for the sole root-editing Phase 6 worker.
- The worker must consume the accepted Flow, Recording, State, and Runtime command services, remove root domain handlers/API and browser-draft ownership, and use store snapshots plus generation/cancellation guards.
- The same root pass removes the four retired Proposal preference/view/placement paths and Proposal cleanup API ownership where compatible, advancing Phase 10B.
- Existing domain files, hierarchy, workspace, synchronization/cache, typed host, CSS, documentation, and this plan are excluded because parallel workers own those scopes.
- Acceptance requires focused wiring/command tests, a clean root endpoint/persistence scan, preserved immediate loading/selection behavior, and a root below the 3,468-line Phase 5 baseline.
### 2026-08-28 - Phase 5 Final Architecture Gate Addendum

- The concurrent Phase 10F architecture regex was repaired by its owner.
- Parent rerun passed project revalidation, project invalidation, and the expanded architecture contract: 3 files and 21 tests.
- Phase 5 therefore has no remaining owned or integration-test blocker; its Complete status is unchanged.
### 2026-08-28 - Phase 10F Non-Root Ownership Acceptance

Accepted after parent review:
- Added lazy selection-ID-based Inspector selectors and typed panel ownership; broad project arrays are quarantined in one explicit legacy Inspector adapter, and editor parameter mutation no longer belongs to Inspector.
- Moved Recording list I/O and protected actions out of timeline rendering, retained SQL-paged summaries, bounded long tracks, and Recording-owned event formatting/detail.
- Added Client request invalidation and inactive polling teardown, removed Client's private workspace import, and documented Config as compatibility-only with retirement conditions.
- Expanded architecture enforcement for Phase 10F data-command and private-import boundaries.
- Parent Phase 10F gate passed 9 files and 36 tests. Direct API entry and sibling-private-import scans are clean.

Phase status:
- Phase 10F non-root Recording, Inspector, Client, timeline, Shared, and Config ownership is Complete.
- Phase 10F remains In Progress until Phase 10H/root adoption constructs Inspector requests from selection ID/scoped selectors, deletes `views/InspectorView.tsx` and the broad legacy renderer adapter, passes Client activity directly, and migrates saved Config IDs to Settings.
### 2026-08-28 - Phase 0/12 Performance Harness Worker Assigned

- Reused the accepted Phase 10F slot for the non-server performance harness, deterministic fixture, render-counter, request/long-task/DOM/heap, and named-interaction coverage.
- The worker may edit only E2E performance/support, development metric/test, and testing fixture files; it may not start the web panel or edit active production scopes.
- Acceptance distinguishes implemented deterministic capture from measurements that require the repository-mandated manual dev-panel command. No unexecuted browser budget may be recorded as passing.
- The parent owns review, focused validation, plan updates, and final manual certification disclosure.
### 2026-08-28 - Phase 7 Hierarchy Package Acceptance

Accepted after parent review:
- Split the broad hierarchy model into contracts, capabilities, indexing, Flow generation, Recording generation, signatures, and identifiers; `hierarchy/model.ts` is now a six-line compatibility barrel.
- Added typed routing/legacy migration, capability-checked create/delete commands, one immutable dialog transaction, and immediate row-selection then view-activation sequencing.
- Split memoized rows/icons and pure keyboard behavior from `ProjectTree.tsx`; added equality-aware UI state, memoized selectors, bounded rows, and stale-safe paged sibling cache behavior.
- Parent hierarchy gate passed 5 files and 38 tests; the expanded package gate passed 54 tests.

Phase status:
- Phase 7's non-root hierarchy package is Complete.
- Phase 7 remains In Progress for seven root adoption points: replace duplicate tree state, use atomic dialog transaction, consume create/delete commands, move modal/sidebar JSX, wire SQL sibling pagination, and replace string-based view opening with typed routing.
- Full type check is temporarily blocked only by the separately owned corrupted Runtime test repair.
### 2026-08-28 - Phase 9 Overlay Package Assigned

- Reused the accepted hierarchy worker slot for new typed project, hierarchy-action, preferences, view-adder, layout, and Inspector/drawer overlay packages.
- The worker cannot edit the active root or existing production scopes; it owns precise new overlay modules and focused isolation/accessibility tests only.
- Acceptance requires local typing state, selector-minimal inputs, typed atomic confirmation, command-specific progress/error, accessible focus/Escape/scroll behavior, narrow-screen containment, and an exact root adoption map.
- Phase 9 remains Pending until a later sole root worker removes all modal/palette JSX and render-input arrays.
### 2026-08-28 - Phase 10G/10H Domain Transport Acceptance

Accepted after parent review:
- Added browser-neutral Program transport capabilities and domain-specific hosts for Router, Subflows, Instructions, Flow/Subflow Settings, Adaptations, Runtime history/detail/events, and Runtime execution.
- Product views now receive typed models/commands; they do not import `useProgramApi`, call Program API transport, or accept generic API props.
- Preserved SQL pagination, selected-detail loading, mutation subscriptions, stale request guards, sequencing, and cancellation behavior.
- The accidental bulk character corruption in four new test files was caught before acceptance, semantically reconstructed by the worker, and verified with a clean corruption-token scan.
- Parent domain model/command/architecture gate passed 7 files and 39 tests; component contract gate passed 6 files and 45 tests. Direct API entry scan is clean.

Phase status:
- Phase 10G's direct transport ownership requirement is Complete for these six domains.
- Phase 10H remains In Progress: the registry still types/spreads compatibility workspace command bindings. A following registry worker must bind the new domain command interfaces directly; root legacy adapter removal remains later.
### 2026-08-28 - Phase 10H Direct Domain Registry Binding Assigned

- Reused the accepted transport worker slot to replace compatibility workspace command/model shapes with direct typed domain interfaces in the view registry.
- The root-consumed `legacy-renderer-adapter.tsx` is intentionally excluded until sequential root adoption; all other universal command/data binding is prohibited.
- Acceptance requires per-view typed model/commands, preserved explicit unknown recovery and warm/sleep behavior, no transport ownership, focused registry/domain tests, and an exact residual root adapter map.
### 2026-08-28 - Phase 9 Overlay Package Acceptance

Accepted after parent review:
- Added typed, selector-minimal project, hierarchy-action, preferences, view-adder, layout-picker, Data Inspector, Inspector drawer, hierarchy drawer, and timeline drawer subscribers under `workspace/overlays/`.
- Overlay typing is local; confirmation is immutable, duplicate-safe, command-specific, and reports pending/error state.
- Added focus trapping, Escape dismissal, focus restoration, scroll locking, viewport containment, and narrow-screen behavior.
- Reconstructed `AutomationStudioOverlays.tsx` after the worker accidentally wrote PowerShell's reserved Host object string into it; parent verified all 20 overlay files contain no shell-output contamination.
- Parent focused overlay gate passed 4 files and 11 tests; full web TypeScript check passed.

Phase status:
- Phase 9's non-root overlay package is Complete.
- Phase 9 remains Pending for root adoption: instantiate one overlay store, map project/hierarchy/preferences/view-adder/layout/Data Inspector requests, connect three drawers, and delete root render refs, field setters, modal/palette JSX, and render-input arrays.
### 2026-08-28 - Phase 8 Workspace Package Assigned

- Reused the accepted overlay worker slot for new typed workspace commands and shell modules.
- The worker owns non-root view/pane/tab/right-tab/layout/resize commands, pane area, timeline dock shell, header/breadcrumbs, responsive drawers, and selector-minimal WorkspaceShell tests.
- Existing root, workspace implementation/barrels, overlays, domain views, hierarchy, synchronization/cache, typed registry, CSS, documentation, and this plan are excluded.
- Phase 8 remains Pending until a later sole root worker adopts these modules and deletes root workspace JSX, callbacks, renderer refs, and compatibility barrels.
### 2026-08-28 - Phase 6 Domain Commands Final Acceptance

Accepted after parent review:
- Root now consumes scoped Flow, Recording, State, Runtime, browser-draft, and gateway command adapters under `live/`.
- Added one project-generation command scope with AbortSignal cancellation and stale-result guards; commands read current scope rather than render-time project closures.
- Preserved synchronous State selection/loading publication before detail resolution and atomic Recording/proposal compatibility cleanup.
- Removed retired Proposal root view construction, preferences, loading, placement, and deletion paths.
- Root direct ownership scans contain no Flow, Recording, Proposal, State, Runtime, or browser persistence endpoint/path. Its sole remaining Program API call is `save-project-hierarchy`, owned by Phase 7.
- Root is 3,218 lines, below the 3,468 Phase 5 baseline.
- Parent Flow/Recording/State/live/root/architecture gate passed 6 files and 102 tests; full web TypeScript check passed.

Phase status:
- Phase 6 is Complete; steps 6.1-6.11 and every gate are satisfied.
- Phase 10B root Proposal retirement is Complete. Remaining Proposal strings are compatibility migration/tests and legacy Inspector/model labels tracked for the final naming/typed-host pass.
### 2026-08-28 - Phase 0/12 Performance Harness Acceptance

Accepted after parent review:
- Added deterministic empty, small, and scale certification scenarios for project lifecycle, hierarchy, cold/warm views, overlays, graph select/drag/save/right-drag, resizing, Flow/folder mutations, Runtime list, and run detail.
- Capture now records operation and settled timing separately, requests/API metrics, long tasks, DOM deltas, exact six-boundary render counts, graph DOM size, and repeated-switch retained heap.
- Added per-scenario budgets, render-isolation contracts, deterministic small fixtures, and serialized Chromium fixture mutation.
- Parent source/fixture gate passed 5 files and 10 tests; full web TypeScript check and discovery of 15 Playwright scenarios passed.

Phase status:
- Phase 0's fixture, behavior capture, render-counter, and automated guardrail implementation is Complete.
- Phase 0 remains In Progress only because actual browser baseline measurements cannot be captured without starting the web panel, which repository instructions prohibit the agent from doing.
- Phase 12 browser performance/heap evidence remains explicitly manual and Pending; no unexecuted budget is recorded as passing.

### 2026-08-28 - Phase 10H Direct Registry Binding Acceptance

Accepted after parent review:
- Added explicit per-domain model/command contracts for Router, Subflows, Instructions, Settings, Adaptations, and Runtime.
- Registry callbacks receive only their own model, commands, and activity; workspace prop inference is gone and type erasure is confined to one dispatch boundary.
- Preserved explicit unknown-view recovery and warm/sleep behavior.
- Worker typed registry/domain gate passed 71 tests plus 12 architecture tests; full web TypeScript check and direct workspace/API transport scans passed.

Phase status:
- Phase 10H direct non-root domain binding is Complete.
- Phase 10H remains In Progress for root scoped-host construction, broad legacy adapter deletion, scoped Inspector construction, direct Client activity, Config-to-Settings migration, and compatibility renderer export removal.
### 2026-08-28 - Phase 7 Root, Phase 10I Enforcement, and Phase 10B Naming Assigned

Three disjoint workers were assigned:
- Sole root worker: adopt the accepted hierarchy store/routing/dialog/commands/pagination package, remove all hierarchy API/state/JSX from the root, and eliminate hierarchy-facing Proposal compatibility UI.
- Architecture worker: implement every Phase 10I prohibition as an executable check with narrow named residual exemptions and no-growth ceilings.
- Vocabulary worker: remove remaining non-root/non-hierarchy user-facing Proposal and Policy-as-Flow names from Inspector, project view models, shared view types, and metadata.

The active Phase 8 workspace package remains isolated in new workspace command/shell modules. No worker may edit this plan; parent review and phase status remain centralized here.
### 2026-08-28 - Phase 10H Parent Registry Gate Addendum

- Parent reran typed registry, migration/contract, renderer, and all six directly bound domain component suites: 10 files and 59 tests passed.
- The direct domain binding acceptance remains valid; no non-root registry defect was found.
### 2026-08-28 - Phase 7 Root Worker Replaced

- The first Phase 7 root worker was stopped after producing no workspace change despite repeated implementation prompts.
- A replacement now holds the sole-root lock with a concrete extraction: create one hierarchy composition/controller, wire it, remove the root hierarchy save/state/commands/modal/sidebar/string-routing blocks, and prove SQL sibling paging plus immediate selection behavior.
- No phase status changed and no unreviewed work was accepted from the stopped worker.
### 2026-08-28 - Phase 10B Scoped Vocabulary Acceptance

Accepted after parent review:
- Inspector now uses Adaptation/Flow terminology and routes imported compatibility records to Adaptations.
- Project view labels, IDs, icons, and types canonicalize through the typed registry.
- Current view types no longer include Proposal variants; legacy Config presents editable behavior as Flow Settings.
- Parent scoped naming gate passed 4 files and 14 tests; the worker's vocabulary suite passed 4 files and 15 tests. Full web TypeScript check passed.

Narrow compatibility retained:
- `PersistedAutomationViewType` retains `proposal` and `proposal-generator` only for saved-tab deserialization and maps both immediately to Adaptations.
- Proposal payload field/collection names remain only in persisted/API contracts.
- `AutomationPolicyNodeData` is a deprecated alias; `AutomationFlowNodeData` is canonical.
- Actual framework policy contracts retain policy terminology.

Phase status:
- Phase 10B non-root/non-hierarchy vocabulary migration is Complete.
- Phase 10B remains In Progress until hierarchy routing removes Proposal selection and recording-primary compatibility branches while retaining only persisted-ID migration.
### 2026-08-28 - Phase 10I Architecture Enforcement Acceptance

Accepted after parent review:
- Added shared architecture test helpers and executable checks for direct Program API ownership, dumping-ground files, raw view IDs, private cross-domain imports, 700-line ceilings, retired Proposal creation, URL-owned ordinary state, browser persistence, global action events, root budgets, CSS ownership, and compatibility removal.
- Every residual exemption has an exact path, occurrence ceiling, owner, and removal phase; wildcard exemptions and stale resolved exemptions fail.
- Frozen Phase 11 baseline is 3,218 root lines, 2,856-line largest function, 2 Program API occurrences, 189 JSX elements, 8 forbidden domain JSX elements, and 4 state hooks. These ceilings can only decrease.
- Parent architecture/hierarchy/style/overlay gate passed 4 files and 22 tests; full web TypeScript check passed before the concurrent WorkspaceShell write.

Phase status:
- Phase 10I enforcement implementation is Complete.
- Phase 10I remains In Progress until its named Phase 7/8/10A/10B/10D/10F/10G/10H/11 exemptions reach zero and final full/screenshot/browser gates run.
### 2026-08-28 - Problems Domain Completion Worker Assigned

- Reused the accepted enforcement slot for the named Phase 10G Problems exemption.
- The worker owns Problems-only typed model/command transport, complete loading/empty/error/permission/stale/focus/navigation behavior, bounded diagnostics, inactive validation, and tests.
- Root, hierarchy, workspace, other domains, registry core, CSS, documentation, and this plan remain excluded.

### 2026-08-28 - Phase 7 Root Recovery and Current-API Persistence Cut

- The stopped Phase 7 root worker wrote after interruption and truncated the middle of `AutomationStudioLive.tsx` from about 3,102 to 1,958 lines. Parent review identified the damage through TypeScript failures; the worker was closed permanently and its partial output was not accepted.
- No exact working-tree backup existed. The parent used the older source map only as a behavioral inventory, then rebuilt each missing slice against the accepted Phase 5/6/8 APIs. Obsolete direct Program API, Proposal Generator, and pre-platform cache code were not restored.
- Project lifecycle, hydration, runtime summary, Flow/Subflow/detail loading, Recording detail/timeline loading, workspace commands, resize commits, hierarchy cleanup, Recording cleanup transactions, Flow draft commands, and legacy renderer bridging are functional again.
- Root now delegates hierarchy persistence to `hierarchy/useHierarchyPersistence.ts`; `save-project-hierarchy` and its debounce/signature/error logic no longer live in the root.
- Root delegates view/pane/tab/layout activation to the Phase 8 command service and contains no direct `api.get` or `api.post` calls. It is 2,630 lines, below both the 3,218 Phase 11 ceiling and the 3,102 pre-incident state.
- Web TypeScript check passes. ProjectTree passed 19 tests, Phase 8 command tests passed, and Problems passed 24 tests.
- Root source-contract tests still contain six assertions for the retired local workspace implementation, and architecture enforcement found two now-stale exemptions. These are the next required cleanup before this recovery checkpoint is accepted as a complete Phase 7/8 integration step.

Phase status:
- Phase 7 remains In Progress for hierarchy mutation/dialog/routing/pagination extraction.
- Phase 8 remains Pending for shell JSX adoption even though its command service is now root-integrated.
- Phase 10G Problems implementation is accepted; its stale direct-API exemption must now be deleted from enforcement.


### 2026-08-28 - Root Recovery Gate and Problems Acceptance

Accepted after parent review:
- Recovered root project lifecycle, current data-platform loaders, scoped Recording cleanup, scoped Flow draft callbacks, and workspace command delegation without restoring obsolete direct domain API ownership.
- Added hierarchy persistence ownership under `hierarchy/useHierarchyPersistence.ts`; the root now has only the single `useProgramApi` composition entry and no direct `api.get`/`api.post`.
- Updated source-contract tests to assert the new workspace command/port owners rather than the retired local pane implementation.
- Deleted the stale Problems direct-API exemption and the stale root Proposal-construction exemption.
- Parent gate passed 78 root/hierarchy/architecture tests, 24 Problems tests, and the web TypeScript check. Root is 2,630 lines.

Phase status:
- The interrupted-worker recovery is Complete and accepted.
- Phase 10G Problems is Complete for its typed model/commands, state matrix, bounded diagnostics, activity behavior, and tests; explicit registry binding remains Phase 10H.
- Phase 7 and Phase 8 remain In Progress at the canonical checklist above.


### 2026-08-28 - Runtime Summary Projection Extraction

- Moved runtime-summary-to-store projection and stale-safe Flow/Recording/Adaptation-compatibility merges into `model/project-runtime-summary.ts`.
- Root now commits pure projected slices through functional store updates; background summaries cannot overwrite loaded Flow or Recording detail.
- Focused model gate passed 3 tests.
- This advances Phase 10A model ownership and Phase 11 root reduction. Full web validation waits for the active Phase 8 worker to finish its isolated workspace files.


### 2026-08-28 - Phase 7 Hierarchy Contracts Final Acceptance

Accepted after parent review:
- Legacy Proposal-era hierarchy IDs now migrate directly to Adaptations and cannot create Proposal selection state.
- Flow-name activation selects Router, subflow activation selects Nodes, and selection publishes before view activation.
- Typed SQL sibling pagination inputs now pass through both hierarchy sidebars and ProjectTree without descendant over-fetching.
- Capability-checked create/delete intents and one immutable, validated dialog transaction replace ambiguous hierarchy actions.
- Parent hierarchy gate passed 10 files and 61 tests; the hierarchy Proposal-state scan and diff integrity check are clean.

Phase status:
- Phase 7''s complete non-root hierarchy contract is accepted.
- Phase 7 remains In Progress only for typed project API exposure, active-project pager composition, root sidebar wiring, dialog-store adoption, transaction deduplication, recording-primary narrowing, and deletion of the retired root hierarchy modal state.


### 2026-08-28 - Phase 7 SQL Sibling Page API Complete

Accepted after parent implementation and review:
- Added the typed `list-project-hierarchy-children` read endpoint with `projectId`, exact `parentId`, opaque cursor, and bounded limit.
- The service delegates to the indexed SQL hierarchy repository and closes its project lease deterministically.
- Existing file-backed projects are imported into the SQL hierarchy on the first uncached page request, preserving current projects without recreation.
- API validation proves stable two-page sibling traversal; the focused FluxIQ handler suite passed 10 tests and diff integrity is clean.

Phase status:
- Phase 7 API exposure is Complete.
- Active-project pager composition, root sidebar page wiring, typed dialog transaction adoption, and retired root hierarchy state deletion remain In Progress.


### 2026-08-28 - Phase 8 Workspace Hardening Acceptance

Accepted after parent review:
- Removed global warm-view activation events in favor of pane-local subscriptions and typed region activation.
- Pane capacity is explicit and non-destructive; a fourth pane is rejected without evicting existing work.
- Layout presets avoid duplicate Flow panes, project switches reset warm state, and cancelled resizing restores every transient style.
- View-source observation is bounded to 64 subscriptions and 128 examined candidates.
- Parent workspace gate passed 3 files and 19 tests; the complete worker workspace suite passed 80 tests. Full web TypeScript check passes.

Phase status:
- Phase 8''s command, warm registry, layout, resize, and shell packages are Complete.
- Phase 8 remains In Progress only for root WorkspaceShell adoption, typed right/bottom region mapping, and removal of retired root workspace JSX.


### 2026-08-28 - Phase 9 Overlay Hardening Acceptance

Accepted after parent review:
- Overlay close operations are request-aware, so stale async completions cannot dismiss a newer request.
- Deeply immutable command snapshots provide duplicate-submit suppression, progress, retry, and local error ownership.
- Focus restoration and scroll locking are nested-overlay safe; busy overlays reject Escape and backdrop dismissal.
- Floating panels are viewport-contained and responsive, while hierarchy selection consumes a bounded searchable source rather than broad arrays.
- Stable drawer components and one typed composition controller replace broad root-owned React-tree inputs.
- Parent overlay gate passed 5 files and 21 tests; full web TypeScript check passes.

Phase status:
- Phase 9''s complete non-root overlay package and hardening are Complete.
- Phase 9 remains In Progress only for root store/controller adoption and deletion of retired root modal, palette, drawer, render-ref, and render-input JSX.


### 2026-08-28 - Phase 10H Typed View-Host Composition Acceptance

Accepted after parent review:
- Added canonical ID-to-host mapping for all 12 current views with explicit per-domain model, commands, and activity inputs.
- Publication is active-first, bounded, batched, generation-cancelled, and identity-stable when model/command references do not change.
- Project reset removes stale entries; unavailable views are removed; aliases report migration; retired/unknown IDs return typed recovery results.
- Proposal and Config IDs cannot become current host entries, and the composition owns no transport, browser storage, DOM globals, or universal renderer props.
- Parent composition/registry gate passed 2 files and 11 tests; full web TypeScript check passes after correcting one exact-optional test fixture.

Phase status:
- Phase 10H typed view-host composition is Complete.
- Phase 10H remains In Progress for root scoped-input construction, WorkspaceShell source wiring, Inspector scoping, and deletion of the legacy renderer adapter.


### 2026-08-28 - Integration Wave Assigned

Four disjoint non-root workers were assigned under parent supervision:
- Phase 7: typed browser transport and one active-project SQL sibling pager composition with stale-safe paging tests.
- Phase 10F: Recording, Inspector, Client, legacy Config, timeline-preview, and shared-boundary completion.
- Phase 10I: executable architecture/style/test enforcement with no weakened rule or increased exemption.
- Phase 10G: canonical-view functionality matrices, large fixtures, and non-browser behavior coverage.

The parent retains the sole root lock and is integrating WorkspaceShell, typed view-host publication, overlays, hierarchy transactions, and retired root JSX/state removal. Workers do not edit this plan; each result is reviewed, independently validated, and recorded before acceptance.


### 2026-08-28 - Root View Request Boundary Extraction

- Converted the root compatibility renderer''s State and ordinary view assembly into one pure `createLegacyAutomationViewHostRequest` factory.
- Removed the nested State host memo/signature component; the same typed host request path now serves every current view.
- This is the migration boundary required for WorkspaceShell to consume per-view source entries instead of root-created React trees.
- Focused renderer tests passed 4 tests and the full web TypeScript check passes.

Phase status:
- Phase 8.9 and Phase 10H advance to source wiring; root renderer callbacks remain until the next shell-adoption step removes them.


### 2026-08-28 - Single-View Typed Publisher Boundary

- Added `createAutomationCanonicalViewEntry` and `AutomationCanonicalViewPublisher` so each canonical view can publish and remove exactly one typed source entry.
- The boundary takes one view-specific model/command input and cannot receive the universal renderer contract.
- This enables incremental root adoption by domain while preserving source revision isolation and avoiding an all-view publication effect.
- Focused typed composition gate passed 8 tests. Full web checking is temporarily blocked only by concurrent worker test fixtures in Client, hierarchy paging, and view-functionality coverage.

Phase status:
- Phase 10H now has both batch and isolated publication APIs.
- Root source adoption remains In Progress and will proceed per domain rather than through a broad compatibility publisher.


### 2026-08-28 - Client View Typed Source Adoption

- Connected Clients now publishes through its own `AutomationCanonicalViewPublisher` with only `projectId`, label/state, and its empty command capability.
- The publisher cannot observe Flow, Recording, State, hierarchy, overlay, or workspace data.
- Focused typed composition/domain-binding gate passed 2 files and 11 tests.

Phase status:
- Phase 10H Client source adoption is Complete.
- The remaining 11 canonical views will migrate through the same isolated boundary before WorkspaceShell switches from the legacy renderer.


### 2026-08-28 - Phase 7 Browser SQL Paging Acceptance

Accepted after parent review:
- Added strict typed transport decoding for `list-project-hierarchy-children` and exact-parent filtering.
- One project-scoped browser paging controller now owns root/child pages, cancellation, stale generations, bounded limits, retry, stable snapshots, SQL/static deduplication, and static-node identity.
- Parent paging/contract/tree gate passed 3 files and 33 tests; the complete hierarchy suite passed 68 tests.

Phase status:
- Phase 7 SQL service, browser transport, and project-scoped pager are Complete.
- Root activation/subscription and sidebar `nodes`/`childPageInfo`/`loadMoreChildren` wiring remain In Progress.


### 2026-08-28 - Phase 10I Enforcement Expansion Acceptance

Accepted after parent review:
- Exact residual auditing now rejects growth, loose ceilings, duplicate/wildcard/stale/unowned exemptions, renamed event channels, oversized production/tests, unproved large-fixture claims, cross-domain notification fan-out, and misplaced Automation Studio CSS.
- The focused enforcement/isolation suite contains 30 passing tests.
- The strengthened gate correctly remains red on temporary production debt: root canonical IDs/lines/largest-function/JSX exceed the frozen accepted ceiling and `hierarchy/model.ts` is above its barrel budget.
- No ceiling or exemption was increased to conceal those findings.

Phase status:
- Phase 10I enforcement implementation is Complete.
- Phase 10I remains In Progress until Phase 7/8/9/10H/11 adoption reduces every named production residual to zero and the full gate passes.


### 2026-08-28 - Phase 10G Canonical Functionality Acceptance

Accepted after parent review:
- All 12 canonical views now have domain-owned functionality contracts and aggregate enforcement covering purpose/scope, loading/empty/error/stale/permission/narrow/warm states, paging or virtualization, command/destructive behavior, raw disclosure, fixtures, and budgets.
- Data-intensive coverage is executable rather than documentary.
- Parent contract/large-fixture gate passed 3 files and 11 tests; the worker''s full domain suite passed 43 files and 215 tests, with web TypeScript and diff checks clean.

Phase status:
- Phase 10G non-browser functionality implementation and contract coverage are Complete.
- Phase 10G remains In Progress only for the named Phase 12 browser accessibility, 320px layout, warm-state, 10k-node, and 100k-row performance/heap certifications.


### 2026-08-28 - Flow Metadata Views Typed Source Adoption

- Router, Subflows, Instructions, Adaptations, and Settings now each publish an independent memoized typed source entry.
- Router receives only its create-Subflow capability; Subflows receives only open-Subflow navigation; the other three receive their own scoped model and command contract.
- Connected Clients and these five views cannot revise one another unless their exact input references change.
- Full web TypeScript check passes.

Phase status:
- Phase 10H source adoption is Complete for 6 of 12 canonical views.
- Flow Editor, Recording Timeline, State Explorer, Runtime Debug, Problems, and Inspector remain.


### 2026-08-28 - Flow Editor Typed Source Adoption

- Flow Editor now publishes one isolated typed model containing only editor graph, draft, node-definition, Recording-reference, and selected-node inputs.
- Its command capability is limited to graph save/draft/dirty actions, Problems navigation, State opening, and selection.
- Full web TypeScript check passes.

Phase status:
- Phase 10H source adoption is Complete for 7 of 12 canonical views.


### 2026-08-28 - All Canonical Views Typed Source Adoption

- Recording Timeline, State Explorer, Runtime Debug, Problems, and Inspector now publish through independent typed source entries, completing all 12 canonical views.
- Recording owns only timeline/list/processing data and Recording commands.
- State owns its evidence/snapshot input and selection command; Runtime owns run/pipeline inputs; Problems owns normalized diagnostics/navigation; Inspector owns its scoped selected-object model.
- Full web TypeScript check passes. Typed composition/domain/renderer gate passed 3 files and 15 tests.

Phase status:
- Phase 10H canonical source adoption is Complete for all 12 views.
- WorkspaceShell source switching and legacy renderer deletion are the next sequential step.

### 2026-08-28 - Phase 10F Non-Root Final Acceptance

Accepted after parent review:
- Recording timeline materialization is bounded to 200 entries and reuses a memoized sorted preview index rather than sorting or rendering the complete event collection.
- Recording commands and lists use a Recording-owned data port; Inspector exposes a typed panel registry and scoped selection boundary; Client Gateway polling has explicit activity and cancellation semantics.
- Legacy Config is read-only compatibility UI, the unused mounted-view activation subscriber is gone, and the timeline dock is a narrow Recording-owned compatibility wrapper.
- Parent Phase 10F gate passed 12 files and 47 tests; the full web TypeScript check had already passed on the completed worker tree.

Phase status:
- Phase 10F non-root ownership is Complete.
- Phase 10F remains In Progress only for root injection of Recording/Client ports, root scoped Inspector adoption and legacy Inspector adapter deletion, direct preview-model composition, and final Config/Timeline compatibility retirement after persisted-ID migration.
### 2026-08-28 - Phase 8 WorkspaceShell Root Adoption Acceptance

Accepted after parent implementation and review:
- AutomationStudioWorkspaceSurface now owns active-view subscription and breadcrumb resolution while AutomationWorkspaceShell owns panes, tabs, right/bottom regions, drawers, header, resize interaction, and warm-view wake-up.
- All 12 canonical view entries feed the shell through the typed AutomationWorkspaceViewSource; the old root workspace renderer callback, renderer ref, broad render-input array, pane JSX, and timeline renderer are removed.
- Seven unreachable root resize handlers and the detached canvas/mounted-view refs were deleted after the shell switch, reducing AutomationStudioLive.tsx from 2,584 to 2,435 lines.
- Parent shell/view-host/hierarchy gate passed 3 files and 35 tests. Web TypeScript passed before a concurrent Flow Editor worker began its isolated edit; that worker's transient parse state is not part of this accepted workspace step.

Phase status:
- Phase 8 implementation is Complete.
- Empty-project handler timing and browser render-count certification remain in the explicit Phase 0/12 manual gate and do not return workspace ownership to the root.
### 2026-08-28 - Registry-Owned View Composition Checkpoint

Accepted after parent implementation and review:
- Added one registry-backed view-instance factory, including scoped dynamic labels and explicit live-state metadata, so the root no longer duplicates the 12 canonical view definitions.
- Added one typed canonical publisher bundle that preserves the 12 isolated publishers while removing their JSX and ID enumeration from AutomationStudioLive.
- Root canonical ID literals fell from 66 to 44 and the focused registry/view-host gate passed 2 files and 11 tests.
- The root is now 2,433 lines. This advances Phase 10H and Phase 11 without broad publication effects, compatibility events, or a raised architecture exemption.

Phase status:
- Registry-owned view composition is Complete.
- Phase 10H still requires scoped Inspector/root data-port adoption and legacy renderer/Config/Timeline adapter retirement.
### 2026-08-28 - Phase 7 Active-Project SQL Paging Root Acceptance

Accepted after parent review and root wiring:
- AutomationHierarchySurface now subscribes directly to the optional project-scoped pager, merges static/system nodes with bounded SQL pages, forwards exact-parent page metadata and loading, and falls back to current static nodes during project switches.
- One lifecycle hook constructs the browser pager from the typed Program API transport and disposes it on transport lifetime end; AutomationStudioLive passes only the stable controller and active project ID and does not subscribe to paging revisions.
- Parent hierarchy gate passed 3 files and 32 tests. Full web TypeScript reached only an unrelated concurrent ProgramWorkspace edit and reported no hierarchy/root paging errors.

Phase status:
- Phase 7 node routing, selection paint, server pagination, browser transport, root-page activation, and sidebar page wiring are Complete.
- Phase 7 remains In Progress only for hierarchy dialog-store transaction adoption, create/delete command extraction, and deletion of the retired root hierarchy modal/form state.
### 2026-08-28 - Phase 10H Legacy Renderer Retirement Acceptance

Accepted after parent implementation and review:
- Deleted views/legacy-renderer-adapter.tsx and removed AutomationViewRenderer and LegacyAutomationViewRendererAdapterProps from public exports.
- Renderer.tsx is now a tiny typed ViewHost surface; retired saved views continue through ViewHost-owned explicit recovery.
- The focused Renderer/retirement/view-host gate passed 3 files and 14 tests, and the full web TypeScript check passes.

Phase status:
- Phase 10H legacy universal renderer deletion is Complete.
- Phase 10H remains In Progress only for scoped Inspector/root data-port adoption and final Config/Timeline compatibility retirement.

### 2026-08-28 - Typed Flow Editor Communication Boundary Acceptance

Accepted after parent review:
- FlowGraphCanvas and its controller now receive typed focus requests instead of subscribing to Automation Studio CustomEvents.
- ProgramWorkspace no longer bridges mounted-view activation through a global event; its remaining window listener is the local Escape-key drawer close behavior.
- Parent Flow Editor/ProgramWorkspace gate passed 7 files and 29 tests; full web TypeScript passes.

Phase status:
- Phase 10D internal Flow Editor event removal is Complete.
- Root focus-command publication and the residual root dirty/status/problem CustomEvents remain explicit Phase 10I/11 debt and must be replaced by typed ports before final acceptance.
### 2026-08-28 - Root Behavior Guard Migration Acceptance

Accepted after parent review:
- Replaced six source assertions for deleted renderer refs/callbacks with checks for AutomationStudioWorkspaceSurface, typed per-view publication, isolated source revision, warm-view identity, and overlay/workspace separation.
- The root behavior suite passes all 47 tests and the test-file ceiling was tightened.
- Architecture ceilings were lowered to the worker's observed production baseline and remain intentionally exact; the active hierarchy extraction is expected to make them loose, at which point they will be tightened again rather than preserved or raised.

Phase status:
- Phase 10I stale root test migration is Complete.
- Phase 10I production enforcement remains In Progress until all named Phase 7/9/10H/11 debt reaches zero.
### 2026-08-28 - Canonical Status Accuracy Reconciliation

- Corrected Phase 9 from Pending to In Progress because its package is accepted while root adoption is still active.
- Corrected Phase 11 from Pending with prematurely Complete steps to an honest In Progress state: providers and enforcement exist, but composition extraction, temporary export retirement, obsolete-path deletion, and the 250-line root gate are not complete.
- Corrected Phase 12 to In Progress because authored documentation and focused validation are active while final repository-wide test/build/docs/diff gates must be rerun after production work stops.
- No implementation credit is granted by this reconciliation; each remaining step still requires its focused gate and an acceptance log entry.
### 2026-08-28 - Non-Root Architecture Residual Cleanup Acceptance

Accepted after parent review:
- hierarchy/model.ts is a four-line compatibility barrel with unchanged exports and a tightened five-line ceiling.
- Workspace strict-runtime assertions now target WorkspaceShell, typed view sources, responsive drawers, and extracted hierarchy dialog ownership instead of deleted root callbacks.
- The mounted-view compatibility exemption is removed and stale component assertions now require typed activation ownership.
- Parent focused gate passed 15 non-root tests. Architecture enforcement has only two expected root groups red, both because accepted Phase 7 extraction made the exact ceilings loose; no non-root violation remains.

Phase status:
- Phase 10I non-root architecture residual cleanup is Complete.
- Root ceilings will be tightened after the active root extraction reaches a stable checkpoint.
### 2026-08-28 - Mounted-View Typed Activation Acceptance

Accepted after parent review:
- Replaced the global mounted-view CustomEvent/document-query path with a bounded project-lifetime synchronous activation store.
- Pane and right-pane shells provide the store directly; ViewContainer subscribes only to its window key and preserves optimistic tab/body/window paint plus warm mounted identity.
- Cross-project/window collisions are prevented, unused window keys are pruned, and retained entries are capped at eight.
- Parent workspace gate passed 3 files and 18 tests; the forbidden global event/query scan is clean. The remaining querySelectorAll is scoped to the component's own tab strip for keyboard focus.

Phase status:
- Phase 8/10I mounted-view event retirement is Complete.
- Ordinary tab activation no longer performs a browser-global broadcast or document tree scan.
### 2026-08-28 - Phase 12 Authored Architecture Documentation Refresh

Accepted after parent review:
- Updated five authored architecture/operations documents for scoped stores, synchronous shell paint, typed view publication, warm/cold behavior, exact-parent SQL hierarchy paging, bounded Recording previews, and retired renderer/internal event bridges.
- Documentation explicitly distinguishes the accepted overlay package from unfinished root overlay adoption and does not claim the Phase 11 thin root is complete.
- Authored link validation passed 48 files and scoped diff hygiene is clean.
- pnpm docs:check correctly remains Pending because docs/reference/framework-reference.md is stale; generated-reference regeneration is tracked in the final Phase 12 gate.

Phase status:
- Phase 12 authored documentation for the current architecture is Complete.
- Generated reference regeneration and final docs:check remain In Progress.
### 2026-08-28 - Phase 7 Final Root Hierarchy Acceptance

Accepted after parent review:
- AutomationStudioLive now owns only hierarchy composition: one dialog store, one command executor, one paged surface, and explicit dependency ports.
- The 459-line executor revalidates capabilities, rejects duplicate transaction IDs, preserves PIN authorization and every Flow/Subflow/Folder/Recording/object create-delete reconciliation path, and reports failures to the dialog-local transaction.
- Removed root hierarchy modal/form/status state, mutation implementation, and transaction duplication. Root size fell from 2,440 to 2,029 lines.
- Parent acceptance gate passed 4 files and 65 tests; worker hierarchy/root regression passed 120 tests; web TypeScript and scoped diff hygiene pass.

Phase status:
- Every Phase 7 step and gate is Complete.
- The remaining root Modal is Workspace Preferences and belongs exclusively to Phase 9 overlay adoption.
### 2026-08-28 - Phase 12 Generated Reference and Docs Gate Acceptance

- Ran pnpm docs:reference using the repository's deterministic generator.
- Regenerated both framework-reference outputs with 1,363 public declarations.
- pnpm docs:check passes: 48 authored/reference Markdown files have valid local links and the deterministic reference is current.
- Phase 12.10 is Complete.
### 2026-08-28 - Phase 11 Project Gate Surface Acceptance

Accepted after parent review:
- Added a 46-line typed AutomationStudioProjectGate for synchronous deep-link restoration and project catalog states.
- The surface reuses ProjectCatalogSurface and forwards its explicit dependencies/callbacks without duplicating project commands or modal ownership.
- Focused gate passed 3 tests and diff hygiene is clean.

Phase status:
- The non-root project gate is Complete.
- Root branch replacement remains In Progress and will occur after the Phase 9 worker releases exclusive root ownership.
### 2026-08-28 - Phase 9 Final Root Overlay Acceptance

Accepted after parent review:
- One project-lifetime overlay store/controller now owns Workspace Preferences, view adder, layout picker, and development Data Inspector channels.
- Channel-specific dispatchers preserve local typing, atomic duplicate-submit/error state, request-aware close, and project reset without fake Project/Hierarchy dispatchers.
- ProjectCatalogSurface, AutomationHierarchyDialog, and responsive WorkspaceShell drawers retain their separate accepted ownership.
- Deleted root overlay renderer callback/ref/input array, AutomationStudioUiBoundary overlay usage, duplicate Studio UI fields, and all modal/palette/inspector JSX. Root fell from 2,029 to 1,980 lines.
- Parent overlay/root gate passed 6 files and 68 tests; web TypeScript and legacy-owner scan pass.

Phase status:
- Every Phase 9 step and gate is Complete.
### 2026-08-28 - Phase 11 Project Gate Root Adoption Acceptance

Accepted after parent integration:
- Replaced both root project-restoration and no-project catalog JSX branches with AutomationStudioProjectGate.
- Project command/modal ownership remains in ProjectCatalogSurface and loading paint remains synchronous.
- Combined project-gate/root gate passed 2 files and 50 tests. Root fell from 1,980 to 1,946 lines.
- The first full TypeScript attempt reached only concurrent Inspector worker files; no project-gate/root type error was reported.

### 2026-08-28 - Phase 10F Recording Timeline Compatibility Retirement

Accepted after parent integration:
- Root now imports RecordingActionPreviewDock directly from the Recording domain.
- Deleted views/TimelineDock.tsx and its barrel export; removed the ignored selectedRecording compatibility prop.
- Memoized preview projection reuses sorted indexes and renders a maximum 200-entry window even for 100,000 source entries.
- Parent Recording/Timeline/project-gate/root gate passed 7 files and 84 tests; the compatibility scan finds only the assertion that the retired file is absent.

Phase status:
- Phase 10F Recording timeline ownership and compatibility retirement are Complete.
- Phase 10F still awaits canonical scoped Inspector adoption and Recording/Client transport injection review.
### 2026-08-28 - Phase 10F Canonical Scoped Inspector Acceptance

Accepted after parent integration:
- Typed host registry now renders the canonical Inspector domain component.
- Root publishes one memoized InspectorPanelContext plus onOpenState/onUpdateEditorNodeSelection commands instead of project-wide policy, Recording, Timeline, runtime-session, signal, node-definition, and pipeline arrays.
- Canonical model identity is cached by scoped context, all panel kinds and editor-node edits remain covered, and State detail navigation remains explicit.
- Deleted views/InspectorView.tsx, LegacyInspectorProps, LegacyInspectorPanelContext, legacy-inspector-context.ts, and the legacy State panel adapter.
- Parent Inspector/typed-host/root gate passed 8 files and 76 tests; full web TypeScript and legacy ownership scan pass.

Phase status:
- Phase 10F Recording, Inspector, Client, Timeline, and Shared ownership is functionally Complete.
- Final legacy Config host reachability/retirement is the remaining Phase 10F compatibility gate.
- Phase 10H scoped Inspector and legacy universal renderer adoption is Complete; final legacy Config registration cleanup remains tracked by Phase 10B/10F.
### 2026-08-28 - Final Phase 10F/11 Workers Assigned

Under parent supervision:
- Legacy Config retirement worker owns only Config/view-registry compatibility and must prove deterministic Flow Settings migration or explicit recovery before deletion.
- Phase 11 worker has exclusive root/live composition ownership and must deliver the hard 250-line root, <=40-line root functions, bounded ownership modules, typed event replacement, and no replacement mega component.
- Parent retains plan updates, architecture-budget tightening, integration review, repository-wide validation, and manual-browser limitation reporting.
### 2026-08-28 - Phase 11 Intermediate Root Move Rejected Pending Decomposition

Oversight checkpoint:
- AutomationStudioLive.tsx is temporarily a four-line client entrypoint.
- The moved AutomationStudioComposition.tsx is approximately 89 KB and remains the same oversized responsibility owner; this does not satisfy Phase 11 and receives no completion credit.
- The worker was directed to continue splitting project data/lifecycle, selection/navigation, domain commands, view inputs, workspace composition, and external effects into bounded owners, with no file over 700 lines and no replacement hook/component over 600.
- Architecture ceilings remain unchanged until the bounded production structure is complete.
### 2026-08-28 - Legacy Config Retirement and Phase 10F Final Acceptance

Accepted after parent review:
- Removed the Config host registration/binding/imports and deleted legacy/config.
- Persisted config and config-default IDs migrate to Flow Settings only when Flow context exists; without Flow context they render explicit retired-view recovery. Unrelated unknown IDs remain unknown.
- Parent registry/host/retirement/hierarchy/layout gate passed 6 files and 45 tests; worker focused gate passed 57 tests. Config host absence scan contains only assertions proving removal.
- Phase 10B.6 persisted Config migration is Complete.

Phase status:
- Every Phase 10F ownership and compatibility gate is Complete.
- Phase 10B remains In Progress only for its broader canonical component-name/source vocabulary gate.

### 2026-08-28 - Canonical Status and Phase 11 Integration Checkpoint

Parent reconciliation corrected stale canonical headers for accepted Hierarchy, Workspace extraction, Overlays, and Phase 10F work. Browser-only timing and interaction certification remains explicitly owned by Phase 0 and Phase 12 rather than keeping completed source-extraction phases ambiguous.

Phase 11 is not yet accepted:
- The thin entry root is 34 lines and the extracted composition is 572 lines; all newly extracted production modules are below 600 lines.
- Root scans find no Program API ownership, project collection scans, modal/pane/hierarchy/graph/timeline JSX, browser storage, or mutation CustomEvent channels.
- Flow Editor problem navigation uses a typed focusRequest contract.
- Parent review rejected acceptance while stale root source-inspection tests and architecture debt exemptions remain.

Integration validation:
- Parent web type check caught and contained one failed mechanical naming edit in runtime/runtime-views.test.tsx before acceptance.
- The test was narrowly restored to canonical RuntimeDebugView, FlowRunView, RunHistoryProductView, and FlowRunProductView symbols.
- pnpm --filter @fluxiq/web check passes after that repair.
- The combined root/architecture gate currently has 32 passing and 27 failing tests; repair streams are assigned for owner-specific behavior tests, raw-view-ID centralization, URL/event ownership, stale debt removal, and domain naming verification.

### 2026-08-28 - Phase 10I Root Behavior Test Decomposition Accepted

Accepted after parent review:
- AutomationStudioLive.test.ts was reduced from 809 to 454 lines and now covers the thin root public behavior and exported pure contracts.
- Added live/automation-studio-live-ownership.test.ts at 271 lines for extracted owner boundaries.
- Preserved 47 total cases and restored explicit subflow ownership and typed resource-scoped mutation notification coverage.
- Parent review confirmed the moved cases target their actual owner modules rather than weakening or deleting stale root assertions.
- Worker validation passed both files with 47 tests; git diff --check passed.

Plan reference: Phase 10I test structure and architecture enforcement, plus Phase 11 public behavior coverage. Phase 11 remains In Progress until architecture contracts and full integration gates pass.

### 2026-08-28 - Phase 10I Architecture and Phase 11 Source Gates Accepted

Accepted after parent validation:
- Canonical view IDs in live composition now come from the typed automationStudioViewId owner; raw IDs no longer leak across six live modules.
- Added live/useAutomationBrowserEntry.ts and removed URL/search-parameter ownership from useAutomationStudioFoundation.ts.
- Removed stale AutomationStudioLive and deleted Inspector debt exemptions.
- Architecture enforcement now has debt-free root limits: 250 root lines, 40 lines per root function, zero root Program API/state/JSX ownership, a hard 700-line production ceiling, and a hard 900-line test ceiling.
- Forbidden global action channels and raw canonical IDs are absent from scoped live production files.
- Parent gate passed: architecture-contract.test.ts 14/14 and live/automation-studio-live-ownership.test.ts 27/27 (41 total).

Plan reference: Phase 10I enforcement implementation is accepted. Phase 11 source limits are accepted, but Phase 11 remains In Progress until temporary root re-exports are removed and the full naming/integration suites pass.

### 2026-08-28 - Phase 10A Hierarchy Command Budget Accepted

Accepted after parent validation:
- hierarchy/command-executor.ts was reduced from 459 lines to a 63-line stable facade.
- Create and delete command ownership moved to create-command-executor.ts and delete-command-executor.ts with shared command contracts/support separated by responsibility.
- Added explicit subflow-creation and recording-deletion coverage.
- Parent hierarchy gate passed command-executor, Phase 7 contracts, and hierarchy architecture suites: 3 files, 16 tests.

Plan reference: Phase 10A command/repository ownership budget and Phase 7 command testability are complete for the hierarchy executor.

### 2026-08-28 - Phase 11.2-11.4 Thin Root Accepted

Accepted after parent implementation and validation:
- AutomationStudioLive.tsx is now a four-line client facade that exports only AutomationStudioComposition as AutomationStudioLive.
- The public behavior suite imports pure helpers directly from live-helpers, project-summary-converters, project-change-reconciliation, timeline-resolution, and workspace-persistence.
- No temporary helper re-export remains in the root.
- Retargeted the subflow hydration ownership assertion to hierarchy/create-command-executor.ts after the accepted hierarchy split; the behavioral guarantee is unchanged.
- Parent gate passed AutomationStudioLive public behavior, live ownership, and architecture contracts: 3 files, 61 tests.

Plan reference: Steps 11.2, 11.3, and 11.4 are Complete. Step 11.5 remains In Progress pending full integration and residual-path scans.

### 2026-08-28 - Phase 10B, 10D, and Integrated Studio Gate Accepted

Accepted after parent validation:
- Canonical component vocabulary is complete across Router, Subflows, Instructions, Adaptations, Problems, Runtime, Settings, Recording, Inspector, Clients, Flow Editor, and State. Generic ProductView implementation names were replaced with domain-owned ViewContent names while canonical public view names remain stable.
- Retired WorkspaceViews, GraphEditorViews, StateView, legacy state view-model, legacy Inspector/Timeline/Proposal views, and legacy Config paths are absent.
- Persisted IDs and aliases remain owned by the typed registry/migration layer. The only AutomationStateViewRequest matches are legitimate State command contracts.
- Flow Editor controller ownership was split into graph document, selection, commands, canvas interaction, and palette hooks. The controller facade is 32 lines; extracted production modules are each below 600 lines and the primary stateful owners meet the 300-line target or are bounded at 306 lines.
- live/domain-commands.ts was reduced from 461 to 343 lines; Recording and State command ownership moved to recording-domain-commands.ts and state-domain-commands.ts with API/budget tests.
- Parent web TypeScript check passed.
- Parent integrated Automation Studio suite passed: 140 files, 721 tests.

Plan reference: Phase 10B is Complete. Phase 10D implementation is Complete, with browser timing certification retained in Phase 0/12. Phase 10H typed registry/host is Complete. Phase 10I and Phase 11 remain open only for final residual and repository-wide gates.

### 2026-08-28 - Phase 10A Router View Budget Accepted

Accepted after parent validation:
- router/RouterView.tsx was reduced from 392 to 204 lines and retains state/command orchestration.
- Added router/RouterContentView.tsx at 245 lines for the presentational surface.
- Both the 350-line domain-entry and 250-line presentational targets now pass without an exception.
- Parent Router suite passed: 2 files, 13 tests.

Plan reference: Phase 10A file-size and ownership budgets are complete for Router.

### 2026-08-28 - Final Residual Audit Reopened Incomplete Gates

A parent-supervised read-only audit found remaining implementation debt after the green Automation Studio suite. Canonical statuses were corrected rather than relying on the earlier acceptance log:
- Phase 10A remains In Progress: root types.ts and the generic controllers layer still mix domain ownership; taxonomy enforcement and several preferred budgets remain.
- Phase 10B is reopened: SubflowsProductView remains, raw canonical ID allowances remain outside registry/migration owners, and Flow implementation vocabulary still uses Policy as a synonym in several editor symbols.
- Phase 10D structural decomposition is accepted, but FlowGraphCanvas and useFlowEditorCommands remain slightly above preferred targets and Flow implementation naming remains.
- Phase 10H typed host behavior is accepted, but adding a view still requires coordinated edits across registry, host types, bindings, live contracts, and publishers rather than one typed definition.
- Legacy Routine still owns a mutable CustomEvent selection channel and must become read-only/typed or be retired.
- Root hard limits remain green; Phase 11 stays In Progress until controller/type/legacy compatibility residue is removed.
- Browser-only certification remains tracked in Phase 0/12.

Assigned next closures: CSS manifest-aware contract tests, Routine retirement, Subflows naming, Instructions entry budget, followed by root-type/controller migration and registry/raw-ID consolidation.

### 2026-08-28 - Phase 10A Instructions View Budget Accepted

Accepted after parent validation:
- instructions/InstructionsView.tsx was reduced from 361 to 296 lines.
- Added InstructionWorkbenchPanels.tsx at 97 lines with separate library, editor, and effective-instruction panels.
- Public exports and behavior remain stable; tests target the new component owners.
- Parent Instructions suite passed: 3 files, 12 tests, including the large-project behavior fixture.

Plan reference: Phase 10A file-size and ownership budgets are complete for Instructions.

### 2026-08-28 - Phase 10B Subflows Naming Accepted

Accepted after parent validation:
- Renamed SubflowsProductView to SubflowDirectoryContent and SubflowsProductViewProps to SubflowsViewProps.
- Public SubflowsView behavior and registry API remain stable.
- Parent Subflows suite passed: 3 files, 10 tests.
- Parent source scan found no remaining old SubflowsProductView symbols in apps/web/src.

Plan reference: the Subflows portion of Phase 10B is Complete. Phase 10B remains In Progress for Flow vocabulary and raw canonical-ID centralization.

### 2026-08-28 - Phase 10I CSS Contract Ownership Accepted

Accepted after parent validation:
- Added a recursive CSS manifest test reader that resolves nested local imports in order, retains external imports, and detects cycles.
- Responsive, motion, surface, geometry, and typography contracts now inspect the owned stylesheet graph instead of assuming globals.css contains every selector directly.
- No domain CSS was moved back into globals.css.
- Parent CSS contract gate passed: 5 files, 11 tests.

Plan reference: Phase 10I styling ownership and source-contract coverage are restored.

### 2026-08-28 - Legacy Routine Mutation Path Retired

Accepted after parent validation:
- Deleted the unused mutable Routine React Flow editor and graph model.
- Deleted the global Routine selection CustomEvent channel.
- Persisted Routine tabs continue to recover through the existing read-only typed host.
- Removed Routine action-channel debt allowances and added architecture enforcement that the retired editor/channel remain absent.
- Parent architecture, Flow Editor, and view-host gate passed: 16 files, 83 tests.
- Parent production scan found no AutomationRoutineView, selection-channel, or automation-studio:selection residue.

Plan reference: Phase 10D legacy isolation and Phase 11 obsolete compatibility cleanup are complete for Routine.

### 2026-08-28 - Phase 10A Root Type Bucket Retired

Accepted after parent validation:
- Deleted automation-studio/types.ts after migrating all consumers.
- View persistence/instances now live in views/view-types.ts; selection contracts in shared/selection-contracts.ts; Flow node/palette contracts in flow-editor; Inspector widgets in inspector; Recording status in recordings; Settings extension contracts in settings.
- Removed obsolete Routine node contracts and retired Proposal selection variants.
- Architecture enforcement now explicitly prevents recreation of root types.ts.
- Parent web TypeScript check passed. Root public behavior, live ownership, and architecture contracts passed: 3 files, 61 tests.
- Parent source scan found no root types file or direct imports.

Plan reference: the root generic-types portion of Phase 10A and obsolete compatibility portion of Phase 11 are Complete.

### 2026-08-28 - Proposal and Config Style Retirement Accepted

Accepted after parent validation:
- Removed dead 03-proposal-editor.css and 04-legacy-config.css imports from globals.css.
- Preserved active 08-view-workspaces.css rules used by seven current views.
- Preserved active run-workspace header rules still located in 02-proposals.css; a follow-up ownership rename/move is required before deleting that legacy filename.
- Added style retirement enforcement and updated style architecture contracts to distinguish active ownership from retired styles.
- Production source scan confirms retired Proposal, Config, Routine, Evidence, Pipeline, and embedded graph selectors are absent from TS/TSX.
- Parent style/CSS gate passed: 7 files, 19 tests.

Plan reference: Phase 10I dead-style retirement is accepted. Phase 10A/10B retain one follow-up to move active run-workspace rules out of the legacy Proposal-named stylesheet.

### 2026-08-28 - Generic Controller Layer Retired

Accepted after parent validation:
- Deleted the entire automation-studio/controllers directory and removed all imports.
- Hierarchy, Flow, Runtime status, Recording, Runtime project, State project, and selection hooks now live in their domain/store owners.
- UI cache ownership moved to workspace/cache behind a narrow AutomationStudioUiCachePort.
- Hierarchy UI contracts and normalization remain hierarchy-owned, avoiding workspace/cache dependency cycles.
- live/useAutomationStudioFoundation.ts now composes domain owners directly.
- Architecture enforcement prohibits recreating the controller directory or imports.
- Parent web TypeScript check passed. Architecture, workspace cache, and live ownership gates passed: 3 files, 48 tests.
- Worker full Automation Studio suite passed: 141 files, 724 tests.

Plan reference: Phase 10A controller disposition is Complete. The controller/obsolete-hook portion of Phase 11.5 is Complete; registry/raw-ID and remaining compatibility cleanup still keep Phase 11 In Progress.

### 2026-08-28 - Legacy Proposal Stylesheet Fully Retired

Accepted after parent validation:
- Moved active run-workspace header rules from 02-proposals.css to styles/runtime/03-runs-workspace.css.
- Removed the legacy import and deleted 02-proposals.css.
- Preserved active workspace/08-view-workspaces.css ownership.
- Style architecture/retirement tests prevent the legacy Proposal stylesheet from returning.
- Parent style/CSS gate passed: 7 files, 20 tests; the legacy file is absent.

Plan reference: the remaining Proposal-era style ownership item in Phase 10A/10B is Complete.

### 2026-08-28 - Phase 10D Flow Vocabulary and Budget Closure Accepted

Accepted after parent supervision and validation:
- Renamed Flow Editor implementation concepts from Policy to Flow while preserving explicit framework Policy contracts, persisted `policy` document fields, `policyNode` renderer compatibility, and deprecated public aliases.
- Added the canonical Flow graph model with a narrow Policy compatibility facade.
- Split Flow graph toolbar, status, and clipboard command ownership into focused modules.
- Reduced FlowGraphCanvas.tsx from 281 to 225 lines and useFlowEditorCommands.ts from 306 to 239 lines, bringing both under their Phase 10A targets.
- Updated source-contract tests to follow the extracted owners while preserving fit, save/recovery, keyboard, pointer, durable/transient update, and validation guarantees.
- Parent focused gate passed: 4 discovered files, 25 tests. Worker TypeScript and focused Flow Editor gates also passed.

Plan reference: Phase 10D implementation is Complete. Its remaining browser-only interaction timing evidence is owned by Phases 0 and 12 rather than keeping decomposition open.
### 2026-08-28 - Phase 10B, 10G, and 10H Registry/Navigation Closure Accepted

Accepted after parent supervision and validation:
- Consolidated all twelve canonical views into one typed definition source containing canonical IDs, aliases, metadata, availability, lifecycle/cache policy, functionality metadata, and host adapters.
- Canonical Flow Editor ID is `flow-nodes`; persisted `policy-primary` remains a migration alias only.
- Host registrations, publisher input maps, host kinds, view contracts, and IDs are inferred from definitions rather than handwritten parallel lists.
- Canonical components resolve only at render time, preventing circular initialization from freezing an undefined component; the prior React memo warning is absent.
- Registry, alias, and host-registration maps initialize lazily once and remain constant-time after first use.
- Retired view replacement values are isolated from component-bearing definitions, preserving cycle-free Runtime formatting and migration recovery.
- Removed the final raw canonical-ID, cross-domain private-import, and ordinary-view URL-state debt exemptions.
- Runtime readiness and post-run Adaptation actions now use typed workspace commands; selected Adaptation detail is stored in per-view workspace state and restores without browser routing.
- Updated canonical ID, Proposal retirement, summary conversion, Problems architecture, and Flow functionality contracts to the definition-driven model.
- Parent web TypeScript check passed. Parent full Automation Studio suite passed: 141 files, 727 tests.

Plan reference: Phase 10B is Complete, Phase 10G implementation is Complete, and Phase 10H is Complete. Browser-only behavior/timing certification remains in Phase 12.
### 2026-08-28 - Phase 10A, 10I, and 11 Structural Closure Accepted

Accepted after parent supervision and validation:
- Added an executable, closed top-level Automation Studio directory allowlist and recorded every intentional infrastructure owner and preferred-budget exception.
- Deleted the unreferenced `evidence/` and `timeline/` compatibility models plus the empty `legacy/` hierarchy.
- Deleted the unreferenced Proposal editor and legacy Config stylesheets and strengthened retirement tests to require their absence.
- Extracted typed Adaptation workspace navigation from composition; AutomationStudioComposition.tsx is 587 lines and the focused hook is 49 lines.
- Extracted AdaptationChangeCard/AdaptationTargetAction presentation ownership; AdaptationsView.tsx is 337 lines and AdaptationChangeCard.tsx is 41 lines.
- AutomationStudioLive.tsx remains a three-line client facade, all production files remain below the 700-line hard ceiling, and no generic controller or root type bucket exists.
- Parent web TypeScript check passed. Parent taxonomy/composition/style gate passed 5 files and 58 tests; parent Adaptations/architecture gate passed 4 files and 26 tests.

Plan reference: Phase 10A is Complete, Phase 10I is Complete, Phase 11 is Complete, and the Phase 10 umbrella is Complete for implementation. Phase 12 now owns final repository validation and browser-only certification.
### 2026-08-28 - Phase 12 Final Web Suite Acceptance

Accepted after parent-supervised integration validation:
- The complete web suite passed in a deterministic single-worker run: 167 files and 815 tests.
- Unbounded and two-worker runs exposed a Windows Vitest/tinypool worker-process exit after otherwise passing tests; the bounded command removed the runner instability without skipping or filtering tests.
- The accepted command was `pnpm --filter @fluxiq/web exec vitest run --passWithNoTests --maxWorkers=1 --minWorkers=1 --fileParallelism=false`.
- No source repair was required: the initially reported Settings parser error did not reproduce in isolation or in the accepted full run, and a byte-level/newline-token scan was clean.

Plan reference: Phase 12.6 remains Complete with a final post-integration full-suite result. Repository-wide validation continues with Phase 12.8 through 12.11.
### 2026-08-28 - Phase 12 Repository Check Re-Acceptance

Accepted after final integration:
- `pnpm check` passed across all four checked workspace projects.
- Web, contracts, client-gateway-websocket, and framework TypeScript checks completed without errors.

Plan reference: Phase 12.7 remains Complete with a final post-integration repository-wide result. Phase 12.8 is next.
### 2026-08-28 - Phase 12 Repository Test Gate Findings

The first final `pnpm test` run remains unaccepted and Phase 12.8 stays In Progress:
- Three framework Runtime service tests exposed adaptation-application compatibility regressions: existing service fixtures were routed into graph transactions before their target nodes or non-graph `create_subflow` patch path were available.
- One legacy object-index migration test exceeded its five-second timeout and then hit an `EBUSY` SQLite cleanup lock.
- These failures are being treated as integration defects, not waived. Separate supervised workers own disjoint Runtime adaptation and SQLite lifecycle fixes; the parent will review focused results and rerun the repository gate.

Plan reference: Phase 12.8 remains In Progress until all repository tests pass.
### 2026-08-28 - Phase 12 SQLite Test-Lifecycle Fix Accepted

Accepted after worker implementation and parent review:
- Legacy object-index migration tests now use a unique OS temporary root per test.
- The database pool is fixture-owned and always closes before recursive cleanup, removing cross-run path collisions and live-handle deletion races without increasing the timeout.
- Production migration closure was reviewed and already releases its repository in `finally`.
- Worker stress validation passed 20/20 runs; parent focused validation passed 1 file and 2 tests in 311 ms.

Plan reference: the SQLite blocker recorded under Phase 12.8 is resolved. The Runtime adaptation blocker remains under review before the repository test gate can be accepted.
### 2026-08-28 - Phase 12 Runtime Adaptation Compatibility Fix Accepted

Accepted after worker implementation and parent review:
- Typed SQL graph application now requires both a graph-compatible patch set and a materialized graph revision.
- Monolithic Flow and structural patches continue through the existing durable service mutation/rollback path; direct typed-store graph transactions remain active and covered.
- Typed reconstruction preserves proposal identity and manual-approval metadata, while created-subflow rollback now tombstones its SQL projection and emits the deletion feed event.
- The Runtime service test fixture now registers every service instance and closes its database pools before deleting shared test storage, addressing the timeout-to-`EBUSY` cascade at its source.
- Parent framework TypeScript passed; direct typed adaptation-store validation passed 5/5; the three original Runtime regressions passed 3/3.

Plan reference: the Runtime adaptation blocker under Phase 12.8 is resolved at focused scope. Full Runtime and repository test gates remain to be rerun before Phase 12.8 is Complete.
### 2026-08-28 - Phase 12 Runtime Service Lifecycle Acceptance

Accepted after parent full-file validation:
- Every Runtime service test now receives an isolated OS temporary root.
- All 91 service constructions in the suite are fixture-registered; both owned database pools close before storage cleanup.
- No timeout budget was increased.
- The complete Runtime service file passed: 86/86 tests in 45.09 seconds, including scale, change-feed, adaptation, runtime, and canonical Flow persistence cases.
- The previous timeout-to-`EBUSY` cascade is absent.

Plan reference: Runtime service lifecycle validation is Complete. Phase 12.8 returns to the repository-wide test gate.
### 2026-08-28 - Phase 12 Repository Test Gate Rerun 2

The second `pnpm test` run remains unaccepted and Phase 12.8 stays In Progress:
- The previously failing Runtime adaptation, Runtime service lifecycle, and legacy object-index migration suites passed under repository concurrency.
- One remaining fixed-path SQLite fixture in `project-event-stream-writer.test.ts` timed out under concurrent package load and cascaded into two `EBUSY` cleanup failures.
- The failure has the same diagnosed lifecycle shape and is being corrected with explicit store/pool ownership and isolated temporary storage rather than waived.

Plan reference: Phase 12.8 remains In Progress with one bounded storage-test lifecycle correction remaining.
### 2026-08-28 - Phase 12 Event-Stream Test Lifecycle Fix Accepted

Accepted after parent implementation and focused validation:
- Event-stream integration tests now use unique OS temporary roots and a fixture-owned database pool that closes before cleanup.
- The three SQLite integration cases have an explicit 15-second harness timeout so repository concurrency cannot cancel active database work at Vitest's generic five-second default; product sequencing and lease assertions are unchanged.
- Parent framework TypeScript passed and the focused suite passed 3/3 in 377 ms.

Plan reference: the final known storage-test lifecycle blocker under Phase 12.8 is resolved. The repository test command is being rerun for acceptance.
### 2026-08-28 - Phase 12 Framework Test Harness Acceptance

Accepted after parent package-wide validation:
- Added a framework Vitest configuration with 15-second test and hook ceilings for the package's SQL- and filesystem-heavy integration workload.
- This replaces the unsuitable generic five-second cancellation limit; explicit hierarchy, graph, stream, and UI performance assertions remain the product budgets.
- Event-stream fixture isolation remains in place while its timeout is centralized in package configuration.
- The complete framework suite passed: 80 files and 482 tests.

Plan reference: framework package testing is Complete. Phase 12.8 awaits the final standard `pnpm test` repository result.
### 2026-08-28 - Phase 12 Repository Test Gate Accepted

Accepted after corrective integration work and parent rerun:
- Standard `pnpm test` completed successfully across web, contracts, client gateway, and framework workspaces.
- The framework suite passed 80 files and 482 tests under repository concurrency.
- The accepted web integration result remains 167 files and 815 tests; the standard repository run also completed the web package successfully.
- Runtime adaptation compatibility, service/pool shutdown, isolated SQLite fixtures, and the framework integration timeout are all covered by the accepted run.

Plan reference: Phase 12.8 is Complete. Phase 12.9 production build validation is next.
### 2026-08-28 - Phase 12 Production Build Gate Accepted

Accepted after parent repository build:
- `pnpm build` passed for contracts, framework, client gateway, and web.
- Next.js Turbopack compiled successfully, completed type validation, generated all 15 static pages, finalized route optimization, and emitted the dynamic program workspace route.
- No shared Next output lock blocked the final run.

Plan reference: Phase 12.9 is Complete. Documentation and diff-integrity reruns remain.
### 2026-08-28 - Phase 12 Generated Reference Refresh

The first final docs check correctly detected a stale generated framework reference after the integration surface changed.
- `pnpm docs:reference` regenerated both reference copies from 1,363 public declarations.
- Authored-link validation had already passed across 48 authored/reference Markdown files.
- Phase 12.10 remains subject to the immediate post-regeneration `pnpm docs:check` rerun.

Plan reference: generated reference refresh is Complete; documentation gate acceptance is next.
### 2026-08-28 - Phase 12 Documentation Gate Re-Accepted

Accepted after generated-reference refresh:
- `pnpm docs:check` passed.
- Local links validated across 48 authored/reference Markdown files.
- The deterministic framework reference is current at 1,363 public declarations.

Plan reference: Phase 12.10 and Phase 12.12 are Complete with final post-integration evidence. Phase 12.11 diff integrity is next.
### 2026-08-28 - Phase 12 Automated Completion and Final Reconciliation

Accepted final automated evidence:
- `pnpm check` passed across web, contracts, client gateway, and framework.
- The deterministic full web suite passed 167 files and 815 tests.
- Standard `pnpm test` passed across the repository; the framework package passed 80 files and 482 tests.
- `pnpm build` passed every package and the optimized Next.js production build.
- `pnpm docs:check` passed 48 authored/reference files and the regenerated 1,363-declaration framework reference.
- `git diff --check` passed, literal newline-token scans were empty, and generated test artifacts were removed.
- Every implementation, decomposition, ownership, migration, test, build, and authored-documentation phase is Complete.

Remaining external certification:
- Repository instructions prohibit the agent from starting the web panel.
- Phase 0 and Phase 12 therefore retain only the explicitly manual browser baseline, interaction timing, heap, responsive-layout, and visual behavior capture.
- No browser budget is recorded as passing without execution.

Plan reference: Phase 12 is Complete for automated validation and documentation. The plan is Implementation Complete; only the documented browser-only certification run remains pending.
