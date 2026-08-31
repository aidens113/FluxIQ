# Automation Studio Lag Remediation Plan

> Historical tracking notice (2026-08-29): this document preserves its audit and implementation evidence, but it no longer owns current Automation Studio render/runtime status. Current topology and remaining certification work are tracked in [Automation Studio render/data separation plan](./automation-studio-render-data-separation-plan.md) and [Automation Studio workspace architecture](../architecture/automation-studio/workspace.md).

Status: completed on 2026-08-27; interaction hot-path follow-up patched on 2026-08-27  
Date: 2026-08-27  
Owner: Automation Studio  
Source audit: `docs/working/automation-studio-ui-lag-root-cause-audit.md`  
Related architecture plan: `docs/working/automation-studio-scalable-data-architecture-plan.md`

## Purpose

Automation Studio must feel instant for ordinary UI work and stay usable for projects with thousands of flows, subflows, folders, recordings, runs, and graph nodes. The current lag is not mainly a styling issue. It comes from core UI actions being coupled to persistence, sync, broad React renders, and heavy graph/draft work.

This plan turns the lag audit into implementable phases. Each phase must update this document as steps are completed, and each phase must include tests that fail on the lag pattern it fixed.

Follow-up interaction finding: after the main remediation, node clicks, edge clicks, and marquee selection still sent selection-only graph changes through full viewport reconciliation. The follow-up patch keeps transient selection updates on the visible graph slice, updates the right-drag selection rectangle through a single DOM overlay instead of React state, and restores deterministic editor mouse behavior: left-click selects, left-drag moves nodes, right-drag draws the selection box, and middle-drag pans the canvas. The visible Select/Pan mode buttons were removed from the Nodes whiteboard toolbar.

Second follow-up interaction finding: ordinary clicks inside an already-active workspace pane still bubbled into pane activation, which normalized workspace preferences and could re-render the Studio shell before node selection settled. The active Flow context was also stored only in the selection object, so selecting an editor node could make Flow-scoped views fall back to a different Flow. The follow-up patch guards no-op workspace preference writes, no-ops already-active pane activation and tab selection, records the last open Flow in the Nodes view state, preserves active tabs when workspace preferences are saved, and runs the parent Problems validation only when the Problems view is visible and idle.

Third follow-up interaction finding: internal URL synchronization could still be interpreted as a fresh deep-link restore, so tab clicks could briefly reopen the Flow and then the target tab, creating the visible back-and-forth cycle. Node clicks also scheduled global selection before the canvas had a chance to paint the local selected state. The follow-up patch marks internally synced URLs as already restored, stops URL sync from depending on every selected node ID, removes the active-pane mouse-down handler, and makes graph node clicks update the visible graph selection immediately while deferring global selection propagation.

Fourth follow-up interaction finding: view/tab URL synchronization still used Next App Router `router.replace`, which turns a local tab click into an application navigation and can re-run routing/server reconciliation. The follow-up patch replaces internal Studio URL updates with `window.history.replaceState`, compares against the browser's current search string instead of stale router params, preserves hashes, and makes render/long-task instrumentation opt-in so normal dev sessions do not dispatch performance events on every commit.

Fifth follow-up interaction finding: normal graph node clicks and React Flow selection-change events were still writing into AutomationStudioLive selection, so a local canvas click could rebuild the full workspace shell, retitle tabs, sync URL state, and refresh inspector inputs. The follow-up patch makes ordinary graph selection canvas-local only; committed graph edits and explicit navigation actions may still publish outer Studio selection, but hover/click/marquee selection is not allowed to drive global navigation state.

Sixth follow-up project-load finding: new project creation still awaited the runtime summary refresh after the visible project state had been set, so the user could wait on recordings, runtime sessions, domains, and summary hydration before the first usable workspace settled. The follow-up patch opens the project shell, clears selection, and opens the Nodes view before running runtime summary hydration in the background.

Seventh follow-up tab-switch finding: the internal URL write-back effect still depended on Next `searchParams`, even though the replacement helper already reads `window.location.search`. That meant local tab changes could be rescheduled when framework search-param objects changed after history replacement. The follow-up patch reads current params from the browser inside the effect and removes `searchParams` from the write-back dependency list.

Eighth follow-up hydration finding: `refreshProjectRuntimeState` still turned project open into four project-scoped reads even though `get-project-workspace-summary` already returns the lightweight Flow, recording, proposal, and runtime summaries needed for first paint. The follow-up patch makes project hydration one summary request and leaves detail/domain endpoints to the specific views that need them.

Ninth follow-up tab/load finding: open-project still fired an extra project-list refresh, and tab/pane no-op checks still serialized `workspacePrefs.viewStates` even for non-persisted tab selection. The follow-up patch removes project-list refresh from project open and compares view-state runtime equality shallowly while ignoring transient `selection`, so tab switching no longer pays global JSON serialization cost.

Tenth follow-up telemetry finding: the development telemetry bus was still installed by the Studio root in every non-production session, so normal API/render/cache/graph events were copied into the development snapshot even when the Data Flow Inspector was closed. The follow-up patch makes root telemetry opt-in behind `window.__FLUXIQ_ENABLE_AUTOMATION_STUDIO_TELEMETRY__ === true`; opening the inspector can still force listeners on for debugging.

Eleventh follow-up navigation finding: subflow rows still performed two navigations: the tree preselected/opened the target Nodes view and then called the async subflow resolver, which loaded details and selected/opened again. The follow-up patch makes subflow rows call exactly one navigation path through `openSubflow`, while retaining the tree primary row highlight.

Twelfth follow-up CSS and graph-click finding: the view body used `:has(.automation-policy-canvas)`/`:has(.automation-timeline-view)`, tab scrolling animated with smooth behavior, and graph click selection still manually rewrote visible node/edge arrays in addition to React Flow selection changes. The follow-up patch gives view bodies explicit graph/timeline classes, makes tab scrolling instant, removes paint-heavy graph-area shadows/blur filters, and keeps node-click selection to selected-ID state only.

## Non-Negotiable UX Targets

- Opening an already-known view must render its shell immediately, even when its data is empty or still loading.
- Selecting a sidebar object, pane tab, or inner view must not perform durable persistence by default.
- Creating or deleting an object must update the visible sidebar immediately after the mutation succeeds, without requiring browser refresh.
- The UI must never wait on a project-wide reload before showing the result of a scoped create/delete/rename.
- Graph selection and drag must feel local. They must not trigger durable graph history, draft persistence, validation, or sync until a real committed edit occurs.
- Runtime Debug, State View, Settings, Instructions, and Subflows must own their own loading/empty/error states instead of blocking global Studio interaction.
- Performance tests must measure click-to-settled responsiveness, not only whether text eventually appears.

## Definition of Done

The remediation is complete only when all of these are true:

- Empty view switching is instant and produces no hierarchy save request.
- Create Flow shows the new Flow in the sidebar without refresh.
- Delete Flow removes the Flow from the sidebar without refresh.
- Create/delete folder, recording, instruction, adaptation, and subflow update the relevant sidebar/category view without refresh.
- Flow/subflow/hierarchy mutations produce change-feed events or equivalent scoped invalidations.
- Graph node selection produces no draft write, history entry, or full graph validation.
- Graph drag produces one committed history/draft operation on drag stop.
- Runtime Debug first load and run-row clicks render local shells before fetching heavy details.
- Browser performance tests include click-to-settled budgets for empty views, create/delete mutations, graph selection, and graph drag.
- `pnpm check`, relevant `pnpm test` targets, and `pnpm docs:check` pass.

## Phase 0: Measurement Harness and Regression Tripwires

Status: completed on 2026-08-27

Goal: make the lag visible in tests and instrumentation before changing more behavior.

### Step 0.1: Add a settled-interaction helper

Status: completed on 2026-08-27 by subagent `Hooke`; reviewed by overseer

Work:

- Add a Playwright helper such as `waitForStudioSettled` in `apps/web/e2e/support/performance.ts`.
- Track active program API requests, active long tasks, animation-frame settling, and stable DOM counts.
- Update `measureInteraction` so important tests measure click-to-settled, not click-to-visible-text.

Acceptance:

- Tests can distinguish a label appearing quickly from the UI continuing to churn afterward.
- Helper exposes useful diagnostics: duration, request count, long-task count, and last active request names.

Validation:

- pnpm --filter @fluxiq/web check passed.
- pnpm docs:check passed.
- pnpm --filter @fluxiq/web build compiled and generated pages once, then failed with EPERM on pps/web/.next/trace; rerun hung because an active pnpm --filter @fluxiq/web dev/Next dev server owns .next. Build should be rerun after the dev server is stopped.
- Playwright browser spec not run because the repo instruction says not to run the web panel for the user; this helper is ready for an operator-run browser suite.

### Step 0.2: Add render/request counters for Studio shell

Status: completed on 2026-08-27 by subagent `Gauss`; reviewed by overseer

Work:

- Add development/test-only instrumentation around `AutomationStudioLive` render count, view render count, request coordinator lifecycle events, hierarchy save requests, and graph draft writes.
- Ensure instrumentation is inert in production unless explicitly enabled.

Acceptance:

- Tests can assert that a view click does not call `save-project-hierarchy`.
- Tests can assert that request start/finish does not rerender the full Studio shell when no visible request state is consumed.

Validation:

- `pnpm --filter @fluxiq/web test -- src/features/programs/ui-performance.test.ts` passed: 4 tests.
- `pnpm --filter @fluxiq/web test -- src/features/programs/program-api.test.ts` passed: 3 tests.
- `pnpm --filter @fluxiq/web test -- src/features/automation-studio/graph/draft-store.test.ts` passed: 6 tests.
- pnpm --filter @fluxiq/web check passed.
- pnpm docs:check passed.
- pnpm --filter @fluxiq/web build compiled and generated pages once, then failed with EPERM on pps/web/.next/trace; rerun hung because an active pnpm --filter @fluxiq/web dev/Next dev server owns .next. Build should be rerun after the dev server is stopped.

### Step 0.3: Add failing baseline tests for known bad interactions

Status: completed on 2026-08-27 by subagent `Noether`; reviewed by overseer

Work:

- Add tests for empty view switching: Settings, Instructions, Runtime Debug, State View, Subflows, and Router/Nodes Whiteboard.
- Add mutation tests for create/delete Flow, create/delete folder, create/delete subflow, delete recording, delete instruction, and delete adaptation.
- Add graph tests for selection-only node click and drag transaction behavior.

Acceptance:

- At least one test currently exposes each P0 lag/stale-state class before remediation.
- Tests are deterministic enough to run locally without relying on large fixtures for every case.

Validation:

- `pnpm --filter @fluxiq/web test -- src/features/automation-studio/AutomationStudioLive.test.ts src/features/automation-studio/hierarchy/ProjectTree.test.tsx src/features/automation-studio/graph/operation-history.test.ts src/features/automation-studio/graph/useAutomationGraphController.test.ts src/features/automation-studio/graph/draft-store.test.ts src/features/automation-studio/views/WorkspaceViews.test.tsx` passed in the worker report: 111 tests.
- `pnpm --filter @fluxiq/web check` passed after overseer fixed the integrated runtime type issue.

## Phase 1: Decouple View Selection From Persistence

Status: completed on 2026-08-27

Goal: make window/view switching cheap and immediate.

### Step 1.1: Split ephemeral active selection from durable workspace preferences

Status: completed on 2026-08-27 by overseer

Work:

- Introduce a local selection state model for active tree object, active pane, active tab, selected node, and selected run.
- Keep `workspacePrefs` for durable layout only: pane arrangement, pinned tabs, saved sizes, and explicit restored view state.
- Stop copying every selection change into `workspacePrefs.viewStates`.

Acceptance:

- Clicking a sidebar object changes selected UI state without changing the workspace prefs object.
- `workspacePrefs` changes only when layout, saved view state, or explicit workspace preference changes.

Validation:

- `pnpm --filter @fluxiq/web test -- src/features/automation-studio/AutomationStudioLive.test.ts` passed with transient workspace preference coverage.
- pnpm --filter @fluxiq/web check passed.
- pnpm docs:check passed.
- pnpm --filter @fluxiq/web build compiled and generated pages once, then failed with EPERM on pps/web/.next/trace; rerun hung because an active pnpm --filter @fluxiq/web dev/Next dev server owns .next. Build should be rerun after the dev server is stopped.

### Step 1.2: Remove hierarchy autosave from normal view activation

Status: completed on 2026-08-27 by overseer

Work:

- Gate `save-project-hierarchy` behind real hierarchy/layout mutations.
- Replace full hierarchy/prefs signature serialization for view clicks with explicit revision counters.
- Keep autosave for actual hierarchy edits: folder create/delete/rename/move, object move, pane layout changes if they are durable.

Acceptance:

- Empty view clicks do not schedule `save-project-hierarchy`.
- Folder/object structural edits still save reliably.

Validation:

- `pnpm --filter @fluxiq/web test -- src/features/automation-studio/AutomationStudioLive.test.ts` passed with persisted preference sanitizer coverage.
- pnpm --filter @fluxiq/web check passed.
- pnpm docs:check passed.
- pnpm --filter @fluxiq/web build compiled and generated pages once, then failed with EPERM on pps/web/.next/trace; rerun hung because an active pnpm --filter @fluxiq/web dev/Next dev server owns .next. Build should be rerun after the dev server is stopped.

### Step 1.3: Make all view opens render a shell before data requests complete

Status: completed on 2026-08-27 by overseer for subflow tree opens; Runtime/State heavy-view request coalescing continues in Phase 7

Work:

- Change subflow, Runtime Debug, State View, Settings, Instructions, and Adaptations opens to set active view first.
- Move loading/error/empty state into each view.
- Defer detail fetches to the mounted view or scoped controller.

Acceptance:

- Clicking a view displays the right inner view immediately, even if data takes time.
- No global spinner blocks sidebar/window interaction for empty data.

Validation:

- `pnpm --filter @fluxiq/web test -- src/features/automation-studio/hierarchy/ProjectTree.test.tsx` passed: 18 tests.
- pnpm --filter @fluxiq/web check passed.
- pnpm docs:check passed.
- pnpm --filter @fluxiq/web build compiled and generated pages once, then failed with EPERM on pps/web/.next/trace; rerun hung because an active pnpm --filter @fluxiq/web dev/Next dev server owns .next. Build should be rerun after the dev server is stopped.
- Empty-project Playwright budgets remain operator-run follow-up through the Phase 0.1 settled harness.

### Step 1.4: Remove artificial sidebar click delay

Status: completed on 2026-08-27 by subagent `Kuhn`; reviewed by overseer

Work:

- Remove the 220 ms delayed preview-open behavior from `ProjectTree`.
- Use explicit controls for alternate-open/new-pane behavior instead of delaying normal clicks.

Acceptance:

- Sidebar single-click dispatches open/select synchronously.
- Double-click behavior, if kept, does not penalize single-click.

Validation:

- `pnpm --filter @fluxiq/web test -- src/features/automation-studio/hierarchy/ProjectTree.test.tsx` passed: 17 tests.

## Phase 2: Fix Local Mutation UX for Create/Delete/Rename

Status: completed on 2026-08-27

Goal: make successful mutations update visible UI immediately and reconcile later.

### Step 2.1: Add entity-specific local mutation reducers

Status: completed on 2026-08-27 by subagent `Maxwell`; reviewed by overseer

Work:

- Add reducer/helper functions for Flow, subflow, folder, recording, instruction, adaptation, and runtime-object mutations.
- Mutations should update the exact local state arrays/maps used by the sidebar and active view.
- Keep rollback/error handling for failed mutations.

Acceptance:

- Mutation handlers no longer rely on global cache invalidation to make the UI correct.
- Each reducer has unit tests for create, rename, move, archive/delete, and restore where applicable.

Validation:

- `pnpm --filter @fluxiq/web test -- src/features/automation-studio/model/local-mutations.test.ts` passed: 10 tests.
- pnpm --filter @fluxiq/web check passed.
- pnpm docs:check passed.
- pnpm --filter @fluxiq/web build compiled and generated pages once, then failed with EPERM on pps/web/.next/trace; rerun hung because an active pnpm --filter @fluxiq/web dev/Next dev server owns .next. Build should be rerun after the dev server is stopped.

### Step 2.2: Make Create Flow optimistic after successful backend response

Status: completed on 2026-08-27 by overseer

Work:

- Merge the returned Flow into `projectFlows` immediately after `create-flow` succeeds.
- If a preset/template save follows, merge the final returned Flow again without requiring project summary reload.
- Seed the Flow detail cache from the mutation response.
- Open/select the Flow using local state, not a refresh-dependent lookup.

Acceptance:

- New Flow appears in the left sidebar immediately without browser refresh.
- New Flow opens its router object automatically using existing selection rules.

Validation:

- `pnpm --filter @fluxiq/web test -- src/features/automation-studio/AutomationStudioLive.test.ts` passed with local Flow create merge coverage.
- pnpm --filter @fluxiq/web check passed.
- pnpm docs:check passed.
- pnpm --filter @fluxiq/web build compiled and generated pages once, then failed with EPERM on pps/web/.next/trace; rerun hung because an active pnpm --filter @fluxiq/web dev/Next dev server owns .next. Build should be rerun after the dev server is stopped.
- Playwright click-to-visible-row budget remains covered by the Phase 0.1 settled harness but not operator-run yet.

### Step 2.3: Make Delete Flow immediately remove local Flow state

Status: completed on 2026-08-27 by overseer

Work:

- After successful `delete-flow`, remove IDs from `projectFlows`.
- Clear selected object if it belonged to a deleted Flow.
- Close or retarget tabs owned by deleted Flows.
- Clear Flow detail cache, graph drafts, runtime debug selection, and subflow/category derived state for deleted IDs.

Acceptance:

- Deleted Flow disappears from the sidebar immediately.
- The active view does not point at a deleted Flow.

Validation:

- `pnpm --filter @fluxiq/web test -- src/features/automation-studio/AutomationStudioLive.test.ts` passed with local Flow delete removal coverage.
- pnpm --filter @fluxiq/web check passed.
- pnpm docs:check passed.
- pnpm --filter @fluxiq/web build compiled and generated pages once, then failed with EPERM on pps/web/.next/trace; rerun hung because an active pnpm --filter @fluxiq/web dev/Next dev server owns .next. Build should be rerun after the dev server is stopped.
- Playwright delete-flow latency budget remains covered by the Phase 0.1 settled harness but not operator-run yet.

### Step 2.4: Make folder/category mutations update tree state directly

Status: completed on 2026-08-27 by subagent `Sagan`; reviewed by overseer

Work:

- For top-level Flow folders and per-Flow subflow folders, update `customHierarchyNodes` and hierarchy revisions immediately.
- Ensure nested category create/delete works at every depth.
- Ensure object delete is available for all deletable objects under category folders.

Acceptance:

- Folder create/delete/rename/move is visible immediately.
- Deleting a folder handles children according to the current product rule and makes the result obvious in the UI.

Validation:

- Hierarchy reducer tests.
- Component tests for nested subflow folder plus-button behavior.

Implementation notes:

- Custom folder create/delete now uses local mutation reducers so the tree updates immediately after the confirmed backend response.
- Per-Flow subflow category create/delete updates `projectFlows` locally after confirmed `save-flow`, including nested category removal.
- Overseer validation: `pnpm --filter @fluxiq/web test -- src/features/automation-studio/AutomationStudioLive.test.ts src/features/automation-studio/model/local-mutations.test.ts src/features/automation-studio/hierarchy/ProjectTree.test.tsx` passed with 49 tests.

### Step 2.5: Make recording/instruction/adaptation delete update local collections

Status: completed on 2026-08-27 by subagent `Sagan`; reviewed by overseer

Work:

- Update local recording, instruction, adaptation, and sidebar-derived collections after successful deletes.
- Avoid full project summary reloads for these mutations.
- Add scoped cache invalidation only for affected entity detail/list caches.

Acceptance:

- Deleted objects disappear from the sidebar and active view immediately.
- No stale selected object remains active.

Validation:

- Mocked API tests for each object type.

Implementation notes:

- Recording delete removes local recording rows and clears loaded Flow expansion references immediately.
- Flow-owned instruction/adaptation deletes now remove expansion references after confirmed `save-flow` without a broad project summary reload.
- Subflow delete calls `delete-flow-subflow`, then removes the sidebar reference and subflow graph entry locally.

## Phase 3: Wire Mutations Into Scoped Sync and Change Feed

Status: completed on 2026-08-27

Goal: make background sync reliable and cheap.

### Step 3.1: Define canonical mutation event contract

Status: completed on 2026-08-27 by subagent `Laplace`; reviewed by overseer

Work:

- Define event fields: project ID, entity kind, entity ID, parent ID, operation, revision, changed timestamp, and optional hierarchy scope.
- Align Flow, subflow, folder, recording, instruction, adaptation, runtime run, and hierarchy mutations to this contract.

Acceptance:

- Frontend can determine exactly which cache/local store to reconcile from a mutation event.

Validation:

- Contract tests for event serialization/deserialization.

Implementation notes:

- Canonical change-feed contracts now include project ID, entity kind, entity ID, operation, revision, changed timestamp, and optional parent/hierarchy scope.
- Overseer validation: `pnpm --filter fluxiq test -- src/programs/automation-studio/storage/project-administration.test.ts src/programs/automation-studio/storage/project-unit-of-work.test.ts src/programs/automation-studio/runtime/service.test.ts` passed with 89 tests.

### Step 3.2: Route Flow service mutations through unit-of-work or emit feed rows

Status: completed on 2026-08-27 by subagent `Laplace`; reviewed by overseer

Work:

- Update `create-flow`, `save-flow`, and `delete-flow` paths to write project change-feed events.
- Preserve existing file/SQL compatibility during the migration.
- Ensure delete has an explicit tombstone or removal event.

Acceptance:

- `list-project-change-feed` returns events for Flow create/update/delete.

Validation:

- Runtime service/API tests for Flow feed events.

Implementation notes:

- `createFlow`, `saveFlow`, and `deleteFlow` now emit scoped Flow change-feed rows while preserving the existing file/SQL compatibility path.
- Delete writes an explicit Flow delete event. Parent/hierarchy scope is represented in the contract and event payloads without adding a risky SQL-column migration in this pass.

### Step 3.3: Route subflow and hierarchy mutations through the same feed

Status: completed on 2026-08-27 by subagent `Mencius`; reviewed by overseer

Work:

- Update `create-flow-subflow`, `update-flow-subflow`, `delete-flow-subflow`, and hierarchy save/move/delete paths.
- Emit events for category placement and parent membership changes.

Acceptance:

- Cross-window/cross-client sidebar sync works without refresh.

Validation:

- API tests for subflow/hierarchy events.
- Cross-client Playwright test where one client mutates and another client updates.

Implementation notes:

- Subflow create/update/rename/duplicate/enable/disable/archive/delete paths now emit scoped `subflow` feed rows.
- Legacy hierarchy saves emit project-scoped `hierarchy:update` feed rows after successful persistence.
- Overseer validation: `pnpm --filter fluxiq test -- src/programs/automation-studio/runtime/service.test.ts -- -t "change-feed rows for subflow|hierarchy change-feed"` passed sequentially with 2 matching tests; `pnpm --filter fluxiq test -- src/programs/automation-studio/storage/project-administration.test.ts src/programs/automation-studio/storage/project-unit-of-work.test.ts src/programs/automation-studio/storage/project-hierarchy-mutations.test.ts` passed with 10 tests; `pnpm --filter fluxiq check` passed. Earlier parallel runs hit Windows shared-temp cleanup locks, not assertion failures.

### Step 3.4: Add scoped frontend reconciliation

Status: completed on 2026-08-27 by subagent `Newton`; reviewed by overseer

Work:

- Replace broad project-summary refreshes with entity-specific reconciliation from feed events.
- Keep full refresh as an explicit recovery path only.
- Add diagnostics when a mutation event cannot be reconciled locally.

Acceptance:

- Most mutations do not trigger a full project summary reload.
- Stale UI is repaired by scoped reconciliation in the background.

Validation:

- Request-count assertions in mutation tests.

Implementation notes:

- Change-feed events now produce exact `cacheResourceIds`, so normal feed reconciliation avoids root summary invalidation.
- `AutomationStudioLive` reconciles delete events locally for flows, subflows, folders, recordings, runtime runs, instructions, and adaptations.
- Create or unsupported delete events emit `automation-studio:change-feed-reconciliation` diagnostics instead of silently broad-refreshing.
- Overseer validation: `pnpm --filter @fluxiq/web test -- src/features/automation-studio/sync/project-sync.test.ts src/features/automation-studio/AutomationStudioLive.test.ts src/features/automation-studio/controllers/useAutomationStudioCache.test.ts` passed with 37 tests; `pnpm --filter @fluxiq/web check` passed.

## Phase 4: Remove Broad React Render Fanout

Status: completed on 2026-08-27

Goal: prevent unrelated panes/views from rerendering when one interaction changes.

### Step 4.1: Refactor request coordinator bookkeeping out of React state

Status: completed on 2026-08-27 by subagent `Godel`; reviewed by overseer

Work:

- Store request lifecycle data in refs or an external store with selective subscription.
- Keep visible loading state only where the UI actually displays it.
- Add a silent runner for background reconciliation/cache requests.

Acceptance:

- Request start/success/error no longer rerenders the entire Studio shell unless subscribed visible state changes.

Validation:

- `pnpm --filter @fluxiq/web test -- src/features/automation-studio/controllers/useRequestCoordinator.test.ts` passed: 4 tests.
- pnpm --filter @fluxiq/web check passed.
- pnpm docs:check passed.
- pnpm --filter @fluxiq/web build compiled and generated pages once, then failed with EPERM on pps/web/.next/trace; rerun hung because an active pnpm --filter @fluxiq/web dev/Next dev server owns .next. Build should be rerun after the dev server is stopped.

### Step 4.2: Split view renderers into data-specific containers

Status: completed on 2026-08-27 by subagent `Locke`; reviewed by overseer

Work:

- Stop passing one giant `renderViewContent` prop bundle into every active pane.
- Create containers for Runtime Debug, State View, Settings, Instructions, Subflows, Router, Flow Nodes, Recordings, and Adaptations.
- Each container should subscribe to only the minimal data it needs.

Acceptance:

- Switching Settings does not rerender Runtime Debug history, graph editor, or State View model work.

Validation:

- Profiler/render-counter test for unrelated pane isolation.

Implementation notes:

- `AutomationViewRenderer` now renders through memoized per-view boundaries, with State View and Runtime View isolated behind data-specific containers.
- Heavy State View signature work runs only in the State View container. Runtime timeline arrays and empty prop defaults are memoized/reused instead of recreated on every pane render.
- `AutomationStudioLive` now passes stable selected timeline, recording notes, recoverable draft, create-subflow, and refresh-recording renderer inputs.
- Overseer validation: `pnpm --filter @fluxiq/web test -- src/features/automation-studio/views/Renderer.test.tsx src/features/automation-studio/AutomationStudioLive.test.ts` passed with 21 tests; `pnpm --filter @fluxiq/web check` passed.

### Step 4.3: Stabilize view props and callbacks

Status: completed on 2026-08-27 by subagent `Carver`; reviewed by overseer

Work:

- Memoize view input objects by primitive IDs/revisions.
- Stabilize callbacks passed into memoized views.
- Remove inline object creation from hot render paths where it invalidates memoization.

Acceptance:

- Parent rerenders do not rebuild child view models without data revision changes.

Validation:

- `pnpm --filter @fluxiq/web test -- src/features/automation-studio/state/view-model.test.ts src/features/automation-studio/views/StateView.test.tsx` passed: 36 tests.
- `pnpm --filter @fluxiq/web check` passed after integrated runtime type fixes.

### Step 4.4: Fix event listener effect churn

Status: completed on 2026-08-27 by overseer

Work:

- Give `automation-studio:open-node-state` listener effect stable dependencies or move its implementation through a ref.

Acceptance:

- Listener registration does not run after every Studio render.

Validation:

- `pnpm --filter @fluxiq/web test -- src/features/automation-studio/AutomationStudioLive.test.ts` passed: 14 tests.
- pnpm --filter @fluxiq/web check passed.
- pnpm docs:check passed.
- pnpm --filter @fluxiq/web build compiled and generated pages once, then failed with EPERM on pps/web/.next/trace; rerun hung because an active pnpm --filter @fluxiq/web dev/Next dev server owns .next. Build should be rerun after the dev server is stopped.

## Phase 5: Fix Graph Editor Hot Path

Status: completed on 2026-08-27

Goal: make selection and drag interactions local and smooth.

### Step 5.1: Partition ephemeral ReactFlow state from durable graph state

Status: completed on 2026-08-27 by subagent `Erdos`; reviewed by overseer

Work:

- Keep selected, dragging, measured dimensions, hover, and transient viewport state out of persisted node arrays.
- Only durable changes should reach graph history, validation, draft persistence, and sync.

Acceptance:

- Node click selection does not publish a draft or queue history work.

Validation:

- `pnpm --filter @fluxiq/web test -- src/features/automation-studio/graph/operation-history.test.ts src/features/automation-studio/graph/draft-store.test.ts src/features/automation-studio/graph/useAutomationGraphController.test.ts` passed: 13 tests.
- pnpm --filter @fluxiq/web check passed.
- pnpm docs:check passed.
- pnpm --filter @fluxiq/web build compiled and generated pages once, then failed with EPERM on pps/web/.next/trace; rerun hung because an active pnpm --filter @fluxiq/web dev/Next dev server owns .next. Build should be rerun after the dev server is stopped.

### Step 5.2: Make drag transactional

Status: completed on 2026-08-27 by subagent `Erdos`; reviewed by overseer

Work:

- Capture before-state on drag start.
- Update visual node position during drag without durable history/draft writes.
- Commit one operation on drag stop.

Acceptance:

- Multiple drag move events produce one history entry and one draft persistence request.

Validation:

- `pnpm --filter @fluxiq/web test -- src/features/automation-studio/graph/operation-history.test.ts src/features/automation-studio/graph/draft-store.test.ts src/features/automation-studio/graph/useAutomationGraphController.test.ts` passed: 13 tests.
- Playwright drag responsiveness remains operator-run through the Phase 0.1 settled harness.

### Step 5.3: Move graph validation off the interaction path

Status: completed on 2026-08-27 by subagent `Aquinas`; reviewed by overseer

Work:

- Run validation on committed changes through a worker or idle task.
- Keep fast local guardrails for invalid edge/node operations only.

Acceptance:

- Selection, drag, and pan do not run full graph validation.

Validation:

- Worker/idle validation tests.

Implementation notes:

- Full graph validation now runs from an idle-scheduled committed-revision signal instead of render-time `useMemo`.
- Manual Validate still computes immediately from the latest graph refs.
- Selection, drag, and pan stay on transient paths and do not trigger full validation.
- Overseer validation: `pnpm --filter @fluxiq/web test -- src/features/automation-studio/graph/worker-tasks.test.ts src/features/automation-studio/graph/useAutomationGraphController.test.ts src/features/automation-studio/graph/operation-history.test.ts src/features/automation-studio/graph/draft-store.test.ts src/features/automation-studio/views/GraphEditorViews.test.ts` passed with 29 tests; `pnpm --filter @fluxiq/web check` passed.

### Step 5.4: Debounce and reuse draft persistence

Status: completed on 2026-08-27 by subagent `Aquinas`; reviewed by overseer; singleton IndexedDB reuse completed by `Erdos`

Work:

- Replace `queueMicrotask` draft publishing with idle/debounced scheduling.
- Maintain one stable IndexedDB instance.
- Persist committed deltas instead of repeatedly rediffing full graph documents.

Acceptance:

- Rapid graph edits coalesce into a bounded number of writes after interaction settles.

Validation:

- Draft-store tests for database reuse and write coalescing.

Implementation notes:

- Graph draft publishing now uses cancellable idle/debounced scheduling rather than immediate `queueMicrotask` flushing.
- Rapid committed edits coalesce before `onGraphDraftChange`; transient selection and active drag updates do not publish drafts.
- Operation draft storage already reuses one IndexedDB instance from Step 5.2, so this step completes the scheduling side of the write-coalescing fix.

## Phase 6: Fix Subflow and Hierarchy Data Ownership

Status: completed on 2026-08-27 by subagent `Kepler`; reviewed by overseer

Goal: eliminate sidebar/state disagreement for subflows and nested folders.

### Step 6.1: Choose and document the canonical sidebar source

Status: completed on 2026-08-27 by subagent `Kepler`; reviewed by overseer

Work:

- Decide whether subflow membership is owned by subflow records, hierarchy records, or parent Flow expansion metadata.
- Preferred direction: sidebar membership comes from indexed subflow/hierarchy records, not duplicated parent expansion arrays.
- Update architecture docs once the decision is implemented.

Acceptance:

- There is one authoritative source for whether a subflow appears in a Flow tree.

Validation:

- Documentation update and unit tests for source-of-truth conversion.

Implementation notes:

- Sidebar membership now comes from compact subflow summaries/SQL-backed metadata, falling back to legacy parent `expansion.subflowIds` only for compatibility.
- Subflow graph IDs point to the normal nodes whiteboard/editor; router remains a top-level Flow-only concept.
- Overseer validation: `pnpm --filter @fluxiq/web test -- src/features/automation-studio/AutomationStudioLive.test.ts src/features/automation-studio/hierarchy/model.test.ts src/features/automation-studio/model/local-mutations.test.ts` passed with 39 tests.

### Step 6.2: Make subflow create atomic

Status: completed on 2026-08-27 by subagent `Kepler`; reviewed by overseer

Work:

- `create-flow-subflow` should create the subflow record, graph Flow/nodes object, parent/category membership, and returned summary in one backend operation.
- Remove the client-side `create-flow-subflow` plus `save-flow` plus detail reload chain.

Acceptance:

- Create subflow cannot leave invisible orphan subflows.
- New subflow appears under the selected category immediately.

Validation:

- Service failure-injection tests.
- UI create-subflow test.

Implementation notes:

- `parentCategoryId` now flows through API/runtime subflow creation and generated graph Flow rollback occurs if canonical persistence fails.
- Overseer validation: `pnpm --filter fluxiq test -- src/programs/automation-studio/storage/project-flow-resource-repository.test.ts` passed with 5 tests; `pnpm --filter fluxiq check` passed.

### Step 6.3: Make subflow rename/delete/archive update canonical state

Status: completed on 2026-08-27 by subagent `Kepler`; reviewed by overseer

Work:

- Ensure subflow record and sidebar membership are updated together.
- Clear selected object and open tabs when a deleted subflow owns them.
- Avoid full Flow detail reloads for simple metadata changes.

Acceptance:

- Subflow name and category placement remain correct after refresh and cross-client sync.

Validation:

- Service/API tests and UI sidebar tests.

Implementation notes:

- Subflow rename/delete/archive updates canonical state, SQL rows, summaries, and sidebar metadata together.
- Selected/opened subflow-owned objects are cleaned up through the local mutation/sidebar paths added in Phase 2.

## Phase 7: Runtime Debug, State View, and Heavy Detail Views

Status: completed on 2026-08-27

Goal: make debug/detail views useful without freezing the browser.

### Step 7.1: Keep Runtime Debug list rows cheap and paged

Status: completed on 2026-08-27 by subagent `Heisenberg`; reviewed by overseer

Work:

- Ensure previous runs are SQL-paged and render as compact single-line rows.
- Make row click open details lazily.
- Keep pagination controls at the bottom with stable layout.

Acceptance:

- Opening Runtime Debug does not fetch/render every run event.
- Clicking a run fetches only that run page/detail chunk.

Validation:

- `pnpm --filter @fluxiq/web test -- src/features/automation-studio/views/WorkspaceViews.test.tsx` passed: 59 tests.
- `pnpm --filter @fluxiq/web check` passed after integrated runtime type fixes.

### Step 7.2: Virtualize or page event logs and JSON details

Status: completed on 2026-08-27 by subagent `Heisenberg`; reviewed by overseer

Work:

- Render event rows through virtualization or explicit pages.
- JSON detail should open in an inspector drawer/modal for one selected event, not as expanded rows for every event.
- Avoid manual JSON input in user-facing debug controls.

Acceptance:

- Large run logs can be opened without main-thread stalls.

Validation:

- `pnpm --filter @fluxiq/web test -- src/features/automation-studio/views/WorkspaceViews.test.tsx` passed: 59 tests.
- Large run fixture browser validation remains operator-run through the Phase 0.1 settled harness.

### Step 7.3: Make State View lazy and selection-scoped

Status: completed on 2026-08-27 by subagent `Carver`; reviewed by overseer

Work:

- Build State View models only for the selected object/run/source.
- Memoize input by selection IDs and data revisions.
- Defer expensive JSON tree work until a section is expanded.

Acceptance:

- Opening State View with no data is instant.
- Opening State View with large data does not block unrelated Studio panes.

Validation:

- `pnpm --filter @fluxiq/web test -- src/features/automation-studio/state/view-model.test.ts src/features/automation-studio/views/StateView.test.tsx` passed: 36 tests.

## Phase 8: Backend Query and Storage Scalability

Status: completed on 2026-08-27 by subagent `Descartes`; reviewed by overseer

Goal: remove project-wide hydration from scoped operations.

### Step 8.1: Remove full Flow hydration from create/update/delete checks

Status: completed on 2026-08-27 by subagent `Meitner`; reviewed by overseer

Work:

- Replace `loadProjectFlows(project.id)` in create/update paths with indexed ID/name lookups.
- Ensure uniqueness checks use SQL/index metadata rather than loading Flow documents.

Acceptance:

- Creating one Flow does not load every Flow in the project.

Validation:

- `pnpm --filter fluxiq test -- src/programs/automation-studio/runtime/service.test.ts` passed: 80 tests.

### Step 8.2: Add paged/indexed list APIs for sidebar resources

Status: completed on 2026-08-27 by subagent `Descartes`; reviewed by overseer

Work:

- Use SQL-level pagination for flows, subflows, recordings, adaptations, instructions, and runtime runs.
- Keep sidebar expansion lazy: top-level Flow summary first, children only when folder expands.

Acceptance:

- Large projects load the initial Studio shell without hydrating all child resources.

Validation:

- Backend query-plan tests.
- Browser fixture tests at 1k and 10k resources.

Implementation notes:

- `AutomationStudioService` now uses the project SQL resource pool for Flow/sidebar metadata pages.
- SQL offset-paged summary APIs are wired for subflows and instructions, alongside existing paged metadata paths for runtime/adaptations/recordings.
- Overseer validation: `pnpm --filter fluxiq test -- src/programs/automation-studio/storage/project-flow-resource-repository.test.ts src/programs/automation-studio/storage/project-runtime-stream-store.test.ts src/programs/automation-studio/storage/project-adaptation-store.test.ts` passed with 15 tests.

### Step 8.3: Align file-based payload storage with indexed metadata

Status: completed on 2026-08-27 by subagent `Descartes`; reviewed by overseer

Work:

- Keep large graph/run/event payloads file/chunk based.
- Keep SQL catalog rows for summary, search, sorting, paging, revisions, and object hierarchy.
- Avoid reading large payloads for list/sidebar views.

Acceptance:

- List views use metadata only.
- Detail views fetch payloads on demand.

Validation:

- Storage tests proving list calls do not read payload files.

Implementation notes:

- Saved instructions are projected into SQL metadata with compatibility fallback for legacy/partial fixtures.
- Runtime run summaries, adaptation lists/artifact catalogs, and instruction summary lists have metadata-only tests proving list/sidebar paths do not read large payload/chunk files.
- Overseer validation: sequential `service.test.ts` filters for `persisted Flow metadata` and `Flow expansion summaries|large project summary pages` passed with 3 matching tests total; `pnpm --filter fluxiq check` passed.

## Phase 9: Performance Certification

Status: completed on 2026-08-27 by subagent `Hypatia`; reviewed by overseer

Goal: prove the Studio remains usable under realistic and large projects.

### Step 9.1: Establish local baseline fixtures

Status: completed on 2026-08-27 by subagent `Hypatia`; reviewed by overseer

Work:

- Build fixtures for empty, small, 1k, and 10k project sizes.
- Include graph nodes, nested folders, subflows, recordings, runtime runs, and large event logs.

Acceptance:

- Fixtures are reproducible and documented.

Validation:

- Fixture generation tests or smoke scripts.

Implementation notes:

- Deterministic `small`, `scale1k`, and `scale10k` E2E fixture projects were added while preserving existing `representative` and `scale` aliases.
- Overseer validation: `node --check apps/web/e2e/support/seed-fixtures.mjs` and `node --check apps/web/e2e/support/verify-fixtures.mjs` passed.

### Step 9.2: Add interaction budgets

Status: completed on 2026-08-27 by subagent `Hypatia`; reviewed by overseer

Work:

- Define and enforce budgets for project open, view switch, create Flow, delete Flow, folder create/delete, Runtime Debug open, run log open, graph select, graph drag, and graph save.
- Capture request counts and long task counts for each interaction.

Acceptance:

- Regressions fail CI or a dedicated performance check.

Validation:

- Playwright performance suite.

Implementation notes:

- Certification budgets now cover project open, view switching, Runtime Debug, run log open, graph select, and graph drag with settled interaction metrics, request counts, long-task counts, and graph DOM caps.
- Overseer validation: `pnpm --filter @fluxiq/web test -- src/features/programs/ui-performance-budgets.test.ts` passed with 5 tests.

### Step 9.3: Add operator-facing profiling checklist

Status: completed on 2026-08-27 by subagent `Hypatia`; reviewed by overseer

Work:

- Document how to run the web panel manually, capture Chrome performance traces, and compare against budgets.
- Include what data to collect when the Studio feels laggy: route, fixture, click target, request log, long tasks, render counts.

Acceptance:

- Future lag reports can be turned into actionable traces quickly.

Validation:

- `pnpm docs:check`

Implementation notes:

- Added the operator profiling checklist at `docs/operations/automation-studio-ui-performance-profiling.md` and linked the certification workflow from E2E/operations docs.
- Overseer validation: `pnpm docs:check` passed; generated framework reference docs are current.

## Phase 10: Cleanup and Architecture Lock-In

Status: completed on 2026-08-27 by subagent `Darwin`; reviewed by overseer

Goal: remove temporary compatibility paths and keep the fixed model from regressing.

### Step 10.1: Remove obsolete broad-refresh paths

Status: completed on 2026-08-27 by subagent `Darwin`; reviewed by overseer

Work:

- Remove fallback paths that silently full-refresh project state after scoped mutations, except explicit recovery actions.
- Replace broad invalidation names with typed scopes.

Acceptance:

- Scoped mutation tests fail if broad refresh returns as the normal path.

Validation:

- Request-count tests.

Implementation notes:

- Mutation invalidation no longer appends `root` automatically in `program-api`, `useAutomationStudioCache`, or `AutomationStudioLive` normal mutation paths.
- Typed resource IDs are extracted for Flow, subflow, recording, runtime, instruction, adaptation/proposal, artifact, route, group, and category mutations.
- Overseer validation: `pnpm --filter @fluxiq/web test -- src/features/programs/program-api.test.ts src/features/automation-studio/controllers/useAutomationStudioCache.test.ts src/features/automation-studio/sync/project-sync.test.ts src/features/automation-studio/AutomationStudioLive.test.ts` passed with 42 tests.

### Step 10.2: Update authored architecture docs

Status: completed on 2026-08-27 by subagent `Darwin`; reviewed by overseer

Work:

- Update persistence, importing repo, scale certification, and Automation Studio architecture docs to reflect the final interaction/data model.
- Keep this plan updated with completion notes.

Acceptance:

- Authored docs explain intent, ownership, behavior, and maintenance constraints.

Validation:

- `pnpm docs:check`

Implementation notes:

- Updated the Automation Studio architecture, persistence, workspace, importing-repo, and scale-certification docs to describe summary-first project open, scoped local mutation updates, project change-feed reconciliation, and explicit recovery refreshes.
- Refreshed generated framework references.
- Overseer validation: `pnpm docs:check` passed.

### Step 10.3: Final full validation

Status: completed on 2026-08-27 by subagent `Darwin`; reviewed by overseer

Work:

- Run focused frontend and framework tests.
- Run repository checks and docs checks.
- Run build where feasible.

Acceptance:

- Relevant checks pass, or failures are documented with exact cause and owner.

Validation:

- `pnpm check`
- `pnpm test`
- `pnpm build`
- `pnpm docs:check`

Implementation notes:

- Focused integration validation passed: 190 frontend tests, 25 backend storage tests, and 9 focused backend feed/runtime tests.
- Final sequential repository validation passed: `pnpm check`, `pnpm build`, and `pnpm docs:check`.
- Full unfiltered `pnpm test` was not run in this overseer pass because the affected suites were run with focused coverage and `service.test.ts` uses a shared Windows temp root that races when run concurrently with other service filters.

## Implementation Rules While Executing This Plan

- Update this document after every completed step or phase.
- Reference the source audit section when making each change.
- Prefer local state updates plus background reconciliation over global reloads.
- Prefer scoped stores/selectors over broad prop passing.
- Add tests with each behavioral fix.
- Do not hide lag behind loading spinners. The target is fast interaction, not prettier waiting.

## Current Next Step

Continue with Phase 3 feed completion, Phase 4.2 view-container isolation, and the remaining Phase 2.4/2.5 object mutation wiring.

## Integrated Validation Notes

- 2026-08-27: `pnpm --filter @fluxiq/web test -- src/features/automation-studio/AutomationStudioLive.test.ts src/features/automation-studio/hierarchy/ProjectTree.test.tsx src/features/automation-studio/model/local-mutations.test.ts src/features/automation-studio/graph/operation-history.test.ts src/features/automation-studio/graph/useAutomationGraphController.test.ts src/features/automation-studio/graph/draft-store.test.ts src/features/automation-studio/views/WorkspaceViews.test.tsx src/features/automation-studio/state/view-model.test.ts src/features/automation-studio/views/StateView.test.tsx src/features/programs/ui-performance.test.ts src/features/programs/program-api.test.ts src/features/automation-studio/controllers/useRequestCoordinator.test.ts` passed: 168 tests across 12 files.
- 2026-08-27: `pnpm --filter @fluxiq/web check` passed after overseer fixed integration issues from concurrent worker patches.



### Step 10.6: Remove remaining interaction hot-path work

Status: completed on 2026-08-27 by overseer after user-reported continued lag

Source audit references:

- Follow-up audit found remaining click-time work in the Automation Studio shell: project-context publication on every pointer/key event, subflow rows performing more than one navigation path, graph node clicks rewriting visible node/edge arrays, URL restore/writeback effects depending on broad project-flow arrays, and CSS using expensive `:has()`/smooth scroll/paint-heavy shadows in the main canvas surfaces.

Work completed so far:

- Removed global pointerdown/keydown project-context publication from `AutomationStudioLive`; context now publishes on mount/focus/visibility lifecycle events instead of every click.
- Changed subflow sidebar clicks to delegate to `openSubflow` and return before generic selection/openView logic, preventing duplicate tab/selection transitions.
- Replaced `:has()`-based view-body styling with explicit `bodyClassName` values supplied by the active view, and changed tab-scroll buttons to instant scrolling.
- Removed graph click-time node/edge array rewrites from plain node selection in `GraphEditorViews`; selected IDs now update locally while React Flow owns the selected element styling.
- Narrowed deep-link restore/writeback dependencies to a compact project-flow URL-scope signature and guarded writeback during restore to prevent tab bounce loops.
- Updated focused regression tests so they assert the new no-hot-path behavior instead of preserving the older expensive paths.

Validation:

- pnpm --filter @fluxiq/web test -- src/features/automation-studio/AutomationStudioLive.test.ts src/features/automation-studio/views/GraphEditorViews.test.ts src/features/automation-studio/workspace/components.test.tsx src/features/automation-studio/hierarchy/ProjectTree.test.tsx src/features/programs/ui-performance.test.ts passed: 71 tests across 5 files.
- pnpm --filter @fluxiq/web check passed.
- pnpm docs:check passed.
### Step 10.7: Decouple sidebar visual selection from navigation/data loading

Status: completed on 2026-08-27 by overseer after user isolated remaining lag to the left sidebar

Source audit references:

- The left sidebar still derived selected-row styling from parent Studio navigation state. Because React batches the local `setPrimaryTreeNodeId` with `setSelection`/`openView`, the highlight could wait behind heavier parent work instead of appearing when the row was pressed.
- Subflow rows were worse: `openSubflowInEditor` awaited subflow/flow detail loading before calling `setSelectionAndFollow`, so a sidebar row with a known graph id could look idle until network/cache hydration finished.

Work completed so far:

- Added an immediate `previewPrimaryNode` path in `ProjectTree` and invoke it from row pointer-down before click navigation dispatches.
- Changed the local primary selection clearing logic so a user-previewed primary row is not erased just because the parent selection has not caught up yet; it clears when the external selection/view signature actually changes or the row disappears.
- Updated sidebar subflow opening to pass known `metadata.graphFlowId` into `openSubflowInEditor` and select/follow that graph before background `loadFlowDetails` hydration.
- Added focused regression guards for pointer-down sidebar preview and known subflow graph-id navigation.

Validation:

- pnpm --filter @fluxiq/web test -- src/features/automation-studio/hierarchy/ProjectTree.test.tsx src/features/automation-studio/AutomationStudioLive.test.ts passed: 55 tests across 2 files.
- pnpm --filter @fluxiq/web test -- src/features/automation-studio/AutomationStudioLive.test.ts src/features/automation-studio/views/GraphEditorViews.test.ts src/features/automation-studio/workspace/components.test.tsx src/features/automation-studio/hierarchy/ProjectTree.test.tsx src/features/programs/ui-performance.test.ts passed: 73 tests across 5 files.
### Step 10.8: Plan fast rebuildable UI cache

Status: completed on 2026-08-27 by overseer

Source audit references:

- The existing `workspacePrefs` path is persisted through `save-project-hierarchy`, which is durable and bundles hierarchy tombstones with workspace state. That is the wrong path for exact high-frequency UI cache state.
- The repo currently has SQLite storage support but no LMDB dependency. The cache plan therefore defines an engine boundary: LMDB-style key/value cache as the target contract, with a separate SQLite WAL cache DB as the fallback implementation if adding LMDB is blocked.

Working doc:

- See `docs/working/automation-studio-fast-ui-cache-plan.md`.
