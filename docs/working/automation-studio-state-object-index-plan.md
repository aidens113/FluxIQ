# Automation Studio State Object Index Plan

## Purpose

Automation Studio needs a deterministic object/index system for recordings,
state snapshots, screenshots, proposals, and Flow provenance. The current model
still lets too many UI paths rediscover relationships by scanning timelines,
guessing adjacent timestamps, hydrating full recordings, or interpreting mixed
evidence arrays. That causes slow loads, stale UI state, orphaned files, and
wrong State View targets.

This plan defines the missing ownership layer:

```text
recording action -> explicit state link -> state snapshot object -> visual assets
proposal node -> explicit action link -> explicit state link
State View -> opens exact state object by id/ref, never guesses
```

No backward compatibility is required. New recordings/proposals should use this
layout and contract directly. Existing broken artifacts can be deleted and
recreated.

## Core Requirements

1. Opening state for a recording timeline entry or proposal node must resolve
   to one explicit `stateSnapshotId` or fail with a clear missing-link message.
2. Sidebar/project load must use summary indexes only.
3. Proposal load must not hydrate full recording timelines unless the proposal
   view explicitly asks for source context.
4. State View must not scan an entire recording to find a snapshot.
5. State screenshots and JSON snapshots must be object-store documents linked
   by indexes, not embedded in every timeline/proposal payload.
6. Deletes must remove all owned files by walking indexes, not by recursive
   best-effort scans.
7. Every cross-artifact link must include owner ids and stable target ids.

## New Canonical Concepts

### Recording Index

Path:

```text
projects/<projectId>/recordings/<recordingId>/index.json
```

Purpose: lightweight recording-local navigation.

Shape:

```ts
interface RecordingIndex {
  schemaVersion: "0.2";
  projectId: string;
  recordingId: string;

  summary: {
    name?: string;
    startedAt: number;
    endedAt?: number;
    eventCount: number;
    actionCount: number;
    stateSnapshotCount: number;
    proposalCount: number;
    updatedAt: number;
  };

  timeline: {
    timelineRef: string; // recording-local timeline.jsonl
    firstEntryId?: string;
    lastEntryId?: string;
  };

  entries: Record<string, RecordingEntryIndexItem>;
  actions: Record<string, RecordingActionIndexItem>;
  states: Record<string, RecordingStateIndexItem>;
  proposals: Record<string, RecordingProposalIndexItem>;
}
```

### Entry Index Item

```ts
interface RecordingEntryIndexItem {
  entryId: string;
  type: string;
  timestamp?: number;
  startedAt?: number;
  completedAt?: number;
  monotonicOffsetMs?: number;
  sequence?: number;
  stateSnapshotId?: string;
  actionId?: string;
  objectRefs?: string[];
}
```

Rules:

- For a state snapshot entry, `stateSnapshotId` points to itself or to the
  linked snapshot object.
- For an action entry, `stateSnapshotId` points to the corresponding state
  snapshot chosen at recording time or finalization time.
- UI state opening uses this index field first.
- If `stateSnapshotId` is missing, the UI shows "No state linked for this
  entry" and offers a repair action. It must not silently open a different
  snapshot.

### Action Index Item

```ts
interface RecordingActionIndexItem {
  actionId: string;
  entryId: string;
  actionType: string;
  outputId?: string;
  startedAt?: number;
  completedAt?: number;
  stateBeforeId?: string;
  stateAtActionId?: string;
  stateAfterId?: string;
  sourceObjectRefs?: string[];
}
```

Rules:

- `stateAtActionId` is the primary "Open State" target.
- `stateBeforeId` and `stateAfterId` are optional and can power before/after
  views later.
- Proposal generation uses `actionId`/`entryId` as the action identity and
  `stateAtActionId` as the state context.

### State Snapshot Index Item

```ts
interface RecordingStateIndexItem {
  stateSnapshotId: string;
  entryId: string;
  timestamp: number;
  monotonicOffsetMs?: number;
  stateRef: string; // object ref for StateSnapshot JSON
  screenshotRef?: string; // object ref for image
  visualFrameId?: string;
  coordinateSpace?: {
    width: number;
    height: number;
    unit: "px";
    origin: "top-left";
  };
  objectRefs: string[];
  linkedActionIds: string[];
}
```

Rules:

- The state JSON object and screenshot object are separate refs.
- The state index owns lookup. State View should dereference only the selected
  `stateRef` and image refs.
- Multiple actions can point to the same state snapshot only if the index says
  so explicitly.

### Proposal Node State Link

Proposal candidates and policy nodes must carry explicit links:

```ts
interface ProposalNodeStateLink {
  recordingId: string;
  actionEntryId: string;
  actionId?: string;
  stateSnapshotId: string;
  stateRef: string;
  screenshotRef?: string;
}
```

Rules:

- Proposal generation copies the link from `RecordingActionIndexItem`.
- Proposal view opens state from `stateSnapshotId` or `stateRef`.
- Proposal view must not infer state from `sourceObservationIds`.
- Evidence arrays are explanatory/supporting context, not primary navigation.

## Canonical File Layout

```text
projects/<projectId>/
  indexes/
    recordings.json
    proposals.json
    flows.json
    objects.json

  recordings/<recordingId>/
    index.json
    recording.json
    timeline.jsonl
    states/
      index.json
    objects/
      <sha>.json
      <sha>.png
    derived/
      evidence/

  proposals/<recordingId>/<proposalId>/
    proposal.json
    index.json
    generation.json
    review.json
    objects/
```

`recordings/<recordingId>/states/index.json` can be split out if
`recording/index.json` becomes too large. The first implementation can keep
state entries in `recording/index.json` and extract later if needed.

## Required APIs

### `get-recording-summary`

Input:

```ts
{ projectId: string; recordingId: string }
```

Reads only `recording/index.json`.

### `get-recording-entry-state`

Input:

```ts
{
  projectId: string;
  recordingId: string;
  entryId?: string;
  actionId?: string;
  stateSnapshotId?: string;
}
```

Output:

```ts
{
  recordingId: string;
  requested: { entryId?: string; actionId?: string; stateSnapshotId?: string };
  resolved: {
    stateSnapshotId: string;
    entryId: string;
    stateRef: string;
    screenshotRef?: string;
  } | null;
  state?: StateSnapshot; // only when includeState=true
}
```

Rules:

- Resolve by `stateSnapshotId` first.
- Resolve by `actionId` through `actions[actionId].stateAtActionId`.
- Resolve by `entryId` through `entries[entryId].stateSnapshotId`.
- Do not scan timeline except in explicit repair mode.
- If no link exists, return `resolved: null` with a precise reason.

### `get-state-snapshot`

Input:

```ts
{
  projectId: string;
  recordingId: string;
  stateSnapshotId: string;
}
```

Reads `recording/index.json`, then dereferences `stateRef` and optional image
refs.

### `repair-recording-state-index`

Explicit maintenance endpoint, not a normal view path.

Input:

```ts
{
  projectId: string;
  recordingId: string;
  mode: "dry_run" | "write";
}
```

Behavior:

- Scans `timeline.jsonl`.
- Finds state snapshot entries.
- Links actions to exact/effective adjacent snapshots.
- Verifies referenced objects exist.
- Writes `recording/index.json` only in `write` mode.

This is allowed to be slower because it is exceptional.

## Recording Write Pipeline

### During Recording

1. Append timeline entry to `timeline.jsonl`.
2. If entry is `client.state_snapshot`:
   - store full StateSnapshot JSON object;
   - store screenshot/object refs if present;
   - add `RecordingStateIndexItem`;
   - add `RecordingEntryIndexItem.stateSnapshotId`.
3. If entry is action/domain event:
   - add `RecordingActionIndexItem`;
   - add `RecordingEntryIndexItem.actionId`;
   - if client supplied `stateSnapshotId` or correlation id, link immediately;
   - otherwise leave link missing until finalize/repair.

### On Finalize

1. Flush any pending state objects.
2. Run state-link finalization:
   - explicit valid client state links can be preserved only when the caller
     requests preservation;
   - otherwise closest capture/event timestamp wins;
   - prior/current snapshot wins over later snapshot only when the distance is
     tied;
   - never link across recordings.
3. Write `recording/index.json`.
4. Update `indexes/recordings.json` summary counts.

## Proposal Generation Pipeline

1. Load `recording/index.json`.
2. Stream mapper-visible timeline entries from `timeline.jsonl`.
3. For each action candidate:
   - resolve `actionEntryId` to the real indexed action entry, even when the
     mapper emitted the candidate from a supporting observation entry;
   - set `stateLink` from `entries[actionEntryId].stateSnapshotId`;
   - copy `stateSnapshotId`, `stateRef`, and `screenshotRef` into proposal
     node metadata.
4. Store support evidence separately.
5. Write `proposal/index.json` for quick proposal/node lookup.

Important rule: `sourceObservationIds` are provenance only. They can explain
which mapper observation, state fact, or domain event supported the candidate,
but they must not become the State View target unless that referenced entry is
also the resolved action entry. Otherwise many proposal nodes can accidentally
cluster around the same early state observation even though the recording index
contains distinct action-state links.

Proposal node metadata should include:

```ts
metadata: {
  recordingId: string;
  recordingProposalId: string;
  recordingCandidateId: string;
  actionEntryId: string;
  stateSnapshotId: string;
  stateRef: string;
  screenshotRef?: string;
  sourceObservationIds: string[];
  evidence: EvidenceReference[];
}
```

## State View Opening Rules

### From Timeline

```text
double-click timeline clip
  -> get-recording-entry-state(projectId, recordingId, entryId)
  -> open State View with resolved stateSnapshotId
```

No UI code should compute nearest snapshots.

### From Proposal Node

```text
Open Node State
  -> read node.metadata.stateSnapshotId
  -> get-state-snapshot(projectId, recordingId, stateSnapshotId)
  -> open State View with exact stateSnapshotId
```

If metadata is missing:

- show "This proposal node has no state link";
- offer "Repair recording state index";
- do not fall back to first state, first recording, or inferred evidence.

### From Flow Node

Flow nodes approved from recording proposals retain `stateSnapshotId` and
`stateRef` as provenance. Opening state uses those refs directly.

## UI Loading Rules

### Project Open

Load only:

- project summary;
- hierarchy;
- `indexes/recordings.json`;
- `indexes/proposals.json`;
- `indexes/flows.json`;
- active workspace layout.

Do not load:

- full recording timelines;
- full state snapshots;
- screenshots;
- evidence facts/correlations;
- proposal graphs unless the selected tab needs one.

### Timeline Tab Open

Load:

- `recording/index.json`;
- `timeline.jsonl` page or full timeline depending on size.

Do not hydrate state JSON/images.

### Proposal Tab Open

Load:

- `proposal.json`;
- `proposal/index.json`;
- source `recording/index.json` only if needed for state/provenance chips.

Do not load full recording timeline unless the user opens source timeline.

### State Tab Open

Load only:

- one `RecordingStateIndexItem`;
- one StateSnapshot JSON object;
- referenced image object(s).

## Deletion Rules

### Delete Recording

1. Read `recording/index.json`.
2. Collect:
   - recording object refs;
   - state object refs;
   - screenshot refs;
   - derived evidence refs;
   - proposal ids owned by recording.
3. Delete proposal folders for that recording.
4. Delete recording folder.
5. Remove index entries:
   - `indexes/recordings.json`;
   - `indexes/proposals.json`;
   - `indexes/objects.json`.
6. Close all tabs whose selection references:
   - recordingId;
   - proposalId owned by recording;
   - stateSnapshotId owned by recording;
   - timeline entry ids owned by recording.

### Delete Proposal

1. Read `proposal/index.json`.
2. Delete proposal-owned objects.
3. Delete proposal folder.
4. Remove `indexes/proposals.json` entry.
5. Close proposal/state tabs referencing proposal id.

### Object Pruning

Object deletion should be reference-counted through `indexes/objects.json`.
Recording-owned objects can be removed immediately when the recording is
deleted unless another index entry references the same sha.

## Data Integrity Rules

Every recording index write validates:

- every `entries[entryId].stateSnapshotId` exists in `states`;
- every `actions[actionId].entryId` exists in `entries`;
- every `actions[actionId].stateAtActionId` exists in `states` when present;
- every `states[stateSnapshotId].stateRef` exists in object index;
- screenshot refs exist if present;
- no cross-project refs;
- no proposal node state link points to a missing recording state.

Validation failures should block finalization/generation, not produce broken UI
artifacts.

## Performance Targets

| Operation | Target |
| --- | --- |
| Project open with one large recording | under 500ms after app/server warmup |
| Left sidebar render | index-only, no timeline hydration |
| Open timeline tab | under 1s for normal recordings; large timelines can page |
| Open proposal tab | under 500ms plus graph render |
| Open State View | one index read + one state object read + image request |
| Delete recording | proportional to indexed owned refs, not recursive filesystem scans |

## Implementation Steps

### Step 1: Define Contracts

Files:

- `packages/fluxiq/src/programs/automation-studio/storage/state-index.ts`
- `packages/fluxiq/src/programs/automation-studio/runtime/recording-flow-proposal.ts`

Deliverables:

- `RecordingIndex`
- `RecordingEntryIndexItem`
- `RecordingActionIndexItem`
- `RecordingStateIndexItem`
- `ProposalNodeStateLink`
- validators and test fixtures

Done when:

- TypeScript contracts compile.
- Unit tests reject missing state refs, cross-recording refs, and missing
  action links.

Status:

- Done on 2026-08-17.
- Added `RecordingIndex`, entry/action/state/proposal index item contracts, and
  `ProposalNodeStateLink`.
- Added validation for missing entry/action/state links, invalid object refs,
  cross-project object refs, and proposal/recording mismatches.
- Added deterministic sorting and object-ref collection helpers.
- Added `state-index.test.ts`.
- Validation run:
  - `pnpm --filter fluxiq test -- state-index.test.ts`
  - `pnpm --filter fluxiq check`

Next:

- Step 2 builds the recording-local index store around these contracts.

### Step 2: Build Recording State Index Store

Files:

- `storage/recording-index-store.ts`
- `storage/recording-index-store.test.ts`

Deliverables:

- read/write recording index;
- update entry/action/state/proposal summaries;
- atomic writes;
- validation before write.

Done when:

- Creating, updating, and deleting index entries is tested.
- Writes are deterministic and sorted.

Status:

- Done on 2026-08-17.
- Added `RecordingStateIndexStore` for
  `projects/<projectId>/recordings/<recordingId>/index.json`.
- Added validated read/write/update/delete operations with deterministic sort
  order and Windows-tolerant atomic replace behavior.
- Added per-recording write locks so concurrent append/finalize operations do
  not interleave index writes.
- Added `recordingIndexFile()` to canonical file-store paths.
- Added `recording-index-store.test.ts` and updated file-store path tests.
- Validation run:
  - `pnpm --filter fluxiq test -- state-index.test.ts recording-index-store.test.ts file-store.test.ts`
  - `pnpm --filter fluxiq check`

Next:

- Step 3 wires this store into recording append/finalize so new recordings
  write the index as timeline entries arrive.

### Step 3: Write Index During Recording Append

Files:

- `runtime/service.ts`
- client gateway bridge if needed

Deliverables:

- timeline append updates index incrementally;
- state snapshot append stores state object and index state item;
- action append stores action item;
- append does not hydrate full prior state objects.

Done when:

- Appending 100 state snapshots does not make action append wait on full
  hydration.
- Tests prove timeline and index stay consistent.

Status:

- Done on 2026-08-17.
- Preserved visual summary metadata while dehydrating state snapshots:
  `stateRef`, `screenshotRef`, `visualFrameId`, and coordinate space can now be
  indexed without hydrating the full state object.
- Added runtime writing of
  `projects/<projectId>/recordings/<recordingId>/index.json` after append and
  finalized/full recording writes.
- Added `buildRecordingStateIndex()` so stored timeline entries produce
  deterministic entry/action/state index items.
- Guarded against dangling links when an old or broken snapshot observation has
  no usable `stateRef`.
- Added a regression test proving two action entries link to two distinct
  state snapshot refs in the on-disk recording index.
- Validation run:
  - `pnpm --filter fluxiq test -- state-index.test.ts recording-index-store.test.ts service.test.ts`
  - `pnpm --filter fluxiq check`

Next:

- Step 4 extracts deterministic state linking into a dedicated linker so
  finalize/repair can relink actions intentionally and report ambiguity.

### Step 4: Finalize State Links

Files:

- `runtime/state-linker.ts`
- `runtime/state-linker.test.ts`

Deliverables:

- deterministic action-to-state linking;
- exact timestamp/correlation matching;
- nearest snapshot fallback only during finalization/repair;
- no UI-time nearest matching.

Done when:

- Known action/snapshot timelines produce exact expected `stateAtActionId`.
- Ambiguous cases produce warnings, not silent wrong links.

Status:

- Done on 2026-08-17.
- Added `runtime/state-linker.ts` with deterministic finalization of
  action-to-state links.
- Existing explicit valid links are preserved only when the caller opts into
  preservation; normal index rebuilds recompute the closest state so stale
  poisoned links do not survive forever.
- Missing links resolve by closest capture/event timestamp; prior/current state
  wins over later state only when the distance is tied.
- The linker clears/rebuilds `linkedActionIds` so reverse links stay in sync.
- Ambiguous same-timestamp state candidates produce warnings.
- `buildRecordingStateIndex()` now routes through the shared linker before
  writing the on-disk index.
- State snapshot dehydration now preserves `stateSnapshotTimestamp` in the
  lightweight timeline payload, and repair/open-state index refresh hydrates
  stored state objects so existing dehydrated recordings can recover the real
  capture timestamp.
- Added `state-linker.test.ts`.
- Validation run:
  - `pnpm --filter fluxiq test -- state-linker.test.ts state-index.test.ts recording-index-store.test.ts service.test.ts`
  - `pnpm --filter fluxiq check`
  - `pnpm --filter @fluxiq/web test -- AutomationStudioLive.test.ts ProposalView.test.ts StateView.test.tsx`
  - `pnpm --filter @fluxiq/web check`

Next:

- Step 5 exposes deterministic lookup/repair service methods and API commands
  so the web UI no longer scans recordings to open one state.

### Step 5: Add State Lookup APIs

Files:

- `api/contracts.ts`
- `api/handlers.ts`
- `runtime/service.ts`

Endpoints:

- `get-recording-entry-state`
- `get-state-snapshot`
- `repair-recording-state-index`

Done when:

- Timeline open state calls one deterministic endpoint.
- Missing link returns clear reason.
- State View no longer needs full recording to open one state.

Status:

- Done on 2026-08-17.
- Added service methods:
  - `getRecordingEntryState()`
  - `getStateSnapshot()`
  - `repairRecordingStateIndex()`
- Added API commands:
  - `get-recording-entry-state`
  - `get-state-snapshot`
  - `repair-recording-state-index`
- Normal lookup resolves in strict order: `stateSnapshotId`, then `actionId`,
  then `entryId`.
- Missing links return `resolved: null` plus a specific reason instead of
  falling back to another state.
- `includeState=true` dereferences only the selected state object.
- Repair is explicit and can run as `dry_run` or `write`.
- Added service regression coverage for exact state lookup and missing-entry
  behavior.
- Validation run:
  - `pnpm --filter fluxiq test -- state-linker.test.ts state-index.test.ts recording-index-store.test.ts service.test.ts`
  - `pnpm --filter fluxiq check`

Next:

- Step 6 refactors the web State View open paths to call these lookup APIs and
  stop computing nearest/first state locally.

### Step 6: Refactor State View Input

Files:

- `apps/web/src/features/automation-studio/views/StateView.tsx`
- `state/view-model.ts`
- `AutomationStudioLive.tsx`

Deliverables:

- State selection includes `stateSnapshotId`, `stateRef`, and `recordingId`.
- State View loads exact state snapshot by id/ref.
- Remove nearest-snapshot logic from the UI view model.
- Keep a small compatibility path only for tests until new endpoint is wired.

Done when:

- Proposal node and timeline clip open exact state id.
- State View cannot fall back to first source.
- Tests fail if a wrong state id is opened.

Status:

- Done on 2026-08-17 for the timeline/state-view input path.
- Added indexed state sources to the State View model input.
- `AutomationStudioLive.openStateView()` now calls:
  - `get-recording-entry-state` for timeline entry opens;
  - `get-state-snapshot` when an explicit `stateSnapshotId` is supplied.
- Resolved state snapshots are cached as exact observed State View sources with
  `stateSnapshotId` and `stateRef` metadata.
- Missing links now set a visible status message instead of opening a nearby
  or first state.
- State View no longer falls back to the first available source when an exact
  `sourceId`, `stateSnapshotId`, or `timelineEntryId` is requested but the
  indexed source is not loaded.
- Proposal node open-state requests no longer derive navigation targets from
  `sourceObservationIds` or evidence entry ids; those remain support context
  only.
- Bare node open requests now derive `stateSnapshotId`, `stateRef`,
  `recordingId`, and action/timeline entry ids from selected node metadata
  before calling Core lookup.
- Added detailed State View debugging:
  - browser console prefix: `[FluxIQ State Debug]`;
  - browser history buffer: `window.__fluxiqStateDebug`;
  - proposal node request creation logs compact node metadata and request;
  - State View open logs derived request, Core response, cached source, and
    final state selection;
  - State View model logs every available source, selected source, state ids,
    timestamps, and image refs;
  - Core logs lookup input, resolved index entry/action/state, object SHAs,
    screenshot SHAs, and hydrated state summary.
- Extended state selections with `stateSnapshotId` and `stateRef`.
- Validation run:
  - `pnpm --filter @fluxiq/web test -- AutomationStudioLive.test.ts view-model.test.ts StateView.test.tsx`
  - `pnpm --filter @fluxiq/web check`
  - `pnpm --filter @fluxiq/web test -- AutomationStudioLive.test.ts ProposalView.test.ts StateView.test.tsx view-model.test.ts`

Next:

- Step 7 copies indexed state links into proposal candidates/nodes so proposal
  node Open State can use the same exact lookup path.

### Step 7: Refactor Proposal Generation

Files:

- `runtime/service.ts`
- `runtime/recording-flow-proposal.ts`
- `views/ProposalView.tsx`

Deliverables:

- every candidate has `actionEntryId`;
- every candidate has `stateLink` when source action has linked state;
- proposal node metadata includes `stateSnapshotId` and refs;
- proposal view opens state from node metadata, not evidence arrays.

Done when:

- Regenerating a proposal from a recording produces nodes with distinct
  `stateSnapshotId`s where the source actions have distinct state.
- Tests prove `sourceObservationIds` cannot override `actionEntryId`.

Status:

- Done on 2026-08-17.
- Added `stateLink?: ProposalNodeStateLink` to
  `RecordingFlowActionCandidate`.
- Proposal generation now reads `recording/index.json` and copies the indexed
  state link for each mapped action entry.
- Generated policy nodes and recording-derived node definitions now include
  `stateLink`, `stateSnapshotId`, `stateRef`, and optional `screenshotRef`
  metadata.
- The web proposal adapter also preserves candidate state links when presenting
  recording-flow proposals as policy proposals.
- Proposal node Open State requests now forward `stateSnapshotId` directly
  when present.
- Validation run:
  - `pnpm --filter fluxiq test -- service.test.ts state-linker.test.ts recording-index-store.test.ts`
  - `pnpm --filter fluxiq check`
  - `pnpm --filter @fluxiq/web test -- ProposalView.test.ts AutomationStudioLive.test.ts view-model.test.ts StateView.test.tsx`
  - `pnpm --filter @fluxiq/web check`

Next:

- Step 8 trims project/sidebar loading toward summary indexes so refresh does
  not hydrate recordings, proposals, state objects, or images.

### Step 8: Refactor Project/Sidebar Loading

Files:

- workspace summary endpoint;
- hierarchy model;
- `AutomationStudioLive.tsx`

Deliverables:

- project open reads summary indexes only;
- proposal rows come from `indexes/proposals.json`;
- recording rows come from `indexes/recordings.json`;
- no full `list-pipeline-artifacts` during sidebar load.

Done when:

- Refreshing the page with one large recording does not read state objects.
- Loading time is bounded by index size.

Status:

- Done on 2026-08-17 for the sidebar/project refresh path.
- Confirmed `getProjectWorkspaceSummary()` reads summary/index methods for
  recordings, proposals, flows, and runtime summaries.
- Changed `AutomationStudioLive.refreshProjectData()` to call only
  `get-project-workspace-summary` and hydrate local sidebar/catalog state from
  summary rows.
- Removed the lightweight refresh fan-out to `list-recordings`,
  `list-normalized-timelines`, and `list-runtime-sessions`.
- The heavier `refreshProjectRuntimeState()` path remains for explicit
  post-mutation refreshes that need artifacts, domains, and node definitions.
- Validation run:
  - `pnpm --filter @fluxiq/web test -- AutomationStudioLive.test.ts`
  - `pnpm --filter @fluxiq/web check`

Next:

- Step 9 tightens delete cascade around recording/proposal indexes and object
  refs so screenshots, state JSON, derived artifacts, and tabs do not survive
  deletion.

### Step 9: Deterministic Delete Cascade

Files:

- `runtime/deletion.ts`
- object index store
- web workspace cleanup

Deliverables:

- delete recording by reading recording/proposal/object indexes;
- delete proposal by reading proposal index;
- close tabs by id references;
- remove unreferenced object files.

Done when:

- Deleting a recording removes screenshots, state JSON, proposals, derived
  evidence, and tabs without refresh.
- Tests inspect filesystem after delete.

Status:

- Done on 2026-08-17 for deterministic indexed-ref cleanup.
- `collectLiveProjectObjectReferences()` now includes object refs from every
  live `recording/index.json`, so object pruning understands state JSON and
  screenshot refs that are no longer embedded in timelines.
- Recording deletion continues to delete recording-owned objects and the
  recording folder, then prunes unreferenced project objects.
- Web deletion cleanup now treats state selections with `recordingId` or
  deleted `proposalId` as deleted-object references.
- Web deletion cleanup clears cached indexed State View sources for deleted
  recordings/proposals.
- Validation run:
  - `pnpm --filter fluxiq test -- service.test.ts object-store.test.ts recording-index-store.test.ts state-index.test.ts`
  - `pnpm --filter fluxiq check`
  - `pnpm --filter @fluxiq/web test -- AutomationStudioLive.test.ts`
  - `pnpm --filter @fluxiq/web check`

Next:

- Step 10 adds visible diagnostics/repair affordances when indexed state
  lookup fails or a recording index needs rebuilding.

### Step 10: Repair and Diagnostics UI

Deliverables:

- "Repair state index" action on missing-link error;
- diagnostic report listing:
  - missing state refs;
  - orphan objects;
  - action entries without state;
  - proposals with stale state links.

Done when:

- Broken artifacts fail loudly and can be repaired intentionally.
- Normal State View open path never repairs/scans implicitly.

Status:

- Done on 2026-08-17.
- Missing indexed state lookups now show the precise Core reason in the UI.
- The UI asks before running repair, requires PIN, calls
  `repair-recording-state-index` in `write` mode, and retries the same exact
  state lookup once.
- Repair remains explicit; normal State View open still does not scan or
  silently fall back.
- Validation run:
  - `pnpm --filter @fluxiq/web test -- AutomationStudioLive.test.ts StateView.test.tsx`
  - `pnpm --filter @fluxiq/web check`
  - `pnpm --filter fluxiq check`

### Post-Step Fix: Proposal Node State Link Ownership

Status:

- Done on 2026-08-17.
- Audited a real extension `.fluxiq` recording and confirmed the recording
  index contained distinct action-state links and distinct screenshot refs.
- Fixed Core proposal generation so mapper-emitted candidates resolve their
  `actionEntryId` from referenced indexed action entries before copying the
  `ProposalNodeStateLink`.
- Kept the mapper/source observation entry in `sourceObservationIds` and
  generated evidence as provenance only.
- Fixed State View model selection so state selections preserve the selected
  proposal node id instead of building the view model with `nodeId: ""`.
- Fixed proposal-node open-state requests so explicit `stateSnapshotId` links
  are routed as exact snapshot opens and do not also send `timelineEntryId`.
  State View selection ids now include exact `stateSnapshotId` when no
  proposal/Flow node id is available, preventing state tabs from being keyed
  only by stale timeline-entry context.
- Added regression coverage for an observation-emitted mapper candidate that
  points at a later action-adjacent state.
- Gated server-side state debug logs behind `FLUXIQ_STATE_DEBUG=1`.
- Pre-fix proposal documents can still contain wrong candidate/node state
  metadata. Regenerate proposals from the existing recording after this fix;
  a new recording is not required when the recording index already has the
  correct state links.

Validation run:

- `pnpm --filter fluxiq test -- service.test.ts state-linker.test.ts`
- `pnpm --filter @fluxiq/web test -- view-model.test.ts StateView.test.tsx ProposalView.test.ts AutomationStudioLive.test.ts`
- `pnpm --filter @fluxiq/web check`

Next:

- Run package checks and docs validation.
- Keep exact-source missing-state behavior strict so async source hydration
  never falls back to the first observed state.

## Test Matrix

### Core Unit Tests

- append action + state snapshot writes index links;
- finalize links actions to exact matching snapshots;
- proposal generation copies state links;
- state lookup endpoint returns exact state;
- deletion removes all indexed refs;
- missing link returns explicit error.

### Web Tests

- double-click action opens resolved state id;
- double-click state snapshot opens itself;
- proposal node Open State uses metadata `stateSnapshotId`;
- no fake `observed:<recording>:<actionEntry>` source ids;
- State View empty state for missing link does not open first state.

### Integration Tests

- create recording with 10 actions and 10 snapshots;
- generate proposal;
- assert every proposal node's state link matches recording index;
- refresh page;
- open each node state;
- assert screenshot refs differ according to state ids;
- delete recording;
- assert no owned objects remain.

## Cutover Strategy

Because backward compatibility is not required:

1. Stop writing old implicit state/evidence navigation fields for new
   recordings/proposals.
2. Add required `recording/index.json`.
3. Add required `stateSnapshotId` links for proposal nodes.
4. Make State View require exact state id/ref for timeline/proposal opens.
5. Delete or ignore old recordings/proposals that do not have indexes.

## Non-Goals

- No automatic migration for old broken artifacts.
- No UI-time timeline scanning as a normal path.
- No SQLite ownership for Automation Studio recordings/proposals/state.
- No extension-specific assumptions in Core.
- No screenshot stitching requirement.

## Open Questions

1. Should `stateBeforeId` and `stateAfterId` be required immediately, or should
   the first implementation require only `stateAtActionId`?
2. Should state snapshot ids be entry ids, object ids, or generated ids?
   Recommended: stable `state.<entryId>` while storing original `entryId`.
3. Should large `timeline.jsonl` be paged by sequence ranges in the first
   implementation?
4. Should `repair-recording-state-index` be exposed in UI immediately or kept
   as a developer API first?

## Success Definition

This refactor is complete when:

- Opening state for a timeline entry or proposal node always opens the exact
  indexed state or shows a precise missing-link error.
- Project refresh no longer loads full recordings/proposals/state objects.
- Proposal generation produces nodes with explicit action and state links.
- Deleting recordings/proposals removes all owned objects without refresh.
- There is no code path where UI opens "first state", "nearest state", or
  evidence-derived state during normal user interaction.
