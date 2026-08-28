# Automation Studio UI Lag Root-Cause Audit

Status: audit complete, remediation not complete  
Date: 2026-08-27  
Scope: Automation Studio view switching, Flow/subflow/folder/recording create/delete, Runtime Debug, graph editor interactions, client-side instrumentation, and current performance test coverage.
Remediation plan: `docs/working/automation-studio-lag-remediation-plan.md`

This audit was created after the 2026-08-27 hotfix pass that removed eager cache/API metric serialization, removed Runtime Debug polling, and restored finite graph render caps. The UI is better, but still has significant lag because several core interaction paths are still modeled as durable project/data mutations instead of cheap local UI transitions.

## Executive Summary

The remaining lag is not one isolated slow endpoint. It is a system-design problem in the Automation Studio shell:

- Simple view clicks update persisted workspace preferences, capture/restore selection, serialize hierarchy state, and schedule `save-project-hierarchy`.
- Request coordination stores unused request state in React state, causing top-level Studio rerenders on request start/finish even when no UI consumes the request state.
- Create/delete mutations invalidate caches and kick sync, but often do not update the local state arrays that actually drive the visible tree.
- Flow and subflow mutations still bypass the newer project change-feed/unit-of-work layer, so the client waits on a sync system that never receives the relevant events.
- Graph editor clicks/drags still route ephemeral selection/drag metadata through durable graph, history, viewport, draft, and validation machinery.
- Existing performance tests can pass while the browser remains unusable because they mostly wait for text visibility, not post-paint responsiveness, idle network, or mutation-to-visible-update latency.

These root causes explain the reported symptoms:

- Window/view click takes seconds even with no data: view selection touches persisted workspace state and whole-Studio render paths.
- Create Flow takes too long and may require refresh: the created Flow is not merged into `projectFlows`, while hierarchy is generated from `projectFlows`.
- Delete Flow/folder/recording may feel stale: deletion invalidates or persists side data without consistently mutating the local hierarchy source state.
- Graph/editor interactions feel sticky: selection and drag are treated like persistent graph document edits.

## Highest Priority Root Causes

### P0. View selection is treated as persisted workspace mutation

Evidence:

- `AutomationStudioLive` persists hierarchy/workspace state after every signature change in `customHierarchyNodes`, `deletedHierarchyIds`, or `workspacePrefs`: `AutomationStudioLive.tsx:1169` (`apps/web/src/features/automation-studio/AutomationStudioLive.tsx`).
- The persistence signature serializes the full hierarchy and workspace prefs: `model.ts:451` (`apps/web/src/features/automation-studio/hierarchy/model.ts`).
- Selection changes are copied into `workspacePrefs.viewStates`: `AutomationStudioLive.tsx:1193` (`apps/web/src/features/automation-studio/AutomationStudioLive.tsx`).
- The view-state equality check uses `JSON.stringify`: `AutomationStudioLive.tsx:1203` (`apps/web/src/features/automation-studio/AutomationStudioLive.tsx`).
- Tab/window selection captures and restores view state through `captureActiveViewState`, `setPaneTab`, and related layout helpers: `AutomationStudioLive.tsx:2142` (`apps/web/src/features/automation-studio/AutomationStudioLive.tsx`), `AutomationStudioLive.tsx:2310` (`apps/web/src/features/automation-studio/AutomationStudioLive.tsx`).

Why it causes lag:

Clicking a view should be a cheap local UI operation. Instead it can become:

1. update selection;
2. update workspace prefs;
3. normalize workspace prefs;
4. serialize current view state to compare it;
5. serialize full hierarchy/prefs for autosave signature;
6. schedule `save-project-hierarchy`;
7. rerender the monolithic Studio shell;
8. emit mutation invalidation after the save.

This matches the observed delay when selecting empty window views.

Required fix:

- Separate ephemeral UI state from durable workspace layout state.
- Do not persist ordinary active selection on every click.
- Persist layout changes explicitly or through an idle/debounced writer that only runs for real layout mutations.
- Replace full `automationHierarchySignature(...)` serialization with revision counters or small structural hashes maintained at mutation time.

Tests to add:

- A component-level test that clicking a pane tab does not call `save-project-hierarchy`.
- A unit test that selection changes do not mutate `workspacePrefs` unless an explicit view-state save action occurs.
- A Playwright test for empty project view switching that waits for post-paint idle and asserts no app request is fired.

### P0. Mutation invalidation does not update the state that renders the sidebar

Evidence:

- The visible hierarchy is generated from `projectFlows`: `AutomationStudioLive.tsx:683` (`apps/web/src/features/automation-studio/AutomationStudioLive.tsx`).
- `notifyProjectDataChanged` only invalidates cache and nudges project sync; it does not reload or mutate `projectFlows`: `AutomationStudioLive.tsx:1597` (`apps/web/src/features/automation-studio/AutomationStudioLive.tsx`).
- The summary reload that rebuilds `projectFlows` lives in `refreshProjectRuntimeState`: `AutomationStudioLive.tsx:1538` (`apps/web/src/features/automation-studio/AutomationStudioLive.tsx`).

Why it causes lag/stale UI:

Create/delete actions can succeed on the backend while the tree remains stale because the state array that produces tree nodes did not change. A browser refresh works because it forces a new project summary/hierarchy load.

Required fix:

- Mutation handlers must apply optimistic local state updates for the entities they change.
- For Flow create/update/delete, update `projectFlows` immediately from the mutation response.
- For recording delete, subflow delete, folder delete, and custom hierarchy changes, update the exact local state arrays that drive the tree before waiting for sync.
- After optimistic update, run a targeted background reconciliation request, not a full Studio refresh.

Tests to add:

- Create Flow mocked-API test: returned Flow appears in the tree without calling `refreshProjectRuntimeState` or browser reload.
- Delete Flow mocked-API test: deleted Flow disappears from `projectFlows`/tree immediately.
- Delete recording/folder tests: local tree state updates synchronously after successful mutation.

### P0. Flow/subflow service mutations bypass the project change feed

Evidence:

- Client sync listens for `program-api:mutation` and then fetches `list-project-change-feed`: `AutomationStudioLive.tsx:356` (`apps/web/src/features/automation-studio/AutomationStudioLive.tsx`).
- `createFlow`, `saveFlow`, and `deleteFlow` write repositories/files directly: `service.ts:1885` (`packages/fluxiq/src/programs/automation-studio/runtime/service.ts`), `service.ts:1910` (`packages/fluxiq/src/programs/automation-studio/runtime/service.ts`), `service.ts:1972` (`packages/fluxiq/src/programs/automation-studio/runtime/service.ts`).
- The newer typed mutation layer records flow/subflow/instruction changes, but those paths are separate: `project-flow-resource-mutations.ts:16` (`packages/fluxiq/src/programs/automation-studio/storage/project-flow-resource-mutations.ts`).

Why it causes lag/stale UI:

The frontend was taught to wait for scoped invalidations from the project change feed, but the legacy service paths used by real UI endpoints do not emit those feed events. That makes sync unreliable for exactly the create/delete/update operations users are doing.

Required fix:

- Route `create-flow`, `save-flow`, `delete-flow`, `create-flow-subflow`, `update-flow-subflow`, and `delete-flow-subflow` through the unit-of-work/project mutation layer, or emit equivalent feed rows from those service methods.
- Include entity kind, entity ID, operation, revision, and changed timestamp.
- Make `program-api` invalidation include explicit hierarchy scope for hierarchy mutations.

Tests to add:

- Service/API tests proving each Flow/subflow mutation produces `list-project-change-feed` events.
- Client sync test proving a feed event updates/invalidate only the affected local store.
- Cross-client Playwright test: create a Flow in one session and see it appear in the other without refresh.

### P0. Create Flow is not optimistic and does too much backend work

Evidence:

- The UI posts `create-flow`, optionally posts `save-flow` for a preset, calls `notifyProjectDataChanged`, selects the Flow, and opens the Flow view: `AutomationStudioLive.tsx:2770` (`apps/web/src/features/automation-studio/AutomationStudioLive.tsx`).
- It does not merge the returned Flow into `projectFlows` before opening the view.
- Backend `createFlow` calls `loadProjectFlows(project.id)` before creating the new Flow: `service.ts:1885` (`packages/fluxiq/src/programs/automation-studio/runtime/service.ts`).
- `loadProjectFlows` walks the project Flow index and loads every Flow document: `service.ts:6076` (`packages/fluxiq/src/programs/automation-studio/runtime/service.ts`).

Why it causes lag/stale UI:

Creating one empty Flow can hydrate every Flow in the project, then the frontend does not update the tree source state from the response. This is both slow and stale.

Required fix:

- Backend should check ID uniqueness without hydrating all project Flows.
- Frontend should merge `originResult.payload.flow ?? createdFlow` into `projectFlows` immediately.
- Cache the new Flow detail directly under the Flow cache key.
- Only reconcile summary in the background.

Tests to add:

- Backend test that `createFlow` does not call project-wide Flow hydration.
- Frontend test that create Flow updates `projectFlows` immediately.
- Playwright mutation-latency test with budget from submit click to visible tree row.

### P0. Delete Flow leaves generated hierarchy stale

Evidence:

- Delete calls `delete-flow` serially for each selected Flow: `AutomationStudioLive.tsx:2851` (`apps/web/src/features/automation-studio/AutomationStudioLive.tsx`).
- It then calls `notifyProjectDataChanged`, but does not remove deleted Flow entries from `projectFlows`: `AutomationStudioLive.tsx:2858` (`apps/web/src/features/automation-studio/AutomationStudioLive.tsx`).
- Generated Flow node IDs are excluded from hierarchy-only deleted IDs: `AutomationStudioLive.tsx:2889` (`apps/web/src/features/automation-studio/AutomationStudioLive.tsx`).

Why it causes stale UI:

Generated tree rows remain visible as long as the stale `projectFlows` entry remains in memory. A refresh fixes it because summary reload omits the deleted Flow.

Required fix:

- Optimistically filter deleted Flow IDs out of `projectFlows` after successful delete.
- Clear related Flow/subflow/cache/draft state.
- Backend should soft-delete or remove SQL metadata and emit change-feed delete events.

Tests to add:

- Delete Flow removes generated row immediately.
- Delete Flow clears selected Flow and closes Flow-owned tabs if necessary.
- Reloaded summary omits the deleted Flow.

## High Priority Root Causes

### P1. Request coordinator state causes unused whole-Studio rerenders

Evidence:

- `AutomationStudioLive` only consumes `runLatest`: `AutomationStudioLive.tsx:158` (`apps/web/src/features/automation-studio/AutomationStudioLive.tsx`).
- `useRequestCoordinator` stores request lifecycle state in React state and updates it on start/success/error: `useRequestCoordinator.ts:55` (`apps/web/src/features/automation-studio/controllers/useRequestCoordinator.ts`).

Why it causes lag:

Every coordinated request forces at least two top-level renders even though the UI does not display the coordinator state. Because the Studio shell is monolithic, those renders re-evaluate derived data and visible panes.

Required fix:

- Store request bookkeeping in refs, or expose request state through an external store with selective subscription.
- Return a silent request runner for background/cache/detail requests that do not affect visible loading UI.

Tests to add:

- Render-count test proving `runLatest` start/finish does not rerender `AutomationStudioLive` when request state is unused.

### P1. View rendering passes a global data bundle into every active pane

Evidence:

- `renderViewContent` passes recordings, timelines, pipeline artifacts, runtime sessions, graph data, selected entities, and many callbacks to each rendered pane: `AutomationStudioLive.tsx:2534` (`apps/web/src/features/automation-studio/AutomationStudioLive.tsx`).
- Multi-pane layout renders every active pane in the workspace: `AutomationStudioLive.tsx:2937` (`apps/web/src/features/automation-studio/AutomationStudioLive.tsx`).
- `AutomationViewRenderer` builds large inline inputs, especially for State View: `Renderer.tsx:92` (`apps/web/src/features/automation-studio/views/Renderer.tsx`).

Why it causes lag:

Selecting a view updates props for multiple panes, including unrelated heavy views. Even if the clicked view is empty, React still needs to reconcile all active pane children.

Required fix:

- Split view containers by data ownership. Each view should subscribe/select only the state it needs.
- Memoize view input objects and callbacks by primitive dependencies.
- Wrap heavy views behind `React.memo` or selector-driven stores.

Tests to add:

- Profiler test proving tab switches do not rerender unrelated Runtime/State/Graph views.
- Playwright test measuring empty view switch after two animation frames.

### P1. State View memoization is defeated by fresh objects every render

Evidence:

- `StateView` creates a fresh `viewState` object each render: `StateView.tsx:39` (`apps/web/src/features/automation-studio/views/StateView.tsx`).
- `buildNodeStateViewModel` memoizes on `[props.input, viewState]`: `StateView.tsx:46` (`apps/web/src/features/automation-studio/views/StateView.tsx`).
- The renderer creates `props.input` inline: `Renderer.tsx:92` (`apps/web/src/features/automation-studio/views/Renderer.tsx`).
- The state view model scans recordings/timelines/runtime state: `view-model.ts:193` (`apps/web/src/features/automation-studio/state/view-model.ts`).

Why it causes lag:

Any parent rerender rebuilds State View models even when the state view data did not change.

Required fix:

- Memoize `viewState` and State View `input` objects.
- Move state model building to a selector keyed by selection/source IDs and compact revisions.

Tests to add:

- Unit/profiler test that unrelated parent rerenders do not call `buildNodeStateViewModel` again.

### P1. Some view opens are request-gated instead of immediate

Evidence:

- Subflow open waits for `get-flow-subflow` and `loadFlowDetails` before selection/open completes: `AutomationStudioLive.tsx:1620` (`apps/web/src/features/automation-studio/AutomationStudioLive.tsx`).
- Runtime workspace mount starts multiple readiness requests before/while rendering: `WorkspaceViews.tsx:62` (`apps/web/src/features/automation-studio/views/WorkspaceViews.tsx`).
- Runtime history separately loads run pages: `WorkspaceViews.tsx:2873` (`apps/web/src/features/automation-studio/views/WorkspaceViews.tsx`).

Why it causes lag:

The user waits for network and full-shell render transitions before seeing an empty/loading view. Empty views should appear immediately.

Required fix:

- Switch the active view immediately.
- Show local loading/empty states inside the view.
- Coalesce Runtime readiness and history requests.
- Skip readiness requests when no runnable Flow exists.

Tests to add:

- Empty project tests for Runtime/Subflows/State: click-to-empty-state must be under the interaction budget.

## Graph Editor Root Causes

### P1. Selection-only node changes run the durable graph pipeline

Evidence:

- ReactFlow `onNodesChange`, `onNodeClick`, and `onSelectionChange` all run on normal node clicks/selections: `GraphEditorViews.tsx:1151` (`apps/web/src/features/automation-studio/views/GraphEditorViews.tsx`), `GraphEditorViews.tsx:1204` (`apps/web/src/features/automation-studio/views/GraphEditorViews.tsx`), `GraphEditorViews.tsx:1212` (`apps/web/src/features/automation-studio/views/GraphEditorViews.tsx`).
- `onNodesChange` sends changes through `useAutomationGraphController.setNodes`: `GraphEditorViews.tsx:1151` (`apps/web/src/features/automation-studio/views/GraphEditorViews.tsx`).
- The controller reconciles viewport state and queues history work: `useAutomationGraphController.ts:64` (`apps/web/src/features/automation-studio/graph/useAutomationGraphController.ts`).
- The viewport store signatures entities with `JSON.stringify`: `viewport-store.ts:350` (`apps/web/src/features/automation-studio/graph/viewport-store.ts`).

Required fix:

- Keep selection, dragging, dimensions, and measurement-only updates out of persisted node arrays.
- Only route actual graph structure/data changes into history/draft/persistence.

Tests to add:

- Selection-only `NodeChange` does not publish draft, flush history, or run viewport reconciliation.

### P1. Dragging commits history on first pointer movement

Evidence:

- Drag start calls `checkpointPolicyGraph`: `GraphEditorViews.tsx:1189` (`apps/web/src/features/automation-studio/views/GraphEditorViews.tsx`).
- The first position update queues a full diff microtask: `useAutomationGraphController.ts:49` (`apps/web/src/features/automation-studio/graph/useAutomationGraphController.ts`).
- Operation history diffs/signatures rely on JSON serialization: `operation-history.ts:159` (`apps/web/src/features/automation-studio/graph/operation-history.ts`).

Required fix:

- Treat drag as a transaction: capture before state on drag start, update visual state during drag, commit one history/draft operation on drag stop.

Tests to add:

- Five drag move updates produce one history batch and one draft write after drag stop.

### P1. Draft publishing uses microtasks and repeated IndexedDB setup

Evidence:

- Graph draft publish uses `queueMicrotask`: `GraphEditorViews.tsx:680` (`apps/web/src/features/automation-studio/views/GraphEditorViews.tsx`).
- Parent draft handling computes operation drafts and persists them from the graph draft path: `AutomationStudioLive.tsx:2051` (`apps/web/src/features/automation-studio/AutomationStudioLive.tsx`).
- `saveAutomationGraphOperationDraft` defaults to a new IndexedDB wrapper path per call: `draft-store.ts:89` (`apps/web/src/features/automation-studio/graph/draft-store.ts`).

Why it causes lag:

Microtasks run before paint, so the supposed defer still blocks the interaction. Repeated IndexedDB wrapper setup adds contention.

Required fix:

- Defer draft persistence through idle/debounced scheduling.
- Maintain one stable draft database instance.
- Persist operation deltas from committed editor transactions instead of rediffing the graph repeatedly.

Tests to add:

- Rapid graph edits coalesce to one draft save after idle/debounce.
- Multiple draft writes reuse one database/open path.

## Backend/Storage Root Causes

### P1. Subflow creation is a multi-step client transaction

Evidence:

- UI `createFlowSubflowFromHierarchy` calls `create-flow-subflow`, then `attachSubflowToFlowExpansion`, then `loadFlowDetails`: `AutomationStudioLive.tsx:2609` (`apps/web/src/features/automation-studio/AutomationStudioLive.tsx`).
- Backend `createFlowSubflow` may create a graph Flow via `saveFlow`: `service.ts:3616` (`packages/fluxiq/src/programs/automation-studio/runtime/service.ts`).
- Parent expansion attachment is a second `save-flow` request from the client: `AutomationStudioLive.tsx:2647` (`apps/web/src/features/automation-studio/AutomationStudioLive.tsx`).

Why it causes lag/partial failure:

One user action becomes multiple backend writes plus a detail reload. If the second save fails, the subflow may exist but not appear in the hierarchy.

Required fix:

- Make `create-flow-subflow` atomically create the graph Flow, subflow record, parent expansion entry, and category placement.
- Return enough summary data for optimistic UI insertion.

Tests to add:

- Failure injection where parent expansion write fails must not leave an invisible orphan subflow.
- Create subflow visible immediately without full flow detail reload.

### P1. Subflow hierarchy has two sources of truth

Evidence:

- Hierarchy derives subflow rows from parent Flow expansion metadata: `model.ts:143` (`apps/web/src/features/automation-studio/hierarchy/model.ts`).
- Service methods update/delete subflow records separately: `service.ts:3654` (`packages/fluxiq/src/programs/automation-studio/runtime/service.ts`), `service.ts:3728` (`packages/fluxiq/src/programs/automation-studio/runtime/service.ts`).
- Workspace subflow actions mostly refresh subflow lists and dispatch `fluxiq:subflows-changed`: `WorkspaceViews.tsx:500` (`apps/web/src/features/automation-studio/views/WorkspaceViews.tsx`), `WorkspaceViews.tsx:1740` (`apps/web/src/features/automation-studio/views/WorkspaceViews.tsx`).

Why it causes stale UI:

Updating a subflow record may not update the parent Flow expansion that the left sidebar uses. The subflow view and sidebar can disagree.

Required fix:

- Choose one canonical hierarchy source.
- Preferred: derive sidebar membership from subflow records and indexed hierarchy entries, not duplicated parent expansion arrays.
- Until then, update parent expansion on every subflow rename/duplicate/archive/delete.

Tests to add:

- Rename, duplicate, archive, and delete update both subflow directory and sidebar after immediate UI update and reload.

### P2. Hierarchy persistence bypasses typed hierarchy mutation/feed layer

Evidence:

- `saveProjectHierarchy` writes JSON/project records directly: `service.ts:4543` (`packages/fluxiq/src/programs/automation-studio/runtime/service.ts`).
- Typed hierarchy mutation/feed tools exist separately: `project-hierarchy-mutations.ts:18` (`packages/fluxiq/src/programs/automation-studio/storage/project-hierarchy-mutations.ts`), `project-hierarchy-feed.ts:45` (`packages/fluxiq/src/programs/automation-studio/storage/project-hierarchy-feed.ts`).
- `programApiMutationInvalidation` has no explicit hierarchy cache scope and falls back to summary invalidation for unrecognized mutations: `program-api.ts:81` (`apps/web/src/features/programs/program-api.ts`).

Required fix:

- Wire hierarchy saves into typed hierarchy repository/feed, or add explicit hierarchy invalidation and client refetch.
- Avoid using the hierarchy autosave endpoint for ordinary selection/view-click persistence.

Tests to add:

- Custom folder create/move/delete syncs across clients without refresh.

## UX-Specific Findings

### P2. Single-click tree open has an artificial 220 ms delay

Evidence:

- Project tree delays preview opens by `window.setTimeout(..., 220)`: `ProjectTree.tsx:147` (`apps/web/src/features/automation-studio/hierarchy/ProjectTree.tsx`).

Why it hurts:

Every sidebar click feels slower before any real work begins. If the click also triggers view persistence, request state, and render fanout, this delay compounds the bad feel.

Required fix:

- Open immediately on click.
- Use a separate affordance for new-window/alternate open instead of delaying every click to detect double-click.

Tests to add:

- Sidebar click fires `openView` synchronously in a component test.

### P2. Event listener effect churns after every render

Evidence:

- `automation-studio:open-node-state` listener effect has no dependency array: `AutomationStudioLive.tsx:1020` (`apps/web/src/features/automation-studio/AutomationStudioLive.tsx`).

Why it hurts:

Every top-level render removes and re-adds the listener. This is small compared to the P0 issues, but it is a symptom of the broader monolithic render problem.

Required fix:

- Add stable dependencies or move handler through a ref.

Tests to add:

- Source or hook test guarding listener registration against every render.

## Test and Instrumentation Gaps

### P0. Current performance tests do not measure responsiveness after paint

Evidence:

- `measureInteraction` only measures the awaited operation duration: `performance.ts:82` (`apps/web/e2e/support/performance.ts`).
- Project/flow/runtime tests wait for visible text, not idle UI: `performance-baseline.spec.ts:19` (`apps/web/e2e/performance-baseline.spec.ts`).

Required fix:

- Add a `waitForStudioSettled` helper that waits for no active app requests, two animation frames, no new long tasks, and stable DOM counts.
- Measure click-to-settled, not click-to-label-visible.

### P0. Mutation UX is not covered by performance tests

Missing coverage:

- Create Flow.
- Delete Flow.
- Create/delete subflow category folder.
- Create/delete subflow.
- Delete recording.
- Empty view switching.
- Idle network after project open.

Required fix:

- Add Playwright tests for each operation with strict visible-update budgets and network assertions.

### P1. Existing scale fixture is not large enough

Evidence:

- Current browser fixture is around 180 graph nodes, 180 hierarchy folders, 144 runs, and 600 timeline entries.
- The scalable architecture plan calls for 1k/10k/100k graph baselines.

Required fix:

- Generate and run real browser fixtures at 1k and 10k first; keep 100k as certification with explicit operator evidence.

### P1. Source-string tests are giving false confidence

Examples:

- Request-policy tests validate request builders and source strings, not actual browser behavior.
- Runtime Debug tests check `RuntimeRunHistory.toString()`, not idle network.
- Graph tests time pure validation and source strings, not ReactFlow mount/drag/pan responsiveness.

Required fix:

- Keep source guards as cheap tripwires, but add integration/e2e tests that exercise the real browser paths.

## Recommended Remediation Order

1. Stop persisting selection/view activation through `workspacePrefs`; make tab/view clicks immediate and non-mutating.
2. Make create/delete Flow optimistic by updating `projectFlows` directly from mutation responses.
3. Remove project-wide Flow hydration from `createFlow`; check ID uniqueness directly.
4. Wire Flow/subflow/hierarchy mutations into the project change feed or emit equivalent feed rows.
5. Refactor request coordinator state out of top-level React renders.
6. Split view rendering into state-specific containers/memo boundaries.
7. Move graph selection/drag metadata out of durable graph state and make drag history transactional.
8. Move graph draft persistence to idle/debounced scheduling with one shared IndexedDB instance.
9. Make subflow create/update/delete atomic and choose one canonical sidebar source.
10. Replace performance tests with click-to-settled, idle-network, mutation-latency, and real-scale browser tests.

## Validation Performed During This Audit

- Subagents performed read-only audits across render/state orchestration, mutation/API invalidation, graph/draft paths, and performance test coverage.
- Local source scans confirmed the listed code paths and the existing performance-test blind spots.
- `pnpm docs:check` passes as of 2026-08-27 after converting source references to validator-compatible path text.
- No live browser benchmark was run in this audit. The repository instruction says not to run the web panel for the user, and the current e2e suite requires a running web app/fixture environment. The next remediation phase should add/run the missing browser tests in an operator-approved environment.

## Current Conclusion

The remaining lag is caused by architectural coupling between UI selection, persistence, sync, and global render state. The fastest path to a usable Studio is not another styling pass or isolated memoization. The shell needs a proper interaction contract:

- view clicks are local and instant;
- mutations update local state optimistically;
- sync reconciles in the background;
- durable persistence happens only for durable changes;
- graph interactions separate ephemeral selection/drag from saved graph data;
- performance tests measure actual settled responsiveness.
