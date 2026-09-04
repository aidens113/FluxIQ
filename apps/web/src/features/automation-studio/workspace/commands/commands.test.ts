import { afterEach, describe, expect, it, vi } from "vitest";
import {
  dirtyViewRegistrySnapshot,
  registerDirtyView,
  resetDirtyViewRegistryForTests,
  updateDirtyView
} from "../dirty-view-registry";
import { defaultAutomationWorkspacePrefs } from "../layout/defaults";
import { createAutomationWorkspaceRenderStore } from "../render-store";
import { createAutomationWorkspaceCommandPort } from "./port";
import {
  automationKeyboardResizeValue,
  automationKeyboardSplitRatios,
  createAutomationResizeSession
} from "./resize";
import {
  createAutomationWarmViewRegistry,
  subscribeAutomationWarmViewRegistryToDirtyViews
} from "./warm-activation";
import {
  automationWorkspaceMaxMainPanes,
  createAutomationWorkspaceCommands
} from "./workspace-commands";

afterEach(resetDirtyViewRegistryForTests);

describe("Phase 8 workspace commands", () => {
  it("keeps warm activity identity local to a pane and resets it between projects", () => {
    const warm = createAutomationWarmViewRegistry({ projectKey: "project-a" });
    const first = warm.activity("pane-1", "flow-nodes");
    const same = warm.activity("pane-1", "flow-nodes");

    expect(same).toBe(first);
    warm.markWarm("pane-1", "flow-nodes");
    expect(warm.isWarm("pane-1", "flow-nodes")).toBe(true);

    warm.reset("project-b");
    expect(warm.activity("pane-1", "flow-nodes")).not.toBe(first);
    expect(warm.isWarm("pane-1", "flow-nodes")).toBe(false);
  });

  it("evicts least-recently-used warm views at desktop and constrained caps", () => {
    const warm = createAutomationWarmViewRegistry({ projectKey: "project-a", limit: 6 });
    for (let index = 0; index < 7; index += 1) warm.markWarm("pane-1", `view-${index}`);
    expect(warm.retainedCount()).toBe(6);
    expect(warm.isWarm("pane-1", "view-0")).toBe(false);
    expect(warm.isWarm("pane-1", "view-6")).toBe(true);

    warm.setLimit(3);
    expect(warm.retainedCount()).toBe(3);
    expect(warm.isWarm("pane-1", "view-3")).toBe(false);
    expect(warm.isWarm("pane-1", "view-4")).toBe(true);
  });

  it("pins active and dirty warm views while preserving eligible revisit state", () => {
    const dirty = new Set(["view-dirty"]);
    const warm = createAutomationWarmViewRegistry({
      projectKey: "project-a",
      limit: 3,
      isDirty: (viewId) => dirty.has(viewId),
      eligible: (viewId) => viewId !== "view-cold"
    });
    const localState = { selectedRunId: "run-7", scrollTop: 240 };
    warm.activity("pane-1", "view-active").current = true;
    warm.markWarm("pane-1", "view-active");
    warm.markWarm("pane-1", "view-dirty");
    warm.markWarm("pane-1", "view-old");
    warm.markWarm("pane-1", "view-new");

    expect(warm.isWarm("pane-1", "view-active")).toBe(true);
    expect(warm.isWarm("pane-1", "view-dirty")).toBe(true);
    expect(warm.isWarm("pane-1", "view-old")).toBe(false);
    expect(warm.isWarm("pane-1", "view-new")).toBe(true);
    expect(localState).toEqual({ selectedRunId: "run-7", scrollTop: 240 });

    warm.markWarm("pane-1", "view-cold");
    expect(warm.isWarm("pane-1", "view-cold")).toBe(false);
  });

  it("immediately evicts an over-cap dirty pin when it becomes clean", () => {
    registerDirtyView({
      id: "settings:draft",
      viewId: "view-dirty",
      label: "Settings draft",
      dirty: true,
      save: vi.fn(),
      discard: vi.fn()
    });
    registerDirtyView({
      id: "graph:draft",
      viewId: "view-still-dirty",
      label: "Graph draft",
      dirty: true,
      save: vi.fn(),
      discard: vi.fn()
    });
    const warm = createAutomationWarmViewRegistry({ projectKey: "project-a", limit: 1 });
    const unsubscribe = subscribeAutomationWarmViewRegistryToDirtyViews(warm);
    warm.markWarm("pane-1", "view-dirty");
    warm.markWarm("pane-1", "view-still-dirty");
    warm.activity("pane-1", "view-active").current = true;
    warm.markWarm("pane-1", "view-active");

    expect(warm.retainedCount()).toBe(3);
    expect(warm.isWarm("pane-1", "view-dirty")).toBe(true);
    expect(warm.isWarm("pane-1", "view-still-dirty")).toBe(true);
    expect(warm.isWarm("pane-1", "view-active")).toBe(true);

    updateDirtyView("settings:draft", { dirty: false });

    expect(warm.retainedCount()).toBe(2);
    expect(warm.isWarm("pane-1", "view-dirty")).toBe(false);
    expect(warm.isWarm("pane-1", "view-still-dirty")).toBe(true);
    expect(warm.isWarm("pane-1", "view-active")).toBe(true);
    unsubscribe();
  });

  it("commits a tab selection synchronously exactly once and guards repeated selection", () => {
    const initial = defaultAutomationWorkspacePrefs();
    initial.panes[0] = {
      ...initial.panes[0]!,
      tabs: [...initial.panes[0]!.tabs, "runtime-debug"]
    };
    const store = createAutomationWorkspaceRenderStore(initial);
    const schedule = vi.fn();
    const onCommit = vi.fn();
    const onRegionActivated = vi.fn();
    const listener = vi.fn();
    store.subscribe(listener);
    const commands = createAutomationWorkspaceCommands({
      port: createAutomationWorkspaceCommandPort(store, { onCommit, schedule }),
      warm: createAutomationWarmViewRegistry({ projectKey: "p" }),
      onRegionActivated
    });

    expect(commands.selectPaneTab(initial.panes[0]!.id, "runtime-debug")).toBe(true);
    expect(schedule).not.toHaveBeenCalled();
    expect(listener).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledOnce();
    expect(onRegionActivated).toHaveBeenCalledOnce();
    expect(store.getPrefs().activeViewId).toBe("runtime-debug");
    expect(store.getPrefs().panes[0]?.activeViewId).toBe("runtime-debug");

    expect(commands.selectPaneTab(initial.panes[0]!.id, "runtime-debug")).toBe(false);
    expect(listener).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledOnce();
    expect(onRegionActivated).toHaveBeenCalledOnce();
  });

  it("switches tabs without prompting while preserving dirty work", () => {
    const initial = defaultAutomationWorkspacePrefs();
    initial.panes[0] = {
      ...initial.panes[0]!,
      activeViewId: "flow-nodes",
      tabs: ["flow-nodes", "runtime-debug"]
    };
    initial.activePaneId = initial.panes[0]!.id;
    initial.activeViewId = "flow-nodes";
    const store = createAutomationWorkspaceRenderStore(initial);
    const discard = vi.fn();
    registerDirtyView({
      id: "graph:draft",
      viewId: "flow-nodes",
      label: "Node graph",
      dirty: true,
      save: vi.fn(),
      discard
    });
    const commands = createAutomationWorkspaceCommands({
      port: createAutomationWorkspaceCommandPort(store),
      warm: createAutomationWarmViewRegistry({ projectKey: "p" })
    });

    expect(commands.selectPaneTab(initial.panes[0]!.id, "runtime-debug")).toBe(true);
    expect(store.getPrefs().activeViewId).toBe("runtime-debug");
    expect(dirtyViewRegistrySnapshot().pending).toBeNull();
    expect(discard).not.toHaveBeenCalled();
  });

  it("moves a tab between panes with the keyboard command and keeps one active owner", () => {
    const initial = {
      ...defaultAutomationWorkspacePrefs(),
      panes: [
        { id: "pane-1", activeViewId: "runtime-debug", tabs: ["flow-nodes", "runtime-debug"] },
        { id: "pane-2", activeViewId: "state-explorer", tabs: ["state-explorer"] }
      ],
      activePaneId: "pane-1",
      activeViewId: "runtime-debug",
      mainLayoutPreset: "two-main-side" as const,
      mainSplitRatios: [0.67, 0.33]
    };
    const store = createAutomationWorkspaceRenderStore(initial);
    const commands = createAutomationWorkspaceCommands({
      port: createAutomationWorkspaceCommandPort(store),
      warm: createAutomationWarmViewRegistry({ projectKey: "p" })
    });

    expect(commands.movePaneTabByKeyboard("pane-1", "runtime-debug", 1)).toBe(true);
    expect(store.getPrefs().panes[0]?.tabs).toEqual(["flow-nodes"]);
    expect(store.getPrefs().panes[1]?.tabs).toEqual(["state-explorer", "runtime-debug"]);
    expect(store.getPrefs()).toMatchObject({ activePaneId: "pane-2", activeViewId: "runtime-debug" });
  });

  it("persists active tabs and layout commits through the command port", () => {
    const onCommit = vi.fn();
    const store = createAutomationWorkspaceRenderStore(defaultAutomationWorkspacePrefs());
    const port = createAutomationWorkspaceCommandPort(store, { onCommit });
    const commands = createAutomationWorkspaceCommands({
      port,
      warm: createAutomationWarmViewRegistry({ projectKey: "p" })
    });

    expect(commands.openView("runtime-debug")).toBe(true);
    expect(onCommit).toHaveBeenLastCalledWith(store.getPrefs(), { persist: true, scope: "workspace" });

    expect(commands.applyLayoutPreset("two-main-side")).toBe(true);
    expect(onCommit).toHaveBeenLastCalledWith(store.getPrefs(), { persist: true, scope: "workspace" });
  });

  it("publishes region activation only after a guarded workspace commit", () => {
    const activated = vi.fn();
    const store = createAutomationWorkspaceRenderStore(defaultAutomationWorkspacePrefs());
    const commands = createAutomationWorkspaceCommands({
      port: createAutomationWorkspaceCommandPort(store),
      warm: createAutomationWarmViewRegistry({ projectKey: "p" }),
      onRegionActivated: activated
    });

    expect(commands.openView("global-inspector")).toBe(false);
    expect(commands.openView("recording-action-preview")).toBe(true);
    expect(activated).toHaveBeenCalledOnce();
    expect(activated).toHaveBeenCalledWith({
      region: "bottom",
      paneId: "bottom-dock",
      viewId: "recording-action-preview"
    });
  });

  it("refuses a fourth main pane without discarding existing tabs", () => {
    const initial = {
      ...defaultAutomationWorkspacePrefs(),
      panes: [
        { id: "pane-1", activeViewId: "flow-nodes", tabs: ["flow-nodes"] },
        { id: "pane-2", activeViewId: "state-explorer", tabs: ["state-explorer"] },
        { id: "pane-3", activeViewId: "runtime-debug", tabs: ["runtime-debug"] }
      ],
      mainLayoutPreset: "three-main-two" as const,
      mainSplitRatios: [0.5, 0.25, 0.25]
    };
    const store = createAutomationWorkspaceRenderStore(initial);
    const commands = createAutomationWorkspaceCommands({
      port: createAutomationWorkspaceCommandPort(store),
      warm: createAutomationWarmViewRegistry({ projectKey: "p" })
    });
    const before = store.getPrefs().panes.map((pane) => ({ ...pane, tabs: [...pane.tabs] }));

    expect(commands.openView("flow-instructions", "new-pane-or-focus")).toBe(false);
    expect(store.getPrefs().panes).toEqual(before);
    expect(store.getPrefs().panes).toHaveLength(automationWorkspaceMaxMainPanes);
  });

  it("expands layouts with distinct registered views instead of duplicate Flow defaults", () => {
    const store = createAutomationWorkspaceRenderStore(defaultAutomationWorkspacePrefs());
    const commands = createAutomationWorkspaceCommands({
      port: createAutomationWorkspaceCommandPort(store),
      warm: createAutomationWarmViewRegistry({ projectKey: "p" })
    });

    expect(commands.applyLayoutPreset("three-main-two")).toBe(true);
    const paneViews = store.getPrefs().panes.map((pane) => pane.activeViewId);
    expect(paneViews).toHaveLength(3);
    expect(new Set(paneViews).size).toBe(3);
    expect(paneViews.filter((viewId) => viewId === "flow-nodes")).toHaveLength(1);
  });

  it("keeps pointer movement transient and commits exactly once on pointer release", () => {
    const transient = vi.fn();
    const commit = vi.fn();
    const session = createAutomationResizeSession({
      startPointer: 100,
      startValue: 300,
      min: 220,
      max: 420,
      onTransient: transient,
      onCommit: commit
    });

    expect(session.move(125)).toBe(325);
    expect(session.move(600)).toBe(420);
    expect(transient).toHaveBeenCalledTimes(2);
    expect(commit).not.toHaveBeenCalled();

    expect(session.finish()).toBe(420);
    session.finish();
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith(420);
  });

  it("restores transient state on cancellation without committing", () => {
    const restore = vi.fn();
    const commit = vi.fn();
    const session = createAutomationResizeSession({
      startPointer: 0,
      startValue: 280,
      min: 220,
      max: 420,
      onTransient: () => undefined,
      onCommit: commit,
      onCancel: restore
    });

    session.move(40);
    session.cancel();
    session.cancel();
    expect(restore).toHaveBeenCalledOnce();
    expect(commit).not.toHaveBeenCalled();
  });

  it("supports bounded keyboard section and pane resizing", () => {
    expect(automationKeyboardResizeValue({
      key: "ArrowRight",
      value: 280,
      decreaseKey: "ArrowLeft",
      increaseKey: "ArrowRight",
      min: 220,
      max: 420,
      home: 280
    })).toBe(296);
    expect(automationKeyboardResizeValue({
      key: "Home",
      value: 410,
      decreaseKey: "ArrowLeft",
      increaseKey: "ArrowRight",
      min: 220,
      max: 420,
      home: 280
    })).toBe(280);
    expect(automationKeyboardResizeValue({
      key: "End", value: 280, decreaseKey: "ArrowLeft", increaseKey: "ArrowRight",
      min: 220, max: 420, home: 280
    })).toBe(420);
    const split = automationKeyboardSplitRatios([0.5, 0.5], 0, "ArrowRight", "horizontal");
    expect(split?.[0]).toBeCloseTo(0.54);
    expect(split?.[1]).toBeCloseTo(0.46);
    expect(automationKeyboardSplitRatios([0.7, 0.3], 0, "Home", "horizontal")).toEqual([0.5, 0.5]);
    expect(automationKeyboardSplitRatios([0.5, 0.5], 0, "End", "horizontal")).toEqual([0.88, 0.12]);
  });
});
