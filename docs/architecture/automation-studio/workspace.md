# Automation Studio Workspace And Authoring UI

[Back to the Automation Studio overview](../automation-studio.md)


Automation Studio is a fullscreen program workspace, not a standard padded
program detail page. The app shell keeps the global program topbar, then gives
the remaining viewport to the studio itself.

The Next route layer should stay thin. `apps/web/src/app/programs/[programId]/`
owns routing, authentication handoff, and the generic program workspace shell.
Automation Studio React implementation code belongs under
`apps/web/src/features/automation-studio/`, while reusable web-panel helpers for
all program views belong under `apps/web/src/features/programs/`.

The web-side feature layout is:

```text
apps/web/src/features/automation-studio/
  AutomationStudioLive.tsx   Feature entrypoint for the live workspace.
  model/                     Pure project-artifact identity and translation helpers.
  graph/                     React Flow port rules, connection helpers, edge routing, and graph view models.
  hierarchy/                 Project tree/modal components, generated recording nodes, and hierarchy signatures.
  parameters/                Node parameter inspector controls and value coercion helpers.
  runtime/                   Small UI-triggered runtime payload builders and execution helpers.
  timeline/                  Timeline titles, summaries, icons, and durations.
  types.ts                   Shared Automation Studio UI/view/editor types.
  views/                     Named workspace pane modules: renderer, timeline, proposal,
                             state, client/config/assistant, graph editors, workspaces, inspector,
                             dock, and shared view utilities.
  workspace/                 Strict workbench layout, pane/sidebar/dock defaults, and sizing math.

apps/web/src/features/programs/
  live-views.tsx             Compatibility export facade for non-Automation live workspaces.
  live-views/                One contract-typed view per global program plus shared view utilities.
  program-api.ts             Generic `/api/programs/{programId}/{endpoint}` client hook.
  shared-ui.tsx              Reusable panels, fields, tables, badges, modals, and alerts.
  types.ts                   Shared program-view types such as the authenticated user shape.
  ProgramLiveViews.tsx       Program switchboard only.
```

`ProgramLiveViews.tsx` must remain a switchboard and must not grow program
implementation logic. New workspace layout behavior belongs in
`automation-studio/workspace/`; project organization UI belongs in
`automation-studio/hierarchy/`; React Flow port, edge, node, layout, and
connection rules belong in `automation-studio/graph/`; timeline interpretation
for UI display belongs in `automation-studio/timeline/`; node parameter editing
belongs in `automation-studio/parameters/`; workspace pane implementations
belong in `automation-studio/views/`; and API orchestration should move behind
named Automation Studio hooks or action modules before new endpoints are added.
The current `AutomationStudioLive` entrypoint still owns coupled React state
and effects for project, recording, and window workflows. New pure derivation
must go into `model/`; new stateful workflows should be extracted by state
owner only when they can avoid duplicating state between a hook and the
composition component.

The default design layout follows the consultant plan:

- left sidebar: project hierarchy for proposals, recordings, folders,
  tasks, routines, configurations, and recordings;
- center workspace: the active design/debugging surface;
- right inspector: synchronized details for the selected policy node, policy,
  recording, timeline entry, or signal.

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

The Flow is the root product object. Its workbench exposes first-class inner
views for Router, Subflows, Instructions, Runs, Adaptations, Recordings,
Runtime Debug, and Settings. The State View remains a global
evidence window that can inspect state for any selected Flow, recording,
adaptation, node, or previous run. The single Flow editor remains the editable
graph canvas, while supporting views such as runtime evidence, state
reconstruction, adaptation review, and inspector detail are routed into fixed
workbench regions rather than arbitrary floating windows. The node palette
stays embedded as the collapsible right rail inside the policy/routine node
editor because it is part of direct node editing, not a separate workspace
window. Legacy Task/Routine documents may still open through a clearly marked
read-only compatibility view, but they are not independent authoring modes.

The left project hierarchy is the primary discovery surface for Flow-owned
objects. It does not render separate visual top-level buckets for recordings,
proposals, configuration, or other artifact categories. Flows are the product
roots. A Flow row expands into framework-owned child folders and objects:
Router, Subflows, Instructions, Recordings, Adaptations, Runs, Runtime Debug,
and Settings. Subflows appear as child objects inside the Subflows folder for
their owning Flow; recordings, adaptation/change-review records, and settings
appear inside the same owning Flow hierarchy rather than in global category
trees. Flow change proposals and proposal-linked change records are shown as
adaptation objects inside the Adaptations folder, because Adaptations is the
single audit/review surface for generated Flow changes. State is intentionally not a Flow-owned sidebar object
because the State View is a global inner window reused from Flow, recording,
adaptation, node, and run contexts. Flow-level configuration is reached through
the Settings object; the Flow row gear action opens that Settings surface
instead of a separate Config view. Selecting a Flow-owned object keeps the
owning Flow as context and opens the relevant editor, detail, evidence, or
debug surface in
the main workbench. Generic custom folder create/delete controls are not shown
for generated Flow-owned hierarchy nodes because those objects are managed by

Workbench views must be summary-first. Opening a project or Flow may load
hierarchy, Flow summaries, recording summaries, paged run summaries, domains,
and workspace preferences, but it must not hydrate full recordings, run event
logs, normalized timelines, runtime traces, subflow details, instruction
details, adaptation details, or change-proposal details until the user opens
that specific record. Raw JSON, full prompts, traces, and state dumps stay
behind explicit expansion controls inside the relevant detail view.

Project refresh should treat the left hierarchy as a critical path. Flow,
project artifact, and recording-summary results are committed as each request
finishes instead of waiting for heavier runtime, pipeline, or validation data.
The Flow catalog endpoint reads compact adaptation/proposal warning status but
does not revalidate every recording-derived compatibility proposal during
sidebar load; deeper adaptation or pipeline views own that heavier validation
work.

The recording timeline dock follows a video-editor-style horizontal layout.
Recording selection belongs to the project hierarchy sidebar under the
Recordings root. Recording rows are auto-grouped by client folder, and each
recording child is labeled by its recording start date/time. The timeline
dock itself is the editor/review surface for the selected recording: it has
selected-recording controls, a selected-event detail strip above the editor,
lane labels, horizontally and vertically scrollable clips, and a compact
overview strip below the editor. Clicking an overview preview snaps the editor
to that timeline location. Raw elapsed time is rendered as explicit wait clips
in a Timing lane from adjacent recorded monotonic offsets, so long pauses do
not create confusing blank space. Actions, domain events, observations, state
deltas, checkpoints, notes, and markers each render in their appropriate lane
with distinct visual treatments. Selecting any clip updates the global
inspector selection with event-specific details, timing gaps, source,
correlation, and recording context.

Recording client folders and recording rows in the project hierarchy are
generated from persisted recording sessions. They must not be hidden by the
custom hierarchy `deletedHierarchyIds` list. Deleting a generated recording row
or a generated recording client folder is a destructive recording operation:
the UI asks for the user's PIN, then deletes the underlying recording session
or all recording sessions contained by that client folder.

Recording-derived proposal artifacts remain compatibility data for the staged
recording pipeline, but they are no longer a primary Flow hierarchy surface.
When a Flow owns proposal-linked change records, the sidebar shows them under
Adaptations so users review change history, approval state, and generated edits
from one place.

Demo recording fixtures such as `Demo Environment` are test fixtures only.
The Automation Studio service does not seed fixture recordings by default in
the web panel or imported runtime; callers must explicitly opt in with
`seedFixture: true` for tests or examples.

The recording-to-Policy-Flow pipeline is intentionally staged internally:

1. Capture one or more raw `RecordingSession` documents from direct-import
   framework calls or a paired client gateway session.
2. Finalize raw recordings so the evidence boundary is explicit.
3. Normalize each recording into a `NormalizedTimeline` while preserving raw
   evidence links and monotonic timing gaps.
4. Mine normalized timelines for reusable signals, state deltas, action
   clusters, waits, branches, and unresolved questions.
5. Propose a Policy Flow graph directly from mined evidence, with every
   generated node and edge linking back to evidence.
6. Apply the proposed Policy Flow only after explicit approval.

In the normal UI, recordings are optional evidence and demonstration material,
not a required Flow creation path. A user may still record a specific custom
scenario when text instructions would be too slow or ambiguous, and finalized
recordings remain raw source material until explicitly opened or used as
evidence. Change proposals are generated from run evidence, user instructions,
adaptations, and Flow/subflow edit needs; proposal approval can be automatic,
manual, or mixed by scope. Manual recording pipeline endpoints remain available
for debugging and advanced tooling, but they are not the primary product
surface. Applying or approving a generated proposal remains a privileged
mutation and still requires PIN authorization.

Model learning and replay/validation are not recording pipeline stages in the
current product surface. Model-shaped artifacts may still be used internally as
compatibility data, and replay belongs to a separate runtime view.

The Flow editor must not expose State/Evidence tabs or other non-editing
canvas modes unless they materially change a real workflow. State and evidence
inspection belongs in dedicated workspace views and the global inspector, where
recording timelines, proposal evidence chains, selected state facts, and signal
relationships can show enough context to be useful. Other runtime, replay, or
simulation work belongs in separate runtime/debug workspace views, not as a
`Test Run` layer inside the Flow editor.

The State View is the dedicated reconstructed-state window. It uses importer
supplied `StateSnapshot` presentation metadata, visual frames, coordinates, and
anchors to render what the automation saw, then FluxIQ overlays state facts and
node evidence. Core rendering remains generic and domain-neutral: importers own
domain content and visual semantics, while FluxIQ owns validation, fallback
structured/raw views, selection, provenance, and common overlays.

State entities, state facts, and node evidence bindings are separate. A state
entity is the thing being reconstructed or highlighted, such as a UI element,
document region, game object, API resource, or imported domain entity. A state
fact is an addressable attribute/value observed about that entity or about the
global state. A node evidence binding identifies the selected node's role for a
fact, such as eligibility, readiness, expectation, failure, context, or
invariant. This lets the State View show "what was observed" separately from
"what thing it belongs to" and "why this node cares," and lets the same fact
appear in different roles for different nodes.

The State View also distinguishes source families. Observed state is a concrete
recording moment or checkpoint. Learned state is an aggregate for a node across
one or more recordings and must not be presented as one literal screenshot.
Runtime state is the current live or run-session view. The initial phases are
input, action, and expected output. Runtime sources also enable actual output,
where the State View compares the node's expected facts with the runtime facts
that were actually observed.

State View derivation belongs in a pure web view-model module rather than in
React component state. The model resolves selected-node titles, sources,
phases, visual frames, normalized facts, evidence bindings, overlays,
structured rows, diff rows, raw fallback data, summaries, and empty-state
messages without DOM access or API calls. UI components consume that model
instead of re-deriving evidence or mutating recording artifacts.

The `"state"` workspace view is implemented as the dedicated State View rather
than a graph-editor placeholder. It appears in the add-window palette as
`State View`, renders importer-supplied visual frames in a scaled aspect-ratio
canvas, draws FluxIQ evidence overlays above image/text/region/element layers,
and always provides Structured, Diff, and Raw modes as fallbacks. Clicking an
overlay or fact routes selection through the global Automation Studio selection
system so the global inspector can show the selected evidence/fact context.
State View does not keep a separate inner Evidence/Facts list; the reconstructed
state surface gets the available space, and selected state entity, state fact,
and node evidence details belong in the global right sidebar.

Visual mode combines screenshot and document reconstruction into one state
canvas when the snapshot supplies enough metadata. Screenshot image layers and
`boundsKind: "screenshot"` / `renderKind: "screenshot-bbox"` overlays use
viewport pixel coordinates, then render at the viewport's scroll position inside
the document canvas. `boundsKind: "document"` / `renderKind: "direct-rendered"`
boxes use document pixel coordinates and can render known elements outside the
screenshot. Both coordinate kinds use the same `statePath` values so selecting
any box selects the same state fact and derived state entity.

Large visual frame image layers are not embedded in source or read from local
paths. Importers write screenshots and binary visuals to the owning project's
Automation Studio object storage and store digest references such as
`automation-object://project/<projectId>/<sha256>` in the snapshot. The web
State View resolves those references to the authenticated
`/api/programs/automation-studio/state-assets/<projectId>/<sha256>` route,
which checks the session, `programs.read`, project membership, object index,
digest format, and renderable media type before returning the asset. Broken or
unauthorized references render as visible placeholders.

The state asset route also supports importer screenshot ingestion with `PUT`.
Writers send raw image bytes to the same project-plus-digest URL, require
either `programs.write` from the web session or a paired client-gateway bearer
token, and receive the canonical object reference to use in an image layer.
Screenshots are only the optional background layer: the importer should continue
sending element bounds, labels, control metadata, and fact anchors so the State
View can draw FluxIQ-owned overlays above the image and keep them selectable,
filterable, and connected to the inspector.

Runtime comparison is modeled with `NodeStateRuntimeComparison`. A comparison
names the expected source, actual runtime source, node, `actual_output` phase,
matched evidence/fact pairs, mismatched evidence/fact pairs, and optional
confidence. When an explicit comparison artifact is not present, the web view
can derive a basic comparison from expectation and invariant evidence bindings
against the active runtime snapshot. Visual overlays use green for matched
expectations, red for mismatches, and gray for unbound runtime facts. Selecting
a mismatch still routes through the global selection model so the inspector can
show the evidence/fact details without changing the Flow graph.

State explanation is reachable without changing the Flow graph. The inspector
shows `Open State` for selected policy, editor, proposal, and state-backed
nodes; selected policy node cards expose an icon-only state action; timeline
state/action clips can be double-clicked to open the corresponding recording
state; and proposal review can open state for the selected generated node.
These entry points set a `kind: "state"` selection and activate the
`state-explorer` workspace view in the main area. Source and phase choices are
kept in that selection so existing per-view workspace persistence restores them
when users switch tabs/windows.

Automation Studio node editors follow the FluxBot v1 flow editor direction:
metadata-first node definitions, grouped palettes, explicit input/output ports,
custom React Flow cards, minimap/controls, draggable node placement, palette
insertion, selectable edges, keyboard deletion, and explicit delete-selected
controls. Deterministic, orchestration, evidence, and policy-like behavior is
modeled through ordinary nodes and runtime/source metadata, not through a
region authoring toolbar in the visual canvas.

Flow-level configuration is not edited at the top of the canvas. Name,
description, typed inputs/outputs, declared errors, variables, publication
intent, authorized domains, and runtime defaults belong to the generated Flow
configuration/source artifact. Every canonical Flow save writes a generated
config artifact at `configs/<flow-config-id>/config.json` with ownership
metadata linking it back to the Flow and a durable TypeScript DSL source file
under `source/flows/<flow-id>.flow.ts` inside the project `.fluxiq` tree. The
generated source file exists even when visual IR remains authoritative, so code
review, export, and future CI checks have a stable file to inspect. Explicit
code-owned conversion writes the authoritative module under `source/<moduleId>`
and records the module through `flow.source.moduleId`.

Source ownership is configuration, not a Flow canvas mode. The config view is
the editable surface for Flow identity, runtime defaults, source ownership, and
future global or node-contributed configuration fields. State and evidence
inspection belongs in the state explorer, proposal view, and global inspector
rather than inside the graph canvas. Node-contributed
configuration must register through a Flow config extension contract and render
in the config/global inspector surfaces rather than creating another inspector
inside the canvas.

Generated Flow configs are excluded from legacy task/routine migration backups
so they do not make legacy source data appear dirty. Flow and task rows in the
left hierarchy expose a gear action before the delete action; clicking it opens
the configuration view for the selected automation item. The visual editor
dirty state therefore tracks graph node/edge edits, while Flow configuration
changes are handled by the config/source surface.

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

Flow and policy-region editors must not carry their own properties inspector. The
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

Custom node definitions belong in the importing repository's authored domain
source, not in FluxIQ source or ignored `.fluxiq` runtime state. The default
domain custom-node root is:

```text
domains/{domain-id}/programs/automation-studio/nodes/
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

Project-local authored node overrides should live in an importer-managed source
root associated with the project, rather than beside runtime artifacts. Hosts
can provide a custom source root when their repository layout differs.

```text
domains/{domain-id}/programs/automation-studio/projects/{projectId}/custom-nodes/
```

Global custom nodes should be reusable across projects. Project-local custom
nodes should be used for project-specific experiments, pinned versions, or
imports that should move with a project export.

The first UI surface includes the core views called out in the studio plan:
policy design, recordings, signals, runtime debugging, and problems. Later
slices should add deeper routine editing, command palette support,
lockable synchronized views, provenance overlays, and history/change tracking
without collapsing these concerns into one generic dashboard.

The current web shell uses a stricter workbench layout:

```text
left hierarchy | main editor panes | right inspector
               | bottom action preview dock
```

The shell provides:

- a top workbar for project and workspace actions;
- a global command bar with the existing play, pause, and stop buttons wired to
  Automation Studio runtime control. Play preflights the active project and
  explicitly opened Flow, reports run status through the command center, and
  opens Runtime Debug when execution starts;
- a searchable project hierarchy with real folder rows and object-type visual
  treatment for flows, recordings, proposals, folders, tasks, routines, and
  configurations;
- preset main editor panes for Flow, Recording Timeline, Proposal, Proposal
  Generator, State View, configuration, runtime, runs, clients, signals, and
  debug surfaces;
- a fixed right sidebar for the global inspector and utility tabs;
- a fixed bottom dock for selected-recording action preview.

The play command currently calls the Automation Studio runtime session API and
reports the returned session status and trace message. Play resolves the
canonical Flow currently opened in the Flow editor workspace state, so a run
still targets the visible Flow after selection moves to another pane, tab, node,
timeline item, or inspector context. The runtime service exposes cancellable
sessions through the runtime control API for queued or running runs;
cancellation records durable session status and aborts the live executor signal
when the service still owns that run.
Runtime Debug and Runs expose stored session traces through two inner pages.
The first page is a previous-runs list backed by a per-project SQLite summary
index and loaded with SQL `limit`/`offset` pagination. Rows only carry summary
fields such as status, timing, action count, and effect count. Each row is clickable and loads exactly one compact Flow run detail before opening its action-log page. The detail page starts with a run story strip that summarizes
deterministic execution, recovery, LLM intervention, patch tests, adaptation
creation, and retry outcome before showing raw logs. A compact metrics grid
shows status, action count, recovery count, LLM calls, tokens, cost,
adaptations, and whether durable behavior changed. The action log keeps
attempts in recorded order as single-line rows with route, timing, comparison
status, recovery selection, region, policy decision, and friendly summaries
first. Recovery ladder, LLM intervention, adaptation, effect, and final-value
sections sit below the action rows with JSON details on demand. Full session
traces can still be used for deep debugging, but the first run-log render must
not require hydrating full inputs, outputs, effects, native logs, nested child
traces, final effects, or final runtime values. Live step streaming can extend
the same action-log surface as the runtime event stream matures. The detail
page also exposes `Export Audit`, which downloads the service audit bundle for
that run: compact run detail, intervention summaries, referenced adaptations,
validation results, mutation before/after/rollback evidence, and retention
signals.

Runtime control is a product surface, not a raw executor console. The visible
controls are a run mode selector, one primary `Run` button, declared Flow input
fields when the Flow defines inputs, and a step limit. If a Flow has no
declared inputs, the control clearly states that it will run with saved
defaults. Raw JSON payload editing and per-run authorization switches for
browser/API effects are not exposed in the normal UI; those remain internal
runtime policy concerns.

Subflows are Flow-owned sidebar objects, not a separate global workspace mode.
The Subflows folder under a Flow can show paged summary children as the list
grows; selecting a concrete subflow keeps the owning Flow selected and hydrates
only that subflow's detail, router reverse references, and graph editing
context. Subflow detail should show mapping, status, stability, raw JSON on
demand, and the existing Flow graph canvas mounted against the subflow's
isolated `graphFlowId`. Subflow graph drafts stay local to that selected
subflow detail and save through `save-flow`; they do not share the parent Flow
editor's draft state.

LLM-assisted runtime views should display intervention records as audited
events, not as hidden chat state. The harness resolves active instructions in
scope order: global, project, Flow, router, subflow, node, on-error, then
adaptation-review. Higher priority wins within a scope, required conflicts are
diagnostics, and long instruction bodies are truncated before entering the
context packet. UI surfaces should show prompt version, provider/model,
instruction IDs, validation result, and token/cost summary from the persisted
intervention event.

Live patch attempts should appear in run detail beside the action/recovery
timeline. The user needs to see the proposed temporary patch kind, preflight
issues, side-effect approval requirement, patched trace status, whether
expected state was restored, whether the original action was retried, and any
candidate adaptation/change proposal IDs. Raw patch and trace JSON should be
available on demand, but not required for the first run-log render.

The Adaptations workspace is a separate inner view with status tabs for
proposed, testing, validated, applied, rejected, disabled, reverted, and
superseded adaptations. The list pane uses status-filtered paged summaries; the
detail pane hydrates one adaptation and shows trigger, diagnosis, source run,
proposal link, risk, validations, patch diff rows, review actions, and raw JSON
on demand. Review actions require PIN authorization and call the adaptation
review endpoint.

Training status appears with adaptation/review surfaces. It shows the current
mode, runs completed, stability score, learned changes, pending proposals,
uncertainty count, and frozen scope count. Later settings controls should edit
mode, budgets, and frozen scopes, but runtime/review views can already display
the derived status so users understand whether FluxIQ is training, stable, or
blocked by budget/freeze gates.

The main editor is no longer a draggable inner-window desktop. Pane slots are
chosen from presets such as full, halves, large-plus-side, three-pane, and two
rows. Users can resize split handles to persist editor ratios, but panes do not
overlap, stack by z-index, or move by dragging title bars. A pane owns a tab
strip; adding a view adds it to a pane slot rather than creating a floating
subwindow. Main-pane tabs can be rearranged within a pane by dragging a tab
before or after another tab. They can also be dragged from one pane's tab strip
and dropped anywhere over another pane. Closing or dragging the final tab out
of a pane removes that pane and compacts the main layout preset to match the
remaining panes instead of reopening a fallback tab in the emptied pane.

The right inspector is a fixed sidebar region. It can be resized horizontally,
collapsed, and switched between utility tabs, but it does not float in the main
workspace. The global inspector remains the default tab and follows the global
selection for nodes, edges, signals, timeline entries, policies, recordings,
state facts, and proposal steps.

Recording review is split into two surfaces. The bottom dock is a lightweight
action preview rail for the selected recording; it shows action/domain-event
markers only, so high-frequency state observations do not crowd the preview.
The rail uses compact markers and short labels to stay readable when resized
small, while selected actions receive the strongest visual emphasis. Actions
that declare `visualTarget` show a target marker in their preview box.
Selecting or previewing one of those actions makes the active preview action
drive State View resolution, so the interacted entity is highlighted even when
the global selection is still on the recording. State View resolves the target
using the linked state snapshot, visual layer, state path, entity anchor, or
fallback geometry. State selections preserve proposal and recording context so
split-screen proposal review stays on the generated proposal while operators
inspect timeline actions or visual state entities. Explicit open-state actions
route to the main State View using Core's indexed state lookup. The full
Recording Timeline is a main editor view. It
contains the complete event timeline, state observations, note/marker controls,
proposal-generation entry points, and in-depth recording inspection. The action
preview dock can be resized vertically or collapsed.

View routing is fixed by region:

- Recording selection shows the bottom action preview dock.
- Timeline event selection updates global selection and inspector.
- Opening a recording timeline opens the full Recording Timeline in the main
  editor.
- Generate Proposal opens Proposal Generator in the main editor, preferring a
  secondary pane when a Flow is already open.
- Opening an existing proposal opens Proposal Review in the main editor,
  preferring a secondary pane when available.
- Opening State opens State View in the main editor.
- Inspector, AI Assistant, Problems, and Workspace Dock route to the right
  sidebar.

The left hierarchy editor is limited to recording-owned pipelines, folders,
tasks, routines, configurations, and recordings. Interfaces are no longer
represented as project hierarchy objects. The tree uses real explorer-style root
folder structures for pipelines, tasks, routines, configurations, and
recordings. Each structure owns its own expandable/collapsible folders, and
folder rows keep add/delete controls.
Creating a hierarchy item first opens a category-aware type chooser for folder,
task, or routine where those object types apply, then asks for name, location,
and PIN authorization. Recording rows are generated from project recording
sessions, grouped into auto-generated folders by client name, labeled by
recording start date/time, and open the selected recording in the timeline
editor. Pipeline rows are generated from the same recordings and open the
pipeline pane scoped to that selected recording. Delete actions remain
privileged and require PIN authorization.

Automation Studio opens through a project chooser. Users must create or open a
project before the editor workspace appears. In storage layout v2, project
catalogs, manifests, hierarchy, workspace preferences, authoring documents,
recording metadata, and pipeline metadata are global Automation Studio records
inside `.fluxiq/global.sqlite`. Creating a project performs its catalog,
project-document, and default-task bootstrap in one transaction and creates no
empty project folder. Payloads at or above 256 KiB are written first as
immutable SHA-256-addressed objects under
`.fluxiq/artifacts/automation-studio/projects/{projectId}/objects/`; the
database stores and verifies the object reference.

The importer's registered domain remains the authority for display names,
labels, recording contracts, and adapters. A project or recording can carry a
domain ID as targeting/ownership metadata, but selecting that domain does not
move the global editor catalog into a domain-specific storage tree.

The web panel must use the importing repository as its FluxIQ host root. When
developing the panel from the FluxIQ source checkout, set
`FLUXIQ_IMPORTER_ROOT`, `FLUXIQ_HOST_ROOT`, or `FLUXIQ_ROOT` to the importing
repo. Without that explicit root, the panel refuses to use the framework source
checkout for Automation Studio state so recordings are not written into core
FluxIQ folders by accident.

The web runtime also supports a generic importing-repo host module hook through
`FLUXIQ_HOST_MODULE`. The path must point at a CommonJS module exporting
`registerFluxIQHost(fluxiq)` or a default synchronous registration function.
The hook runs immediately after `FluxIQ.create(...)` and before API routes or
the client gateway use the runtime, so domain repositories can register
recording domains such as `web-automation`, domain node definitions, and other
host-owned adapters without adding domain-specific code to FluxIQ core.

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
strict pane tabs, active pane, active view, main layout preset, main split
ratios, sidebar width, right inspector width/collapse state, bottom action
preview height/collapse state, right-sidebar tabs, and per-view state. Older
saved floating-window preferences normalize into the strict model on load:
full timeline views remain main editor views, inspector/utility views move to
the right sidebar, and remaining main views become deterministic pane slots.

Workspace persistence is debounced and signature-based. Loading a project seeds
the last-saved hierarchy signature, and `save-project-hierarchy` should only be
sent after real hierarchy or workspace changes, not continuously for equivalent
state.
Workspace preferences include strict pane tabs, the active pane/view, region
sizing, main split ratios, and a `viewStates` map keyed by view ID. A view state
stores the last relevant selection context for that tab, plus view-local values
such as the workspace dock subtab. Switching between tabs saves the outgoing
view state and restores the incoming view state so proposal, inspector, state,
timeline, and editor surfaces return to the item they were showing.
Flow editor tabs render canonical Flow/policy data. Automation Studio does not
maintain a hidden legacy Task graph in workspace preferences. Proposal review
edits can still be cached in the project's `workspace/preferences.json` until
the user explicitly applies the proposal to an existing Flow or saves it
as a new Flow, and the web panel installs a browser leave-page warning while
proposal review edits are dirty.
The Flow canvas persists visual graph nodes and edges only. It does not create,
modify, or preserve hidden execution region records. Older Flow artifacts that
still carry region metadata are treated as model/source configuration rather
than as inline visual editor state.
Pointer movement uses transient pixel geometry while a window or section is
being dragged/resized. The persisted percentage geometry is written back to
workspace preferences only once the pointer interaction ends, preventing config
writes on every pixel movement.

Canonical project recordings and normalized timelines use SQLite repositories
in `.fluxiq/global.sqlite`. Recording events remain ordered within the
canonical recording document; no event-type or snapshot folder is pre-created.
The conceptual ownership is:

```text
.fluxiq/global.sqlite
  automation.recording_sessions
  automation.normalized_timelines
  automation.state
```

Recording session writes are burst-safe. Automation Studio queues mutations per
recording ID, and each canonical repository write is atomic. Reconnects and
active-domain changes resolve the same global recording by stable ID and
project metadata.
If a client sends repeated event IDs, the recording framework preserves the
first ID and suffixes later duplicate timeline entry IDs before validation and
persistence. Timeline UI keys also include row index and sequence so older
recordings with duplicate IDs can still render.

Recording-derived documents remain logically owned by the recording and retain
stable evidence references. Small documents and lookup metadata are stored in
SQLite. Only oversized or binary payloads use the project object store.

```text
.fluxiq/
  global.sqlite
  artifacts/automation-studio/projects/{projectId}/objects/{sha256}.json
```

Normalized timelines, normalization details, mining runs, evidence facts,
evidence observations, state-action correlations, evidence claims, task
models, proposals, and replays are indexed database documents carrying their
`recordingId`. The physical object path is content-addressed and deliberately
does not encode mutable pipeline structure.

Pipeline files are derived artifacts. They preserve references back to raw
recordings and normalized timelines so users can audit how a final task policy
was produced. Deleting a recording deletes the recording session folder,
including all derived evidence and proposal data, and removes linked entries
from project indexes. A proposal stores both a preview `PolicyGraph` and a
mergeable `PolicyGraphPatch`. The patch is the application contract: it names
the target task, proposed nodes, proposed edges, source recording IDs, source
mining run IDs, and the merge strategy.
Approving a policy proposal merges that patch into the task's current policy
graph when one exists, writes the merged `PolicyGraph` into the canonical
policy repository and project `policies/` folder, and writes a task-owned flow
document for the editable Automation Studio graph.

Project-owned authoring artifacts are explicit SQLite documents instead of only
hierarchy rows. Their logical keys retain the familiar project/task/routine/
config/flow ownership without requiring matching directories:

```text
projects/{projectId}/tasks/{taskId}/task
projects/{projectId}/routines/{routineId}/routine
projects/{projectId}/configs/{configId}/config
projects/{projectId}/flows/{flowId}/flow
projects/{projectId}/runtime/sessions/{runId}
```

Canonical Flows in the shared Automation Studio repository are the executable
project edit targets. New project creation does not seed Task, Routine, or
owner-bound Flow documents. Config files remain editable project artifacts.
Legacy `tasks/`, `routines/`, and owner-bound `flows/` documents are retained as
read-only migration sources after a project activates the Flow-first schema
gate. Their compatibility adapters preserve deep links and provenance.

Approving a generated proposal creates or updates a canonical recorded-origin
Flow. This only happens from an explicit Apply/Save action. Proposal edits
before that point are cached in server-backed workspace preferences, not as
legacy Task files. Multiple recordings targeting the same Flow merge by shared
prefix: matching leading steps are reused, and the first divergent proposed
step becomes a recorded branch from the last shared node.

Automation Studio now has a neutral graph executor for these flow documents.
The executor starts at the `builtin.control.start` node when present, runs
built-in node executors, carries typed data outputs into later node inputs,
follows named route ports such as `success`, `failed`, `true`, `false`, and
records an execution trace with attempts, outputs, effects, status, and a final
message. Explicit `builtin.control.end` nodes are the preferred terminal point.
If a non-terminal node completes on a route that has no matching outgoing edge,
or completes without an outgoing edge while unvisited nodes remain, the runtime
fails with a route diagnostic instead of reporting a false successful run. This
executor is intentionally separate from host-specific automation: browser,
scraping, lead-generation, desktop, or game adapters plug in later through the
adapter contract rather than living in FluxIQ core.

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

State checkpoints may include optional presentation frames. These frames are
safe JSON descriptions of images, text, regions, and elements in a declared
coordinate space. Large visual content is referenced from project object
storage or authorized API routes rather than embedded in framework source or
stored as local filesystem paths.

New Flow editors open as blank canvases until a user adds nodes from the palette.
They do not seed fake orchestration or policy nodes merely because a tab opens.
Recorded-origin Flows may display generated policy nodes, while manual nodes and
connections use the same palette and React Flow interaction model.

Flow details are edited in the same workspace transaction as the canvas:
identity, description, typed input/output/error interfaces, variables,
timeouts, concurrency, publication intent, and authorized domain grants all
participate in dirty-state detection. The create
menu offers blank, deterministic, recorded, integration, scheduled,
API-endpoint, and reusable presets, each producing a canonical Flow rather than
a separate artifact kind. Legacy Task/Routine compatibility entries are
read-only until explicitly migrated.

The palette combines built-ins, importer integrations, scoped domain nodes,
published public Flow composites, project nodes, trusted-local code nodes, and
policy/evidence nodes. Adding a published Flow produces a Call Flow node pinned
to an exact version with explicit input, output, and error bindings. The Flow
details surface shows publication history, dependencies, callers, and reviewed
upgrade candidates; it never silently moves a caller to a newer version.

The inspector follows global selection, and the recording timeline uses a
horizontal editor-style lane surface with preview snapping, event selection,
and selected-event summary data. Rejected client recording events are domain
contract validation failures, so they are reported through the client gateway
error/audit path instead of being appended as timeline evidence clips.

These controls are the UI foundation. Follow-up slices should connect them to
the persistent workspace layout model, command registry, undo/redo stack,
drag-and-drop pane docking, and schema-driven edit definitions.
