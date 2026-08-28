# Automation Studio Fast UI Cache Plan

Status: in progress
Owner: Automation Studio
Last updated: 2026-08-28
## Implementation Log

### 2026-08-28 Step 1: Parallel implementation assignments

Status: in progress

Parent-thread reference: this doc is now the source of truth for the cache/scalability implementation. Subagents must not edit it; the parent updates it after each assignment, integration, and validation step.

Assignments:

- Phase 1 and Phase 3 storage contract/cache store assigned to Schrodinger (`01a04735-2b4f-7183-b2ad-07fbb1a87ddc`). Write scope: `packages/fluxiq/src/programs/automation-studio/storage/`.
- Phase 4 API/runtime endpoints assigned to Arendt (`01a04735-498b-75d3-80c4-1e001aed45b6`). Write scope: automation-studio API contracts/handlers/runtime service tests.
- Phase 5, Phase 6, and Phase 8 client cache/workspace/view integration assigned to Dewey (`01a04735-d4e5-75b0-90b9-3711afde1ca0`). Write scope: `apps/web/src/features/automation-studio/` client hooks/controllers and focused tests.
- Phase 2 SQL optimization audit/remediation and Phase 7 lazy preload planning support assigned to Goodall (`01a04735-f13d-79f0-972c-24c80eaf6c0f`). Write scope: storage query-plan tests/indexes and small preload utilities only.

Parent validation responsibilities:

- Review every worker result before integration.
- Keep UI interaction state immediate in React; cache writes cannot block clicks, tab switches, tree selection, or graph selection.
- Keep durable mutations separate from UI cache writes.
- Run focused tests/checks and update this log after each completed phase or meaningful step.

### 2026-08-28 Step 2: Engine decision confirmed

Status: in progress

Reference: Phase 1 Contract and Storage Design, Phase 3 Cache Store Implementation.

Decision after source inspection: implement the first pass as the planned SQLite WAL fallback behind the LMDB-shaped `AutomationStudioUiCacheStore` contract. The repo has no LMDB dependency today, while `AutomationStudioProjectDatabase` already provides WAL, `busy_timeout`, queued operations, and SQL performance metrics. This keeps the cache rebuildable and fast without introducing a native dependency into the current lag fix.

Integration constraint for all workers: callers must depend on the cache-store interface and typed key/value entries, not on SQLite-specific details. LMDB remains a later engine swap, not a blocker for getting exact UI state cached now.
### 2026-08-28 Step 3: Change-feed polling DB pool fix

Status: implemented, pending validation

Reference: Phase 2 SQL Optimization Audit and Query Plan Remediation.

Change made in parent thread: `AutomationStudioService.listProjectChangeFeed` now reuses the service-owned `projectDatabasePool` instead of creating and closing a fresh `AutomationStudioProjectDatabasePool` on every change-feed poll. This removes repeated SQLite pool setup/teardown from project-open and mutation-sync paths.

Validation target: focused runtime/service test coverage plus full package check after cache/API/client integration lands.## Goal

Automation Studio must restore and switch project UI state instantly without using the durable project hierarchy save path as the interaction cache. Every project change that affects the user experience should update a fast, rebuildable cache for the exact current UI state: open panes, active tabs, selected objects, sidebar expansion, view-local filters, pagination, loaded detail summaries, viewport state, and per-view scratch state.

This cache must improve responsiveness without compromising scalability. It must avoid full-project JSON rewrites on ordinary clicks, avoid loading every object in large projects, and never become the durable source of truth for Flow definitions, runtime events, recordings, instructions, or adaptations.

## Current State

- `AutomationStudioLive` stores layout and view state in `workspacePrefs` and currently debounces persistence through `save-project-hierarchy`.
- `save-project-hierarchy` writes hierarchy nodes, deleted hierarchy ids, and `workspacePrefs` together, then appends a hierarchy change-feed event.
- `get-project-hierarchy` returns durable/custom hierarchy and `workspacePrefs` from project storage.
- Project detail loading is already moving toward scoped requests, summary-first open, and change-feed reconciliation.
- The repo does not currently include an LMDB dependency. It already includes SQLite via `sqlite3`, and project storage already has pooled per-project SQLite support.
- SQL performance remains part of the UI problem. Cache cannot be used to hide inefficient queries; project open, sidebar paging, summaries, runtime logs, and graph viewport endpoints need query-plan audits and indexes wherever they touch growing tables.
- Project open should opportunistically preload likely-needed data after the shell renders, but preload work must be lazy, cancellable, and never required before the UI can respond.

## Design Decision

Create a separate rebuildable UI cache database with a key/value-first contract.

The application code should depend on an `AutomationStudioUiCacheStore` interface. The first implementation should be one of:

1. **Preferred target:** LMDB-backed cache store under `.fluxiq/cache/automation-studio/ui-cache/` if the dependency can be added cleanly.
2. **Immediate fallback:** separate SQLite WAL cache database under the same cache root if LMDB install/build is blocked.

The interface and schema should be LMDB-shaped even if the first implementation uses SQLite: typed keys, small values, batched writes, per-project/user namespaces, revision/digest metadata, and bounded eviction. That lets us switch engines without rewriting Automation Studio UI logic.

Cache work must be paired with SQL optimization. A fast cache cannot become permission to keep slow durable reads. Every endpoint used by project open, sidebar paging, runtime debug, graph viewporting, instructions, adaptations, and settings must have an expected query shape, indexes, pagination limits, and tests that prevent accidental full scans as data grows.

## Non-Goals

- Do not replace durable project databases or object stores.
- Do not cache secrets, auth pins, encrypted key material, or raw privileged action payloads.
- Do not store unbounded runtime event logs in UI cache. Store cursors, active page ids, compact summaries, and recently viewed pages only.
- Do not make UI cache writes participate in Flow/adaptation/runtime transactions.
- Do not use this cache as a conflict resolution authority. Durable project state and change feed remain authoritative.

## Cache Ownership Model

The cache is rebuildable operator state. It can be deleted without corrupting a project. It should live under framework cache paths, not project authored/durable content.

Proposed path:

```text
.fluxiq/cache/automation-studio/ui-cache/
  cache.sqlite              # fallback/initial SQLite implementation
  lmdb/                     # LMDB implementation when enabled
```

Namespaces:

- `project:{projectId}:user:{userId}:workspace` for exact workspace shell state.
- `project:{projectId}:user:{userId}:hierarchy-ui` for sidebar-only visual state.
- `project:{projectId}:user:{userId}:view:{viewId}:scope:{scopeKey}` for view-local state.
- `project:{projectId}:data:{kind}:{resourceId}` for bounded loaded-data cache entries.
- `project:{projectId}:graph:{flowId}:viewport:{partitionKey}` for graph viewport/partition cache.
- `project:{projectId}:meta` for schema version, cache revision, last change-feed cursor, and cache health.

## Data Model

### Workspace Shell State

Exact state needed to restore the Studio shell immediately:

```ts
type AutomationStudioCachedWorkspaceState = {
  schemaVersion: 1;
  projectId: string;
  userId: string;
  savedAt: number;
  activeProjectId: string;
  activePaneId: string;
  activeViewId: string;
  panes: Array<{ id: string; activeViewId: string; tabs: string[] }>;
  rightSidebar: { activeViewId: string; tabs: string[]; collapsed: boolean };
  bottomDock: { activeViewId: string; expanded: boolean };
  mainLayoutPreset: string;
  mainSplitRatios: number[];
  sidebarWidth: number;
  leftSidebarCollapsed: boolean;
  inspectorWidth: number;
  bottomTimelineHeight: number;
  density: string;
  motion: string;
  selected: unknown;
};
```

Rules:

- Save as a small record, not embedded inside hierarchy payloads.
- Write on layout/tab/view/selection changes with a short debounce and idle batching.
- Load before view details hydrate so the window layout appears immediately.

### Hierarchy UI State

Sidebar state that should render instantly without waiting for project data reload:

```ts
type AutomationStudioCachedHierarchyUiState = {
  schemaVersion: 1;
  projectId: string;
  userId: string;
  savedAt: number;
  search: string;
  typeFilter: string;
  collapsedFolderIds: string[];
  expandedDefaultCollapsedIds: string[];
  focusedTreeNodeId: string | null;
  primaryTreeNodeId: string | null;
  loadedPageCursorsByParentId: Record<string, string | null>;
};
```

Rules:

- Keep this separate from durable hierarchy nodes.
- Only cache UI expansion/focus/search/pagination state.
- Validate ids against loaded hierarchy when rendering; ignore missing ids.

### View State Records

Each inner view owns its own exact state record:

```ts
type AutomationStudioCachedViewState = {
  schemaVersion: 1;
  projectId: string;
  userId: string;
  viewId: string;
  scopeKey: string;
  savedAt: number;
  digest: string;
  payload: Record<string, unknown>;
};
```

Examples:

- Runtime Debug: selected run id, active log tab, page cursor, event filters, expanded JSON row id.
- Flow Nodes: selected node ids, selected edge ids, viewport transform, open palette section, outline open/focus state.
- Router: selected route/group, canvas viewport, list filters.
- Instructions: selected instruction id, active scope filter, draft field state if safe.
- Settings: selected section, unsaved local form snapshot if non-secret.
- Adaptations: selected adaptation id, review filters, current page cursor.
- Recordings: selected recording/timeline/action ids, preview dock state.
- State View: selected state path, compared snapshot ids, expanded JSON paths.

Rules:

- Store by `viewId + scopeKey`, not one massive `viewStates` blob.
- Scope key must include Flow/subflow/run/recording ids where relevant.
- Use digest checks to avoid no-op writes.
- Large values must be chunked or rejected from UI cache.

### Loaded Data Cache

A bounded cache for recently loaded summaries/details:

```ts
type AutomationStudioCachedDataEntry = {
  schemaVersion: 1;
  projectId: string;
  kind: "flow-summary" | "flow-detail" | "subflow-detail" | "run-page" | "run-event-page" | "recording-summary" | "instruction-page" | "adaptation-page" | string;
  resourceId: string;
  revision?: number;
  updatedAt?: number;
  changeFeedCursor?: number;
  cachedAt: number;
  expiresAt: number | null;
  byteLength: number;
  payload: unknown;
};
```

Rules:

- Cache data that is expensive but safe to re-read.
- Do not cache full massive projects as one value.
- Runtime logs must be page-based and capped.
- Invalidate by change-feed entity kind/id, not by `root` unless doing a recovery refresh.

## SQL Optimization Audit Requirements

The cache project must include a SQL audit because Automation Studio needs to scale even when the cache is cold, expired, deleted, or invalidated. The audit should treat slow SQL as a root cause, not something the cache masks.

Audit scope:

- `get-project-hierarchy` and hierarchy page endpoints:
  - Verify child paging uses indexed `parent_entry_id, sort_key, entry_id` access.
  - Verify subtree reads use indexed path keys or closure-style paths without scanning all entries.
  - Verify search uses FTS and joins back by primary key.
- `get-project-workspace-summary`, `list-flow-summaries`, and `list-flow-metadata-page`:
  - Ensure summary endpoints read compact summary tables/views, not full Flow documents.
  - Ensure status/date/name filters are backed by indexes.
  - Avoid per-Flow N+1 detail reads during project open.
- Flow/detail endpoints:
  - `get-flow` should retrieve one Flow by primary key and only join required resource rows.
  - Flow object references, subflow summaries, router routes, instruction summaries, and adaptation counts should have targeted indexes.
- Graph viewport endpoints:
  - Ensure graph partition reads are bounded by viewport/partition keys.
  - Avoid loading all nodes/edges to answer visible-viewport requests once graph size grows.
- Runtime Debug endpoints:
  - `list-runtime-sessions`, `list-flow-runs`, `list-flow-run-actions`, and `list-flow-run-events` must be SQL-level paginated.
  - Index by project/flow/run plus descending started/sequence/order fields.
  - Detail JSON should only be fetched for selected pages or selected rows.
- Instructions/adaptations/settings endpoints:
  - Index by project, owner Flow/subflow id, scope, status, updated time, and revision where applicable.
  - Effective instruction cache invalidation should be targeted by scope revision, not table-wide unless necessary.
- Change feed:
  - `list-project-change-feed` must remain indexed by sequence and project.
  - Reconciliation should consume pages without requiring hierarchy or summary root reloads.

Required SQL practices:

- Add `EXPLAIN QUERY PLAN` tests for critical growing-table reads where feasible.
- Add query budget tests for cold-cache project open, warm-cache project open, sidebar page load, runtime event page load, and graph viewport load.
- Prefer keyset pagination over offset pagination for large tables unless offset is bounded and justified.
- Never query a full table to compute a UI badge when a maintained count/summary row can answer it.
- Keep JSON blobs out of indexes; index extracted columns/digests/revisions instead.
- Use WAL, busy timeouts, bounded transactions, and batched writes for cache and project DB updates.
- Record SQL latency and row counts in performance metrics so regressions appear in the Data Flow Inspector.

Acceptance:

- Every cache-backed endpoint documents its cold-cache query path.
- Critical project-open/sidebar/runtime/graph queries have either an index-backed plan test or a documented reason why not.
- The UI remains usable when the cache DB is deleted.
## API Plan

Add endpoints to `AUTOMATION_STUDIO_ENDPOINTS`:

- `get-project-ui-cache`
- `save-project-ui-cache`
- `delete-project-ui-cache`
- `list-project-ui-cache-stats`

Request/response shapes:

```ts
type GetProjectUiCacheRequest = {
  projectId: string;
  userId?: string;
  keys?: string[];
};

type SaveProjectUiCacheRequest = {
  projectId: string;
  userId?: string;
  entries: Array<{
    key: string;
    value: unknown;
    digest?: string;
    ttlMs?: number | null;
  }>;
};

type ProjectUiCacheResponse = {
  entries: Array<{
    key: string;
    value: unknown;
    digest: string;
    savedAt: number;
    expiresAt: number | null;
  }>;
  cacheRevision: number;
};
```

Permissions:

- Read cache: `programs.read`
- Save/delete cache: `programs.write`
- Cache stats: `programs.read`

Security:

- Reject keys outside the current project namespace.
- Enforce max entry size and max batch size.
- Strip/deny known secret-bearing fields.
- Cache writes should not require PIN because they are rebuildable UI state, not privileged durable mutation.

## Runtime/Storage Plan

Add new framework storage files:

```text
packages/fluxiq/src/programs/automation-studio/storage/project-ui-cache-store.ts
packages/fluxiq/src/programs/automation-studio/storage/project-ui-cache-store.test.ts
```

Core interface:

```ts
export type AutomationStudioUiCacheEntry = {
  projectId: string;
  userId: string;
  key: string;
  valueJson: string;
  digest: string;
  byteLength: number;
  savedAt: number;
  expiresAt: number | null;
};

export interface AutomationStudioUiCacheStore {
  get(input: { projectId: string; userId: string; keys: string[] }): Promise<AutomationStudioUiCacheEntry[]>;
  putBatch(input: { projectId: string; userId: string; entries: Array<{ key: string; value: unknown; ttlMs?: number | null }> }): Promise<{ saved: number; cacheRevision: number }>;
  delete(input: { projectId: string; userId?: string; keys?: string[] }): Promise<{ deleted: number }>;
  stats(input?: { projectId?: string }): Promise<{ entries: number; bytes: number; projects: number }>;
  compact(): Promise<void>;
}
```

SQLite fallback schema:

```sql
create table if not exists ui_cache_entries (
  project_id text not null,
  user_id text not null,
  cache_key text not null,
  value_json text not null,
  digest text not null,
  byte_length integer not null,
  saved_at_ms integer not null,
  expires_at_ms integer,
  primary key (project_id, user_id, cache_key)
);

create index if not exists idx_ui_cache_project_saved_at
  on ui_cache_entries(project_id, saved_at_ms desc);

create index if not exists idx_ui_cache_expiry
  on ui_cache_entries(expires_at_ms)
  where expires_at_ms is not null;
```

LMDB implementation notes:

- Use one environment for UI cache, with named DBs for `entries`, `meta`, and optionally `byProject`.
- Key should be a single ordered string: `${projectId}\0${userId}\0${cacheKey}`.
- Values should be compact JSON buffers initially; binary codecs can come later.
- Use batched transactions for save calls.
- Keep max map size configurable.

## Client Integration Plan

Add a client-side cache coordinator:

```text
apps/web/src/features/automation-studio/cache/ui-cache.ts
apps/web/src/features/automation-studio/cache/ui-cache.test.ts
```

Responsibilities:

- Build stable scoped cache keys.
- Compute digests and skip duplicate writes.
- Batch changes from workspace, hierarchy UI, and view-local state.
- Flush on debounce, `visibilitychange`, and project switch.
- Never block visual interaction on cache writes.
- Hydrate exact cached state on project open before heavy detail endpoints.

Integration points in `AutomationStudioLive`:

- On project open:
  - Load durable hierarchy as today.
  - In parallel, request `workspace`, `hierarchy-ui`, and active view keys from UI cache.
  - Apply cache state first if schema/user/project ids match.
  - Hydrate durable data/details afterward.
- On `updateWorkspacePrefs`:
  - Update React state immediately.
  - Queue workspace shell cache write.
  - Keep durable `save-project-hierarchy` only for durable hierarchy and stable user preferences, with slower debounce.
- On sidebar state changes:
  - Queue `hierarchy-ui` cache write.
- On view state changes:
  - Each view emits scoped cache payloads through a small callback or shared hook.
- On data loaded:
  - Cache summaries/detail pages by typed resource id and revision.

## Lazy Project Preload Plan

Automation Studio should warm useful project data as soon as Studio opens, but preload must never block rendering, input, sidebar selection, tab switching, or project open completion. The shell should render from durable minimal state plus UI cache first; preload begins only after the first usable paint and is always cancellable.

Scheduler contract:

- Start preload after project shell state is applied and the browser has yielded at least once.
- Use an idle/low-priority queue. Prefer `requestIdleCallback` when available, fall back to small `setTimeout` slices.
- Concurrency starts at 1 and can rise to 2 only when recent tasks are fast and the user is idle.
- Every task uses `AbortController`; cancel immediately on project switch, user logout, navigation away, or newer task supersession.
- Pause or reduce preload work during active pointer/keyboard interaction, drag/select operations, graph editing, or when the tab is hidden.
- Preload results must update local caches/data stores only if still relevant to the active project and current revision/cursor.
- Preload failures are diagnostics only. They must not show blocking errors or spinners in the normal UI.

Preload priority tiers:

1. **Tier 0: shell restore, blocking only on exact keys**
   - Exact UI cache keys for workspace shell, hierarchy UI, active view state, and selected Flow/subflow/run/recording scope.
   - No full scans; request only known keys.
2. **Tier 1: immediately likely data**
   - Active Flow/subflow detail if the selected tab requires it.
   - Router summary for the selected Flow.
   - First page of runtime runs for the selected Flow when Runtime Debug is open or pinned.
   - First page of sidebar children for expanded visible folders.
3. **Tier 2: near-future tab data**
   - First pages for tabs already open in panes/right sidebar.
   - Instructions/settings/adaptations summaries for the selected Flow/subflow.
   - Recent recordings summaries for visible recording folders.
4. **Tier 3: opportunistic warm data**
   - Adjacent sidebar page cursors.
   - Recently used Flow details from UI cache history.
   - Recently selected run event/action pages.

Strict limits:

- Do not preload all Flow details for a project.
- Do not preload full runtime logs.
- Do not preload all graph nodes/edges outside viewport or partition requests.
- Do not preload while a mutation queue is backed up.
- Do not let preload API calls share the same priority lane as user-triggered requests.

Client implementation shape:

```ts
type AutomationStudioPreloadTask = {
  id: string;
  projectId: string;
  priority: 0 | 1 | 2 | 3;
  reason: string;
  cacheKey?: string;
  run(signal: AbortSignal): Promise<void>;
};
```

Preload instrumentation:

- queued task count by priority
- completed/skipped/cancelled task counts
- time spent per idle slice
- user-request starvation guard
- cache hit/miss for preloaded entries

Acceptance:

- Project open marks the shell usable before preload begins.
- User-triggered clicks/tabs/sidebar selection always outrank preload tasks.
- Preload can be disabled in diagnostics and the UI remains correct.
- Warm cache improves later opens without changing durable project truth.
## Invalidation Plan

Invalidation is typed and bounded:

- Flow changed: invalidate `flow-summary:{flowId}`, `flow-detail:{flowId}`, graph viewport partitions for that Flow, and affected view states only when scope references that Flow.
- Subflow changed: invalidate `subflow-detail:{parentFlowId}:{subflowId}` and affected sidebar page cursors.
- Recording changed: invalidate recording summaries/details and timeline page caches for that recording.
- Runtime run changed: invalidate run summary and specific event/action pages for that run.
- Instruction changed: invalidate instruction page/detail/effective instruction cache for that Flow/subflow scope.
- Adaptation changed: invalidate adaptation list/detail pages for that Flow/subflow scope.
- Project deleted: delete all cache entries under project id.
- Schema version changed: ignore old entries and schedule async cleanup.

## Scalability Rules

- Max entry size: start at 256 KB, reject larger UI entries unless explicitly chunked.
- Max save batch: start at 100 entries.
- Max project cache bytes: configurable; default target 64 MB per project.
- Runtime event pages: cap page size and TTL; do not cache unbounded full logs.
- Workspace shell/hierarchy UI entries should remain under 64 KB.
- Cache hydration must request exact keys, not scan the project cache.
- Cache stats must be indexed and must not read all values.

## Failure Semantics

- Cache read failure: log warning/performance metric, continue with durable defaults.
- Cache write failure: surface only in developer diagnostics, never block UI.
- Cache corruption: ignore invalid entry, increment corruption metric, allow delete/compact.
- Cache schema mismatch: ignore old entries and keep project usable.
- Durable mutation success with cache failure: mutation still succeeds.

## Phases

### Phase 1: Contract and Storage Design

Status: complete - validated by framework cache/API checks and tests.

Tasks:

1. Add cache endpoint names and request/response contract types.
2. Add `AutomationStudioUiCacheStore` interface.
3. Decide engine for first implementation:
   - Use LMDB if dependency addition/build is approved and passes smoke tests.
   - Otherwise implement the same interface with a separate SQLite WAL cache DB.
4. Add storage path resolver under framework cache path.
5. Add docs explaining cache ownership and non-authoritative semantics.
6. Define cold-cache SQL expectations for every endpoint this cache will warm.

Acceptance:

- Contracts compile.
- No UI integration yet.
- Tests cover key validation, digest calculation, TTL normalization, and project namespace enforcement.
- SQL audit checklist exists beside the endpoint/cache contract.

### Phase 2: SQL Optimization Audit and Query Plan Remediation

Status: implemented for audited cold-cache paths - query-plan tests cover the current critical reads; continued endpoint-by-endpoint budgets remain in scale certification.

Tasks:

1. Audit SQL for project open, hierarchy paging, workspace summary, Flow summaries, Flow details, graph viewport, runtime sessions/actions/events, instructions, adaptations, and change feed.
2. Add or adjust indexes for growing-table reads.
3. Replace offset pagination with keyset pagination where large offsets are possible.
4. Remove N+1 detail loading from project-open and summary endpoints.
5. Add `EXPLAIN QUERY PLAN` or query-budget tests for critical cold-cache paths.
6. Record SQL latency, rows returned, rows changed, and endpoint context in performance metrics.
7. Document every intentionally unindexed query and its bounded data-size reason.

Acceptance:

- Cold-cache project open avoids full project object scans.
- Sidebar folders and Runtime Debug logs are paginated at SQL level.
- Critical reads have index-backed query plans or explicit bounded exceptions.
- Cache deletion does not make Studio unusably slow.

### Phase 3: Cache Store Implementation

Status: complete for the first SQLite WAL-backed cache store - digest no-op write metrics are deferred to diagnostics hardening.

Tasks:

1. Implement `get`, `putBatch`, `delete`, `stats`, and `compact`.
2. Enforce max key length, max entry size, max batch size, project/user id validation, and TTL.
3. Add digest-based no-op write skipping.
4. Add expired-entry cleanup that runs opportunistically and never blocks reads.
5. Add metrics for cache read/write latency, hit/miss, bytes saved, skipped writes, and corrupt entries.
6. Keep the store physically separate from durable project DB files.

Acceptance:

- Store tests pass for insert/update/get/delete/ttl/stats/namespace violations.
- Repeated identical writes do not rewrite entries.
- Expired entries are not returned.
- Cache stats are indexed and do not scan payloads.

### Phase 4: Runtime Service and API Wiring

Status: complete - validated by framework check and API/storage tests.

Tasks:

1. Instantiate the UI cache store in `AutomationStudioService`.
2. Add service methods:
   - `getProjectUiCache`
   - `saveProjectUiCache`
   - `deleteProjectUiCache`
   - `listProjectUiCacheStats`
3. Register API handlers with read/write permissions.
4. Delete project cache when a project is deleted.
5. Add tests at API and service levels.
6. Ensure cache endpoints do not append normal project change-feed events.

Acceptance:

- API handlers validate payloads and permissions.
- Cache endpoints do not mutate durable project records.
- Project deletion removes cache entries.
- Cache writes do not require PIN.

### Phase 5: Client Cache Coordinator

Status: complete for workspace/sidebar/view-state caching - unload/visibility flush hardening remains tracked under migration and certification.

Tasks:

1. Add client key builder and digest helpers.
2. Add queued write-behind cache coordinator.
3. Add flush triggers for debounce, project switch, visibility hidden, and unload-safe best effort.
4. Add cache hydration helper for exact keys.
5. Add tests for batching, digest no-op skip, scope keys, and flush behavior.
6. Add priority separation so user-triggered API requests outrank cache writes.

Acceptance:

- UI interactions queue cache writes without awaiting them.
- Duplicate state payloads do not produce repeated API calls.
- Project switch flushes pending entries for the outgoing project.
- Cache IO cannot delay sidebar selection, tab switching, or graph gestures.

#### 2026-08-28 Implementation Note
- Status: complete for the client slice.
- Parent coordination: Phase 5 added `AutomationStudioUiCacheCoordinator`, a local cache backend, non-blocking workspace/sidebar hydration, debounced background writes, and local-first mutation marking.
- Validation: focused tests passed (`83` tests across AutomationStudioLive, coordinator, ProjectTree, workspace components/layout), `pnpm --filter @fluxiq/web check` passed, and `pnpm docs:check` passed after regenerating deterministic references.

### Phase 6: Workspace and Sidebar Integration

Status: complete for cached shell/sidebar integration - validated by web check and focused tests.

Tasks:

1. Load cached workspace shell state on project open.
2. Apply cached panes/tabs/layout before view details hydrate.
3. Move exact volatile `workspacePrefs.viewStates` cache writes out of `save-project-hierarchy` and into UI cache.
4. Cache sidebar search/filter/collapsed/focus/primary row state separately.
5. Keep durable hierarchy writes for actual hierarchy changes only.
6. Add regression tests ensuring tab/sidebar state cache writes do not call `save-project-hierarchy`.
7. Ensure cached sidebar page cursors restore without requesting all children.

Acceptance:

- Opening a project restores window layout and active view from cache quickly.
- Sidebar selected/expanded state restores without scanning all project objects.
- Ordinary tab/sidebar clicks do not write durable hierarchy.

#### 2026-08-28 Phase 6 Implementation Note
- Status: complete for the client slice.
- Parent coordination: sidebar integration now passes cached tree state into `AutomationProjectTree`, reports collapsed/focused/primary row state back to the parent, and caches sidebar search/type filters on the background cache lane.
- Validation: focused tests passed (`83` tests across AutomationStudioLive, coordinator, ProjectTree, workspace components/layout), `pnpm --filter @fluxiq/web check` passed, and `pnpm docs:check` passed after regenerating deterministic references.

### Phase 7: Lazy Non-Blocking Project Preload

Status: complete for the non-blocking preload lane - validated by hook/planner tests and AutomationStudioLive integration tests.

Tasks:

1. Add a lazy preload scheduler with idle slices, cancellation, and priority tiers.
2. Start preload only after the project shell is visible and interactive.
3. Preload exact active cache keys first, then selected Flow/subflow details, visible sidebar child pages, and first pages for already-open views.
4. Cancel preload on project switch and pause/reduce it during active pointer/keyboard/drag/graph interactions.
5. Keep preload API calls separate from user-triggered request lanes.
6. Add diagnostics and tests proving preload does not block initial render or sidebar/tab interaction.

Acceptance:

- First usable project shell render does not wait for preload.
- Preload warms likely data only, not whole projects.
- User interactions always outrank preload work.
- Disabling preload leaves Studio correct, only colder.

### Phase 8: View-Level State Integration

Status: implemented through bounded cached workspace view-state payloads; per-view granular payload audits remain part of scale certification.

Tasks:

1. Runtime Debug caches selected run, mode, filters, pagination cursors, and last viewed pages.
2. Flow Nodes caches viewport transform, selected node ids, selected edge ids, palette state, and outline state.
3. Router caches selected route/group and viewport/filter state.
4. Instructions caches selected instruction/scope and safe draft state.
5. Settings caches selected section and safe local form state.
6. Adaptations caches selected adaptation, filters, and pagination cursors.
7. Recordings caches selected recording/timeline/action and preview dock state.
8. State View caches selected path, compare targets, and expanded JSON paths.

Acceptance:

- Each view owns a small scoped cache payload.
- Cache payloads remain bounded and safe.
- Switching away/back restores the exact visible state without data reload lag.

#### 2026-08-28 Phase 8 Implementation Note
- Status: complete for the client slice.
- Parent coordination: view-level state is handled through the cached `workspacePrefs.viewStates` payload so tab/view switches can hydrate exact state in the background without blocking selection, sidebar transitions, or graph gestures.
- Validation: focused tests passed (`83` tests across AutomationStudioLive, coordinator, ProjectTree, workspace components/layout), `pnpm --filter @fluxiq/web check` passed, and `pnpm docs:check` passed after regenerating deterministic references.

### Phase 9: Loaded Data Page Cache

Status: partially implemented through the existing in-memory data cache and audited SQL page paths; persistent loaded-data pages remain a follow-up after preload runner validation.

Tasks:

1. Cache recently loaded flow details by revision.
2. Cache subflow detail records by parent/subflow ids.
3. Cache runtime event/action pages by run id and page cursor.
4. Cache recording and adaptation pages by resource scope.
5. Invalidate cached data through existing typed invalidation and change-feed events.
6. Add cache hit/miss telemetry to the Data Flow Inspector.
7. Ensure every cached loaded-data entry maps back to an audited SQL path.

Acceptance:

- Cached data is page/revision scoped, not project scoped.
- Large projects hydrate only requested pages/details.
- Change-feed invalidation clears stale cache entries precisely.

### Phase 10: Diagnostics and Recovery UI

Status: implemented for cache recovery and preload visibility; richer SQL/cache-source counters remain in scale hardening.

Tasks:

1. Add cache stats to developer diagnostics/Data Flow Inspector.
2. Add a safe "clear UI cache for this project" action.
3. Add cache health warnings for corrupt/mismatched entries.
4. Add performance counters around project open restore time, cache hit rate, cache write queue latency, SQL latency, and preload queue activity.
5. Show whether data came from UI cache, lazy preload, direct user request, or durable fallback.

Acceptance:

- Developers can tell whether UI state came from cache, durable storage, preload, or network.
- Clearing cache never deletes durable project data.
- Slow cache, preload, and SQL operations are visible in performance diagnostics.

### Phase 11: Migration and Cleanup

Status: partially implemented - volatile view-state writes moved away from durable hierarchy saves; old durable prefs still hydrate as compatibility input.

Tasks:

1. Migrate existing durable `workspacePrefs.viewStates` into UI cache on first project open.
2. Keep stable durable layout preferences only if they are user preferences rather than volatile exact state.
3. Stop writing volatile exact view state into `workspace/preferences.json`.
4. Document cache deletion/rebuild behavior.
5. Add backward compatibility tests for old projects.
6. Ensure migration does not issue full project scans beyond existing durable preference reads.

Acceptance:

- Existing users keep their layouts/selections after upgrade.
- Durable hierarchy writes are smaller and less frequent.
- Old workspace prefs do not break project open.

### Phase 12: Scale Certification

Status: implemented for automated budget coverage; real browser profiling with an oversized synthetic project remains a manual/perf-lab follow-up.

Tasks:

1. Add scale fixture with thousands of hierarchy entries, hundreds of openable view states, many cached runtime pages, and cold-cache SQL paths.
2. Measure project open with warm cache and cold cache.
3. Measure sidebar click, tab switch, run-log restore, graph viewport restore, and lazy preload behavior with cache enabled.
4. Add budget tests for cache key hydration, write batching, SQL page reads, and preload starvation avoidance.
5. Record results in the scale certification docs.

Acceptance:

- Warm cached project shell restore is bounded by exact-key cache reads, not object count.
- Cold cache remains usable because SQL paths are indexed and paginated.
- Sidebar click and tab switch remain local-first.
- Cache DB stats and preload queue size remain bounded after repeated use.

## Current Implementation Boundary

As of Step 14, the implemented system has a separate rebuildable UI cache store, API contract, Program API bridge, sidebar/workspace cache coordination, SQL index remediation, SQL query-plan tests, and developer cache recovery control. This directly addresses the left-sidebar and tab-switch lag path by making selection/local view changes render first and persist through the background cache lane instead of waiting on durable project saves.

Still outstanding before calling the whole scalability program complete:

1. DONE - wire and validate the lazy preload runner, not just the preload planner.
2. PARTIAL - preload queue activity is visible in the Data Inspector; richer cache-source, SQL latency, and skipped-write counters remain.
3. PARTIAL - automated budget tests now cover cache batch limits, cache SQL hot paths, and preload starvation; measured warm/cold browser profiling with an oversized synthetic project remains.
4. Decide whether persistent loaded-data page caching should stay SQLite-backed or switch to LMDB once native dependency policy is approved.

## Open Questions Before Implementation

1. Should we add the `lmdb` package now, accepting the native dependency and lockfile change, or first ship the interface with a separate SQLite cache DB already supported by the repo?
2. Should UI cache be per OS user only, or should it use the authenticated FluxIQ user id when available and fall back to `default`?
3. Which states are safe to cache as form drafts in Settings/Instructions, and which should be excluded because they may contain credentials or sensitive payloads?
4. What is the desired default cache retention: size-only eviction, TTL-only eviction, or both?
5. Should the first implementation add LMDB now, or start with the separate SQLite WAL cache while keeping the LMDB-shaped interface?
6. Which preload tiers should be enabled by default for very large projects, and what hard budgets should stop opportunistic preload?
7. Which SQL query-plan tests are required before enabling the loaded-data cache for runtime logs and graph viewport data?

## Implementation Rule

Update this document after each phase and each meaningful step. Cache work must keep the UI local-first: React state changes first, cache writes and lazy preload in the background, durable writes only for durable mutations, and SQL paths indexed/paginated so cold cache remains usable.

## Step 34 - CSS Literal Escape Regression

Status: Complete.

Finding: the latest Automation Studio CSS cleanup accidentally left a literal PowerShell escape token in `apps/web/src/app/globals.css`, which made Next parse an invalid empty selector and blocked Automation Studio from loading.

Plan:
- Remove the literal escape artifact from `globals.css`.
- Scan Automation Studio UI source and this working doc for the same literal artifact.
- Re-run focused web checks and Automation Studio tests so the fix is verified instead of guessed.

Result: removed the literal escape artifact from `globals.css`, verified no matching artifact remains in Automation Studio source/doc targets, and passed `pnpm --filter @fluxiq/web check`, focused Automation Studio tests (68/68), `pnpm docs:check`, `git diff --check`, and `pnpm --filter @fluxiq/web build`.

## Step 35 - Empty Project Tab Switch Lag Root-Cause Audit

Status: Complete for UI click-path first fix pass.

Problem: Automation Studio still felt laggy when switching tabs or left-sidebar objects even on a project with no meaningful data. The bottleneck was not SQL row volume. The click path itself was doing too much synchronous and near-synchronous work.

Confirmed findings:
- Tab/sidebar selection updated full `workspacePrefs`, not a tiny active-tab state.
- `workspacePrefs` changes re-rendered the entire `AutomationStudioLive` shell, including hierarchy derivation, selection derivation, breadcrumbs, tab title objects, and active view props.
- Sidebar rows used `flushSync` on pointer down, forcing a React render before the browser could paint normal click feedback.
- `activeViewId` changes fed URL/deep-link reconciliation, so local clicks could be followed by URL restore work.
- `activeViewId` was part of the lazy preload input, so every active tab switch cancelled/restarted preload planning even when the open tab set did not change.
- Workspace preference/sidebar changes scheduled UI cache writes; those writes eventually serialized through localStorage/API and could land during continued interaction.
- Typed SQL empty pages return early only when `total > 0`, so empty projects can fall through to legacy/index fallback work. A naive typed-empty shortcut broke hybrid legacy summary fallback and was reverted; this needs a migration/readiness marker before implementation.
- Normal pane tabs are still not preserved as mounted panes; inactive tabs are represented only as ids. That remains the larger follow-up if switching between heavy views still remounts too much.

Implemented first fix pass:
- Removed `flushSync` and pointer-down preview rendering from `ProjectTree` row selection.
- Memoized the Automation Studio view registry and `viewById` map to reduce needless renderer churn.
- Stopped passing `activeViewId` into the lazy preloader; the preloader now keys off project/flow/run/open-view set instead of visual focus.
- Delayed workspace/sidebar UI cache writes to 1200 ms and stopped treating non-persistent workspace preference updates as cache-generation mutations.
- Added a deep-link no-op guard when URL state already matches the visible workspace.
- Updated regression tests to protect against reintroducing forced sidebar sync rendering and active-tab-driven preload churn.
- Attempted a typed SQL empty-page shortcut, found it broke the 10k subflow legacy-summary fallback, and reverted that code rather than risking data correctness.

Validation:
- `pnpm --filter @fluxiq/web check` passed.
- Focused UI tests passed: `AutomationStudioLive.test.ts`, `ProjectTree.test.tsx`, and `useAutomationStudioLazyPreloader.test.ts`.
- `pnpm --filter @fluxiq/web build`, `pnpm docs:check`, and `git diff --check` passed.
- Direct focused FluxIQ service paging test passed after reverting the unsafe typed-empty shortcut; broader `fluxiq` automation-studio service tests still have unrelated adaptation-review failures.

## Step 36 - Remove URL Routing From Live Studio Selection

Status: Complete.

Problem: A project with one empty Flow still lagged and could visually bounce between tabs. That proves the hot path was not project data volume. The Studio was still treating active view/sidebar selection as URL/deep-link state and too much render/storage work was still attached to selection.

Confirmed findings:
- Query params are useful for opening a project or initial deep-link bootstrap, but they must not be the source of truth for ordinary tab/sidebar clicks.
- The live sync effect wrote `flow`, `subflow`, and `view` params from `activeViewId` on every view change.
- Because `useSearchParams` is a Next navigation hook, changing those params can wake route-level subscribers and re-enter Automation Studio effects even when no data exists.
- Sidebar UI state hydration could emit mismatched default local state while cached state was still hydrating, causing extra parent render/cache-write churn on project open.
- Workspace UI-cache scheduling still reacted to active-view-only preference changes; those writes were delayed but could land during continued interaction.
- Opening an empty Flow still performed synchronous browser storage reads for graph draft recovery.
- The graph editor recreated ReactFlow props/callbacks and rebuilt native node-definition/palette structures during selection renders.
- Marquee selection updated the drag box on every pointer event instead of coalescing DOM work to animation frames.

Implemented in this step:
- Removed active-view URL sync from `AutomationStudioLive`; `view=` is no longer written during normal tab/sidebar selection.
- Kept project-level URL writes through `setProjectUrl` so opening/closing projects can still update the address bar.
- Kept initial deep-link restore, keyed by `searchParams.toString()`, so external links can still bootstrap the intended project/flow/view once.
- Guarded sidebar state hydration/emission so cached tree state does not cause duplicate parent updates.
- Skipped workspace UI-cache writes for active-view-only preference changes.
- Deferred graph draft recovery localStorage/IndexedDB reads through the idle task scheduler and removed draft-save localStorage reads from the selection/draft-sync path.
- Stabilized ReactFlow option/key-code props and connection/selection callbacks.
- Replaced render-time node-definition JSON signature work with a cheaper deterministic signature helper and memoized policy palette derivation.
- Coalesced marquee pointermove UI updates with `requestAnimationFrame`.
- Updated regression tests to enforce local tab state, active-tab-independent preload, deferred draft recovery, and sidebar render guards.

Validation:
- Focused Automation Studio UI tests passed: 92/92.
- `pnpm --filter @fluxiq/web check` passed.
- `pnpm docs:check` passed.
- `git diff --check` passed with only existing CRLF normalization warnings.
- Literal PowerShell newline artifact scan passed.
- `pnpm --filter @fluxiq/web build` passed.
## Step 37 - Decouple Selection Paint From Heavy View Mount

Status: Complete.

Problem: After removing live URL sync and cache/write churn, the browser still felt laggy with one empty Flow. That means selected row/tab paint was still coupled to shell render and active view mount work. The Studio must show selection immediately, then let the heavy view body wake after the browser has had a frame to paint.

Implemented:
- Added an active-view render readiness key in `AutomationStudioLive`.
- The readiness key follows main pane active view, active pane id, right-sidebar active view, and right-sidebar collapsed/open state.
- View-body activation is deferred through `requestAnimationFrame`, while tab/sidebar selected state remains synchronous.
- Heavy inactive views continue to render sleeping placeholders during the deferred frame.
- Added a regression test that active view bodies are gated by the deferred readiness key.

Validation:
- Focused UI tests passed: 83/83.
- `pnpm --filter @fluxiq/web check` passed.
- Literal PowerShell newline artifact scan passed for the touched files.
## Step 38 - Bound Browser Storage JSON Work

Status: Complete.

Problem: Even with one empty Flow, stale browser storage can contain oversized graph drafts, UI-cache envelopes, or instruction drafts from previous sessions. Reading a key is cheap, but parsing or stringifying an unbounded JSON blob can freeze the main thread and make the current empty project feel broken.

Implemented:
- Added a hard character limit before parsing legacy graph drafts from localStorage.
- Removed oversized or corrupt legacy graph draft entries before returning so repeated project opens do not hit the same bad parse path.
- Skipped legacy localStorage graph-draft writes when the serialized draft is too large.
- Added a hard character limit before parsing/writing local UI-cache fallback entries.
- Removed oversized/corrupt UI-cache fallback entries so durable cache/API fallback can rebuild the state safely.
- Added a hard character limit before parsing/writing local instruction recovery drafts.
- Added regression tests for oversized graph drafts, UI-cache fallback entries, and instruction draft recovery entries.

Validation:
- Focused storage/view tests passed: 114/114.
- `pnpm --filter @fluxiq/web check` passed.
## Step 39 - Stop Using View Internals As Browser Routes

Status: Complete.

Problem: The Studio shell stopped syncing active tab/sidebar state to the URL, but several heavy inner views still wrote pagination/filter/section state into `window.history.replaceState`. In a Next App Router client tree, even direct history mutation can wake search-param subscribers and route-state bookkeeping. That is the wrong model for a responsive desktop-style program: the URL may bootstrap a project, but ordinary view clicks must be in-memory UI state plus cache, not route transitions.

Implemented:
- Removed live subflow-directory pagination/filter URL writes from `AutomationSubflowsWorkspace`.
- Removed live instruction-directory pagination/filter URL writes from `AutomationInstructionsWorkspace`.
- Removed live settings-section URL writes from top-level Flow and Subflow settings views.
- Kept URL readers as one-way bootstrap helpers for old/deep links, but stopped treating them as ongoing state sinks.
- Changed settings section scroll to immediate scroll instead of smooth scrolling so section clicks do not create slow animated feedback.

Expected effect:
- Opening or switching views no longer mutates search params except for project open/close bootstrap.
- Sidebar/tab selection can paint without the browser/Next route layer doing work for view-local state.

Validation:
- Pending focused tests and typecheck after this step.
## Step 40 - Short-Circuit Sleeping View Rendering Before Heavy Props

Status: In Progress.

Problem: Even after active bodies were deferred, `AutomationStudioLive.renderViewContent` still constructed the full `AutomationViewRenderer` prop object for inactive/deferred views. That means sidebar and tab selection could still pay parent-side work for timelines, runtime sessions, graph drafts, state inputs, handlers, and derived labels before the selected row/tab visibly updates.

Planned implementation:
- Export the sleeping-view helper and sleepable-view predicate from the renderer.
- In `AutomationStudioLive.renderViewContent`, return the sleeping placeholder immediately when a view is inactive/deferred.
- Keep active views using the full renderer path.
- Add source-level regression coverage so this does not drift back to passing all heavy props for sleeping views.

Validation:
- Pending focused tests and typecheck after implementation.
## Step 41 - Bound Graph Editor Palette Storage

Status: In Progress.

Problem: Opening an empty Flow mounts the nodes whiteboard. The node palette still read and parsed `fluxiq:node-palette:favorites` from localStorage without a size guard. A stale oversized value from an older session can freeze the main thread even when the current project has one empty Flow.

Planned implementation:
- Add a hard size limit for node-palette favorites localStorage.
- Remove oversized or corrupt favorites before parsing repeatedly.
- Skip writing oversized favorites.
- Add tests around oversized stale favorites.

Validation:
- Pending focused graph editor tests and typecheck after implementation.
## Final Validation - Steps 39-41

Status: Complete.

Validated after the latest live-UI fixes:
- `pnpm --filter @fluxiq/web test -- src/features/automation-studio/AutomationStudioLive.test.ts src/features/automation-studio/hierarchy/ProjectTree.test.tsx src/features/automation-studio/controllers/useAutomationStudioUiCacheCoordinator.test.ts src/features/automation-studio/controllers/useAutomationStudioLazyPreloader.test.ts src/features/automation-studio/views/WorkspaceViews.test.tsx src/features/automation-studio/views/GraphEditorViews.test.ts src/features/automation-studio/views/Renderer.test.tsx src/features/automation-studio/graph/draft-store.test.ts src/features/automation-studio/graph/worker-tasks.test.ts` passed: 159 tests.
- `pnpm --filter @fluxiq/web check` passed after the Step 39, Step 40, and Step 41 edits.
- `pnpm --filter @fluxiq/web build` passed.
- `pnpm docs:check` passed.
- `git diff --check` passed with line-ending warnings only.

Current route-state rule:
- Automation Studio may keep `project` in the URL for initial bootstrap/project reopen.
- Active tabs, sidebar objects, directory pagination/filter state, and settings section state must remain in memory/cache and must not mutate browser history during normal interaction.
## Step 42 - Fix ProjectTree Maximum Update Depth Loop

Status: In Progress.

Problem: The browser reported `Maximum update depth exceeded` at `ProjectTree.tsx:55`, inside the cached sidebar UI-state hydration effect. That is the direct explanation for the left-sidebar lag/freezing: the tree was repeatedly applying cached arrays into local React state, then echoing state back upward, creating a render/update loop under some cache/hydration shapes.

Planned implementation:
- Make the hydration effect content-idempotent before calling any local tree setters.
- Do not set `collapsedFolderIds`, `expandedDefaultCollapsedIds`, `focusedTreeNodeId`, or `primaryTreeNodeId` when the incoming cached state matches the local state by value.
- Stop echoing externally hydrated/default tree state back to the parent as a fresh local mutation.
- Keep user interactions emitting state normally so sidebar cache still updates after actual tree changes.
- Add regression coverage around the hydration guard and no-echo behavior.

Validation:
- Pending focused ProjectTree tests, Studio tests, and typecheck after implementation.
## Final Validation - Step 42

Status: Complete.

Validated after the `ProjectTree.tsx:55` maximum-update-depth fix:
- `pnpm --filter @fluxiq/web test -- src/features/automation-studio/hierarchy/ProjectTree.test.tsx src/features/automation-studio/AutomationStudioLive.test.ts` passed: 63 tests.
- `pnpm --filter @fluxiq/web test -- src/features/automation-studio/AutomationStudioLive.test.ts src/features/automation-studio/hierarchy/ProjectTree.test.tsx src/features/automation-studio/controllers/useAutomationStudioUiCacheCoordinator.test.ts src/features/automation-studio/controllers/useAutomationStudioLazyPreloader.test.ts src/features/automation-studio/views/WorkspaceViews.test.tsx src/features/automation-studio/views/GraphEditorViews.test.ts src/features/automation-studio/views/Renderer.test.tsx src/features/automation-studio/graph/draft-store.test.ts src/features/automation-studio/graph/worker-tasks.test.ts` passed: 159 tests.
- `pnpm --filter @fluxiq/web check` passed.
- `pnpm --filter @fluxiq/web build` passed.
- `pnpm docs:check` passed.
- `git diff --check` passed with line-ending warnings only.
## Step 43 - Eliminate Sidebar Render Feedback And Preserve Open Views

Status: Complete.

New browser evidence:
- React still reports `Maximum update depth exceeded` at `ProjectTree.tsx:59`.
- Sidebar navigation feels as if it creates a new view every time, including when the corresponding tab is already open.

Confirmed root causes:
- `AutomationProjectTree` still uses two opposing effects to synchronize cached parent state and local tree state. The hydration effect depends on `localTreeStateSignature`, which it changes, while the emission effect depends on `uiStateSignature`, which its parent callback changes. Content guards reduce repetitions but do not remove the feedback topology.
- Main-pane rendering resolves and renders only `pane.activeViewId`. Open inactive tabs exist only as string ids, so switching through the sidebar unmounts one view component and mounts another. An already-open tab does not retain its component-local state or mounted DOM.

Implementation sequence:
1. Make tree hydration react only to a changed external signature and make local emission react only to changed local tree state. Mark locally emitted state as already applied before notifying the parent.
2. Add regression coverage that forbids local state in the hydration dependency list and incoming state in the local emission dependency list.
3. Preserve open pane views as mounted view slots and switch their visibility/activity without recreating their component identity.
4. Ensure `openView` activates an existing pane/tab without changing the tab collection and add deduplication/remount regression coverage.
5. Run focused tests, typecheck, build, documentation checks, and diff/artifact checks.

Progress checkpoint after items 1-2:
- Tree hydration now depends only on the external `uiStateSignature`; changing local tree state cannot retrigger hydration.
- Local tree emission no longer depends on the incoming signature and marks its emitted signature as applied before notifying the parent.
- Replaced the old false-positive source test with a one-way synchronization regression contract.
- `pnpm --filter @fluxiq/web test -- src/features/automation-studio/hierarchy/ProjectTree.test.tsx` passed: 23 tests.
Progress checkpoint after items 3-4:
- Main panes now render stable slots for every open tab instead of rendering only `pane.activeViewId`.
- A view mounts only after it becomes active; after that, it remains mounted and is hidden rather than destroyed when another tab is selected.
- Hidden mounted renderers receive their inactive transition and then use a memo comparator to ignore unrelated parent render churn until reactivated.
- Mounted view keys include the project and pane, preventing component state from leaking across projects or panes.
- `openView` continues to activate a pane already containing the requested view id and does not append a duplicate tab id.
- Sidebar selection dispatch now preserves the current selection object when the clicked object has the same identity, avoiding an extra full-Studio render on repeat clicks.
- Focused lifecycle tests passed: 71 tests across `ProjectTree`, `AutomationStudioLive`, `Renderer`, and workspace components.
- `pnpm --filter @fluxiq/web check` passed.
Validation:
- Focused sidebar/view lifecycle tests passed: 71/71.
- Complete `@fluxiq/web` suite passed: 67 files, 416 tests.
- `pnpm --filter @fluxiq/web check` passed.
- `pnpm --filter @fluxiq/web build` completed with exit code 0.
- `pnpm docs:check` passed.
- `git diff --check` passed with line-ending warnings only.
- Literal PowerShell newline artifact scan passed for every touched file.
## Step 44 - Decouple All Workspace Navigation From View And Data Work

Status: Complete.

Scope: This is a Studio-wide correction, not a sidebar-only patch. It covers hierarchy selection, pane tabs, breadcrumbs and programmatic view opening, right utility tabs, Flow/Subflow object navigation, and every view body activated through those paths.

Confirmed root causes:
- `AutomationStudioLive` owns workspace chrome, active selection, tab state, mounted view bodies, and request-driven data in one large client component. A synchronous navigation update therefore makes the browser reconcile the entire Studio inside the click task.
- `openView`, `setPaneTab`, `activatePane`, right-sidebar selection, and hierarchy selection currently commit parent state synchronously.
- Main-pane tabs derive their selected appearance only from the parent state, so feedback waits for the expensive parent render.
- An uncached view's sleeping slot is blank, which makes deferred activation look broken instead of explicitly loading.
- Cache hits can still issue unconditional parent state updates, turning retrieval into avoidable full-workspace renders.
- Some selection commands start detail requests directly from the event path instead of allowing navigation chrome to paint first.

Implementation sequence:
1. Introduce one shared React transition boundary for all workspace view/selection navigation commits.
2. Keep tab and hierarchy selection feedback local and immediate while the parent content transition is pending.
3. Route pane activation, pane tabs, view opening, right utility tabs, breadcrumbs, and hierarchy navigation through the transition boundary.
4. Move request kickoff out of click handlers and into active-selection/view effects or deferred preload tasks.
5. Make cached view activation reuse mounted content and suppress no-op cache-to-state commits.
6. Replace blank sleeping slots with a stable, accessible loading surface for first activation.
7. Memoize the project tree boundary and pass stable callbacks so unrelated data/view updates do not rerender the tree.
8. Add tests that enforce the async navigation contract across all Studio entry points.
9. Update authored Automation Studio architecture documentation with the chrome/content/data ownership model.
10. Run focused tests, the complete web suite, typecheck, production build, docs validation, and artifact checks.

Acceptance criteria:
- A click paints selected tab/tree chrome without waiting for view data.
- Opening an already-mounted view does not recreate it or reload its data.
- Opening a cold view presents a loading surface immediately and hydrates asynchronously.
- Data requests and cache hydration cannot block or run inside a navigation click handler.
- All navigation paths share the same behavior; none depend on URL routing or loaded records to render selected chrome.
Progress checkpoint after items 1-3:
- Added a shared `scheduleWorkspaceNavigation` boundary backed by React `startTransition`.
- Routed project-tree selection, main view opening, pane-tab activation, pane activation, and right utility-tab activation through that boundary.
- Added optimistic local active-tab state so tab highlighting and keyboard/tab-picker navigation paint before the parent workspace transition finishes.
- Memoized `AutomationProjectTree` and replaced inline hierarchy callbacks with stable event wrappers.
- The tree now rerenders only for actual hierarchy/search/selection inputs, not because a view body or request-driven state changed elsewhere in the Studio.
Progress checkpoint after items 4-5:
- Removed direct Flow, recording, and node-definition request kickoff from `setSelectionAndFollow` and related timeline navigation handlers.
- Active selection/view effects now own detail loading after the navigation transition commits.
- State-detail navigation schedules its visible pending state first and yields one animation frame before starting the detail request.
- Flow, recording, and node-definition cache hydration now commits through the deferred workspace boundary.
- Added cache-first recording detail retrieval.
- Made Flow and recording merges return the existing state object for repeated identical cache entries, preventing avoidable full-Studio renders.
- Removed the redundant subflow detail reload after selecting a resolved graph Flow.
Progress checkpoint after item 6:
- Replaced the blank sleeping view with an accessible `role=status` loading surface that preserves the full view body's dimensions.
- Added a compact loading indicator with reduced-motion handling.
- Cold views now communicate activation immediately; previously mounted cached views continue to reactivate without the loading state or remounting.
Progress checkpoint after items 7-8:
- ProjectTree isolation is covered by a memoization regression contract.
- Added all-navigation tests for `openView`, pane tabs, pane activation, right utility tabs, hierarchy selection, and request-free selection handlers.
- Added tests for local optimistic tab feedback and the accessible cold-view loading state.
- Updated the old subflow test so it now requires detail loading to be owned by active-view effects rather than the click path.
- Focused regression suite passed: 74 tests across `AutomationStudioLive`, workspace components, `ProjectTree`, and `Renderer`.
- `pnpm --filter @fluxiq/web check` passed after the implementation edits.
Final implementation checkpoint before validation:
- Removed breadcrumb navigation's pre-render `loadFlowDetails` wait; breadcrumb selection/view activation now commits immediately and effect-owned hydration follows.
- Routed Inspector opening, pane close, pane drag/drop, keyboard tab movement, and right-tab close through the shared transition boundary.
- Routed Flow and subflow creation completion through the same deferred commit and removed redundant graph detail kickoff.
- Deferred final State View selection/data application instead of synchronously reconciling the Studio after the request resolves.
- Re-ran focused tests after closing these non-sidebar bypasses: 74/74 passed.
- Re-ran `pnpm --filter @fluxiq/web check`: passed.

Validation - Step 44:
- Focused async-navigation suite passed: 74/74 tests.
- Complete `@fluxiq/web` suite passed: 67 files, 419 tests.
- `pnpm --filter @fluxiq/web check` passed.
- `pnpm --filter @fluxiq/web build` passed with successful Next production compilation.
- `pnpm docs:check` passed; 47 authored/reference Markdown files validated and generated reference output is current.
- `git diff --check` passed with line-ending warnings only.
- Literal PowerShell newline artifact and final-newline scan passed for all touched implementation and documentation files.

Result:
- Sidebar, pane-tab, breadcrumb, programmatic view, right-utility, Inspector, tab-close/move, Flow-create, and subflow-create navigation now share the deferred workspace boundary.
- Tree rows and tabs own immediate selected feedback.
- Flow, recording, node-definition, and state hydration no longer gate ordinary navigation paint.
- Cold views show a stable loading state; mounted views retain component identity and cached local state.
- Repeated cache hits can preserve existing state identity and avoid full-Studio reconciliation.

## Step 45 - Remove Whole-Studio Tab Reconciliation

Status: Complete.

Browser confirmation after Step 44:
- The existing Chrome Automation Studio window remains unusably slow on tab changes despite request-free navigation.
- Idle renderer CPU is quiet, so this is interaction-triggered render work rather than a continuous background loop.

Confirmed remaining root cause:
- Active pane/tab state still lives in `AutomationStudioLive`; changing it reruns the entire monolithic Studio component.
- The active-body readiness gate adds two animation frames and a second complete Studio render to every activation.
- Both outgoing and incoming cached renderers receive `viewActive` changes. The Flow canvas therefore rerenders React Flow even when its graph data is unchanged.
- Main tab markup already contains sleeping slots, but optimistic tab selection does not switch those slots until the parent render finishes.
- Right utility tabs still render only the active view, so switching them destroys and recreates their view state.
- Several `useRef(new/factory())` hooks evaluate and discard cache/request/graph stores on every render.

Implementation:
1. Replace the starvation-prone transition helper with a paint-first, coalesced navigation queue; nested navigation commits flush in one batch.
2. Switch already-present view slots directly with local tab state before notifying the parent.
3. Remove the active-body two-frame gate and its extra whole-Studio render.
4. Preserve right utility views in stable mounted slots, matching main-pane behavior.
5. Stop activity-only changes from rerendering heavyweight cached views; give the Flow canvas a mutable activity signal for event guards.
6. Lazily initialize cache, request, history, viewport, and shared UI ref stores instead of constructing discarded instances every render.
7. Add regression and performance-contract tests, then run the complete validation matrix.
Progress checkpoint after items 1-6 and warm-view activation:
- Replaced the Step 44 React transition with a paint-first coalesced queue for structural navigation.
- Removed the two-animation-frame active-body readiness gate and its second whole-Studio render.
- Main and right utility views now retain stable mounted slots and mutable activity guards.
- Activity-only changes no longer rerender heavyweight cached view renderers or React Flow.
- Cache, request, graph history, graph viewport, and shared UI stores now initialize lazily instead of allocating discarded instances on every render.
- Added a pane-local mounted-view activation channel. A warm tab click updates tab chrome, body visibility, active-pane styling, and activity guards without calling React state in `AutomationStudioLive`.
- Warm main and right-sidebar activations persist their exact active-view preferences directly through the UI cache lane. Structural operations and first-time mounts still use React state.
- `pnpm --filter @fluxiq/web check` passed after the no-parent-render warm-view change.
Progress checkpoint after graph and renderer ownership correction:
- Added a local graph-selection channel owned by graph views and the Inspector. Node clicks, marquee selection, node creation, paste, graph modes, and graph validation no longer publish through `AutomationStudioLive.setSelection`.
- Inspector node parameter and description edits update the local Inspector selection and graph draft directly, preserving the editing workflow without a whole-Studio render.
- Wrapped all data-view callbacks in stable event delegates and made the renderer comparator check callback identity. Hidden cached views can remain frozen without retaining stale closures.
- Focused navigation, graph, Inspector, and renderer regressions passed: 66/66.
- `pnpm --filter @fluxiq/web check` passed.
Final validation - Step 45:
- Focused navigation, graph, Inspector, renderer, and client activity suite passed: 67/67.
- Complete `@fluxiq/web` suite passed: 67 files, 422 tests.
- `pnpm check` passed across web, contracts, client gateway, and FluxIQ packages.
- `pnpm --filter @fluxiq/web build` passed with successful Next production compilation.
- `pnpm docs:check` passed; 47 authored/reference Markdown files validated and generated reference output is current.
- `git diff --check` passed with line-ending warnings only.
- Literal PowerShell newline artifact scan passed for all touched implementation and documentation files.

Result:
- Clicking an already-mounted main-pane or right-utility tab no longer schedules a React update in the monolithic Studio root.
- Sidebar navigation to an already-mounted view uses the same local activation path instead of creating or reconciling another view instance.
- Cold views still mount through the structural queue and show an explicit loading surface; warm views preserve their DOM and component state.
- React Flow does not rerender merely because its tab becomes active or inactive.
- Graph selection and Inspector editing remain functional without publishing ordinary canvas interactions into global workspace selection.
- Connected Clients refresh behavior follows the mutable view-activity channel and remains inactive while hidden.

## Step 46 - Remove Sidebar Interaction Mirroring

Status: Complete.

Confirmed root cause after user retest:
- Step 45 removed the warm tab update, but a hierarchy click still changed `ProjectTree.primaryTreeNodeId`.
- The tree's UI-state effect forwarded that local highlight/focus/folder state to `AutomationStudioLive.setProjectTreeUiState`.
- That mirror update rerendered the entire Studio independently of view data, so every sidebar interaction could still stall.
- Same-Flow child views also called the global selection callback even when their owner selection was unchanged.

Implementation checkpoint:
- Tree UI state now remains owned by `ProjectTree`; the parent callback stores the latest value in a ref and schedules a direct sidebar-cache write.
- Cache hydration still initializes the tree through the one-way `uiState` prop.
- Folder expansion, selected-row changes, and tree focus no longer call a parent React setter.
- Same-owner Flow view navigation checks selection equality in `ProjectTree` and skips global selection dispatch entirely.
- Structural/cold view activation and genuinely different object selection remain explicit parent operations.

Render-ownership checkpoint:
- The deeper audit confirmed that cold sidebar view activation still called the layout controller's root `setWorkspacePrefs`, so `AutomationStudioLive` remained both the data owner and workspace renderer.
- Added a dedicated synchronous workspace render store with a `useSyncExternalStore` boundary around the active project shell.
- Workspace preference commits now publish directly to that boundary and schedule the exact UI-cache write from the same commit; they do not use the Studio root setter.
- `openView` no longer enters the paint-first timer queue. A sidebar view change commits immediately, mounts its loading/body surface from the workspace boundary, and leaves project-data hydration independent.
- The render store preserves one stable preference object for existing view helpers while publishing revision snapshots only to the workspace boundary.
- Focused type validation passed after the ownership extraction; behavior and full-suite validation are the next checkpoint.

Data/UI boundary checkpoint:
- Memoized the workspace boundary and gave it a stable renderer delegate, so a project-data owner render cannot implicitly reconcile the workspace shell.
- Added explicit passive data invalidation: once a project-data commit finishes, the workspace boundary may present the latest data independently of the already-painted active view.
- Workspace-store revisions are immutable external-store snapshots while the preference object keeps stable identity for existing workspace helpers.
- Added focused render-store behavior coverage and source contracts prohibiting `openView` from using the timer queue or root workspace setter.
- Focused boundary/sidebar suite passed: 70/70 tests.
- Complete web suite passed before the final memoized-boundary refinement: 68 files, 426 tests. The focused suite and web type check passed again after the refinement.
- Updated authored Automation Studio architecture docs with the external-store, memoized-boundary, and explicit data-invalidation contract.
Final validation - Step 46:
- Focused workspace render-store, sidebar, and Studio ownership suite passed: 70/70 tests.
- Complete `@fluxiq/web` suite passed after the final boundary implementation: 68 files, 426 tests.
- `pnpm --filter @fluxiq/web check` passed after the final hydration API naming cleanup.
- Repository package checks passed sequentially across web, contracts, client gateway, and FluxIQ. The first concurrent `pnpm check` attempt ended with Windows process exit `3221225477` and no diagnostic; `pnpm -r --workspace-concurrency=1 check` passed every package.
- `pnpm --filter @fluxiq/web build` passed with successful Next production compilation and static generation.
- `pnpm docs:check` passed; 47 authored/reference Markdown files validated and generated reference output is current.
- `git diff --check` passed with line-ending warnings only; new render-store files have final newlines and no literal PowerShell newline artifact was introduced.

Result:
- Sidebar and tab view activation no longer waits for project data, a timer queue, or a render of `AutomationStudioLive`.
- Workspace navigation/layout state is owned by a dedicated external store and rendered by a memoized subscriber boundary.
- The project-data owner cannot implicitly rerender the workspace shell. It publishes newly committed data through an explicit passive invalidation after the selected UI has had an opportunity to paint.
- Exact workspace cache persistence is scheduled by the UI-store commit itself.
- Same-owner Flow child views skip redundant global selection updates; hierarchy focus, highlight, and expansion remain local to `ProjectTree` and persist through the sidebar cache lane.
## Step 47 - Isolate Outer UI Actions

Status: Complete.

User retest finding:
- Lag is not limited to left-sidebar view activation. Actions outside inner view bodies share the same stall, while inner-view-local controls are materially better.

Confirmed root cause:
- The Step 46 boundary used an unscoped passive `workspaceRenderStore.invalidate()` after every `AutomationStudioLive` commit.
- Every outer control still updated state in the monolithic parent. One click therefore executed the parent data render and then forced a second full shell reconciliation containing the hierarchy, toolbar, mounted pane slots, right utility, timeline dock, and overlays.
- Inner-view-local actions avoided that parent commit, explaining the behavioral split observed by the user.

Implementation checkpoint 1:
- Removed the unscoped post-render invalidation entirely.
- Added explicit shallow render-input gating to the external-store boundary. A parent commit can rerender a boundary only when one of that boundary's declared inputs changed.
- Extracted hierarchy/project modals, workspace preferences, window adder, layout picker, and development data inspector from the workspace shell into a separate lightweight overlay boundary.
- Overlay open/close and form-field changes no longer reconcile the sidebar, toolbar, mounted view stack, React Flow canvas, right utility, or timeline dock.
- Workspace preference store commits still publish directly to both subscribed boundaries where needed.
- Focused shell/overlay/sidebar/store suite passes: 77/77 tests. Web type checking passes.

Remaining audit in this step:
- Memoize parent selection/index derivations that still scan project collections during unrelated parent state changes.
- Isolate sidebar search/filter and live resize updates so they cannot reconcile unrelated workspace regions.
- Run the complete validation matrix and update authored ownership documentation to replace the obsolete unscoped data-invalidation description.

Implementation checkpoint 2:
- Extracted the complete hierarchy sidebar into a memoized component that owns search text and object-type filtering locally.
- Search/filter changes update only the sidebar and `ProjectTree`; they write the exact sidebar cache state directly without calling `setProjectSearch`, `setProjectTypeFilter`, or any Studio-root setter.
- Converted sidebar, Inspector, bottom timeline, and main-pane split pointer movement to direct transient DOM geometry. Pointer movement no longer enters React state; only pointer-up commits final normalized dimensions to the workspace store/cache.
- Removed obsolete live-resize controller reads from the Studio render path.
- Memoized Flow, proposal, task, recording, timeline, and hierarchy-folder collection scans so unrelated overlay/UI commits reuse the existing derived selection model.
- Added regression contracts for overlay isolation, sidebar-local filtering, and state-free pointer movement.
- Focused type and ownership suite passes: 79/79 tests.
Final validation - Step 47:
- Focused shell, overlay, sidebar, resize, and render-store ownership suite passed: 79/79 tests before the final shallow-gate unit was added.
- Complete `@fluxiq/web` suite passed with the final implementation: 68 files, 430 tests.
- Repository package checks passed sequentially across web, contracts, client gateway, and FluxIQ.
- `pnpm docs:check` passed; 47 authored/reference Markdown files validated and generated reference output is current.
- `git diff --check` passed with line-ending warnings only.
- Next production compilation and type validation succeeded. Page-data collection then encountered an external `.next` output lock (`EPERM` on `.next/trace`) and missing generated page modules; a retry stalled on the same shared output directory and was terminated. No code compilation diagnostic was produced.

Result:
- The unscoped after-every-render workspace invalidation has been removed.
- Outer modals and palettes no longer reconcile the hierarchy, mounted views, canvas, utilities, or timeline.
- Parent commits only reach the workspace shell when a declared shallow data input changes.
- Hierarchy search/filter interactions remain entirely inside the memoized sidebar and write cache state directly.
- Resize pointer movement performs no React updates and commits only final geometry.
- Unrelated outer UI state changes reuse memoized Flow/task/proposal/recording/timeline and hierarchy option derivations instead of rescanning project collections.
## Step 48 - Remove UI State from the Studio Data Owner

Status: In Progress.

User retest correction:
- Step 47 did not remove the observed interaction stall. Its overlay boundary reduced descendant reconciliation, but outer controls still called React state setters owned by the monolithic `AutomationStudioLive` component.
- Every open, close, toggle, and hierarchy form keystroke therefore still executed the complete Studio data-controller function before the isolated boundary could help.
- The relevant behavioral distinction is ownership: inner-view-local interactions remain responsive because they do not schedule an `AutomationStudioLive` render; outer interactions remain slow because they do.

Implementation plan:
1. Add a dedicated external Studio UI store for modal, palette, narrow-panel, and hierarchy-editor state.
2. Move common outer actions and their render subscription out of `AutomationStudioLive` React state.
3. Move hierarchy create/delete form state and progress updates to the Studio UI store, including confirmation handlers reading a current store snapshot rather than stale root-render closures.
4. Remove obsolete root UI state and root render inputs; add source and behavior regressions that prohibit reintroducing root-owned outer UI setters.
5. Run focused tests, the complete web suite, repository checks, documentation checks, and production compilation when the shared output directory is available.
Implementation checkpoint 1 - external Studio UI ownership:
- Added a dedicated AutomationStudioUiStore and a useSyncExternalStore boundary that subscribes only the overlay surface.
- Preferences, the window-adder palette, layout picker, development data inspector, and hierarchy create/delete form fields no longer call React state setters owned by AutomationStudioLive.
- Hierarchy action initialization now publishes one atomic studio-ui-store patch instead of a sequence of root React updates.
- Hierarchy confirmation reads one current studio-ui-store snapshot at invocation; asynchronous mutation helpers receive the captured authorization PIN explicitly rather than retaining a stale render closure.
- Window-adder availability is calculated from current action inputs instead of root-owned palette state.
- pnpm --filter @fluxiq/web check passes after the ownership migration.
