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
   - exact `eventTimestampMs` match wins;
   - explicit client correlation id wins over timestamp;
   - nearest prior/current snapshot wins over later snapshot when tied;
   - never link across recordings.
3. Write `recording/index.json`.
4. Update `indexes/recordings.json` summary counts.

## Proposal Generation Pipeline

1. Load `recording/index.json`.
2. Stream mapper-visible timeline entries from `timeline.jsonl`.
3. For each action candidate:
   - set `actionEntryId`;
   - set `stateLink` from `entries[actionEntryId].stateSnapshotId`;
   - copy `stateSnapshotId`, `stateRef`, and `screenshotRef` into proposal
     node metadata.
4. Store support evidence separately.
5. Write `proposal/index.json` for quick proposal/node lookup.

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
