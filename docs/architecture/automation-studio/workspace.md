# Automation Studio Web Workspace

[Back to the Automation Studio overview](../automation-studio.md)

> **Retired.** The Studio workspace shell this page describes (the
> `/programs/automation-studio` route, its hierarchy sidebar, tabs and header,
> the home launcher, the domain pages and the global conversation prompt) has
> been deleted. The panel is now `/`, `/flows`, `/flows/<id>`,
> `/flows/<id>/graph` (the graph editor, under Advanced), `/runs`,
> `/runs/<id>`, `/data`, `/security` and `/settings`, with the assistant dock
> beside them; the old routes redirect to the matching new page. The sections
> below that describe the shell, its layout, its cache and its performance
> budgets are kept as history of the old design and are not current. The chat
> section ("The Chat UI") is current.

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
`AutomationStudioComposition` from `live/components/AutomationStudioComposition.tsx` and
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
view-local filters are different state domains. Canvas pointer movement stays
local to the Flow editor. A Flow-editor node or mode selection carries its
owning Flow ID so an inspector selection cannot make the canvas lose its graph
identity or re-enter a loading state. Durable per-view selections are copied
into project workspace preferences; hierarchy filtering and expansion remain
with the hierarchy owner, while pagination, sort, search, and disclosure stay
with the view that owns them.

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

The durable project workspace record preserves the complete pane layout,
open tabs, active pane/tab, split ratios, dock/sidebar state, and each view's
declared `viewStates` payload. Closing a tab removes it from the visible layout
but does not delete that view's saved state. Reopening it in the same project
therefore restores its recorded Flow identity and selection; loading a saved
project restores the active view's validated selection after summary hydration.
If the active Flow-scoped view has no view-local selection, restoration falls
back to the Nodes view's saved selection and then its `lastOpenFlowId`. This
keeps the owning Flow or subflow Nodes row selected in the hierarchy when a
project first appears, including when the saved selection is an editor node.
Transient overlays and hydrated domain documents remain outside this contract.

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

Flow, editor-node, and editor-mode selections all resolve to their owning Flow
identity for hierarchy styling. Selecting Router, Settings, or another object
of a Flow does not re-collapse a subflow branch that was already opened. Opening
a subflow records its selection-driven expansion in the saved sidebar disclosure
state; unopened branches remain default-collapsed, while an explicit user collapse
remains authoritative. The active view and owning Flow together select one blue
primary row after both direct interaction and project restoration. Restoration
expands the saved selection's ancestor chain from the project root through its
parent Flow and subflow, only as far as needed to reveal that selected object;
unrelated branches keep their saved disclosure state.
The connected hierarchy derives that primary context from the active pane and
its saved Flow view state as well as the live selection, so a transient unrelated
selection cannot leave a restored Flow window without its matching blue row.
Every Flow- or subflow-scoped inner view uses an object-qualified workspace
instance ID. Two Instructions, Settings, Nodes, or other scoped windows for
different objects can therefore coexist, retain independent state and content,
and use titles such as `Instructions: Checkout`. Activating a previously opened
instance restores that instance's Flow or subflow instead of inheriting the most
recent global selection. Pane tabs, the active pane, and view state changes
request durable per-project workspace persistence; legacy unbound tabs are bound
once from their saved Flow context during project hydration.
The per-project browser cache mirrors panes, active tabs, right and bottom regions,
and `viewStates` so a reload can restore the latest window state even while the
debounced durable project write is still completing.

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

The Nodes view is available and bindable only for a canonical
`subflow_graph` whose metadata also names its parent Flow and owning Subflow.
Top-level Flow rows and newly created parent Flows open Subflows instead. If a
saved workspace restores an old Nodes tab against a parent Flow, the workspace
replaces that tab with the same parent's Subflows view and reports the recovery
through the normal action-status notice. The connected Nodes host repeats the
ownership check, so a stale tab or direct view request cannot expose the parent
graph while workspace recovery catches up.

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

The Router workbench presents group filters separately from a full-width route
search and status filter. Route authoring follows destination, condition, and
optional sample-test steps; lower priority numbers are explained as evaluating
first, while status, confidence, and description remain secondary details.
Fallback editing uses explicit continue-to-subflow and stop-run choices with a
choice-specific configuration panel. PIN authorization temporarily replaces
the owning editor instead of stacking modal focus traps, and returning from
authorization restores the draft. Successful writes close both authorization
and the owning editor, while failures remain visible in the authorization
surface without discarding the draft.

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
The responsive and visual certification runbook for this shell was retired with
it.

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
accessibility violations are zero. The phase 8 suite and its
certification runbook were deleted with the old shell.

This evidence is not permanent permission to skip browser measurement. Changes
to interaction scheduling, mounted-view lifecycle, fixture loading, telemetry,
or resource ownership must rerun the release gate. Unit, type, docs, or build
success alone does not establish interactive responsiveness.

Repository automation and coding agents do not start the web panel. A human
operator starts it for inspection and certification with:

```bash
pnpm --filter @fluxiq/web dev
```

## The Chat UI

The chat a person types into is `@fluxiq/ui-components` (`packages/ui-components`), plain TypeScript DOM and CSS with no UI framework, not code in the workspace or in a client. A client mounts `createChatWidget(transport, options)` and calls `render` and `setActive`; chat rendering, stream models and styles change in that package and reach every client together.

The widget reaches the world only through ports the client supplies (`src/chat/ports/`):

- `ChatTransport`: FluxIQ's conversation, live activity, run controls, and optional recordings and model keys.
- `ChatWidgetOptions`: what only the host can do, such as opening the Studio.

It imports no Node built-in and no browser-extension API, and the structure audit's browser-import rule walks its entries. `styles/tokens.css` sets the default theme on `:root`; a host with its own tokens defines the same names on an ancestor instead.

Two clients mount it today:

- **Core's panel** (`apps/web/src/features/chat-widget/`): a thin React host that builds a `ChatTransport` over the real Automation Studio endpoints (`createProgramChatTransport`) and an activity port, and renders as the docked chat ("Chat") on every panel page. The old chat-only route `/programs/automation-studio/chat` was deleted.
- **The web extension** (`panel/chat` in the downstream repository): an adapter that supplies the extension's transport and host bindings. The downstream repository's extension-client document describes that adapter.

The widget is not part of `fluxiq`, and `fluxiq` does not import it.

### How the chat hears a turn

A turn a run writes, a reply finishing, an ask answered elsewhere and the live
activity of the work behind them reach Core's panel by push (t920). Nothing in
the panel's transport reads a thread or the activity on a timer; the adaptive
1-10 s poll that stood in for a push channel
(`features/automation-studio/conversation/thread/poller.ts`) is gone.

- **Core signals.** `AutomationStudioConversations.signals`
  (`runtime/conversations/signals/`) signals `{ scope, conversationId, version }`
  once each write to a thread has committed: a turn (a person's or Core's), an
  ask answered or expired, a thread opened, renamed or deleted. `scope` is
  `{ kind: "project", projectId }`, or `{ kind: "panel", userId }` for a
  person's panel thread, which `PanelAssistantThreads` signals through the same
  hub. A read, or a write the store refused, signals nothing. Live activity is
  the activity hub's own subscription (`runtime/activity/hub.ts`).
- **The stream.** `GET /api/panel/changes` is the page's one push connection.
  It carries these topics: `gateway` (read the gateway snapshot again; see the
  client gateway architecture), `conversation` (`{ conversationId, version }`:
  read that thread again), `activity` (`{ projectId, version }`: read that
  project's live activity again), `model-access` (read the Secret Keys snapshot
  again) and `context` (read the client snapshot again: the person's current
  project or open Flow changed; see "The person's current project" below). `version` is a per-stream sequence from 1
  with no gaps, never Core's own count. An event carries no content, only an id
  the caller may already read; the browser reads through the existing
  IAM-checked endpoints. Repeats are coalesced until sent.
- **Who hears what.** The stream is decided as a watch over what the caller
  may read: `studio:ListConversations` on the workspace, the filtered list a
  person holds, with `programs.read` of a panel caller
  (`APP_ROUTE_IAM_CONTRACTS`), re-checked around every chunk. Each change is
  then decided as the read it prompts (`caller-reads.ts`): a project's thread by
  `studio:GetConversation` on the project and the project in the caller's
  domain scope, as `get-conversation` decides it; a panel thread only for the
  person whose thread it is, and `studio:GetPanelThread` on their own user; a
  project's activity by `studio:GetActivity` on the project. Decisions are
  unrecorded, reused per project, and forgotten when IAM says a decision may
  have changed. A decision that cannot be made fails the stream rather than
  drop the change. Each workspace's stream hears only that workspace's Core, so
  another tenant's thread never reaches it. A paired client is told of no
  thread or activity: those reach it over the gateway socket. A hosted user
  who may not read the gateway snapshot still holds the stream, without its
  gateway topic, which is why the topics share one stream instead of riding on
  the snapshot's route.
- **Browser.** `features/panel-changes/` opens one `EventSource` per page,
  shared by the gateway reader, the chat's change feed
  (`chat-widget/transport/changes-port.ts`) and its activity port
  (`chat-widget/activity/activity-port.ts`). Each reader reads once when the
  stream opens, again whenever it re-opens or a number is skipped (a change may
  have been missed), and once per change it names. There is no timer fallback:
  while the stream is down readers show that, and a closed stream opens again
  when the tab is shown, the network returns, or a reader asks. The activity
  port also reads when the chat moves to a thread of another project
  (`followProject`).
- **In-process only.** Signals do not leave the process. A hosted deployment
  that serves one workspace from several processes needs a shared signal
  (hosted follow-up 7); until then a turn written by another process reaches
  a panel only when its stream next reopens.
- **No poll in the widget either.** The panel's change feed says it is
  complete (`ChatChangesPort.complete`: it tells of every change, whoever made
  it, and once whenever its channel opens again or may have missed one), so
  the chat widget runs no read interval beside it (`chat/read-beat.ts`
  answers no beat). It reads when told, and asks about a "missing" model key
  again on each change and when the person turns to the composer. A client
  whose feed is not complete keeps the widget's beat: 4 s alone, a 10 s
  ceiling beside a feed, 5 s for the thread list in the background. The web
  extension's feed is one of those: it pushes only what `server.activity`
  names and tells nothing when its socket reconnects, so it keeps the 10 s
  beat.

### Every chat belongs to a project

Since t1095 there is one kind of chat. A chat the person starts in the panel's dock is a project conversation, in the
project's own conversation store, which the panel's `/chats` and every client (the extension included) read, so the panel
and the extension show the same chat.

- **Which project.** The dock works in the project the top bar has open. With none open, a first message or New chat
  starts in the person's own project, exactly as a paired browser's chat does: `POST /api/client-gateway/first-project`
  answers their latest own project, or makes their first one ("My automations"); the panel asks in the domain its page is
  scoped to, or unscoped (`automationStudioPersonProject`'s `unscoped`). The panel then opens that project, which also
  makes it the person's current one (below). The dock's transport is `chat-widget/transport/`
  (`composed-conversation-port.ts`, `project-to-start.ts`, `ask-first-project.ts`).
- **The list.** The open project's chats (every project's with none open), then the person's earlier chats from before
  this, which belong to no project and are titled "No project · <title>". An earlier chat still opens, continues, answers
  its cards, renames and deletes where it lives, on the panel assistant's endpoints below, and in `/chats` it links to
  `/chats/<conversationId>` with no project; nothing new is made there. `/chats/<conversationId>?project=<projectId>`
  opens a project's chat, which is how "Open in FluxIQ panel" from a client lands on the same conversation.
- **The panel's own tools in a project chat.** A project chat's reading of a message chooses among Core's own commands
  and the panel's capabilities. A panel caller's vocabulary is also offered Core's `panel.assistant` command ("Anything
  else in the FluxIQ panel", `runtime/conversations/commands/panel-assistant/`), never a paired client's. Chosen, it
  hands the message to the panel assistant through `automation-studio/work-in-project-thread`
  (`{ projectId, conversationId, answerTurnId }` answering `{ ending, spentUsd }`, `PANEL_ASSISTANT_PROJECT_ENDPOINTS`),
  decided on the project and refused to a paired client. That endpoint reads the person's stored turn for their words and
  page, and runs the assistant's own loop, tools, Allow cards and per-message allowance into the project's thread
  (`PanelAssistant.workInProject`, `runtime/conversations/assistant/store/project-threads.ts`), with the thread's own
  project as its context. The command runs as background command work, so a delete of the thread is refused while it
  runs, and its last line says how the work ended.
- **Its cards.** Every card the assistant raises is `ask.assistant.<uuid>`. In a project thread it is answered through the
  project's own `answer-ask`, which hands it to the assistant (`answerInProject`): exactly the call the card kept runs,
  once, and only for the person whose message raised it, since that call is kept in their own panel database; anyone
  else is refused before the ask is settled. A paired client is refused with "This question was asked by the FluxIQ
  panel's tools. Answer it in the FluxIQ panel." A step's navigation, or a reference into another project, is read through
  `get-conversation-attachment` as a panel thread's would be, each project decided by IAM and its domain.
- **The page a message was written on.** The dock keeps what the person had open with each message as a person-turn
  attachment, `panel.on-screen`: base64url JSON of the chat's `onScreen` (page, selection, `flowId`, `runId`), within
  the 1000-character reference limit (a longer selection keeps its page and named ids and leaves out its step and node
  lists). It is written by `chat-widget/transport/with-on-screen.ts`, read strictly through `panelAssistantContextOf`
  (`runtime/conversations/assistant/context/on-screen-attachment.ts`), and hidden by the panel's attachment port. The
  work on a message, and an Allow pressed later, is judged by what was selected when it was said.
- **On the e2e fixture host** (its marker and `FLUXIQ_E2E_SCRIPTED_ASSISTANT`), the project chat's reading is replayed
  from the scripted assistant's script (`runtime/conversations/assistant/model/chat-model-binding.ts`): a scenario's
  message is handed to `panel.assistant`, or to the capability its `chat` names.

### The person's current project

The person's current project and open Flow are one value, per person, kept by the panel's host and shared by the panel
and every client: `POST /api/client-gateway/automation-studio-context` sets it (the panel, and a paired client for
itself; the route is described in the client gateway architecture), and the client snapshot reads it back.

- **The panel** (`features/panel-shell/context/`): on load it adopts `?project=` from the address, else Core's value, else
  what the browser remembered, which is only the fallback when Core holds none or cannot be read. A project the person
  picked before Core answered stands. Every switch is written to Core, and so is a Flow a page opens; leaving a Flow's
  page writes nothing, so a client's open Flow is not cleared. A project Core holds that the panel cannot see is dropped
  locally and kept in Core.
- **Following.** A committed write signals the person's own streams (`context`, `app/api/panel/changes/topics/context.ts`,
  one registry on `globalThis` so the writing route and the stream route reach the same listeners). The panel reads Core
  again on `context`, and whenever its stream opens again, and follows without writing back.
- **Recordings** a paired client starts go into this value whatever its age (`resolveClientRecordingProject`); the
  five-minute lease it once carried was a staleness guard for a value only an open Studio page wrote, and is gone.

### The panel assistant's endpoints

Earlier chats are panel threads: the panel assistant's own chats, one database per person outside every project (`runtime/conversations/assistant/store/`). Its endpoints are `automation-studio/<name>` (`programs/automation-studio/api/panel-assistant/`). Each declares `endpointResource.selfUser()`, except the two allowance endpoints, which change one value for the whole workspace and so declare `endpointResource.workspace()`, as the assistant's model setting does. Each takes the user from the signed-in actor and never from the payload, refuses a paired client (the extension keeps its own threads), and is hidden from the assistant's tools:

| Endpoint | Body | Answer |
| --- | --- | --- |
| `list-panel-threads` | `{ limit? }` | `{ conversations }` |
| `get-panel-thread` | `{ conversationId, sinceTurnId?, limit? }` | `{ conversation }` |
| `get-panel-thread-attachment` | `{ conversationId, turnId, projectId? }` | `{ attachment: { attachment, payload } \| null }` |
| `open-panel-thread` | `{ title? }` | `{ conversation }` |
| `rename-panel-thread` | `{ conversationId, title }` | `{ conversation }` |
| `delete-panel-thread` | `{ conversationId }` | `{ deleted: true, conversationId }` |
| `send-panel-message` | `{ text, conversationId?, title?, onScreen? }` | `{ conversation, turn }` |
| `answer-panel-ask` | `{ askId, kind: "grant" \| "deny" }` | `{ ask }` |
| `get-panel-assistant-allowance`, `set-panel-assistant-allowance` (declared on the workspace) | `{ allowanceUsd? }` | `{ allowanceUsd, chosen, defaultUsd }` |

- **Attachments** follow `get-conversation-attachment`'s contract: null for a turn the person's threads do not hold or a turn that shows nothing, and a thrown refusal, never an empty payload, for a kind that cannot be served. A `panel.client-action` turn answers the navigation its reference holds. A kind that refers to a project's record, such as `flow-graph-diff`, is stored with the project it was made in (`{"projectId","ref"}`, `runtime/conversations/assistant/attachments/project-ref.ts`; the assistant refuses to post one without a project) and is read in that project, whatever project the request names. A reference stored before that, without a project, is read in the project `projectId` names, and refused without one or with the thread's own `panel`. Either way it uses the same resolver and limits as a project thread's, the project is decided by IAM through the registry as a call of `studio:GetPanelThreadAttachment` naming it, and its domain scope is asserted before anything in it is read.
- **Rename and delete** are `programs.write` and `authoring`, with no PIN, as `rename-conversation` and `delete-conversation` are. They use the same codes. A rename trims the title and checks it before the thread: `conversation_title_required`, or `conversation_title_too_long` over 200. A thread the person does not have is `conversation_not_found`. Because the only database looked in is the caller's own, another person's thread answers exactly as a missing id. A delete removes the thread, its turns, its asks, the mutation records that carried them, and the calls its cards waited on, in one transaction. The waiting calls go through the panel database's `9004` trigger. The delete is refused with `conversation_run_active` while a message's or an answered card's work still uses the thread (`runtime/conversations/assistant/thread-use.ts`). That in-process work is the whole of a panel thread's link to work: its cards never park a run, and runs or builds a tool starts write into their own project's threads.
- None of these is on the paired-client allowlist.
- Under the `service` IAM profile, `FluxIQUserAccess` grants the person's own thread endpoints (list, read, read an attachment, open, rename, delete, send and answer) through its `OwnPanelAssistant` statement (`OWN_PANEL_ASSISTANT` in `platform/iam/predefined/user-access.ts`): on their own `user/${fluxiq:PrincipalId}`, and only when `fluxiq:RequestOrigin` is `panel`, so a paired browser's credential never reaches them that way. It does not grant `set-panel-assistant-allowance`, which changes one value for the whole workspace; reading the allowance is granted on the workspace by `IAM_USER_WORKSPACE_SETTING_READS`.

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
