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
  nodes/            Built-in node definitions, node classes, registry helpers, and node-library layout.
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

Task and routine editors use concise editor modes instead of broad abstract
layers. A mode changes what the canvas is doing; supporting views such as
timeline, signals, recordings, runtime, problems, assistant, state explorer, and
inspector remain ordinary addable windows. The node palette is the exception:
it stays embedded as the collapsible right rail inside the policy/routine node
editor because it is part of direct node editing, not a separate workspace
window.

Task editor modes are:

- `Flow`: the default editable policy graph for adding, moving, connecting, and
  deleting nodes and edges.
- `State`: read/inspect mode for task signals, state entries, deltas,
  volatility, and condition coverage.
- `Evidence`: read/inspect mode for recordings, timeline entries, notes,
  checkpoints, and raw/normalized evidence links.
- `Test Run`: read/inspect preview for replaying or simulating the policy
  against selected recording/state data.

Routine editor modes are:

- `Flow`: the default editable orchestration graph for routine nodes, routes,
  waits, approvals, recovery, and handoffs.
- `Data`: read/inspect mode for routine inputs, outputs, variables, and data
  passed between task/routine nodes.
- `Run Plan`: read/inspect mode for execution order, dependencies, parallel
  paths, approvals, and validation warnings.
- `Test Run`: read/inspect preview for skipped branches, approval pauses,
  retries, and final routine status.

Only `Flow` mode is directly editable in the current implementation. Other
modes keep the same canvas visible for context but disable graph edits and show
their mode-specific details through the global inspector selection model until
deeper inspectors/simulators are connected.

Automation Studio node editors follow the FluxBot v1 flow editor direction:
metadata-first node definitions, grouped palettes, explicit input/output ports,
custom React Flow cards, minimap/controls, draggable node placement, palette
insertion, selectable edges, keyboard deletion, and explicit delete-selected
controls. Policy maps and routine editors share the same node registry concepts
while keeping their scopes distinct: policy maps include evidence-backed task
policy nodes, and routine editors include orchestration nodes without recording
or state layers.

The visual node language is backed by the same node registry definitions used
by execution. Palette-created nodes store their definition ID, icon,
description, full input and output port arrays, editable parameter definitions,
and per-node parameter values. Node cards render the node-specific icon and
description, named port rows, and matching React Flow handles for each port
rather than a generic single input and single output. Manual edges attach to
the exact source and target port handles, label the edge from the selected
output port, and reject incompatible source/target value types at connection
time. Generated policy nodes that do not yet come from a source node definition
receive derived icons and visual ports from the generated policy graph so they
still participate in the same connection language.

The global inspector is also the focused node-detail editor. Automation Studio
does not maintain a separate node-detail window type; saved legacy node-detail
tabs migrate to the global inspector. Selecting an editor-created built-in node
opens with editable parameters first, including a per-instance description that
only affects that node placement in the current flow. Metadata and ports follow
the editable fields, and raw node-definition dumps are intentionally omitted
from the user-facing inspector. Fixed-choice settings use dropdowns, and object
and array settings use structured row editors rather than raw JSON or executor
preview panels. Parameter edits update the selected React Flow node instance so
options such as random-number min/max,
integer vs float mode, precision, and inclusive maximum are part of the live
graph state. Generated policy nodes still show their evidence, condition,
timing, runtime, and training detail sections in the same inspector.

Node parameters must never fall back to unexplained raw text controls. Any
fixed set of choices must be declared with options so the inspector renders a
dropdown. Free-form strings must declare their UI intent: identifier,
reference, object path, field, short text, or long text. References such as
task, policy, routine, action, variable, and database collection IDs render as
reference controls and can later be backed by real project pickers. Parameters
with `any` values render as typed value controls where users choose text,
number, boolean, or empty before entering the value.

Built-in parameter labels and descriptions are user-facing product language,
not implementation terms. Internal executor IDs may remain stable, but the
inspector should say things like `Data table`, `Maximum records`, `Values to
pass in`, or `If the action fails` rather than requiring users to understand
terms such as collection, patch, upsert, timeout route, or raw identifier
fields. Every built-in parameter must include concise help text, and fixed
choice labels should describe the user-visible outcome rather than simply echo
the stored enum value.

Built-in nodes should not be thin palette placeholders. Each source-owned
built-in exposes editable parameters, concrete domain-neutral executor
behavior, and a standardized visual port contract. Visual ports are part of the
programming language, not decoration. Every non-start built-in has a control
input named `in`. Operation-style nodes expose standardized `success` and
`failed` route outputs. Conditional or routing nodes expose their meaningful
visual branch outputs instead, such as `true`, `false`, `case`, `default`,
`body`, `done`, `approved`, `rejected`, and `timeout`, without also adding
generic success/failure exits. Nodes also expose typed data outputs such as
`result`, `value`, `records`, `object`, or `items` when they transfer data to
later nodes. Executor `route` values must match declared route outputs, while
computed values travel through declared data outputs.
Control-flow nodes own route names, case matching, branch inversion, loop
limits, fan-out, merge, and terminal status metadata. Logic nodes own
comparison operators, case sensitivity, and empty/missing input behavior, and
route through `true` or `false` while exposing a boolean `result` data output.

Recording domains are the contract boundary between FluxIQ core and
domain-specific automation repositories. An importing repository registers a
`RecordingDomainDefinition` with accepted event types, payload schemas, state
reducers, and observation extractors. Recording events can then enter through
direct import (`AutomationStudioService.appendRecordingDomainEvent`) or through
the global client gateway WebSocket (`client.recording_event` with `domainId`).
Automation Studio validates the domain and event type before writing anything
to the recording. Accepted events become timeline `domain_event` entries and
may produce observation entries, state deltas, and state checkpoints through
the registered reducer/extractor functions. FluxIQ core must not contain
domain-specific browser automation behavior; it only provides the common
recording, state, signal, runtime, and transport framework.
Math nodes own precision, offsets, rounding modes, clamps, and
divide-by-zero handling while exposing `result` data and success/failure
routes. Random nodes own range, mode, precision, fallback, weighted choice, and
jitter controls. Data nodes own variable defaults/write modes, object mapping
modes, and list predicates. Timing nodes own duration units, jitter, timeout,
retry, backoff, and debounce modes. Policy, routine, and database nodes emit
configurable adapter/effect requests while staying domain-neutral.

Policy and routine editors must not carry their own properties inspector. The
right-side global inspector is the single properties viewer for selected nodes,
edges, signals, timeline entries, policies, recordings, and transient
editor-created nodes. Node palettes live as collapsible right rails inside the
editor canvas area and show icon, name, and description for each node type.
Inner editor footers or redundant status strips should be avoided.

Node placement should follow the FluxBot v1 editor behavior: adding a node while
an unconnected node is selected places the new node to the right of that
selection; otherwise the node is placed at the center of the visible React Flow
camera area. Generated policy layouts should not use a simple zigzag. They are
laid out by graph level from incoming/outgoing edges, with branches spread
vertically inside each level so sequence and branching are readable.

Edges use a custom React Flow renderer rather than the default edge display.
Every manual connection receives a visible label such as `Next` or `Branch 2`,
and generated policy edges surface their own label, kind, or probability. Edge
routes are lane-offset smooth-step paths so sibling or parallel edges do not sit
directly on top of each other. Lane offsets must bend the middle of the route
without moving the source or target endpoint away from the actual node handles.
Delete affordances appear only for selected nodes or selected edges, positioned
over the selected object rather than in a static canvas toolbar.

Built-in Automation Studio nodes live in FluxIQ source under:

```text
packages/fluxiq/src/programs/automation-studio/nodes/
  contracts.ts          Shared node definition, execution, port, parameter, class, scope, and origin contracts.
  registry.ts           Built-in registry, class groups, and scope-filtered palette helpers.
  layout.ts             Documented source and .fluxiq custom-node folder roots.
  shared/               Global helpers usable by every node category.
  control-flow/         Start, end, branch, switch, parallel, merge, loop.
  policy/               Action, expectation, recovery.
  routine/              Task policy, subroutine, approval.
  logic/                Compare, and, or, not.
  math/                 Add, subtract, multiply, divide, clamp, round.
  random/               Random number, random choice, weighted choice, jitter.
  data/                 Constant, get/set variable, object/list transforms.
  database/             Query, insert, and update request nodes.
  timing/               Wait, timeout, retry, debounce.
```

Each subfolder directly under `nodes/` is a node category. Each concrete node
function lives in its own file inside that category, and category-specific
shared logic lives in that category's `shared.ts`. For example,
`control-flow/loop.ts` owns the loop node definition and executor, while
`control-flow/shared.ts` owns helpers shared by branch-like control-flow nodes.
The global `shared/` folder is reserved for helpers used across categories.
This mirrors the FluxBot v1 component-catalog direction while moving the new
framework to source-owned TypeScript node functions instead of one category file
or a YAML-only metadata shell.

Custom node definitions belong in the importing repository's `.fluxiq` folder,
not in FluxIQ source. The global custom-node library is reserved at:

```text
.fluxiq/data/programs/automation-studio/nodes/
  custom/
    control-flow/
    policy/
    routine/
    logic/
    math/
    random/
    data/
    database/
    timing/
    runtime/
    custom/
  packages/
```

Project-local node overrides or project-owned custom nodes remain inside the
project folder:

```text
.fluxiq/data/programs/automation-studio/projects/{projectId}/custom-nodes/
```

Global custom nodes should be reusable across projects. Project-local custom
nodes should be used for project-specific experiments, pinned versions, or
imports that should move with a project export.

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
- reusable view containers with direct move, resize, reset, and close controls;
- a contextual right inspector organized into schema-like sections with value
  provenance;
- a bottom dock for assistant context, problems, state/history, and future
  runtime/debug panels.

The workspace shell now treats these as interactive editor systems rather than
static placeholders. Subwindows own their own tabs and the top workbar no
longer opens every view by default. The default task/routine workspace starts
with a single policy graph tab. A single project-tree click previews the
corresponding view in the active subwindow; a double click opens that view in a
new subwindow. Subwindows and tabs can be closed, reset to default size, moved
by dragging the title bar, resized directly from any side or corner, and
assigned independent canvas geometry.

Subwindow chrome should stay minimal. Pinning, locking, and arbitrary maximize
controls were removed from the window header. The current header actions are
reset window size and close window; advanced layout changes belong in direct
resizing, snap gestures, or topbar layout presets, not a per-window overflow
menu.
Workspace preferences should control frame-level dimensions such as sidebar,
inspector, and bottom dock sizes. Window layout itself belongs to direct
manipulation inside the canvas.

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
`.fluxiq/data/programs/automation-studio/projects/`. The project store is
folder-backed: `index.json` tracks project summaries and grid categories, while
each project gets its own folder named by project ID. A project folder contains
`manifest.json`, `hierarchy/nodes.json`, `hierarchy/deleted.json`,
`workspace/preferences.json`, and reserved subfolders for `tasks`, `routines`,
`configs`, `recordings`, `policies`, `custom-nodes`, and `artifacts`. The
legacy `.fluxiq/data/programs/automation-studio/projects.json` file is imported
into this folder layout when no folder-backed index exists.

Opening a project also writes its encoded project ID into the page URL so
refreshing the editor restores the same project. The chooser presents projects
as a grid grouped by user-created categories. Categories can be created,
renamed, deleted, reordered by drag-and-drop, and used as drag targets for
projects; deleting a category moves its projects back to Uncategorized rather
than deleting them. Projects can be created inside a category, renamed, deleted,
or moved between categories by dragging the project tile onto another category
section.

Project/category create, rename, delete, move, and reorder actions are
privileged mutations. They must carry the active user's security PIN and are
verified server-side through the shared `authorizeProgramPin` helper, which
delegates to the Identity Access service for the current session. This helper
is intentionally global so later programs can use the same PIN authorization
path for their own privileged edit or destructive actions.

Project-owned state includes the custom hierarchy, deleted hierarchy IDs,
subwindow tabs, active subwindow, maximized subwindow, sidebar width, soft
section dimensions, and per-subwindow canvas geometry. The editor has three
semi-hard inner-window areas: main, right sidebar, and bottom bar. Each section
is its own bounded desktop with its own add-window control, window placement,
dragging, resizing, snapping, and layout behavior. The right sidebar spans the
full editor height, can be resized horizontally, and can be collapsed. The
bottom bar spans the main column, can be resized vertically, and can be
collapsed. Collapsing a section must not mutate, minimize, or reflow the
windows inside that section; it only hides or reveals the owning section.

Inner-window sections are bounded desktops rather than scrollable pages, a
fixed inspector layout, a fixed bottom dock layout, or a forced row grid. They
do not scroll horizontally or vertically, and subwindows are clamped inside
their owning inner-window region while moving, resizing, snapping, applying a
layout preset, or when that section resizes. Full-size subwindows use their full
visible section canvas without an extra inset, and child editor content must not
force the shell to spill past its saved geometry. Each subwindow has saved
`area`, `x`, `y`, `width`, `height`, and z-order values.

Inspector and bottom dock content are now utility window views rather than fixed
rails. They are present in the default workspace, but can be moved, resized,
closed, and reopened like any other inner window. Each inner-window section has
an add-window plus button; its palette groups editor, evidence, and tool windows
with icon, name, and description so views that are not directly represented in
the left project hierarchy can still be opened. Generic opens from the project
hierarchy and selection-follow behavior target the main inner-window area. The
only way to add new windows directly into the right sidebar or bottom bar is
through that section's own plus button, and those windows fill their owning
section by default. Section resize grips remain above full-size inner windows
so the right sidebar and bottom bar can still be resized while occupied.
Each inner window also has its own plus button. That button opens the same view
palette, but selecting a view adds it as a tab inside the existing window rather
than creating another subwindow.
When a new subwindow is opened, Automation Studio tries to fill remaining space
to the right of the active window in the target section, then below it, and
finally falls back to a clamped offset window inside that section.

When two subwindow sides are close and their ranges overlap, dragging that side
acts like a shared split boundary: the active window and the adjacent window
resize together until either one reaches its minimum useful size or the canvas
edge.

Dragging a full-section subwindow restores it to a default floating size before
moving, preserving the pointer's relative grab position so users can pull a
maximized window out of fullscreen without first pressing reset.

Dragging a subwindow to the left, right, top, bottom, or any corner of the
inner-window region shows a snap preview. The snap is triggered by the mouse
crossing the region threshold, and it only applies when the user releases the
mouse. Left/right snaps fill half of the visible region horizontally, top/bottom
snaps fill half vertically, and corner snaps maximize the dragged window to the
full owning inner-window section.
Each inner-window section header provides a layout widget beside the section
controls. Section headers are icon-first and do not need visible section title
text. The widget opens as a fixed floating panel, flipping left or upward when
near the viewport edge. Presets apply only to windows inside that section,
distributing extra windows within the selected regions instead of arranging only
the active window. The main area exposes the broader layout set; the right
sidebar exposes fullscreen and vertical 1:1 rows; the bottom bar exposes
fullscreen and horizontal 50/50.

Workspace persistence is debounced and signature-based. Loading a project seeds
the last-saved hierarchy signature, and `save-project-hierarchy` should only be
sent after real hierarchy or workspace changes, not continuously for equivalent
state.

Project recordings now use the same folder-backed ownership model as project
workspace state. Each project reserves:

```text
.fluxiq/data/programs/automation-studio/projects/{projectId}/recordings/
  sessions/{recordingId}/recording.json
  sessions/{recordingId}/events/timeline.json
  sessions/{recordingId}/snapshots/initial-state.json
  normalized/{normalizedTimelineId}.json
  indexes/recordings.json
```

`recording.json` is the canonical `RecordingSession` envelope. The timeline
and snapshot files are deliberate helper artifacts for later inspectors,
recording scrubbers, diff viewers, and export tooling; they do not replace the
canonical recording document.

Project-owned authoring artifacts are now explicit documents instead of only
hierarchy rows. Each project reserves:

```text
.fluxiq/data/programs/automation-studio/projects/{projectId}/
  tasks/{taskId}.json
  routines/{routineId}.json
  configs/{configId}.json
  flows/{flowId}.json
  runtime/sessions/{runId}.json
  runtime/indexes/sessions.json
  state/
```

Task, routine, config, and flow files are the canonical project edit targets.
Hierarchy rows are navigation and organization; they should point at these
documents rather than becoming the only source of task/routine identity. Flow
documents use Automation Studio node definition IDs, per-node parameter values,
named source/target ports, positions, labels, descriptions, and metadata so the
visual graph and executor speak the same language.

Automation Studio now has a neutral graph executor for these flow documents.
The executor starts at the `builtin.control.start` node when present, runs
built-in node executors, carries typed data outputs into later node inputs,
follows named route ports such as `success`, `failed`, `true`, `false`, and
records an execution trace with attempts, outputs, effects, status, and a final
message. This executor is intentionally separate from host-specific automation:
browser, scraping, lead-generation, desktop, or game adapters plug in later
through the adapter contract rather than living in FluxIQ core.

Runtime sessions persist per project. A session stores the target kind, target
ID, flow ID, status, queued/started/finished timestamps, the flow snapshot used
for the run, and the execution trace. The API exposes project artifact
read/write, normalized timeline listing, runtime session listing, session
start, and session run endpoints. Recording mutation endpoints remain
privileged through the shared PIN authorization path.

The runtime adapter contract is the boundary for importer repositories. An
adapter advertises capabilities, optional state schemas, optional action
definitions, observation capture, and action execution. A future web automation
repository should provide DOM/browser/session implementations of that contract;
FluxIQ core should stay domain-neutral.

The recording/state bridge includes a controller that can subscribe to an
`AutomationStateStore` and append state checkpoints or deltas into a
`RecordingSession`. This is the core pattern for live recording: host adapters
observe external systems, write normalized state, and the controller turns those
changes into durable evidence.

Routine editors open as blank canvases until a user adds nodes from the palette.
They must not seed fake routine nodes just because a routine tab opens. Policy
editors may display generated policy nodes from the selected task policy, but
manual nodes and connections are still edited through the same palette and
React Flow interaction model.

The inspector follows global selection, the bottom dock switches between real
panels, and the timeline supports zoom, track visibility, event selection, and
selected-range summary data.

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

The state and recording framework now includes:

- `AutomationInMemoryStateStore` for reads, writes, snapshots, restore, diff,
  schema registration, and subscriptions.
- `diffStateSnapshots` and `applyStateDeltas` for consistent change detection
  and replay.
- `buildSignalRegistryFromSchemas` and `discoverSignalDefinitions` so state
  schemas and observed snapshots become visual signal definitions.
- recording helpers for create, append timeline entry, append checkpoint,
  append delta, append note, and finalize.
- `ConservativeTimelineNormalizer`, which preserves raw timeline entries while
  deriving state deltas from checkpoints and linking normalized entries back to
  raw evidence.

The Automation Studio API exposes these as first-class framework endpoints:
`list-recordings`, `get-recording`, `create-recording`,
`append-recording-entry`, `finalize-recording`, `normalize-recording`,
`inspect-state-diff`, and `list-signal-registries`. Mutating endpoints are
privileged and should use the same shared PIN authorization path as project and
category edits.

Domain scope is part of the document identity. Raw recordings read it from the
recording environment; derived artifacts carry it in metadata until richer
project/task ownership records exist.

## Client Gateway

Automation Studio can also receive evidence and dispatch actions through the
global client gateway. This is the framework-side boundary for any
WebSocket-capable recorder or action executor. Browser extensions are one
client type, but the protocol is deliberately generic so desktop recorders,
CLI workers, mobile clients, and importer-owned automation clients can connect
without importing FluxIQ directly.

The reusable gateway lives under `packages/fluxiq/src/client-gateway/`:

- `contracts.ts` defines the versioned JSON protocol, client capabilities,
  session records, pairing challenges, audit entries, and a socket interface
  that hosts can back with any WebSocket implementation.
- `service.ts` owns in-memory session state, approval references, session tokens,
  outbound server messages, command/result correlation, timeouts, heartbeat
  messages, and gateway events.
- `@fluxiq/client-gateway-websocket` is a small typed client package for
  WebSocket-capable recorders. It re-exports the same protocol types as
  `fluxiq/client-gateway` and the same Automation Studio recording request
  types as `fluxiq/automation-studio`. Its Automation Studio facade mirrors
  direct-import method params such as `createRecording`,
  `appendRecordingEvent`, `appendRecordingDomainEvent`, and
  `finalizeRecording`, but implements them by sending websocket messages. The
  package is split into transport, message helpers, Automation Studio facade,
  and shared types so the public `index.ts` stays an export doorway rather than
  the implementation.

Automation Studio consumes the gateway through
`packages/fluxiq/src/programs/automation-studio/client-gateway/bridge.ts`.
The bridge converts client messages into canonical Studio artifacts:

- `client.recording_event` is accepted only when its `domainId` and `eventType`
  match a registered `RecordingDomainDefinition`; accepted events become
  `domain_event` timeline entries and may derive observations, state deltas,
  and state checkpoints.
- `client.browser_state` and `client.dom_snapshot` become `observation`
  timeline entries.
- `server.execute_action` waits for `client.action_result`; resolved action
  results are appended as `action` timeline entries when a client recording is
  active.
- `server.start_recording` and `server.stop_recording` are mirrored to the
  client while the canonical `RecordingSession` remains owned by FluxIQ.

The protocol starts with:

```text
client.hello
server.pairing_required
web panel approve
server.session_ready
```

Paired clients can then send browser state, snapshots, recording events, action
results, and errors. FluxIQ can send start/stop recording, capture snapshot,
set active tab, ping, disconnect, and execute action commands. Every message is
versioned JSON with an ID and timestamp; action commands include a command ID
so results can be correlated.

The web app starts a concrete WebSocket listener from the shared
`apps/web/src/lib/fluxiq.ts` runtime singleton when
`FLUXIQ_CLIENT_GATEWAY_ENABLED` is not `false`. The default development
endpoint is:

```text
ws://127.0.0.1:4777/client
```

`apps/web/src/server/client-gateway-websocket.ts` owns the dependency-free Node
WebSocket adapter. It accepts upgrade requests, validates configured origins,
attaches sockets to `ClientGatewayService.connect()`, forwards incoming text
frames to `receiveRaw()`, and relies on the service to serialize outbound
messages through the provided socket. Startup is intentionally bound to
`getFluxIQ()` rather than an independent instrumentation runtime so app API
routes and the WebSocket listener share the same in-memory gateway sessions.

Importing repositories or production hosts can still provide their own socket
adapter. The framework package only requires a `ClientGatewaySocket` with
`send()` and optional `close()` methods.

Automation Studio exposes framework API endpoints for the editor:

- `client-gateway-snapshot`
- `create-client-pairing`
- `start-client-recording`
- `stop-client-recording`
- `capture-client-snapshot`
- `execute-client-action`

The web shell exposes global client-gateway endpoints:

- `GET /api/client-gateway/snapshot`
- `POST /api/client-gateway/approve-pairing`
- `POST /api/client-gateway/dismiss-pairing`

Start/stop recording and action execution are privileged operations and use
shared PIN authorization. Client-initiated pairing requests can create pending
display references without PIN because the client still cannot pair until a
signed-in web-panel user approves the request.

The initial UI is the `Connected Clients` inner-window view. It lists paired
sessions, starts/stops recordings, queues snapshots, and sends test actions
using client-declared action capabilities. Pairing itself is globalized at the
web-panel shell through `/api/client-gateway/snapshot`, so a request can pop up
from any signed-in page or program instead of requiring Automation Studio to be
open. Closing or dismissing the pairing modal calls
`/api/client-gateway/dismiss-pairing` and removes the pending challenge from
the gateway, so dismissed requests do not reappear after a browser refresh.
Approving the modal calls `/api/client-gateway/approve-pairing`; the client
then receives `server.session_ready` with its session token.

Extension/client connection flow:

1. Start the web app with `pnpm --filter @fluxiq/web dev`.
2. Sign in to the FluxIQ web panel.
3. Click connect in the extension and connect it to `FLUXIQ_PUBLIC_CLIENT_WS_URL` or the default
   `ws://127.0.0.1:4777/client`.
4. The extension sends `client.hello` with the client type, name, capabilities, and any saved
   session token.
5. If FluxIQ replies with `server.pairing_required`, the global web-panel shell
   shows a modal with Approve and Reject controls. The modal displays the same
   reference code sent to the client so the user can verify the right client is
   being approved.
6. If the user approves, FluxIQ pairs the waiting socket directly.
7. Store the token returned by `server.session_ready`; future `client.hello`
   messages can include it to reconnect without another approval.
8. Stream `client.browser_state`, `client.dom_snapshot`,
   `client.recording_event`, `client.action_result`, and `client.error` as
   appropriate. Execute incoming `server.execute_action`,
   `server.start_recording`, `server.stop_recording`, and
   `server.capture_snapshot` commands according to the declared client
   capabilities.

For framework-side smoke testing without the real extension, run:

```bash
pnpm --filter @fluxiq/web mock:client
```

The mock client will print the reference code it receives and then wait for
approval from the web panel.

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
