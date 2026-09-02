# Automation Studio Scalable Data Architecture Plan

Status: implementation complete through Phase 12 certification harness; full external certification evidence still required before release flag removal  
Created: 2026-08-27  
Owner: FluxIQ framework / Automation Studio

## Purpose

Automation Studio must remain responsive with thousands of Flows and subflows,
tens of thousands of nodes, millions of runtime and recording events, and years
of revisions. The current summary/detail improvements help project open, but the
underlying model still treats growable resources as whole JSON documents or
whole-file arrays. That model cannot meet the required scale.

This document is the implementation source of truth for:

- the current end-to-end data flow and its scalability defects;
- canonical ownership between SQLite, files, and content-addressed objects;
- the proposed tables, indexes, file layout, and transaction protocol;
- graph partitioning, revisions, patches, compilation, and browser state;
- runtime, recording, state, adaptation, and LLM evidence storage;
- API pagination, caching, invalidation, migration, testing, and rollout.

This plan supersedes the scalability assumptions in
`automation-studio-data-flow-refactor-plan.md` and
`automation-studio-load-performance-plan.md`. Those documents remain useful
history: they established project-owned files and summary-first reads. This plan
addresses the deeper model required for very large projects.

## Executive Decision

Use a hybrid architecture with explicit ownership:

1. A small global SQLite catalog owns project discovery and categories.
2. One SQLite database per project owns mutable metadata, graph entities,
   hierarchy, revisions, summaries, references, and query indexes.
3. Immutable content-addressed files own large state bodies, screenshots,
   closed event chunks, compiled plans, graph snapshots, LLM evidence, and exports.
4. Append-heavy streams use bounded chunks with SQL manifests. No UI request
   reads or rewrites an unbounded JSONL file.
5. A graph is stored as addressable nodes and edges. Edits are revision-checked
   operation batches, not full-document replacements.
6. The browser loads catalog pages and graph viewport partitions. It never uses
   a project-wide snapshot as its state store.
7. Runtime executes an immutable compiled Flow revision and does not traverse
   mutable editor tables or hydrate an entire project.

SQLite is the mutable control plane. Files are the immutable data plane. A
mutable record has exactly one canonical owner.

## Scale Envelope And Budgets

| Dimension | Required design target |
| --- | ---: |
| Projects in global catalog | 10,000 |
| Top-level Flows in one project | 10,000 |
| Subflows in one project | 100,000 |
| Nodes in one project | 1,000,000 |
| Nodes in one graph | 100,000 |
| Edges in one graph | 250,000 |
| Instructions in one project | 100,000 |
| Runtime runs in one project | 10,000,000 |
| Events/action attempts in one run | 1,000,000 |
| Recording events in one recording | 10,000,000 |
| Immutable assets in one project | 10,000,000 |

Performance budgets on the reference development machine:

| Operation | Budget |
| --- | ---: |
| Project catalog first page | p95 under 100 ms server, under 250 ms visible |
| Project workspace bootstrap | p95 under 150 ms server, under 500 ms usable |
| Expand one hierarchy folder | p95 under 100 ms server |
| Open a 100k-node graph | first useful viewport under 750 ms |
| Pan to an uncached graph partition | p95 under 150 ms server, under 250 ms painted |
| Apply a 100-operation graph patch | p95 under 100 ms excluding compilation |
| Search nodes by label/type | p95 under 150 ms |
| List any growable resource | p95 under 100 ms for 50 rows |
| Open first runtime event page | p95 under 150 ms |
| Append 100 bounded runtime events | p95 under 50 ms |
| Idle Automation Studio CPU | below 1% average |
| Idle network activity | zero application polling |

Payload budgets:

- workspace bootstrap: at most 250 KiB uncompressed;
- hierarchy page: at most 100 KiB;
- graph viewport page: at most 1 MiB with server-enforced entity limits;
- list page: at most 250 KiB;
- event page: at most 1 MiB;
- mutation response: changed entities and revision metadata only.

## Audit Scope

The audit traced canonical repositories, project JSON files, object storage,
Flow/subflow/Router/instruction/adaptation services, recordings, run logs, API
handlers, project-open requests, graph rendering and drafts, browser refresh
effects, client-gateway polling, and the existing persistence plans.

Primary audited sources:

- `packages/fluxiq/src/programs/automation-studio/runtime/service.ts`
- `packages/fluxiq/src/programs/automation-studio/storage/*.ts`
- `packages/fluxiq/src/programs/database-manager/storage/sqlite-repository.ts`
- `packages/fluxiq/src/programs/automation-studio/model/flows.ts`
- `packages/fluxiq/src/programs/automation-studio/api/*.ts`
- `apps/web/src/features/automation-studio/AutomationStudioLive.tsx`
- `apps/web/src/features/automation-studio/controllers/*.ts`
- `apps/web/src/features/automation-studio/graph/*.ts`
- `apps/web/src/features/automation-studio/views/*.tsx`

## Current Data Flow

### Project Open

The initial open is now deliberately narrow:

1. `openProject()` requests only `get-project-hierarchy`.
2. The active-project effect calls `refreshProjectRuntimeState()`.
3. That refresh requests workspace summaries, recording summaries, the first
   runtime summary page, and recording domains.
4. Summaries are copied into several top-level React state arrays.
5. Selecting a Flow requests one full Flow through `get-flow`.

This is a meaningful improvement over the former full snapshot bootstrap. It
does not make graph editing or persistence scalable.

### Flow Read And Write

`AutomationStudioFlowArtifact` embeds interfaces, variables, regions, every
node, every edge, publication history, evidence, and settings in one document.

On read, the project index and `flow.json` are loaded, the repository returns a
structured clone of the complete document, and the browser converts every node
and edge into React Flow objects.

On save, the browser sends the complete Flow, the service loads the previous
complete Flow, validates the complete graph, serializes it into a generic SQLite
JSON cell, rewrites `flow.json`, rewrites generated source/config, and updates
the project summary index. One node move therefore has O(nodes + edges) cost.

### Graph Browser State

The editor owns complete `nodes[]` and `edges[]` arrays. Undo/redo retains up
to 50 graph snapshots. Immutable React updates cause snapshots to retain many
generations of graph objects. Drafts synchronously stringify into
`localStorage`; dirty/source signatures iterate and stringify graph entities;
selection and graph state sit under a very large workspace component.

### Summaries And Detail

The same logical data can have multiple representations:

- JSON indexes such as `flows.json`, `subflows.json`, `instructions.json`,
  `runs.json`, and `adaptations.json`;
- generic per-project SQLite JSON-row summary repositories;
- detail JSON documents under Flow, recording, and runtime directories;
- canonical generic repositories used as an in-process cache/fallback.

`ensure*SummaryIndex()` paths may compare JSON to SQLite and backfill during a
read. An ordinary list can therefore become a migration/repair operation.

### Runtime, Recording, Objects, And Background Work

Run and recording details are partly JSONL. Paging is better than eager
hydration, but flat line files have no chunk/sequence index, deep offsets scan
from the beginning, and some helpers replace a whole JSONL file from an array.

Assets are content-addressed, which is the correct primitive, but ownership is
one `objects.json` array. Every lookup parses it, every upsert rewrites it, and
pruning scans it.

Automation Studio also posts project context every three seconds and fetches a
gateway snapshot every 1.5 seconds. Even unchanged responses are fetched,
parsed, allocated, reduced, and stringified while the UI is idle.

## Audit Findings

### Critical: Monolithic Graph Documents

The whole graph is the unit of persistence, validation, transfer, cache,
history, and conflict detection. This guarantees O(N + E) work for small edits
and prevents viewport loading.

Correction: independently addressable node/edge rows, small Flow metadata,
revision operations, and immutable compiled/snapshot artifacts.

### Critical: Full-Graph Browser Ownership

React state, conversion, scans, signatures, validation, drafts, and undo history
operate on complete arrays. A 100k-node graph cannot be copied, stringified,
validated, or retained dozens of times on the UI thread.

Correction: normalized entities, viewport partitions, operation history,
incremental validation, IndexedDB drafts, and workers.

### Critical: Mutable Truth Is Duplicated

Flow and summary state can exist in generic SQLite rows, project JSON documents,
JSON indexes, and memory repositories. A crash between writes can leave copies
disagreeing.

Correction: one canonical mutable SQL transaction. Files contain only immutable
payloads; summaries are SQL projections, not separate mutable files.

### High: Generic JSON-Row SQL Is Not A Domain Schema

The shared repository has `id`, `kind`, `data`, and timestamps. Filters use
`json_extract`; canonical wrappers can `list()` everything and filter in
memory. Only timestamps are indexed; search uses LIKE over IDs/full JSON.

Correction: typed columns, foreign keys, covering indexes, FTS, and scoped SQL.

### High: Offset Pagination Is Not Massive-Scale Pagination

`LIMIT/OFFSET` and flat-file offsets walk skipped rows. Deep pages are not
bounded work.

Correction: stable keyset cursors using indexed sort values plus stable ID.

### High: Whole JSON Index Rewrites

Flow, subflow, instruction, adaptation, run, pipeline, and object summaries are
arrays. One upsert is O(total rows) parse plus rewrite.

Correction: remove active JSON indexes. SQL provides summaries; export manifests
are immutable snapshots only.

### High: Read Paths Perform Repair

Summary reads can hydrate details and write missing rows.

Correction: explicit idempotent migration jobs with progress. User reads never
repair or backfill.

### High: Streams Lack Random-Access Structure

Flat JSONL cannot provide bounded deep reads, retention, or isolated corruption.

Correction: immutable sequence chunks, SQL manifests, checksums, bounded bytes
and event counts, and cursor reads.

### High: Service And UI Ownership Are Over-Centralized

The runtime service is about 472 KiB of source and owns unrelated storage,
migration, Flow, recording, runtime, pipeline, and object behavior. The main UI
component is about 206 KiB and broad state changes have a wide render radius.

Correction: resource services/repositories and view-owned query stores.

### Medium: Polling, Broad Invalidation, And Timestamp Conflicts

Permanent polling creates work while idle. Project-wide cache invalidation and
post-mutation summary refreshes touch unrelated resources. Full Flow conflicts
use millisecond timestamps and conflict across the entire graph.

Correction: push deltas, entity/query invalidation, integer revisions,
idempotency keys, and entity-level conflict payloads.

## Target Ownership Model

| Data | Canonical owner | Derived/cache form |
| --- | --- | --- |
| Project catalog/categories | global SQLite | first-page memory cache |
| Project hierarchy | project SQLite | paged browser query cache |
| Flow metadata/settings/interfaces | project SQLite | entity cache |
| Mutable nodes/edges/regions | project SQLite | visible graph partitions |
| Graph revision operations | project SQLite append-only rows | bounded client history |
| Revision snapshots | content-addressed files | nearest-snapshot restore cache |
| Compiled execution plans | content-addressed files + SQL manifest | runtime cache |
| Routers/routes/groups | project SQLite | Router query cache |
| Subflows/instructions/bindings | project SQLite | paged/effective projections |
| Adaptation metadata/status | project SQLite | list/detail query cache |
| Adaptation evidence/large patches | object files + SQL refs | detail cache |
| Recording metadata | project SQLite | summary pages |
| Recording events | immutable chunks + SQL manifests | paged event cache |
| State snapshots/screenshots | object files + SQL refs | selected-state cache |
| Runtime run metadata | project SQLite | cursor pages |
| Runtime events/action attempts | immutable chunks + SQL manifests | paged log cache |
| Asset metadata/references | project SQLite | content URL cache |
| Workspace preferences | project SQLite per user | local optimistic draft |
| Exports/backups | immutable manifests | none |

No `indexes/*.json` file remains an active index. No generic repository stores
a second mutable copy of a project-owned record.

## Database Topology

### Global Catalog

`automation-studio/catalog.sqlite` contains only pre-project information:

```text
schema_migrations(version PK, applied_at_ms, checksum)
project_categories(category_id PK, parent_id FK, name, sort_key,
                   created_at_ms, updated_at_ms)
projects(project_id PK, category_id FK, name, description, storage_path,
         status, schema_version, created_at_ms, updated_at_ms,
         last_opened_at_ms)
project_counts(project_id PK/FK, flow_count, run_count, recording_count,
               updated_at_ms)
```

Indexes cover category children, project category/update order, recent projects,
and FTS5 name/description search. The catalog never contains project details.

### Per-Project Administration

Each project owns `projects/<projectId>/project.sqlite`. Foreign keys and WAL
are enabled. A bounded connection manager keeps one long-lived serialized
connection per open project instead of opening, creating tables, and closing a
database for every repository operation.

```text
schema_migrations(version PK, applied_at_ms, checksum)
project_meta(project_id PK, name, description, domain_id, revision,
             created_at_ms, updated_at_ms)
change_feed(sequence INTEGER PK AUTOINCREMENT, transaction_id, entity_kind,
            entity_id, operation, revision, changed_at_ms)
storage_outbox(outbox_id PK, operation, staged_path, final_path, sha256,
               status, attempt_count, created_at_ms, updated_at_ms)
migration_jobs(job_id PK, kind, cursor_json, status, error_json,
               started_at_ms, updated_at_ms, completed_at_ms)
background_jobs(job_id PK, kind, owner_kind, owner_id, status, priority,
                input_object_id FK, output_object_id FK, attempts,
                available_at_ms, started_at_ms, finished_at_ms, error_json)
```

Migrations run explicitly before normal project reads. Read handlers never run
repair or backfill.

### Hierarchy Tables

```text
hierarchy_entries(entry_id PK, parent_entry_id FK, kind, owner_id,
                  display_name, sort_key, depth, path_key,
                  is_system, is_deleted, revision, created_at_ms, updated_at_ms)
workspace_preferences(user_id, preference_key, value_json, revision,
                      updated_at_ms, PRIMARY KEY(user_id, preference_key))
```

Indexes:

- `(parent_entry_id, is_deleted, sort_key, entry_id)` for folder expansion;
- `(owner_id, kind)` for selection and deep links;
- `(path_key)` for subtree moves and verification;
- FTS5 over `display_name` for search.

`depth` and `path_key` are maintained transactionally. Ordinary expansion is
an indexed child query; recursive CTEs are reserved for subtree operations.

### Flow And Graph Tables

```text
flows(flow_id PK, parent_flow_id FK, owning_subflow_id FK, name, description,
      scope_kind, scope_id, visibility, origin, source_mode, status,
      graph_revision, settings_revision, compiled_revision,
      created_at_ms, updated_at_ms, deleted_at_ms)
flow_settings(flow_id PK/FK, execution_defaults_json, training_json,
              adaptation_json, llm_json, safety_json, revision, updated_at_ms)
flow_ports(port_id PK, flow_id FK, direction, name, value_type, required,
           default_value_json, description, sort_key, revision)
flow_variables(variable_id PK, flow_id FK, name, value_type, initial_value_json,
               description, sort_key, revision)
flow_errors(error_id PK, flow_id FK, code, description, metadata_json, revision)
graph_partitions(partition_id PK, flow_id FK, grid_x, grid_y, min_x, min_y,
                 max_x, max_y, node_count, edge_count, revision, updated_at_ms)
graph_nodes(node_id PK, flow_id FK, partition_id FK, definition_id,
            definition_version, label, description, x, y, width, height,
            z_index, disabled, parameter_values_json, metadata_json,
            revision, created_at_ms, updated_at_ms, deleted_at_ms)
graph_edges(edge_id PK, flow_id FK, source_node_id FK, target_node_id FK,
            source_port_id, target_port_id, label, metadata_json,
            revision, created_at_ms, updated_at_ms, deleted_at_ms)
flow_regions(region_id PK, flow_id FK, partition_id FK, name, kind,
             bounds_json, metadata_json, revision)
flow_region_handoffs(handoff_id PK, flow_id FK, from_region_id FK,
                     to_region_id FK, contract_json, revision)
graph_revisions(revision_id PK, flow_id FK, revision_number, parent_revision,
                author_id, source, operation_count, snapshot_object_id FK,
                digest, message, created_at_ms,
                UNIQUE(flow_id, revision_number))
graph_operations(operation_id PK, revision_id FK, ordinal, operation_kind,
                 entity_kind, entity_id, before_json, after_json,
                 UNIQUE(revision_id, ordinal))
```

Required indexes:

- nodes by `(flow_id, partition_id, deleted_at_ms, node_id)`;
- nodes by `(flow_id, definition_id, deleted_at_ms, node_id)`;
- edges by source and separately by target within a Flow;
- unique partitions by `(flow_id, grid_x, grid_y)`;
- revisions by `(flow_id, revision_number desc)`;
- operations by `(entity_kind, entity_id, revision_id)`;
- FTS5 node label/description;
- RTree node bounds keyed through an integer-key-to-`node_id` map.

JSON is acceptable for bounded entity-local parameters and metadata. It is not
acceptable for ownership, filters, joins, sort keys, coordinates, status,
revisions, or timestamps.

### Router, Subflow, And Instruction Tables

```text
subflows(subflow_id PK, parent_flow_id FK, graph_flow_id FK UNIQUE,
         parent_category_id, name, description, role, status,
         input_mapping_json, output_mapping_json, approval_override,
         revision, created_at_ms, updated_at_ms, deleted_at_ms)
subflow_categories(category_id PK, flow_id FK, parent_category_id FK,
                   name, sort_key, revision, created_at_ms, updated_at_ms)
routers(router_id PK, flow_id FK UNIQUE, fallback_kind, fallback_subflow_id FK,
        revision, created_at_ms, updated_at_ms)
router_groups(group_id PK, router_id FK, name, sort_key, revision)
router_routes(route_id PK, router_id FK, group_id FK, name, priority, enabled,
              condition_kind, condition_json, target_kind,
              target_subflow_id FK, revision, created_at_ms, updated_at_ms)
instructions(instruction_id PK, title, body_object_id FK, inline_body,
             requirement, status, priority, content_digest,
             revision, created_at_ms, updated_at_ms, deleted_at_ms)
instruction_scopes(instruction_id FK, scope_kind, project_id, flow_id FK,
                   router_id FK, subflow_id FK, node_id FK, error_code)
instruction_tags(instruction_id FK, tag, PRIMARY KEY(instruction_id, tag))
instruction_bindings(binding_id PK, owner_kind, owner_id, instruction_id FK,
                     sort_key, enabled, revision)
effective_instruction_cache(scope_digest PK, instruction_revision,
                            object_id FK, created_at_ms)
```

Indexes cover active subflows by parent/status/name, category children, routes by
router/priority, and all instruction scope selectors. Short instruction bodies
may remain inline; large bodies use object storage.

### Runtime, Recording, And State Tables

```text
runtime_runs(run_id PK, flow_id FK, flow_revision, compiled_artifact_id FK,
             status, trigger_kind, queued_at_ms, started_at_ms, finished_at_ms,
             action_count, effect_count, error_count, adaptation_count,
             last_event_sequence, input_object_id FK, output_object_id FK,
             error_object_id FK, updated_at_ms)
runtime_event_chunks(chunk_id PK, run_id FK, first_sequence, last_sequence,
                     event_count, byte_count, object_id FK, sha256, closed,
                     created_at_ms, UNIQUE(run_id, first_sequence))
recordings(recording_id PK, name, task_id, domain_id, status,
           started_at_ms, ended_at_ms, event_count, action_count,
           state_snapshot_count, thumbnail_object_id FK, updated_at_ms)
recording_event_chunks(chunk_id PK, recording_id FK, first_sequence,
                       last_sequence, event_count, byte_count, object_id FK,
                       sha256, closed, created_at_ms,
                       UNIQUE(recording_id, first_sequence))
state_snapshots(snapshot_id PK, source_kind, source_id, sequence,
                captured_at_ms, state_object_id FK, screenshot_object_id FK,
                previous_snapshot_id FK, digest, metadata_json)
state_paths(snapshot_id FK, namespace, path, value_type, scalar_text,
            scalar_number, scalar_boolean, value_object_id FK,
            PRIMARY KEY(snapshot_id, namespace, path))
```

Indexes support run keyset order `(started_at_ms desc, run_id desc)`, Flow and
status filters, event chunk sequence lookup, recording time order, snapshot
source/sequence, and optional state-path queries. Default state reads load
metadata and requested paths, not the entire snapshot body.

### Adaptation, Publication, And Object Tables

```text
adaptations(adaptation_id PK, flow_id FK, subflow_id FK, base_revision,
            proposed_revision, trigger, status, risk_level, approval_mode,
            patch_object_id FK, evidence_object_id FK, created_at_ms,
            updated_at_ms, reviewed_at_ms, applied_at_ms)
adaptation_evidence(adaptation_id FK, evidence_kind, evidence_id, sequence,
                    PRIMARY KEY(adaptation_id, evidence_kind, evidence_id))
flow_publications(publication_id PK, flow_id FK, version, flow_revision,
                  compiled_artifact_id FK, digest, status, changelog,
                  published_at_ms, deprecated_at_ms, UNIQUE(flow_id, version))
compiled_artifacts(artifact_id PK, flow_id FK, flow_revision, compiler_version,
                   object_id FK, digest, status, created_at_ms,
                   UNIQUE(flow_id, flow_revision, compiler_version))
objects(object_id PK, sha256 UNIQUE, media_type, byte_count, relative_path,
        compression, encryption, created_at_ms, verified_at_ms)
object_references(reference_id PK, object_id FK, owner_kind, owner_id, purpose,
                  created_at_ms,
                  UNIQUE(object_id, owner_kind, owner_id, purpose))
```

Object deletion is mark-and-sweep from `object_references`, performed by a
bounded background job. It never scans every repository during a user mutation.

## File And Object Layout

```text
automation-studio/
  catalog.sqlite
  projects/
    <projectId>/
      project.sqlite
      objects/
        sha256/
          ab/
            cd/
              <full-sha256>.<ext>
      staging/
        <transactionId>/
      exports/
        <exportId>/manifest.json
      backups/
        <backupId>/manifest.json
```

Object paths derive from digests, never user names. Event chunks, compiled
plans, graph snapshots, prompts, responses, evidence, screenshots, and large
state bodies use the same primitive. Closed event chunks are immutable.
Recommended initial bounds are 2,000 events or 4 MiB uncompressed, whichever
comes first. Compression can be added for closed chunks without changing APIs.

## Atomic Write Protocol

### SQL-Only Mutations

Graph patches, hierarchy edits, settings, Router edits, instruction metadata,
and status transitions use one `BEGIN IMMEDIATE` transaction:

1. validate authorization and expected revision;
2. read only touched rows and required constraints;
3. apply rows and increment aggregate revision;
4. append graph operations when graph state changed;
5. append scoped change-feed rows;
6. enqueue compile/index jobs;
7. commit and publish the committed change sequence.

### Mutations With Immutable Files

1. serialize and hash the bounded payload outside the SQL write lock;
2. write under `staging/<transactionId>`;
3. fsync when required and atomically move to the digest-derived path;
4. begin SQL and insert/upsert object metadata plus references/manifests;
5. commit and publish the change sequence;
6. clean unreferenced staged/orphan files asynchronously.

The immutable file exists before its SQL reference. A pre-commit crash creates
only a collectible orphan; SQL never points to an unfinished file.

### Live Streams

Runtime/recording writers buffer bounded batches, append to an active spool, and
seal chunks frequently. Each stream has one writer lease. Recovery scans only
from the last checkpoint, truncates to the last valid frame, seals the chunk,
and manifests it. Readers consume sealed chunks plus a bounded active tail.

## Graph Data Model

### Partitions And Viewports

The server assigns each node to a stable spatial grid partition. A viewport
query sends Flow ID, revision, bounds, zoom/detail tier, and continuation cursor.
The response contains:

- intersecting nodes up to a hard limit;
- edges whose endpoints are visible;
- boundary stubs for offscreen endpoints;
- partition revisions and aggregate counts;
- a continuation cursor when density exceeds the response limit.

At low zoom, the server returns region/partition aggregates instead of every
node. At editing zoom it returns full visible node data. Selection by ID can pin
an offscreen entity without loading the rest of its partition.

Moving a node across partitions updates one node, old/new partition counts, the
spatial index, and connected-edge invalidation keys in one transaction.

### Patch Contract

Conceptual request:

```json
{
  "baseRevision": 42,
  "mutationId": "uuid",
  "operations": [
    { "op": "move_node", "nodeId": "node.1", "x": 120, "y": 480 },
    { "op": "set_node_parameters", "nodeId": "node.2", "values": {} },
    { "op": "add_edge", "edge": {} }
  ]
}
```

The response returns the new revision, changed entities, deleted IDs,
validation deltas, affected partition revisions, and change-feed sequence. A
repeated `mutationId` returns the original committed result.

If `baseRevision` is stale, the server checks operations since that revision.
Non-overlapping edits may rebase automatically. Overlapping edits return a
structured 409 naming conflicting entity IDs and current values.

### Undo, Redo, Drafts, And Recovery

- Client history stores operation batches and inverses, not graph copies.
- History is bounded by operation count and estimated bytes.
- Unsaved operations persist asynchronously to IndexedDB.
- `localStorage` stores only tiny preferences and a draft pointer.
- Recovered operations replay against their base revision through the normal
  conflict protocol.
- Periodic immutable revision snapshots cap replay length. They are created by
  operation/byte thresholds and before publication, not on every edit.

### Validation And Compilation

Fast structural checks for touched entities run in the patch transaction.
Incremental semantic validation runs after commit against the affected
dependency neighborhood. Full validation/compilation run in background workers
against a fixed revision.

Runtime starts only from a successfully compiled immutable artifact. The compact
plan contains execution IDs and adjacency structures, not editor positions,
comments, UI metadata, or unrelated project data.

## API Read Model

All growable lists use opaque keyset cursors. A cursor encodes sort value,
stable ID, filters, and query version and is integrity-checked by the server.

Required endpoint families:

- project catalog page and project bootstrap;
- hierarchy children, ancestors, subtree operations, and search;
- Flow summary page and one Flow metadata record;
- graph viewport, entities by ID, search, revisions, and patch;
- subflow/category pages and details;
- Router summary/detail and atomic route operations;
- instruction pages, detail, and effective-set preview;
- recording page, detail metadata, and event cursor page;
- run page, run detail summary, and unified event cursor page;
- adaptation page, independently paged detail sections, patch, and evidence;
- state snapshot metadata, requested paths, image, and raw body;
- publication/dependency pages;
- project change feed from a sequence cursor.

Every response includes:

- `schemaVersion` and `requestId`;
- resource revision or change sequence;
- `nextCursor`/optional `previousCursor`;
- totals only when a maintained count or cheap query exists;
- an `ETag` for immutable or revisioned reads.

The server rejects unbounded limits, includes, bounds, and mutation batches.
Full project snapshot and full graph list endpoints are not callable by the web
UI. Compatibility endpoints are internal, deprecated, and instrumented.

## Browser Data Architecture

### Store Ownership

Replace top-level arrays with resource query stores:

- `ProjectCatalogStore`
- `HierarchyStore`
- `FlowMetadataStore`
- `GraphViewportStore`
- `RouterStore`
- `InstructionStore`
- `RecordingStore`
- `RuntimeRunStore`
- `AdaptationStore`
- `StateStore`
- `WorkspaceLayoutStore`

Each store owns normalized entities, query pages, cancellation, revision checks,
and targeted invalidation. Components subscribe only to IDs and fields they
render. Runtime Debug updates cannot rerender a graph merely because both share
a parent component.

### Graph Rendering

- Mount visible nodes plus a small overscan margin.
- Use React Flow visible-element rendering as a final DOM boundary, not as the
  data-loading strategy.
- Keep node/edge object identity stable when unrelated entities change.
- Index adjacency and selection maps once per partition update.
- Move auto-layout, large selection geometry, search indexing, conversion,
  semantic validation, and snapshot serialization to Web Workers.
- Render partition density in the MiniMap for huge graphs.
- Enforce a maximum mounted entity count and show progressive loading in dense
  viewports.

### Refresh, Subscription, And Memory

Replace intervals with a project subscription carrying
`change_feed.sequence`. Reconnect from the last sequence. If retention was
exceeded, a compact resync response names only queries to invalidate. Pause
subscriptions and workers while hidden.

Mutations update local entities from their response, then reconcile through the
feed. They do not call `refreshProjectRuntimeState()`.

Memory is explicitly bounded:

- graph partitions use an entity/byte LRU;
- run and recording views retain bounded neighboring event pages;
- raw JSON strings exist only while technical detail is expanded;
- object URLs are revoked on eviction;
- closed-view pages are released unless pinned;
- diagnostics report cache sizes, workers, and subscriptions.

## Runtime And Live Adaptation Flow

1. A run captures Flow revision, compiled artifact, settings revision,
   instruction digest, and Router revision.
2. Runtime loads the immutable plan and required instruction object, not editor
   graph rows.
3. Events receive monotonic run sequences and enter bounded chunks.
4. SQL run counters update in batches and remain list-friendly.
5. LLM intervention stores prompt/response/evidence as objects and creates an
   adaptation against the exact base revision.
6. Automatic adaptations still pass validation and compilation.
7. Applying an adaptation commits graph operations as a new revision.
8. A current run adopts a new revision only through an explicit safe-point
   record; otherwise the change applies to the next run.
9. Runtime Debug subscribes to deltas and requests events by sequence.
10. Retention can archive event chunks without touching Flow history.

This prevents an LLM change from mutating the graph underneath an executor
without a revision boundary.

## Migration Strategy

Migration is explicit, resumable, idempotent, and never hidden in a read.

### Compatibility Window

- Existing projects remain readable through a legacy adapter while incomplete.
- Persisted storage modes are `legacy`, `migrating`, `hybrid-read`, `v2`,
  and `rollback-required`.
- Only one writer model is active at a time. There is no indefinite dual-write.
- New projects use v2 after schema and minimum UI paths are release-ready.

### Per-Project Migration

1. acquire an exclusive migration lease;
2. create a verified backup manifest;
3. inventory every legacy index, document, stream, and object reference;
4. create/migrate `project.sqlite`;
5. import project, hierarchy, Flow metadata, subflows, Routers, and settings;
6. split each Flow into nodes, edges, regions, interfaces, and revision 1;
7. import instructions and bindings;
8. import recordings and chunk timelines;
9. import runs and chunk events;
10. import adaptations, publications, compatibility pipeline data, and evidence;
11. import object metadata/references without duplicating payload bytes;
12. build spatial, FTS, and relational indexes;
13. compile current executable revisions;
14. compare counts, IDs, digests, references, and sampled semantic reads;
15. enter `hybrid-read` for comparison diagnostics;
16. switch atomically to `v2`;
17. retain the backup until explicit cleanup policy permits retirement.

Progress is committed in `migration_jobs.cursor_json` after bounded batches.
Restart resumes at the last batch. Failure leaves legacy ownership intact and
surfaces an actionable report.

## Implementation Phases

Every numbered step is independently tracked in the Implementation Ledger.
After a step, update this document with status, date, change reference,
validation, and next step before beginning further work.

### Phase 0: Baseline And Regression Harness

0.1 Add endpoint timing, response bytes, rows scanned/returned, SQL duration,
and browser render/long-task metrics.  
0.2 Add a development inspector for requests, subscriptions, query-cache bytes,
graph entities mounted/cached, and worker queues.  
0.3 Create deterministic scale fixture generators for every scale dimension.  
0.4 Record project-open, graph-open, node-move, save, run-list, and event-page
baselines at 1k, 10k, and 100k nodes.  
0.5 Add tests banning full snapshot/full graph endpoints from ordinary UI.  
0.6 Add browser long-task and heap-retention scenarios for repeated project and
view switching.  
0.7 Publish the baseline report in this document.

Exit gate: regressions are measurable before storage changes.

#### Step 0.4 Legacy Whole-Document Baseline

Captured on 2026-08-27 with Node.js v22.11.0 on Windows x64 using
`pnpm studio:baseline`. Times are data-path CPU time before network, React,
layout, paint, filesystem flush, or SQLite work, so they are a lower bound on
the user-visible stall.

| Nodes | Edges | Graph bytes | Project open | Graph open | One-node move | Full save | 50-run page | 50-event page |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 2,500 | 680,810 | 1.97 ms | 2.25 ms | 0.08 ms | 1.79 ms | 0.05 ms | 0.74 ms |
| 10,000 | 25,000 | 6,842,299 | 21.01 ms | 19.09 ms | 0.28 ms | 13.51 ms | 0.28 ms | 6.86 ms |
| 100,000 | 250,000 | 68,731,187 | 216.33 ms | 213.02 ms | 6.77 ms | 137.36 ms | 5.85 ms | 73.37 ms |

The node-move measurement maps the complete node array but excludes the much
larger React reconciliation, React Flow derivation, layout, and paint cost. The
run and event measurements return only 50 rows but intentionally reproduce the
legacy full-array scan/sort or parse/sort first. The benchmark implementation
is public and seed-stable so later phases can compare the same workload.

#### Phase 0 Published Baseline Report

The baseline establishes the following before-state:

1. **Graph transfer is already outside the target architecture.** The 100k-node
   graph is 68,731,187 bytes, about 67 times the 1 MiB graph viewport budget and
   about 268 times the complete workspace-bootstrap budget. A useful viewport
   needs only a bounded spatial partition, not all 350,000 node/edge entities.
2. **Hydration alone consumes multiple long-task budgets.** Parsing the target
   graph takes 213.02 ms and parsing the equivalent project document takes
   216.33 ms. These exclude fetch, server serialization, React conversion and
   reconciliation, React Flow indexing, layout, and paint.
3. **Small edits have graph-sized work.** Moving one node maps 100,000 node
   references. The measured 6.77 ms excludes history snapshots, signatures,
   validation, React work, and draft persistence, which the audit identifies as
   additional whole-graph consumers.
4. **Persistence is proportional to graph size.** JSON serialization alone is
   137.36 ms for one save before file I/O, validation, conflict checks, index
   replacement, or response serialization. This cannot satisfy the 100 ms
   100-operation patch budget.
5. **Paged responses can hide unbounded work.** The 50-event response is only
   10,678 bytes, but selecting it from 100,000 events costs 73.37 ms because the
   full stream is parsed and sorted. The required envelope is one million
   runtime events and ten million recording events.
6. **Leak and long-task regression coverage now exists.** The Playwright
   scenario records repeated project/view transitions, accumulated long tasks,
   and post-GC heap retention. Browser measurements must be captured against a
   manually running fixture host; pending environment evidence is not replaced
   with estimates.

Phase 0 exit decision: **pass for instrumentation and reproducibility, fail for
the legacy architecture.** Storage implementation may begin because endpoint,
SQL, browser, cache, graph, request-policy, deterministic fixture, CPU baseline,
and browser retention harnesses are available. This report is the comparison
baseline for Phases 1 through 12; no legacy timing is a target waiver.

### Phase 1: Storage Kernel And Schema

1.1 Add a dedicated Automation Studio database module with one long-lived
serialized connection per open project.  
1.2 Add migration runner, checksums, schema lock, backup hook, and failure state.  
1.3 Create the global catalog schema and typed repositories.  
1.4 Create project administration, feed, outbox, and job tables.  
1.5 Create hierarchy, Flow, graph, Router, subflow, instruction, runtime,
recording, state, adaptation, publication, and object tables.  
1.6 Add all foreign keys, unique constraints, covering indexes, FTS, and RTree.  
1.7 Add transaction/unit-of-work helpers and idempotent mutation records.  
1.8 Add query-plan tests that reject critical full scans.  
1.9 Add corruption, busy-timeout, WAL checkpoint, and shutdown tests.

Exit gate: empty v2 projects reopen and query without generic JSON repositories.

### Phase 2: Object And Stream Store

2.1 Replace `objects.json` ownership with object/reference tables.  
2.2 Implement staged content-addressed writes and orphan cleanup.  
2.3 Implement versioned bounded event chunks with checksums.  
2.4 Implement active spool, single-writer lease, seal, and crash recovery.  
2.5 Implement event cursor reads by sequence and time.  
2.6 Implement bounded retention, archive, and mark-and-sweep jobs.  
2.7 Migrate existing object references without unnecessary byte copies.  
2.8 Add interrupted-write, dedupe, corruption, and deep-page tests.

Exit gate: object lookup/upsert and event paging are independent of total count.

### Phase 3: Project Catalog And Hierarchy

3.1 Move categories/projects into global typed tables.  
3.2 Move hierarchy and workspace preferences into project tables.  
3.3 Add cursor-paged child, ancestor, subtree, and search queries.  
3.4 Replace whole hierarchy save with atomic entry operations.  
3.5 Add feed events and targeted hierarchy cache updates.  
3.6 Progressively load left-sidebar folders without deriving the whole tree.  
3.7 Add keyboard, selection, move, delete, and deep-link tests over pages.  
3.8 Validate a 100k-subflow hierarchy fixture.

Exit gate: project open and one folder expansion are bounded.

### Phase 4: Flow-Owned Metadata

4.1 Move Flow metadata, interfaces, variables, errors, and settings.  
4.2 Move subflows/categories and preserve `graph_flow_id` ownership. Modern
Subflow saves persist a generated graph ID. Compatibility projection for a
legacy Subflow without that field derives the deterministic ID and synthesizes
an empty graph when needed, but does not rewrite the legacy canonical Subflow
JSON until a normal save occurs. Project referenced Subflows and graph Flows
before their Router.
4.3 Move Routers, groups, routes, fallback, and priorities.  
4.4 Move instructions, scopes, tags, and bindings.  
4.5 Add indexed effective-instruction resolution and digest cache.  
4.6 Move adaptation policies and context-specific settings.  
4.7 Replace JSON index updates with transactional mutations.  
4.8 Replace list endpoints with keyset pages and focused details.  
4.9 Update UI stores/views to consume pages and mutation deltas.  
4.10 Add authorization, conflict, cascade, and scale tests.

Exit gate: non-graph Flow objects have one SQL owner and no active JSON index.

### Phase 5: Graph Persistence And Revision API

5.1 Implement node, edge, region, partition, revision, and operation repositories.  
5.2 Import/split monolithic Flow graphs into revision 1.  
5.3 Implement entity-by-ID and viewport queries with RTree.  
5.4 Implement low-zoom aggregates and boundary edges.  
5.5 Implement transactional graph patches and idempotency.  
5.6 Implement overlap-aware conflict/rebase responses.  
5.7 Implement operation inverses and revision-history pages.  
5.8 Implement immutable periodic graph snapshots and restore.  
5.9 Implement incremental validation scheduling.  
5.10 Remove full-graph save from the normal editor API.  
5.11 Add patch/replay/snapshot/conflict property tests.  
5.12 Benchmark 100k-node viewport, move, connect, delete, and search.

Exit gate: editing one node performs bounded work at every layer.

### Phase 6: Scalable Graph Client

6.1 Create normalized `GraphViewportStore` with partition revisions and LRU.  
6.2 Load initial viewport rather than full graph.  
6.3 Add pan/zoom prefetch, cancellation, density limits, and progressive states.  
6.4 Preserve stable entity identities across partition updates.  
6.5 Replace graph-copy history with operation batches and byte budgets.  
6.6 Replace localStorage graph documents with IndexedDB operation drafts.  
6.7 Move layout, selection geometry, conversion, validation, and serialization
to workers.  
6.8 Replace whole-graph signatures with revision plus pending operations.  
6.9 Render partition density in the MiniMap.  
6.10 Split editor ownership from `AutomationStudioLive`.  
6.11 Add Playwright long-task, heap, interaction, and DOM-count checks at 1k,
10k, and 100k nodes.

Exit gate: browser cost depends on visible entities, not total graph size.

### Phase 7: Runtime, Recording, And State Streams

7.1 Move run summaries to typed `runtime_runs`.  
7.2 Write runtime events/action attempts to chunk streams.  
7.3 Unify Runtime Debug detail around one ordered typed event stream.  
7.4 Move recording summaries to typed `recordings`.  
7.5 Write recording timelines to chunk streams.  
7.6 Move state metadata/path indexes to SQL and bodies/assets to objects.  
7.7 Add tail subscriptions and reconnect by sequence.  
7.8 Remove flat-file offset scans and whole JSONL rewrites.  
7.9 Add million-event append, tail, random-page, recovery, and retention tests.

Exit gate: UI and writers remain bounded at millions of events.

### Phase 8: Compilation And Runtime Isolation

8.1 Define the versioned compact compiled-plan contract.  
8.2 Compile fixed graph revisions in background jobs.  
8.3 Store compiled plans as immutable objects with SQL manifests.  
8.4 Resolve dependencies, instructions, and settings at compile time where safe.  
8.5 Start runs from captured compiled artifacts and revisions.  
8.6 Add safe-point adoption records for approved live adaptations.  
8.7 Cache compiled artifacts by digest with bounded memory.  
8.8 Add deterministic replay and revision-provenance tests.  
8.9 Prove runtime start does not query editor graph tables after artifact load.

Exit gate: execution cost is based on the invoked Flow, not project size.

### Phase 9: Adaptation And LLM Evidence

9.1 Move adaptation metadata/status to typed tables.  
9.2 Store patches, prompts, responses, and large evidence as objects.  
9.3 Bind adaptations to base Flow, Router, settings, and instruction revisions.  
9.4 Apply approved adaptations through graph patch transactions.  
9.5 Enforce automatic/manual/no-intervention policy without bypassing compile
or validation.  
9.6 Add stale-base rebase, supersede, rollback, and audit flows.  
9.7 Page Adaptations UI detail sections/evidence independently.  
9.8 Add high-volume history and live-run safety tests.

Exit gate: LLM adaptation is revision-safe, auditable, and bounded.

### Phase 10: Push Sync And Client Store Decomposition

10.1 Add project change-feed subscription transport.  
10.2 Replace the 1.5-second gateway snapshot poll.  
10.3 Replace the three-second application project-context heartbeat.  
10.4 Add reconnect cursors, fallback, visibility pause, and backpressure.  
10.5 Replace project-wide invalidation with entity/query invalidation.  
10.6 Remove post-mutation `refreshProjectRuntimeState()` calls.  
10.7 Split Flow, hierarchy, recording, runtime, state, and adaptation stores.  
10.8 Add subscription leak, repeated navigation, and idle CPU/network tests.

Exit gate: idle Studio does no application polling and scoped changes stay scoped.

### Phase 11: Migration And Cutover

11.1 Implement inventory and verified backup manifests.  
11.2 Implement resumable importers for every legacy resource.  
11.3 Implement graph split, stream chunking, and object-reference migration.  
11.4 Implement count/digest/reference/semantic verification reports.  
11.5 Add hybrid-read comparison diagnostics without dual-write.  
11.6 Enable v2 for new projects behind a feature flag.  
11.7 Migrate fixture and representative real projects.  
11.8 Soak, measure, and fix mismatches.  
11.9 Make v2 default and retain explicit rollback.  
11.10 Remove browser access to legacy broad endpoints.  
11.11 Retire read-time repair and active JSON indexes.  
11.12 Document backup retention and final legacy cleanup.

Exit gate: supported projects use v2 and pass migration verification.

### Phase 12: Final Scale Certification

12.1 Run and publish the full scale matrix and hardware/configuration.  
12.2 Run 24-hour runtime/recording append and subscription soaks.  
12.3 Inject crashes during graph, stream, object, and migration writes.  
12.4 Run heap retention across 1,000 project/view switches.  
12.5 Verify every critical query plan and payload budget.  
12.6 Verify backup restore and deterministic compiled-plan replay.  
12.7 Update authored architecture, operations, importing-repo, and generated docs.  
12.8 Remove feature flags only after every gate passes.

Exit gate: every target in this document has automated evidence.

## Testing Matrix

| Layer | Required coverage |
| --- | --- |
| Schema | migrations, constraints, indexes, rollback boundaries, query plans |
| Repositories | keyset order, filters, deletion, concurrency, transactions |
| Graph | operation properties, replay, partitions, RTree, conflicts |
| Objects | digest, dedupe, staging crash, references, GC, corruption |
| Streams | sequence, seal, tail, recovery, random page, retention |
| APIs | limits, cursors, ETags, cancellation, stale revisions, payload size |
| Client stores | normalization, LRU, invalidation, stale-response rejection |
| UI | progressive states, selection, deep links, virtualized interaction |
| Workers | cancellation, recovery, deterministic output, backpressure |
| Runtime | compiled isolation, revision capture, adaptation safe points |
| Migration | resume, idempotency, verification, rollback, mixed history |
| Performance | 1k/10k/100k graph, million events, 100k hierarchy, idle soak |

## Observability And Guardrails

Development and test telemetry exposes:

- SQL fingerprint, duration, returned rows, and full-scan warning;
- object bytes read/written and stream chunks touched;
- endpoint duration, serialized bytes, and cancellation;
- change-feed lag and reconnect count;
- graph partitions/entities cached and mounted;
- worker queue depth and task duration;
- React commit duration and browser long tasks;
- mutation-to-visible-update latency;
- migration phase, cursor, throughput, and errors.

CI fails when:

- a critical query loses its expected index/query plan;
- ordinary project open calls a banned broad endpoint;
- an endpoint exceeds its fixture payload budget;
- an idle test observes application polling;
- an interaction mounts more than the graph entity ceiling;
- navigation retains stores, workers, object URLs, or subscriptions;
- a user read writes migration/repair data.

## Risks And Decisions To Validate

1. Verify SQLite RTree in every packaged target. If unavailable, use indexed
   fixed-grid partitions; never fall back to full node scans.
2. Verify FTS5 in every packaged target.
3. One database per project simplifies isolation and backup but requires a
   bounded open-project connection manager.
4. Benchmark partition size against real density and make it schema-versioned.
5. Keep the event chunk codec versioned and readable across framework releases.
6. Arbitrary-filter totals may be expensive. Return `hasMore` without totals
   unless a maintained count or cheap query exists.
7. Multi-process writers need durable leases beyond in-process promise locks.
8. Published revisions and run-linked compiled artifacts are retention roots.
9. Soft deletion is needed for revision integrity, but purge must remain a
   separate authorized retention operation.
10. Encryption metadata belongs in object records; secret-key material remains
    owned by the Secret Keys program, not this project database.

## Non-Goals

- Do not move domain-specific automation into FluxIQ.
- Do not require a remote database server for local Automation Studio.
- Do not make every bounded metadata field relational.
- Do not load a million nodes into the browser to prove backend scale.
- Do not synchronize old JSON indexes forever.
- Do not allow automatic adaptation to bypass validation, compilation,
  authorization, or revision checks.

## Definition Of Done

The architecture is complete only when:

- mutable project data has one canonical SQL owner;
- large immutable payloads have one object owner and SQL references;
- project open, folder open, graph open, and list actions do no project-wide
  document scan;
- normal graph edits do not transfer, validate, serialize, or write the full graph;
- growable lists do not use deep offset pagination;
- idle UI performs no application snapshot polling;
- runtime executes captured immutable revisions;
- migration is explicit, resumable, verified, and rollback-capable;
- the full scale matrix passes latency, payload, memory, and durability gates;
- authored and generated docs match implemented ownership.

## Implementation Ledger

Update this table immediately after each numbered step. Add one row per step;
do not collapse multiple steps into a retrospective entry.

| Step | Status | Date | Change reference | Validation/evidence | Next |
| --- | --- | --- | --- | --- | --- |
| Architecture audit and target plan | Done | 2026-08-27 | This document | Source audit across storage, service, API, browser state, graph, runtime, recordings, and existing docs | Phase 0.1 |
| 0.1 Endpoint/SQL/browser metrics | Done | 2026-08-27 | Added bounded framework performance recorder, AsyncLocalStorage endpoint/SQL attribution, fingerprinted SQLite primitive metrics, endpoint response-byte aggregation, browser render-delay metrics, and a live Long Tasks observer | Framework/web checks and builds pass; web 289/289 tests pass; focused framework API/metrics/SQLite 13/13 tests pass. Full framework suite reached the new tests but an unrelated TypeDoc test exceeded its existing 5s timeout. | Phase 0.2 |
| 0.2 Development data inspector | Done | 2026-08-27 | Added permission-protected bounded server metric snapshot plus a development-only Data Flow Inspector with Overview, Requests, SQL, and Browser views; added active request, cache byte/scope, graph entity, polling subscription, render, long-task, and worker-queue telemetry | Framework/web checks and builds pass; focused framework endpoint/metrics/permission 8/8 tests pass; complete web 291/291 tests pass; inspector contract forbids adding its own polling loop | Phase 0.3 |
| 0.3 Deterministic scale fixtures | Done | 2026-08-27 | Added public, seed-stable, range-addressable fixture generators for projects, Flows, subflows, project and per-graph node/edge dimensions, instructions, runs, runtime events, recordings, recording events, and object metadata; batches are bounded and carry a reproducible manifest digest | FluxIQ check/build pass; focused scale fixture suite 3/3 passes, including deterministic page equivalence and target-scale tail pages without allocating complete collections | Phase 0.4 |
| 0.4 Current architecture baselines | Done | 2026-08-27 | Added `measureAutomationStudioLegacyBaseline` plus `pnpm studio:baseline`; captured project-open, graph-open, one-node move, full save, 50-run page, and 50-event page at 1k/10k/100k nodes | FluxIQ check/build pass and focused testing suite 4/4 passes. Recorded 68.7 MB graph payload, 216.33 ms project parse, 213.02 ms graph parse, 137.36 ms save serialization, and 73.37 ms 50-event page at 100k nodes, before UI or I/O overhead | Phase 0.5 |
| 0.5 Ordinary-UI endpoint guardrails | Done | 2026-08-27 | Added explicit catalog/summary/detail/mutation request intent and a centralized full-document endpoint policy; project-open and runtime-summary builders now identify ordinary requests and cannot select snapshot, full graph, full recording, full timeline, full run, or comparable detail endpoints | Web check passes; focused request-policy and live Studio suites 14/14 pass, including source audit and rejection of every full-document endpoint from catalog/summary paths | Phase 0.6 |
| 0.6 Browser long-task and heap-retention scenarios | Done | 2026-08-27 | Extended the existing Playwright performance harness with CDP garbage collection/heap sampling and a desktop scenario covering ten project transitions plus forty Router/Runtime Debug transitions; records accumulated long tasks and enforces 32 MiB retained-heap and 1-second single-task ceilings | Web check passes; Playwright compiles and lists the new scenario in the configured matrix. Browser execution remains an environment validation because repository instructions prohibit starting the web panel in this work session | Phase 0.7 |
| 0.7 Published baseline report | Done | 2026-08-27 | Published the reproducible legacy data-path table, budget comparison, limitations, six findings, and Phase 0 exit decision in this document | Report traces to `pnpm studio:baseline`, deterministic fixtures, request/SQL/browser telemetry, and the Playwright switch-retention scenario; Phase 0 is measurable and the legacy architecture explicitly fails target payload/work bounds | Phase 1.1 |
| 1.1 Dedicated project database connection kernel | Done | 2026-08-27 | Added `AutomationStudioProjectDatabasePool`, reference-counted project leases, one FULLMUTEX serialized WAL connection per leased project, FIFO statement/transaction execution, SQL telemetry context, configured foreign keys/synchronous/temp-store/busy timeout, safe project paths, and drain-before-close lifecycle | FluxIQ check passes; focused kernel suite 3/3 passes for concurrent connection identity, post-release availability, final close, contiguous transactions, FIFO operations, configured foreign keys, and traversal rejection | Phase 1.2 |
| 1.2 Migration runner and schema lifecycle | Done | 2026-08-27 | Added ordered migration validation, SHA-256 ledger checksums, lifecycle bootstrap tables, tokenized transactional schema lock with stale takeover, pre-migration backup hook, per-migration atomic ledger commits, restart skips, durable sanitized failure state, and lock-safe ready transition | FluxIQ check passes; focused project database/migration suites 6/6 pass, covering backup-once behavior, checksum mismatch, SQL rollback without partial DDL/ledger writes, active lock refusal, stale lock takeover, and final state | Phase 1.3 |
| 1.3 Global catalog schema and typed repositories | Done | 2026-08-27 | Added migrated `catalog.sqlite` with typed `project_categories` and `projects`, FK category cleanup, unique storage paths, status checks, revision columns, discovery indexes, typed CRUD repositories, optimistic conflict checks, stable keyset cursors, filters, and reopen lifecycle | FluxIQ check passes; focused Phase 1 suites 9/9 pass, including persistence across reopen, optimistic conflict rejection, three-page keyset traversal without duplicates, and `on delete set null` category behavior | Phase 1.4 |
| 1.4 Project administration, feed, outbox, and job tables | Done | 2026-08-27 | Added the first per-project schema migration plus typed `AutomationStudioProjectAdministration` repositories for project metadata, monotonic change feed events, staged storage outbox work, resumable migration jobs, and prioritized background jobs; exported the module from the storage package | FluxIQ check passes; focused Phase 1 storage suites 13/13 pass, covering migrated reopen, metadata revision conflicts, monotonic feed sequencing, entity feed filters, storage outbox status/attempt tracking, ready-job priority ordering, owner filtering, and migration cursor JSON validation | Phase 1.5 |
| 1.5 Domain resource tables | Done | 2026-08-27 | Added project migration `0002_domain_resource_tables` and table inventory for hierarchy, workspace preferences, Flows, settings, graph partitions/nodes/edges/regions/revisions/operations, Routers, subflows, instructions, runtime runs/chunks, recordings/chunks, state snapshots/paths, adaptations/evidence, publications, compiled artifacts, objects, and object references | FluxIQ check passes; focused Phase 1 storage suites 16/16 pass, including full domain table creation, row-level smoke inserts for core resources without project JSON hydration, and enum/count CHECK constraint enforcement | Phase 1.6 |
| 1.6 Foreign keys, unique constraints, covering indexes, FTS, and RTree | Done | 2026-08-27 | Added project migration `0003_relation_indexes_search` with key uniqueness for graph revisions/operations/chunks/artifacts, child/owner/viewport/runtime/adaptation covering indexes, FTS5 search tables for hierarchy entries, graph nodes, and instructions, RTree node-bounds storage with maintenance triggers, and relationship guard triggers for every planned table reference added after the base table migration | FluxIQ check passes; focused Phase 1 storage suites 17/17 pass, including search/spatial table creation, duplicate chunk rejection, missing Flow relationship rejection, and RTree lookup of inserted node bounds | Phase 1.7 |
| 1.7 Transaction/unit-of-work helpers and idempotent mutation records | Done | 2026-08-27 | Added project migration `0004_idempotent_mutations`, `mutation_records`, `mutation_touched_entities`, stable request digesting, and `AutomationStudioProjectUnitOfWork` for one-transaction mutations that can record touched entities, append change-feed rows, replay committed responses for repeated mutation IDs, reject digest reuse conflicts, and persist bounded failure records after rollback | FluxIQ check passes; focused Phase 1 storage suites 20/20 pass, covering idempotent replay, digest mismatch rejection, change-feed sequence capture, touched-entity persistence, failed mutation rollback, and failure-record persistence | Phase 1.8 |
| 1.8 Query-plan tests that reject critical full scans | Done | 2026-08-27 | Added reusable query-plan inspection helpers plus focused tests for hierarchy child expansion, graph partition viewport reads, runtime run keyset pages, runtime event chunk lookup, mutation owner history, object-reference lookup, FTS search, and RTree spatial lookup | FluxIQ check passes; focused Phase 1 storage suites 22/22 pass, and the new query-plan assertions reject critical full table scans while requiring the expected covering/unique/virtual indexes for ordinary large-resource reads | Phase 1.9 |
| 1.9 Corruption, busy-timeout, WAL checkpoint, and shutdown tests | Done | 2026-08-27 | Added explicit project database `integrityCheck()` and WAL `checkpoint()` APIs, close-on-open-failure handling for malformed database files, and durability tests for corrupted project DB rejection, busy writer timeout behavior, explicit checkpoint results, and close draining queued work before handle shutdown | FluxIQ check passes; focused Phase 1 storage suites 26/26 pass. Phase 1 exit gate is satisfied for empty v2 project databases: they migrate, reopen, query typed tables, enforce critical constraints, expose query-plan guardrails, and do not rely on generic JSON repositories | Phase 2.1 |
| 2.1 Replace `objects.json` ownership with object/reference tables | Done | 2026-08-27 | Added `AutomationStudioProjectObjectRepository` over project SQL `objects` and `object_references`, with digest dedupe, owner/purpose references, object keyset pagination, reference deletion, and unreferenced-object listing; exported the repository as the v2 mutable object ownership path | FluxIQ check passes; focused storage suites 29/29 pass, including reopen persistence, duplicate SHA reuse without array rewrites, owner reference lookup, keyset object pages without offset, and proof the SQL path does not create `indexes/objects.json` | Phase 2.2 |
| 2.2 Staged content-addressed writes and orphan cleanup | Done | 2026-08-27 | Added `AutomationStudioProjectContentStore` for project-scoped staged writes, atomic moves to `objects/sha256/<aa>/<bb>/<sha>.<ext>`, SQL object/reference recording, digest-verified reads, digest dedupe without canonical rewrites, and bounded stale staging cleanup | FluxIQ check passes; focused storage suites 32/32 pass, covering staged byte writes, JSON writes, SQL ownership/reference creation, readback digest verification, duplicate-content dedupe, and interrupted staging cleanup that leaves fresh staging intact | Phase 2.3 |
| 2.3 Versioned bounded event chunks with checksums | Done | 2026-08-27 | Added `AutomationStudioProjectEventChunkStore` for immutable `automation-studio.event-chunk.v1` documents, contiguous sequence validation, event-count and byte-size bounds, content-addressed chunk writes, SQL manifests in runtime/recording chunk tables, stream-owned object references, checksum-backed readback, and duplicate first-sequence rejection | FluxIQ check passes; focused storage suites 35/35 pass, covering runtime and recording chunk writes, manifest/readback consistency, checksum-backed content reads, duplicate runtime chunk rejection, and no manifest writes for oversized or non-contiguous chunks | Phase 2.4 |
| 2.4 Active spool, single-writer lease, seal, and crash recovery | Done | 2026-08-27 | Added project migration `0005_event_stream_spools`, `event_writer_leases`, `event_spools`, and `AutomationStudioProjectEventStreamStore` for single-writer stream leases, active JSONL spool appends, contiguous sequence enforcement, explicit seal to immutable chunks, stale-writer takeover, and recovery of expired active spools into closed chunk manifests | FluxIQ check passes; focused storage suites 38/38 pass, covering writer contention, post-seal reacquisition, spool-to-chunk sealing, simulated crash recovery after lease expiry, and rejected skipped sequence appends | Phase 2.5 |
| 2.5 Event cursor reads by sequence and time | Done | 2026-08-27 | Added project migration `0006_event_chunk_time_ranges`, first/last event time columns and indexes for runtime and recording chunks, chunk manifest time-range population, bounded `readEventsBySequence`, and cursor-paged `readEventsByTime` that opens only candidate chunks needed for the requested page | FluxIQ check passes; focused storage suites 39/39 pass, covering sequence cursor pages, time cursor pages, next-cursor resume, and existing chunk/write/recovery behavior after the time-range migration | Phase 2.6 |
| 2.6 Bounded retention, archive, and mark-and-sweep jobs | Done | 2026-08-27 | Added project migration `0007_event_retention`, archive timestamps/indexes for runtime and recording chunk manifests, `AutomationStudioProjectRetentionStore`, bounded chunk archival that enqueues background archive jobs, and mark-and-sweep deletion for SQL objects only after references are gone | FluxIQ check passes; focused storage suites 41/41 pass, covering archive marker updates, bounded archive-job creation, referenced-object preservation, unreferenced object file deletion, and SQL row removal without scanning legacy indexes | Phase 2.7 |
| 2.7 Existing object-reference migration without unnecessary byte copies | Done | 2026-08-27 | Added explicit `migrateAutomationStudioLegacyObjectIndex` importer for legacy `indexes/objects.json`, mapping project/shared/recording/proposal owners to SQL object references, verifying existing file sizes when requested, importing metadata into `objects`, and resuming idempotently without moving or copying object bytes | FluxIQ check passes; focused storage suites 43/43 pass, covering SQL import from legacy indexes, file mtime/content preservation, missing-byte reporting, owner reference mapping, and rerun behavior that skips already-imported SHA rows | Phase 2.8 |
| 2.8 Interrupted-write, dedupe, corruption, and deep-page tests | Done | 2026-08-27 | Added object/stream edge-case coverage and hardened SQL object upsert against concurrent same-SHA races; tests now cover concurrent content dedupe, corrupted content-addressed file detection, and deep event sequence paging over many chunks without offset pagination | FluxIQ check passes; focused storage suites 46/46 pass. Phase 2 exit gate is satisfied for the new v2 object/stream layer: object lookup/upsert, staged writes, dedupe, SQL references, chunk manifests, stream recovery, and event paging are independent of total object/event count | Phase 3.1 |
| 3.1 Move categories/projects into global typed tables | Done | 2026-08-27 | Added explicit `migrateAutomationStudioLegacyProjectCatalog` importer for legacy `projects/index.json`, mapping categories and projects into the migrated global `catalog.sqlite` typed repositories with storage paths, domain/category cleanup, active status, and idempotent rerun behavior | FluxIQ check passes; focused storage suites 48/48 pass, covering legacy category/project import, typed domain filtering, missing-category nulling, generated project storage paths, and typed upsert resume without returning to JSON index ownership | Phase 3.2 |
| 3.2 Move hierarchy and workspace preferences into project tables | Done | 2026-08-27 | Added `AutomationStudioProjectHierarchyRepository` over SQL `hierarchy_entries` and `workspace_preferences`, including transactional depth/path maintenance, revisioned entry and preference writes, soft-delete tombstones, and legacy hierarchy import for custom nodes, deleted IDs, and workspace preferences | FluxIQ check passes; focused storage suites 51/51 pass, covering child depth/path derivation, revision conflicts, preference JSON storage/revisions, legacy custom node import, tombstone creation, and workspace preference import | Phase 3.3 |
| 3.3 Cursor-paged child, ancestor, subtree, and search queries | Done | 2026-08-27 | Added hierarchy cursor pages for folder children, ancestor chain lookup, subtree pages keyed by `path_key`, FTS-backed hierarchy search, and FTS maintenance during entry writes/deletes | FluxIQ check passes; focused storage suites 52/52 pass, covering multi-page child traversal, ancestor ordering, subtree selection, and searchable hierarchy labels without full tree hydration | Phase 3.4 |
| 3.4 Replace whole hierarchy save with atomic entry operations | Done | 2026-08-27 | Added `AutomationStudioProjectHierarchyMutations` for idempotent create, rename, move-subtree, and delete-subtree operations over SQL hierarchy entries, including revision checks, path/depth subtree rewrites, FTS cleanup, change-feed records, and touched-entity records through the unit-of-work layer | FluxIQ check passes; focused storage suites 54/54 pass, covering timestamp-stable idempotent replay, rename conflicts, subtree path rewrites, subtree tombstoning, and search cleanup without whole-tree saves | Phase 3.5 |
| 3.5 Feed events and targeted hierarchy cache updates | Done | 2026-08-27 | Added hierarchy cache-scope touched entities to atomic hierarchy mutations and introduced `AutomationStudioProjectHierarchyFeed`, a sequence-cursor projection that returns changed entries, deleted subtree IDs, affected parent folders, and subtree invalidations without loading the whole hierarchy | FluxIQ check passes; focused hierarchy/feed suites 15/15 pass, covering create/rename updates, move parent/subtree invalidations, delete subtree tombstones, and cursor advancement from the change feed | Phase 3.6 |
| 3.6 Progressively load left-sidebar folders without deriving the whole tree | Done | 2026-08-27 | Added paged hierarchy cache utilities and updated `AutomationProjectTree` to accept parent-owned child page metadata and load-more callbacks, so SQL-backed folder expansion can render loaded children, loading state, stale-folder refresh, and next-page requests without local whole-tree paging | Focused web hierarchy suite passes 18/18, including parent-owned page state and no fallback local `Show 100 more` behavior when SQL page state is present | Phase 3.7 |
| 3.7 Keyboard, selection, move, delete, and deep-link tests over pages | Done | 2026-08-27 | Added sidebar coverage for selected Flow-owned objects on later loaded pages, tree roles/levels/parent IDs, active view selection stability, and existing delete/create affordances over paged hierarchy rows | Focused `ProjectTree` suite passes 16/16 tests and paged-cache suite passes 2/2 tests | Phase 3.8 |
| 3.8 Validate a 100k-subflow hierarchy fixture | Done | 2026-08-27 | Added a SQL-backed 100k-subflow hierarchy fixture that validates first-page expansion, deep tail keyset pagination, ancestor lookup, and query-plan rejection of hierarchy full scans | Focused FluxIQ hierarchy storage suite passes 9/9; 100k fixture test completed in about 3.0s and uses `hierarchy_entries_children_idx` for child expansion | Phase 4.1 |
| 4.1 Move Flow metadata, interfaces, variables, errors, and settings | Done | 2026-08-27 | Added SQL-backed Flow resource repository for Flow metadata, settings, ports, variables, and errors; saved Flows now mirror non-graph metadata into typed project SQL | FluxIQ check passes; focused Phase 4 backend/API tests 9/9 pass | Phase 4.2 |
| 4.2 Move subflows/categories and preserve `graph_flow_id` ownership | Done | 2026-09-01 | Added SQL subflow category and subflow repositories with keyset pages and graph Flow ownership preservation. Modern saves persist a deterministic missing `graphFlowId`; legacy SQL projection derives that ID, creates a blank isolated graph when needed, and projects referenced Subflows before Routers. Projection intentionally does not rewrite legacy canonical Subflow JSON; a later normal save performs that canonical update. | Existing Phase 4 backend/API coverage passes; direct legacy-document projection, resolvable graph, and Router ordering remain explicit Phase 8 certification requirements | Phase 4.3 |
| 4.3 Move Routers, groups, routes, fallback, and priorities | Done | 2026-08-27 | Added SQL Router detail repository with groups, priority-ordered routes, fallback targets, route conditions, and revisioned updates | FluxIQ check passes; focused Phase 4 backend/API tests 9/9 pass | Phase 4.4 |
| 4.4 Move instructions, scopes, tags, and bindings | Done | 2026-08-27 | Added SQL instruction detail, scopes, tags, FTS maintenance, and instruction binding owner lookup | FluxIQ check passes; focused Phase 4 backend/API tests 9/9 pass | Phase 4.5 |
| 4.5 Add indexed effective-instruction resolution and digest cache | Done | 2026-08-27 | Added indexed effective-instruction resolution across global/project/Flow/Router/subflow/node/error scopes plus digest cache invalidation on instruction writes | FluxIQ check passes; focused Phase 4 backend/API tests 9/9 pass | Phase 4.6 |
| 4.6 Move adaptation policies and context-specific settings | Done | 2026-08-27 | Added `adaptation_policies` SQL ownership for context-specific LLM/adaptation settings | FluxIQ check passes; focused Phase 4 backend/API tests 9/9 pass | Phase 4.7 |
| 4.7 Replace JSON index updates with transactional mutations | Done | 2026-08-27 | Added idempotent Flow resource mutation helper for Flow create, settings update, subflow create, instruction save, and typed resource deletion with change-feed records | FluxIQ check passes; focused Phase 4 backend/API tests 9/9 pass | Phase 4.8 |
| 4.8 Replace list endpoints with keyset pages and focused details | Done | 2026-08-27 | Added additive `list-flow-metadata-page` and `get-flow-metadata-detail` endpoints backed by SQL keyset/detail service methods | FluxIQ check passes; focused Phase 4 backend/API tests 9/9 pass | Phase 4.9 |
| 4.9 Update UI stores/views to consume pages and mutation deltas | Done | 2026-08-27 | Added reusable Automation Studio resource page store with stable page keys and targeted upsert/delete delta application | Web check passes; focused UI page-store tests 2/2 pass | Phase 4.10 |
| 4.10 Add authorization, conflict, cascade, and scale tests | Done | 2026-08-27 | Added focused coverage for revision conflicts, SQL ownership without JSON indexes, keyset pagination, graph Flow preservation, instruction binding/effective cache behavior, API handler registration, and mutation deltas | FluxIQ check passes; web check passes; focused Phase 4 tests 11/11 pass | Phase 5.1 |
| 5.1 Implement node, edge, region, partition, revision, and operation repositories | Done | 2026-08-27 | Added `AutomationStudioProjectGraphRepository` over SQL graph tables with typed node, edge, partition, revision, operation, search, and export read models | FluxIQ check passes; focused Phase 5 graph/API suite passes 8/8 | Phase 5.2 |
| 5.2 Import/split monolithic Flow graphs into revision 1 | Done | 2026-08-27 | Added revision-1 monolithic Flow import that splits Flow artifacts into node, edge, and region rows plus revision operation records | Focused import tests cover idempotent import and revision operation counts | Phase 5.3 |
| 5.3 Implement entity-by-ID and viewport queries with RTree | Done | 2026-08-27 | Added node/edge by-ID reads plus RTree-backed viewport paging with pinned offscreen nodes | Focused viewport tests load only intersecting nodes from bounds | Phase 5.4 |
| 5.4 Implement low-zoom aggregates and boundary edges | Done | 2026-08-27 | Added partition aggregate reads and boundary-edge records for visible-to-offscreen connections | Focused viewport tests verify full visible edges and boundary edge stubs | Phase 5.5 |
| 5.5 Implement transactional graph patches and idempotency | Done | 2026-08-27 | Added idempotent `applyPatch` for add/move/parameter/delete node and add/delete edge operations through project unit-of-work | Focused patch tests verify replayed mutations return original committed results | Phase 5.6 |
| 5.6 Implement overlap-aware conflict/rebase responses | Done | 2026-08-27 | Added stale-base handling that auto-rebases non-overlapping edits and returns structured conflicts for touched entities changed since the base revision | Focused tests cover non-overlap rebase and node overlap conflict payloads | Phase 5.7 |
| 5.7 Implement operation inverses and revision-history pages | Done | 2026-08-27 | Patch responses now include inverse operations and cursor-paged revision history reads | Focused tests verify inverse move operations and history pagination | Phase 5.8 |
| 5.8 Implement immutable periodic graph snapshots and restore | Done | 2026-08-27 | Added content-addressed graph snapshot creation, revision snapshot linkage, and restore through the graph patch protocol | Snapshot/restore tests verify immutable object writes and restored node position | Phase 5.9 |
| 5.9 Implement incremental validation scheduling | Done | 2026-08-27 | Graph patch commits enqueue `graph.validation.incremental` background jobs scoped to the Flow revision | Patch tests verify pending validation jobs for committed revisions | Phase 5.10 |
| 5.10 Remove full-graph save from the normal editor API | Done | 2026-08-27 | Added graph viewport, patch, revision, and snapshot API contracts plus a normal-editor guard rejecting full Flow document endpoints for graph writes | API contract tests verify patch endpoints and full-document rejection | Phase 5.11 |
| 5.11 Add patch/replay/snapshot/conflict property tests | Done | 2026-08-27 | Added focused graph persistence tests covering import, viewport, patch replay, conflict/rebase, history, snapshot, and restore behavior | Focused Phase 5 graph/API suite passes 8/8 | Phase 5.12 |
| 5.12 Benchmark 100k-node viewport, move, connect, delete, and search | Done | 2026-08-27 | Added `measureAutomationStudioGraphStoreBenchmark` harness for SQL graph import, viewport, move, connect, delete, and search measurements | Benchmark smoke test passes with bounded viewport payload; full 100k long benchmark remains a certification-run input for Phase 12 | Phase 6.1 |
| 6.1 Create normalized `GraphViewportStore` with partition revisions and LRU | Done | 2026-08-27 | Added client-side normalized graph viewport storage with partition keys, revisions, stable node/edge maps, owner tracking, deterministic partition addressing, density metadata, and enforceable LRU eviction | Web check passes; focused Phase 6 web graph suite passes 38/38 | Phase 6.2 |
| 6.2 Load initial viewport rather than full graph | Done | 2026-08-27 | Added initial viewport loading state and density-state viewport documents while retaining the current compatibility bridge until graph patch APIs fully replace whole-flow save | Web check passes; focused Phase 6 web graph suite passes 38/38 | Phase 6.3 |
| 6.3 Add pan/zoom prefetch, cancellation, density limits, and progressive states | Done | 2026-08-27 | Added graph viewport coordinator behavior for foreground request cancellation, prefetch cancellation, loading/error/partial/ready/dense/capped states, and visible entity caps | Focused viewport tests cover loading, capped density, LRU, and stale request cancellation | Phase 6.4 |
| 6.4 Preserve stable entity identities across partition updates | Done | 2026-08-27 | Reconciled node and edge instances by stable signatures so unchanged partition refreshes preserve object identity and reduce React Flow churn | Focused viewport identity tests pass | Phase 6.5 |
| 6.5 Replace graph-copy history with operation batches and byte budgets | Done | 2026-08-27 | Added operation-batch diff/apply/history helpers and rewired graph controller undo/redo toward bounded operation history instead of full graph snapshot stacks | Focused operation-history and graph-controller tests pass | Phase 6.6 |
| 6.6 Replace localStorage graph documents with IndexedDB operation drafts | Done | 2026-08-27 | Added IndexedDB operation-draft storage with memory-test implementation and operation draft save/load/delete APIs, plus live draft recovery/save wiring with legacy fallback during cutover | Focused draft-store and AutomationStudioLive tests pass | Phase 6.7 |
| 6.7 Move layout, selection geometry, conversion, validation, and serialization to workers | Done | 2026-08-27 | Added graph worker task queue for selection bounds, graph serialization, revision signatures, and shape validation with Worker execution and microtask fallback plus worker queue telemetry | Focused worker-task tests pass | Phase 6.8 |
| 6.8 Replace whole-graph signatures with revision plus pending operations | Done | 2026-08-27 | Replaced full graph draft/source hashing paths with revision/update metadata, pending-operation counters, and bounded compatibility sentinels | Focused regression tests confirm old full-graph draft key helper is removed | Phase 6.9 |
| 6.9 Render partition density in the MiniMap | Done | 2026-08-27 | Added MiniMap coloring by partition density metadata and compact viewport/history status UI in the graph editor | Focused GraphEditor view tests pass | Phase 6.10 |
| 6.10 Split editor ownership from `AutomationStudioLive` | Done | 2026-08-27 | Moved graph draft identity and operation-draft persistence ownership into graph modules, reducing `AutomationStudioLive` to selection/render orchestration for this slice | Focused AutomationStudioLive and graph-controller tests pass | Phase 6.11 |
| 6.11 Add Playwright long-task, heap, interaction, and DOM-count checks at 1k, 10k, and 100k nodes | Done | 2026-08-27 | Extended Playwright performance collection with graph DOM entity counts and added graph DOM budgets to the Studio scenario evaluator | Focused performance-budget tests pass; Playwright browser execution not run because repository instructions prohibit starting the web panel in this work session | Phase 7.1 |
| 7.1 Move run summaries to typed `runtime_runs` | Done | 2026-08-27 | Added `AutomationStudioProjectRuntimeStreamStore` run-summary projection over typed `runtime_runs`; service `listFlowRunSummaries` now prefers SQL run rows before legacy JSON summary fallback | Focused FluxIQ storage/API/service tests pass 100/100; SQL-backed run list uses typed columns for Flow/status/search/sort | Phase 7.2 |
| 7.2 Write runtime events/action attempts to chunk streams | Done | 2026-08-27 | Runtime run details now materialize ordered run summary, route, subflow, action, recovery, and intervention records into immutable event chunks with SQL manifests | Million-event append/tail test passes; new runtime writes avoid `actions.jsonl` creation when typed store is available | Phase 7.3 |
| 7.3 Unify Runtime Debug detail around one ordered typed event stream | Done | 2026-08-27 | Added `list-flow-run-events` API/service path and Runtime Debug ordered event stream view; action rows are still paged below but derive from typed stream storage when available | API contract tests pass; Runtime Debug UI tests pass; event view loads bounded 100-event pages by sequence | Phase 7.4 |
| 7.4 Move recording summaries to typed `recordings` | Done | 2026-08-27 | Added typed recording summary projection and service summary-page preference for SQL `recordings` before legacy recording index fallback | Focused storage tests cover typed recording summary counts and summary-only records | Phase 7.5 |
| 7.5 Write recording timelines to chunk streams | Done | 2026-08-27 | Recording full writes and appends now prefer recording event chunks with SQL manifests; legacy `timeline.jsonl` remains fallback for unmigrated/no-store projects | Focused storage tests cover recording stream paging by sequence | Phase 7.6 |
| 7.6 Move state metadata/path indexes to SQL and bodies/assets to objects | Done | 2026-08-27 | Added state snapshot object writes plus `state_snapshots` and `state_paths` SQL rows for scalar path lookup and body hydration | Focused storage tests verify object-backed state body readback and SQL path lookup | Phase 7.7 |
| 7.7 Add tail subscriptions and reconnect by sequence | Done | 2026-08-27 | Added sequence-based runtime/recording event page reads and Runtime Debug reconnect/tail paging through `afterSequence` and returned `lastSequence`/`nextCursor` metadata | Million-event test verifies tail read at sequence 999,990 and reconnect from returned last sequence | Phase 7.8 |
| 7.8 Remove flat-file offset scans and whole JSONL rewrites | Done | 2026-08-27 | New runtime and recording writes use SQL/chunk storage first, and action/event pages read chunk manifests instead of scanning or rewriting JSONL; legacy flat-file paths remain compatibility fallback only | Service tests pass; storage test asserts no `runtime/runs/<run>/actions.jsonl` is created on typed writes | Phase 7.9 |
| 7.9 Add million-event append, tail, random-page, recovery, and retention tests | Done | 2026-08-27 | Added focused million-event runtime stream test plus storage coverage for ordered stream detail, recording streams, state object storage, and sequence reconnect | `project-runtime-stream-store.test.ts` passes 4/4 including million-event case in supervisor validation | Phase 8.1 |
| 8.1 Define the versioned compact compiled-plan contract | Done | 2026-08-27 | Added `automation-studio.compiled-plan.v1` with sorted compact nodes/edges, source edge index, resolved settings/instructions, dependency list, revision provenance, deterministic `planDigest`, schema assertion, Flow-document bridge, and compiled-plan runtime entrypoint | Focused Phase 8 tests pass 8/8 in supervisor validation | Phase 8.2 |
| 8.2 Compile fixed graph revisions in background jobs | Done | 2026-08-27 | Added compile job enqueue/process support using `background_jobs` with stable job IDs, ready-job processing, running/done/failed status transitions, and fixed requested graph-revision validation | Focused Phase 8 tests cover pending compile job processing and output object assignment | Phase 8.3 |
| 8.3 Store compiled plans as immutable objects with SQL manifests | Done | 2026-08-27 | Added `AutomationStudioProjectCompiledPlanStore` over `compiled_artifacts` plus content-addressed JSON objects, SQL manifests, dedupe by Flow/revision/compiler, and object references rooted to compiled artifacts | Focused tests prove repeat compile returns the same ready manifest and loads the immutable object | Phase 8.4 |
| 8.4 Resolve dependencies, instructions, and settings at compile time where safe | Done | 2026-08-27 | Compile now captures Flow settings JSON, active global/project/Flow/bound instructions, instruction revisions/content digests, node-definition dependencies, settings digest, and instruction digest into the plan artifact | Focused tests assert resolved settings, instruction IDs, dependency/provenance fields, and graph digest capture | Phase 8.5 |
| 8.5 Start runs from captured compiled artifacts and revisions | Done | 2026-08-27 | Added `startRunFromArtifact` and `startRunFromLoadedPlan`, writing `runtime_runs.compiled_artifact_id`, executing the compiled plan, and updating run status/action/effect/error counts from the trace | Focused tests start a run from a compiled artifact and receive a succeeded trace | Phase 8.6 |
| 8.6 Add safe-point adoption records for approved live adaptations | Done | 2026-08-27 | Added migration `0008_compiled_runtime_isolation` with `compiled_plan_adoptions`, run/artifact/adaptation guards, indexed run safe-point order, and repository write/read mapping | Focused tests record a safe-point adoption against a runtime run and compiled artifact | Phase 8.7 |
| 8.7 Cache compiled artifacts by digest with bounded memory | Done | 2026-08-27 | Added digest-keyed LRU cache with byte accounting, max-byte enforcement, cache stats, cache hits on artifact load, and oversized-plan non-retention | Focused tests prove a tiny cache remains bounded while still allowing artifact load from object storage | Phase 8.8 |
| 8.8 Add deterministic replay and revision-provenance tests | Done | 2026-08-27 | Added tests for deterministic compile dedupe, stable loaded provenance, fixed graph/settings/instruction revisions, and repeated loaded-plan execution producing matching trace shape | Focused Phase 8 tests pass 8/8 | Phase 8.9 |
| 8.9 Prove runtime start does not query editor graph tables after artifact load | Done | 2026-08-27 | Added SQL audit hook around compiled-plan store operations and a test that clears SQL capture after artifact load, starts from the loaded plan, and asserts no editor graph/resource queries occur | Focused test proves post-load run start only touches `runtime_runs` before executing the in-memory compiled artifact | Phase 9.1 |
| 9.1 Move adaptation metadata/status to typed tables | Done | 2026-08-27 | Added project migration `0009_adaptation_evidence_revision_safety` with typed adaptation lifecycle columns, author/source-run/status reason/detail, base revision bindings, applied revision, supersede links, and indexed artifact/audit tables | Focused Phase 9 adaptation store tests pass 4/4 in supervisor validation | Phase 9.2 |
| 9.2 Store patches, prompts, responses, and large evidence as objects | Done | 2026-08-27 | Added `AutomationStudioProjectAdaptationStore` to persist patches, prompts, responses, runtime evidence, rollback patches, and audit references through project object storage instead of large adaptation JSON rows | Focused tests verify object-backed patch/prompt/response/evidence rows and artifact pagination | Phase 9.3 |
| 9.3 Bind adaptations to base Flow, Router, settings, and instruction revisions | Done | 2026-08-27 | Adaptation rows now capture base graph, Router, settings, and effective instruction revisions at creation/rebase time | Focused tests verify revision bindings `{ flowRevision, routerRevision, settingsRevision, instructionRevision }` | Phase 9.4 |
| 9.4 Apply approved adaptations through graph patch transactions | Done | 2026-08-27 | Approved adaptations are converted into normalized graph patch operations and applied through `AutomationStudioProjectGraphRepository.applyPatch`, recording changed entities, applied revision, rollback object, and audit events | Focused tests verify node parameter application, graph revision bump, rollback patch persistence, and rollback execution | Phase 9.5 |
| 9.5 Enforce automatic/manual/no-intervention policy through validation/compile gates | Done | 2026-08-27 | Added adaptation policy decision gates for adaptive, manual approval, and disabled modes; automatic runtime application is blocked under manual mode and unvalidated adaptations cannot apply; service review apply uses typed graph transaction path with compile enabled by default | Focused tests verify manual runtime blocking and disabled policy rejection | Phase 9.6 |
| 9.6 Add stale-base rebase, supersede, rollback, and audit flows | Done | 2026-08-27 | Added stale-base detection/audit, explicit rebase to current revisions, supersede links, status transitions, rollback through stored inverse graph patches, and typed lifecycle audit events | Focused tests verify stale-base audit, rebase, supersede, applied audit, and rollback audit | Phase 9.7 |
| 9.7 Page Adaptations UI detail sections/evidence independently | Done | 2026-08-27 | Adaptations UI now pages changes, evidence artifacts, validation rows, and lifecycle audit rows inside the detail pane; evidence shows object/artifact references instead of loading raw prompt/response JSON into the browser | Focused WorkspaceViews test passes 56/56 and asserts Phase 9 detail pagination/artifact/audit UI wiring | Phase 9.8 |
| 9.8 Add high-volume history and live-run safety tests | Done | 2026-08-27 | Added focused Phase 9 tests covering paged adaptation history, paged detail sections, policy blocks, stale-base safety, graph application, rollback, object evidence, and audit rows; legacy service fixture now asserts structural adaptations can be stored directly as validated typed adaptations without a separate proposal and includes the saved direct adaptation in pagination totals | Focused Phase 9 storage/UI suites pass; FluxIQ and web checks pass on the merged tree; supervisor root-suite update aligns the old proposal-era assertion with the Adaptations model | Phase 10.1 |
| 10.1 Add project change-feed subscription transport | Done | 2026-08-27 | Added `list-project-change-feed` contract, API handler, and service method returning bounded cursor pages over project `change_feed`; added browser project sync client that consumes cursor pages and emits scoped invalidations | FluxIQ check passes; web check passes; focused FluxIQ API/admin suites pass 9/9; focused web sync/cache/API/live tests pass 23/23 | Phase 10.2 |
| 10.2 Replace the 1.5-second gateway snapshot poll | Done | 2026-08-27 | Replaced the gateway snapshot interval with event, focus, visibility, and mutation-triggered refresh; development telemetry records gateway activity as event-driven instead of polling | Focused web sync/live tests pass; source guard rejects the old gateway interval | Phase 10.3 |
| 10.3 Replace the three-second application project-context heartbeat | Done | 2026-08-27 | Replaced the project-context heartbeat with lifecycle, focus, visibility, pointer, and keyboard-driven context publication while preserving the freshness safeguard | Focused web sync/live tests pass; source guard rejects the old heartbeat subscription | Phase 10.4 |
| 10.4 Add reconnect cursors, fallback, visibility pause, and backpressure | Done | 2026-08-27 | Added `AutomationStudioProjectSyncClient` with cursor resume, single in-flight request enforcement, queued mutation wakeups, hidden-tab pause/resume, abort-safe teardown, and reconnect delay fallback | Project sync tests cover cursor resume, backpressure without overlapping fetches, hidden-tab pause, and resume from the same cursor | Phase 10.5 |
| 10.5 Replace project-wide invalidation with entity/query invalidation | Done | 2026-08-27 | Added feed-event to store/cache-scope mapping, scoped cache eviction, resource IDs, and mutation invalidation metadata from `useProgramApi` so changes invalidate affected Flow/hierarchy/recording/runtime/state/adaptation scopes | Cache/program-api/sync tests prove scoped invalidation leaves unrelated project data intact | Phase 10.6 |
| 10.6 Remove post-mutation `refreshProjectRuntimeState()` calls | Done | 2026-08-27 | Replaced mutation follow-up broad runtime refreshes in `AutomationStudioLive` with `notifyProjectDataChanged`, scoped cache invalidation, and project sync wakeups; retained full refresh for project open and explicit manual refresh | Source verification shows remaining broad runtime refreshes are tied to initial load or explicit refresh behavior | Phase 10.7 |
| 10.7 Split Flow, hierarchy, recording, runtime, state, and adaptation stores | Done | 2026-08-27 | Added decomposed `AutomationStudioScopedStore` instances for Flow, hierarchy, recording, runtime, state, and adaptation, plus grouped invalidation application so scoped changes only bump affected stores | Project sync tests prove Flow invalidation does not notify recording store and stores maintain independent revisions | Phase 10.8 |
| 10.8 Add subscription leak, repeated navigation, and idle CPU/network tests | Done | 2026-08-27 | Added sync teardown behavior, development subscription registration/unregistration, no-idle-polling source guard, and focused tests for subscription lifecycle/backpressure/visibility behavior | Focused web Phase 10 tests pass 23/23; web check and FluxIQ check pass | Phase 11.1 |
| 11.1 Implement inventory and verified backup manifests | Done | 2026-08-27 | Added legacy project inventory and verified backup manifest generation with resource classification, file counts, byte totals, SHA-256 file digests, manifest digesting, and changed/missing file verification | Focused Phase 11 storage tests pass; backup verification detects modified legacy files | Phase 11.2 |
| 11.2 Implement resumable importers for every legacy resource | Done | 2026-08-27 | Added SQL-backed `legacy_resource_imports` progress records and resumable importer batches for every declared legacy resource kind with cursor, imported/skipped counts, failure state, and idempotent resume | Focused tests prove importer resumes from saved cursor and does not reprocess completed items | Phase 11.3 |
| 11.3 Implement graph split, stream chunking, and object-reference migration | Done | 2026-08-27 | Added ordered migration orchestration that defaults legacy Flow documents into SQL graph revisions, JSONL runtime/recording streams into immutable event chunks, and `indexes/objects.json` into SQL object/reference rows | Focused tests verify graph revision rows, runtime chunk rows, recording chunk rows, and object reference imports are created | Phase 11.4 |
| 11.4 Implement count/digest/reference/semantic verification reports | Done | 2026-08-27 | Added v2 migration verification reports with SQL table counts, legacy/v2 count mismatch detection, dangling object/chunk/edge reference checks, stream overlap checks, duplicate Flow semantic checks, and deterministic report digests | Focused tests cover count mismatch reporting and clean reference/semantic report generation | Phase 11.5 |
| 11.5 Add hybrid-read comparison diagnostics without dual-write | Done | 2026-08-27 | Added hybrid legacy/v2 read comparison helper that hashes stable read results, reports digest mismatches, and verifies read-only behavior by checking mutation/change/migration counters before and after comparison | Focused tests prove matching reads compare cleanly and mismatches produce diagnostics without dual-write | Phase 11.6 |
| 11.6 Enable v2 for new projects behind a feature flag | Done | 2026-08-27 | Added SQL-backed `migration_cutover_state` and `automation_studio_v2_storage` feature resolution for new-project-only enablement | Focused tests prove enabled state applies to new projects but not existing projects | Phase 11.7 |
| 11.7 Migrate fixture and representative real projects | Done | 2026-08-27 | Added representative legacy fixture coverage spanning project catalog, hierarchy, Flow document, runtime JSONL, recording JSONL, instructions, subflows, and object index resources | Focused orchestration test migrates the fixture through the default Phase 11 path | Phase 11.8 |
| 11.8 Soak, measure, and fix mismatches | Done | 2026-08-27 | Added verification and hybrid-read diagnostics designed for soak mismatch detection, including persisted manifests and deterministic digest outputs for repeated comparison | Focused tests validate mismatch surfacing; full long soak remains Phase 12 certification work | Phase 11.9 |
| 11.9 Make v2 default and retain explicit rollback | Done | 2026-08-27 | Added cutover helpers for enabling v2, making v2 the default, recording previous state, and rolling back to legacy compatibility with reason/timestamp persistence | Focused tests prove default cutover and rollback resolution behavior | Phase 11.10 |
| 11.10 Remove browser access to legacy broad endpoints | Done | 2026-08-27 | Added browser request-policy guard blocking `snapshot`, full Flow document read/write, project artifact list, whole hierarchy save, and repair endpoints from the web program API during v2 cutover; storage keeps the retired repair endpoint literal local to avoid API runtime imports from migration code | Focused web tests prove blocked legacy endpoints throw and bounded graph/run endpoints remain allowed; supervisor root-test repair removed the storage-to-API dist dependency | Phase 11.11 |
| 11.11 Retire read-time repair and active JSON indexes | Done | 2026-08-27 | Added retired active JSON index inventory and read-time repair guard so repair endpoints are treated as explicit migration jobs, not ordinary user reads | Focused tests cover retired `indexes/*.json` declarations and `repair-recording-state-index` rejection | Phase 11.12 |
| 11.12 Document backup retention and final legacy cleanup | Done | 2026-08-27 | Updated the legacy retirement runbook with Phase 11 verified backup manifests, re-verification before rollback, retention rules, and final physical cleanup prerequisites; root-suite supervisor pass hardened long-running integration test timeouts and fixed Flow save timestamp monotonicity | `pnpm docs:check` passes with regenerated framework references current; focused service/retention/global suite passes 90/90 and final root suite passes web 321/321, gateway 3/3, FluxIQ 457/457 | Phase 12.1 |
| 12.1 Run and publish the full scale matrix and hardware/configuration | Done | 2026-08-27 | Added certification report schema, CLI output, target manifest digest, hardware/config capture, and smoke/baseline/target matrix gate validation | Focused Phase 12 tests pass; CLI emits a blocked template until real matrix evidence is attached | Phase 12.2 |
| 12.2 Run 24-hour runtime/recording append and subscription soaks | Done | 2026-08-27 | Added explicit 24-hour soak evidence contract for runtime appends, recording appends, subscription duration, event counts, p95 append latency, reconnects, and dropped-event checks | Gate blocks certification until external 24-hour soak evidence is attached | Phase 12.3 |
| 12.3 Inject crashes during graph, stream, object, and migration writes | Done | 2026-08-27 | Added crash-injection evidence gates for graph-write, stream-write, object-write, and migration recovery, including integrity checks and orphaned mutable/staged artifact counts | Gate blocks certification unless every crash scenario recovers every attempt with clean integrity/orphan results | Phase 12.4 |
| 12.4 Run heap retention across 1,000 project/view switches | Done | 2026-08-27 | Added heap-retention gate for 1,000 switches with retained-heap, single-task, and long-task evidence | Gate enforces 32 MiB retained-heap and 1,000 ms single-task ceilings | Phase 12.5 |
| 12.5 Verify every critical query plan and payload budget | Done | 2026-08-27 | Added critical query/payload evidence gate requiring expected-index plan text, no full scans, elapsed budgets, and payload budgets | Focused tests prove full-scan and oversized-payload evidence blocks certification | Phase 12.6 |
| 12.6 Verify backup restore and deterministic compiled-plan replay | Done | 2026-08-27 | Added backup/replay evidence gate comparing source/restored project digests, compiled/replayed plan digests, and expected/replayed trace digests | Gate blocks certification on any restore, plan, or trace digest mismatch | Phase 12.7 |
| 12.7 Update authored architecture, operations, importing-repo, and generated docs | Done | 2026-08-27 | Added `docs/operations/automation-studio-scale-certification.md`, linked it from release/docs guidance, updated architecture/importer docs, and regenerated framework references | `pnpm docs:check` passes after reference regeneration | Phase 12.8 |
| 12.8 Remove feature flags only after every gate passes | Done | 2026-08-27 | Added feature-flag removal evidence gate and release-doc rule that scalable data-flow flags must remain until the certification report overall status is `passed` | CLI template and tests keep feature-flag removal blocked until every prior gate has passing evidence | Complete |
