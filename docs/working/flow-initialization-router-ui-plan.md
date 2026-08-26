# Flow Initialization And Router UI Plan

Status: working plan
Owner: Automation Studio
Last updated: 2026-08-26

## Purpose

Automation Studio needs a better first-run path for new Flows and a primary
Flow Map view that can scale beyond a handful of subflows.

The current creation flow can leave users with a blank Flow that has no useful
instructions, no Flow Map route, and no manually created subflow path. That is a
bad default for LLM-assisted deterministic automation: without user intent,
runtime instructions, or an executable subflow target, the runtime has nothing
meaningful to do and the LLM has no bounded context for generation or
adaptation.

This plan defines:

- the minimum runnable structure for a new Flow;
- the manual creation model for Flows, subflows, Flow Map routes, and instructions;
- the visual Flow Map/orchestration editor concept;
- validation rules that stop empty or ambiguous Flows from running;
- staged implementation work.

## Product Principles

- A blank Flow should not feel like an empty code file. It should become a
  useful starter automation artifact immediately after creation.
- Instructions are first-class runtime inputs, not optional side notes. Any
  LLM-enabled Flow must have at least one instruction object before it can run.
- Flow Maps are decision maps. They decide which subflow handles the current
  situation; they do not perform low-level actions themselves.
- Subflows are action graphs. They define deterministic work once a route has
  selected them.
- Users must be able to create and edit objects manually. Recordings and LLM
  adaptations can help, but they cannot be the only way to author structure.
- Router UI must stay readable when a Flow has many subflows. It needs grouping,
  filtering, validation, and testing tools before the canvas becomes dense.

## Required Flow Shape

A runnable Flow should satisfy these requirements:

- It has a Flow-level instruction object, or inherits an enabled global/project
  instruction object.
- It has at least one active subflow and a runnable Flow Map route, or a simple
  direct-entry route to one active subflow.
- If adaptive or manual-approval LLM intervention is enabled, the Flow has at
  least one instruction object in scope.
- The Flow Map has a fallback route when more than one route can be evaluated.
- Every active route target resolves to an active subflow.
- Every subflow exposed as a route target has a display name, role, and graph
  Flow ID.

A non-runnable draft Flow may violate these rules, but runtime actions should
show a blocking readiness state instead of attempting execution.

## Initial Flow Creation

Creating a new Flow should open a setup modal or wizard instead of creating a
silent blank artifact.

### Required Fields

- Flow name
- Flow goal or task description
- Initial instructions
- Starting structure
- Adaptive mode

### Optional Fields

- Systems/pages/apps involved
- Known inputs
- Expected output or success condition
- Safety constraints
- Error handling preference
- Initial subflow name
- Initial route group name

### Starting Structure Options

1. Simple Flow

Creates:

```text
Flow
  Instructions
    Flow Instructions
  Flow Map
    Direct Entry
  Subflows
    Main Task
  Settings
```

Use when the Flow has one obvious path and no route decision is needed yet.

2. Routed Flow

Creates:

```text
Flow
  Instructions
    Flow Instructions
    Routing Instructions
    On Error
  Flow Map
    Main Route
    Fallback Route
  Subflows
    Checkout
      Main Task
      Error Recovery
    Account
      Login
      Verify Session
  Settings
```

Use when the Flow may choose among multiple paths or needs explicit fallback
behavior.

3. Advanced Empty Draft

Creates only the Flow shell and a draft instruction object. This should be
available for advanced users, but it should still warn that the Flow is not
runnable until it has instructions plus an active subflow and Flow Map entry.

### Default Recommendation

Default to Routed Flow for LLM-assisted deterministic automation. It gives the
system a clear main path, an error path, and a place to grow without changing
the conceptual model later.

## Sidebar Object Model

The Flow sidebar should expose the runnable structure directly:

```text
Flow Name
  Instructions
    Flow Instructions
    Routing Instructions
    On Error
  Subflows
    Checkout
      Main Task
      Error Recovery
    Account
      Login
      Verify Session
  Recordings
  Adaptations
  Runtime Debug
  Settings
```

Rules:

- There is no separate top-level category for proposals; adaptations own that
  lifecycle.
- There is no standalone Router object in the Flow sidebar.
- Clicking the Flow opens the Flow Map/routes primary view.
- The Flow Map owns route groups, route rules, fallback behavior, and target
  selection.
- Instructions remain editable objects with scope metadata.
- Subflows are their own object type under the Flow and own deterministic action
  graphs.
- The `Subflows` folder supports user-created category folders.
- Subflow category folders are recursive: every subflow category row can create
  a nested subcategory with its own plus button.
- Subflows can live directly under `Subflows` or inside any nested subflow
  category.
- Selecting any object must visibly select that object in the sidebar.
- Creation actions should live on the relevant folder row and in contextual
  empty states.

## Manual Creation Requirements

Users need explicit UI actions for:

- New Flow
- New Instruction
- New Route Group
- New Subflow
- New Subflow Category
- Nested Subflow Category
- Duplicate Subflow
- Disable Subflow
- Archive/Delete object where supported
- Add Route
- Add Route Group
- Connect Route to Subflow
- Create Subflow from Route Target

Manual creation should not require a recording or LLM proposal.

## Flow Map Concept

The Flow Map selects the next subflow based on inputs, state, context, run
history, errors, or LLM-classified intent.

A Flow Map is not a general-purpose action graph. It should have fewer node
types than subflow action graphs and should privilege readability over arbitrary
composition.

### Flow Map Node Types

- Start
- Route Group
- Intent Match
- State Condition
- Data Presence
- Error Condition
- Priority/Fallback
- Run Subflow
- Ask For Clarification
- Stop With Reason

### Route Rule Fields

Each route rule should support:

- display name;
- enabled/disabled state;
- priority/order;
- natural-language condition;
- deterministic predicate, when available;
- optional LLM classification prompt;
- confidence threshold for LLM-classified routes;
- target subflow ID or terminal behavior;
- fallback flag;
- notes/instructions scoped to the route.

### Flow Map Validation

The editor should warn or block for:

- no fallback route when multiple routes can be evaluated;
- route target missing;
- target subflow archived or disabled;
- duplicate route priority;
- unreachable route after an unconditional route;
- multiple fallbacks;
- LLM route without instructions;
- condition text present but no deterministic predicate or classifier mode;
- route group with no active children.

## Flow Map Visual UI

The Flow primary view should use a visual editor similar in spirit to the Flow canvas, but optimized for decision-making. This replaces the previous standalone Router object UI.

### Layout

```text
Left panel: route inventory and subflow targets
Center: Flow Map decision canvas
Right panel: selected node/rule editor
Bottom or side panel: test route input and validation results
```

### Left Panel

Shows:

- route groups;
- all active subflows;
- disabled/archived subflows, collapsed by default;
- search/filter by subflow name, route name, condition text, provider tag;
- create route and create subflow actions.

### Center Canvas

Shows:

- Start node at the left/top;
- route groups as collapsible lanes or containers;
- condition/intent/error nodes as decision cards;
- terminal subflow nodes with subflow icon and status;
- fallback route visually distinct from primary routes;
- edge labels showing rule priority or condition summary.

The canvas should avoid spaghetti for large Flow Maps. It should support:

- automatic layout by priority/group;
- collapsed groups;
- search focus;
- fit-to-selection;
- validation badges on problematic nodes;
- compact mode for large Flow Maps.

### Right Inspector

When a route node is selected, show structured controls:

- Name
- Enabled toggle
- Route type
- Priority
- Condition summary
- Deterministic predicate builder
- LLM classifier toggle and prompt
- Confidence threshold
- Target behavior
- Target subflow selector
- Route-scoped instructions

The inspector should not default to raw JSON. A JSON/details view can exist as
an advanced read-only/debug panel, but the main route editor must be form and
canvas based.

### Route Test Panel

The route test panel should let users enter or select:

- sample input payload;
- current state snapshot;
- error context;
- available extracted variables;
- optional natural-language user intent.

It should show:

- selected route;
- skipped routes and reasons;
- confidence scores;
- fallback usage;
- validation warnings;
- target subflow preview.

## Flow Readiness UI

Every Flow should have a readiness state visible in the main workspace and
runtime debug panel.

Readiness statuses:

- Runnable
- Draft: missing instructions
- Draft: missing subflow
- Draft: missing Flow Map fallback
- Draft: route target missing
- Draft: validation errors

Runtime controls should be disabled when readiness is not runnable. The empty
state should include direct actions, not just text:

- Add Flow Instructions
- Create Main Subflow
- Create Main Route
- Run Readiness Check

## Instructions UX

Instructions are required enough that they should be created during Flow setup,
but still editable later.

Instruction scopes to support:

- global;
- project;
- Flow;
- router;
- route;
- subflow;
- node;
- on error;
- adaptation review.

Instruction editor requirements:

- title/name;
- scope selector;
- associated Flow/router/subflow/node selector;
- enabled toggle;
- tags;
- priority/order;
- instruction body;
- preview of resolved instruction stack for a selected run context.

## Runtime And LLM Behavior

The runtime should never ask the LLM to infer the entire purpose of a Flow from
an empty artifact.

Rules:

- If no instructions resolve for an LLM-enabled Flow, block before execution.
- If no Flow Map route or subflow target exists, block before execution.
- Flow Map route selection should be logged in perfect order in the run log.
- Route decisions should record input evidence, matched rule, skipped rules,
  fallback usage, target subflow, confidence, and whether LLM classification was
  used.
- LLM adaptations may propose or apply Flow Map route edits, route additions, and new
  subflows only through validated structural patches.

## Data Model Direction

The existing Flow router/subflow/instruction model can be extended rather than
replaced.

Likely additions:

- `AutomationStudioFlowReadiness` summary;
- Flow Map visual layout metadata;
- route group records;
- route node positions;
- route test fixtures;
- route validation results;
- first-run setup metadata on Flow creation;
- manual creation source metadata.

Flow Map visual metadata should not be required for runtime execution. Runtime
should execute the normalized route rule model; UI layout is presentation data.

## Flow Primary View Replacement Plan

Status: planned

The current UI still has two competing concepts: clicking a Flow opens the old
Flow graph editor, while clicking Router opens the routing view. That is
confusing for the new model. The user-facing model should be:

```text
Flow row click -> Flow Map / route orchestration
Subflow row click -> deterministic action graph editor
Instructions row click -> scoped instruction editor
Runtime Debug row click -> run/debug detail views
Settings row click -> usable Flow settings
```

### Decisions

- Remove the standalone Router object from the Flow sidebar.
- Treat the Flow primary view as the router/orchestration surface.
- Keep the normalized route/runtime records internally if they are useful for
  execution, validation, and compatibility.
- Rename user-facing Router language to Flow Map, Routes, Route Groups, and
  Fallback.
- Subflows remain the only place where deterministic action graph editing lives.
- A Flow can start with one direct-entry route to a main subflow, then grow into
  multiple route groups without changing the mental model.

### Migration Steps

1. Inventory current Flow click behavior, Router object behavior, and subflow
   graph behavior in Automation Studio.
2. Change sidebar hierarchy generation so the Router object is no longer emitted
   as a Flow child.
3. Change the `policy-primary` / Flow click view to render the Flow Map view.
4. Preserve current router runtime data by loading/saving it behind the Flow Map
   view.
5. Rename visible Router strings in the primary view to Flow Map, Routes, Route
   Groups, or Fallback.
6. Keep old router endpoint names temporarily if needed, but hide that naming
   from the UI.
7. Ensure selecting the Flow row visually selects the Flow row while showing the
   Flow Map primary view.
8. Ensure selecting a subflow row opens the subflow action graph editor, not the
   Flow Map.
9. Add empty-state actions in the Flow Map: add route, add route group, create
   main subflow, create fallback subflow.
10. Add tests proving the sidebar has no Router object and Flow click opens the
    Flow Map.
11. Update authored docs after implementation.

### Acceptance Criteria

- The left sidebar under a Flow shows no separate Router object.
- Clicking the Flow row opens the Flow Map/orchestration view.
- The Flow Map shows route groups, route rules, fallback, readiness, and target
  subflows.
- Subflow action graphs are edited only from subflow rows/details.
- Runtime still has a normalized route/router structure it can execute
  deterministically.
- Existing saved route data continues to load through the new Flow Map view.
- The UI does not use raw JSON as the primary editing surface.

## Implementation Phases

### Phase 1: Readiness And Starter Flow Contract

Goal: prevent useless blank runnable flows.

Steps:

1. Define Flow readiness checks in runtime/model code.
2. Add readiness data to Flow snapshot/detail responses.
3. Block runtime execution when readiness is not runnable.
4. Add tests for missing instructions, missing subflow, missing Flow Map fallback,
   and missing route target.
5. Add UI readiness states and direct action buttons.
6. Update docs.

### Phase 2: Flow Setup Wizard

Goal: make new Flow creation produce a useful starter artifact.

Steps:

1. Replace bare new-flow creation with a setup modal.
2. Collect Flow goal, initial instructions, adaptive mode, and starting
   structure.
3. Create Flow instruction object during setup.
4. Create Main Task subflow for Simple Flow.
5. Create Main Route, Main Task, and Error Recovery for Routed Flow.
6. Select the first useful object after creation, usually Flow Instructions or
   the Flow Map.
7. Add tests for starter structure creation.
8. Update docs.

### Phase 3: Manual Object Creation

Goal: let users author structure without recordings.

Steps:

1. Add folder-level create buttons for Instructions and Subflows, plus Flow Map
   empty-state actions for routes and route groups.
2. Add empty-state create buttons inside each object view.
3. Add manual Flow Map route/group creation support if current API only exposes
   default router access.
4. Add manual subflow creation UI around existing create-subflow endpoint.
5. Add instruction creation UI that supports scopes and associations.
6. Ensure sidebar selection stays correct after creating any object.
7. Add delete/archive/disable flows where supported.
8. Update tests and docs.

### Phase 4: Flow Primary View / Flow Map MVP

Goal: make the Flow click open an understandable orchestration and routing view, not a generic empty action graph or separate Router object.

Steps:

1. Define Flow Map canvas DTO: nodes, edges, groups, selected route, validation.
2. Route the Flow primary view to the Flow Map UI instead of the generic action
   graph editor.
3. Render Start, route, fallback, and Run Subflow nodes.
4. Add right inspector for selected route fields.
5. Add target subflow selector and create-subflow-from-route action.
6. Add route priority editing and visual ordering.
7. Add validation badges and validation panel.
8. Persist visual layout metadata without making runtime depend on it.
9. Add UI tests for route creation, target assignment, fallback warning, and
   selected route editing.
10. Update docs.

### Phase 5: Flow Map Scale Features

Goal: keep Flow Maps usable with many subflows.

Steps:

1. Add route groups.
2. Add collapse/expand group behavior.
3. Add search/filter across routes and target subflows.
4. Add compact canvas mode.
5. Add fit-to-selection and focus selected route behavior.
6. Add warnings for dense/ambiguous Flow Maps.
7. Add tests for grouped route rendering and filtering.
8. Update docs.

### Phase 6: Route Test Harness

Goal: let users understand routing before running a full automation.

Steps:

1. Define route test fixture model.
2. Add route-test endpoint that evaluates router rules without executing
   subflows.
3. Support input payload, state snapshot, error context, variables, and user
   intent text.
4. Show selected route, skipped route reasons, confidence, fallback use, and
   target subflow preview.
5. Store optional named route test fixtures.
6. Add tests for deterministic and LLM-classified route tests.
7. Update docs.

### Phase 7: Runtime Logging Integration

Goal: make Flow Map route decisions visible in runtime debug.

Steps:

1. Emit structured run events for Flow Map entry, route evaluation, route match,
   skipped routes, fallback, and target subflow entry.
2. Add run detail UI sections for routing decisions.
3. Link route events back to Flow Map/rule/subflow objects.
4. Add JSON detail expansion for individual Flow Map events only.
5. Add tests for event ordering and run detail pagination.
6. Update docs.

## Open Questions

- Should every Flow expose exactly one primary Flow Map, with advanced nested
  route groups instead of multiple Flow Maps?
- Should Simple Flow create a visible single direct-entry route, or run the main
  subflow directly until another route is added?
- Which route predicate builder should ship first: simple field comparison,
  JSONPath-like selectors, or a small expression DSL?
- Should route-scoped instructions live inside route rules or remain separate
  instruction objects linked by scope?
- Should adding a second subflow prompt the user to create or update the Flow
  Map?

## Recommended Next Step

Start with Phase 1 and Phase 2 together. Readiness checks and starter creation
are tightly coupled: the product should first define what counts as runnable,
then make the default creation path satisfy that definition.
## Implementation Notes

### 2026-08-25 - Recursive Subflow Categories

Status: implemented

- The generated `Subflows` folder now exposes an inline plus action for creating
  subflow category folders.
- Subflow category folders can be nested recursively, and each nested category
  row exposes the same plus action for creating a child category.
- Categories are persisted on the owning Flow metadata as `subflowCategories`
  with `id`, `name`, `parentId`, `createdAt`, and `updatedAt`.
- Subflow categories are user-created hierarchy folders: they are not treated as
  protected generated Flow structure, while the root `Subflows` folder remains
  protected from deletion.
### 2026-08-26 - Flow Primary View Planning

Status: planned

- The working plan now treats the Flow row click as the Flow Map/router
  replacement.
- The standalone Router object should be removed from the Flow sidebar.
- Router runtime data can remain internally, but user-facing UI should say Flow
  Map, Routes, Route Groups, and Fallback.
- Subflows remain separate deterministic action graph objects.
### 2026-08-26 - Flow Primary View Replacement Step 1

Status: completed

Inventory confirmed the current mismatch:

- `policy-primary` / Flow click still renders the generic action graph canvas.
- The generated `Router` sidebar object still opens the route table view.
- Subflow rows still point at `policy-primary`, so selecting them does not make
  the subflow graph feel like its own object.

Next implementation step: remove the Router sidebar object and make
`policy-primary` render the Flow Map primary view.
### 2026-08-26 - Flow Primary View Replacement Step 2

Status: completed

Implementation scope for this code pass:

- Remove the standalone Router object from generated Flow sidebar children.
- Make `policy-primary` render the Flow Map view using existing
  `get-flow-router` data.
- Keep existing router records read-only in the Flow Map until a write endpoint
  for routes/groups is added.
- Point subflow rows at the Subflows workspace so action graph editing is owned
  by subflow objects.

Backend follow-up: expose validated route/group mutation endpoints instead of
adding unsaved UI controls.
### 2026-08-26 - Flow Primary View Replacement Step 3

Status: completed

Validation scope:

- Focused hierarchy tests must prove the Router object is not emitted and
  subflows route to the Subflows workspace.
- Workspace view tests must prove the primary orchestration surface renders as
  Flow Map.
- Web type checking must pass after rerouting `policy-primary` away from the
  generic action graph canvas.
### 2026-08-26 - Flow Primary View Replacement Step 4

Status: completed

Implementation outcome:

- Generated Flow hierarchy no longer emits a standalone Router object.
- `policy-primary` now renders the Flow Map orchestration view instead of the
  generic action graph canvas.
- A dedicated `flow-subflows` view owns subflow list/detail/action graph editing.
- Subflow folder/category/subflow rows point at the Subflows workspace.
- Visible UI copy now uses Flow Map terminology where the old Router view was
  user-facing.
- Existing `get-flow-router` data is still read internally as the compatibility
  route record backing the Flow Map.
### 2026-08-26 - Flow Map Mutation Step 1

Status: completed

Reference: Phase 3 step 3 and Phase 4 steps 4-6.

Inventory confirmed the next implementation gap:

- The normalized Flow router model already supports validated route rules and
  fallback targets.
- Runtime service storage already supports `getFlowRouter` and `saveFlowRouter`.
- The public Automation Studio API only exposes `get-flow-router`, so the Flow
  Map UI cannot safely create, edit, delete, or group routes yet.
- Route groups can be added as router metadata first, because runtime execution
  only depends on normalized route rules.

Implementation scope for this pass:

1. Add validated Flow Map route and route-group mutation endpoints.
2. Store route-group records in router metadata without changing runtime
   execution semantics.
3. Replace read-only Flow Map route rows with structured user controls for
   route/group creation and editing.
4. Keep JSON detail read-only and secondary.
5. Add focused tests and update this plan after each implementation step.
### 2026-08-26 - Flow Map Mutation Step 2

Status: completed

Reference: Phase 3 steps 1-3 and Phase 4 steps 4-6.

Backend implementation now exposes structured route/group writes:

- `save-flow-map-route-group`
- `delete-flow-map-route-group`
- `save-flow-map-route`
- `delete-flow-map-route`

All writes go through the existing router store and `saveFlowRouter` validation.
The UI step now replaces the read-only Flow Map table with structured route and
route-group controls, while keeping raw JSON as an advanced read-only detail.
### 2026-08-26 - Flow Map Mutation Step 3

Status: completed

Reference: Phase 3 step 8 and Phase 4 step 9.

Validation target for this pass:

- Runtime service tests cover route-group creation, route creation, fallback
  assignment, and route deletion through the new structured mutation methods.
- Web workspace tests prove the Flow Map primary view renders structured route
  controls instead of only the old read-only route table.
- Package checks must pass after the route/group mutation implementation.
### 2026-08-26 - Flow Map Mutation Step 4

Status: completed

Implementation outcome:

- Flow Map route groups are now first-class editable records in router metadata.
- Flow Map routes can be created, edited, deleted, grouped, assigned to target
  subflows, and marked as the fallback target through structured UI controls.
- Flow Map writes are exposed through validated API endpoints and persist through
  the existing router store, so runtime execution continues to use the normalized
  route model.
- The primary Flow Map view is now a multi-pane working editor with route-group
  filters, subflow target inventory, single-line route rows, and a route
  inspector form.
- Raw JSON remains available only as an advanced read-only detail view.
- Focused runtime service and web workspace tests cover the new mutation and UI
  behavior.
- Framework reference docs were regenerated after the public contract/model
  change.
### 2026-08-26 - Router Object Restoration

Status: completed

Correction: the Router object must remain visible and selectable in the Flow
sidebar. The previous Flow-primary replacement went too far by hiding Router as
an object. The corrected navigation model is:

```text
Flow row click -> Flow editor / primary Flow object
Router row click -> route orchestration editor
Subflow row click -> deterministic subflow action graph editor
```

The route/group mutation backend remains valid, but the structured route UI is
owned by the Router object view, not by replacing the Flow object itself.
### 2026-08-26 - Flow Row Router Selection

Status: completed

Clicking a Flow row now automatically targets the Flow's Router child object.
The Flow remains the selected runtime context, but the sidebar primary selection
and opened workspace view move to the Router object so route orchestration is the
first thing users see when entering a Flow.
### 2026-08-26 - Router Visual Selection Correction

Status: completed

When a Flow's Router view is active, the Router child object owns the left
sidebar primary selection. The parent Flow row remains context only and no
longer renders selected or correlated in that state.
### 2026-08-26 - Flow Click Handler Correction

Status: completed

Correction to the prior Router selection entry: the pure Router target helper was
present, but the actual project tree click handler still selected/opened the
Flow node. The handler now resolves the Router child before setting the primary
tree node and before opening the workspace view.
### 2026-08-26 - Router UX Rework Step 1

Status: in progress

Reference: Phase 4 steps 3-7 and Phase 5 steps 1-3.

The Router object currently opens a sparse route workspace with too little visual
structure. This pass should make Router feel like a real route orchestration
surface:

- keep Router as the selected sidebar object;
- replace the blank center surface with a readable decision map;
- show Start, route groups, route rules, target subflows, and fallback as
  distinct visual regions;
- keep route rows compact and selectable;
- keep JSON secondary;
- make empty states action-oriented without turning the view into a raw form.
### 2026-08-26 - Router UX Rework Step 2

Status: in progress

Reference: Phase 4 steps 3-7 and Phase 5 step 7.

Implementation now renders a decision-map center surface with Start, route lanes,
route cards, fallback, and a compact route list. Validation must prove the
Router workspace exposes these user-facing regions and still type-checks.
### 2026-08-26 - Router UX Rework Step 3

Status: completed

Validation completed for the Router UX slice:

- Router workspace test covers the decision map, Start, fallback, compact route
  list, and empty-route action state.
- Web type checking passes after the visual Router map changes.
### 2026-08-26 - Subflow Folder Create Modal

Status: completed

The plus button on `Subflows` and nested subflow category folders now opens the
same type-selection modal pattern as top-level creation, scoped to `Subflow` and
`Folder`. Choosing `Subflow` calls the existing `create-flow-subflow` endpoint;
choosing `Folder` creates a nested subflow category.
### 2026-08-26 - Subflow Creation Modal Correction

Status: in progress

Reference: Phase 2 steps 1-4 and Phase 4 steps 3-7.

The `Subflows` folder and every nested subflow category folder must use the same
creation modal pattern as top-level hierarchy creation. The scoped choices are:

- `Subflow`: create a real flow subflow object and attach it to the parent Flow's
  `expansion.subflowIds` so it appears in the left sidebar immediately.
- `Folder`: create a nested subflow category folder under the selected Subflows
  location.

### 2026-08-26 - Router Empty State Plan

Status: in progress

Reference: Phase 4 steps 3-7 and Phase 5 steps 1-3.

When Router opens before a Flow has subflows, it must not show an empty whiteboard.
The Router view should instead explain that routing needs at least one subflow
and present the next usable action path. Routes remain disabled until a target
subflow exists.
Implementation note: the Subflows create modal now distinguishes real subflow
objects from folder/category objects. Subflow creation calls
`create-flow-subflow`, then saves the parent Flow expansion so the new subflow is
visible in the hierarchy immediately. Router now shows a no-subflows setup state
instead of an empty decision canvas.
### 2026-08-26 - Router Workspace Instance Correction

Status: completed

Reference: Router Object Restoration and Flow Click Handler Correction.

The Router hierarchy object remains backed by a real `flow-router` workspace
instance. The Flow editor entry is separate from Router; clicking the Flow row
can route users into Router, while clicking the Router object opens the Router
workspace directly.
## 2026-08-26 - Router First-Use UI Correction

Status: Completed and validated on 2026-08-26.

Validation: web type check, 21 focused Automation Studio tests, authored documentation check, diff check, and production web build all passed.

- Replace the zero-subflow Router canvas, route list, groups, and disabled inspector with a dedicated first-use state.
- Give the empty state one primary `Create subflow` action that opens the same hierarchy creation modal used by the sidebar.
- Restyle the hierarchy creation flow as a focused type picker and form instead of an authorization/data-summary dump.
- Refresh Router subflow targets immediately after creation so the editor does not remain stale.
- Verify component tests, web checks, build, and authored documentation.

## 2026-08-26 - Subflow Editor Navigation Contract

Status: Completed and validated on 2026-08-26.

Validation: web and package type checks/builds passed; 28 focused web tests and 83 framework runtime tests passed; documentation and diff checks passed.

- Keep the Subflows folder as the hierarchy container and collection entry point.
- Make every subflow object resolve its graphFlowId and open policy-primary, the normal visual Flow editor.
- Keep the subflow row visibly selected while its graph Flow is active.
- Hide backing subflow graph Flows from the top-level Flow hierarchy.
- Open newly created subflows directly in their normal Flow editor.
- Reduce the Subflows workspace to a paginated directory whose rows open the normal Flow editor; remove its embedded graph editor and detail tooling.
- Add hierarchy and navigation regression coverage, then run web and documentation validation.

## 2026-08-26 - Subflow Sidebar Display Names

Status: Completed and validated on 2026-08-26.

Validation: web type check, 15 focused hierarchy tests, documentation and diff checks, and the production web build passed.

- Persist the subflow display name alongside its ID in parent Flow expansion entries.
- Resolve existing names from backing subflow graph Flow summaries when older expansion entries contain only IDs.
- Keep IDs as internal identity and use them only as the final compatibility fallback label.
- Add hierarchy regression coverage and rerun web, package, documentation, and build validation.

## 2026-08-26 - Subflow Graph Sidebar Flicker

Status: Completed and validated on 2026-08-26.

Reference: Subflow Editor Navigation Contract and Subflow Sidebar Display Names.

Validation: 73 runtime tests, 3 storage contract tests, 5 focused web hierarchy tests, FluxIQ and web type checks/builds, authored/generated documentation checks, and the final diff check passed.

The persisted index marker, one-time canonical ownership repair, mutation compatibility, and stale-index regression are complete.

- Treat the graph Flow owned by a subflow as an internal implementation record on the first workspace summary response.
- Add a persisted ownership-metadata marker to the Flow summary index.
- Repair pre-marker indexes once from canonical Flow documents, then retain the lightweight summary-only read path.
- Prevent internal graph Flow names such as `GRAPH` from briefly rendering as top-level sidebar objects.
- Add a stale-index regression test and validate framework, web hierarchy, documentation, and production builds.

## 2026-08-26 - Recursive Flow and Subflow Object Containers

Status: Completed and validated on 2026-08-26.

Reference: Subflow Graph Sidebar Flicker and Subflow Editor Navigation Contract.

Validation: web type check, 16 focused hierarchy tests, the full 119-test web suite, production web build, authored/generated documentation checks, and final diff validation passed.

Recursive graph-scoped object generation, independent disclosure controls, default-collapsed subflows, and selection ownership are complete.

- Keep internal subflow graph Flows out of the top-level Flows collection permanently.
- Make top-level Flow rows and subflow rows expandable hierarchy containers.
- Give each subflow the same Router, Subflows, Instructions, Recordings, Adaptations, Runs, Runtime Debug, and Settings objects as a normal Flow, scoped to its canonical graph Flow ID.
- Keep top-level Flow containers expanded by default and subflow containers collapsed by default.
- Preserve direct subflow-row navigation to the normal visual Flow editor while disclosure controls expand or collapse its objects independently.
- Add hierarchy-model and rendered-tree regression coverage, then run web checks, tests, docs, and production build validation.

## 2026-08-26 - Dedicated Subflow Settings

Status: Completed and validated on 2026-08-26.

Reference: Recursive Flow and Subflow Object Containers.

Validation: web and framework type checks/builds, 14 focused view tests, 73 runtime tests, the full 120-test web suite, authored/generated documentation checks, and final diff validation passed.

Context-sensitive settings selection, structured mapping controls, subflow persistence, and clear-to-inherit approval behavior are complete.

- Detect Settings opened for an internal subflow graph through its parent Flow/subflow ownership metadata.
- Render a dedicated subflow settings surface instead of the generic Flow training/settings form.
- Persist subflow identity, role, route tags, local instruction bindings, proposal approval override, and structured input/output mappings through `update-flow-subflow`.
- Keep backing graph identity and lifecycle status visible but non-editable from ordinary form fields.
- Support clearing an inherited proposal-mode override without JSON editing.
- Preserve the ordinary Flow settings surface for top-level Flows and validate both variants.
## 2026-08-26 - Populated Router Workspace Replacement

Status: Completed and validated on 2026-08-26.

Reference: Router First-Use UI Correction and Recursive Flow and Subflow Object Containers.

This phase applies only after at least one subflow exists. The zero-subflow
onboarding state remains unchanged.

- Remove the duplicated decision-map cards, compact route list, statistics strip, permanent inspector, and raw Router JSON from the populated Router view.
- Make one ordered route table the primary workspace, with route condition, target, group, status, and priority visible in a single scan.
- Add compact group filters with route counts and direct group-management actions.
- Show fallback behavior as a persistent, readable row beneath the ordered routes.
- Open route creation and editing in a focused modal with common fields first and advanced matching controls disclosed only when needed.
- Preserve the existing Router persistence and authorization contracts while closing the editor cleanly after saves and deletes.
- Wait for both Router and subflow target reads before choosing the populated or zero-subflow state.
- Add populated-state regression coverage and validate the web checks, tests, documentation, and production build.

Checkpoint: the populated route table, group filters, fallback row, focused route editor, responsive scrolling, preloaded-data render path, architecture documentation, and focused 15-test view suite are complete.
Validation: the focused 15-test workspace suite and full 121-test web suite passed; web type check, authored/generated documentation check, production web build, and final diff validation passed. Router and subflow reads now share one initial loading boundary, so an existing populated Router cannot flash the zero-subflow onboarding state while its targets are still loading.

### 2026-08-26 - Route Editor Modal Sizing Correction

Status: Completed and validated on 2026-08-26.

Reference: Populated Router Workspace Replacement.

- Give the route editor modal a scoped wide-panel size instead of inheriting the shared 520px dialog width.
- Remove the route form's nested scrollbar and let the dialog use the available viewport height.
- Keep outer-dialog scrolling only as a small-screen fallback.
- Add shared-modal class regression coverage and rerun web validation.

Validation: 17 focused shared-modal and Router view tests, web type check, production web build, documentation check, and final diff validation passed. The route editor has no nested scroll container; its scoped 760px panel uses the available viewport and scrolls only at the outer dialog when required.

## 2026-08-26 - Refresh-Safe Subflow Hierarchy Hydration

Status: Completed and validated on 2026-08-26.

Reference: Subflow Graph Sidebar Flicker, Subflow Sidebar Display Names, and Recursive Flow and Subflow Object Containers.

- Extend the lightweight Flow summary index with normalized subflow entries and nested subflow-category metadata.
- Rebuild summary-only Flow catalog entries with enough expansion data to render the complete sidebar immediately after refresh.
- Add a one-time persisted summary-index metadata repair for existing projects without loading every full Flow on every request.
- Preserve hierarchy metadata markers across Flow save and delete mutations.
- Add stale-index, summary-mapping, and rendered hierarchy regression coverage.
- Validate framework and web checks, tests, documentation, and production builds.

Checkpoint: Flow summaries now persist normalized subflow/category hierarchy data, existing summary indexes repair both ownership and hierarchy metadata once, summary-only web catalog entries rebuild the recursive sidebar after refresh, and focused framework/web regressions pass.
Validation: framework and web type checks, 93 framework service/runtime tests, 3 storage contract tests, 13 focused web refresh/hierarchy tests, the full 122-test web suite, framework and web production builds, authored/generated documentation checks, and final diff validation passed.

## 2026-08-26 - Top-Level Router Ownership Correction

Status: Completed and validated on 2026-08-26.

Reference: Recursive Flow and Subflow Object Containers and Refresh-Safe Subflow Hierarchy Hydration.

- Keep Router as a child object only of top-level Flows.
- Remove Router from every subflow hierarchy container, including recursively nested subflows.
- Preserve subflow navigation to its normal deterministic graph editor and retain its other scoped objects/settings.
- Update hierarchy and rendered-tree regression coverage to enforce Router ownership.
- Correct the authored workspace model and validate web checks, tests, docs, and production build.

Checkpoint: recursive hierarchy generation now opts into Router only for top-level Flows and explicitly excludes it for every subflow container. Subflow rows still open their graph editor directly, while all 24 focused hierarchy/render/refresh tests pass.
Validation: 24 focused hierarchy/render/refresh tests, the full 122-test web suite, web type check, production web build, authored/generated documentation checks, and final diff validation passed.

## 2026-08-26 - Subflow Container And Nodes Object

Status: Completed and validated on 2026-08-26.

Reference: Top-Level Router Ownership Correction and Subflow Editor Navigation Contract.

- Treat each subflow row as a collapsible hierarchy container rather than the graph-editor object itself.
- Add a generated `Nodes` child object scoped to the subflow's canonical `graphFlowId` and backed by the normal Flow editor.
- Make clicking a subflow name expand its container and select/open `Nodes`; keep the disclosure arrow as an independent collapse control.
- Restore `Nodes` as the selected sidebar object when a subflow graph is already active after refresh.
- Give `Nodes` its own graph/whiteboard icon and preserve all other subflow-owned objects.
- Add hierarchy-model, primary-target, rendered-selection, and refresh regression coverage, then validate web checks, tests, docs, and build.

Checkpoint: recursive hierarchy generation now adds a graph-scoped `Nodes` object to every subflow container. Subflow-name activation expands the container, targets `Nodes`, and active-view ownership keeps only `Nodes` selected after navigation or refresh. The focused 25-test hierarchy/navigation suite, web type check, full 123-test web suite, and production web build pass.
Validation: authored/generated documentation checks and final diff validation also pass. The subflow container remains expanded whenever its graph is active, only the graph-scoped `Nodes` child owns visual selection, and top-level Flow clicks continue to target Router.