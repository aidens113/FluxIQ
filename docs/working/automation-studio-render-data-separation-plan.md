# Automation Studio Render and Data Separation Working Plan

Status: Implementation, automated validation, authored documentation, and the
current-panel live browser regression are complete; the separately hosted
seeded small/scale browser matrix remains an operational certification run
Created: 2026-08-28
Last updated: 2026-08-29
Primary scope: `apps/web/src/features/automation-studio/`

## Why This Plan Exists

The previous refactor made `AutomationStudioLive.tsx` small but did not finish
runtime separation. Responsibility moved into
`live/AutomationStudioComposition.tsx`, which still subscribes to broad domain
state, derives an aggregate project model, constructs every view input, and
republishes those inputs through the workspace.

A local gesture can still cause several store writes, composition renders,
model resolutions, publisher renders, reconciliation effects, and layout passes
before selected state paints. This occurs with one empty Flow and is not
fundamentally an API, SQL, project-size, or cache-miss problem.

This plan fully separates interactive rendering from project data, background
work, persistence, and view-domain rendering. File movement is not completion;
runtime ownership, notification topology, and measured render evidence are.

## Non-Negotiable Result

1. A browser event updates one immediate UI owner.
2. Only the affected visual region rerenders.
3. Changed visual state is paintable in the same frame.
4. Data, cache, persistence, and reconciliation start after that commit.
5. Background results update only requesting subscribers.
6. Background failure never rolls navigation back.

A warm view selection must not require aggregate project derivation, a
composition-root render, canonical republication, hierarchy generation, graph
conversion, persistence, URL mutation, API response, or effect confirmation.

## Explicit Separation

### Presentation Plane

Owns active views/panes, hierarchy focus/expansion/filter, compact semantic
selection, overlays and drafts, shell dimensions, view-local UI state, and
transient Flow-canvas interaction. It contains compact references, never project
collections or hydrated documents.

### Domain Plane

Owns normalized projects, Flows, Subflows, recordings, instructions,
adaptations, timelines, runtime runs, state, node definitions, settings,
artifacts, validation, and keyed loading/error/freshness. Views subscribe
directly to narrow domain selectors.

### Command Plane

Stable commands are created outside render-sensitive components and read current
snapshots at invocation. They cannot own presentation state or synchronously
block presentation. Stale project generations cannot commit.

### Background Plane

Owns requests, cancellation, preload, cache, persistence, synchronization, and
worker-suitable indexing. Work yields to input, is cancellable, and does not
subscribe the shell to lifecycle state.

### Persistence Plane

Consumes compact mutation records after UI commits. It does not observe whole
React models, serialize the workspace per click, or own active view.

## Target Runtime Topology

```text
ProgramWorkspace
  -> AutomationStudioBootstrap
       -> creates stable stores and services once
       -> AutomationStudioFrame
            -> StudioHeaderRegion       [shell selectors only]
            -> HierarchyRegion          [hierarchy UI + selection reference]
            -> WorkspaceRegion          [workspace selectors only]
                 -> ViewSlot
                      -> CanonicalViewBoundary
                           -> domain-owned connector
                                -> narrow domain selectors
                                -> domain renderer
            -> OverlayRegion            [overlay store only]
       -> BackgroundRuntime              [renders no product UI]
```

There is no aggregate `projectView` between stores and this tree, no component
receiving all canonical view models, and no publisher pass pushing every view
input after unrelated state changes.

## Target Ownership Layout

```text
automation-studio/
  bootstrap/      stable runtime creation and project generation
  shell/          independently subscribed visual regions
  presentation/   workspace, selection, hierarchy, overlay, canvas UI stores
  domain/         normalized resource and query stores
  background/     requests, preload, cache, persistence, synchronization
  views/
    registry/     stable definitions and resolution
    host/         view slots and local loading/error boundaries
    connectors/   one narrow domain connector per canonical view
```

Existing domain directories may remain renderer owners. Each connector subscribes
directly to its domain; the shell cannot import its model builder.

## State Ownership Matrix

| State | Sole owner | Forbidden owners |
| --- | --- | --- |
| Active view per slot | Workspace UI store | local mirror, domain store, cache |
| Open views and placement | Workspace UI store | project model, selection store |
| Semantic selection reference | Selection UI store | workspace prefs, aggregate model |
| Tree expansion/filter/focus | Hierarchy UI store | workspace and project data |
| Overlay/form draft | Overlay UI store or local reducer | composition/project data |
| Canvas transient interaction | Canvas UI controller | global stores during pointer move |
| Normalized resources | Domain stores | shell, workspace, hierarchy UI |
| Loading/error/freshness | Domain/query store by key | composition root |
| Durable layout snapshot | Persistence writer/cache | active-view authority |
| Request lifecycle | Background runtime | unrelated React state |

Every field has one authoritative owner. Effect-synchronized mirrors are
prohibited for active view, selection, tree focus, project identity, and pane
placement.

## Exact Interaction Contracts

### Open a Hierarchy Object

One synchronous presentation transaction resolves the row navigation descriptor,
sets semantic selection, ensures and activates the destination view, updates
hierarchy focus, and emits once per affected owner. Only affected rows, the tab
strip, and destination slot are notified.

After paint, the destination connector reads normalized cached detail and paints
ready, loading, empty, or error state. It schedules missing detail independently.
There is no optimistic activation store and no effect confirms active view.

### Select an Inner Tab

One workspace UI commit changes one slot active ID. Hidden views retain local
state according to mount policy but do not rerender merely because another view
activated. Persistence receives a compact record later.

### Expand or Filter Hierarchy

Only hierarchy UI state changes. Projection uses stable parent/child indexes.
Expansion cannot update selection, workspace layout, or project data.

### Interact with the Flow Canvas

Hover, marquee, drag preview, and viewport movement stay in the canvas runtime.
Raw pointer movement mutates refs or an imperative layer and schedules at most
one visual update per frame. Only settled operations create graph commands.

### Open a Cold View

Workspace activation happens first and a local boundary paints immediately. The
connector requests only its bounded query. Completion updates only that
connector and cannot change active view.

## Prohibited Patterns

- composition components subscribing to domain collections;
- aggregate props containing several canonical view models or commands;
- grouped canonical view publishers;
- selector factories or controller mutation during render;
- effects copying active view or selection between owners;
- persistence triggered by ordinary selection or focus;
- whole-project arrays passed through shell or hierarchy;
- `JSON.stringify` equality/signatures in interaction paths;
- request lifecycle in unrelated React state;
- hidden-view renders caused only by another view activating;
- URL mutation as ordinary in-program navigation;
- navigation rollback because detail/cache work failed.

## Performance Gates

| Scenario | Required result |
| --- | --- |
| Empty hierarchy selection | selected row and shell paint in <= 1 frame |
| Warm tab activation | click p95 < 8 ms; paint <= 1 frame |
| Cold tab activation | local loading boundary paint <= 1 frame |
| Folder toggle | no composition, domain view, or pane render |
| Overlay typing | no shell, hierarchy, or domain view render |
| Canvas pointer movement | zero React state updates per raw event |
| Domain entity update | zero layout, tab-strip, unrelated-view renders |
| Workspace resize | zero project-model or hierarchy work |
| Cache/sync completion | no active-view or selection change |
| No-op command | zero subscriber notification |
| Full interaction suite | no update-depth warning or activation cycle |

Budgets are architectural gates, not optional optimization goals.

## Implementation Phases

### Phase 0 - Reopen Architecture Status

Status: Complete

0.1 Mark the runtime-separation claim in the previous refactor as superseded by
this plan while preserving valid completed extractions.

0.2 Trace and record root subscriptions, store writes per gesture,
effect-driven reconciliation, canonical publication, and view activation.

0.3 Add deterministic empty, medium, and scale fixtures requiring no API.

0.4 Add render probes for bootstrap, frame, hierarchy, tab strip, every active
slot, overlays, and domain connectors.

0.5 Record synchronous store commits and React commits for hierarchy click, tab
click, folder toggle, overlay input, canvas selection, and resize.

0.6 Put baseline traces and measurements in this document.

Gate:

- Every redundant commit has a named owner and reproduction.
- Empty-project lag is reproducible without requests.
- Existing behavior is protected before replacement.

### Phase 1 - Stable Runtime Bootstrap

Status: Complete

1.1 Introduce one runtime factory owning store creation, background services,
command buses, cache adapters, and project generation.

1.2 Create the runtime once per mounted Studio instance; selection, view, and
data changes cannot recreate it.

1.3 Replace the foundation mega-hook with stable runtime access and small
provider boundaries.

1.4 Split composition into bootstrap and frame. Bootstrap may own lifecycle but
renders no project-derived model.

1.5 Remove domain collection subscriptions from bootstrap and frame.

1.6 Make project switching a generation-scoped runtime command instead of store
owner reconstruction.

Gate:

- Bootstrap renders only on mount, identity/capability change, and unmount.
- Presentation and resource changes create zero bootstrap renders.
- Runtime identity remains stable for the session.

### Phase 2 - One Presentation Transaction System

Status: Complete

2.1 Make the workspace UI store the only active-view owner.

2.2 Delete the optimistic activation-store, canonical-store, and local-state
triangle.

2.3 Remove `MountedViewStack` active-view mirroring effects.

2.4 Define one synchronous presentation transaction for hierarchy navigation
and other cross-UI gestures.

2.5 Compute next states first, apply equality guards, and emit once after all
affected owners are consistent.

2.6 Make presentation commands stable and read current snapshots at invocation.

2.7 Add no-op guards to every presentation mutation.

Gate:

- A tab click creates one workspace commit and one active-slot render.
- A hierarchy click creates one batched presentation transaction.
- No effect confirms activation and no view can cycle backward.

### Phase 3 - Shell Render Isolation

Status: Complete

3.1 Build independent header, hierarchy, workspace, and overlay regions.

3.2 Give each region direct narrow presentation selectors.

3.3 Remove aggregate shell props and freshly assembled region option objects.

3.4 Move resize/pointer state out of React loops and publish settled dimensions
at animation-frame or pointer-end boundaries.

3.5 Make overlays siblings that cannot rerender workspace content.

3.6 Add stable loading/error boundaries per region.

Gate:

- Each shell gesture rerenders only its owning region.
- Region probes prove independent commit counts.
- Shell modules import no project-domain model builders.

### Phase 4 - Hierarchy Runtime Replacement

Status: Complete

4.1 Separate the hierarchy resource index from hierarchy UI state.

4.2 Store stable node descriptors by ID with parent/child ID indexes.

4.3 Make rows subscribe to their own selected, focused, and expanded state
instead of rerendering the recursive tree for one selection.

4.4 Replace render-time `controller.updateContext()` with stable construction
and explicit store reads.

4.5 Remove effect-based external-selection/focus write loops. Reconciliation
must occur in the initiating transaction or an idempotent command outside render.

4.6 Virtualize visible rows with stable row keys and descriptors.

4.7 Maintain search indexes incrementally instead of rebuilding the hierarchy on
each input or selection.

4.8 Keep expansion, focus, and filtering local. Object open uses the single
presentation navigation transaction.

Gate:

- Selecting a row renders only previous/next rows, tab strip, and destination.
- Folder toggles do not render domain views or the workspace frame.
- No hierarchy write occurs during render or reconciliation effect.

### Phase 5 - Direct View Connectors

Status: Complete

5.1 Remove `useAutomationProjectView` as an aggregate live-render dependency;
retain only pure narrow selectors used by individual owners.

5.2 Remove grouped `AutomationCanonicalViewPublishers`.

5.3 Resolve one stable component type and compact scope descriptor per view slot.

5.4 Add one connector per canonical view. It receives only scope references and
subscribes directly to its domain store.

5.5 Move view-model derivation into memoized selectors owned by that connector.

5.6 Create data selectors once at module, connector, or runtime creation; never
during `ViewHost` render.

5.7 Enforce hidden-view policy: warm hidden views keep local state but receive no
unrelated activation or domain updates.

5.8 Remove universal model and command property bags from view bindings.

Gate:

- Activating Settings cannot render Runtime Debug, Flow Editor, Instructions,
  hierarchy projection, or bootstrap.
- Updating a run can render only subscribed Runtime views.
- No grouped canonical publisher remains.

### Phase 6 - Domain and Query Isolation

Status: Complete

6.1 Split universal project data into domain stores or strict slices with
independent revision channels.

6.2 Normalize resources by ID and retain stable list/query result ID arrays.

6.3 Key queries by project, scope, filter, sort, page, and page size.

6.4 Store loading, error, and freshness per query/entity, never as one project
loading flag.

6.5 Preserve selector references after unrelated entity, query, or presentation
updates.

6.6 Remove project-wide arrays from workspace and hierarchy props.

6.7 Keep graph, timeline, state, and runtime detail derivation behind displaying
connectors.

6.8 Move expensive conversion behind cancellable jobs keyed by source revision.

Gate:

- One domain mutation notifies zero unrelated-domain subscribers.
- Presentation changes execute zero domain model builders.
- Scale-fixture selector identity and bounded-work tests pass.

### Phase 7 - Async View Loading Boundaries

Status: Complete

7.1 Give every view explicit ready, loading, empty, error, and stale-ready states.

7.2 Activate a view before cache freshness checks or hydration scheduling.

7.3 Move readiness decisions into the destination connector.

7.4 Reject stale results with project-generation and query tokens.

7.5 Prevent request completion/failure from selecting, closing, reopening, or
redirecting a view.

7.6 Keep previous valid ready data visible during refresh.

7.7 Keep Suspense/error boundaries view-local; no shell-wide fallback.

Gate:

- A cold view paints a local loading surface in one frame.
- Requests render no bootstrap, shell region, tab strip, or unrelated view.
- Rapid switching never returns to an earlier view.

Accepted implementation:

- `view-readiness.ts` owns the request/project-token state machine for ready,
  loading, empty, error, and stale-ready states.
- `AutomationViewBoundary.tsx` keeps loading, error, and Suspense rendering local
  to the destination view while retaining valid data during refresh.
- `ViewHost.tsx` does not select destination data until that destination is ready;
  request completion cannot mutate workspace presentation state.

### Phase 8 - Cache, Persistence, and Preload Separation

Status: Complete

8.1 Presentation stores are canonical for the session; cache restore is only an
optional bootstrap seed.

8.2 Replace whole-workspace observation with compact durable mutation records.

8.3 Queue cache and persistence writes after paint with debounce, coalescing,
generation cancellation, and bounded serialization.

8.4 Cache adapters and persistence writers have no React setters or shell
subscriptions.

8.5 Start lazy preload only after first interactive paint and idle permission.

8.6 Prioritize the active connector's bounded query over preload work.

8.7 Pause background work when input is pending and cancel on project switch.

8.8 Expose queue diagnostics through development telemetry without product-tree
renders.

Gate:

- Cache hit/miss/write/eviction/preload cannot alter active view or selection.
- Persistence does no work inside click or pointer handlers.
- Heavy preload cannot violate interaction budgets.

Accepted implementation:

- `background-work.ts` is the shared after-paint/idle scheduler for cache and
  preload work; it yields while browser input or foreground data work is active.
- The cache coordinator coalesces and caps writes, rejects stale generations,
  propagates cancellation, bounds serialized values, and emits diagnostics
  outside the product render tree.
- Cached workspace data is a navigation-safe layout seed. It cannot restore the
  active view, tabs, selection, or focused object.
- Lazy preload is bounded, cancellable, warm-only, and lower priority than the
  active connector's reads.

### Phase 9 - Flow Canvas Interaction Isolation

Status: Complete

9.1 Add an imperative interaction controller for hover, marquee, dragging,
panning, and viewport preview.

9.2 Use left click for node selection, left drag on a node for movement, right
drag on empty canvas for marquee, and right click on a node for its future menu.

9.3 Remove hand/select mode state and controls.

9.4 Coalesce visual pointer updates to one animation frame; no React state per
raw pointer event.

9.5 Commit graph document changes only on settled operations such as drag end.

9.6 Keep canvas selection local unless the inspector needs a compact reference.

9.7 Run validation, history persistence, and graph conversion after visual
commit and outside pointer handlers.

Gate:

- Pointer handlers remain within budget on the scale graph.
- Drag and marquee stay continuous while background work runs.
- No workspace, hierarchy, or unrelated view renders during movement.

### Phase 10 - Remove Legacy Feedback Paths

Status: Complete

10.1 Delete superseded activation, publication, aggregate-model, and mirror-state
implementations.

10.2 Remove effects copying selection, active view, focus, or workspace state
between owners.

10.3 Remove broad subscriptions and universal render props.

10.4 Remove allowlists permitting oversized composition or aggregate workspace
modules.

10.5 Enforce imports between bootstrap, shell, presentation, domain, background,
and connectors.

10.6 Eliminate interaction-path serialization, render-time controller mutation,
and broad project scans.

Gate:

- Every interaction has one implementation path.
- No legacy path can issue a duplicate commit/render.
- Architecture tests fail if the old topology returns.

### Phase 11 - Browser and Scale Certification

Status: Current-panel live regression complete; dedicated seeded small/scale
fixture-host certification remains

11.1 Test stores, transactions, selector identity, and stale-generation rejection.

11.2 Add component render-count tests for every shell region and connector.

11.3 Run browser traces on empty, medium, and scale fixtures.

11.4 Measure handler duration, React commit count/duration, frame latency, long
tasks, and layout duration.

11.5 Rapidly alternate sidebar and tab selections to prove no redirect/cycle.

11.6 Test overlay typing, hierarchy filtering, resize, canvas marquee/drag, and
project switching while cache/preload work runs.

11.7 Run relevant repository checks, tests, and production build.

11.8 Record actual measurements and exceptions in this document.

Gate:

- Every correctness and performance budget passes.
- Empty interactions produce no long task or redundant root commit.
- Scale interaction cost remains bounded by visible work.

### Phase 12 - Documentation and Closure

Status: Documentation and current-panel evidence complete; dedicated seeded
fixture-host evidence remains tracked under Phase 11

12.1 Update `docs/architecture/automation-studio/workspace.md` with the final
presentation/domain/background topology.

12.2 Document adding a connector, query, command, and local loading boundary
without crossing ownership planes.

12.3 Update profiling and scale-certification documentation with new probes.

12.4 Mark superseded plans accurately; browser completion requires browser
evidence.

12.5 Record final ownership, removed modules, commands, measurements, and
residual risk here.

Gate:

- Authored documentation matches runtime behavior.
- This document contains evidence for every phase.
- Completion requires Phase 11 browser certification.

## Required Architecture Tests

1. Bootstrap/frame cannot import domain model builders.
2. Shell cannot import domain stores or API clients.
3. Domain stores cannot import presentation stores.
4. Connectors import only owning domain surfaces and compact scope references.
5. No grouped component receives multiple canonical view models.
6. No render body calls selector factories or mutating controllers.
7. No effect copies active-view or semantic-selection state.
8. Store no-ops preserve identity and emit zero notifications.
9. Presentation transactions emit once per affected owner.
10. Hidden warm views do not render on unrelated activation.
11. Background transitions do not render shell regions.
12. Pointer movement does not call React state setters.

## Migration Rules

- Migrate one interaction or canonical view completely before deleting its old
  path.
- Never dual-write old and new active-view or selection owners.
- Temporary adapters may read legacy domain data, but presentation state has one
  owner from Phase 2 onward.
- Add new behavior only to the target topology.
- Update this document after every step with changed files, removed paths,
  tests, measurements, and deviations before starting the next step.
- Mark a phase complete only when its gate passes. File movement is not enough.
- Preserve unrelated worktree changes.

## Step Update Template

```text
### YYYY-MM-DD - Step X.Y

Status: Complete | Blocked
Changed:
- exact files and ownership changes

Removed:
- old subscriptions, writes, effects, or render paths

Evidence:
- tests and measurements

Plan impact:
- next step or documented deviation
```

## Progress Ledger

| Phase | Status | Evidence |
| --- | --- | --- |
| 0. Reopen architecture status | Complete | Deterministic fixtures and synchronous interaction traces recorded |
| 1. Stable runtime bootstrap | Complete | Bootstrap owns stable runtime identity and no project/resource/selection subscriptions |
| 2. Presentation transactions | Complete | One active-view owner, one guarded workspace commit, batched navigation |
| 3. Shell render isolation | Complete | Independent memoized shell regions with local Suspense/error boundaries |
| 4. Hierarchy runtime replacement | Complete | Row-local controls, bounded projection, no render/effect writeback |
| 5. Direct view connectors | Complete | Destination-owned active-only connectors; grouped publishers and aggregate live hooks deleted |
| 6. Domain/query isolation | Complete | Normalized stores/queries, narrow active connectors, cancellable revision-keyed graph work |
| 7. Async loading boundaries | Complete | Local ready/loading/empty/error/stale-ready state with generation rejection |
| 8. Background/cache separation | Complete | Input-yielding after-paint cache/preload queue with bounded generation-scoped work |
| 9. Flow canvas isolation | Complete | Imperative frame-coalesced pointer controller with settled React publication |
| 10. Legacy path removal | Complete | 23 executable architecture contracts, 904 web tests, web check, and production build pass |
| 11. Browser/scale certification | Current panel complete; seeded fixture host remains | Live empty-project workflow passes with 0-0.2 ms selection commits; deterministic large-project suites pass |
| 12. Documentation and closure | Complete for current-panel incident | Authored/operations docs, supersession notices, live measurements, and final evidence record complete |

## Decision Record

### DR-1: Composition Is Not a View-Model Owner

Accepted. The root creates stable runtime services and mounts independent
regions. It does not subscribe to project collections or derive view models.

### DR-2: Active View Has One Owner

Accepted. The workspace UI store is sole authority. Optimistic activation and
local mirrored active-view state are removed.

### DR-3: Views Pull Narrow Data

Accepted. Each connector subscribes directly to normalized domain selectors.
Models are not pushed through shell or a publisher farm.

### DR-4: Loading Never Owns Navigation

Accepted. Navigation paints immediately. Readiness only selects the local
ready/loading/empty/error surface inside the destination.

### DR-5: Persistence Observes Mutations, Not React Models

Accepted. UI commits are canonical in memory. Write-behind persistence cannot
delay, confirm, or roll back interaction.

### DR-6: Completion Requires Render Evidence

Accepted. Line count, file count, text-visibility tests, and successful build do
not prove responsiveness. Render counts and browser frame latency are required.

## Implementation Journal

### 2026-08-28 - Steps 1.1 and 1.2

Status: Complete

Changed:

- Added a stable runtime owning domain/UI/workspace stores, request coordination,
  and project generation.
- Added one-time React runtime creation and disposal.
- Foundation now consumes stable runtime owners and request service.

Removed:

- Root-level construction of store owners and request coordination.

Evidence:

- Bootstrap architecture, identity, generation, and request tests: 7 passed.

Plan impact:

- Phase 1 continues with lifecycle/frame separation and removal of frame domain
  subscriptions.

### 2026-08-28 - Step 5.6

Status: Complete

Changed:

- View registrations retain one selector and ViewHost invokes it directly.

Removed:

- Selector factory creation from the ViewHost render path.

Evidence:

- Complete views suite reported by worker: 44 tests passed.
- Focused selector suites: 9 tests passed.

Plan impact:

- Phase 5 remains open until grouped publishers and universal view property bags
  are removed.

### 2026-08-28 - Steps 2.1 through 2.3

Status: Complete

Changed:

- Workspace render store is the sole active-view authority.
- Tab activation commits synchronously with no-op guards.
- Warm-view state now controls mounting only.

Removed:

- Optimistic mounted-view activation store.
- MountedViewStack local active-view state and synchronization effects.
- Warm-registry activation notifications.

Evidence:

- Workspace suite reported by worker: 90 tests passed.
- Scoped strict TypeScript validation passed.

Plan impact:

- Phase 2 continues with a batched hierarchy-navigation transaction and removal
  of compatibility scheduler/warm arguments in the live runtime.

### 2026-08-28 - Phase 0

Status: Complete

Changed:

- Added deterministic medium and scale project fixtures.
- Added request-free synchronous interaction/store/render tracing.
- Recorded current empty-Flow hierarchy navigation ownership.

Baseline evidence:

- Hierarchy object open publishes hierarchy, selection, and workspace stores in
  that order.
- The baseline exposes six named render opportunities.
- Medium fixture contains 21,440 entities.
- Default scale fixture contains 34,816 entities.
- Fixture and trace tests: 6 passed.

Plan impact:

- Later certification compares the replacement topology to this recorded
  browser-side baseline without treating API timing as interaction work.

### 2026-08-28 - Steps 2.4 through 2.7

Status: Complete

Changed:

- Added one cross-store presentation transaction boundary.
- Hierarchy selection and destination activation now commit synchronously in one
  transaction.
- Removed deferred scheduling and warm activation from live command creation.
- Added final-state and no-op publication tests.

Removed:

- Deferred selection-navigation queue from ordinary object selection.
- Live command-port dependency on the workspace scheduler.

Evidence:

- Store, live ownership, workspace command, and component tests: 48 passed.

Plan impact:

- Phase 2 gate is implemented in code; final phase status waits for hierarchy
  refinement and broad type/check validation.

### 2026-08-28 - Steps 4.4 and 4.5

Status: Complete

Changed:

- ProjectTree retains one controller and exposes current command context through
  a stable accessor.
- External selection and visible focus are derived without hierarchy writes.
- Cache hydration remains an explicit non-persisting bootstrap operation.

Removed:

- Controller mutation during React render.
- Effect-driven external-selection reconciliation and focus-correction writes.

Evidence:

- Hierarchy and synchronous interaction trace suites: 84 tests passed.
- Full web TypeScript check passed.

Plan impact:

- Phase 2 is complete.
- Phase 4 continues with row-level subscriptions, virtualization, and
  incremental search projection.

### 2026-08-28 - Steps 1.3 and 1.4

Status: Complete

Changed:

- AutomationStudioComposition is now a bootstrap-only facade.
- The subscribed implementation lives in AutomationStudioSession and receives
  the stable runtime explicitly.
- The foundation consumes the injected runtime instead of creating owners.
- Architecture taxonomy now explicitly recognizes bootstrap and presentation
  planes.

Removed:

- Project/domain subscription ownership from the public composition boundary.

Evidence:

- Bootstrap, live ownership, render-boundary, and architecture suites: 50 tests
  passed.
- Full web TypeScript check passed.

Plan impact:

- Phase 1 continues until broad domain subscriptions are removed from the
  visual session/frame path.

### 2026-08-28 - Presentation Transaction Follow-up

Status: Complete

Changed:

- Tree selection, created-Flow navigation, and Flow breadcrumb activation now
  use the immediate presentation transaction.

Removed:

- Remaining frame-plus-timeout scheduling from ordinary hierarchy and
  breadcrumb navigation.

Evidence:

- Live ownership, hierarchy interaction, and store suites: 42 tests passed.
- Full web TypeScript check passed.

Plan impact:

- Ordinary sidebar, tab, and breadcrumb navigation now share one synchronous
  presentation path.

### 2026-08-28 - Steps 4.6 and 4.7, Projection Boundary

Status: Complete

Changed:

- The sidebar and tree now consume one hierarchy projection for a render
  instead of independently filtering the complete node array.
- Hierarchy indexes cache normalized search text with stable descriptors and
  are shared by node-array identity.
- Match totals are emitted by the projection that already performs filtering.
- Expanded branches retain stable row keys, page siblings in bounded groups,
  and use CSS content virtualization to skip layout and paint for off-screen
  branches.

Removed:

- The sidebar's second full-node search and type-filter scan on every render.
- Repeated lowercase label construction during each filter projection.

Evidence:

- Hierarchy state, tree, and model suites: 38 tests passed.

Plan impact:

- Steps 4.6 and 4.7 are complete for the current recursive hierarchy surface.
- Phase 4 still requires the row-local subscription boundary and final
  interaction render-count gate.

### 2026-08-28 - Phase 3, Shell Render Isolation

Status: Complete

Changed:

- Header, hierarchy, main editor, inspector, timeline, workspace surface, and
  composition now have explicit memo boundaries.
- Shell-owned region elements and aggregate session bindings retain identity
  until their own inputs change.
- Header command and inspector bindings no longer depend on freshly assembled
  wrapper objects.
- Every shell region has its own Suspense and error boundary, reset by project
  identity.
- Existing resize sessions continue to write transient dimensions directly to
  DOM styles and publish only the settled value.

Removed:

- Re-entry into every shell region when one region selector changes.
- Shell-wide loading and render-failure propagation.
- Fresh hierarchy, timeline, project, workspace, view, header, and inspector
  binding objects on unrelated session renders.

Evidence:

- Live ownership and workspace component suites: 35 tests passed.
- The earlier shell-focused suite also passed 37 tests before the region
  boundaries were added.

Plan impact:

- Steps 3.1 through 3.6 and the Phase 3 code gate are complete.
- Browser render-count certification remains part of Phase 11.

### 2026-08-28 - Phase 5, Canonical Input Identity

Status: Complete

Changed:

- Canonical view models, commands, and inputs now retain per-view structural
  identity across unrelated session renders.
- Event command wrappers have stable identities while still invoking the
  latest command implementation.
- Publisher and grouped-publisher components are memoized.
- A changed view source entry is replaced once; effect cleanup no longer
  removes and republishes it during an ordinary update.

Removed:

- Aggregate input invalidation caused by freshly assembled state and command
  wrapper objects.
- Temporary null source entries and duplicate notifications during publisher
  replacement.

Evidence:

- Canonical input identity, composition, renderer, domain-binding, and live
  ownership suites: 49 tests passed.

Plan impact:

- The identity prerequisite for Steps 5.4, 5.5, and 5.7 is complete.
- Phase 5 remains in progress until the aggregate project view and grouped
  publishers are replaced by direct view-local connectors.

### 2026-08-29 - Step 1.6, Runtime Project Generation

Status: Complete

Changed:

- Project lifecycle now consumes the generation owner created by the stable
  Studio runtime instead of maintaining a second private counter.
- Project hydration, cache restore, runtime summary, Flow detail, node
  definition, timeline, and recording-detail commits verify the shared
  generation before publishing.
- Reopening the same project still invalidates work from the previous project
  session because generation, rather than project ID alone, owns freshness.

Removed:

- Independent lifecycle generation authority.
- Same-project stale-result acceptance based only on active project ID.

Evidence:

- Project lifecycle, bootstrap runtime, and live ownership suites: 36 tests
  passed.

Plan impact:

- Step 1.6 is complete.
- Phase 1 remains in progress only for removal of broad domain subscriptions
  from the session/frame path in Steps 1.3 and 1.5.

### 2026-08-29 - Phase 4, Row-Local Hierarchy Rendering

Status: Complete

Changed:

- Recursive branch traversal is separated from the memoized row-control
  surface.
- Row components receive only local selected, correlated, focused, collapsed,
  container, descriptor, and command values.
- Unchanged rows retain their icons, menus, buttons, and DOM while selection
  traverses bounded branch descriptors.

Removed:

- Full selection and hierarchy collections from the memoized row props.
- Rebuilding every visible row menu and control subtree for one selection
  change.

Evidence:

- Hierarchy tree, state, and model suites: 38 tests passed.
- Earlier projection, no-feedback, paging, and off-screen virtualization tests
  remain green in the same suites.

Plan impact:

- Steps 4.1 through 4.8 are complete in code.
- Exact browser commit-count and interaction-budget evidence is deferred only
  to the Phase 11 certification pass.

### 2026-08-29 - Phase 9, Flow Canvas Interaction Isolation

Status: Complete

Changed:

- Node movement, hover, viewport previews, and right-drag marquee updates now
  run through one imperative, frame-coalesced interaction controller.
- Right-button movement draws a selection box; a stationary right click is
  reserved for contextual actions without changing selection.
- React graph and selection state publish only at settled drag, marquee,
  connect, delete, or explicit selection boundaries.
- Canvas callbacks read current owners through stable refs and retain callback
  identity.
- Cancellation releases pointer capture and clears queued transient work.

Removed:

- React state publication for every raw canvas pointer movement.
- Duplicate graph draft publication during node deletion.
- Inline canvas callbacks that changed identity on every editor render.

Evidence:

- Complete Flow Editor directory suite: 31 tests passed.
- Parent review confirmed frame cancellation, capture release, and no transient
  global Studio writes.

Plan impact:

- Steps 9.1 through 9.8 are complete in code.
- Real-browser pointer latency and canvas frame budgets remain part of Phase 11.

### 2026-08-29 - Phase 6, Normalized Store Foundation

Status: Complete

Changed:

- Project entities are normalized into stable per-kind maps and ordered ID
  arrays with exact collection, entity, detail, page, and resource scopes.
- Query keys include project, domain scope, normalized filter, sort, page, and
  page size.
- Each query owns loading, error, freshness, retained IDs, timestamp, total,
  and cursor state independently.
- Collection selectors retain results across unrelated writes and interleaved
  project-store reads.
- Inline selector functions no longer recreate external-store subscription
  callbacks on every parent render.

Removed:

- Whole-array equality work for normalized collection subscriptions.
- Cross-domain notifications for entity and query mutations.
- Query-wide loading/error state shared by unrelated pages.

Evidence:

- Complete store directory suite: 30 tests passed.
- Parent review verified deterministic key normalization, duplicate-ID removal,
  semantic no-op guards, exact clear notifications, and cross-store identity.

Plan impact:

- Steps 6.1 through 6.5 are complete.
- Phase 6 remains in progress for Steps 6.6 through 6.8: direct connectors must
  consume these stores, broad project arrays must leave shell/hierarchy props,
  and expensive conversion must move behind revision-keyed cancellable jobs.

### 2026-08-29 - Phase 7, Async View Loading Boundaries

Status: Complete

Changed:

- Every registered destination now has explicit ready, loading, empty, error,
  and stale-ready rendering states.
- Readiness is owned by a request/project-token state machine, so late completion
  from an old project or query cannot replace the active destination.
- The destination boundary activates before selecting ready data and retains the
  last valid model while an active refresh runs.
- Suspense and error handling are local to the view surface instead of replacing
  the Studio shell, hierarchy, or tab strip.

Removed:

- Data selection during the loading path.
- Request-driven presentation redirects and shell-wide loading fallbacks.
- A stale external-store subscription closure when the readiness owner changes.

Evidence:

- Focused readiness, view-host, renderer, and graph-editor suite: 30 tests passed.
- `pnpm --filter @fluxiq/web check` passed.

Plan impact:

- Steps 7.1 through 7.7 and the deterministic acceptance gate are complete.
- Real-browser one-frame paint evidence remains part of the Phase 11 certification
  gate and is not inferred from unit tests.

### 2026-08-29 - Phase 8, Cache, Persistence, and Preload Separation

Status: Complete

Changed:

- Cache and preload operations now enter a shared after-paint idle queue and
  repeatedly yield while browser input or foreground project reads are pending.
- Foreground hydration, runtime-summary, and read-through work registers active
  priority so preload cannot contend with a destination the user just opened.
- Cache hydrations and writes carry abort signals, project generations, bounded
  queues, coalescing, and development-only queue metrics.
- Workspace cache payloads contain compact layout preferences only; sidebar
  hydration clears focused and primary object identity.

Removed:

- Immediate timer-based preload/cache execution ahead of the first interactive
  paint.
- Unbounded whole-workspace cache serialization and navigation restoration.
- Stale project work continuing after project switch or generation invalidation.

Evidence:

- Complete sync and workspace-cache suites: 47 tests passed.
- The Phase 7 web typecheck also covered the accepted Phase 8 implementation.

Plan impact:

- Steps 8.1 through 8.8 and the deterministic cache/preload acceptance gate are
  complete.
- Browser interaction-budget measurement remains in Phase 11.

### 2026-08-29 - Continuation Worker Assignments

Status: Complete; all assignments parent-reviewed and recorded in later entries

Parent-owned integration:

- The parent agent remains responsible for reviewing every patch, updating this
  document, deleting superseded paths, resolving cross-phase integration, and
  running final repository validation.

Assigned bounded scopes:

- Phase 5 and remaining Phase 6 connector integration: remove the grouped
  canonical publishers and aggregate live project model in `live/view-host/**`,
  `useAutomationProjectView.ts`, and workspace composition without editing this
  document.
- Phase 6.8 graph work: move expensive graph conversion behind cancellable,
  revision-keyed displaying-subscriber jobs in `graph/**` and
  `useAutomationGraphRuntime.ts`.
- Phase 11 deterministic evidence: strengthen scale fixtures, selector identity,
  stale-generation, render-isolation, and bounded-work tests in `testing/**`;
  real-browser measurements must remain explicitly unclaimed.
- Phase 12 operations docs: update profiling and scale-certification procedures
  without claiming measurements and without editing this working document.

Acceptance rule:

- An assignment changes no phase status until the parent reviews its diff, runs
  the relevant checks, records evidence here, and closes the worker.

### 2026-08-29 - Phase 11, Deterministic Certification Slice

Status: Partially accepted; Phase 11 remains pending browser evidence and final
connector-topology revalidation

Accepted evidence:

- Scale hierarchy projection returns a fixed 100-row visible window over a
  thousands-node fixture.
- Workspace view subscription discovery examines at most 128 logical IDs and
  subscribes to at most 64 exact view IDs, including a one-million-ID sentinel
  fixture.
- Normalized project/query selectors preserve identity across unrelated writes,
  semantic no-ops notify zero subscribers, and cross-store transactions emit at
  most once per affected owner.
- Same-project stale hydration is rejected by the shared runtime generation.
- Query fixtures retain SQL-style 25-row page boundaries.

Parent review correction:

- The worker's connector invalidation and source-contract tests target the
  superseded composition/publisher topology that Phase 5 is deleting. They are
  not accepted as final connector evidence and must be rebased onto the direct
  destination connectors after Phase 5 integration.
- Deterministic subscription counts are not React commit counts and are not
  browser timing evidence.

Worker validation reported:

- Focused deterministic suite: 14 tests passed.
- Complete `testing/**` harness: 35 tests passed.
- Web check and production build passed before the concurrent Phase 5 changes.
  Parent validation will be rerun against the integrated tree.

Parent acceptance run:

- Accepted deterministic scale/store and project-fixture slice: 9 tests passed
  across 2 files. Connector-specific tests remain deliberately outside this
  acceptance until they are rebased onto the final Phase 5 topology.

### 2026-08-29 - Phase 6.8, Revision-Keyed Graph Derivation

Status: Complete

Changed:

- Task-flow conversion and graph validation now run in a subscriber-aware,
  cancellable idle job keyed by project, flow, source revision, definition
  identity, draft identity, and validation mode.
- Conversion starts only while Flow Canvas or Problems is actually displayed.
- Same-owner refresh keeps the last valid graph visible; owner changes clear it,
  and stale scheduled completions cannot commit.
- Selected-node synchronization now uses immutable parameter-value identity and
  no longer serializes parameter JSON after a selection interaction.

Removed:

- Render-time task-flow conversion in `useAutomationGraphRuntime`.
- Duplicate inline graph validation in the runtime hook.
- Selected-node `JSON.stringify` comparison on the post-interaction path.

Evidence:

- Parent graph/flow-document acceptance run: 54 tests passed across 10 files.
- Job tests cover no-subscriber dormancy, last-subscriber cancellation,
  same-owner retained data, stale completion rejection, owner clearing, and
  constant-time revision keys.

Plan impact:

- Step 6.8 is complete.
- Phase 6 remains in progress until direct connectors complete Steps 6.6 and 6.7.
- Real-browser long-task measurement for very large conversions remains in
  Phase 11; idle scheduling is not claimed as proof of a browser budget.

### 2026-08-29 - Phase 5, Destination Connector Foundation

Status: Partially accepted; Phase 5 remains in progress

Accepted:

- View-host requests can now carry a compact `connect(activity)` boundary rather
  than a prebuilt canonical model.
- The connector mounts inside the destination slot, not in a grouped model
  builder above the workspace.
- Direct project/query subscriptions are active-view-local; warm hidden views
  retain their local model but unsubscribe from domain/query revisions.
- Query readiness covers loading, empty, error, stale-ready, and shared project
  generation tokens.
- Existing bound-model requests remain temporarily supported during cutover.

Parent evidence:

- Focused connector, host, renderer, composition, and workspace suites: 29 tests
  passed across 5 discovered files.
- Parent diff review confirmed the connector is invoked by `ViewHost` with the
  destination activity and does not build its model above the slot.

Not accepted / remaining:

- `AutomationStudioSession` still consumes aggregate project/selection/domain
  subscriptions through `useAutomationStudioFoundation`.
- `useAutomationProjectView`, `useAutomationCanonicalViewInputs`, grouped
  canonical publishers, and legacy bound-model publication are still on the live
  path.
- The compatibility path must be removed, not renamed or retained as a fallback,
  before Steps 5.1 through 5.8 or Phase 1.5 can close.

### 2026-08-29 - Phase 12.3, Operations Documentation

Status: Complete; Phase 12 remains in progress

Changed:

- The UI profiling runbook now maps stable runtime ownership, synchronous
  presentation, shell isolation, normalized stores/queries, local readiness,
  background cache/preload work, and frame-coalesced canvas behavior to concrete
  deterministic and browser probes.
- The scale-certification guide now defines evidence classes, collection order,
  direct-connector checks, SQL/payload evidence, cache/preload ordering, canvas
  traces, and explicit `not-run`, `blocked`, and `failed` states.
- Both guides state that unit/source/build evidence cannot substitute for real
  browser input, frame, layout, long-task, render-commit, or heap measurements.

Parent review and evidence:

- Repaired an embedded carriage-return typo in the readiness-state table found
  during parent review.
- `pnpm docs:check` passed: 49 authored/reference Markdown files and the
  deterministic framework reference are current.

Plan impact:

- Step 12.3 is complete.
- Steps 12.1, 12.2, 12.4, and 12.5 remain pending final connector topology and
  certification status.

### 2026-08-29 - Phases 1, 5, and 6, Direct Connector Cutover

Status: Complete

Changed:

- `AutomationStudioSession` no longer subscribes to project entity, resource,
  runtime-selection, or query revisions; it reads current snapshots only when an
  orchestration command is invoked.
- Every canonical destination is mounted through a compact connector inside
  `ViewHost`. A displaying destination owns its subscriptions and derivation;
  a warm hidden destination keeps local state while unsubscribed.
- Hierarchy selection styling is a narrow subscriber independent from the
  project-revision hierarchy projection. Timeline reads normalized recording and
  timeline maps directly and ignores unrelated selections.
- Active connector loaders own Flow detail, node-definition, recording,
  timeline, and Flow-metadata hydration with shared project-generation checks.
- Session store commands now read the current owner snapshot at invocation.
- Session project snapshot reading, store command adapters, and connected-view
  registration were extracted into explicit owned modules. The live session is
  below the hard 700-line production ceiling.

Removed:

- `useAutomationProjectView.ts` and `useAutomationCanonicalViewInputs.ts`.
- Grouped canonical publishers, publisher components, and their input-identity
  compatibility helper.
- Root activation effects and grouped universal view-model publication.
- Phase-labelled barrel debt for the accepted architecture; small barrels now
  have direct hard bounds.

Parent evidence:

- Direct connector and live ownership acceptance: 66 tests passed across 8
  focused files before the final session extraction.
- Architecture, connector, and ownership acceptance after extraction: 61 tests
  passed across 4 files.
- `pnpm --filter @fluxiq/web check` passed after integration.
- The 17-test architecture contract now passes with no production module above
  700 lines, no unclassified global action channels, and no phase-labelled
  oversized-barrel allowance.

Plan impact:

- Steps 1.1 through 1.6 and the stable-bootstrap code gate are complete.
- Steps 5.1 through 5.8 are complete.
- Steps 6.1 through 6.8 are complete.
- Phase 10 continues with a final dead-path/import audit and broad regression
  validation. Browser commit counts and frame latency remain Phase 11 evidence;
  deterministic tests are not represented as browser measurements.

### 2026-08-29 - Final Parallel Assignment Round

Status: Complete; all assignments parent-reviewed, validated, and closed

Parent-owned integration:

- Review and accept each worker diff, keep changes disjoint, update this plan,
  run broad web/repository validation, and reconcile the final evidence matrix.

Assigned bounded scopes:

- Phase 10 architecture enforcement: extend executable source contracts for the
  final direct-connector topology, deleted publisher/aggregate paths, narrow
  session ownership, and prohibited feedback/serialization patterns. Scope is
  architecture tests only unless an unambiguous dead path is discovered.
- Phase 11 deterministic connector certification: rebase superseded publisher
  assertions onto active direct connectors and add bounded render/subscription
  isolation evidence under `testing/**`. Real-browser timing remains explicitly
  unclaimed.
- Phase 12 authored architecture: update the Automation Studio workspace guide
  to describe stable bootstrap, normalized stores and queries, direct
  destination connectors, local readiness, background scheduling, cache limits,
  graph jobs, and the remaining browser-certification boundary. The worker must
  not edit this working plan.

Acceptance rule:

- Each phase remains at its current status until parent review and focused
  validation are recorded below.

### 2026-08-29 - Step 10.6, Bounded Deleted-View Cleanup

Status: Complete

Changed:

- Deleted-object workspace cleanup now walks view-state values structurally with
  cycle detection and a fixed 512-object budget.
- Exact source IDs are matched as values rather than substring-searching a
  serialized object.
- Malformed oversized view state fails closed and is discarded instead of
  performing unbounded work on the delete action.

Removed:

- Whole-view-state `JSON.stringify` from the hierarchy delete command path.

Evidence:

- Bounded structural-scan and live ownership tests: 32 passed across 2 files.

Plan impact:

- The remaining Step 10.6 interaction-path serialization residue is removed.
- Phase 10 still awaits the assigned final source-contract audit and the parent
  broad regression pass.

### 2026-08-29 - Phase 8/10 Follow-up, Imperative Workspace Persistence

Status: Complete

Changed:

- Hierarchy/workspace persistence now observes the workspace store's exact
  `save-request` channel imperatively. The listener performs only timeout
  coalescing during the interaction and reads current normalized resources and
  preferences after the 800 ms write-behind delay.
- Save completion rejects a result when the active project changed while the
  request was running.
- Custom hierarchy-node and deleted-ID mutations explicitly request persistence,
  including mutations that do not happen to alter layout preferences.

Removed:

- The live session's React subscription to workspace `saveRevision`.
- React-effect persistence driven by project arrays, workspace preference
  objects, and a changing revision prop.
- Synchronous hierarchy signature construction from the save-request gesture.

Evidence:

- `pnpm --filter @fluxiq/web check` passed.
- Hierarchy, live, and workspace regression suites: 288 tests passed across 47
  files.

Plan impact:

- Persistence now satisfies DR-5: it observes mutations without becoming a
  React render-model owner.
- Workspace persistence can no longer rerender `AutomationStudioSession` on a
  tab, pane, hierarchy, or layout save request.

### 2026-08-29 - Phase 11, Final Deterministic Connector Certification

Status: Deterministic slice complete; Phase 11 remains in progress for required
real-browser evidence

Accepted:

- Scale-fixture run mutations notify the exact Runtime entity scope and zero
  unrelated Flow or Recording scopes.
- A connector receives its active domain notification, then receives none after
  the same subscription becomes dormant.
- Final source contracts verify direct destination connector registration,
  `ViewHost`-local mounting, hidden-warm dormancy, bootstrap/session isolation,
  and destination-local domain scopes.
- Shell selector counters remain explicitly labelled scoped-store notifications,
  not React render commits.

Removed:

- Superseded Phase 11 assertions targeting grouped canonical publishers and the
  old source-composition owner.

Parent evidence:

- Rebased render-isolation and connector source-contract suite: 10 tests passed
  across 2 files after the persistence follow-up was integrated.
- Worker full `testing/**` run reported 38 tests passed; web check passed.

Plan impact:

- The deterministic connector-topology blocker recorded in the earlier Phase 11
  slice is resolved.
- Phase 11 cannot be marked complete without the browser input/frame/layout,
  long-task, React commit, and heap evidence required by its gate.

### 2026-08-29 - Phase 12.1 and 12.2, Authored Architecture

Status: Complete

Changed:

- Rewrote the Automation Studio workspace architecture around the stable
  bootstrap/runtime, session orchestration boundary, normalized entity/query
  stores, direct destination connectors, hidden-warm dormancy, local readiness,
  generation-safe loaders, connected hierarchy/timeline regions, and
  revision-keyed graph derivation.
- Documented how new views connect at `ViewHost`, how bounded queries and local
  readiness remain destination-owned, and why the residual session snapshot
  reader is non-subscribing orchestration rather than a render publisher.
- Documented compact layout-only cache seeds, after-paint input-yielding
  cache/preload work, and imperative write-behind persistence on the exact
  `save-request` scope.
- Separated deterministic source/store/subscription evidence from pending
  browser commit, frame, layout, long-task, heap, and SQL-plan evidence.

Parent evidence:

- Parent reviewed the authored guide against the integrated connector and
  persistence code and added the final save-observer contract.
- `pnpm docs:check` passed for 49 authored/reference Markdown files; the
  deterministic framework reference is current.

Plan impact:

- Steps 12.1, 12.2, and 12.3 are complete.
- Steps 12.4 and 12.5 remain for final status/evidence reconciliation after
  Phase 10 validation. Phase 12 completion remains gated by Phase 11 browser
  certification.

### 2026-08-29 - Phase 10, Final Legacy and Feedback-Path Removal

Status: Complete

Changed:

- Architecture contracts now parse imports, selectors, render functions,
  connector registration, diagnostic events, and synchronous interaction paths
  rather than relying only on fragile text counts.
- The suite enforces catalog-only Session subscription ownership, exactly one
  direct destination connector for every canonical view ID, `ViewHost`-local
  connector mounting, and active-only domain/query subscriptions.
- Diagnostic `CustomEvent` creation is confined to exact named metric owners and
  channels. Component render functions may not mutate external controllers or
  stores.
- Navigation, selection, hierarchy, workspace-command, and canvas interaction
  paths are protected from `JSON.stringify` work.

Removed and protected from return:

- Aggregate project-view and canonical-input hooks.
- Grouped publisher, publisher component, and input-identity modules.
- Phase-labelled oversized barrel debt and the session's save-revision render
  subscription.

Parent evidence:

- Final architecture contract: 23 tests passed.
- Full web suite: 904 tests passed across 181 files.
- `pnpm --filter @fluxiq/web check` passed.
- `pnpm --filter @fluxiq/web build` completed successfully, including optimized
  compilation, type/lint validation, static generation, and build traces.

Plan impact:

- Steps 10.1 through 10.6 and the Phase 10 deterministic gate are complete.
- No new implementation phase is being added. Remaining work is the explicit
  Phase 11 browser evidence boundary and Phase 12 status/evidence closure.

### 2026-08-29 - Phase 12.4 and 12.5, Final Evidence Record

Status: Complete; Phase 12 gate remains dependent on manual Phase 11 browser
certification

Superseded tracking:

- Added historical-tracking notices to the earlier data-flow, fast-cache,
  load-performance, UI-lag audit, lag-remediation, and live-refactor working
  documents. Their evidence remains intact, but current render/runtime status
  now points here and to the authored workspace architecture.

Final ownership:

- Bootstrap owns stable runtime identity, external stores, request coordination,
  and project generation.
- Session owns orchestration and command wiring with only the narrow project
  catalog React subscription.
- Shell regions own presentation selectors; exact destination connectors own
  active domain/query subscriptions, readiness, and detail hydration.
- Normalized project/query stores own entity, resource, page, query, freshness,
  and exact revision scopes.
- Hierarchy and timeline connected regions own their shell-domain projections.
- Background owners run cache, preload, persistence, and graph derivation after
  the gesture with cancellation, bounded queues, and generation checks.

Removed modules and paths:

- `live/useAutomationProjectView.ts`
- `live/useAutomationCanonicalViewInputs.ts`
- `live/view-host/canonical-publishers.tsx`
- `live/view-host/publisher.tsx`
- `live/view-host/input-identity.ts`
- Optimistic mounted-view activation and grouped publication paths recorded in
  earlier journal entries.

Final automated evidence:

- Architecture contract: 23 tests passed.
- Full web suite: 904 tests passed across 181 files.
- Web TypeScript check passed.
- Optimized Next.js production build passed.
- Documentation check passed for 49 authored/reference Markdown files and the
  deterministic framework reference.
- Earlier focused accepted suites and fixture counts remain recorded in their
  owning journal entries above.

Measurements not claimed:

- No React commit count/duration, input-to-paint frame latency, layout duration,
  browser long-task, retained-heap, browser soak, or SQL query-plan measurement
  was produced in this run.
- Repository instructions prohibit the agent from starting the web panel. A
  human operator must execute the procedures in the UI profiling and scale
  certification runbooks, then record actual values here.

Residual risk until that gate runs:

- The non-subscribing session project snapshot reader still performs an
  aggregate orchestration projection when the catalog/session itself renders;
  ordinary tab, sidebar, selection, data, query, and save actions do not trigger
  that render path.
- Flow Editor, Recording, Inspector, and State retain cross-domain memoized
  selectors inside their active destination connectors. Hidden warm instances
  are dormant, but browser traces must confirm active-view cost at scale.
- Deterministic bounded-work and store-notification tests do not prove DOM,
  layout, paint, React scheduling, or extension-free browser behavior.

Closure boundary:

- Steps 12.1 through 12.5 are complete.
- Phase 11 Steps 11.1 and 11.7 are complete, and deterministic portions of 11.2
  are recorded without calling them React commits. Steps 11.3 through 11.6 and
  actual browser measurements in 11.8 remain the manual certification gate.
- Phase 12 cannot be labelled fully complete until that Phase 11 evidence is
  collected, per the gate defined before implementation began.

### 2026-08-29 - Step 11.7, Final Repository Validation

Status: Complete

Evidence:

- `pnpm check` passed across web, contracts, client gateway, and framework
  packages.
- `pnpm --filter @fluxiq/web test` passed 904 tests across 181 files.
- The repository-wide test run passed the web suite, all 3 client-gateway tests,
  and 481 of 482 framework tests. The sole failure was the TypeDoc reference
  test exceeding its 15-second timeout while packages ran concurrently.
- The exact `global-services.test.ts` file then passed all 30 tests in isolation;
  its TypeDoc case completed in 5.4 seconds. This is recorded as parallel-load
  timeout evidence, not hidden as an unqualified full-suite pass.
- `pnpm build` passed for contracts, framework, client gateway, and the optimized
  Next.js web application.
- `git diff --check` passed; Git emitted only existing line-ending conversion
  warnings.

Plan impact:

- Step 11.7 is complete.
- Automated checks expose no remaining implementation failure. They do not
  replace the pending manual browser measurements in Steps 11.3 through 11.6
  and 11.8.

### 2026-08-29 - Direct Connector Runtime Hotfix

Status: Complete

Reported runtime failures:

- `config.projectScopes is not a function` while mounting a canonical
  destination.
- `Maximum update depth exceeded` after active connector hydration.

Root causes:

- Problems, Inspector, and State registered precomputed scope arrays even though
  the direct connector contract invokes a scope factory.
- Active hydration was keyed to the complete derived model. An empty Flow node
  definition, recording timeline, Flow detail, or metadata result could publish
  another revision and schedule the same active loader repeatedly.

Changed:

- All canonical scope declarations are callable factories.
- Connector registration now rejects non-callable project, runtime, or
  selection scope declarations immediately.
- Active hydration is keyed by project generation and the relevant Flow or
  recording identity. The effect reads the latest model through a ref and does
  not rerun merely because a domain revision created a new model.

Evidence:

- Web TypeScript check passed.
- Connector, ownership, and architecture acceptance: 68 tests passed across 4
  files.
- Runtime contract coverage proves an invalid array scope is rejected during
  connector registration instead of failing later inside React.

Plan impact:

- This corrects implementation defects inside completed Phase 5; it does not
  create a new phase or alter the pending manual browser-certification boundary.

### 2026-08-29 - Workspace View Source Feedback-Loop Hotfix

Status: Complete

Runtime evidence:

- React reported `Maximum update depth exceeded` through
  `forceStoreRerender`.
- The actionable stack continued through `Object.replace` into
  `AutomationStudioWorkspaceComposition.useEffect`, identifying the workspace
  view-source publication effect rather than project or API loading.

Root cause:

- `AutomationStudioWorkspaceComposition` created a long-lived external view
  source and then synchronized `props.views.entries` into it from an effect.
- Each changed entry identity called `source.replace`, synchronously notifying
  mounted view subscribers. Effect cleanup also removed entries through the
  same store. This formed a React-prop-to-effect-to-external-store feedback
  path capable of nested subscriber rerenders.
- The source was already initialized from the same entry snapshot, so the
  effect synchronization was redundant.

Changed:

- The workspace view source is now an immutable memoized projection of the
  current memoized entry array.
- The effect, its cleanup writes, and all `source.replace` calls were removed
  from `AutomationStudioWorkspaceComposition`.
- An architecture regression test now forbids effect-driven entry publication
  in the workspace composition.

Evidence:

- Web TypeScript check passed.
- Focused ownership, render-store, and workspace-shell suites passed 41 tests
  across 3 files.
- The optimized Next.js production build passed and generated the dynamic
  `/programs/[programId]` route successfully.
- Documentation validation passed for all 49 authored/reference Markdown files;
  the deterministic framework reference is current.

Plan impact:

- This removes a runtime feedback loop in the completed workspace composition
  work. It does not change the pending manual browser-certification gate.

### 2026-08-29 - External Store Snapshot Identity Hotfix

Status: Complete

Runtime evidence:

- React continued to report `Maximum update depth exceeded` through
  `enqueueConcurrentHookUpdate`, `enqueueConcurrentRenderForLane`, and
  `forceStoreRerender` after the workspace view-source effect was removed.
- The failure occurred while Automation Studio mounted, including projects with
  no meaningful project data.

Root cause:

- `useAutomationStoreSelector` cleared its snapshot cache whenever its selector
  function identity changed.
- `AutomationStudioSession` supplies an inline catalog selector that returns an
  object. The selector is a new function on every render, so the hook cleared
  its cache and returned a new object snapshot on every `getSnapshot` call.
- `useSyncExternalStore` correctly interpreted each new object as another store
  change, forced another render, and repeated the cycle until React's maximum
  update depth guard fired. This was render-loop work, not API or project-data
  latency.

Changed:

- Selector cache entries now track state, selector, and selected snapshot.
- A changed selector is evaluated without discarding the previous selected
  snapshot. The previous snapshot identity is retained when the supplied
  equality function says the selected values are unchanged.
- Real state or selected-value changes still publish a new snapshot.
- Direct tests cover recreated inline selectors and real selected-value changes;
  the architecture suite forbids restoring unconditional cache clearing.

Evidence:

- Web TypeScript check passed.
- Selector identity, Studio ownership, scoped-store isolation, and strict
  runtime-contract suites passed 44 tests across 4 files.
- The full web suite passed 909 tests across 182 files.
- A source scan found no remaining Studio subscriber with the same
  selector-change cache-reset or fresh object/array `getSnapshot` pattern.
- The optimized Next.js build compiled, type-checked, collected page data, and
  generated all 15 static pages plus the dynamic program route. Its process
  then exited nonzero because Windows denied the final write to
  `apps/web/.next/trace`, which was locked by another Next process; this is
  recorded as a trace-file lock rather than an application compilation failure.
- Documentation validation passed for all 49 authored/reference Markdown files,
  the deterministic framework reference is current, and `git diff --check`
  passed with line-ending warnings only.

Plan impact:

- This corrects the remaining mount-wide external-store render loop in the
  completed store-isolation work. Manual browser certification remains the
  final behavior and performance gate.

### 2026-08-29 - Empty Resource Identity and Live Browser Gate

Status: Implementation complete; live browser gate pending a manually started
panel

Additional root cause:

- The Session project reader supplied fresh `{}` and `[]` fallback values for
  absent optional resources on every render.
- For a project containing an otherwise empty Flow, the fresh node-definition
  fallback caused the project model to derive a new
  `availableNodeDefinitions` array on every render.
- Graph derivation keys include source and node-definition identities. The graph
  effect therefore submitted a new request, the derivation owner synchronously
  published React state, Session rendered again, and another fresh fallback
  generated another request. This formed an effect-to-state render loop without
  any API latency or meaningful project data.

Changed:

- Session resource fallbacks are stable frozen module constants for lists,
  records, project artifacts, and gateway state.
- Both the root Session reader and the Session's direct resource reads use those
  stable identities.
- A regression test calls the empty-project reader repeatedly and requires the
  complete model, node-definition list, and hierarchy list to retain identity.
- The deterministic fixture seeder now has an opt-in fast Studio-only mode for
  live debugging without generating unused 1k/10k datasets.
- A Playwright regression opens the persisted small fixture, repeatedly switches
  Router, Runtime Debug, Instructions, Settings, and inner tabs, enforces a
  settled interaction ceiling, and fails on any console/page error or React
  update-loop message.

Evidence so far:

- Web TypeScript check passed, including the Playwright regression.
- Session identity, Studio ownership, and graph derivation suites passed 38
  tests across 3 files.
- Fast deterministic fixture seeding completed with two Flows, 120 graph nodes,
  80 hierarchy folders, 36 runs, 12 instructions, and 16 adaptations.
- No web panel was listening on the checked localhost ports. Repository policy
  rejected an agent-launched hidden panel, so the live Chromium result remains
  explicitly pending rather than being inferred from static checks.

Required live gate:

- Start the panel against `apps/web/.e2e-host` on `127.0.0.1:3000`.
- Run `automation-studio-render-loop.spec.ts` in desktop Chromium.
- Do not mark this checkpoint complete until console errors are zero and every
  repeated interaction settles inside the declared ceiling.

### 2026-08-29 - Concurrent Project Migration Initialization Hotfix

Status: Implementation complete; live rerun pending

Live evidence:

- Chromium authenticated against the rebuilt user environment, navigated eight
  global program views, created a project, created a blank Flow, switched four
  Studio sidebar views three times each, opened the Nodes whiteboard, and
  switched inner tabs without a React update-depth error.
- The run exposed one real API failure:
  `POST list-project-hierarchy-children` returned `400` with
  `Automation Studio schema migration is already running` for the newly
  created project.
- Global route navigation settled in 460-908 ms. Repeated Studio sidebar view
  selection settled in 854-1,261 ms. Project creation took 1,600 ms and blank
  Flow creation took 2,576 ms. These are correctness-baseline measurements,
  not accepted final performance targets.

Root cause:

- Multiple repositories could open the same pooled project database at the
  same time and independently run the schema migration runner.
- Database operations were serialized individually, but an entire migration
  check-and-apply sequence was not. A second runner could read the pending
  ledger while the first runner was applying it, then encounter the first
  runner's active on-disk migration lock and fail the user request.

Changed:

- Migration sequences targeting one resolved project SQLite file are serialized
  through a file-keyed promise queue, including callers from independent pool
  instances.
- A waiting caller re-checks the migration ledger after the active migration
  finishes, so it skips already-applied migrations instead of failing.
- The persistent schema lock remains responsible for cross-process exclusion
  and stale-lock recovery.
- A regression opens two leases for one project and requires concurrent
  migration callers to resolve as one apply plus one ledger skip.

Evidence:

- The focused schema-migration suite passed all 4 tests.

Next gate:

- Rerun the full live Chromium create/interact path and require zero API,
  console, page, or React update-loop errors.
- Profile and remove the remaining 0.85-1.26 second sidebar interaction delay
  after the correctness gate is clean.

### 2026-08-29 - Live Browser Profiling and Global Panel Audit

Status: Root causes confirmed; implementation in progress

Live profiling:

- The panel accepted the supplied administrator credentials and successfully
  created multiple real projects and blank Flows through Chromium.
- No React maximum-update-depth error recurred during repeated hierarchy,
  workspace, and tab interaction.
- Studio render-boundary instrumentation measured hierarchy and pane commits at
  roughly 2-36 ms. CPU samples attributed FluxIQ and React functions only a few
  milliseconds each.
- The apparent 0.8-1.2 second Playwright click duration was dominated by
  browser-native `(program)` time and, with locator clicks, Playwright
  `elementsFromPoint` actionability work. Retained full-DOM traces and video
  were enabled because the known server error made every run fail. These
  timings are not valid application interaction budgets.
- With trace/video disabled, a visible Project button accepted focus before
  client hydration and its first click was lost. This is a real UX failure and
  confirms that visible server HTML is arriving materially before its large
  client graph becomes interactive.

Global panel root causes:

- `ProgramLiveViews` statically imports Automation Studio and every global
  program implementation. Every `/programs/[programId]` route therefore ships
  Studio, XYFlow/D3, and all other program code regardless of the selected
  program.
- Current development manifests show approximately 12.83 MB of JavaScript for
  a program route, including approximately 6.50 MB of Studio chunks and a 1.18
  MB XYFlow/D3 chunk.
- Program launcher rows, brand navigation, breadcrumbs, and menu links use
  plain anchors. Every internal navigation destroys and recreates the document,
  reruns server rendering, reevaluates the oversized client graph, and
  rehydrates the shell.
- There is no program-route loading boundary, while global polling and each
  program's uncached snapshot effect restart after every hard navigation.
- Automation Studio and XYFlow CSS are imported globally; the emitted shared
  stylesheet is approximately 369 KB.

Implementation order:

1. Complete: split every live program into a route-selected dynamic chunk so
   non-Studio routes never parse or evaluate Studio/XYFlow JavaScript.
2. Complete: replace launcher, brand, breadcrumb, and menu anchors with Next
   client navigation so the root shell remains mounted and can prefetch
   destinations.
3. Complete in code: add program-route and dynamic-view loading UI. Live
   navigation/hydration measurements are next.
4. Restart the panel after rebuilding `fluxiq/dist`, then complete the
   migration-race and zero-error live gate against the new runtime instance.

Validation for steps 1-3:

- Web TypeScript check passed.
- Focused shared UI and authentication-shell suites passed all 19 tests.

### 2026-08-29 - Live Gate Harness Finalization

Status: Complete; restarted-panel execution next

- Replaced the temporary trace, long-task, and CDP-profiler instrumentation
  with a low-overhead user-path regression. Retained Playwright traces and
  video are disabled for this test so browser automation bookkeeping cannot be
  mistaken for panel interaction latency.
- The regression now enters every global program through Next client links,
  returns through the Global workspace breadcrumb, then opens Automation
  Studio without full-document navigation.
- It removes stale `Live Browser Project` fixtures, creates a real project and
  blank Flow, repeats hierarchy-view and inner-tab interactions, returns to the
  project browser, and deletes its own project.
- Strict assertions cover API failures, page errors, console errors, React
  update-loop messages, selected hierarchy state, and a 750 ms
  pointer-to-selection ceiling. Route navigation and write latency are recorded
  separately because they are not synchronous render-loop measurements.

Next gate:

- Type-check the finalized harness, execute it against the restarted panel,
  and use any live failure as the next root-cause input.

### 2026-08-29 - Live Gate CSS Build Blocker

Status: Fixed

- The first restarted-panel run correctly failed before authentication because
  Next displayed a build-error overlay, not the FluxIQ UI.
- Root cause was the route-loading CSS being placed before the final
  `global-programs.css` import. CSS imports must precede all style rules.
- Moved the final import into the contiguous import block. No server restart is
  required; the running development panel can hot-reload this source fix.

Next gate:

- Rerun the complete Chromium path and continue from the first application
  failure, if any.

### 2026-08-29 - Dynamic Import Compiler Contract

Status: Fixed

- After the CSS repair, live compilation exposed Next's requirement that the
  second argument to every `next/dynamic` call be an object literal.
- The route split had reused one `dynamicOptions` object, which TypeScript
  accepts but the Next transform rejects because it cannot statically inspect
  the options.
- Each program boundary now supplies `{ loading: ProgramViewLoading }`
  directly. This preserves route-selected chunks and the loading state while
  satisfying the production and Turbopack compiler contract.

Next gate:

- Rerun live Chromium through authentication and all global routes.

Live harness correction:

- The first successful global-navigation pass reached Runtime and showed that
  its public program id is `runtime`, while the harness had used the source
  folder name `runtime-control`. The assertion now follows the registered
  route. This was test metadata only; no application route failed.

- The next pass completed every global route and created a project. The project
  browser intentionally retained the user in the list after creation; the
  harness had incorrectly expected automatic opening. It now waits for project
  index loading, deletes exact stale test rows, and explicitly opens the newly
  created project before exercising its hierarchy.

### 2026-08-29 - Strict Mode Project Lifecycle Disposal

Status: Fixed; focused and live validation next

Live symptom:

- Project creation succeeded and the new row appeared, but both the automatic
  open after creation and an explicit row click left the catalog visible.
- No project hydration request or catalog error followed because the open
  lifecycle returned `false` before publishing any state.

Root cause:

- `useAutomationProjectLifecycle` created one imperative lifecycle during
  render and permanently disposed it from an effect cleanup.
- React development Strict Mode runs effect setup, cleanup, and setup again for
  a still-mounted component. The simulated cleanup marked that lifecycle as
  disposed, while the second setup retained the same object. Every later
  `open()` therefore exited immediately.

Changed:

- Added a lifecycle lease that disposes and clears its current instance, then
  recreates it on the next mount or command.
- The hook now reacquires the lease during effect setup and all public commands,
  making the ownership contract valid for Strict Mode and real remounts.
- Added a regression that simulates setup, disposal, remount, and a successful
  project commit on the recreated lifecycle.

Next gate:

- Run the focused lifecycle suite and TypeScript check, then repeat the complete
  browser path from project cleanup through Flow creation and view switching.

Validation progress:

- The focused lifecycle suite passed all 6 tests and the web TypeScript check
  passed.
- Live Chromium confirmed the repair: creating a project now immediately opens
  its workspace, renders its hierarchy, and displays the empty Nodes editor.
- The harness now accepts that intended automatic-open path while retaining an
  explicit row-click fallback, rather than waiting only for a catalog row that
  correctly disappears after successful opening.

### 2026-08-29 - Hierarchy Feedback and View Activation Separation

Status: Implemented; focused and live validation next

Live evidence:

- Project and blank-Flow creation now complete, but the first Runtime Debug
  click took 1,030 ms before its tree row exposed `aria-selected=true`.
- The controller did publish the requested primary row before navigation. The
  hierarchy selector then suppressed it because the currently rendered view
  was still Nodes, so visual selection waited for Runtime Debug and its view
  tree to render in the same synchronous interaction.

Changed:

- Hierarchy navigation now uses the existing animation-frame workspace queue.
  Selection and primary-row state publish in the pointer interaction; workspace
  view activation runs after that feedback has had a paint opportunity.
- While the active workspace view is unchanged, an explicitly requested
  primary row can render optimistically for the selected Flow.
- Whenever the workspace active view actually changes, the hierarchy validates
  the retained primary id against that view and clears stale state. Inner-tab
  navigation therefore still selects the object that owns the active view.
- Added selector coverage proving a requested row can be primary before view
  activation and is rejected when validated against a different active view.

Next gate:

- Run hierarchy, workspace ownership, and TypeScript checks, then rerun all
  repeated live hierarchy selections under the 750 ms pointer-to-selection
  ceiling.

Validation progress:

- Hierarchy state, Studio ownership, and workspace command suites passed all 55
  tests. The web TypeScript check passed.
- The next Chromium process reached the sign-in shell, but `/api/auth/login`
  became unreachable. A direct request confirmed no process remained listening
  on `127.0.0.1:3000`; this run produced no interaction measurement.
- Live certification is paused only until the user-managed panel is restarted,
  as repository policy forbids the agent from launching the web panel.

### 2026-08-29 - Architecture Gate Cleanup

Status: Implemented; full-suite rerun next

- The full web run passed 907 tests and exposed six architecture-gate failures
  caused by the current edits.
- Moved route-loading rules from the import-only `globals.css` manifest into
  the owned `global-programs.css` stylesheet.
- Extracted optimistic primary-row validation from `ProjectTree.tsx` into
  `usePrimaryTreeNodeId.ts`; the tree is back under its 300-line package limit
  while the timing behavior remains isolated and testable.
- Removed non-semantic whitespace from `AutomationStudioSession.tsx` to restore
  the existing file below the hard 700-line production ceiling without adding
  behavior to that composition owner.

Next gate:

- Rerun the architecture/style suites, TypeScript, and then the full web suite.

Validation progress:

- All 43 focused architecture, CSS ownership, hierarchy boundary, and selection
  tests pass. TypeScript passes.
- The full suite then passed 912 of 913 tests. Its only failure was a source
  assertion that still required the raw primary selector inside
  `ProjectTree.tsx`; the assertion now verifies delegation from the tree and
  selector/stale-state ownership in `usePrimaryTreeNodeId.ts`.

Validation result:

- The corrected ProjectTree ownership suite passed all 20 tests.
- The complete web suite passed all 913 tests across 183 files.
- Web TypeScript remains clean. Static and architecture validation is complete;
  the restarted-panel Chromium measurement is the remaining gate.

- The FluxIQ framework TypeScript check passed.
- The complete framework suite passed all 483 tests across 80 files, including
  concurrent schema migration, indexed hierarchy/query-plan, million-event
  stream, 100k-subflow hierarchy, and adaptive runtime coverage.

Next gate:

- Run the production web build while the panel is stopped, then execute the
  live browser regression after the user-managed development panel restarts.

Production build result:

- The optimized Next/Turbopack build compiled, type-checked, generated all 15
  static pages, collected traces, and exited successfully.
- `/programs/[programId]` now reports 139 kB first-load JavaScript with an
  8.65 kB route entry. This replaces the earlier development manifest in which
  static program imports pulled roughly 12.83 MB, including Studio and
  XYFlow/D3, into every program route.
- The dynamic chunk split and loading boundaries are therefore compiler-valid
  in production. Live interaction timing remains the sole behavior gate.

Documentation result:

- Authored/reference links pass across all 49 documentation files.
- Regenerated both deterministic framework references; the reference freshness
  gate now passes for all 1,363 public declarations.

### 2026-08-29 - First Post-Create Interaction Measurement

Status: Above budget; full distribution collection next

- After the panel restart, the complete live path again reached project and
  blank-Flow creation without migration or React-loop failure.
- The first Runtime Debug selection improved from 1,030 ms to 859 ms after
  separating hierarchy feedback from view activation, but remains above the
  750 ms gate.
- The harness now records all twelve repeated hierarchy selections before
  asserting the budget, then continues through tabs and project cleanup. This
  distinguishes one-time post-create initialization from persistent click lag
  and prevents a first-sample failure from hiding the distribution.

Distribution result:

- All twelve samples remained above budget: Runtime Debug 945-1,041 ms,
  Instructions 820-1,082 ms, Settings 796-844 ms, and Router 816-876 ms.
- Global program client navigation was mostly 252-373 ms and Automation Studio
  entry was 575 ms, isolating the persistent delay to hierarchy interaction.
- The harness now measures inside Chromium from the input event timestamp to
  pointer-handler execution and from handler execution to the selected DOM
  commit. This distinguishes main-thread input queueing from React/hierarchy
  commit cost without Playwright polling or transport noise.

Chromium-native result:

- Input queue delay is healthy at 0.7-5.3 ms. The persistent delay is entirely
  handler-to-selected-DOM commit at 335-543 ms.
- React was still batching the hierarchy external-store publication with later
  workspace work. `ProjectTree` now flushes only
  `previewPrimaryNode(node)` synchronously, then executes the normal controller
  command whose workspace activation remains animation-frame scheduled.
- This makes the selected row an urgent, bounded render without pulling view
  loading, data requests, or workspace activation back into the click handler.

Flush validation and final feedback design:

- A second native run showed the isolated `flushSync` still took 355-660 ms.
  React flushes other pending root work, so a root-wide synchronous flush is not
  an acceptable mechanism for one row's feedback and has been removed.
- Hierarchy rows now apply their selected ARIA attribute and existing selected
  CSS class directly on pointer-down (and keyboard click as a fallback). The
  controller then publishes the canonical primary state and schedules workspace
  activation as before.
- This is a transient presentation optimization only: no domain selection,
  view state, or data is authored in the DOM. React reconciles the same selected
  state from the hierarchy/workspace stores after background rendering.

Final live result:

- The complete desktop Chromium path passed: authentication, all ten global
  programs through client navigation, stale fixture cleanup, project creation,
  blank-Flow creation, twelve hierarchy switches, Nodes and inner-tab
  switching, return to project browser, and project deletion.
- There were zero API failures, console errors, page errors, React update-loop
  errors, or selection-budget violations.
- Across all twelve hierarchy samples, native selected-DOM commit time fell
  from 335-660 ms to 0-0.2 ms. Total browser input-to-selection time is now
  0.8-16.2 ms.
- Global warm program navigation is mostly 260-299 ms; Automation Studio entry
  was 576 ms, project creation 984 ms, and blank-Flow creation 2,422 ms. Those
  writes complete without freezing, refresh, or stale project state.
- Optimistic DOM feedback is restricted to selectable objects; folder rows keep
  their expand/collapse-only behavior.

### 2026-08-29 - Launcher Prefetch Flood

Status: Fixed; browser rerun next

- The distribution run crashed the Chromium page while opening the third global
  program, before it reached Studio.
- Every launcher row was a default-prefetching Next link. With all global
  programs visible, the launcher could queue every dynamic program route,
  including Automation Studio and XYFlow, even though the user selected only
  one destination. Returning to the launcher repeated that pressure against the
  development router cache.
- Launcher links now use client navigation with `prefetch={false}`. This keeps
  the current document mounted but loads program code only on explicit
  selection, preserving the required lazy behavior.
- Added a launcher contract test preventing accidental restoration of eager
  all-program prefetch.

### 2026-08-29 - Restarted-Panel Exact-Code Browser Gate

Status: Passed; current-panel implementation and validation complete

- Repeated the complete authenticated desktop-Chromium workflow against the
  user-restarted panel after the final folder-row selection guard.
- The workflow client-navigated through every global program, entered
  Automation Studio, created a real project and empty Flow, repeatedly opened
  Runtime Debug, Instructions, Settings, and Router, exercised Nodes and inner
  tabs, returned to the project browser, and deleted the project fixture.
- There were zero API failures, console errors, page errors, React update-depth
  errors, or budget violations.
- Native browser input-to-selected-row totals were 0.7-5.0 ms for eleven of
  twelve samples and 5.0 ms for the remaining sample; selected-DOM commit time
  was 0-0.2 ms throughout. The final-folder guard therefore preserves the
  immediate object feedback without changing folder expand/collapse behavior.
- Measured writes completed without refresh or stale UI: project creation took
  935 ms and empty-Flow creation took 1,975 ms. Automation Studio entry took
  573 ms. Warm global-program navigation was generally 264-282 ms.

Full-suite gate note:

- The first complete Vitest rerun reported no assertion failure, but a default
  Tinypool child process exited unexpectedly near the end of the suite and made
  the command fail. This is being rerun with a bounded worker pool; the gate is
  not considered complete until the command itself exits cleanly.

Full-suite result:

- The unchanged complete suite passed cleanly with a bounded two-worker thread
  pool: 183 test files and 914 tests, with exit code zero.
- This includes the launcher no-prefetch contract, project lifecycle Strict
  Mode regression, hierarchy selection behavior, architecture enforcement,
  render isolation, data-intensive views, and large-project behavior suites.

Final exact-tree validation:

- `pnpm --filter @fluxiq/web check` passed.
- The bounded complete web suite passed 914/914 tests across 183 files.
- The restarted-panel desktop Chromium regression passed in 29.6 seconds.
- `pnpm docs:check` passed all local links in 49 documentation files and the
  deterministic 1,363-declaration framework reference freshness gate.
- The earlier exact architecture build gate remains valid: the optimized web
  build passed with the program route reduced to 139 kB first-load JavaScript.
- The independent framework gate passed 483/483 tests across 80 files.
- A full seeded `small`/`scale` browser run is intentionally not claimed here:
  those specs require a panel started with `apps/web/.e2e-host`, while this run
  targeted the user's rebuilt live profile. The fixture matrix remains an
  operational certification task and is not a blocker for the reproduced
  empty-project interaction defect fixed and measured above.

### 2026-08-29 - Corrected Visible-View Regression

Status: Complete after corrected live regression and closure gates

- The live regression incorrectly treated the hierarchy row's optimistic
  `aria-selected` mutation as completion of a view switch. That measured only
  pointer feedback and did not wait for the requested Flow view to become the
  visible `.automation-mounted-view`.
- The regression now observes the canonical target view's `hidden` and
  `aria-hidden` transition, then waits through the next paint before resolving.
- Against a newly created project and blank Flow, the corrected test reproduced
  the user-visible defect on every cycle. Target-view DOM commits took
  734-1,043 ms; input-to-painted-view totals took 744-1,093 ms. Eleven of twelve
  switches exceeded the existing 750 ms budget.
- Input queue delay remained 0.7-4.9 ms and optimistic row feedback remained
  0-0.2 ms. The defect is therefore after event delivery and before workspace
  view commit. SQL/API work is not part of the measured interval.
- The current gate is failed. Completion requires CPU ownership evidence, a
  root-cause implementation change, and a passing corrected live rerun.

Phase-trace finding:

- Source-level browser tracing separated the delay into two hierarchy-owned
  stalls. Navigation was not even scheduled until 315-513 ms after pointer
  delivery, then its requested animation frame did not run for another
  334-519 ms.
- Pointer focus synchronously published `hierarchyStore.focus`, forcing a
  React-backed hierarchy reconciliation before the click handler. The click
  then synchronously published primary/selection reconciliation before the
  queued workspace activation could reach its animation frame.
- Once navigation finally ran, `workspaceRenderStore.replace` took about
  0.1 ms and the requested pane rendered/committed in roughly 7-40 ms. The
  workspace renderer, view connector, SQL layer, and API are not the source of
  this reproduced delay.
- Implementation order is changing to immediate workspace activation followed
  by post-paint hierarchy focus/primary and domain-selection reconciliation.

Implementation result:

- Removed direct pointer-down DOM mutation of selected classes/ARIA and removed
  the hierarchy button's animated active transform. Native pointerup/click now
  follows pointerdown in 0.2-0.5 ms instead of 317-461 ms.
- Workspace view activation is immediate. Domain selection reconciliation is
  queued after the visible view commit, and hierarchy primary/focus use silent
  snapshots that are consumed by the workspace-driven tree render rather than
  publishing redundant React updates.
- The corrected browser gate now measures the requested
  `.automation-mounted-view` becoming visible, with a 100 ms budget. Twelve
  repeated Runtime Debug, Instructions, Settings, and Router switches passed
  at 14.3-42.3 ms.
- Added actual-content timing for inner pane tabs. Six alternating pane-tab
  switches passed at 27.3-32.1 ms.
- Temporary source phase probes were removed from production render paths after
  diagnosis. The corrected browser regression and optional Chromium CPU sampler
  remain as repeatable evidence.
- Focused hierarchy/workspace validation passes 91/91 tests.

Validation checkpoint:

- Final-code `pnpm --filter @fluxiq/web check` passes after the production
  phase probes were removed. The complete web test suite and one final live
  create-project/create-Flow interaction run remain.
- The first complete-suite rerun passed 913/914 tests. Its one failure was the
  synchronous interaction trace still requiring a hierarchy store publication
  and two hierarchy-row renders during the click. That assertion predates the
  post-paint hierarchy contract and directly conflicts with this fix; it is
  being replaced with an assertion that the synchronous gesture touches only
  selection and workspace ownership.
- The corrected trace confirms the exact commit order is workspace first,
  selection second, with no synchronous hierarchy publication. The contract
  now locks that visible-view-first ordering.
- The focused synchronous interaction trace passes 4/4 with the corrected
  ownership and ordering assertions. A complete-suite rerun is next.
- The exact-final-code complete web suite passes 183/183 files and 914/914
  tests. The restarted-panel browser workflow is the final closure gate.
- The exact-final live Chromium workflow passed against the restarted panel. It
  authenticated, created a new project, created a new blank Flow, exercised
  Runtime Debug, Instructions, Settings, and Router three times each, exercised
  six alternating already-open pane tabs, checked browser errors, and deleted
  the test project.
- The twelve actual Flow-view content commits measured 14.0-41.8 ms. The six
  actual pane-tab content commits measured 26.1-31.8 ms. Native pointerdown to
  click delivery stayed at about 0.2-0.5 ms. All are below the corrected 100 ms
  interaction gate.
- Final documentation validation passes for all 49 authored/reference Markdown
  files, the generated framework reference is current, and `git diff --check`
  reports no patch or whitespace errors.

### 2026-08-30 - Stable-Paint Layout Closure and Hierarchy Repair

Status: Implementation complete; exact hosted-panel rerun pending panel availability

Measurement correction:

- The prior 14-42 ms result measured the target view's DOM visibility commit.
  It did not include the browser layout and paint work caused by that commit,
  so it was not a valid closure measurement for the visible lag report.
- The browser regression now waits through two animation frames after the
  requested view becomes active. It records both DOM commit and stable-paint
  time, and reads Chromium `Performance` layout/style/script deltas for every
  hierarchy selection.
- With this corrected measurement, a new project containing one blank Flow
  reproduced 500-1,050 ms stable-paint delays. JavaScript generally consumed
  only 20-90 ms and style recalculation 1-6 ms; a single root-document layout
  consumed approximately 466-963 ms. The remaining defect was browser layout,
  not SQL, API loading, or the workspace-store commit.

Root cause and implementation:

- Activating a tab changed hidden content from non-layout to layout and caused
  Chromium to lay out the full document. Warm views now occupy a fixed-size,
  absolutely stacked container, use `visibility`/`inert` for activation, and
  are isolated with strict size/layout/paint containment. Pane and view
  containers now declare stable full dimensions so containment has a valid
  sizing boundary.
- Selected tabs and hierarchy rows no longer change font weight. This avoids
  invalidating text metrics and nearby layout merely to show selection; color,
  border, and inset selection styling remain.
- Per-branch `content-visibility: auto` was removed from the hierarchy. The
  small tree no longer performs deferred branch layout during selection.
- The hierarchy wrapper previously had no full-height contract, the sidebar
  grid declared four rows for three in-flow children, and both an obsolete
  inner resizer and a shell resizer were mounted. The wrapper and sidebar now
  fill the shell, the grid has three rows, and the shell owns one 8 px
  full-height resize target with an explicit zero-padding box model.
- The hierarchy surface no longer subscribes to sidebar width solely to feed
  removed no-op resize callbacks, reducing unrelated tree renders during
  shell resizing and view interaction.

Measured result before the final rerun:

- After fixed-size containment, the first activation samples were 88.6-236.8
  ms. Repeated Runtime Debug, Instructions, Settings, and Router switches were
  72.4-85.8 ms stable paint, with layout reduced to roughly 50-61 ms instead
  of 500-900 ms. DOM commits remained approximately 14-29 ms.
- The regression gate now permits at most 300 ms for a view's first activation
  and 120 ms for repeated activation. Inner pane tabs use the same two-frame
  stable-paint measurement and 120 ms warm budget.
- Browser assertions require exactly one hierarchy separator, no obsolete
  project-hierarchy separator, equal shell/region/sidebar/resizer heights, a
  real remaining-height tree viewport, and the expected invisible 8 px resize
  target. Source-level tests lock the same ownership and layout contracts.

Validation checkpoint:

- `pnpm --filter @fluxiq/web check` passes.
- Focused workspace, shell-connector, and live-ownership tests pass 46/46.
- The first hosted-panel geometry run passed all height and ownership checks
  and exposed a 12 px resize target caused by global button padding. The target
  now has an explicit border-box, zero-padding contract.
- The next complete browser run could not reach its Studio section because the
  user-hosted panel stopped accepting connections while navigating the global
  program list. This was a server-availability failure before the interaction
  timing loop, not a failed performance sample. The final live gate remains
  open until the hosted panel is reachable and the full create/switch/delete
  workflow passes on the exact code.

### 2026-08-30 - Studio-Wide Interaction Closure

Status: Studio interaction audit and shared-control repair complete; global-program interaction audit in progress

Shared control root causes and fixes:

- Shared action menus mounted their popover inside the source row. Opening a
  menu therefore invalidated the row, tree/list, and surrounding workspace.
  Menus now render in a fixed, body-level portal with bounded viewport
  positioning and layout/paint/style containment.
- The shared menu's capture-phase scroll listener treated descendant and
  auto-scroll events as viewport movement, which could close a project action
  menu immediately after opening. It now listens only for viewport scrolling
  and focuses menu items without scrolling.
- Small Studio layout and view-adder popovers used the same document scroll
  lock as blocking modals. Their environment token is now explicitly
  non-locking, so opening a menu-like panel does not write the body's overflow
  style or trigger root scrollbar/layout work.
- Native inert and CSS visibility changes across a mounted React Flow subtree
  caused Chromium to reprocess the graph and resize its background SVG on
  every pane-tab activation. Warm views now preserve layout and switch only
  paint and pointer state, with aria-hidden retaining the accessibility-tree
  ownership boundary.

Live hosted-panel evidence:

- The user confirmed the repaired hierarchy is substantially better.
- A fresh browser run authenticated against the rebuilt profile, removed stale
  test projects, created a new project and blank Flow, exercised the Studio,
  and removed the project successfully.
- Repeated Flow action menus paint in 30-31 ms with approximately 0.1 ms of
  layout. Arrange Workspace paints in 30-32 ms with under 1 ms layout. Add Tab
  paints in about 30 ms with under 2.2 ms layout. The inline open-tab finder
  paints in 61-68 ms.
- Pane tabs initially measured 127-160 ms because native subtree interaction
  state caused 95-126 ms full-document layouts and repeated React Flow SVG
  size invalidations. The paint-only mounted-view contract reduced the same
  six switches to 63-86 ms and the complete live gate passed.
- Flow hierarchy view commits remain 23-37 ms in the passing run. Stable paint
  was 83-127 ms, with first-use Settings at 127 ms and the other tested views
  below 93 ms.
- No maximum-update-depth errors, browser console errors, failed API responses,
  or interaction-budget violations occurred in the passing run.

Validation checkpoint:

- Shared menu and overlay contracts pass 31/31 focused tests.
- Mounted-view workspace contracts pass 7/7 focused tests.
- The web type check passes.
- The live desktop Chromium create/switch/menu/picker/delete workflow passes.
- The next checkpoint audits in-place controls in each non-Studio global
  program so shared-shell responsiveness is verified independently of route
  navigation time.

### 2026-08-30 - Global Program Interaction Audit

Status: Complete and verified against the hosted panel

Audit coverage and root causes:

- The browser regression now opens every global program, measures its shared
  Technical Details drawer, and exercises one representative local search,
  filter, segmented control, or tab without including API/navigation time.
- Shared modal and drawer setup previously mutated native inert and body
  overflow across the whole application. The shared focus trap now uses an
  accessibility boundary plus scoped wheel/touch prevention, preserves focus
  without scrolling, and contains scroll chaining inside each overlay.
- Every non-Docs local control measured in the 17-32 ms range. Docs remained
  the sole outlier at 226-367 ms despite having only 173-371 document nodes,
  proving that data volume and recursive tree size were not the cause.
- A Chromium invalidation trace identified `.docs-program-layout` as the
  expensive layout root. Its nested three-track CSS grid repeatedly spent
  200-320 ms recomputing intrinsic tracks when overlays or input state changed.
  The shell now uses equivalent fixed-basis flex regions, preserving the same
  explorer/viewer/outline composition without intrinsic grid-track work.

Verified result:

- The Docs search interaction fell to 77.5 ms and passed the 120 ms warm
  interaction budget.
- The Docs Technical Details drawer visibly opened in 30 ms.
- The Docs-only hosted Chromium regression passed and was followed by the
  complete global-program plus Automation Studio browser run below.

Final hosted-panel verification:

- The complete regression passed in 1.8 minutes, including all nine global
  programs and a fresh Automation Studio project and blank Flow.
- Representative local controls measured 15.3-31.6 ms in every non-Docs
  program. Docs measured 103.5 ms in the complete run and remained below the
  120 ms warm-interaction budget.
- Shared Technical Details drawers visibly opened in 29-32.1 ms across every
  program.
- Studio action menus measured 30.1-30.6 ms, workspace arrangement
  30.6-31 ms, Add Tab 30.9 ms, and the open-tab finder 55.8-64.2 ms.
- Warm Studio hierarchy selections measured 71.8-91.2 ms stable paint. Pane
  tabs measured 67.1-85.2 ms.
- First-use Runtime Debug and Settings stable paint measured 134.9 ms and
  135.1 ms, both below the 300 ms first-use budget.
- The run reported no maximum-update-depth errors, console errors, failed
  responses, or interaction-budget violations, and removed its temporary
  project after completion.

Final repository validation:

- Web type checking passes.
- The complete web suite passes: 183 test files and 918 tests.
- Authored-link and deterministic generated-document checks pass.
- `git diff --check` passes.
- The production Next compiler completed successfully. Its subsequent
  lint/type worker exited on Windows with code `3221225477`; the independent
  TypeScript gate passes. Running the production build against the same
  `.next` directory as the user-hosted dev process also left that dev process
  returning HTTP 500, so it requires a manual restart before further testing.
