# Automation Studio Architecture and Live Refactor Working Plan

Status: Planned. No implementation phase is complete.
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

Status: Pending.

0.1 Record the 4,606-line inventory and current module dependencies.
0.2 Preserve all unrelated dirty-worktree changes.
0.3 Add an empty-project fixture: one project, one empty Flow, no other data.
0.4 Add render counters for root, workspace, hierarchy, pane, overlay, and selection boundaries.
0.5 Capture project-open, hierarchy click, folder toggle, warm/cold tab, overlay typing, graph selection, resize, and project-close behavior.
0.6 Record baseline render counts, handler timing, tests, and build state.
0.7 Add source-contract tests that tighten as responsibilities leave the root.

Gate:

- Reproducible baseline exists.
- Existing behavior is protected.
- Results are recorded here before Phase 1.

## Phase 1 - Pure Helper Extraction

Status: Pending.

1.1 Move summary converters to model/project-summary-converters.ts.
1.2 Move merge and change-feed functions to model/project-change-reconciliation.ts.
1.3 Move timeline/state resolution to model/timeline-resolution.ts.
1.4 Move workspace persistence/equality to model/workspace-persistence.ts.
1.5 Move URL and compact parsing helpers to navigation/live helpers.
1.6 Move only truly shared formatters to shared modules.
1.7 Temporarily re-export tested public helpers from AutomationStudioLive.tsx.
1.8 Move tests beside each new owner.

Gate:

- No pure conversion, merge, timeline, persistence, or formatting algorithm remains in the root.
- Pure modules import no React.
- Focused tests and web type check pass.
- This document lists moved symbols and results.

## Phase 2 - Derived Model and Indexes

Status: Pending.

2.1 Build stable indexes for Flow, task, recording, timeline, proposal, and hierarchy relations.
2.2 Add selectors for selected Flow/runnable Flow/task/proposal/recording/timeline/policy/node.
2.3 Add selectors for Flow scope, hierarchy nodes, breadcrumbs, graph input, and problems.
2.4 Move title and selection-to-entity logic to views/view-model.ts.
2.5 Move hierarchy generation to hierarchy/hierarchy-model.ts.
2.6 Run graph conversion only in graph subscribers.
2.7 Test reference identity after unrelated updates.

Gate:

- No project-wide ad hoc scans remain in the root.
- Workspace/UI changes execute no graph conversion.
- Selector identity tests pass.
- This document records the selector ownership map.

## Phase 3 - Scoped Stores

Status: Pending.

3.1 Add project catalog store.
3.2 Add normalized project data store with scope/entity revisions.
3.3 Add selection store.
3.4 Move narrow drawer state to workspace/UI ownership.
3.5 Move workspace save status out of root React state.
3.6 Add runtime status store.
3.7 Align current workspace and Studio UI stores to the topology.
3.8 Add selector-aware useSyncExternalStore helpers.
3.9 Add atomic transaction helpers.
3.10 Remove old controller state in the same step as each migration.

Gate:

- UI, selection, project data, and layout have separate owners.
- No-op writes do not publish.
- Selection does not notify layout/overlay subscribers.
- UI form fields do not notify project-data subscribers.

## Phase 4 - Project Lifecycle

Status: Pending.

4.1 Extract project catalog loading.
4.2 Extract project/category CRUD and move commands.
4.3 Move project modal fields to local/Studio UI ownership.
4.4 Extract summary/cache hydration.
4.5 Extract project open/close lifecycle.
4.6 Publish active project and loading shell before requests.
4.7 Make deep-link restoration a one-time adapter.
4.8 Cancel project-scoped requests/subscriptions before clear.
4.9 Test cancellation, failure, and rapid project switching.

Gate:

- Root performs no project API request.
- Open/close are named commands.
- Project modal typing does not render workspace.
- Shell paint does not wait for hydration.

## Phase 5 - Synchronization and Cache

Status: Pending.

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

Status: Pending.

Flow:

6.1 Extract detail and node-definition loaders.
6.2 Extract run-current-Flow.
6.3 Extract draft restore/discard/update/persist/save.
6.4 Extract publish/deprecate.
6.5 Extract subflow editor resolution.

Recording:

6.6 Extract create/finalize/normalize/update/delete.
6.7 Extract note/marker.
6.8 Extract recording/proposal cleanup transaction.
6.9 Extract stopped-gateway monitoring.

State:

6.10 Extract state-view and index resolution.
6.11 Publish loading/selection before detail work.

Gate:

- Root contains no Flow, recording, proposal, state, or runtime API call.
- Commands test success, failure, cancellation, and stale project.
- Commands use current store snapshots, not render closures.

## Phase 7 - Hierarchy

Status: Pending.

7.1 Extract AutomationProjectHierarchySidebar component.
7.2 Keep search/filter/expansion/focus/primary row local or hierarchy-UI owned.
7.3 Extract node-to-view and node-to-selection rules.
7.4 Extract all create/delete hierarchy commands.
7.5 Use one atomic dialog transaction per action.
7.6 Paint row highlight/view activation before domain selection work.
7.7 Memoize rows and retain server pagination for large sibling sets.
7.8 Add keyboard, menu, selection, deletion, and large-tree tests.

Gate:

- No hierarchy mutation or hierarchy JSX remains in root.
- Folder toggles and row highlights do not render root.
- Hierarchy commands test without mounting Studio.

## Phase 8 - Workspace

Status: Pending.

8.1 Extract view-open, pane-choice, warm activation, add/close/move tab, right-tab, and layout commands.
8.2 Extract pointer/keyboard resize helpers.
8.3 Extract pane area.
8.4 Extract timeline dock.
8.5 Extract header and breadcrumbs.
8.6 Extract full workspace shell.
8.7 Extract responsive drawers.
8.8 Subscribe components directly to workspace selectors.
8.9 Remove root render callbacks and renderer refs.
8.10 Test warm view identity and subscriber isolation.

Gate:

- No pane, tab, resize, header, drawer, or timeline JSX remains in root.
- Workspace interactions use no root React state.
- Empty-project budgets pass.

## Phase 9 - Overlays

Status: Pending.

9.1 Extract AutomationStudioOverlays.
9.2 Split project, hierarchy, preferences, view-adder, layout, and inspector subscribers.
9.3 Give each overlay only required selectors.
9.4 Keep typing local.
9.5 Dispatch commands on confirmation with command-specific progress.
9.6 Remove root overlay render-input arrays.

Gate:

- No modal/palette JSX remains in root.
- Open/typing renders no workspace, hierarchy, or root.
- Overlay tests and budgets pass.

## Phase 10 - View Registry and Adapter

Status: Pending.

10.1 Move static definitions to views/view-registry.ts.
10.2 Move availability rules into registry.
10.3 Build scoped view-renderer adapters.
10.4 Split adapters by view family before any becomes a new monolith.
10.5 Keep sleep/activity ownership in the view host.
10.6 Prevent hidden view prop rebuilds from unrelated selection.
10.7 Remove renderViewContent from root.

Gate:

- New views register without editing root.
- Root does not know every view prop.
- Hidden-view render counts stay unchanged.

## Phase 10A - Automation Studio File Taxonomy

Status: Pending.

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

### Completion Gate

- Taxonomy and dependency rules are represented by source architecture tests or lint rules.
- Existing files have an approved destination map.
- No new dumping-ground filename is introduced.
- This document records exceptions explicitly.

## Phase 10B - Naming and Product Vocabulary Migration

Status: Pending.

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

10B.6 Stable persisted view IDs are migrated through a typed registry alias table. Do not break saved layouts by renaming raw IDs in place.

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

Status: Pending.

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

Status: Pending.

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

Status: Pending.

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

Status: Pending.

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

Status: Pending.

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

Status: Pending.

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

Status: Pending.

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

Status: Pending.

11.1 Add providers for store lifetime and project disposal.
11.2 Add AutomationStudioComposition.
11.3 Reduce AutomationStudioLive.tsx to client boundary, current-user input, providers, and composition.
11.4 Remove temporary re-exports after consumer migration.
11.5 Delete obsolete hooks, refs, queues, effects, and compatibility paths.
11.6 Add automated architecture tests.

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

Status: Pending.

12.1 Run focused helper/store/selector tests.
12.2 Run lifecycle/sync/command tests.
12.3 Run hierarchy/workspace/overlay isolation tests.
12.4 Run renderer/graph tests.
12.5 Run pnpm --filter @fluxiq/web check.
12.6 Run pnpm --filter @fluxiq/web test.
12.7 Run pnpm check.
12.8 Run pnpm test.
12.9 Run pnpm build when the shared Next output is unlocked.
12.10 Run pnpm docs:check.
12.11 Run git diff --check.
12.12 Update authored Automation Studio architecture docs.

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

## Progress Log

### 2026-08-28 - Plan Created

- Audited AutomationStudioLive.tsx at 4,606 lines.
- Mapped its responsibilities and exact target boundaries.
- Added measurable performance budgets and hard source limits.
- Added phase gates and the required update protocol.
- Extended the plan across the complete view/file structure, naming system, styling, tests, and per-view functionality.
- No implementation phase is marked complete.
