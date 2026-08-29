import { describe, expect, it, vi } from "vitest";
import { defaultAutomationWorkspacePrefs } from "../layout/defaults";
import { createAutomationWorkspaceRenderStore } from "../render-store";
import { createAutomationWorkspaceCommandPort } from "./port";
import {
  automationKeyboardResizeValue,
  automationKeyboardSplitRatios,
  createAutomationResizeSession
} from "./resize";
import { createAutomationWarmViewRegistry } from "./warm-activation";
import {
  automationWorkspaceMaxMainPanes,
  createAutomationWorkspaceCommands
} from "./workspace-commands";

describe("Phase 8 workspace commands", () => {
  it("keeps warm activity identity local to a pane and resets it between projects", () => {
    const warm = createAutomationWarmViewRegistry({ projectKey: "project-a" });
    const activated = vi.fn();
    const unsubscribe = warm.subscribe("pane-1", activated);
    const first = warm.activity("pane-1", "flow-nodes");
    const same = warm.activity("pane-1", "flow-nodes");
    const second = warm.activity("pane-1", "runtime-debug");

    expect(same).toBe(first);
    expect(warm.activate("main", "pane-1", "flow-nodes")).toBe(false);

    warm.markWarm("pane-1", "flow-nodes");
    first.current = false;
    second.current = true;
    expect(warm.activate("main", "pane-1", "flow-nodes")).toBe(true);
    expect(first.current).toBe(true);
    expect(second.current).toBe(false);
    expect(activated).toHaveBeenCalledWith("flow-nodes");

    unsubscribe();
    warm.reset("project-b");
    expect(warm.activity("pane-1", "flow-nodes")).not.toBe(first);
    expect(warm.isWarm("pane-1", "flow-nodes")).toBe(false);
    expect(warm.activate("main", "pane-1", "flow-nodes")).toBe(false);
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

  it("reports persistent commits through the command port without persisting preview activation", () => {
    const onCommit = vi.fn();
    const store = createAutomationWorkspaceRenderStore(defaultAutomationWorkspacePrefs());
    const port = createAutomationWorkspaceCommandPort(store, { onCommit });
    const commands = createAutomationWorkspaceCommands({
      port,
      warm: createAutomationWarmViewRegistry({ projectKey: "p" })
    });

    expect(commands.openView("runtime-debug")).toBe(true);
    expect(onCommit).toHaveBeenLastCalledWith(store.getPrefs(), { persist: false, scope: "workspace" });

    expect(commands.applyLayoutPreset("two-main-side")).toBe(true);
    expect(onCommit).toHaveBeenLastCalledWith(store.getPrefs(), { persist: true, scope: "workspace" });
  });

  it("publishes typed region activation even when a narrow utility is already selected", () => {
    const activated = vi.fn();
    const store = createAutomationWorkspaceRenderStore(defaultAutomationWorkspacePrefs());
    const commands = createAutomationWorkspaceCommands({
      port: createAutomationWorkspaceCommandPort(store),
      warm: createAutomationWarmViewRegistry({ projectKey: "p" }),
      onRegionActivated: activated
    });

    expect(commands.openView("global-inspector")).toBe(false);
    expect(commands.openView("recording-action-preview")).toBe(true);
    expect(activated).toHaveBeenNthCalledWith(1, {
      region: "right",
      paneId: "right-sidebar",
      viewId: "global-inspector"
    });
    expect(activated).toHaveBeenNthCalledWith(2, {
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

    expect(commands.openView("flow-instructions", "new-window")).toBe(false);
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
    const split = automationKeyboardSplitRatios([0.5, 0.5], 0, "ArrowRight", "horizontal");
    expect(split?.[0]).toBeCloseTo(0.54);
    expect(split?.[1]).toBeCloseTo(0.46);
    expect(automationKeyboardSplitRatios([0.7, 0.3], 0, "Home", "horizontal")).toEqual([0.5, 0.5]);
  });
});
