# Automation Studio Web Workspace

[Back to the Automation Studio overview](../automation-studio.md)

Automation Studio is a long-lived, fullscreen client workspace. The route layer
owns routing, authentication handoff, and the generic program shell. The feature
under `apps/web/src/features/automation-studio/` owns project navigation,
authoring, runtime inspection, and view-local interaction.

This document describes the currently accepted web architecture. It records
ownership and runtime behavior rather than duplicating a working plan. The
modular composition and ownership refactor is implemented. Real-browser scale,
responsiveness, and resource certification is an evidence-based release gate
that must be rerun after workspace interaction or lifecycle changes.

## Browser Cache Certification

Automation Studio UI cache entries are bounded at three levels: 500,000
characters per entry, twenty retained projects, and 2,000,000 characters
globally. The local backend evicts the oldest project envelopes and then the
oldest remaining entries after each write. Phase 8 records these counts and
sizes after fifty ten-view cycles; exceeding any bound fails certification.

Resource telemetry is opt-in through the browser certification bootstrap. It
counts live Automation Studio external-store subscriptions without changing
normal production behavior and is paired with browser listener, DOM, heap,
warm-view, frame, long-task, and React commit evidence.

## Architecture Direction

`AutomationStudioLive.tsx` is a client entry facade. It exports
`AutomationStudioComposition` from `live/AutomationStudioComposition.tsx` and
contains no project, view, or interaction implementation.
`AutomationStudioComposition` creates one stable `AutomationStudioRuntime` for
the mounted Studio session and passes it to `AutomationStudioSession`. The
runtime owns the external stores, request coordinator, and shared project
generation. Its identity does not change when project entities, selection, or
workspace presentation change, and disposal cancels outstanding requests and
invalidates the generation.

`AutomationStudioSession` is the orchestration boundary. It connects project
lifecycle, commands, navigation, connected workspace regions, and compact view
connector registrations. `AutomationStudioWorkspaceComposition` assembles the
workspace shell and overlays. Domain components, query shapes, commands,
conversion, and pointer algorithms remain in their owning feature directories.

This split is an architectural boundary, not an invitation to move all behavior
into the composition module. New behavior belongs in an owning domain module,
store, command, connector, or pure model. The composition root may connect
those ports, but it must not become a second domain owner, derive every view
model, or reintroduce a universal renderer property bag.

The feature is organized by ownership:

```text
automation-studio/
  bootstrap/      Stable runtime, store owners, requests, and project generation.
  live/           Session orchestration and direct view/region connectors.
  project/        Project catalog, lifecycle, hydration, and project surfaces.
  stores/         Normalized data, queries, selection, runtime, and transactions.
  presentation/   Atomic presentation transactions.
  workspace/      Workbench layout and view-slot UI state.
  hierarchy/      Tree state, flat virtualization, commands, and hierarchy UI.
  views/          Typed registry, canonical host, and retired-view recovery.
  graph/          Draft ownership, graph jobs, history, and worker scheduling.
  cache/          In-memory project resource cache.
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
```

Domain views must not be collected into aggregate workspace-view files. Retired
publisher facades are not part of the live render path; canonical imports come
from the owning domain. The older snapshot composition helper under
`live/view-host/composition.ts` remains a compatibility and deterministic-test
utility. `AutomationStudioSession` does not use it to render the workspace.

## State Ownership

Automation Studio uses project-scoped external stores with selector-aware
`useSyncExternalStore` subscriptions. The accepted store boundaries are:

- `project-catalog-store`: project/category summaries and active project;
- `project-data-store`: normalized project resources and entity indexes;
- `project-query-store`: normalized bounded-query identity, IDs, totals,
  freshness, errors, and cursors;
- `selection-store`: global Studio selection only;
- `runtime-status-store`: active runtime operation status;
- `workspace/render-store`: pane, tab, layout, and persisted view state;
- `workspace/studio-ui-store`: narrow-shell and transient Studio chrome state;
- `mutation-transaction-store`: typed, atomic mutation publication.

`createAutomationStudioRuntime` creates these owners once per mounted Studio
instance. `useAutomationStudioRuntime` retains that runtime in a ref and only
disposes it when the Studio unmounts. Domain hooks and connectors subscribe
through narrow selectors or exact scope revisions and publish through their
owning stores. Domain models and commands are not owned by the workspace render
store merely because their components appear inside a pane.

Stores publish only when their selected value changes. No-op writes preserve
the current reference and do not notify subscribers. Cross-store updates use a
single synchronous transaction so observers cannot see a half-applied mutation.
Deleting or updating one entity invalidates only the affected entity, list, and
view scopes; it must not trigger an unconditional project reload.

Durable hierarchy/workspace saving is not a React render dependency. The
hierarchy persistence owner subscribes imperatively to the workspace store's
exact `save-request` scope, coalesces requests for 800 ms, and only then reads
the current custom nodes, deleted IDs, and durable workspace preferences.
Hierarchy mutations explicitly publish that save request even when layout state
did not change. Project changes invalidate late save completion, and neither the
revision signal nor signature construction rerenders `AutomationStudioSession`.

Project data is normalized by stable ID. One
`AutomationProjectViewModelCache` is created for each open project session.
Its key is the project identity plus project-data, selection, and workspace
preference revisions. The Session, hierarchy, commands, and connected views
read that shared cache; they do not create parallel whole-project selectors.
The underlying pure selector preserves heavy hierarchy/index/source references
when a revision changes without changing their inputs. The data store publishes
collection, entity, detail, page, and resource scopes independently. The query
store keys project, collection, filter, sort, page, and page size; it preserves
ID references for equivalent results and distinguishes `missing`, `fresh`, and
`stale` data.

`createAutomationSessionProjectViewReader` is a compatibility name for a thin
reader over that project-scoped cache. It reads the current project-data,
selection, and workspace snapshots imperatively. It has no React subscription
and does not publish models into the ViewHost. The session currently takes one
such snapshot during its own render for remaining orchestration hooks, and
command callbacks call the reader when they need a fresh cross-domain view.
The connected hierarchy also invokes it only after one of its declared project
scopes changes. This is a residual session-orchestration projection, not the
data path for canonical destination views; destination connectors read their
own normalized scopes directly.

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
3. After resetting project-scoped UI state, opening captures separate workspace
   preferences and hierarchy UI revision snapshots.
4. Summary, durable workspace/hierarchy state, and UI-cache hydration run
   asynchronously.
5. A response may commit only when its project ID and generation are still
   current. Durable or cached workspace/hierarchy state has the additional rule
   that its surface revision must still match the captured revision.
6. Switching or closing a project aborts requests and tears down project sync
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

Active destination loaders use the same generation boundary for Flow detail,
node definitions, recording detail, timelines, and Flow metadata. Load
completion may update its normalized entity/resource scope only while the
captured generation is current. The request coordinator also enforces
latest-request ownership with `AbortController` instances.

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
  presentation seeds and hierarchy sidebar UI state by user and project. Its backend
  contract is browser-neutral. The current default uses bounded `localStorage`;
  the program-API backend reads through that local fallback and mirrors values
  through `get-project-ui-cache`, `save-project-ui-cache`, and
  `delete-project-ui-cache`.

The workspace cache payload is compact and layout-only: dimensions, collapsed
states, layout preset and ratios, density, and motion preference. It does not
restore panes, tabs, active view, view-local state, or selection. The separate
sidebar seed contains presentation state, but hydration resets focused and
primary tree-node identity so cached data cannot navigate the user.

UI-cache hydration enters the shared background queue only after a paint and an
idle opportunity. Writes are debounced, coalesced by cache key, and capped;
overflow evicts the oldest pending write. Cache and preload work repeatedly
yield while browser input or an active user-visible request is pending. A
project-generation guard rejects hydration for a closed or superseded project.
Independent workspace preferences and hierarchy UI revisions reject a late
durable or cache result after the user has changed that surface. The revision is
captured after project reset, checked before durable state is applied, captured
again before cache hydration, and checked again in the cache callback. Thus a
tab/layout interaction cannot be reverted by late workspace preferences, and a
selection, disclosure, filter, or sidebar interaction cannot be reverted by a
late sidebar seed. A change on one surface does not suppress valid hydration on
the other. Project switch or close aborts queued work for that project. Warm
mounted views preserve local React state in memory, but the cache does not
persist arbitrary hydrated domain detail or make stale data authoritative. A
cache miss changes the destination readiness surface; it must not delay visible
selection or tab activation.

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
delay input, navigation, or the active view's required request. The current
runner limits a plan to 24 tasks and concurrency to at most two, executes only
within bounded time slices, and treats responses as warm data only. Starting a
new plan aborts the old plan. Preload cannot write active view or selection.

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

`useAutomationConnectedViewEntries` registers one compact connected request per
canonical view. The workspace source is still keyed by exact view ID, but its
live entries contain connector functions rather than prebuilt domain models.
The mounted destination asks `AutomationViewHost` to invoke its connector.
Only then does that connector subscribe to its declared project-data, query,
runtime, and selection scopes and derive its model. A connector may initiate
its active-only detail loader; the connector contract also supports an exact
bounded query and query loader. Domain views that own their own list controller
continue to own that bounded query locally. The destination renders through
`AutomationViewBoundary`; there is no grouped publisher pass pushing every
model through the session or shell.

`AutomationViewHost` resolves the canonical definition and host registration,
validates saved ID/kind compatibility, and renders explicit recovery for
unknown or retired views. Canonical registration maps are derived from typed
definitions rather than a handwritten universal switch. `Renderer.tsx` is a
small typed public export surface, not the live model owner.

Activity has three useful states. An active view renders, subscribes to its
declared scopes, and may perform its required hydration. A hidden warm view
remains mounted for the same project and pane so local scroll, draft, and
disclosure state survive, but its connector returns retained model state and
unsubscribes from project, query, runtime, and selection stores. A cold view
is unmounted until activation, at which point its local readiness boundary owns
the opening surface. Warm eligibility comes from the canonical view lifecycle.
Warm activity is project-keyed and reset on project change.

Tab selection is one synchronous workspace command and one authoritative React
render. The tab container does not walk or mutate sibling DOM nodes, maintain a
pending selection marker, start a timer, or schedule a second activation pass.
`MountedViewStack` reads the selected view ID directly from the pane snapshot;
the tab attributes and active mounted destination therefore change in the same
commit. Data loading remains downstream of each destination's local readiness
boundary and cannot delay that commit.

Warm destinations stay mounted and preserve their local state. The mounted
view stack uses fixed geometry and strict containment so activating a warm view
does not resize the pane or remount its contents. Cold destinations mount when
selected and own their loading surface. View activation does not use an
`Opening view...` placeholder, animation-frame scheduler, idle callback, or
React transition that can race a later selection.

Warm retention uses access-order LRU. Desktop retains at most six warm view
instances and constrained/narrow workspaces retain at most three. The active
view and every dirty view are pinned and cannot be evicted; therefore the
measurable bound is `configured cap + active/dirty pins` while those pins exist.
The workspace runtime owns one lifecycle-scoped dirty-registry subscription for
its project-local warm registry. A dirty-to-clean notification synchronously
reconciles retention and immediately evicts the oldest eligible entries back to
the configured cap; active and still-dirty entries remain pinned. Eviction
removes the mounted view and its activity reference. The registry publishes only
membership changes, so a warm revisit preserves local state without turning
access-order updates into render work. View-source subscriptions are separately
bounded to 64 exact IDs, and unknown, mismatched, or retired IDs render explicit
recovery UI instead of silently redirecting or oscillating between tabs.

## Connected View Identity

`useAutomationConnectorCommands` wraps every domain command in a stable event
callback and memoizes one command object per canonical view. The connected-entry
cache compares the command object, project generation, connector scope, stores,
and view instance. An unrelated selection, disclosure, menu, or pane action
therefore reuses the entry object. If one view's command contract changes, only
that entry changes.

`useAutomationConnectedViewSource` owns exactly one source for a contiguous
project session. Entry changes are reconciled into that source by view ID;
subscribers of unchanged IDs are not notified. Changing projects creates a new
source and project generation. The workspace composition receives the source
as a port and never derives or replaces it from render-time props.

Readiness is local to each destination. When a direct connector declares a
query, it maps that exact query snapshot to `loading`, `empty`, `error`,
`stale-ready`, or `ready`. A refresh may retain usable data as
`stale-ready`; a missing first result displays the local loading boundary.
Readiness tokens include project generation and query update identity. Views
with domain-local controllers expose the same states inside their own boundary.
The shell, tab strip, and unrelated views do not subscribe to readiness.

This shell, typed-source, and composition-root adoption is complete in source.
Browser responsiveness remains subject to the separate manual certification
described below.

## Connected Hierarchy And Timeline

The hierarchy and bottom timeline are shell regions rather than canonical pane
views, so they have explicit connected-region owners in
`AutomationStudioConnectedRegions.tsx`.

`AutomationStudioConnectedHierarchy` subscribes to the Flow, recording,
timeline, hierarchy-resource, and hierarchy-selection scopes it needs. Project
changes trigger the residual project snapshot reader described above;
selection styling reads the selection store directly and does not rebuild the
project projection for unrelated selection updates.

The hierarchy projection first computes filtered visible IDs and then flattens
only expanded rows into stable `{id, parentId, level}` records. The tree scroll
owner materializes fixed 40-pixel rows for the viewport plus five rows of
overscan on each side. Keyboard traversal uses the complete flat visible-row
sequence rather than querying mounted DOM, scrolls an offscreen target into the
window, and then restores roving focus. `aria-level`, `aria-posinset`,
`aria-setsize`, `aria-expanded`, and `aria-selected` preserve tree meaning even
though recursive DOM groups are not retained. SQL-owned child pages remain
explicit Load More rows; already-loaded siblings are never hidden behind a
second client-only row cap.

Hierarchy navigation exposes two truthful modes. `preview` activates the
chosen object in the current pane. `new-pane-or-focus` creates another main
pane only when that view identity is not already open; otherwise it focuses
the existing pane. The old `new-window` name was retired because the command
never guaranteed a separate browser window or duplicate view instance.

`AutomationStudioConnectedTimeline` reads normalized recording and timeline
maps directly. Its selection snapshot reduces unrelated Flow, node, and
settings selections to one stable `unrelated` key, so those changes do not
rescan timelines. Preview, pending State-open, recording, timeline, and relevant
State selection identity are the only selection inputs to the dock model.

## Graph Derivation

Task-Flow conversion and graph validation run through
`createAutomationGraphDerivationJob`. Requests have a project/Flow owner key
and a revision key containing the source revision and relevant object
identities. The job is idle-scheduled, generation-cancelled, and
subscriber-aware: it starts only while the Flow canvas or Problems destination
needs graph output, and cancels scheduled work when the last subscriber leaves.

A same-owner refresh keeps the last valid graph visible while the new revision
is derived. Changing project or Flow owner clears the prior graph. Conversion
and validation results commit only if the request revision, job generation, and
subscriber set are still current. High-frequency canvas movement remains local
to the Flow editor; graph drafts, validation, history, and persistence are
published at settled interaction boundaries.

## Overlay And Dialog Ownership

All browser overlays register with the shared
`features/programs/overlay-environment.ts` manager. It owns one document-level
listener set, reference-counted scroll locking, body-sibling isolation, nested
focus return, Escape handling, outside-pointer handling, and viewport-change
notifications. `modal` and `drawer` registrations are modal and isolate the
background; `menu` and `nonmodal` registrations do not claim `aria-modal`,
inert the page, or lock scrolling. Nested menus remain available above their
owning dialog, while a nested modal temporarily isolates the underlying modal.
Shared Modal/Drawer primitives and Studio floating pickers must not install
their own document listeners or sibling-isolation effects.

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

### Canonical View Diagnostics Audit

Ordinary workflows present labels, validation, and recoverable errors first.
Technical identifiers, source documents, and raw payloads are secondary and
must remain behind an explicit Details, JSON, or raw-state disclosure. The Data
Flow Inspector is the only intentional implementation-diagnostics surface; it
is a development-only overlay and is not a canonical workspace view.

| Canonical view | Ordinary presentation | Technical detail policy |
| --- | --- | --- |
| Connected Clients | Searchable, server-paged client and pairing lists | Connection implementation details are collapsed |
| Timeline | Recording events, notes, markers, lifecycle actions | No ordinary repair or raw-index controls |
| Nodes | Graph authoring, selection, parameters, Problems | No implementation diagnostics in the canvas |
| Router | Typed conditions, ordered routes, fallback behavior | Per-route details are collapsed |
| Subflows | Searchable, paged directory and lifecycle actions | Stable IDs are secondary; no raw document editor |
| Instructions | Scoped instruction editor and effective ordering | Complete instruction JSON is opt-in |
| Adaptations | Summary, changed fields, evidence, and review actions | Complete adaptation and technical change JSON are opt-in |
| Settings | Typed Flow/Subflow controls and revision-conflict recovery | Technical metadata, ownership IDs, and comparisons are disclosed |
| State View | Visual, structured, diff, and compare modes | Raw state JSON is explicitly expanded and can be collapsed |
| Runtime Debug | Typed run form, readiness, Runs/Replays, action summaries | Advanced input JSON and action/event payloads are opt-in |
| Problems | User-facing validation and runtime Problems | No implementation telemetry is exposed |
| Inspector | Typed selected-object sections and parameter controls | Identifier groups use collapsible sections |

`canonical-diagnostics-disclosure.test.ts` keeps this table aligned with the
registered canonical view IDs and enforces the single development-overlay
allowlist.

### Node Palette Preferences

**Session Recent** is editor-session-only. It records the last twelve node
types added by the currently mounted Nodes editor, is deduplicated in most
recent order, and intentionally resets when that editor session is remounted or
the browser session ends. It is not project data and is not synchronized.

**Favorites** are persisted browser-neutral UI preferences through the Web
Storage API. They are not tied to Chrome APIs, project persistence, or the
framework database. Reads and writes tolerate unavailable browser storage;
duplicates and node IDs no longer present in the active registry are removed.
An empty Favorites view explains how to add the first favorite.

The expanded palette uses independently expandable categories, so users can keep
multiple node families visible while building a graph. Every expanded entry
is a complete node card with its icon, name, description, compatibility hint,
and favorite control; there is no separate preview card. Rich cards materialize
one per animation frame into preallocated, fixed-height, independently
contained slots. Opening a category therefore acknowledges the arrow
immediately without repeatedly shifting or relaying out cards already shown.
The palette is memoized from graph history and position updates, its Add
callback has stable identity, and it occupies an absolutely positioned,
strictly contained editor rail with reserved canvas space. Graph layout changes
therefore do not relayout the palette's card tree.

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

Immediate graph edits use bounded local reconciliation. They do not run full
viewport partitioning, graph serialization, or history diffs in the input
handler. History and recovery-draft diffs run through the graph worker task
boundary. Locally published drafts are recognized by identity and base revision
so they are not reapplied as external graph documents. Node dimensions are
stable before React Flow measures them, and the shell, pane, mounted view,
canvas, frame, status rows, and palette provide explicit strict layout
containment. These rules apply equally to node creation, selection, dragging,
connections, undo, and warm tab revisits.

During a node drag, FluxIQ coalesces React Flow's controlled position updates to
at most one update per animation frame so connected edges follow the node without
publishing a durable draft on every pointer event. On release, the final full node
array is written to both the authoritative graph ref and React state before the
history checkpoint, dirty state, and draft publication are committed. Lane
rebalancing is excluded from the drag and reconnect paths.

Start, End, and operational nodes share one card renderer and fixed geometry so
every graph object has consistent information, port, and selection layout. The
React Flow edge container and its SVG fill the viewport because Chromium does not
paint route overflow from a zero-size or one-pixel SVG. New nodes are inserted at
the exact center of the currently visible canvas without moving the camera.
Implicit auto-pan is disabled for both node dragging and connection gestures,
which prevents hidden viewport shifts and removes React Flow's continuous
reconnect-time pan loop. During endpoint reconnection, raw mouse movement is
coalesced to one React Flow update per animation frame and the library's linear
candidate scan is scoped to mounted viewport nodes plus the current edge
endpoints. The final pointer position is flushed before mouse-up so a fast drop
cannot miss its target. Selected edges are elevated so their endpoint controls
remain hit-testable beside selected node cards. Users retain explicit
middle-mouse panning and Fit View.

The canvas toolbar keeps Fit, history, Save, and Add available without covering
the graph. Selection commands appear only while a graph object is selected.
Zoom, validation, minimap, and outline controls live in the More menu. Every
toolbar mutation checkpoints history, synchronizes visual selection, marks the
graph dirty, and makes Save available; undo reconciles dirty state against the
last saved graph signature.

Graph saves send bounded node and edge operations through `apply-graph-patch`.
The browser editor does not use the retired full-document save route.

Flow edges use the port tone as their foreground stroke, a surface-colored
contrast halo, rounded joins, and a closed directional marker. The foreground
and halo are separate paths while the interaction path remains transparent and
wide. Saved and newly connected routes use the same `automationEdge` renderer,
so reloads cannot silently fall back to a visually different edge treatment.

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

CSS has four explicit ownership levels:

- `app/globals.css` imports only the global foundation and global program
  primitives required on every route;
- `app/programs/automation-studio/layout.tsx` owns the React Flow stylesheet
  and the route-local `automation-studio.css` manifest;
- `automation-studio/styles/workspace/` owns Studio shell, hierarchy, pane,
  tab, and responsive-shell rules;
- each Studio domain owns its individual view rules under its named style
  directory.

Automation Studio styles live under `automation-studio/styles/` in domain
partials for workspace, Flow editor, Runtime, State, Router/Subflows,
Recordings/Clients/Inspector, and Instructions/Settings/Adaptations/Problems.
Non-Studio routes must not import the route manifest or React Flow stylesheet.

Order is explicit because the existing cascade is part of the behavior. New
selectors belong to their domain partial. A partial must stay below the
architecture line budget; `globals.css` must not regain feature selectors.
Responsive rules stay with their owning domain, and changes must be checked at
desktop and narrow widths for clipping, overflow, tab-strip space, modal
visibility, and independent body scrolling.

The Studio shell owns `calc(100dvh - 49px)` and has no fixed tall minimum.
Shell, pane, tab-frame, and graph/timeline containers clip by design. The
project gate, project hierarchy, ordinary active view, and preview sheet are
the named vertical scroll owners; table wrappers may additionally own
horizontal scrolling. At 820 CSS pixels and below the hierarchy and secondary
regions use drawers, while 320-pixel layouts stack form and pagination actions.
The executable matrix and golden-state procedure are documented in
[Web Panel responsive and visual certification](../../operations/web-panel-responsive-visual-certification.md).

Hierarchy controls use explicit role classes: `tree-row-main`,
`tree-row-label`, `tree-row-disclosure`, `tree-row-action`, and
`automation-sidebar-resizer`. Tree styles must not target every descendant
`button`, because disclosure, object actions, pagination, menus, and resize
controls have different geometry and interaction contracts.

## Performance Contracts

Architecture and deterministic tests enforce bounded module sizes, canonical
imports, live-path connector ownership, isolated store notifications, stable
derivation references, generation rejection, and bounded visible work for
large project fixtures.

The deterministic in-process large-project fixture currently generates by
default:

- 2,048 Flows, Subflows, recordings, runs, instructions, adaptations, and
  clients;
- 8,192 run actions and State facts;
- 4,096 hierarchy nodes.

Generation is deterministic, linear in collection size, configurable, and
capped at 50,000 items per collection to prevent accidental test exhaustion.
Phase 11 also uses a one-million-logical-view-ID sentinel without allocating a
million rendered views. Deterministic contracts establish a viewport-derived
hierarchy window with 40-pixel rows and five-row overscan, six desktop or three
constrained warm instances plus explicit active/dirty pins, 64 subscribed view
IDs after examining at most 128 IDs, 25 run IDs per first page, stable
selector/query identity, no-op notification suppression,
one notification per affected store in a transaction, and stale-generation
rejection. A deterministic React 19 mounted harness additionally uses
`Profiler` around selection, hierarchy, hierarchy-menu, pane, and connected
view consumers. Selection, disclosure, menu-open, and pane-selection commands
must commit only their owning consumer; unrelated connected views must record
zero commits, preserve their entry object, and retain one source subscription
until unmount. These tests count literal React commits and subscription
lifecycle changes, but do not measure commit duration, browser input latency,
paint, long tasks, retained heap, DOM cost, SQL query plans, or soak behavior.

The source of truth for browser budgets is
`apps/web/src/features/programs/ui-performance-budgets.ts`. Current key limits
include 100 ms view switching, 75 ms graph selection, 50 ms long tasks, 40
renders per instrumented Automation Studio component in a scenario, 900 graph
DOM entities, and 32 MiB retained heap for the switch scenario. Tests must use
the source constants rather than copying values into assertions.

Phase 8 normalized production certification currently passes the fixed Empty,
Ordinary, and Scale fixtures in one serial desktop-Chromium report. Across the
accepted run, input and retained-warm p95 values are at most 13.7 ms and 12.9
ms, project-entry p95 is at most 89.1 ms, listeners and subscriptions return to
their post-warm baselines, final DOM remains at most 2,121 nodes, retained heap
growth remains at most 2.65 MiB, and core-interaction long tasks and critical
accessibility violations are zero. Exact protocol, environment, and evidence
are recorded in [Web Panel Phase 8 browser and scale certification](../../operations/web-panel-phase8-browser-scale-certification.md).

This evidence is not permanent permission to skip browser measurement. Changes
to interaction scheduling, mounted-view lifecycle, fixture loading, telemetry,
or resource ownership must rerun the release gate. Unit, type, docs, or build
success alone does not establish interactive responsiveness.

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
   payload; connect its model at the destination in `ViewHost`.
7. Add empty, loading, error, permission, and representative large-data tests.
8. Put styles in the owning partial and verify desktop/narrow overflow.
9. Run relevant tests, `pnpm --filter @fluxiq/web check`, and the repository
   documentation check.
10. Keep deterministic evidence labelled as such, and run the manual browser
    certification before claiming an interactive performance gate is complete.
