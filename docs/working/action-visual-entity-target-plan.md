# Action Visual Entity Target Plan

Status: working document  
Created: 2026-08-18  
Scope: FluxIQ Automation Studio action evidence contracts, state visual entity
linking, editor highlighting, importer documentation, validation, and
proposal/runtime use.

## Progress Log

| Step | Status | Date | Notes | Next |
| --- | --- | --- | --- | --- |
| Phase 1: Contract and validation | Complete | 2026-08-18 | Added `ActionVisualEntityTarget`, `ActionEntry.visualTarget`, `ActionTarget.visualTarget`, public contract exports, target validation, and focused model tests. `pnpm --filter fluxiq test -- action-visual-target.test.ts state-index.test.ts` and `pnpm --filter fluxiq check` pass. | Wire editor resolution/highlighting. |
| Phase 2: Persistence and index summary | Complete | 2026-08-18 | Added action visual target summaries to `RecordingActionIndexItem`, validation for linked target state summaries, and recording index builder preservation. | Add UI use of resolved targets. |
| Phase 3: State resolution helper | Complete | 2026-08-18 | Added `resolveActionVisualTarget` with exact-layer, state-path, entity, anchor, and missing resolutions plus focused tests. | Surface resolved target in State View and Inspector. |
| Phase 4: Editor highlighting | Complete | 2026-08-18 | State view-model now resolves the selected timeline action target against the active state snapshot and emits a selected overlay; timeline inspector details include visual entity, state path, layer, anchor, and confidence. `pnpm --filter @fluxiq/web test -- state/view-model.test.ts` and `pnpm --filter @fluxiq/web check` pass. | Finish docs/reference generation and full validation. |
| Phase 5: Importer docs and examples | Complete | 2026-08-18 | Added importer guidance and architecture documentation for `visualTarget` resolution and editor highlighting. | Validate docs and generated reference output. |
| Phase 6: Preview-driven interaction indicator | Complete | 2026-08-18 | The bottom action preview's active action now drives State View target resolution, including nearest observed snapshot fallback when the action is not the global selection. Preview boxes with `visualTarget` show an interacted-entity marker. `pnpm --filter @fluxiq/web test -- state/view-model.test.ts` and `pnpm --filter @fluxiq/web check` pass. | Run broader validation. |

This document plans a domain-neutral framework feature that lets every recorded
or executable action name the visual state entity it acted upon. The goal is to
make Automation Studio show the exact thing interacted with when reviewing a
recording, inspecting a proposal, or debugging a Flow.

## Purpose

FluxIQ already stores action timeline entries, action targets, state snapshots,
state presentation anchors, and visual layers. These pieces let the editor show
what happened and what the observed world looked like, but they do not yet give
each action a first-class, stable link to the specific visual entity it acted
upon.

The user-facing question is:

```text
What did this action interact with?
```

The framework should answer that question visually. Selecting an action should
highlight the acted-upon entity in the State View or action preview context,
without requiring browser-specific, game-specific, or downstream-specific code
inside FluxIQ.

## Non-goals and invariants

- FluxIQ remains domain-neutral. No browser DOM, game object, OS-specific, or
  private downstream behavior belongs in this repository.
- Importers own the semantics of their visual entities and the renderer content
  used to reconstruct them.
- FluxIQ owns the shared contracts, validation, persistence, generic
  resolution, fallback display, editor highlighting, and documentation.
- Existing action recordings remain valid. Missing visual entity targets should
  degrade to current behavior and never make old recordings unreadable.
- Visual entity links are evidence links, not permission grants. They must not
  authorize actions or bypass output/action safety gates.
- Large screenshots and binary assets remain in object/runtime storage, not in
  authored framework source.

## Current model shape

Relevant existing concepts:

- `ActionEntry` in `model/timeline.ts` represents recorded actions and already
  supports `target?: ActionTarget`.
- `StateSnapshot` in `model/state.ts` can include
  `presentation.visualFrames`.
- `StateVisualLayer` can represent `image`, `text`, `region`, and `element`
  layers, with layer IDs, `statePath`, bounds, anchors, metadata, and render
  hints.
- `EvidenceAnchor` already supports semantic targets such as `entity`,
  `element`, `region`, `bounds`, `point`, and `path`.
- State values and schema paths can carry `entityId`, `entityKind`, and
  `presentation.anchor`.
- Recording indexes already plan deterministic links among action entries,
  action IDs, state snapshots, and proposal nodes.

This feature should build on those concepts rather than introducing a separate
visual-target system.

## Proposed contract

Add a domain-neutral visual target field to action-like evidence:

```ts
type ActionVisualEntityTarget = {
  entityId: string;
  entityKind?: string;
  statePath?: StatePath;
  anchor?: EvidenceAnchor;
  visualFrameId?: string;
  visualLayerId?: string;
  stateSnapshotId?: string;
  confidence?: number;
  source?: "importer" | "runtime" | "inferred" | "operator";
  metadata?: JsonObject;
};
```

Then attach it to action evidence:

```ts
type ActionEntry = TimelineBase & {
  type: "action";
  // existing fields omitted
  visualTarget?: ActionVisualEntityTarget;
};
```

Candidate placement:

- `ActionEntry.visualTarget`: primary location for recorded action evidence.
- `DomainEventEntry.visualTarget?`: optional if domain events represent
  interaction-like events.
- `ActionTarget.visualTarget?`: optional for reusable executable output
  definitions if the target is known before recording.
- Proposal node metadata: copy or reference the originating action
  `visualTarget` when generating proposal nodes, preferably by action entry ID
  plus state link rather than duplicating all visual data.

Open decision: whether the shared contract should name this
`visualTarget`, `actedUpon`, or `entityTarget`. `visualTarget` is the clearest
editor-facing term, while `actedUpon` is semantically precise.

## Resolution rules

When an action is selected, FluxIQ should resolve the visual target in this
order:

1. Use `visualTarget.stateSnapshotId` when present.
2. Otherwise use the recording index action/state link for the action entry.
3. Within that state snapshot, prefer `visualFrameId` and `visualLayerId`.
4. If no layer ID exists, resolve `anchor`.
5. If anchor is `entity`, match a visual layer or state value with the same
   `entityId` and compatible `entityKind`.
6. If `statePath` exists, match the state value presentation anchor or visual
   layer `statePath`.
7. If only bounds/point/path data exists, render a generic overlay directly.
8. If resolution fails, show a non-fatal missing-target explanation in the
   inspector and keep the action selectable.

Resolution should return:

```ts
type ResolvedActionVisualTarget = {
  actionEntryId: string;
  stateSnapshotId?: string;
  visualFrameId?: string;
  visualLayerId?: string;
  anchor?: EvidenceAnchor;
  entityId?: string;
  entityKind?: string;
  statePath?: StatePath;
  confidence?: number;
  resolution: "exact-layer" | "state-path" | "entity" | "anchor" | "missing";
  issues?: string[];
};
```

## Editor behavior

Selecting a bottom action preview marker or full timeline action should:

- keep global selection on the timeline action;
- resolve the action visual target against the linked state snapshot;
- make the Global Inspector show the target entity ID/kind, state path,
  confidence, and resolution status;
- make State View highlight the target layer/anchor if a state visual frame is
  available;
- offer an "Open State" action that opens the linked snapshot with the target
  highlighted;
- keep the preview rail itself visually lightweight and not become a full
  screenshot viewer.

Highlight treatment should be generic:

- exact layer: highlight the layer bounds or element outline;
- bounds anchor: draw a rectangle;
- point anchor: draw a small target marker;
- path anchor: draw a path overlay;
- entity/region/element anchor without visual geometry: select matching layer
  if present, otherwise show a semantic chip in the inspector.

## Importer guidance

Importers should provide stable visual targets whenever they can identify what
an action acted upon.

Recommended priority:

1. `entityId` and `entityKind` for stable semantic identity.
2. `statePath` for the state fact representing the acted-upon entity.
3. `visualLayerId` when a visual frame layer directly represents the entity.
4. `anchor` with bounds or point for immediate visual highlighting.
5. `confidence` when the target was inferred instead of directly known.

Example:

```ts
{
  type: "action",
  actionType: "click",
  parameters: { button: "Submit" },
  visualTarget: {
    entityId: "checkout.submit",
    entityKind: "button",
    statePath: { namespace: "app", path: "elements.checkout.submit.visible" },
    visualFrameId: "viewport",
    visualLayerId: "element.checkout.submit",
    anchor: {
      type: "bounds",
      boundsKind: "screenshot",
      bounds: { x: 412, y: 240, width: 93, height: 38 }
    },
    confidence: 0.98,
    source: "importer"
  }
}
```

## Validation

Validation should be warning-first for compatibility:

- `visualTarget.entityId` must be non-empty when present.
- `confidence` must be finite and between 0 and 1.
- `statePath.namespace` and `statePath.path` must be non-empty when present.
- `anchor` should reuse existing `validateEvidenceAnchor`.
- If `stateSnapshotId`, `visualFrameId`, or `visualLayerId` cannot be resolved
  during whole-recording validation, emit a warning rather than rejecting the
  recording.
- If `visualLayerId` is present without `visualFrameId`, resolution may search
  all frames but validation should warn when ambiguous.

## Persistence and indexes

Recording storage should persist the visual target as part of the timeline
entry. Recording indexes should add enough summary data to make target lookup
fast without duplicating visual frame payloads.

Candidate index addition:

```ts
type RecordingActionIndexItem = {
  // existing fields omitted
  visualTarget?: {
    entityId?: string;
    entityKind?: string;
    statePath?: StatePath;
    stateSnapshotId?: string;
    visualFrameId?: string;
    visualLayerId?: string;
    confidence?: number;
  };
};
```

The index should preserve the distinction between:

- action-to-state link: which snapshot is associated with the action;
- action-to-visual-target link: which entity inside the snapshot was acted on.

## Proposal generation

Proposal generation should carry the visual target forward as provenance:

- generated policy action nodes should reference the source action entry;
- node evidence should include the resolved state link;
- node metadata should expose visual target summaries for editor highlighting;
- generated Flow behavior must not depend on visual target presence unless the
  importer explicitly maps it into action parameters or state expectations.

This lets reviewers see "this node clicks the submit button observed here"
without making visual evidence a hidden runtime dependency.

## Runtime behavior

For replay/execution:

- visual target is evidence and explanation by default;
- executable action dispatch should still use declared output IDs, parameters,
  grants, and importer runtime contracts;
- runtime may report a new visual target in action results when the actual
  acted-upon entity differs from recorded evidence;
- differences between expected visual target and runtime visual target should
  appear in debug/history views later.

## Implementation phases

### Phase 1: Contract and validation

- Add `ActionVisualEntityTarget` to the Automation Studio model contracts.
- Add optional `visualTarget` to `ActionEntry`.
- Consider optional support on `DomainEventEntry` only if existing domain event
  usage needs it.
- Validate target shape and reuse evidence-anchor validation.
- Add model tests for valid target, invalid empty IDs, invalid confidence, and
  missing but tolerated links.

### Phase 2: Persistence and index summary

- Persist `visualTarget` through recording append/finalize paths.
- Include visual target summary in action index items.
- Ensure old recordings normalize without targets.
- Add regression tests proving action/state links remain distinct from
  action/entity links.

### Phase 3: State resolution helper

- Add a pure resolver that maps an action entry plus linked state snapshot to a
  `ResolvedActionVisualTarget`.
- Support exact layer, state path, entity, anchor, and missing resolutions.
- Add focused tests using generic visual frames and state values.

### Phase 4: Editor highlighting

- Extend timeline/action selection state to carry resolved visual target
  context.
- Highlight selected action targets in State View overlays.
- Show target summary and resolution issues in Global Inspector.
- Keep bottom action preview rail behavior unchanged except for selection
  driving target highlight.

### Phase 5: Importer docs and examples

- Update importer docs with the new field and examples.
- Explain stable entity IDs, visual layer IDs, state paths, and bounds anchors.
- Document compatibility behavior when target data is missing or partial.
- Update architecture docs to describe action visual target provenance.

### Phase 6: Proposal/runtime provenance

- Preserve visual target summaries on generated proposal nodes.
- Add inspector affordances for proposal node action targets.
- Later: compare expected recorded visual target with runtime action result
  visual target during replay/debug.

## Open questions

- Should the field name be `visualTarget`, `actedUpon`, or
  `actedUponEntity`?
- Should domain events support `visualTarget` immediately, or should the first
  implementation restrict it to `ActionEntry`?
- Should `stateSnapshotId` live directly on `visualTarget`, or should target
  resolution always use the existing action/state index?
- Should `visualLayerId` be globally unique within a snapshot, or scoped by
  `visualFrameId` only?
- How much target summary should be copied into proposal node metadata versus
  resolved through source action/state links?

## Acceptance criteria

- Existing recordings without visual targets still load and validate.
- New action entries can identify an acted-upon visual entity with stable,
  domain-neutral data.
- Validation catches malformed target data without rejecting old recordings.
- The editor can resolve and highlight exact visual layers, state-path targets,
  entity anchors, and bounds/point anchors.
- Importer documentation explains how downstream projects should emit visual
  targets.
- Architecture documentation distinguishes action/state links from
  action/visual-entity links.
