# Automation Studio Data Flow Refactor Plan

## Purpose

Automation Studio's current data flow is too tangled. Project refresh, proposal
loading, recording hydration, object dereferencing, proposal validation, Flow
catalog resolution, and UI workspace state are crossing boundaries that should
be separate. The result is slow loading, confusing ownership, hard-to-predict
deletion behavior, and a storage model that is difficult to reason about.

This plan defines a complete refactor of Automation Studio data ownership,
storage, indexing, API read paths, deletion cascades, and UI loading rules.

The target direction is:

```text
.fluxiq project files are the source of truth for Automation Studio artifacts.
SQLite is not the ownership layer for Automation Studio recordings, proposals,
or Flows.
Runtime memory is a cache.
UI state is a projection.
```

This supersedes the Automation Studio portions of earlier SQLite-centered
storage plans. SQLite may still be appropriate for other global framework
services such as identity, background tasks, task queues, auth/session state,
or small framework indexes. Automation Studio user artifacts should be
inspectable and portable as project-owned files under `.fluxiq`.

No migration or backward-compatibility layer is required for this refactor.
Existing mixed-layout Automation Studio artifacts may be deleted, ignored, or
handled manually. New code should target the new file layout directly and
should not preserve old SQLite/path fallbacks.

## Current Problems

### Split Ownership

Automation Studio currently has multiple ownership paths:

- project and pipeline indexes under `.fluxiq`;
- recording/session folders under `.fluxiq`;
- object-store assets under `.fluxiq/artifacts/.../objects`;
- pipeline proposal documents under project files/object references;
- canonical repository implementations that can be SQLite-backed;
- runtime memory repositories used in tests and some non-persistent contexts.

The user-facing result is that it is not obvious where a Flow, proposal,
recording, or state snapshot actually lives.

### Expensive List Paths

Project refresh currently loads much more than the left hierarchy needs. A
typical refresh can request:

- recording summaries;
- normalized timelines;
- runtime sessions;
- full pipeline artifacts;
- legacy project artifacts;
- canonical Flow catalog;
- recording domains;
- native node definitions;
- published Flow nodes.

The sidebar should not need full proposal payloads, evidence artifacts,
state-action correlations, native node scans, or runtime history just to list
recordings, proposals, and Flows.

### Hydration Side Effects

Several read paths hydrate or validate data as a side effect:

- recording reads can hydrate state snapshot references;
- project artifact reads can dereference object-backed JSON;
- proposal listing previously revalidated recording Flow proposals;
- Flow listing can combine canonical and legacy sources and scan for
  invalidated proposal warnings.

Hydration and validation should happen only when the caller asks for the full
document or a health check.

### Deletion Is Too Expensive And Too Fragile

Deletes currently rely on a mix of indexes, artifact scans, object reference
collection, and pruning. That causes:

- slow recording deletion;
- leftover images, JSON, and derived artifacts;
- tabs staying open for deleted objects unless the UI manually cleans them;
- repeated repair logic where ordinary deletion should be deterministic.

### UI State Loads Data Too Broadly

The UI often treats project refresh as "load everything". This makes a single
existing project feel slow when it has large recordings or many state objects.

The UI needs strict rules:

- project open loads summaries;
- tab open loads the full document for that tab;
- state view lazily dereferences state snapshots and images;
- validation and repair are explicit jobs.

## Target Principles

1. **Project files own Automation Studio data.**
   Recordings, proposals, Flows, runtime runs, state snapshots, and generated
   source are project-owned documents under `.fluxiq`.

2. **Indexes are summaries, not sources of hidden payload truth.**
   Index files contain enough data for fast lists and navigation. They do not
   contain full recordings, proposal graphs, evidence payloads, or snapshots.

3. **Every artifact has one canonical path.**
   Compatibility readers can exist during migration, but new writes must go to
   the new project-file layout only.

4. **Summary reads and full reads are separate APIs.**
   Sidebar/list endpoints must not hydrate full artifacts.

5. **Hydration is explicit.**
   Object references, state snapshot refs, screenshot image refs, proposal
   health checks, and Flow dependency checks are loaded only when requested.

6. **Validation is not listing.**
   Project refresh should not mutate proposal status or scan current native
   mapper/output availability. Validation is a separate operation.

7. **Deletion is a first-class cascade.**
   Deleting a recording, proposal, Flow, or project should deterministically
   close related UI tabs, remove owned files, update indexes, and prune
   unreferenced objects.

8. **Runtime memory is a cache.**
   Services may cache loaded documents, but reload from disk must reproduce
   the same state without SQLite-backed Automation Studio repositories.

9. **Repair tools are exceptional.**
   Normal operations should not rely on orphan repair. Repair should fix
   interrupted writes, legacy leftovers, or manual filesystem edits.

10. **The data model should be inspectable by a human.**
    A developer should be able to open `.fluxiq`, find the project, inspect a
    recording/proposal/Flow, and understand its lineage.

## Artifact Ownership Matrix

| Artifact | Source of truth | Summary index | Full document | Notes |
| --- | --- | --- | --- | --- |
| Project | `.fluxiq/artifacts/automation-studio/projects/<projectId>/project.json` | root project index | `project.json` | Contains project metadata, scope, domain, timestamps. |
| Project hierarchy/workspace prefs | project folder | `workspace/index.json` or `hierarchy.json` | `workspace/*.json` | UI layout and custom hierarchy are projections, not artifact truth. |
| Recording | project folder | `indexes/recordings.json` | `recordings/<recordingId>/recording.json` | Metadata only; timeline is separate. |
| Recording timeline | recording folder | recording summary counts | `recordings/<recordingId>/timeline.jsonl` or chunked JSON | Append-friendly and readable. |
| State snapshot | recording folder or objects | snapshot index | snapshot JSON object/ref | Full snapshot is lazy-loaded for State View. |
| State visual asset/image | recording object folder | object index | content-addressed file | Recording-owned unless explicitly shared. |
| Proposal | project folder, grouped by recording | `indexes/proposals.json` | `proposals/<recordingId>/<proposalId>/proposal.json` | Multiple proposals per recording. |
| Proposal generation input | proposal folder | proposal summary | `generation.json` | Stores instructions, mode, options, model info. |
| Evidence/mining artifacts | recording derived folder | recording derived index | `recordings/<recordingId>/derived/evidence/...` | Loaded only by proposal/state/evidence views. |
| Flow | project folder | `indexes/flows.json` | `flows/<flowId>/flow.json` | Canonical executable user artifact. |
| Flow generated source | flow folder | flow summary | `flows/<flowId>/source/...` | Generated or code-owned source. |
| Flow publication | flow folder | flow summary/publication index | `flows/<flowId>/publications/<version>.json` | Immutable publication snapshots. |
| Runtime run | project runtime folder | `indexes/runtime.json` | `runtime/runs/<runId>/run.json` | May be pruned/exported. |
| Native/importer node manifest snapshot | project or domain source root | node index | manifest snapshot | Runtime registration remains importer-owned. |
| Object asset | recording/proposal/project object folder | `indexes/objects.json` | content-addressed file | Reference counted by indexes and documents. |

## Target Folder Layout

Canonical Automation Studio project layout:

```text
.fluxiq/
  config.json
  artifacts/
    automation-studio/
      index.json
      projects/
        <projectId>/
          project.json
          hierarchy.json
          workspace.json

          indexes/
            recordings.json
            proposals.json
            flows.json
            runtime.json
            objects.json
            pipeline.json

          recordings/
            <recordingId>/
              recording.json
              timeline.jsonl
              snapshots/
                index.json
                <snapshotId>.json
              objects/
                <sha256>.<ext>
              derived/
                index.json
                normalization/
                evidence/
                state-correlations/

          proposals/
            <recordingId>/
              <proposalId>/
                proposal.json
                generation.json
                review.json
                objects/

          flows/
            <flowId>/
              flow.json
              source/
                <module>.flow.ts
              publications/
                <version>.json
              config.json

          runtime/
            runs/
              <runId>/
                run.json
                trace.json

          objects/
            shared/
              <sha256>.<ext>
```

All Automation Studio artifact reads and writes should use this layout after
the refactor. Do not add compatibility reads for the old mixed storage model.

## Index Contracts

Indexes are optimized for list/navigation. They should be small and stable.

### Project Index

```ts
type AutomationStudioRootIndex = {
  schemaVersion: "0.1";
  projects: Array<{
    projectId: string;
    name: string;
    description?: string;
    domainId?: string | null;
    categoryId?: string | null;
    createdAt: number;
    updatedAt: number;
    counts: {
      recordings: number;
      proposals: number;
      flows: number;
    };
  }>;
};
```

### Recording Summary Index

```ts
type RecordingSummaryIndex = {
  schemaVersion: "0.1";
  recordings: Array<{
    recordingId: string;
    name?: string;
    taskId?: string;
    domainId?: string | null;
    status: "recording" | "completed" | "failed";
    startedAt: number;
    endedAt?: number;
    updatedAt: number;
    eventCount: number;
    actionCount: number;
    stateSnapshotCount: number;
    proposalCount: number;
    thumbnailRef?: string;
  }>;
};
```

### Proposal Summary Index

```ts
type ProposalSummaryIndex = {
  schemaVersion: "0.1";
  proposals: Array<{
    proposalId: string;
    recordingId: string;
    name?: string;
    kind: "policy" | "recording_flow" | "llm_assisted" | "direct";
    status: "draft" | "generated" | "approved" | "rejected" | "invalidated" | "failed";
    generatedAt: number;
    updatedAt: number;
    nodeCount: number;
    issueCount: number;
    mode?: "direct" | "llm_assisted";
    sourceDigest?: string;
    lastValidatedAt?: number;
  }>;
};
```

### Flow Summary Index

```ts
type FlowSummaryIndex = {
  schemaVersion: "0.1";
  flows: Array<{
    flowId: string;
    name: string;
    description?: string;
    scope: { kind: "global" } | { kind: "domain"; domainId: string };
    sourceMode: "visual" | "code";
    publicationStatus: "draft" | "published" | "deprecated";
    version?: string;
    nodeCount: number;
    edgeCount: number;
    updatedAt: number;
    recordingProposalIds?: string[];
  }>;
};
```

### Object Index

```ts
type ObjectIndex = {
  schemaVersion: "0.1";
  objects: Array<{
    sha256: string;
    mediaType: string;
    size: number;
    owner:
      | { kind: "recording"; recordingId: string }
      | { kind: "proposal"; recordingId: string; proposalId: string }
      | { kind: "project" }
      | { kind: "shared" };
    relativePath: string;
    createdAt: number;
    refCount?: number;
  }>;
};
```

## Store And Service Boundaries

### Store Layer

Stores only read and write files/indexes. They should not validate domain
runtime availability, generate proposals, execute Flows, or mutate unrelated
artifacts.

Required stores:

- `AutomationProjectStore`
- `RecordingStore`
- `StateSnapshotStore`
- `ProposalStore`
- `FlowStore`
- `PublicationStore`
- `RuntimeRunStore`
- `AutomationObjectStore`
- `WorkspacePrefsStore`

Each store should support:

```ts
listSummaries(projectId): Promise<Summary[]>;
get(projectId, id): Promise<Document>;
put(projectId, document): Promise<Document>;
delete(projectId, id): Promise<DeleteResult>;
repairIndex(projectId): Promise<RepairResult>;
```

### Workflow Service Layer

Workflow services coordinate multiple stores.

Required services:

- `RecordingPipelineService`
- `ProposalGenerationService`
- `ProposalReviewService`
- `FlowApprovalService`
- `FlowPublicationService`
- `StateViewService`
- `DeletionCascadeService`
- `ProjectRepairService`

Workflow services own business logic:

- generating proposals;
- validating proposals;
- approving proposals into Flows;
- publishing Flows;
- correlating state snapshots to actions;
- deleting related artifacts;
- rebuilding indexes;
- pruning objects.

### API Layer

API handlers should be thin:

- parse request payload;
- authorize;
- call one store/service method;
- return typed response.

They should not contain storage path logic or data hydration logic.

## API Read Contracts

### Project Open

Project open should call a single lightweight endpoint:

```text
get-project-workspace-summary
```

Returns:

```ts
type ProjectWorkspaceSummary = {
  project: ProjectSummary;
  hierarchy: AutomationStudioProjectHierarchy;
  recordings: RecordingSummary[];
  proposals: ProposalSummary[];
  flows: FlowSummary[];
  runtime: RuntimeRunSummary[];
  domains: RecordingDomainSummary[];
};
```

Not returned:

- full recording timelines;
- full state snapshots;
- image bytes;
- full evidence/mining artifacts;
- full proposal graph payloads unless the active tab already needs them;
- native node definitions unless the Flow editor is opened;
- full runtime traces.

### Full Document Endpoints

```text
get-recording
get-recording-timeline
get-state-snapshot
get-proposal
get-flow
get-runtime-run
```

These load only the requested document.

### Summary Endpoints

```text
list-recording-summaries
list-proposal-summaries
list-flow-summaries
list-runtime-run-summaries
```

These read indexes only.

### Explicit Validation Endpoints

```text
validate-proposal
validate-flow
validate-project
repair-project-indexes
prune-project-objects
```

These may scan or mutate status fields, but they should never be implicit in a
normal list/read endpoint.

## UI Loading Rules

### On Project Open

Allowed:

- project summary;
- hierarchy/workspace prefs;
- recording summaries;
- proposal summaries;
- flow summaries;
- active recording domain summaries;
- minimal runtime summaries.

Forbidden:

- hydrating all recordings;
- reading full timelines;
- reading all pipeline artifacts;
- reading all state snapshots;
- dereferencing image/object assets;
- proposal revalidation;
- Flow dependency scans;
- native node scans unless the active view is the Flow editor.

### On Recording Tab Open

Load:

- recording metadata;
- timeline page/chunk;
- note/marker summaries;
- associated proposal summaries.

Lazy-load:

- state snapshot document;
- screenshot image;
- full derived evidence artifacts.

### On Proposal Tab Open

Load:

- proposal document;
- source recording summary;
- proposal review state.

Lazy-load:

- evidence/mining artifacts;
- state snapshots;
- object assets.

### On Flow Editor Open

Load:

- Flow document;
- native node definitions for the Flow's scope;
- recording-derived node definitions referenced by the Flow.

Lazy-load:

- publication history details;
- dependency graph;
- runtime traces.

### On State View Open

Load:

- requested state source;
- nearest action-adjacent snapshot when opened from an action node;
- selected screenshot/object asset only when visual view renders.

Do not load every snapshot for the recording.

## Pipeline Model

Pipeline stages should be explicit artifacts with parent references.

```text
Recording
  -> Normalized Timeline
  -> Evidence Model
  -> Proposal Attempt
  -> Reviewed Proposal
  -> Flow
  -> Runtime Run
```

Each derived artifact should include:

```ts
type DerivedArtifactProvenance = {
  projectId: string;
  recordingId?: string;
  sourceArtifactIds: string[];
  sourceDigests: string[];
  generatedAt: number;
  generatedBy: string;
  inputs?: Record<string, unknown>;
};
```

Rules:

- Raw recordings are immutable except for notes/markers/finalization metadata.
- Generated proposals do not mutate recordings.
- Proposal review state does not mutate generated proposal source data until
  saved as a new review revision.
- Approving a proposal creates or updates a Flow with explicit provenance.
- Runtime training/feedback creates runtime or training artifacts; it does not
  silently rewrite a Flow.

## State Snapshot And Object Rules

State snapshots and visual assets are related but separate.

Snapshot document:

- facts/state values;
- visual frame metadata;
- image/object refs;
- coordinate spaces;
- action/snapshot correlation IDs.

Image/object asset:

- immutable content-addressed file;
- media type;
- owner;
- indexed reference.

Rules:

- full snapshots should not be stored inline in timelines;
- timeline entries should reference snapshots by ID/ref;
- screenshots should be recording-owned unless generated by proposal/Flow work;
- deleting a recording deletes recording-owned snapshots and objects;
- shared objects are pruned only when unreferenced.

## Deletion Cascades

Deletion must be deterministic and centralized in `DeletionCascadeService`.

### Delete Recording

1. Close all recording tabs for the recording.
2. Close all proposal tabs derived from the recording.
3. Close all state tabs whose source is from the recording.
4. Remove recording summary index entry.
5. Delete recording folder.
6. Delete recording-owned proposals if stored under project proposal root.
7. Delete recording-owned derived evidence/normalization/correlation artifacts.
8. Delete recording-owned objects.
9. Remove proposal index entries for the recording.
10. Remove object index entries for deleted files.
11. Prune shared objects that are no longer referenced.
12. Refresh hierarchy from summaries.

### Delete Proposal

1. Close the proposal tab.
2. Close state tabs sourced from the proposal.
3. Delete proposal folder.
4. Remove proposal summary index entry.
5. Delete proposal-owned generated objects.
6. Remove proposal references from recording summary.
7. Prune unreferenced shared objects.

### Delete Flow

1. Close Flow editor tab.
2. Close runtime/state tabs tied only to that Flow.
3. Delete Flow folder.
4. Remove Flow summary index entry.
5. Delete generated source/config under the Flow folder.
6. Keep external source files only if explicitly importer-owned.
7. Prune Flow-owned objects.

### Delete Project

1. Close all project tabs/windows.
2. Delete project folder.
3. Remove project root index entry.
4. Remove project object refs.
5. Preserve migration backups unless the delete request explicitly includes
   backups.

## Cutover Plan

This refactor intentionally does not migrate old Automation Studio data. The
cutover is:

1. Implement the new file-backed stores and endpoints.
2. Stop wiring Automation Studio to SQLite-backed canonical repositories.
3. Stop reading old proposal, recording, Flow, and pipeline locations.
4. Start new projects/recordings/proposals/Flows in the new layout.
5. Remove obsolete old-layout code once the new path is green.

Existing local `.fluxiq` Automation Studio data can be cleared manually when
the new storage path is ready. Repair tools should target the new layout only.

## Implementation Phases

### Phase 1: Specs And Types

- Define storage layout constants.
- Define summary/full document types.
- Define index document types.
- Define object ownership types.
- Add path helper tests.
- Document current-vs-target ownership.

Exit criteria:

- no runtime behavior change;
- docs and types compile;
- storage paths are deterministic and tested.

### Phase 2: Fast Project Read Path

- Add `get-project-workspace-summary`.
- Add `list-recording-summaries`.
- Add `list-proposal-summaries`.
- Add `list-flow-summaries`.
- Make project open/sidebar use summaries only.
- Stop project refresh from calling full `list-pipeline-artifacts`.
- Keep old endpoints for tab/detail views.

Exit criteria:

- opening a project does not hydrate full recordings/proposals/evidence;
- sidebar data loads from indexes;
- existing proposal/recording/Flow tabs still open full documents on demand.

### Phase 3: File-Backed Proposal Store

- Introduce `ProposalStore`.
- Store all new proposals at
  `proposals/<recordingId>/<proposalId>/proposal.json`.
- Maintain `indexes/proposals.json`.
- Move generation input/review state into the proposal folder.
- Read old proposal paths only through compatibility.

Exit criteria:

- multiple proposals per recording survive restart;
- proposal list is index-only;
- deleting proposal removes folder and index entry.

### Phase 4: File-Backed Recording Store

- Introduce `RecordingStore`.
- Store recording metadata separately from timeline.
- Write timeline append-friendly file/chunks.
- Store snapshot refs, not full snapshots, in timeline entries.
- Maintain `indexes/recordings.json`.
- Keep `get-recording` and timeline loading lazy.

Exit criteria:

- stopping recording does not require full state hydration;
- recording summaries survive restart without SQLite;
- state view can open snapshots by ref.

### Phase 5: File-Backed Flow Store

- Introduce `FlowStore`.
- Store canonical Flows at `flows/<flowId>/flow.json`.
- Store generated/code source under the Flow folder unless explicitly
  importer-owned.
- Store publications under `flows/<flowId>/publications`.
- Maintain `indexes/flows.json`.
- Replace Automation Studio SQLite canonical Flow repository usage.

Exit criteria:

- creating/saving/deleting Flows uses project files;
- Flow list is index-only;
- published Flow snapshots survive restart;
- runtime execution resolves file-backed Flows.

### Phase 6: Object Ownership And Pruning

- Introduce project `ObjectIndex`.
- Tag objects by owner.
- Update state asset upload to write recording-owned objects when recording ID
  is known.
- Update snapshot JSON object writes to use recording ownership.
- Add `prune-project-objects`.

Exit criteria:

- deleting a recording removes recording-owned screenshots/snapshots;
- shared objects remain only when referenced;
- no broad recursive scan is needed for ordinary deletion.

### Phase 7: Central Deletion Cascade

- Implement `DeletionCascadeService`.
- Route recording/proposal/Flow/project delete endpoints through it.
- Return closed-tab/affected-artifact metadata to the UI.
- Make UI close related tabs/windows from the delete result.

Exit criteria:

- delete recording removes all related proposal/state tabs and files;
- delete proposal removes proposal tab and files;
- delete Flow removes Flow tab and files;
- no leftover recording-owned images/artifacts after normal deletes.

### Phase 8: Explicit Validation And Repair

- Add `validate-proposal`.
- Add `validate-flow`.
- Add `validate-project`.
- Add `repair-project-indexes`.
- Add `prune-project-objects`.
- Show health status from summaries.

Exit criteria:

- normal list endpoints do not mutate validation state;
- explicit validation updates status/lastValidatedAt;
- repair can rebuild indexes from files.

### Phase 9: Remove Old Paths

- Remove Automation Studio SQLite repository wiring.
- Remove old shared proposal layout writes.
- Remove list-time full pipeline hydration from UI refresh.
- Remove redundant repository caches that hide file truth.
- Update docs to remove old SQLite ownership language.

Exit criteria:

- Automation Studio user artifacts are project-file owned;
- SQLite is not required to load recordings, proposals, or Flows;
- authored docs match implementation.

## Test Plan

### Storage Tests

- path helpers produce stable project-relative paths;
- summary indexes round-trip;
- full documents round-trip;
- object index references real files;
- index repair rebuilds summaries from artifact files.

### API Tests

- project workspace summary does not hydrate full artifacts;
- proposal summaries do not read full evidence/mining artifacts;
- Flow summaries do not read full publication/dependency data;
- full get endpoints load only the requested document;
- validation endpoints update health status explicitly.

### UI Model Tests

- sidebar builds from summaries;
- opening a proposal tab loads the proposal;
- opening state view loads one state source;
- deleted artifacts remove related hierarchy nodes;
- deleted artifacts close related tabs.

### Deletion Tests

- delete recording removes proposal folders, derived artifacts, snapshots, and
  recording-owned objects;
- delete proposal removes proposal folder and proposal-owned objects;
- delete Flow removes Flow folder and generated source/config;
- interrupted delete can be repaired.

### Performance Tests

- project summary load time scales with index size, not artifact size;
- opening project with large screenshots does not read image bytes;
- opening project with many state snapshots does not parse every snapshot;
- proposal list avoids mapper/Flow validation scans.

## Decisions To Lock

1. Automation Studio recordings, proposals, and Flows are project-file owned.
2. SQLite-backed Automation Studio canonical repositories are compatibility
   only during migration and should be removed from the active web runtime.
3. Project open loads summaries only.
4. Validation and repair are explicit operations.
5. Deletion cascades are centralized.
6. Object ownership is indexed and deterministic.
7. Runtime memory caches must not become a hidden source of truth.

## Open Questions

- Should recording timelines be a single `timeline.jsonl` file or chunked by
  sequence/time once they exceed a threshold?
- Should state snapshots live as named JSON files under `snapshots/` or as
  content-addressed objects with a snapshot index?
- Should published Flow snapshots be immutable files only, or also exported to
  a package cache?
- Should project summary endpoint include native node summary counts, or should
  native node discovery remain strictly editor-scoped?

## Immediate Next Steps

1. Implement summary contracts and path helpers.
2. Add `get-project-workspace-summary`.
3. Move sidebar refresh to summary endpoints.
4. Implement file-backed `ProposalStore`.
5. Implement file-backed `RecordingStore`.
6. Implement file-backed `FlowStore`.
7. Remove old Automation Studio SQLite/path fallback wiring.

## Implementation Log

This section is updated as implementation steps complete.

| Step | Status | Completed | Notes | Remaining |
| --- | --- | --- | --- | --- |
| Status ledger | Done | 2026-08-16 | Added this implementation log so the working doc tracks execution, not just intent. | Continue with contracts/path helpers. |
| No migration/backcompat scope | Done | 2026-08-16 | Clarified the refactor is a hard cutover. Old SQLite/path compatibility and migration work are out of scope. | Continue with new-layout contracts and stores only. |
| Summary contracts and path helpers | Done | 2026-08-16 | Added `storage/file-store.ts` with new-layout summary/index/object contracts and canonical project-owned path helpers. Added focused tests and exported the module. | Implement the workspace summary endpoint against these contracts. |
| Project workspace summary endpoint | Done | 2026-08-16 | Added `get-project-workspace-summary`, service assembly for lightweight project/recording/proposal/Flow/runtime summaries, API handler, and tests. Listing does not hydrate full pipeline artifacts or revalidate proposals. | Move the web project/sidebar refresh path to this endpoint. |
| Sidebar summary seed | Done | 2026-08-16 | Web project refresh now calls `get-project-workspace-summary` and immediately seeds recording, proposal, Flow, and runtime sidebar state with lightweight stubs. Full detail refresh remains temporary until file-backed stores replace the old paths. | Implement file-backed proposal storage and then remove the full pipeline refresh dependency. |
| File-backed proposal path | Done | 2026-08-16 | Policy and recording-flow proposal documents now write/read/delete from `projects/<projectId>/proposals/<recordingId>/<proposalId>/proposal.json`; old recording-derived proposal fallback was removed. Recording deletion removes the per-recording proposal folder. | Split this path behind a dedicated `ProposalStore` class when pipeline cleanup begins. |
| File-backed RecordingStore cutover | Done | 2026-08-16 | Recording summaries now use `indexes/recordings.json`; recording documents now write under `recordings/<recordingId>/recording.json` with append-updated `timeline.jsonl`; object-store mode no longer skips project recording file writes/loads. Tests now enforce the new layout. | Implement file-backed Flow storage and remove SQLite ownership for Automation Studio Flows. |
| File-backed FlowStore cutover | Done | 2026-08-16 | Canonical Flows now save/load/delete through `flows/<flowId>/flow.json` and `indexes/flows.json`; Flow source files now live under `flows/<flowId>/source/`; runtime execution resolves canonical Flows through file-backed `getFlow()`. | Add object ownership indexes and tighten deletion cascades around project-owned objects. |
| Object ownership index cutover | Done | 2026-08-16 | Object storage now indexes ownership at `indexes/objects.json` with structured summaries and writes recording-owned assets under `recordings/<recordingId>/objects/`; compact object references remain stable for hydration/content refs. | Centralize recording/proposal/Flow deletion cascades so indexes, tabs, and folders stay aligned. |
| Deletion cascade cleanup | Done | 2026-08-16 | Recording deletion now returns server-owned related proposal IDs for workspace cleanup; Flow deletion removes file-backed Flow folders/index entries and closes Flow tabs through the shared deleted-view helper. | Remove Automation Studio SQLite active ownership wiring and update authored docs. |
| SQLite ownership wiring removal | Done | 2026-08-16 | Shared runtime construction no longer injects Automation Studio SQLite repositories; canonical Flow tests now validate project-file persistence/reload with the default service. SQLite-backed global services remain unchanged. | Run final validation and update authored architecture docs to describe the hard-cutover layout. |
| Final validation and docs | Done | 2026-08-16 | Updated authored persistence/architecture docs and regenerated framework reference. Validation passed for focused core tests, core typecheck, web typecheck, and docs check. | Broader package build can be run before release packaging. |
