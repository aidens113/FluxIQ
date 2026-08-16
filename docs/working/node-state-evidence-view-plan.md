# Node State Evidence View Plan

Status: working document  
Created: 2026-08-12  
Scope: FluxIQ Automation Studio state/evidence contracts, importer SDK
presentation hints, node state inspection, and the existing addable workspace
window system.

This document plans the node state/evidence system after the Flow refactor.
It is intentionally a working document. The target is to make FluxIQ explain
adaptive nodes by reconstructing what the automation saw, not by inventing a
new abstract evidence visual language.

## Purpose

FluxIQ policy and recording-derived nodes are difficult to understand when
their explanation is only a list of signal names, weights, observations, and
expectations. The more direct user question is:

```text
What did FluxIQ believe the world looked like when this node was appropriate?
```

The State View should answer that question first. It reconstructs the observed,
learned, or live state supplied by the importing repository, then overlays the
state facts and evidence bindings a selected node uses for eligibility,
readiness, expectations, failure, context, and recovery.

The existing workspace already has the correct shell:

- `AutomationViewType` includes `"state"`.
- `AutomationStateExplorerView` exists as a minimal placeholder.
- `AutomationStudioLive` has addable, movable, tabbed workspace windows.
- Architecture docs already place state/evidence inspection outside the Flow
  editor canvas and inside dedicated workspace views plus the global inspector.

This plan fleshes out that existing State window rather than adding a second
window framework.

## Non-goals and invariants

- FluxIQ core remains domain-neutral. It must not contain browser, game,
  Android, OSRS, robot, or other downstream-specific renderers.
- Importing repositories own domain state semantics and visual evidence
  content. FluxIQ owns contracts, persistence, fallback rendering, selection,
  provenance, and common overlays.
- Raw recordings and normalized state remain immutable evidence sources.
  Editing a Flow or node must not rewrite raw evidence.
- The Flow editor remains the editable graph canvas. State/evidence
  explanation belongs in the State View, proposal view, runtime/debug view, and
  global inspector.
- Declarative presentation data comes before custom React renderers. A simple
  importer should be able to provide bounds, coordinates, text, image
  references, and facts without shipping web UI code.
- Large images, screenshots, binary payloads, and private downstream assets
  must live in the importing project's runtime/object storage, not in this
  public framework repository.

## Target concepts

| Concept | Meaning |
| --- | --- |
| State Snapshot | A timestamped set of observed namespaces and values. This is what FluxIQ or an importer observed. |
| State Entity | A reconstructed thing in the observed world, such as a UI element, document region, game object, API resource, or imported domain entity. |
| State Fact | A single addressable observed attribute/value inside a snapshot, including path, value, confidence, source, provenance, and optional presentation metadata. A fact may describe an entity or global state. |
| Node Evidence | A node's use of a state fact: role, comparator, expected value, weight, confidence, and provenance. |
| Evidence Anchor | A spatial or semantic target that lets a renderer highlight where a fact or binding appears in the reconstructed world. |
| State Visual Frame | Importer-supplied declarative render data such as coordinate space, image layers, text layers, regions, elements, and entity references. |
| State Source | The selected state family: learned node state, observed recording state, or live runtime state. |
| State Phase | The selected node phase: input, action, expected output, and later actual output/runtime comparison. |

## Target UI

Opening state for a selected node creates or activates the existing State
workspace view. The initial surface should be:

```text
Node State: Deposit Inventory

Source: [Learned] [Recording 1] [Recording 2] [Live]
Phase:  [Input] [Action] [Expected Output]
View:   [Visual] [Structured] [Diff] [Raw]

+--------------------------------------------------------------------------+
| Reconstructed world                                                       |
|                                                                          |
| importer image/text/region layers with FluxIQ overlays                    |
|                                                                          |
+--------------------------------------------------------------------------+
| compact evidence timeline / source strip                                  |
+--------------------------------------------------------------------------+
```

The reconstructed world is the primary visual. Evidence lists and raw JSON are
supporting explanations. Selected state entity, state fact, and node evidence
details appear in the global inspector instead of a local State View sidebar.

## 1. Define state presentation and anchor contracts

**Status:** implemented 2026-08-12.

**Goal:** extend the state model so importers can describe what the automation
saw using direct content, bounds, coordinates, and semantic anchors.

### Existing seams

- `packages/fluxiq/src/programs/automation-studio/model/state.ts`
- `packages/fluxiq/src/programs/automation-studio/model/evidence.ts`
- `packages/fluxiq/src/programs/automation-studio/model/timeline.ts`
- `packages/fluxiq/src/programs/automation-studio/model/state-diff.ts`

### Contract additions

Additive model types should be introduced without breaking current
`StateSnapshot` documents.

```ts
export type StateCoordinateSpace = {
  width: number;
  height: number;
  unit: "px" | "world" | "cell" | "normalized";
  origin?: "top-left" | "bottom-left" | "center";
  scale?: number;
  metadata?: JsonObject;
};

export type StateBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type EvidenceAnchor =
  | { type: "none"; metadata?: JsonObject }
  | { type: "point"; x: number; y: number; rendererId?: string; metadata?: JsonObject }
  | { type: "bounds"; bounds: StateBounds; rendererId?: string; metadata?: JsonObject }
  | { type: "element"; elementId: string; rendererId?: string; metadata?: JsonObject }
  | { type: "entity"; entityId: string; entityKind?: string; rendererId?: string; metadata?: JsonObject }
  | { type: "region"; regionId: string; rendererId?: string; metadata?: JsonObject }
  | { type: "path"; points: Array<{ x: number; y: number }>; rendererId?: string; metadata?: JsonObject };
```

Presentation hints should attach to state values, state path schemas, and
visual frames:

```ts
export type StatePresentationMetadata = {
  label?: string;
  description?: string;
  group?: string;
  icon?: string;
  order?: number;
  anchor?: EvidenceAnchor;
  visualKind?: "image" | "text" | "bounds" | "table" | "tree" | "metric" | "badge" | "json";
  sensitive?: boolean;
  metadata?: JsonObject;
};
```

Add a snapshot identity without forcing old snapshots to have one:

```ts
export type StateSnapshot = {
  id?: string;
  timestamp: number;
  namespaces: Record<string, StateNamespace>;
  presentation?: StateSnapshotPresentation;
  metadata?: JsonObject;
};
```

### State visual frame

The declarative visual frame is the first implementation target. It should be
JSON-only and safe to persist.

```ts
export type StateVisualLayer =
  | {
      id: string;
      kind: "image";
      contentRef: string;
      bounds: StateBounds;
      opacity?: number;
      metadata?: JsonObject;
    }
  | {
      id: string;
      kind: "text";
      content: string;
      bounds?: StateBounds;
      anchor?: EvidenceAnchor;
      style?: { tone?: string; size?: "xs" | "sm" | "md" | "lg" };
      metadata?: JsonObject;
    }
  | {
      id: string;
      kind: "region";
      bounds: StateBounds;
      label?: string;
      statePath?: string;
      anchor?: EvidenceAnchor;
      metadata?: JsonObject;
    }
  | {
      id: string;
      kind: "element";
      label?: string;
      bounds?: StateBounds;
      statePath?: string;
      anchor?: EvidenceAnchor;
      metadata?: JsonObject;
    };

export type StateVisualFrame = {
  id: string;
  rendererId?: string;
  label?: string;
  coordinateSpace: StateCoordinateSpace;
  layers: StateVisualLayer[];
  metadata?: JsonObject;
};
```

The initial renderer only needs image, text, region, and element layers.
Advanced graph/entity/world renderers can be later additions.

### Validation rules

- Bounds must be finite numbers.
- Width and height must be positive.
- Content references must be object-store or API references, not arbitrary
  filesystem paths.
- Sensitive state values must not render raw text unless explicitly permitted
  by the presentation metadata and current user permission.
- Unknown presentation fields must be preserved in metadata but ignored by
  default renderers.

### Acceptance criteria

- Existing state snapshots remain valid.
- Importers can attach coordinate bounds and visual content to state without
  custom UI code.
- Invalid bounds, unsafe content references, and malformed anchors fail
  deterministically.
- Generic rendering can map state values back to paths and anchors.

## 2. Separate observed state facts from node evidence bindings

**Status:** implemented 2026-08-12.

**Goal:** make the distinction between observed facts and node-specific use of
those facts explicit.

### Existing seams

- `model/evidence.ts` currently defines `EvidenceReference`.
- `mining/contracts.ts` defines facts, observations, correlations, and claims.
- `runtime/service.ts` creates evidence facts, observations, state-action
  correlations, and claims from normalized timelines.
- `learning/contracts.ts` and `fingerprinting/contracts.ts` consume evidence
  and state snapshots for node scoring.

### Contract additions

Introduce a state fact reference and a node evidence binding. These can live in
`model/evidence.ts` or a new adjacent `model/node-state-evidence.ts` if the
file grows too broad.

```ts
export type StateFactReference = {
  snapshotId?: string;
  namespace: string;
  path: string;
  observedAt?: number;
  evidence?: EvidenceReference;
};

export type NodeEvidenceRole =
  | "eligibility"
  | "negative_eligibility"
  | "readiness"
  | "expectation"
  | "failure"
  | "context"
  | "invariant"
  | "ignored";

export type EvidenceComparator =
  | { kind: "exists" }
  | { kind: "equals"; value: unknown }
  | { kind: "not_equals"; value: unknown }
  | { kind: "numeric"; operator: ">" | ">=" | "<" | "<=" | "==" | "!="; value: number }
  | { kind: "changed" }
  | { kind: "custom"; comparatorId: string; parameters?: JsonObject };

export type NodeEvidenceBinding = {
  id: string;
  nodeId: string;
  fact: StateFactReference;
  role: NodeEvidenceRole;
  comparator: EvidenceComparator;
  expectedValue?: unknown;
  weight?: number;
  confidence?: number;
  anchor?: EvidenceAnchor;
  provenance?: EvidenceReference[];
  metadata?: JsonObject;
};
```

### Derivation rules

- A `StateFactReference` points to the state path and source evidence.
- A `NodeEvidenceBinding` points to how the selected node uses the fact.
- The same fact can be reused by multiple nodes and roles.
- Evidence bindings should preserve existing evidence references rather than
  replacing them.
- Learned-model aggregates can create synthetic bindings that retain all
  contributing source evidence references.

### Acceptance criteria

- The UI can show "what was observed" separately from "why this node cares."
- A fact can support eligibility for one node and expected output for another
  without duplicating the observed value.
- Existing mined evidence remains readable through `EvidenceReference`.
- Unknown/custom comparators can be displayed and preserved without core
  domain logic.

## 3. Model observed, learned, and runtime state sources

**Status:** implemented 2026-08-12.

**Goal:** support the three state families users need: actual recording
moments, aggregated learned node state, and live runtime state.

### State source types

```ts
export type NodeStateSourceKind = "learned" | "observed" | "runtime";

export type NodeStateSource =
  | {
      kind: "learned";
      id: string;
      label: string;
      modelId?: string;
      nodeId: string;
      recordingIds: string[];
      confidence?: number;
    }
  | {
      kind: "observed";
      id: string;
      label: string;
      recordingId: string;
      timelineEntryId?: string;
      timestamp: number;
    }
  | {
      kind: "runtime";
      id: string;
      label: string;
      sessionId?: string;
      timestamp: number;
    };
```

### Phase types

```ts
export type NodeStatePhase =
  | "input"
  | "action"
  | "expected_output"
  | "actual_output";
```

Initial implementation should support `input`, `action`, and
`expected_output`. `actual_output` belongs with runtime comparison.

### Resolution order

When a node is selected:

1. Resolve current canonical Flow node or proposal node.
2. Find evidence references attached to the node, proposal step, policy node,
   or learned task model cluster.
3. Find observed snapshots from selected recording timeline checkpoints and
   nearby state deltas.
4. Build a learned source from evidence claims/state-action correlations when
   available.
5. Include runtime source only when a live client/runtime state snapshot exists.
6. If no node-specific source exists, fall back to the selected recording or
   latest project state snapshot and clearly label it as generic state.

### Acceptance criteria

- The State View can open even when only observed recording state is available.
- Learned state can aggregate multiple recordings without pretending to be one
  literal screenshot.
- Runtime state is visually separate from recording-derived state.
- The selected source and phase are persisted in view-local workspace state.

## 4. Build the web State View model

**Status:** implemented 2026-08-12.

**Goal:** keep State View derivation pure and testable before rendering UI.

### New module

Add:

```text
apps/web/src/features/automation-studio/state/view-model.ts
```

Possible companion test:

```text
apps/web/src/features/automation-studio/state/view-model.test.ts
```

### Inputs

```ts
export type BuildNodeStateViewModelInput = {
  selection: AutomationSelection | null;
  selectedNode: unknown;
  selectedRecording: unknown;
  selectedTimeline: unknown;
  policy: unknown;
  taskGraph: unknown;
  pipelineArtifacts: unknown;
  recordings: unknown[];
  timelines: unknown[];
  runtimeSessions: unknown[];
  signals: unknown[];
};
```

### Output

```ts
export type NodeStateViewModel = {
  title: string;
  subtitle: string;
  sources: NodeStateSource[];
  activeSource: NodeStateSource | null;
  phases: Array<{ id: NodeStatePhase; label: string; available: boolean }>;
  activePhase: NodeStatePhase;
  visualFrame?: StateVisualFrame;
  facts: StateFactViewModel[];
  evidence: NodeEvidenceBindingViewModel[];
  overlays: StateOverlayViewModel[];
  structuredRows: StateStructuredRow[];
  diffRows: StateDiffRow[];
  raw: unknown;
  summary: {
    facts: number;
    evidence: number;
    strong: number;
    weak: number;
    negative: number;
    ignored: number;
    confidence?: number;
  };
  emptyState?: { title: string; message: string };
};
```

### Overlay model

```ts
export type StateOverlayViewModel = {
  id: string;
  label: string;
  role: NodeEvidenceRole;
  tone: "positive" | "weak" | "negative" | "mismatch" | "neutral";
  anchor: EvidenceAnchor;
  factPath?: string;
  evidenceId?: string;
  confidence?: number;
  selected?: boolean;
};
```

### Responsibilities

- Resolve title and subtitle from selected node/source.
- Normalize state facts from `StateSnapshot.namespaces`.
- Merge facts with presentation metadata.
- Resolve evidence bindings from existing pipeline artifacts where possible.
- Derive overlay tone from evidence role and confidence.
- Produce structured rows and raw JSON fallback for every source.
- Avoid React state, DOM access, API calls, and side effects.

### Acceptance criteria

- Unit tests can build a visual state model from a synthetic snapshot with
  image/region layers and evidence anchors.
- Unit tests cover no-node, selected node without state, observed checkpoint,
  learned aggregate placeholder, and runtime source cases.
- The view model never mutates input snapshots or artifacts.

## 5. Replace the placeholder State Explorer with a dedicated State View

**Status:** implemented 2026-08-12.

**Goal:** turn the existing `"state"` view into a reconstructed-state window.

### Existing seams

- `apps/web/src/features/automation-studio/views/GraphEditorViews.tsx`
- `apps/web/src/features/automation-studio/views/Renderer.tsx`
- `apps/web/src/features/automation-studio/types.ts`
- `apps/web/src/app/globals.css`

### New module

Create:

```text
apps/web/src/features/automation-studio/views/StateView.tsx
```

Move or replace `AutomationStateExplorerView` from `GraphEditorViews.tsx`.
`GraphEditorViews.tsx` should retain graph editor responsibilities rather than
owning state explanation UI.

### Component structure

```tsx
export function AutomationStateView(props: {
  model: NodeStateViewModel;
  selectedEvidenceId?: string;
  selectedFactPath?: string;
  onSourceChange(sourceId: string): void;
  onPhaseChange(phase: NodeStatePhase): void;
  onModeChange(mode: StateViewMode): void;
  onSelectEvidence(id: string): void;
  onSelectFact(path: string): void;
  setSelection(selection: AutomationSelection): void;
}) {
  // shell, toolbar, visual/structured/diff/raw modes
}
```

Initial render subcomponents:

- `StateViewToolbar`
- `StateVisualCanvas`
- `StateOverlay`
- `StateEvidenceList`
- `StateStructuredPanel`
- `StateDiffPanel`
- `StateRawPanel`
- `StateSourceStrip`

### Visual canvas behavior

- Render visual frame layers scaled to fit the available canvas.
- Preserve aspect ratio from coordinate space.
- Draw image layers below text/region/element layers.
- Draw FluxIQ overlays above importer layers.
- Click overlay selects evidence and updates global selection.
- Unknown layer kinds are ignored but counted in the structured/raw panel.
- If no visual frame exists, show a structured fallback instead of an empty
  blank surface.

### View modes

| Mode | Purpose |
| --- | --- |
| Visual | Reconstructed world plus overlays. Default when a visual frame exists. |
| Structured | Grouped facts by namespace/path with labels, values, confidence, source, and provenance. |
| Diff | State deltas for observed before/after or expected/actual comparisons. |
| Raw | JSON view of source snapshot, visual frame, and bindings. |

### Acceptance criteria

- `"state"` view renders through `AutomationViewRenderer`.
- The add-window palette opens the State View using the existing workspace
  window system.
- State View works with no selected node, selected node, and selected timeline
  entry.
- Visual mode never overflows text or overlays incoherently at common desktop
  and narrow widths.

## 6. Add "Open State" actions from nodes and inspectors

**Status:** implemented 2026-08-12.

**Goal:** make state explanation discoverable from the selected node.

### Selection additions

Extend `AutomationSelection`:

```ts
| {
    kind: "state";
    id: string;
    nodeId?: string;
    sourceId?: string;
    phase?: NodeStatePhase;
    evidenceId?: string;
    factPath?: string;
  }
```

The `id` can be a stable composite such as:

```text
state:<flowId>:<nodeId>
```

or for proposal nodes:

```text
state:<proposalId>:<nodeId>
```

### Node action locations

Add entry points in this order:

1. Selected node inspector: `Open State`.
2. Policy/Flow node card selected action if space allows.
3. Timeline entry double-click/open action when an entry has checkpoint or state
   delta data.
4. Proposal step evidence panel when a generated node has source evidence.

### Behavior

- Set selection to `{ kind: "state", ... }`.
- Open the `"state-explorer"` or renamed `"node-state"` view in preview mode.
- Ensure the view opens in the main workspace by default.
- Preserve the active source/phase in `workspacePrefs.viewStates`.
- Selecting an overlay updates inspector selection with evidence/fact details.

### Acceptance criteria

- Users can reach the State View from a selected adaptive/generated node.
- Opening state does not change the Flow graph or mark it dirty.
- View-state persistence restores the last source and phase when switching
  tabs/windows.

## 7. Extend the importer SDK for state visualizers

**Status:** implemented 2026-08-12.

**Goal:** let importing repositories declare state visualization capabilities
without requiring core changes.

### Existing seam

- `packages/fluxiq/src/programs/automation-studio/nodes/importer-sdk.ts`

### Manifest additions

Add declarative visualizer support:

```ts
export type AutomationStudioStateVisualizerDefinition = {
  id: string;
  version: string;
  label: string;
  description?: string;
  supportedNamespaces?: string[];
  supportedKinds?: string[];
  supportedRendererIds?: string[];
  metadata?: JsonObject;
};

export type AutomationStudioImporterSdkManifest = {
  // existing fields
  stateVisualizers?: AutomationStudioStateVisualizerDefinition[];
};
```

This first release declares visualizer identity and support. Actual rendering
comes from `StateSnapshot.presentation.visualFrames` and generic FluxIQ
rendering.

### Later advanced renderer option

Custom web renderers should remain deferred until the declarative frame model
is insufficient. If introduced later, they should register through the
importing-repo host module hook, not through arbitrary dynamic imports from
FluxIQ core.

### Validation rules

- Visualizer IDs must be unique per importer package.
- Versions must be semantic versions.
- Visualizer definitions must match the manifest domain/package.
- A visualizer cannot claim executable capabilities.
- A visualizer cannot grant runtime or storage access.

### Acceptance criteria

- Simple importers can declare visualizers and send visual frames as JSON.
- Core does not need domain-specific React components.
- Manifest validation rejects duplicate or invalid visualizer definitions.

## 8. Persist and serve large visual assets safely

**Status:** implemented 2026-08-12.

**Goal:** support screenshots/images/binary visuals without putting private
assets into framework source or unsafe filesystem references into state.

### Storage direction

- Small frames and metadata live as JSON with snapshots, timelines, or pipeline
  artifacts.
- Large images and binary payloads live in project object storage.
- State visual layers reference assets by content reference, not local path.

Example:

```ts
contentRef: "automation-object://project/<projectId>/<sha256>"
```

or an equivalent existing object-store reference format if one already exists
when implemented.

### API/UI needs

- Add a read path that resolves a permitted object reference for the active
  project.
- Enforce project and user authorization before serving the object.
- Include content type and size metadata.
- Never render arbitrary `file://`, absolute local paths, or untrusted remote
  URLs directly.
- Redact or hide sensitive visual layers when permissions are insufficient.

### Acceptance criteria

- Visual state screenshots can render from project object references.
- Private downstream images are not committed to FluxIQ.
- Broken or unauthorized object references degrade to a visible placeholder.
- Tests cover unauthorized project/object access where an API route is added.

## 9. Add runtime expected-vs-actual comparison

**Status:** implemented 2026-08-12.

**Goal:** turn the State View into a useful runtime debugger once learned and
observed state rendering are stable.

### Runtime comparison model

```ts
export type NodeStateRuntimeComparison = {
  expectedSourceId: string;
  actualSourceId: string;
  nodeId: string;
  phase: "actual_output";
  matches: Array<{ evidenceId: string; factPath: string; score?: number }>;
  mismatches: Array<{
    evidenceId: string;
    factPath: string;
    expected: unknown;
    actual: unknown;
    severity: "warning" | "error";
  }>;
  confidence?: number;
  metadata?: JsonObject;
};
```

### UI behavior

- Add `Expected | Actual | Compare` display when runtime state exists.
- Use green overlays for matched expectations.
- Use red overlays for failed expectations.
- Use gray overlays for irrelevant/unbound state.
- Selecting a mismatch opens evidence details in the global inspector.

### Acceptance criteria

- Runtime failures identify which expected facts did not match.
- Expected and actual visual frames can be compared without requiring matching
  screenshots, as long as facts and anchors exist.
- The runtime debug path remains separate from Flow graph editing.

## 10. Update docs and validation

**Status:** implemented 2026-08-12.

**Goal:** keep authored docs and tests aligned with the new state/evidence
model.

### Docs to update during implementation

- `docs/architecture/automation-studio/workspace.md`
- `docs/integrations/automation-studio-importing-repos.md`
- `docs/operations/data-and-state.md`
- `packages/contracts/README.md` if any public contract is exported there.
- `packages/fluxiq/docs/reference/framework-reference.md` or generated
  reference output if exports change.

### Test targets

Core/model tests:

- anchor validation;
- visual frame validation;
- state fact extraction from snapshots;
- evidence binding compatibility with existing `EvidenceReference`;
- importer manifest visualizer validation.

Web tests:

- State View view model;
- fallback rendering with no visual frame;
- overlay selection;
- source/phase mode derivation;
- "Open State" selection behavior if extracted into a pure helper.

Validation commands:

```bash
pnpm --filter fluxiq check
pnpm --filter fluxiq test
pnpm --filter fluxiq build
pnpm --filter @fluxiq/web check
pnpm --filter @fluxiq/web test
pnpm --filter @fluxiq/web build
pnpm docs:check
```

Run the full repository gates when the implementation reaches a durable
integration point:

```bash
pnpm check
pnpm test
pnpm build
```

### Acceptance criteria

- Authored docs explain importer ownership, state visual frames, evidence
  bindings, anchors, and the State View workflow.
- Tests cover the contract and view-model behavior before runtime comparison
  work begins.
- The implementation remains domain-neutral.

## Recommended implementation slices

### Slice 1: contracts and validation

Implement state presentation, visual frame, anchor, and importer visualizer
types additively. Add validators and focused tests. No UI behavior changes.

### Slice 2: view model

Add the pure web State View model that can extract facts, sources, phases, and
overlays from existing snapshots/timelines/evidence. Add tests with synthetic
recording and visual-frame fixtures.

### Slice 3: State View UI

Replace the placeholder state explorer with `StateView.tsx`, using the
existing window renderer and add-window palette. Implement Visual, Structured,
Diff, and Raw modes.

### Slice 4: node entry points

Add `Open State` from selected nodes and inspector surfaces. Persist
source/phase view state and route overlay/fact selections into the global
inspector.

### Slice 5: object-backed images

Wire content references to project object storage/read APIs if visual frames
need screenshots or other large assets. Add authorization and broken-reference
tests.

### Slice 6: runtime comparison

Add expected-vs-actual comparison and mismatch overlays after learned and
observed state paths are stable.

## Open decisions

- Final public names for `StateFact`, `NodeEvidenceBinding`, and visual-frame
  contracts.
- Whether `StateSnapshot.id` should become required in the next schema version
  or stay optional indefinitely.
- Whether content references should use a new `automation-object://` scheme or
  an existing object-store reference shape.
- Which existing evidence artifacts should be converted into
  `NodeEvidenceBinding` first: evidence claims, state-action correlations,
  proposal steps, or policy node metadata.
- Whether a selected overlay should use a new selection kind immediately or
  route through the existing inspector selection until the state selection
  contract is stable.

## Progress log

- 2026-08-12: Step 1 implemented additively. `StateSnapshot` now supports an
  optional ID and presentation frames; state values, descriptors, and schemas
  support presentation metadata; state visual frames and evidence anchors have
  validation; and authored docs describe importer-owned state reconstruction
  content and object/API content references.
- 2026-08-12: Step 2 implemented additively. `StateFactReference`,
  `StateFact`, `NodeEvidenceRole`, `EvidenceComparator`, and
  `NodeEvidenceBinding` now live beside existing `EvidenceReference`
  contracts, with validators proving fact/path/provenance integrity and
  preserving custom comparator parameters.
- 2026-08-12: Step 3 implemented additively. `NodeStateSource`,
  `NodeStateSourceKind`, `NodeStatePhase`, `NodeStateViewSelection`, and
  initial node-state phases now model observed, learned, and runtime state
  sources separately, with validators for source identity and source-specific
  fields.
- 2026-08-12: Step 4 implemented in
  `apps/web/src/features/automation-studio/state/view-model.ts`. The pure view
  model resolves source families, active phase, visual frames, facts, explicit
  and inferred evidence bindings, overlays, structured rows, diff rows, raw
  fallback data, summaries, and empty-state messaging with focused web tests.
- 2026-08-12: Step 5 implemented in
  `apps/web/src/features/automation-studio/views/StateView.tsx`. The existing
  `"state"` workspace view now opens from the add-window palette as State View,
  renders visual frames with importer layers and evidence overlays, provides
  Structured/Diff/Raw fallbacks, and routes overlay/fact clicks through the
  Automation Studio selection model. The old graph-editor State Explorer
  placeholder was removed from `GraphEditorViews.tsx`.
- 2026-08-12: Step 6 implemented. `AutomationSelection` now includes
  `kind: "state"` with node/source/phase/evidence/fact context. The live
  workspace opens `state-explorer` in the main area for state selections, node
  cards dispatch Open State, the inspector exposes Open State for selected
  nodes/proposal steps, timeline state/action clips open the corresponding
  recording state directly, and proposal review can open the selected generated
  node's state.
  Source/phase choices update selection so existing view-state persistence can
  restore them.
- 2026-08-12: Step 7 implemented. Importer SDK manifests now support
  declarative `stateVisualizers` with ID, semantic version, label, supported
  namespaces/kinds/renderer IDs, and metadata. Manifest validation rejects
  duplicate IDs, invalid semver/support lists, package/domain metadata
  mismatches, and any visualizer metadata that claims executable/runtime/storage
  capability. Generated framework references were refreshed.
- 2026-08-12: Step 8 implemented. Automation Studio project object storage now
  accepts binary visual assets, records SHA-256/content type/size metadata in a
  per-project object index, exposes `automation-object://project/<projectId>/<sha256>`
  content references, and serves renderable assets through the authenticated
  `/api/programs/automation-studio/state-assets/<projectId>/<sha256>` API route.
  The web State View converts project object references to that route, leaves
  unsafe or unresolved image refs as placeholders, and tests cover binary asset
  round-tripping plus cross-project object rejection.
- 2026-08-12: Step 9 implemented. Core now exports
  `NodeStateRuntimeComparison` plus validation for expected/actual source IDs,
  actual-output phase, match scores, mismatch severities, and confidence. The
  web State View derives comparison rows from explicit runtime comparison
  artifacts or from expectation/invariant bindings against the active runtime
  snapshot, adds Compare mode, and renders matched, mismatched, and irrelevant
  actual-output overlays as green, red, and gray.
- 2026-08-12: Step 10 implemented. Authored docs now cover importer ownership,
  visual frames, object-backed image references, State View workflow,
  evidence/fact separation, state sources, and runtime expected-vs-actual
  comparison. Generated framework references were refreshed to include the new
  runtime comparison contract/validator. Final validation passed with
  `pnpm check`, `pnpm test`, `pnpm build`, and `pnpm docs:check`.
- 2026-08-12: Initial working plan created after confirming that the existing
  workspace already has a `"state"` view type, placeholder State Explorer, and
  addable window system.
