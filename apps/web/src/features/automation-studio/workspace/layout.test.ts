import { describe, expect, it } from "vitest";
import { automationBottomDockMinHeight, automationWorkspaceRegionForView, normalizeAutomationWorkspacePrefs, type AutomationWorkspacePrefs } from "./layout";

describe("Automation Studio strict workspace layout", () => {
  it("classifies fixed workspace regions by view id", () => {
    expect(automationWorkspaceRegionForView("recording-action-preview")).toBe("bottom");
    expect(automationWorkspaceRegionForView("timeline-recording")).toBe("main");
    expect(automationWorkspaceRegionForView("global-inspector")).toBe("right");
    expect(automationWorkspaceRegionForView("ai-assistant")).toBe("right");
    expect(automationWorkspaceRegionForView("state-explorer")).toBe("main");
    expect(automationWorkspaceRegionForView("proposal-generator")).toBe("main");
  });

  it("normalizes old floating windows into deterministic main panes", () => {
    const prefs = normalizeAutomationWorkspacePrefs({
      windows: [
        { id: "timeline-window", activeViewId: "timeline-recording", tabs: ["timeline-recording"], area: "main", xPct: 0, yPct: 60, widthPct: 100, heightPct: 40, zIndex: 9 },
        { id: "proposal-window", activeViewId: "proposal-workbench", tabs: ["proposal-workbench", "state-explorer"], area: "main", xPct: 40, yPct: 0, widthPct: 60, heightPct: 100, zIndex: 2 },
        { id: "flow-window", activeViewId: "policy-primary", tabs: ["policy-primary"], area: "main", xPct: 0, yPct: 0, widthPct: 40, heightPct: 100, zIndex: 1 },
        { id: "inspector-window", activeViewId: "global-inspector", tabs: ["global-inspector"], area: "right", xPct: 0, yPct: 0, widthPct: 100, heightPct: 100, zIndex: 3 }
      ],
      activeWindowId: "proposal-window",
      maximizedWindowId: null,
      sidebarWidth: 300,
      inspectorWidth: 360,
      utilityWindowsMigrated: true,
      rightSidebarCollapsed: false,
      viewStates: {}
    } as AutomationWorkspacePrefs);

    expect(prefs.layoutVersion).toBe(2);
    expect(prefs.mainLayoutPreset).toBe("three-main-two");
    expect(prefs.panes).toHaveLength(3);
    expect(prefs.panes[0]?.activeViewId).toBe("proposal-workbench");
    expect(prefs.panes.flatMap((pane) => pane.tabs)).toEqual(["proposal-workbench", "state-explorer", "policy-primary", "timeline-recording"]);
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
      inspectorWidth: 320,
      bottomTimelineHeight: 999,
      bottomTimelineCollapsed: false,
      mainLayoutPreset: "three-even",
      mainSplitRatios: [10, 10, 10],
      panes: [
        { id: "pane-main-1", activeViewId: "timeline-recording", tabs: ["timeline-recording", "policy-primary"] },
        { id: "pane-main-2", activeViewId: "global-inspector", tabs: ["global-inspector", "proposal-generator"] }
      ],
      rightSidebar: { activeViewId: "workspace-dock", tabs: ["workspace-dock"], collapsed: true },
      bottomDock: { activeViewId: "recording-action-preview", expanded: true },
      utilityWindowsMigrated: true,
      rightSidebarCollapsed: true,
      viewStates: {}
    });

    expect(prefs.panes.flatMap((pane) => pane.tabs)).toEqual(["timeline-recording", "policy-primary", "proposal-generator", "policy-primary"]);
    expect(prefs.rightSidebar.activeViewId).toBe("workspace-dock");
    expect(prefs.rightSidebar.tabs).toEqual(["workspace-dock", "global-inspector"]);
    expect(prefs.bottomTimelineHeight).toBe(420);
    expect(prefs.mainSplitRatios.map((ratio) => Number(ratio.toFixed(2)))).toEqual([0.33, 0.33, 0.33]);
  });

  it("allows a compact bottom timeline height", () => {
    const prefs = normalizeAutomationWorkspacePrefs({
      layoutVersion: 2,
      bottomTimelineHeight: 80,
      panes: [{ id: "pane-main-1", activeViewId: "policy-primary", tabs: ["policy-primary"] }],
      rightSidebar: { activeViewId: "global-inspector", tabs: ["global-inspector"], collapsed: false },
      bottomDock: { activeViewId: "recording-action-preview", expanded: true }
    } as AutomationWorkspacePrefs);

    expect(prefs.bottomTimelineHeight).toBe(automationBottomDockMinHeight);
  });
});
