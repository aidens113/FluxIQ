# Automation Studio Strict Workspace Layout Plan

## Purpose

Automation Studio currently uses a highly dynamic inner window canvas. Users can
open multiple inner windows, drag them around the main area, resize every edge,
snap them, and customize the workspace heavily. That flexibility has become
less useful than a predictable editor workspace.

This plan moves Automation Studio toward a stricter workbench layout:

```text
left hierarchy | main editor panes | right inspector
               | bottom timeline dock
```

The goal is to keep useful resizing and split layouts while removing freeform
floating window movement.

## Post-Completion Amendment: Recording Timeline Split

After the strict layout landed, recording views were split again:

- the bottom region is now an action preview dock for selected recordings;
- the action preview dock shows only action/domain-event clips, not all state
  observations;
- the full recording timeline is a main editor view again and is used for
  in-depth recording inspection and proposal-generation workflows.

Any earlier wording in this working plan that says the full timeline is always
the bottom dock is superseded by this amendment.

## Goals

1. Put recording timeline content in a bottom dock instead of a movable main
   window.
2. Keep Flow, Proposal, Proposal Generator, State View, Config, Runs, and Debug
   in the main editor area.
3. Keep the global inspector in the right sidebar.
4. Replace freeform draggable inner windows with preset pane layouts.
5. Keep resizing where it helps:
   - left hierarchy width;
   - right inspector width;
   - bottom timeline height;
   - main editor split ratios.
6. Preserve tabbed views, but bind tabs to preset pane slots rather than
   draggable floating windows.
7. Normalize existing saved workspace preferences into the new stricter model.

## Non-Goals

- No arbitrary x/y pane dragging inside the main area.
- No z-index stacking or floating-window overlap.
- No detachable external windows.
- No major redesign of individual views such as Flow Editor, Proposal View, or
  State View in this phase.
- No data-model changes for recordings, proposals, or state snapshots.

## Current System Notes

Relevant files:

- `apps/web/src/features/automation-studio/AutomationStudioLive.tsx`
- `apps/web/src/features/automation-studio/workspace/layout.ts`
- `apps/web/src/features/automation-studio/workspace/components.tsx`
- `apps/web/src/features/automation-studio/views/TimelineView.tsx`
- `apps/web/src/features/automation-studio/views/TimelineDock.tsx`
- `apps/web/src/features/automation-studio/views/Renderer.tsx`

Current workspace concepts:

- `AutomationWorkspacePrefs.windows` stores inner windows.
- Windows store:
  - `area`;
  - `activeViewId`;
  - `tabs`;
  - `xPct`;
  - `yPct`;
  - `widthPct`;
  - `heightPct`;
  - `zIndex`.
- Window canvas supports:
  - drag title bar to move;
  - edge/corner resize;
  - snap preview;
  - layout picker;
  - add window/add tab;
  - right sidebar windows.
- `timeline-recording` is currently just another view instance and can appear
  as a movable workspace window.

## Target Layout Model

### Strict Workspace Preferences

New preferred model:

```ts
type AutomationStrictWorkspacePrefs = {
  layoutVersion: 2;

  leftSidebarWidth: number;
  rightInspectorWidth: number;
  bottomTimelineHeight: number;
  bottomTimelineCollapsed: boolean;

  mainLayoutPreset:
    | "single"
    | "two-even"
    | "two-main-side"
    | "three-even"
    | "three-main-two"
    | "two-rows";

  mainSplitRatios: number[];

  panes: AutomationWorkspacePane[];

  activePaneId: string;
  activeViewId: string;

  rightSidebar: {
    activeViewId: "global-inspector" | "workspace-dock" | "ai-assistant" | "problems-view";
    tabs: string[];
    collapsed: boolean;
  };

  bottomDock: {
    activeViewId: "timeline-recording";
    expanded: boolean;
  };

  viewStates: Record<string, Record<string, unknown>>;
};

type AutomationWorkspacePane = {
  id: string;
  activeViewId: string;
  tabs: string[];
};
```

The implementation may initially evolve the existing `AutomationWorkspacePrefs`
instead of replacing it wholesale, but new writes should not depend on `xPct`,
`yPct`, or `zIndex`.

### Main Presets

Required presets:

| Preset | Meaning |
| --- | --- |
| `single` | One main editor pane. |
| `two-even` | Two columns, 1/2 and 1/2. |
| `two-main-side` | Two columns, roughly 2/3 and 1/3. |
| `three-even` | Three columns, 1/3 each. |
| `three-main-two` | One large pane plus two smaller side panes. |
| `two-rows` | Two stacked editor rows. Optional but useful for state/debug. |

Split ratios should be user-resizable and persisted. Preset selection sets
initial ratios; dragging split handles updates ratios.

### Fixed Regions

#### Left Hierarchy

Contains project/category/recording/proposal/Flow hierarchy.

Allowed customization:

- width resize;
- collapse if already supported or added later.

Not allowed:

- moving hierarchy to another side;
- turning hierarchy into a floating window.

#### Main Editor Area

Contains pane slots for:

- Flow Editor;
- Proposal View;
- Proposal Generator;
- State View;
- Config;
- Runs;
- Runtime Debug;
- Relationship Web;
- Connected Clients if needed.

Allowed customization:

- choose preset;
- resize split handles;
- add/close/reorder tabs within pane;
- move a tab to a different pane by command/menu.

Not allowed:

- freeform drag movement;
- overlapping panes;
- z-index stacking.

#### Right Inspector

Contains global inspector and utility tabs.

Allowed customization:

- width resize;
- collapse;
- switch tabs.

Default tab:

- `global-inspector`.

Suggested utility tabs:

- Inspector;
- AI Assistant;
- Problems;
- Workspace Dock if retained.

#### Bottom Timeline Dock

Contains recording timeline.

Allowed customization:

- collapsed/expanded;
- vertical height resize;
- selected recording changes content.

Behavior:

- Selecting a recording or timeline event opens/updates the bottom dock.
- Double-clicking or opening state from a timeline entry still calls indexed
  Core state lookup.
- Timeline dock should not be an addable movable main window.

## View Placement Rules

### Recording Selection

When a recording is selected:

1. Select recording in hierarchy.
2. Load recording details if needed.
3. Show bottom timeline dock.
4. Do not replace the main editor unless the user explicitly opens Proposal
   Generator or another recording-specific view.

### Timeline Entry Selection

When a timeline entry is selected:

1. Keep bottom timeline dock visible.
2. Update global selection and inspector.
3. Do not open a main timeline window.
4. Open State View in main only when the user explicitly opens state.

### Generate Proposal

When Generate Proposal is clicked:

1. Open Proposal Generator in main editor.
2. Prefer pane 1 if preset is `single`.
3. Prefer pane 2 if an editor split exists and pane 1 has Flow Editor.
4. Keep timeline dock visible at bottom.

### Open Existing Proposal

When an existing proposal is opened:

1. Open Proposal View in main editor.
2. Prefer pane 1 if no Flow is active.
3. Prefer pane 2 if Flow Editor is active in pane 1.
4. Keep source recording timeline in bottom dock.

### Open State

When State View opens from a node or timeline event:

1. Use exact state lookup behavior already implemented.
2. Prefer a secondary main pane if present.
3. If `single`, replace active main tab or add a State tab beside current main
   editor based on existing tab behavior.
4. Do not use bottom dock for State View.

## Migration / Normalization

Existing workspace prefs should normalize into strict layout:

1. Collect existing main-area windows.
2. Exclude `timeline-recording` from main panes.
3. Exclude `global-inspector` from main panes and move it to right sidebar.
4. Sort remaining windows by:
   - active window first;
   - lowest previous `zIndex`;
   - stable id.
5. Convert first N windows to pane slots based on preset:
   - 1 window -> `single`;
   - 2 windows -> `two-main-side`;
   - 3+ windows -> `three-main-two`.
6. Merge extra window tabs into the last pane.
7. Preserve `viewStates`.
8. Preserve sidebar/inspector widths where possible.
9. Use default bottom timeline height if missing.

No long-term compatibility for freeform movement is required after
normalization.

## UI Changes

### Remove / Disable

- Window title-bar move handler.
- Snap preview overlay.
- Freeform add-window placement.
- Window z-index activation behavior.
- Edge/corner resizing of individual floating windows.
- Preferences text describing draggable panes.

### Keep / Add

- Layout preset selector.
- Pane tab bars.
- Add tab to pane.
- Close tab.
- Move tab to pane command/menu.
- Main split resize handles.
- Bottom timeline resize handle.
- Right inspector resize handle.
- Left hierarchy resize handle.
- Focus/full-page mode for selected main pane if still useful.

## Implementation Steps

### Step 1: Add Strict Layout Types

Deliverables:

- Add strict layout/pane types in `workspace/layout.ts`.
- Add default strict workspace prefs.
- Add normalization from current freeform prefs to strict prefs.
- Add unit tests for normalization.

Done when:

- Old prefs with draggable windows normalize into deterministic panes.
- Timeline window is removed from main pane list.
- Inspector window moves to right sidebar.

### Step 2: Render Bottom Timeline Dock

Deliverables:

- Render `AutomationTimelineView` or a richer `TimelineDock` in a fixed bottom
  region.
- Remove `timeline-recording` from main window rendering.
- Add collapse/expand and vertical resize state.

Done when:

- Selecting a recording shows timeline at the bottom.
- Timeline is never rendered as a floating/main pane window.
- Timeline entry open-state behavior still works.

### Step 3: Replace Main Freeform Canvas With Pane Renderer

Deliverables:

- Render main panes from strict preset and ratios.
- Each pane renders active tab through `Renderer.tsx`.
- Existing tab state is preserved.

Done when:

- Main area has deterministic pane slots.
- No pane overlaps another pane.
- Presets switch cleanly.

### Step 4: Remove Drag / Snap / Z-Index Behavior

Deliverables:

- Remove move start/move frame handlers from main workspace.
- Remove snap preview logic.
- Remove z-index stacking from active pane behavior.
- Remove drag instructions from preferences.

Done when:

- Window/pane title bars do not move panes.
- No snap preview appears.
- Active pane changes focus only, not stacking order.

### Step 5: Add Split Resizing

Deliverables:

- Add horizontal/vertical split handles based on active preset.
- Persist split ratios.
- Clamp minimum pane sizes.

Done when:

- Users can resize main pane ratios.
- Ratios survive refresh.
- Layout remains usable on narrow screens.

### Step 6: Right Sidebar And Inspector Cleanup

Deliverables:

- Make global inspector the right sidebar's default surface.
- Keep right sidebar width resize/collapse.
- Decide whether `workspace-dock`, AI Assistant, and Problems remain as right
  sidebar tabs or move to main views.

Done when:

- Inspector no longer appears as a movable inner window.
- Selection changes still update inspector.

### Step 7: View Routing Rules

Deliverables:

- Update `openView` behavior to choose a pane/region by view type.
- Timeline routes to bottom dock.
- Proposal/Flow/State route to main panes.
- Inspector routes to right sidebar.

Done when:

- Recording selection updates bottom dock.
- Proposal generation opens in main.
- Open State opens in main.
- Inspector remains right.

### Step 8: Preferences UI Update

Deliverables:

- Replace "Window Canvas" preference copy.
- Add controls for:
  - main preset;
  - timeline dock height/collapse;
  - left/right widths.

Done when:

- Preferences match the stricter layout model.
- No UI text says to drag window title bars around the canvas.

### Step 9: Tests And Docs

Deliverables:

- Unit tests for strict layout normalization.
- Web tests for placement/routing rules.
- Update authored architecture docs.
- Run generated docs check if public types changed.

Done when:

- Relevant tests pass.
- Authored docs describe the new workbench layout.

## Acceptance Criteria

- Timeline is always a bottom dock, not a draggable window.
- Flow/Proposal/State/Config/Runs/Debug render in main pane slots.
- Inspector renders in the right sidebar.
- Users can choose preset layouts but cannot freeform drag panes.
- Users can resize left/right/bottom regions and main split ratios.
- Old saved workspace prefs normalize without breaking the page.
- Deleted recordings/proposals still close related tabs/views correctly.
- State View exact lookup behavior remains unchanged.

## Risks

- Existing `openView` logic is tied to freeform windows and may need careful
  untangling.
- Saved `viewStates` must survive even if window structure changes.
- Some tests may assume `timeline-recording` is a normal workspace view.
- The right sidebar currently uses window concepts; moving it to fixed tabs may
  touch selection, inspector, and dock state together.

## Validation Checklist

- `pnpm --filter @fluxiq/web test`
- `pnpm --filter @fluxiq/web check`
- `pnpm --filter @fluxiq/web build`
- `pnpm --filter fluxiq check` if shared public types change.
- `pnpm docs:check` after authored docs updates.

## Implementation Ledger

| Step | Status | Date | Completed Work | Remaining Work |
| --- | --- | --- | --- | --- |
| Step 1: Strict layout types | Complete | 2026-08-17 | Added v2 strict workspace prefs, pane/right-sidebar/bottom-dock defaults, freeform-window normalization into deterministic panes, and focused normalization tests. `pnpm --filter @fluxiq/web test -- workspace/layout.test.ts` passes. | Continue wiring UI rendering to strict regions. |
| Step 2: Bottom timeline dock | Complete | 2026-08-17 | Routed `timeline-recording` to an expanded bottom dock, rendered the full timeline view in a fixed bottom grid region, added collapse/resize state, and excluded timeline tabs from inner window rendering. `pnpm --filter @fluxiq/web check` passes. | Continue replacing the main window canvas with strict pane slots. |
| Step 3: Main pane renderer | Complete | 2026-08-17 | Main editor now renders from strict pane slots and preset ratios, view content is shared through one renderer helper, pane tab select/add/close works, and the main layout picker switches strict presets. `pnpm --filter @fluxiq/web check` passes. | Remove remaining freeform affordances from rendered panes. |
| Step 4: Remove drag/snap/z-index | Complete | 2026-08-17 | Fixed main panes no longer use move handlers, resize edges, reset-size controls, move cursors, or snap-preview rendering; active pane focus updates without z-index stacking. `pnpm --filter @fluxiq/web check` passes. | Add strict split-ratio resize handles. |
| Step 5: Split resizing | Complete | 2026-08-17 | Added strict pane split handles for column and row presets, live ratio resizing, persistence through `mainSplitRatios`, and minimum adjacent-pane clamping. `pnpm --filter @fluxiq/web check` passes. | Move right sidebar to fixed utility tabs. |
| Step 6: Right sidebar cleanup | Complete | 2026-08-17 | Replaced right-area window rendering with a fixed sidebar tab surface, routed right views into `rightSidebar`, kept width resize/collapse, and made the global inspector the default/sidebar-owned surface. `pnpm --filter @fluxiq/web check` passes. | Tighten routing rules and deletion cleanup for strict pane/sidebar state. |
| Step 7: View routing | Complete | 2026-08-17 | Added fixed region classification, routed main/right/bottom views to their strict surfaces, added secondary-pane placement rules for proposal/state views, and extended deletion cleanup to strict panes/sidebar tabs. `pnpm --filter @fluxiq/web test -- workspace/layout.test.ts` and `pnpm --filter @fluxiq/web check` pass. | Update preference controls and copy. |
| Step 8: Preferences UI | Complete | 2026-08-17 | Replaced draggable-window preference copy with strict workspace controls for main preset, timeline dock height/collapse, and left/right region widths; added select/checkbox styling. `pnpm --filter @fluxiq/web check` passes. | Run final tests and update authored architecture docs. |
| Step 9: Tests/docs | Complete | 2026-08-17 | Added layout normalization/routing tests, updated the authored Automation Studio workspace architecture guide, and completed validation. `pnpm --filter @fluxiq/web test`, `pnpm --filter @fluxiq/web check`, `pnpm --filter @fluxiq/web build`, and `pnpm docs:check` pass. | None. |
