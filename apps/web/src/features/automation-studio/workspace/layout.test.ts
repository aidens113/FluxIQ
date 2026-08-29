import { describe, expect, it } from "vitest";
import type { AutomationWorkspacePrefs } from "./layout/contracts";
import { automationBottomDockMinHeight, defaultAutomationWorkspacePrefs } from "./layout/defaults";
import { closeAutomationWorkspacePaneTab, moveAutomationWorkspacePaneTab, resizeAutomationMainSplitRatios } from "./layout/mutations";
import { normalizeAutomationWorkspacePrefs } from "./layout/persistence";
import { automationWorkspaceRegionForView } from "./layout/regions";

describe("Automation Studio strict workspace layout", () => {
  it("migrates and deduplicates the legacy Flow editor ID while preserving canonical state", () => {
    const prefs = normalizeAutomationWorkspacePrefs({
      ...defaultAutomationWorkspacePrefs(),
      layoutVersion: 3,
      panes: [],
      windows: [{
        id: "legacy-flow-window",
        activeViewId: "policy-primary",
        tabs: ["policy-primary", "flow-nodes"],
        area: "main",
        xPct: 0,
        yPct: 0,
        widthPct: 100,
        heightPct: 100,
        zIndex: 1
      }],
      activeWindowId: "legacy-flow-window",
      activeViewId: "policy-primary",
      viewStates: {
        "policy-primary": { source: "legacy" },
        "flow-nodes": { source: "canonical" }
      }
    }, { hasFlow: true });

    expect(prefs.layoutVersion).toBe(4);
    expect(prefs.panes[0]).toMatchObject({ activeViewId: "flow-nodes", tabs: ["flow-nodes"] });
    expect(prefs.viewStates).toEqual({ "flow-nodes": { source: "canonical" } });
  });
  it("opens reset/default layouts with the normal Flow editor surface", () => {
    const prefs = defaultAutomationWorkspacePrefs();

    expect(prefs.mainLayoutPreset).toBe("single");
    expect(prefs.leftSidebarCollapsed).toBe(false);
    expect(prefs.panes).toEqual([{ id: "pane-main-1", activeViewId: "flow-nodes", tabs: ["flow-nodes"] }]);
    expect(prefs.windows).toEqual([]);
    expect(prefs.layoutVersion).toBe(4);
  });

  it("persists sidebar collapse and clamps sidebar width", () => {
    const prefs = normalizeAutomationWorkspacePrefs({
      ...defaultAutomationWorkspacePrefs(),
      leftSidebarCollapsed: true,
      sidebarWidth: 999
    });
    expect(prefs.leftSidebarCollapsed).toBe(true);
    expect(prefs.sidebarWidth).toBe(420);
  });
  it("keeps legacy one-tab Flow layouts as normal editor layouts", () => {
    const prefs = normalizeAutomationWorkspacePrefs({
      layoutVersion: 2,
      windows: [
        { id: "window-policy", activeViewId: "flow-nodes", tabs: ["flow-nodes"], area: "main", xPct: 0, yPct: 0, widthPct: 100, heightPct: 100, zIndex: 1 }
      ],
      activeWindowId: "window-policy",
      activePaneId: "pane-main-1",
      activeViewId: "flow-nodes",
      maximizedWindowId: null,
      sidebarWidth: 280,
      leftSidebarCollapsed: false,
      inspectorWidth: 320,
      bottomTimelineHeight: 220,
      bottomTimelineCollapsed: true,
      mainLayoutPreset: "single",
      mainSplitRatios: [1],
      panes: [{ id: "pane-main-1", activeViewId: "flow-nodes", tabs: ["flow-nodes"] }],
      rightSidebar: { activeViewId: "global-inspector", tabs: ["global-inspector"], collapsed: false },
      bottomDock: { activeViewId: "recording-action-preview", expanded: false },
      utilityWindowsMigrated: true,
      rightSidebarCollapsed: false,
      viewStates: {},
      density: "comfortable",
      motion: "system"
    });

    expect(prefs.panes).toEqual([{ id: "pane-main-1", activeViewId: "flow-nodes", tabs: ["flow-nodes"] }]);
  });

  it("migrates persisted Runs tabs to canonical Runtime Debug", () => {
    const prefs = normalizeAutomationWorkspacePrefs({
      layoutVersion: 2,
      panes: [{ id: "pane-main-1", activeViewId: "runs-history", tabs: ["flow-nodes", "runs-history"] }],
      rightSidebar: { activeViewId: "global-inspector", tabs: ["global-inspector"], collapsed: false },
      bottomDock: { activeViewId: "recording-action-preview", expanded: false }
    } as AutomationWorkspacePrefs);

    expect(prefs.panes[0]?.activeViewId).toBe("runtime-debug");
    expect(prefs.panes[0]?.tabs).toEqual(["flow-nodes", "runtime-debug"]);
    expect(prefs.panes[0]?.tabs).not.toContain("runs-history");
  });
  it("migrates persisted Config tabs and state to Flow Settings in Flow scope", () => {
    const prefs = normalizeAutomationWorkspacePrefs({
      layoutVersion: 2,
      panes: [{
        id: "pane-main-1",
        activeViewId: "config",
        tabs: ["flow-nodes", "config", "config-default", "flow-settings"]
      }],
      rightSidebar: { activeViewId: "global-inspector", tabs: ["global-inspector"], collapsed: false },
      bottomDock: { activeViewId: "recording-action-preview", expanded: false },
      viewStates: {
        config: { source: "legacy" },
        "flow-settings": { source: "canonical" }
      }
    } as unknown as AutomationWorkspacePrefs, { hasFlow: true });

    expect(prefs.panes[0]?.activeViewId).toBe("flow-settings");
    expect(prefs.panes[0]?.tabs).toEqual(["flow-nodes", "flow-settings"]);
    expect(prefs.viewStates).toEqual({ "flow-settings": { source: "canonical" } });
  });

  it("preserves persisted Config IDs without Flow scope for retired-view recovery", () => {
    const prefs = normalizeAutomationWorkspacePrefs({
      layoutVersion: 2,
      panes: [{
        id: "pane-main-1",
        activeViewId: "config-default",
        tabs: ["flow-nodes", "config", "config-default"]
      }],
      rightSidebar: { activeViewId: "global-inspector", tabs: ["global-inspector"], collapsed: false },
      bottomDock: { activeViewId: "recording-action-preview", expanded: false }
    } as AutomationWorkspacePrefs);

    expect(prefs.panes[0]?.activeViewId).toBe("config-default");
    expect(prefs.panes[0]?.tabs).toEqual(["flow-nodes", "config", "config-default"]);
  });
  it("migrates retired saved review tabs and cache state to Adaptations in Flow scope", () => {
    const prefs = normalizeAutomationWorkspacePrefs({
      layoutVersion: 2,
      panes: [{
        id: "pane-main-1",
        activeViewId: "proposal-workbench",
        tabs: ["flow-nodes", "proposal-workbench", "adaptations"]
      }],
      rightSidebar: { activeViewId: "global-inspector", tabs: ["global-inspector"], collapsed: false },
      bottomDock: { activeViewId: "recording-action-preview", expanded: false },
      viewStates: {
        "proposal-workbench": { source: "legacy" },
        adaptations: { source: "canonical" }
      }
    } as unknown as AutomationWorkspacePrefs, { hasFlow: true });

    expect(prefs.panes[0]?.activeViewId).toBe("adaptations");
    expect(prefs.panes[0]?.tabs).toEqual(["flow-nodes", "adaptations"]);
    expect(prefs.viewStates).toEqual({ adaptations: { source: "canonical" } });
  });

  it("preserves retired saved review IDs without Flow scope for recovery UI", () => {
    const prefs = normalizeAutomationWorkspacePrefs({
      layoutVersion: 2,
      panes: [{
        id: "pane-main-1",
        activeViewId: "proposal-generator",
        tabs: ["flow-nodes", "proposal-generator"]
      }],
      rightSidebar: { activeViewId: "global-inspector", tabs: ["global-inspector"], collapsed: false },
      bottomDock: { activeViewId: "recording-action-preview", expanded: false }
    } as AutomationWorkspacePrefs);

    expect(prefs.panes[0]?.activeViewId).toBe("proposal-generator");
    expect(prefs.panes[0]?.tabs).toContain("proposal-generator");
  });

  it("migrates persisted AI Assistant tabs to Inspector", () => {
    const prefs = normalizeAutomationWorkspacePrefs({
      layoutVersion: 2,
      panes: [{ id: "pane-main-1", activeViewId: "flow-nodes", tabs: ["flow-nodes"] }],
      rightSidebar: { activeViewId: "ai-assistant", tabs: ["ai-assistant"], collapsed: false },
      bottomDock: { activeViewId: "recording-action-preview", expanded: false }
    } as AutomationWorkspacePrefs);

    expect(prefs.rightSidebar.activeViewId).toBe("global-inspector");
    expect(prefs.rightSidebar.tabs).toEqual(["global-inspector"]);
  });
  it("migrates persisted Relationship Web tabs to State View", () => {
    const prefs = normalizeAutomationWorkspacePrefs({
      layoutVersion: 2,
      panes: [{ id: "pane-main-1", activeViewId: "signals-web", tabs: ["flow-nodes", "signals-web"] }],
      rightSidebar: { activeViewId: "global-inspector", tabs: ["global-inspector"], collapsed: false },
      bottomDock: { activeViewId: "recording-action-preview", expanded: false }
    } as AutomationWorkspacePrefs);

    expect(prefs.panes[0]?.activeViewId).toBe("state-explorer");
    expect(prefs.panes[0]?.tabs).toEqual(["flow-nodes", "state-explorer"]);
  });
  it("does not inject Flow workbench tabs into custom multi-tab layouts", () => {
    const prefs = normalizeAutomationWorkspacePrefs({
      layoutVersion: 2,
      panes: [{ id: "pane-main-1", activeViewId: "flow-nodes", tabs: ["flow-nodes", "timeline-recording"] }],
      rightSidebar: { activeViewId: "global-inspector", tabs: ["global-inspector"], collapsed: false },
      bottomDock: { activeViewId: "recording-action-preview", expanded: false }
    } as AutomationWorkspacePrefs);

    expect(prefs.panes[0]?.tabs).toEqual(["flow-nodes", "timeline-recording"]);
  });

  it("classifies fixed workspace regions by view id", () => {
    expect(automationWorkspaceRegionForView("recording-action-preview")).toBe("bottom");
    expect(automationWorkspaceRegionForView("timeline-recording")).toBe("main");
    expect(automationWorkspaceRegionForView("global-inspector")).toBe("right");
    expect(automationWorkspaceRegionForView("problems-view")).toBe("right");
    expect(automationWorkspaceRegionForView("state-explorer")).toBe("main");
    expect(automationWorkspaceRegionForView("proposal-generator")).toBe("main");
  });

  it("normalizes old floating windows into deterministic main panes", () => {
    const prefs = normalizeAutomationWorkspacePrefs({
      windows: [
        { id: "timeline-window", activeViewId: "timeline-recording", tabs: ["timeline-recording"], area: "main", xPct: 0, yPct: 60, widthPct: 100, heightPct: 40, zIndex: 9 },
        { id: "proposal-window", activeViewId: "proposal-workbench", tabs: ["proposal-workbench", "state-explorer"], area: "main", xPct: 40, yPct: 0, widthPct: 60, heightPct: 100, zIndex: 2 },
        { id: "flow-window", activeViewId: "flow-nodes", tabs: ["flow-nodes"], area: "main", xPct: 0, yPct: 0, widthPct: 40, heightPct: 100, zIndex: 1 },
        { id: "inspector-window", activeViewId: "global-inspector", tabs: ["global-inspector"], area: "right", xPct: 0, yPct: 0, widthPct: 100, heightPct: 100, zIndex: 3 }
      ],
      activeWindowId: "proposal-window",
      maximizedWindowId: null,
      sidebarWidth: 300,
      leftSidebarCollapsed: false,
      inspectorWidth: 360,
      utilityWindowsMigrated: true,
      rightSidebarCollapsed: false,
      viewStates: {}
    } as AutomationWorkspacePrefs);

    expect(prefs.layoutVersion).toBe(4);
    expect(prefs.mainLayoutPreset).toBe("three-main-two");
    expect(prefs.panes).toHaveLength(3);
    expect(prefs.panes[0]?.activeViewId).toBe("proposal-workbench");
    expect(prefs.panes.flatMap((pane) => pane.tabs)).toEqual(["proposal-workbench", "state-explorer", "flow-nodes", "timeline-recording"]);
    expect(prefs.panes.flatMap((pane) => pane.tabs)).toContain("timeline-recording");
    expect(prefs.panes.flatMap((pane) => pane.tabs)).not.toContain("global-inspector");
    expect(prefs.rightSidebar.tabs).toContain("global-inspector");
    expect(prefs.bottomDock.expanded).toBe(true);
  });

  it("keeps inspector out of saved strict panes while keeping full timeline in main", () => {
    const prefs = normalizeAutomationWorkspacePrefs({
      layoutVersion: 2,
      windows: [],
      activeWindowId: "",
      activePaneId: "pane-main-1",
      activeViewId: "timeline-recording",
      maximizedWindowId: null,
      sidebarWidth: 280,
      leftSidebarCollapsed: false,
      inspectorWidth: 320,
      bottomTimelineHeight: 999,
      bottomTimelineCollapsed: false,
      mainLayoutPreset: "three-even",
      mainSplitRatios: [10, 10, 10],
      panes: [
        { id: "pane-main-1", activeViewId: "timeline-recording", tabs: ["timeline-recording", "flow-nodes"] },
        { id: "pane-main-2", activeViewId: "global-inspector", tabs: ["global-inspector", "proposal-generator"] }
      ],
      rightSidebar: { activeViewId: "workspace-dock", tabs: ["workspace-dock"], collapsed: true },
      bottomDock: { activeViewId: "recording-action-preview", expanded: true },
      utilityWindowsMigrated: true,
      rightSidebarCollapsed: true,
      viewStates: {},
      density: "comfortable",
      motion: "system"
    });

    expect(prefs.panes.flatMap((pane) => pane.tabs)).toEqual(["timeline-recording", "flow-nodes", "proposal-generator", "flow-nodes"]);
    expect(prefs.rightSidebar.activeViewId).toBe("global-inspector");
    expect(prefs.rightSidebar.tabs).toEqual(["global-inspector"]);
    expect(prefs.bottomTimelineHeight).toBe(420);
    expect(prefs.mainSplitRatios.map((ratio) => Number(ratio.toFixed(2)))).toEqual([0.33, 0.33, 0.33]);
  });

  it("migrates invalid display preferences to safe defaults", () => {
    const prefs = normalizeAutomationWorkspacePrefs({
      ...defaultAutomationWorkspacePrefs(),
      density: "tiny",
      motion: "spin"
    } as unknown as AutomationWorkspacePrefs);

    expect(prefs.density).toBe("comfortable");
    expect(prefs.motion).toBe("system");
  });

  it("preserves supported display preferences", () => {
    const prefs = normalizeAutomationWorkspacePrefs({
      ...defaultAutomationWorkspacePrefs(),
      density: "compact",
      motion: "reduce"
    });

    expect(prefs.density).toBe("compact");
    expect(prefs.motion).toBe("reduce");
  });

  it("allows a compact bottom timeline height", () => {
    const prefs = normalizeAutomationWorkspacePrefs({
      layoutVersion: 2,
      bottomTimelineHeight: 80,
      panes: [{ id: "pane-main-1", activeViewId: "flow-nodes", tabs: ["flow-nodes"] }],
      rightSidebar: { activeViewId: "global-inspector", tabs: ["global-inspector"], collapsed: false },
      bottomDock: { activeViewId: "recording-action-preview", expanded: true }
    } as AutomationWorkspacePrefs);

    expect(prefs.bottomTimelineHeight).toBe(automationBottomDockMinHeight);
  });

  it("resizes adjacent panes without changing the other ratios or total", () => {
    const resized = resizeAutomationMainSplitRatios([0.5, 0.25, 0.25], 1, 0.08);
    expect(resized[0]).toBe(0.5);
    expect(resized[1]).toBeCloseTo(0.33);
    expect(resized[2]).toBeCloseTo(0.17);
    expect(resized.reduce((sum, ratio) => sum + ratio, 0)).toBeCloseTo(1);
  });

  it("keeps keyboard-sized pane pairs above their minimum", () => {
    expect(resizeAutomationMainSplitRatios([0.5, 0.25, 0.25], 1, 1)).toEqual([0.5, 0.38, 0.12]);
    expect(resizeAutomationMainSplitRatios([1], 0, 0.1)).toEqual([1]);
  });

  it("closes an empty main pane and switches to the smaller layout", () => {
    const result = closeAutomationWorkspacePaneTab(
      [
        { id: "pane-main-1", activeViewId: "flow-nodes", tabs: ["flow-nodes"] },
        { id: "pane-main-2", activeViewId: "state-explorer", tabs: ["state-explorer"] }
      ],
      "pane-main-2",
      "state-explorer",
      "pane-main-2",
      "two-main-side"
    );

    expect(result.panes).toEqual([{ id: "pane-main-1", activeViewId: "flow-nodes", tabs: ["flow-nodes"] }]);
    expect(result.activePaneId).toBe("pane-main-1");
    expect(result.activeViewId).toBe("flow-nodes");
    expect(result.mainLayoutPreset).toBe("single");
    expect(result.mainSplitRatios).toEqual([1]);
  });

  it("moves a tab between main panes and closes the emptied source pane", () => {
    const result = moveAutomationWorkspacePaneTab(
      [
        { id: "pane-main-1", activeViewId: "flow-nodes", tabs: ["flow-nodes"] },
        { id: "pane-main-2", activeViewId: "state-explorer", tabs: ["state-explorer"] }
      ],
      "pane-main-2",
      "pane-main-1",
      "state-explorer",
      "two-main-side"
    );

    expect(result?.panes).toEqual([{ id: "pane-main-1", activeViewId: "state-explorer", tabs: ["flow-nodes", "state-explorer"] }]);
    expect(result?.activePaneId).toBe("pane-main-1");
    expect(result?.activeViewId).toBe("state-explorer");
    expect(result?.mainLayoutPreset).toBe("single");
  });

  it("reorders tabs within the same main pane", () => {
    const result = moveAutomationWorkspacePaneTab(
      [{ id: "pane-main-1", activeViewId: "flow-nodes", tabs: ["flow-nodes", "state-explorer", "timeline-recording"] }],
      "pane-main-1",
      "pane-main-1",
      "timeline-recording",
      "single",
      "state-explorer",
      "before"
    );

    expect(result?.panes).toEqual([{ id: "pane-main-1", activeViewId: "timeline-recording", tabs: ["flow-nodes", "timeline-recording", "state-explorer"] }]);
    expect(result?.activePaneId).toBe("pane-main-1");
    expect(result?.activeViewId).toBe("timeline-recording");
  });

  it("inserts moved tabs next to the hovered target tab", () => {
    const result = moveAutomationWorkspacePaneTab(
      [
        { id: "pane-main-1", activeViewId: "flow-nodes", tabs: ["flow-nodes", "timeline-recording"] },
        { id: "pane-main-2", activeViewId: "state-explorer", tabs: ["state-explorer", "proposal-workbench"] }
      ],
      "pane-main-1",
      "pane-main-2",
      "timeline-recording",
      "two-main-side",
      "state-explorer",
      "after"
    );

    expect(result?.panes).toEqual([
      { id: "pane-main-1", activeViewId: "flow-nodes", tabs: ["flow-nodes"] },
      { id: "pane-main-2", activeViewId: "timeline-recording", tabs: ["state-explorer", "timeline-recording", "proposal-workbench"] }
    ]);
    expect(result?.mainLayoutPreset).toBe("two-main-side");
  });
});
