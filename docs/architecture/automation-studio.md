# Automation Studio Architecture

Automation Studio is the FluxIQ authoring surface for recordings, learned task
models, generated policy graphs, and runtime debugging. It is a global
framework program, but it must remain domain-neutral. Host projects provide the
signals, actions, events, capabilities, recordings, generated policies, and
runtime adapters for their own domains.

## Evidence Layers

Automation Studio separates evidence from interpretation:

```text
Raw Recording
  -> Normalized Timeline
  -> Signal Mining
  -> Learned Task Model
  -> Generated Policy Graph
  -> Runtime Execution + Training Data
```

The raw recording is immutable evidence. Normalization, mining, policy
generation, AI proposals, and runtime training create new artifacts that point
back to earlier evidence with stable references. This lets a host project
improve miners or regenerate policies without recapturing the task.

## Folder Ownership

Automation Studio is intentionally split by subsystem:

```text
packages/fluxiq/src/programs/automation-studio/
  api/              Program API request and response contracts.
  fingerprinting/   Node/state scoring contracts.
  learning/         Learned task model contracts.
  mining/           Signal mining result and miner contracts.
  model/            Canonical evidence, state, signal, recording, policy, and runtime models.
  normalization/    Raw-recording to normalized-timeline contracts.
  runtime/          Program runtime integration contracts.
  storage/          Repository contracts for prototype and canonical artifacts.
  ui/               Program UI state contracts.
```

The root folder should stay small. New domain-neutral model concepts belong in
`model/`. Pipeline-specific contracts belong in the matching pipeline folder.
Implementation files should follow the same boundary rather than collecting in
one large `types.ts`.

The legacy prototype `types.ts` remains exported while Automation Studio moves
toward the canonical model. Domain-specific automation code, private
recordings, generated downstream policies, and domain assets do not belong in
this repository.

## First Core Contracts

The initial canonical contracts live under
`packages/fluxiq/src/programs/automation-studio/model`:

- `RecordingSession` stores an append-only timeline with an initial state
  snapshot, timeline entries, notes, source descriptors, action channels, and
  environment metadata.
- `StateSnapshot`, `StateNamespace`, and `StateValue` model observable state as
  independently addressable signals instead of one opaque JSON blob.
- `SignalRegistry` describes signal paths, comparators, default weights,
  volatility, persistence, tags, sensitivity, and derived-signal provenance.
- `ActionDefinition` describes available domain-neutral action types,
  parameters, capabilities, preflight requirements, and safety metadata.
- `PolicyGraph` and `PolicyNode` describe runtime decisions with eligibility,
  readiness, actions, success conditions, failure conditions, invariants,
  timeout, retry, recovery, outgoing edges, and source evidence.
- `RuntimeActionAttempt` records runtime action lifecycle data in a shape that
  can be compared with operator recordings.

These contracts are intentionally richer than the existing shallow Automation
Studio prototype types. The prototype exports remain in place while the
canonical model is adopted incrementally.

## Pipeline Contracts

The first slice also defines contract-only homes for upcoming stages:

- `normalization` owns `NormalizedTimeline`, checkpoint policy, normalization
  issues, and the `TimelineNormalizer` interface.
- `mining` owns mining windows, action-effect candidates, learned condition
  candidates, mining results, and the `SignalMiner` interface.
- `learning` owns the intermediate `LearnedTaskModel`, action clusters,
  learned effects, transitions, uncertainties, and the `TaskModelLearner`
  interface.
- `fingerprinting` owns node scoring contributions, candidate scores, scoring
  context, and the `FingerprintScorer` interface.

## Validation Boundary

Automation Studio has lightweight validation helpers for the first slice:

- `validateRecordingSession`
- `validateSignalRegistry`
- `validatePolicyGraph`

The validators catch structural issues such as duplicate IDs, non-increasing
timeline sequences, invalid weights, invalid edge probabilities, missing edge
targets, empty condition groups, and note links that no longer resolve.

Validation should run before later stages consume an artifact. The intent is
not to prove that a policy is correct, but to prevent malformed evidence from
flowing into normalization, mining, graph generation, or runtime execution.

## Program Workspace UI

Automation Studio is a fullscreen program workspace, not a standard padded
program detail page. The app shell keeps the global program topbar, then gives
the remaining viewport to the studio itself.

The default design layout follows the consultant plan:

- left sidebar: project hierarchy for folders, tasks, routines, and
  configurations;
- center workspace: the active design/debugging surface;
- right inspector: synchronized details for the selected policy node, policy,
  recording, timeline entry, or signal;
- bottom dock: timeline, notes, problems, and runtime/debug activity.

The policy graph display uses React Flow/XYFlow (`@xyflow/react`), matching the
node display framework used by the FluxBot v1 flow editor. Policy graph nodes
should remain custom cards with explicit input/output handles, evidence badges,
condition counts, recovery metadata, and source-linked details. Runtime and
design views should reuse the same graph components so generated policies,
debugging state, and recorded evidence stay visually comparable.

Routine editing also uses the same React Flow/XYFlow canvas foundation, but it
is a routine orchestration graph rather than an evidence-backed task policy
map. Routine nodes are static base/custom node types such as start, task policy,
decision, approval, recovery, end, and custom extension nodes. Routine views do
not expose recording, evidence, or state-signal layers.

The first UI surface includes the core views called out in the studio plan:
policy design, recordings, signals, runtime debugging, and problems. Later
slices should add routine editing, interface editing, command palette support,
lockable synchronized views, provenance overlays, and history/change tracking
without collapsing these concerns into one generic dashboard.

The current web shell implements the first workspace foundation pass:

- a main command bar for undo, redo, save, record, run, pause, stop, step, and
  debug commands;
- editor-style view instance tabs rather than a single mode switcher;
- a searchable project hierarchy with real folder rows and object-type visual
  treatment for tasks, routines, folders, and configurations;
- a default side-by-side task workspace with policy graph on the left and
  timeline on the right;
- reusable view containers with lock, pin, maximize, and menu controls;
- a contextual right inspector organized into schema-like sections with value
  provenance;
- a bottom dock for assistant context, problems, state/history, and future
  runtime/debug panels.

The workspace shell now treats these as interactive editor systems rather than
static placeholders. Subwindows own their own tabs and the top workbar no
longer opens every view by default. The default task/routine workspace starts
with a single policy graph tab. A single project-tree click previews the
corresponding view in the active subwindow; a double click opens that view in a
new subwindow. Subwindows and tabs can be closed, pinned, locked, maximized,
and assigned independent width preferences.

The left hierarchy editor is limited to folders, tasks, routines, and
configurations. Interfaces are no longer represented as project hierarchy
objects. The tree uses real explorer-style root folder structures for tasks,
routines, and configurations. Each structure owns its own expandable/collapsible
folders, and folder rows keep add/delete controls. Creating a hierarchy item
first opens a category-aware type chooser for folder, task, or routine, then
asks for name, location, and PIN authorization. Delete actions remain privileged
and require PIN authorization.

Automation Studio opens through a project chooser. Users must create or open a
project before the editor workspace appears. Projects and their owned state are
persisted under the importing repository's `.fluxiq` root, currently at
`.fluxiq/data/programs/automation-studio/projects.json`. The chooser presents
projects as a grid grouped by user-created categories. Categories can be
created, renamed, deleted, reordered by drag-and-drop, and used as drag targets
for projects; deleting a category moves its projects back to Uncategorized
rather than deleting them. Projects can be created inside a category, renamed,
deleted, or moved between categories by dragging the project tile onto another
category section.

Project/category create, rename, delete, move, and reorder actions are
privileged mutations. They must carry the active user's security PIN and are
verified server-side through the shared `authorizeProgramPin` helper, which
delegates to the Identity Access service for the current session. This helper
is intentionally global so later programs can use the same PIN authorization
path for their own privileged edit or destructive actions.

Project-owned state includes the custom hierarchy, deleted hierarchy IDs,
subwindow tabs, active subwindow, maximized subwindow, sidebar width, inspector
width, bottom dock height, windows per row, and per-subwindow width and height
preferences. The subwindow area scrolls vertically so users can keep adding
windows without compressing every editor into an unusable height. Rows are
dynamic: a row with a single subwindow expands that subwindow to the full row,
while multi-window rows use each subwindow's saved width weight.

The inspector can follow or lock global selection, the bottom dock switches
between real panels, and the timeline supports zoom, track visibility, event
selection, and selected-range summary data.

These controls are the UI foundation. Follow-up slices should connect them to
the persistent workspace layout model, command registry, undo/redo stack,
drag-and-drop pane docking, and schema-driven edit definitions.

## Canonical Persistence

Automation Studio canonical artifacts use a shared repository contract with
stable document IDs:

| Artifact | Repository | Document ID |
| --- | --- | --- |
| `RecordingSession` | `recordingSessions` | `recordingId` |
| `NormalizedTimeline` | `normalizedTimelines` | `normalizedTimelineId` |
| `SignalRegistry` | `signalRegistries` | `registryId` |
| `LearnedTaskModel` | `learnedTaskModels` | `learnedTaskModelId` |
| `PolicyGraph` | `policyGraphs` | `policyId` |

The first implementation is an in-memory repository for framework tests,
prototype wiring, and pipeline development. Durable storage can later wrap the
same contracts with SQLite or host-owned document storage.

Repository reads return cloned documents. Callers should modify a document by
loading it, creating the next version or edited artifact, and writing it back
explicitly. This matters because recordings are evidence, while normalized
timelines, learned models, policies, and runtime training data are derived
artifacts.

Domain scope is part of the document identity. Raw recordings read it from the
recording environment; derived artifacts carry it in metadata until richer
project/task ownership records exist.

## Domain Boundary

The core model does not assume screenshots, DOM nodes, games, browsers, pointer
events, or any private domain behavior. Those are domain implementations of
generic concepts:

- observations produce state signals;
- actions dispatch through declared action channels;
- notes remain first-class evidence;
- policy nodes decide when an action is eligible, ready, successful, failed, or
  unsafe to continue;
- evidence references preserve the path back to recordings, notes, mined
  signals, generated nodes, and runtime attempts.

Host projects own domain-specific interfaces, adapters, recordings, generated
policies, and runtime artifacts.

## Near-Term Build Order

The next Automation Studio slices should build on the first contracts in this
order:

1. Persist canonical recordings, registries, and policy graphs through the
   Automation Studio repositories. Done for in-memory canonical repositories.
2. Add a conservative timeline normalization pass using the normalization
   contracts.
3. Add fingerprint scoring over `StateSnapshot` and `PolicyNode` conditions.
4. Build the minimal runtime controller around node scoring, action dispatch,
   expectation tracking, retry, and recovery.
5. Add deterministic mining stages for action windows, change detection,
   relevance scoring, and learned requirements.
6. Introduce the learned task model between mined evidence and generated policy
   graphs.
