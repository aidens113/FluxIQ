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
  controllers/               State ownership hooks for project, hierarchy, Flow,
                             recording, runtime, state inspection, and layout.
  model/                     Pure project-artifact identity and translation helpers.
  graph/                     React Flow port rules, connection helpers, edge routing, and graph view models.
  hierarchy/                 Project tree/modal components, generated recording nodes, and hierarchy signatures.
  parameters/                Node parameter inspector controls and value coercion helpers.
  runtime/                   Small UI-triggered runtime payload builders and execution helpers.
  timeline/                  Timeline titles, summaries, icons, and durations.
  types.ts                   Shared Automation Studio UI/view/editor types.
  views/                     Named workspace pane modules: renderer, timeline, proposal,
                             state, client/config compatibility, graph editors, workspaces, inspector,
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
adaptation, node, or previous run. Its visible header names the active context and summary counts. A source selector exposes all loaded observed, learned, and runtime sources; phase controls expose Input, Action, Expected Output, and runtime-only Actual Output. Source/phase changes persist through the shared state selection contract, clear stale fact/evidence focus, and remain disabled while exact requested-state data is loading. The Visual canvas maintains fixed aspect/coordinate geometry, bounded scroll and 25%-400% zoom, translates screenshot/document bounds and viewport offsets, suppresses colliding direct-rendered text, and keeps overlays keyboard-selectable. When both document reconstruction and screenshot evidence exist, an explicit surface control switches between them; single-surface sources do not show a redundant control. Image failures render a contained fallback. Visual and Structured are explicit State modes. Structured state renders namespace, friendly path, value, confidence, and source in a bounded table; rows and path commands select the same canonical fact by pointer, Enter, or Space. Diff and Compare are explicit modes with availability-aware disabled states: Diff shows recorded before/after deltas, while Compare shows expected-vs-actual match, mismatch, irrelevant, severity, and score records for runtime actual output. Selecting a comparison row synchronizes evidence/fact focus; changing to an incompatible source returns to Visual. A persistent Evidence Inspector names source ownership, selected fact values, confidence, observation time, evidence role/comparator/expected value, and provenance. It also cross-links observed evidence to its Recording, runtime evidence to its Run Log, and node-bound evidence to the Flow editor. Raw is a visible but opt-in mode: JSON is not serialized into the initial Visual view, and the revealed bounded panel supports clipboard copy with status feedback. Exact requested-state misses expose a Retry state loading command; the command is suppressed while that state request is active. Large states use fixed render budgets: Visual retains selected and image context while limiting each layer/fact/overlay collection to 200 items, reports hidden items, and points to Structured state; Structured state pages 100 rows at a time. Malformed object references never become image sources and render a contained asset placeholder. The single Flow editor remains the editable
graph canvas, while supporting views such as runtime evidence, state
reconstruction, adaptation review, and inspector detail are routed into fixed
workbench regions rather than arbitrary floating windows. The node palette
stays embedded as the collapsible right rail inside the policy/routine node
editor because it is part of direct node editing, not a separate workspace
window. Legacy Task/Routine documents may still open through a clearly marked
read-only compatibility view, but they are not independent authoring modes.
The Router view has two deliberate states. Before any subflow exists it shows a
single setup action because routes cannot have a valid target. Once subflows
exist, Router becomes an ordered route workspace: one scrollable row list shows
priority, condition, target, group, and status; compact group controls filter
that list; and a persistent fallback row explains unmatched behavior. Route
creation and editing use a focused modal. Match behavior is visual and explicit:
Always, or When with a Run input/Current state source, field, human-readable
comparison, value type, and expected value. The builder persists typed boolean and
numeric values and can explicitly clear an existing condition when changed to Always.
Status, confidence, and description remain in a secondary Route details disclosure.
Route and fallback target fields use the shared searchable combobox. Options are sorted by friendly subflow name and include description, role, and the stable ID as secondary searchable context. The control supports arrow-key navigation, Enter selection, Escape dismissal, listbox semantics, and inline missing-target errors.

The fallback row is an edit command, not a static summary. Its modal explicitly chooses between sending unmatched traffic to a named subflow and stopping the run with a user-facing message. Saving fallback behavior is independent of route creation. Route groups expose name, description, ordering, initial collapse state, and active/disabled/archived lifecycle status; deleting a group ungroups its routes without deleting those routes. All group, route, and fallback writes use the same in-product PIN authorization modal.

Proposal Generator and Proposal Workbench are not normal workspace views. Recording-driven proposal generation is retired; persisted proposal tabs render as labelled, read-only compatibility content, while current runtime changes are reviewed through Adaptations. Restored Proposal Generator tabs use the same compatibility component as direct legacy rendering: they expose no LLM-assisted or direct-generation callbacks and provide only Open Adaptations and Open Recordings links, preserving any selected legacy recording as context. Persisted Proposal Workbench tabs retain summary, evidence counts, status, and a selectable read-only graph, but the component has no editable mode or mutation callback contract. It exposes no regenerate, replace, apply, save-as-Flow, or LLM-processing controls and links only to Adaptations and its source recording. Change Proposals is not a current view type, renderer, workspace, or hierarchy object. Recording proposal hierarchy generation and all unreferenced web recording-to-proposal creation helpers are removed. Internal proposal records and endpoints remain framework compatibility data where runtime adaptation persistence still requires them, but current UI cannot create or navigate them as a separate product object.
The Adaptations inbox is a summary-first, SQL-paged review directory. It opens across all statuses by default and sends status, risk, trigger/ID search, sort field, sort direction, limit, and offset to the project adaptation summary index. Search is debounced; stale list and detail requests cannot replace a newer Flow, filter, or selection. The visible page uses compact full-row selection with trigger, stable ID, risk, updated time, and lifecycle status. Loading, no-data, no-match, and retryable failure states are distinct, and Previous/Next navigation stays in the footer. Full adaptation patches and evidence remain unloaded until a row is selected. Selected adaptation detail is divided into Summary, Changes, Evidence, Validation, and Audit inner views. Summary explains the trigger, diagnosis, scope, status, risk, author, and current approval decision. Changes owns proposed and applied mutations. Evidence names source runs, recordings, instructions, and observed-context availability. Validation lists each check with result, time, and explanation. Audit owns decision history, lifecycle commands, and the only complete raw-JSON disclosure. Changes render bounded field-level Previous and New values as the primary review artifact, with explicit added/removed values and a secondary technical-payload disclosure. Every patch kind links to its owning Router, Subflows, Instructions, Nodes, or Adaptations view. Evidence references likewise deep-link to the exact runtime run, recording, or instruction. Audit lifecycle commands are status-aware: proposed/testing candidates can be validated, rejected, revalidated, or switched to manual approval; validated candidates can be applied, rejected, disabled, superseded, revalidated, or switched to manual approval; applied candidates can be reverted; terminal candidates are read-only. Choosing a command opens an in-product PIN modal. Reject and supersede require a reason, supersede also requires the replacement adaptation ID, and API failures preserve the open modal and entered context. Each detail body scrolls independently beneath a stable, horizontally scrollable tab strip.

The route editor includes a Test this route panel. It accepts one sample value using the selected text/number/boolean type and sends a structured condition plus nested input/state sample to the read-only test-flow-map-route-condition endpoint. The endpoint runs the same evaluateAutomationStudioRouteCondition function used by runtime and returns matched/not-matched plus a plain-language reason. Always routes can also be tested and explain that no condition is configured.

Each route row keeps editing as its primary full-row command and exposes secondary operations through one accessible overflow menu. Move up/down, duplicate, enable/disable, and delete use an authorized atomic router mutation. Reordering normalizes priorities in stable ten-point increments, duplication selects a collision-free friendly copy name, and narrow layouts reserve a fixed action column without clipping route content.

Route rows are ordered by numeric priority and then by stable route name. On wide Router containers, aligned columns expose priority, condition, target, group, status, and row action. Container-based narrow layout removes the header and reflows the same information into a three-column, multi-line row; it does not hide group/status context or require a horizontal scrollbar. Each row has an accessible name containing priority, route, and target, and the full row remains the edit target.
Router reads render a stable three-row loading skeleton and reject late project/Flow responses by request scope. Read failures retain context and offer Retry; save and test operations expose named progress; all writes use the focused Authorize Router Change PIN modal. Obsolete decision-map, first-use illustration, inspector, and advanced-matching selectors are removed rather than retained as parallel UI.

The populated view does not duplicate routes into a decorative decision canvas,
keep a permanent inspector open, or expose raw Router JSON as normal authoring UI.

The left project hierarchy is the primary discovery surface for Flow-owned
objects. It does not render separate visual top-level buckets for recordings,
proposals, configuration, or other artifact categories. Flows are the product
roots. A Flow row expands into framework-owned child folders and objects:
Router, Subflows, Instructions, Recordings, Adaptations, Runs, Runtime Debug,
and Settings. Subflow creation is owned by one hierarchy dialog shared by the Router empty state, the top-level Subflows plus command, and every nested Subflow folder plus command. The first view explicitly chooses Subflow or Folder; the form then collects a friendly name and location. Folder creation persists parentCategoryId, so arbitrary nesting reuses the same flow.

The Subflows view is a server-paged directory, not an embedded graph editor. Search, status, role, sort, direction, page size, and offset are reflected in URL query state. Reads retain prior rows while refreshing, reject stale responses, distinguish no data from no matches, and provide Retry plus first/previous/next/last controls. Every directory row opens Nodes from its primary surface and exposes a compact action menu for rename, duplicate, enable/disable, archive, and delete. Lifecycle changes use focused confirmation dialogs with contextual consequences and PIN authorization; destructive deletion is rejected while the parent Router still references the Subflow. Rows also show graph readiness separately from Router usage. The directory loads one parent Router document per Flow page, derives reverse references locally, and names blocking rules or fallback behavior in the delete confirmation.

Subflows appear as child objects inside the Subflows folder for
their owning Flow. Each subflow row is itself an expandable Flow-object container
backed by its canonical `graphFlowId`; it contains Nodes, Subflows, Instructions,
Recordings, Adaptations, Runtime Debug, and Settings with those objects
scoped to the subflow graph Flow. The Nodes object owns the normal visual Flow
editor for that subflow. Router is deliberately excluded: routing is owned by the
top-level Flow, while a subflow is the deterministic graph selected by that Flow
Router. Internal graph Flows never appear as separate top-level Flow rows. Flow
containers start expanded, while subflow containers start collapsed. Clicking a
subflow name expands it and selects Nodes; its disclosure arrow remains an
independent collapse control. The shared workbar renders a clickable Flow / Subflow / Object breadcrumb from the canonical parent scope, so Router, Nodes, Instructions, Settings, Runtime Debug, and other scoped views retain visible location context without duplicating headers. Flow and Subflow Settings use an anchored, scrollable form with persistent section navigation. Wide screens keep the section index beside the form; narrow screens convert it to a horizontally scrollable strip. Both contexts compare the current draft with the last loaded/saved draft, show Saved or Unsaved changes in the header, and expose one sticky footer with Discard and Save commands instead of duplicate header actions. Flow General uses required name, bounded description, and explicit Private/Public composite visibility. Runtime presents Fully adaptive as the default alongside fixed-run, until-stable, and deterministic-only intervention modes; mode-specific run/stability fields appear only when relevant. Canonical executionDefaults expose a 1-3,600 second timeout and 1-100 maximum concurrency, with inline errors and a blocking validation summary. LLM Connection uses a controlled provider catalog (including DeepSeek), provider-specific model choices, and enabled encrypted-key summaries from the global Secret Keys program. Only key ID/name/provider/scope/enabled metadata enters this view; secret values are never requested or rendered. Host-default and Ollama connections do not require a key. Missing, disabled, wrong-provider, wrong-scope, and unavailable key states block save with links to the Key Manager. Adaptation configuration is centralized under one behavior preset and one approval choice. Fully adaptive is the default; Observe only and Locked disable promotion/permissions, while Broad autonomy enables broader structural permissions but retains destructive approval. Automatic, Manual for risky, and Manual only approval are mutually exclusive, and Manual only disables automatic promotion. Selecting deterministic-only training disables LLM intervention, adaptation creation, and promotion together; invalid legacy combinations are surfaced and block save. Limits include intervention, token, cost, retry-per-action, recovery-per-subflow, and reroute-per-run bounds; the recovery values feed the executor budget rather than remaining presentation metadata. Inputs and outputs use typed, named rows with generated internal IDs, descriptions, required input flags, and validated defaults. Code Flows choose pinned published dependencies by friendly publication/version, while visual Flows derive dependency rows from Call Flow nodes. Runtime capability grants remain host-owned and are shown only as read-only context; Settings exposes no side-effect bypass switch. Effective Values summarizes resolved Runtime, LLM, Adaptation, and Limit values with Framework default or Flow override source badges. Default-valued historical metadata is treated as inherited rather than a meaningful override. Use Default updates the draft and normal saves remove default-valued keys; technical metadata remains opt-in and is not rendered until opened.

The Settings object is context-sensitive:
top-level Flows expose runtime training, adaptation, provider, budget, and safety
policy, while subflows expose their role, route tags, Flow-boundary input/output
mappings, local instruction bindings, and optional approval-mode override. Subflow
settings persist the subflow record rather than treating its internal graph Flow
as an ordinary top-level Flow configuration. The form loads the parent Flow contract, compact instruction summaries, and parent Router in parallel. Local instructions are selected by title and shown as removable named bindings; saved missing references are identified without asking users to type IDs. Input/output mappings use named typed port selectors from the parent and subflow contracts, block missing, duplicate, and incompatible mappings, and disable creation until both sides define ports. Approval uses an explicit Inherit/Automatic/Manual for risky/Manual only choice and names the effective parent value. Router references remain read-only because routing is top-level Flow ownership. Active, Disabled, and Archived lifecycle choices are editable, while ownership IDs remain collapsed technical detail. Flow and Subflow section navigation persists the selected anchor in the settingsSection URL query and restores/scrolls it on entry. Dirty drafts register unload protection. Save opens a PIN-only in-product modal after the user chooses Save; authorization, network, validation, and conflict failures keep the draft and modal context intact. Successful writes close authorization, refresh the canonical base draft, and emit scoped settings-change events. Recordings, adaptation/change-review
records,
and settings appear inside the same owning Flow hierarchy rather than in global
category
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

Project refresh should treat the left hierarchy as a critical path. Coordinated
Flow, recording, runtime, and domain summaries commit once after the latest
request set completes; superseded request sets are aborted and cannot reorder
visible hierarchy or run data.
The Flow catalog endpoint reads compact adaptation/proposal warning status but
does not revalidate every recording-derived compatibility proposal during
sidebar load; deeper adaptation or pipeline views own that heavier validation
work.

Recordings are optional evidence for deterministic Flow authoring and runtime analysis; they do not directly generate adaptations or current Flow edits. Persisted recording-linked proposals remain readable only through legacy compatibility tabs, which are excluded from normal tab creation and hierarchy creation paths. The Recordings workspace has explicit List and Timeline inner views. List is the primary browsing surface and requests 25 index-backed recording summaries at a time; it distinguishes loading, empty, error, and populated states, opens Timeline detail from the entire row, and keeps range/page controls at the bottom. The project hierarchy remains a direct navigation path to any known recording, and selecting one there opens the same Timeline detail. The timeline dock follows a video-editor-style horizontal layout and is the editor/review surface for the selected recording: it has
selected-recording controls, a selected-event detail strip above the editor,
lane labels, horizontally and vertically scrollable clips, and a compact
overview strip below the editor. Clicking an overview preview snaps the editor
to that timeline location. Raw elapsed time is rendered as explicit wait clips
in a Timing lane from adjacent recorded monotonic offsets, so long pauses do
not create confusing blank space. Actions, domain events, observations, state
deltas, checkpoints, notes, and markers each render in their appropriate lane
with distinct visual treatments. Selecting any clip updates the global
inspector selection with event-specific details, timing gaps, source,
correlation, and recording context. The timeline editor is one keyboard focus surface: Left/Right move by event, Home/End jump to boundaries, and selection is scrolled into view. The event detail strip duplicates Previous, Next, and Open State as visible commands. Overview markers expose full labels and selected state to assistive technology. Long timelines render 200-event windows across lanes and overview instead of multiplying the entire event stream into the DOM; selection automatically opens its owning window, and Previous/Next event-window controls preserve access to every event. The bottom action preview uses a selected-centered 200-action window. Rename, note, marker, finalize, state-index repair, and delete use one focus-trapped Recording action dialog. The dialog collects only the action fields and PIN required for that mutation, preserves local validation context, exposes busy/error states, and gives delete/repair consequences explicit copy; none of these workflows use native browser prompts or confirms.
The hierarchy is exposed as one semantic tree. Visible rows carry their nesting
level, expanded state where applicable, and selected state. Keyboard focus uses
one roving tab stop: Up/Down traverse visible rows, Home/End jump to the
boundaries, Right expands or enters the first child, Left collapses or returns
to the parent, and Enter/Space activates the focused object. Filtering that
removes the focused row returns focus ownership to the Flows root. Disclosure,
create, settings, and delete controls remain separate commands and do not
replace the row's primary selection action.
Row-local secondary commands are grouped in one labelled overflow menu so the
object title owns the remaining row width. Long titles wrap and expose their
full value as a title; they are not shortened to make room for independent
create, settings, and delete columns. The Flows root keeps Add Flow as a direct
primary command. Eligible object menus retain Add inside, Open settings, and
Delete, with destructive styling and shared menu keyboard behavior.
Hierarchy derivation builds one memoized ID/parent index per node set. Search
walks only matching nodes and their indexed ancestors; recursive rendering reads
pre-sorted child arrays instead of rescanning the full hierarchy. Unfiltered
sibling groups initially render 100 rows and expose a progressive continuation;
search and type filters are never capped. This is a DOM rendering boundary, not
a database claim. Runtime Debug run history and the Subflows directory own their
existing SQL limit/offset pages, while the hierarchy consumes compact project
summaries.

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
State View keeps one persistent Evidence Inspector beside the active state surface.
The inspector owns source context, selected fact values, evidence bindings, and
provenance cross-links without duplicating controls inside individual overlays.
On narrow workspaces it moves below the primary surface and remains independently
scrollable.

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
searchable project-backed reference pickers with friendly labels. The picker derives compatible options from node definitions, tasks, policies, routines, data tables, and Flow variables; filters by label and description; displays selection and unavailable states without exposing raw IDs; and validates required or stale references inline. Parameters
with `any` values render as typed value controls where users choose text,
number, boolean, or empty before entering the value.

Parameter schemas may declare examples plus numeric, integer, string-length, and pattern constraints. Native input attributes enforce compatible constraints while the Inspector reports required, type, range, format, and reference errors inline next to the affected control.

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

The strict workbench exposes three stable regions: a Main editor landmark
containing one to three labelled pane groups, a fixed Inspector aside, and a
fixed Action preview timeline landmark. automationWorkspaceRegionForView is the
single routing authority: editor/detail views route to Main, Inspector and
Problems route right, and recording-action-preview routes to the timeline.
Region labels and data markers are part of the UI contract and test surface.
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
The Runs workspace separates Runtime Runs and Replays with one local, accessible mode control. Runtime Runs is the default and contains only executable Flow history; Replays contains recording/policy validation results, so replay rows no longer extend or compete with the runtime debugger. Runtime Debug and Runs use the same `RuntimeRunHistory` controller and expose stored session traces through two inner pages. The Runs workspace requests project-wide history, while a Flow Runtime Debug workspace supplies `flowId` so both its initial rows and every server page remain scoped to that Flow. Both surfaces use the canonical `list-flow-runs` endpoint; the older runtime-session listing is not a second UI data path.
The first page is a previous-runs list backed by a per-project SQLite summary
index and loaded with SQL `limit`/`offset` pagination. The shared history toolbar sends run/Flow ID search, status, sort field, sort direction, and 10/25/50/100 page-size choices to that SQL query. First, previous, next, and last controls remain in the footer, and alternate server sort orders are rendered without client re-sorting. Rows only carry summary
fields such as status, timing, action count, and effect count. The visible page remains mounted during refresh. A three-second poll runs only while the list is visible, resumes on tab visibility, and responds immediately to queued/completed/cancelled runtime events. Monotonic request IDs reject stale responses; parent snapshot changes cannot re-sort an established SQL page. Each row is clickable and loads exactly one compact Flow run detail before opening its action-log page. The detail page starts with an Overview band that names exact start/end timestamps, duration, Flow version, intervention mode, and terminal outcome, followed by a run story strip that summarizes
deterministic execution, recovery, LLM intervention, patch tests, adaptation
creation, and retry outcome before showing raw logs. A compact metrics grid
shows status, action count, recovery count, LLM calls, tokens, cost,
adaptations, and whether durable behavior changed. The action log requests 50 server-paged attempts at a time from `list-flow-run-actions`; opening compact Run Detail never sends the full action sequence to the browser. It keeps
attempts in recorded order as single-line rows with route, timing, comparison
status, recovery selection, region, policy decision, and friendly summaries
first. Selecting a row by pointer, Enter, or Space opens one responsive inspector beside or below the list. Summary, Data, Effects, State, and Raw JSON modes share that stable panel; rows contain no independent expanded bodies. Recovery and Routing is a chronological decision timeline below the action rows. It combines persisted route decisions and recovery attempts, explains selected targets and fallbacks, counts rejected alternatives, and links to Router or the selected Subflow; raw decision JSON remains on demand. LLM and Adaptation is one ordered sequence after it: intervention rationale/provider/model/usage, candidate patch tests, created adaptation links and approval context, then deterministic retry outcome. Raw JSON is stage-specific and opt-in. State and Effects follows it as a focused two-mode view. Effects are paged in recorded order with payload detail on demand. State names starting/before/after/diff references from compact action records, deep-links the global State Viewer for the run, and keeps final values opt-in. Full session
traces can still be used for deep debugging, but the first run-log render must
not require hydrating full inputs, outputs, effects, native logs, nested child
traces, final effects, or final runtime values.  Runtime launch controls are generated from the canonical Flow interface: Text, Number, Yes/No, and Structured inputs preserve their JSON types, seed declared defaults, and block missing required or invalid values inline. Before enabling Run, the client loads the effective instruction set, Router, and active Subflow count and requires active guidance plus either runnable Nodes or an active routed Subflow path. Each readiness blocker links directly to the owning editor. Live step streaming can extend
the same action-log surface as the runtime event stream matures. The detail
page also exposes `Export Audit`, which downloads the complete service audit bundle for
that run independently of the visible action page: full run detail, intervention summaries, referenced adaptations,
validation results, mutation before/after/rollback evidence, and retention
signals. The bundle includes record-count manifest and SHA-256 run-detail integrity metadata. Browser JSON serialization runs in a short-lived Worker when supported, with preparing/ready/error states and a synchronous compatibility fallback.

Runtime control is a product surface, not a raw executor console. The visible
controls are a run mode selector, one primary `Run` button, declared Flow input
fields when the Flow defines inputs, and a step limit. If a Flow has no
declared inputs, the control clearly states that it will run with saved
defaults. Raw JSON payload editing and per-run authorization switches for
browser/API effects are not exposed in the normal UI; those remain internal
runtime policy concerns.

Subflows are Flow-owned sidebar containers, not a separate editor mode. The
Subflows folder opens a lightweight, SQL-paginated directory of subflow
summaries. Selecting a concrete subflow from that directory resolves its exact
`graphFlowId` and opens the normal Flow editor. Clicking the subflow container in
the project tree expands it and selects its Nodes child, which owns that same
editor. After refresh, an active subflow graph keeps Nodes visibly selected and
its parent container expanded. The directory does not mount a graph canvas, own
graph draft state, expose raw JSON, or duplicate Flow editing controls. Backing
subflow graph Flows remain hidden from the top-level Flow hierarchy.
The Instructions view is a bounded library/editor split. Its library uses SQL-backed compact summaries with text, scope, status, requirement, sorting, count, limit, and offset applied at the database boundary. Filters, direction, page size, and offset are URL-restored; list reads reject stale responses and single-row selection hydrates only that instruction through get-flow-instruction. Loading, no-data, no-match, error/retry, and bottom pagination are explicit, and the UI caps pages at 50 rows. The editor separates Content from Behavior, tracks a canonical base draft, and marks unsaved changes immediately. Draft recovery is isolated by project, Flow, and instruction ID in debounced browser storage; opening another instruction or starting a new one requires an explicit discard when dirty, while page unload receives the standard unsaved-change warning. Returning after a reload offers Restore and Discard actions without replacing canonical data automatically. Scope selection covers Global, Project, Flow, Router, Subflow, node, on-error, and adaptation-review guidance. Object-scoped choices use searchable name-based pickers populated lazily from the current Flow context; internal IDs are never user-entered, and missing required targets prevent save with inline guidance. Importance is presented as Low, Normal, High, or Critical, with bounded numeric priority available only as an advanced override. Requirement and lifecycle status use explicit segmented controls. New drafts can start from Flow-goal, safety, error-recovery, Router, Subflow, node, or adaptation-review templates that populate editable guidance and sensible behavior defaults. Instructions has three explicit inner views: Library for discovery, Editor for one draft, and Effective Preview for the active resolved set. The preview is loaded only when opened, follows runtime scope/importance ordering, labels inherited versus Flow-owned guidance, resolves object targets to visible names, and provides bounded loading, retry, and no-guidance states. Dirty Editor navigation into another inner view uses the same discard guard as row navigation. Draft Checks and Effective Set Checks detect same-target Required-rule conflicts, normalized duplicate bodies, lower-importance same-title shadowing, unusually large instructions, and aggregate token pressure against the 2,000-token runtime instruction budget. The editor and preview show approximate token meters, severity, affected instruction names, and actionable explanations; diagnostic codes remain secondary implementation metadata. A Flow with no instructions receives a readiness banner with direct creation/template actions. Editor save uses a sticky footer, explicit Saved/Unsaved/Saving/Failed state, local discard, and an in-product PIN-only authorization modal; browser prompts are not part of this workflow. Failed authorization leaves the draft intact, while success clears recovery data, invalidates Effective Preview, reloads the SQL library, and emits fluxiq:instructions-changed for surrounding readiness refresh.

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
rows. Users can resize split handles by pointer or keyboard to persist editor ratios.
Arrow keys move a focused divider in predictable increments and Home restores
its default; dividers expose orientation, bounds, and current values through
separator semantics. Panes do not overlap, stack by z-index, or move by dragging
title bars. A pane owns a tab
strip; adding a view adds it to a pane slot rather than creating a floating
subwindow. Main-pane tabs can be rearranged within a pane by dragging a tab
before or after another tab. They can also be dragged from one pane's tab strip
and dropped anywhere over another pane. Closing or dragging the final tab out
of a pane removes that pane and compacts the main layout preset to match the
remaining panes instead of reopening a fallback tab in the emptied pane.

The Add Tab command opens a searchable dialog-style popover scoped to its target
region. Its typed catalog is the only source of addable views: main views cannot
enter the Inspector, Inspector utilities cannot enter main panes, and obsolete
Proposal, Config, and duplicate Dock entries are not registered. Each choice
names its object scope and placement. Choices that need a Flow, recording, or
current selection remain visible but disabled with a direct requirement, and a
singleton already open elsewhere cannot be duplicated. Escape, outside click,
and the close command dismiss the popover and return focus to its trigger.
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
in-depth recording inspection, and links to canonical state evidence. The action preview dock shares canonical timeline/state selection with the full Timeline. Selection changes center the corresponding action in the bottom rail; action buttons expose full labels and pressed state, and Left/Right/Home/End use the same boundary rules as the full editor. The action preview dock can be resized vertically or collapsed.

At viewport widths of 820 px or less, the workspace switches to one active main
pane; split ratios and other panes remain persisted but are not squeezed into
the viewport. Workbar commands open Project Hierarchy and Inspector in shared
accessible side drawers and Action Preview in a bottom sheet. The inline
desktop sidebar, Inspector, timeline, and split handles are not mounted in this
mode, preventing duplicate controls and scroll owners. Choosing a hierarchy
object closes its drawer, and widening the viewport closes any narrow overlay
without mutating the saved desktop layout.
View routing is fixed by region:

- Recording selection shows the bottom action preview dock.
- Timeline event selection updates global selection and inspector.
- Opening a recording timeline opens the full Recording Timeline in the main
  editor.
- Legacy proposal artifacts can be opened read-only from persisted compatibility
  tabs, but are not offered in normal workspace navigation.
- Opening State opens State View in the main editor.
- Selecting a signal also opens State View; State View owns signal registries,
  snapshots, visual state, and structured state inspection.
- Inspector and Problems route to the right sidebar.

Workspace Dock is retired as a separately openable view because it duplicated
Inspector, Problems, and State. Persisted `workspace-dock` tabs migrate to the
Inspector. No live generic Workspace Dock type, state, renderer, component, or dedicated styling remains. Recording Action Preview is the only fixed bottom region and appears
only when recording context requires it.
Navigation state is also deep-linkable. A top-level Flow with no explicit view
opens Router; a subflow with no explicit view opens its Nodes child in the
normal Flow editor. URL scope stores the durable parent Flow and subflow IDs,
not only the generated graph Flow ID. On refresh, the project hierarchy and
Flow SQL summaries load first, then the URL target overrides persisted pane
selection. Once restoration completes, Flow selection and active Flow-owned
views synchronize back to the URL while preserving unrelated query parameters.
Persisted fallback restoration reads the active strict pane before compatibility
window state.

AI Assistant is not a normal workspace surface. The former placeholder made no
LLM request and could not create or inspect an Adaptation, so persisted
`ai-assistant` tabs migrate to Inspector. A future assistant may return only with
a defined LLM-backed job, evidence contract, and adaptation handoff. No live Assistant type, renderer, component, or dedicated styling remains; only compatibility migration retains the historical ID.

Signals Relationship Web is also retired as a standalone view. Its implementation
was a registry list rather than a relationship graph, so persisted `signals-web`
tabs and signal selections route to State View. A future relationship graph must
support a distinct analysis job before becoming a separate surface. No live Signals view type, renderer, component, or dedicated styling remains; only compatibility migration retains the historical ID.

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
project before the editor workspace appears.

Canonical Studio deep links use query parameters with strict parent scope:

- `project=<project-id>` is required for all Studio workspace links.
- `flow=<top-level-flow-id>` is valid only with `project`.
- `subflow=<subflow-id>` is valid only with `project` and parent `flow`.
- `view=<canonical-view-id>` selects a supported visible inner view.
- `detail=<kind>:<id>` selects a `run`, `adaptation`, `recording`, `node`, or
  `state` detail.

The parser discards orphaned child scope and unknown values. Compatibility view
IDs normalize through the workspace migration map before use. Project switches
and closes remove stale Flow, subflow, view, and detail parameters while
preserving unrelated query parameters. In storage layout v2, project
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
is the authority even when client validation passes. The project action dialog
collects the PIN only after the user chooses an action, explains destructive
consequences inline, uses a danger command for deletion, and preserves server
errors in the dialog. One mutation lock owns all project/category actions so
double submission, Escape, and close are disabled until the pending request
settles. Users without a configured PIN receive a direct setup requirement
instead of an unusable field.
is intentionally global so later programs can use the same PIN authorization
path for their own privileged edit or destructive actions.

Project-owned state includes the custom hierarchy, deleted hierarchy IDs,
strict pane tabs, active pane, active view, main layout preset, main split
ratios, sidebar width/collapse state, right inspector width/collapse state,
bottom action preview height/collapse state, right-sidebar tabs, and per-view
state. Layout version 3 persists no freeform windows or geometry. Version 2
floating-window preferences are migration input only: full timeline views
remain main editor views, inspector/utility views move to the right sidebar,
and remaining main views become deterministic pane slots. Normalized output
then clears windows, activeWindowId, and maximizedWindowId. Runtime components
do not create, render, move, resize, snap, maximize, or page-fill windows.

Workspace persistence is debounced and signature-based. Loading a project seeds
the last-saved hierarchy signature, and `save-project-hierarchy` should only be
sent after real hierarchy or workspace changes, not continuously for equivalent
state.
Workspace Preferences uses the shared modal contract rather than a positioned
panel, so focus is trapped, the background is inert, Escape closes, trigger
focus returns, and narrow screens reflow consistently. Controls cover hierarchy
and Inspector widths, editor layout, Action Preview height/visibility,
operational density, and motion. Density only compacts repeated tree/table
surfaces; it does not globally shrink controls. Motion follows the operating
system by default and can be reduced explicitly. Reset workspace layout names
its full effect and restores the normalized version 3 defaults. Debounced
persistence reports saving and saved state in the dialog; a failure remains
visible there and also raises a global error alert.
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
The canonical Nodes canvas separates mutable graph-document ownership from its
React Flow rendering. The graph controller owns node and edge arrays,
synchronized imperative snapshots, functional updates, and atomic replacement
when a persisted source or recovered draft changes. Canvas presentation owns
selection, palette state, viewport controls, and interaction rendering. Pure
view-model and port modules continue to own conversion, layout, edge routing,
and compatibility rules, so unrelated workspace or runtime updates do not
rebuild graph payloads.
Unsaved graph documents are also isolated by project and Flow ID in a bounded browser draft record containing the graph, the canonical `updatedAt` value from which editing began, and the last recovery write time. Draft writes are debounced during editing and flushed when the selected Flow or project changes. Returning to another inner view does not discard the draft. After reload, the canvas offers explicit Restore Draft and Discard actions; a draft based on an older canonical Flow revision is labelled as stale before restoration. Saved and discarded drafts remove their recovery record.

Canvas save state is explicit: Saved, Unsaved changes, Saving, Save failed, or Save conflict. The global Save command waits for the active or background Flow editor result and never reports success from a timer. Saves submit `expectedUpdatedAt`; the service rejects a stale revision before any repository or file write. A conflict preserves the browser draft and tells the user that the canonical Flow changed rather than silently overwriting it.
The Flow canvas persists visual graph nodes and edges only. It does not create,
modify, or preserve hidden execution region records. Older Flow artifacts that
still carry region metadata are treated as model/source configuration rather
than as inline visual editor state.
Pointer movement uses transient dimensions while a workspace section is being
resized. Persisted sidebar widths, timeline height, or main split ratios are
written to workspace preferences only when the pointer interaction ends,
preventing config writes on every pixel. Keyboard resizing writes one bounded
increment per command. Workspace Preferences exposes the same dimensions and a
single Reset command that restores the complete version 3 default layout.
Canonical project recordings and normalized timelines use SQLite repositories
in `.fluxiq/global.sqlite`. Recording events remain ordered within the
canonical recording document; no event-type or snapshot folder is pre-created.
The conceptual ownership is:

Large graph behavior is an explicit whiteboard contract. React Flow renders only viewport-visible nodes and edges, while the minimap remains available on wider screens and is removed on narrow screens where it would obscure editing. Structural validation builds indexed node lookup once, performs linear edge and reachability passes, and compares ports directly; it does not search the full node array per edge. Problem projections and invalid node/edge arrays are memoized until graph state changes. Closed graph-outline rows use browser content visibility so opening a large semantic tree does not require painting every offscreen row.

The deterministic scale fixture includes a 180-node Flow. The browser surface matrix opens that Flow, verifies the whiteboard, visible node, toolbar, and minimum editing dimensions, and captures desktop, compact, and mobile screenshots through the existing Playwright projects. Unit performance coverage validates a connected 2,000-node graph under a 250 ms interaction budget.
The Nodes canvas provides a stable toolbar for Select, Pan, Fit, Zoom, Undo,
Redo, Validate, Graph Outline, and Add Node. V, H, F, plus/minus, Ctrl/Cmd+Z,
Ctrl/Cmd+Y, and A mirror those commands when focus is on the whiteboard. Undo
history is bounded and checkpointed before structural, parameter, connection,
and drag changes; source replacement clears incompatible history. The graph
outline is a semantic tree with one roving tab stop, Arrow/Home/End navigation,
Enter/Space selection, and node-focused viewport fitting. Structural validation
currently identifies missing or multiple Start nodes, unreachable nodes, and
dangling edges. Canvas context menus are not globally suppressed.
```text
.fluxiq/global.sqlite
  automation.recording_sessions
  automation.normalized_timelines
  automation.state
```

The Node palette keeps canonical registry categories but adds title,
description, family, and compatibility search. All, Favorites, and Recent modes
use the same filtered catalog. Favorites persist as UI-only local preferences;
recent nodes are bounded to the current session. Each node names its relevant
scope or source in user terms such as Flow only, Domain, Published Flow,
Project node, Code node, or Privileged action. Favorite and add commands are
separate buttons, never nested controls. Add Node and A expand the palette and
move focus to search.
Recording session writes are burst-safe. Automation Studio queues mutations per
recording ID, and each canonical repository write is atomic. Reconnects and
active-domain changes resolve the same global recording by stable ID and
project metadata.
If a client sends repeated event IDs, the recording framework preserves the
first ID and suffixes later duplicate timeline entry IDs before validation and
persistence. Timeline UI keys also include row index and sequence so older
recordings with duplicate IDs can still render.

Graph selection is set-based for command behavior. Ctrl/Cmd+A selects all nodes;
Ctrl/Cmd+C/V copies and pastes the selected induced subgraph; Ctrl/Cmd+D
duplicates it; Shift+Arrow moves selected nodes by a fixed grid increment; and
Delete removes selected nodes and edges. C stages a keyboard connection from
the current node and completes it against the next selected node using the same
typed-port compatibility rule as pointer connections. Duplicate, Connect, and
Delete also have toolbar commands. Nodes and edges remain natively focusable in
React Flow. Port handles announce input/output direction and their semantic
label. Standard Select-mode drag replaces the retired right-button marquee.
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

The Problems utility combines project snapshot issues with live validation of the selected Flow graph. Graph checks cover entry-point structure, reachability, dangling or type-incompatible connections, and invalid node parameters. Invalid nodes and edges receive an inline non-color-only error treatment. Problems normalizes severity, derives stable code/scope/message keys, and deduplicates repeated snapshot/live issues. Whole project and Current object scope controls combine with All, Errors, Warnings, and Info filters. Results group first by owning Flow/subflow/object and then as Blocking errors, Recommendations, or Information. The current selection supplies the object scope; choosing a row preserves visible selected state and opens/focuses the exact node, connection, route, field, or owning view through the shared callback. When refresh removes the selected issue, stale selection clears. Empty-project and empty-filter states differ, and lists render at most 100 rows per page in the fixed scrollable right utility region. The canvas Validate command opens this same shared Problems view rather than maintaining an isolated result dump.
The global Inspector follows global selection and identifies the selected object by type, friendly label, canonical ID, and owning Flow breadcrumb. It offers explicit Copy ID and context-aware Open Detail commands, clears stale filtering when selection changes, and filters loaded sections/widgets without inventing runtime values. An unselected state explains how to populate the panel. Canonical editor nodes retain schema-driven parameter editing; compatibility proposal detail is read-only. The recording timeline uses a
horizontal editor-style lane surface with preview snapping, event selection,
and selected-event summary data. Rejected client recording events are domain
contract validation failures, so they are reported through the client gateway
error/audit path instead of being appended as timeline evidence clips.

These controls are the UI foundation. Follow-up slices should connect them to
the persistent workspace layout model, command registry, undo/redo stack,
drag-and-drop pane docking, and schema-driven edit definitions.
