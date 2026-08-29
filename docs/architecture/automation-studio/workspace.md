# Automation Studio Web Workspace

[Back to the Automation Studio overview](../automation-studio.md)

Automation Studio is a long-lived, fullscreen client workspace. The route layer
owns routing, authentication handoff, and the generic program shell. The feature
under `apps/web/src/features/automation-studio/` owns project navigation,
authoring, runtime inspection, and view-local interaction.

This document describes the currently accepted web architecture. It records
ownership and runtime behavior rather than duplicating a working plan. The
modular composition and ownership refactor is implemented; real-browser scale
and responsiveness certification remains a separate, evidence-based gate.

## Architecture Direction

`AutomationStudioLive.tsx` is a client entry facade. It exports
`AutomationStudioComposition` from `live/AutomationStudioComposition.tsx` and
contains no project, view, or interaction implementation. The composition
module wires project-scoped owners and named domain hooks; workspace rendering
is assembled by `AutomationStudioWorkspaceComposition`. Domain components,
query shapes, commands, conversion, and pointer algorithms remain in their
owning feature directories.

This split is an architectural boundary, not an invitation to move all behavior
into the composition module. New behavior belongs in an owning domain module,
store, command, or pure model. The composition root may connect those ports and
publish canonical view inputs, but it must not become a second domain owner or
reintroduce a universal renderer property bag.

The feature is organized by ownership:

```text
automation-studio/
  project/        Project catalog, lifecycle, hydration, and project surfaces.
  stores/         Project-scoped data, selection, runtime, and transaction stores.
  workspace/      Workbench layout and view-slot UI state.
  hierarchy/      Tree state, bounded rows, commands, and hierarchy UI.
  views/          Typed registry, canonical host, and retired-view recovery.
  flow-editor/    Flow canvas, controller, model, and Flow commands.
  runtime/        Run history, action/event details, queries, and commands.
  recordings/     Recording views, models, and lifecycle commands.
  state/          State explorer, pure models, panels, and state commands.
  router/         Top-level Flow routing UI and operations.
  subflows/       Paged Subflow directory and Subflow operations.
  instructions/   Scoped instruction directory and editor.
  settings/       Flow and Subflow settings forms.
  adaptations/    Adaptation review and lifecycle UI.
  clients/        Client connection and capability views.
  inspector/      Selection detail panels.
  problems/       Validation and operational problem views.
  sync/           Browser-neutral synchronization boundaries.
  styles/         Domain-owned ordered CSS partials.
  testing/        Deterministic fixtures and architecture/scale contracts.
  model/          Pure cross-domain project and selection derivation.
  legacy/         Explicitly isolated compatibility behavior.
```

Domain views must not be collected into aggregate workspace-view files. Retired
aggregation facades are absent from the current architecture; canonical imports
come from the owning domain.

## State Ownership

Automation Studio uses project-scoped external stores with selector-aware
`useSyncExternalStore` subscriptions. The accepted store boundaries are:

- `project-catalog-store`: project/category summaries and active project;
- `project-data-store`: normalized project resources and entity indexes;
- `selection-store`: global Studio selection only;
- `runtime-status-store`: active runtime operation status;
- `workspace/render-store`: pane, tab, layout, and persisted view state;
- `workspace/studio-ui-store`: narrow-shell and transient Studio chrome state;
- `mutation-transaction-store`: typed, atomic mutation publication.

`useAutomationStudioStoreOwners` creates these owners once per mounted Studio
instance. Domain hooks subscribe through narrow selectors and publish through
their owning stores. Domain models and commands are not owned by the workspace
render store merely because their components appear inside a pane.

Stores publish only when their selected value changes. No-op writes preserve
the current reference and do not notify subscribers. Cross-store updates use a
single synchronous transaction so observers cannot see a half-applied mutation.
Deleting or updating one entity invalidates only the affected entity, list, and
view scopes; it must not trigger an unconditional project reload.

Project data is normalized by stable ID. Pure project view-model and selection
resolvers derive bounded summaries and reuse references when their inputs have
not changed. Expensive graph conversion is subscriber-driven and must not run
when no mounted graph view needs it.

Global selection, Flow-editor canvas selection, hierarchy expansion, and
view-local filters are different state domains. Canvas pointer movement and
ordinary node selection stay local to the Flow editor. Hierarchy filtering and
expansion stay local to the hierarchy owner. Pagination, sort, search, and
detail disclosure stay with the view that owns them.

## Project Lifecycle

Opening a project is shell-first and hydration-second:

1. A project shell and loading surfaces publish synchronously.
2. The lifecycle captures the project ID and a monotonically increasing
   generation.
3. Summary and hierarchy hydration run asynchronously.
4. A response may commit only when its project ID and generation are still
   current.
5. Switching or closing a project aborts requests and tears down project sync
   and cache subscriptions before clearing scoped state.

The visible workspace selection is committed to scoped external stores before
summary, hierarchy, or detail hydration begins. `AutomationWorkspaceShell`
subscribes to narrow layout selectors, while each canonical view subscribes to
its own source entry. A cache miss therefore changes what loading surface is
shown; it does not delay the selected row, tab, or shell paint.

The project catalog, project CRUD, deep-link resolution, summary hydration, and
hierarchy hydration are owned outside the composition root. Modal state is
isolated from workspace rendering. A late request from a closed or superseded
project must resolve as stale or cancelled and publish nothing.

The URL may bootstrap a project or restore a deep link. Normal sidebar
selection, inner-view switching, pagination, filtering, and workspace layout do
not require server navigation or browser-history mutation.

## Cache And Synchronization

Cache and synchronization contracts are browser-neutral. Product behavior must
not depend on Chrome-only storage or extension messaging. Flow-editor focus and
save communication and the program-workspace Automation Studio bridge now use
typed inputs and direct commands instead of internal `CustomEvent` control
channels. Development metrics, reconciliation diagnostics, and the generic
program API mutation adapter may still observe browser events; those events are
telemetry or integration adapters, not canonical UI state or view commands. A
browser implementation may adapt IndexedDB, OPFS, a worker, or another
available local facility behind the declared capability; the owning store and
command API remain the same in every supported browser.

The cache is an acceleration layer, not canonical persistence. There are two
separate cache responsibilities:

- `AutomationStudioDataCache` is an in-memory, TTL-bound cache for summary,
  Flow, recording, proposal, timeline, Flow metadata, node-definition, and
  Subflow resources. Typed mutations invalidate only affected scopes and IDs.
- `AutomationStudioUiCacheCoordinator` stores schema-versioned workspace
  preferences and hierarchy sidebar UI state by user and project. Its backend
  contract is browser-neutral. The current default uses bounded `localStorage`;
  the program-API backend reads through that local fallback and mirrors values
  through `get-project-ui-cache`, `save-project-ui-cache`, and
  `delete-project-ui-cache`.

UI-cache hydration and writes are scheduled in background/idle work, writes are
debounced, and a project-generation guard rejects stale hydration. Project
switch or close cancels pending writes for that project. Persisted view state
does not include transient selection. Warm mounted views preserve component
state in memory, but the cache does not claim to persist arbitrary hydrated
domain detail or make stale data authoritative. A cache miss changes the stable
loading surface; it must not delay visible selection or tab activation.

Mutation synchronization uses typed transactions, such as
`subflow.changed`, rather than stringly typed window events. Transactions name
their affected domain and scope, permitting selective refresh and consistent
in-process subscribers.

## Data Loading Boundaries

Opening a view is a UI operation, not permission to hydrate an entire project.
The shell, summary, list, and detail layers are separate:

- Project open loads the shell, hierarchy, workspace preferences, and bounded
  summary/index data.
- Hierarchy expansion requests one SQL page of exact-parent siblings. Each
  parent has independent cursor, loading, error, and `hasMore` state; clicking
  load more for one folder cannot fetch or expand another folder's children.
- Lists use SQL-level filtering, stable sorting, `limit`, and `offset` or an
  equivalent cursor. The browser does not fetch an unbounded collection and
  paginate it locally.
- Selecting a row requests only that row's detail.
- Raw JSON, full patches, evidence, screenshots, timelines, run actions, and
  run events are detail-on-demand.
- Mutation success updates normalized stores immediately and invalidates the
  narrow server/cache scopes that may now be stale.

Current bounded UI contracts include 25 runtime runs per page, 50 run actions,
100 run events, 25 recordings per page, 50 Subflow or instruction summaries per
request, 100 structured State facts per page, and bounded adaptation diff rows.
These are presentation/request boundaries, not claims that the underlying
project has those size limits.

Background preloading may be scheduled after first interactive paint. It must
be low priority, cancellable by project generation, cache-aware, and unable to
delay input, navigation, or the active view's required request.

## Workspace Shell And View Host

Every current view has one canonical typed entry in
`views/canonical-view-definitions.tsx`. The entry declares:

- canonical ID and any legacy alias;
- title, icon, group, scope, and workspace region;
- whether users may add the view;
- availability and retired-view recovery;
- mount policy and cache schema;
- the functionality contract and data-intensity class;
- the typed model, command, and host adapter expected by its renderer.

IDs, aliases, metadata, lifecycle, cache schema, functionality, availability,
and host binding are inferred from that one definition object. Consumers use
`view-registry.ts`; they do not maintain parallel ID lists or handwritten host
switches. Adding a canonical view means adding one typed definition and its
domain-owned model/commands, then satisfying the architecture tests.

`AutomationStudioWorkspaceSurface` resolves the active view from the workspace
store and delegates layout to `AutomationWorkspaceShell`. The shell owns the
hierarchy region, pane grid, right pane, timeline dock, responsive drawers, and
header. It reads only the layout selectors each region needs; canonical domain
data does not travel through a universal workspace render callback.

The live composition root publishes each canonical view independently through
`AutomationCanonicalViewPublisher` into an
`AutomationWorkspaceViewSource`. The source is keyed by view ID, keeps a
per-view revision, suppresses same-reference replacements, and notifies only
subscribers to the changed view. `AutomationViewHost` receives a discriminated
request containing that view's typed model and commands. It resolves the
canonical definition and host registration at render time, validates the view
kind, selects that host's model, and only then invokes the component getter.
Canonical registration maps are derived lazily from the definitions, so module
initialization does not eagerly construct every view component. The former
universal renderer and legacy renderer adapter are absent; `Renderer.tsx` is
only a small typed public export surface.

Activity has three useful states. An active view renders and may perform its
required hydration. A warm view remains mounted for the same project and pane
so local scroll, selection, draft, and disclosure state can be restored without
recreating the view. A cold sleeping view renders a stable opening surface and
must not hydrate or subscribe to unrelated domain detail. Warm activity is
project-keyed and reset on project change. View subscriptions are bounded, and
unknown, mismatched, or retired IDs render explicit recovery UI instead of
silently redirecting or oscillating between tabs.

This shell, typed-source, and composition-root adoption is complete in source.
Browser responsiveness remains subject to the separate manual certification
described below.

## Overlay And Dialog Ownership

The `workspace/overlays/` package provides a project-scoped overlay store,
typed channel controller, atomic command dispatchers, and subscriber-owned
surfaces for project, hierarchy, preferences, view picker, layout picker, data
inspector, and narrow drawers. The hierarchy package likewise provides a typed
dialog transaction, external dialog store, validation, and
`AutomationHierarchyDialog` surface. These packages are complete and tested as
ownership targets.

`AutomationStudioWorkspaceComposition` mounts one
`AutomationStudioOverlays` surface beside the workspace surface. Overlay
subscribers read only their channel, while hierarchy creation/deletion uses the
hierarchy-owned dialog store and typed transaction. Project switch teardown
closes project-scoped overlays; modal state is not part of canonical project
data and cannot drive workspace-domain hydration.

Current product navigation is Flow-first. A Flow owns Router, Subflows,
Instructions, Recordings, Adaptations, Runs/Runtime Debug, and Settings.
Subflows own a Nodes editor and their scoped objects but do not own a Router;
routing belongs to the top-level Flow. State is a global view that can inspect
the selected Flow, Subflow, recording, node, or run context.

Adaptations are the current review surface for LLM-assisted changes. Legacy
proposal records may remain as compatibility persistence and can recover into a
clearly labelled read-only surface, but proposal generation is not a current navigation object or authoring workflow.

## Domain View Rules

Each domain owns its queries, commands, models, components, tests, and loading,
empty, error, permission, and large-data behavior. In particular:

- Runtime owns paged run history and lazy action/event/detail queries.
- Recordings own list/timeline presentation and recording lifecycle commands.
  Timeline steps and action previews materialize at most 200 entries at once;
  the sorted action-preview index is reused when selection moves within it.
- Router owns ordered top-level routing and fallback behavior.
- Subflows own the paged directory; Nodes opens the standard Flow editor.
- Instructions own scoped instruction CRUD and readiness states.
- Settings use typed forms and validation rather than raw JSON editing.
- Adaptations own summary-first review, bounded changes, evidence, validation,
  audit, and lifecycle commands.
- State owns bounded visual and structured inspection; raw JSON is opt-in.
- Inspector consumes typed selection data and does not subscribe through global
  browser events.

Every data-intensive view must keep prior usable content while refreshing when
safe, distinguish loading from empty and error states, and preserve the user's
selection when the selected entity remains present.

## Interaction Model

Flow-editor pointer behavior is direct:

- left click selects a node;
- left drag moves a node;
- right drag on the canvas draws a selection box;
- a later node context menu may use right click without adding a hand/select
  mode toggle;
- middle-button or the established canvas gesture pans.

High-frequency pointer movement must not publish global Studio state. Geometry
may update locally during the gesture; persistence and broader store
transactions occur at the committed boundary.

Sidebar selection and view activation publish their visible state
synchronously. Data hydration follows independently. The selected row/tab and a
stable loading surface must never wait for SQL, files, cache persistence, URL
writeback, or detail conversion.

## Flow Editor Vocabulary And Compatibility

Current product and implementation vocabulary is **Flow**: Flow editor, Flow
graph, Flow nodes, Flow edges, and the canonical `flow-nodes` view ID. The old
`policy-primary` ID is a migration alias for `flow-nodes`; it is not a second
view.

Some `policy` names remain deliberately at persisted/framework compatibility
boundaries. Examples include legacy Policy document adapters, node scope/family
values, renderer discriminants such as `policyNode`, persisted edge type
`policy-edge`, CSS hooks, and deprecated public aliases. These values cannot be
renamed casually because importing repositories or stored graphs may depend on
them. New editor controllers, commands, models, labels, and tests use Flow
terminology. Compatibility code must be isolated and labelled as legacy rather
than spreading Policy vocabulary back into current product behavior.

## Retired View Migration

Aliases and retired views are different compatibility mechanisms. Active aliases
such as `policy-primary`, `runs-history`, and `signals-web` canonicalize to
their current IDs. Saved Config IDs canonicalize to Flow Settings when a Flow
context exists; saved Proposal Generator, Proposal Workbench, and Pipeline
Workbench IDs canonicalize to Adaptations in that context.

Without the required Flow context, retired IDs remain retired and
`AutomationRetiredViewRecovery` explains how to continue. Unknown IDs and
kind-mismatched saved tabs get explicit unavailable UI. Workspace normalization
deduplicates canonicalized tab and view-state IDs so an alias cannot create a
second instance of an already-open canonical view.

## Style Ownership

`apps/web/src/app/globals.css` is an ordered import manifest. Automation Studio
styles live under `automation-studio/styles/` in domain partials for workspace,
Flow editor, Runtime, State, Router/Subflows, Recordings/Clients/Inspector, and
Instructions/Settings/Adaptations/Problems.

Order is explicit because the existing cascade is part of the behavior. New
selectors belong to their domain partial. A partial must stay below the
architecture line budget; `globals.css` must not regain feature selectors.
Responsive rules stay with their owning domain, and changes must be checked at
desktop and narrow widths for clipping, overflow, tab-strip space, modal
visibility, and independent body scrolling.

## Performance Contracts

Architecture tests enforce bounded module sizes, canonical imports, absence of
retired facades, isolated store notifications, stable derivation references,
and bounded rendering for large State and domain collections.

The deterministic in-process large-project fixture currently generates by
default:

- 2,048 Flows, Subflows, recordings, runs, instructions, adaptations, and
  clients;
- 8,192 run actions and State facts;
- 4,096 hierarchy nodes.

Generation is deterministic, linear in collection size, configurable, and
capped at 50,000 items per collection to prevent accidental test exhaustion.
It validates models and component boundaries; it is not a substitute for a
real browser, database query-plan, heap, or soak certification.

The source of truth for browser budgets is
`apps/web/src/features/programs/ui-performance-budgets.ts`. Current key limits
include 100 ms view switching, 75 ms graph selection, 50 ms long tasks, 40
renders per instrumented Automation Studio component in a scenario, 900 graph
DOM entities, and 32 MiB retained heap for the switch scenario. Tests must use
the source constants rather than copying values into assertions.

Browser measurements are pending until the manual procedure in
[Automation Studio UI performance profiling](../../operations/automation-studio-ui-performance-profiling.md)
passes on documented hardware and build conditions. A passing unit/type/build
suite does not establish interactive responsiveness.

Repository automation and coding agents do not start the web panel. A human
operator starts it for inspection and certification with:

```bash
pnpm --filter @fluxiq/web dev
```

## Change Checklist

Before accepting an Automation Studio web architecture change:

1. Put behavior in the domain that owns it and keep the composition root thin.
2. Identify the exact store selectors and transaction scopes affected.
3. Render selection/loading synchronously and make hydration cancellable and
   generation-safe.
4. Keep list queries bounded in SQL and load detail only after selection.
5. Preserve browser-neutral cache and sync contracts.
6. Register a typed view contract instead of extending an aggregate renderer
   payload.
7. Add empty, loading, error, permission, and representative large-data tests.
8. Put styles in the owning partial and verify desktop/narrow overflow.
9. Run relevant tests, `pnpm --filter @fluxiq/web check`, and the repository
   documentation check.
10. Run the manual browser certification before claiming a performance gate is
    complete.
