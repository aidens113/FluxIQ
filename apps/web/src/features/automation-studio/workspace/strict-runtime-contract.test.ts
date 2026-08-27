import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { defaultAutomationWorkspacePrefs, normalizeAutomationWorkspacePrefs } from "./layout";

describe("strict workspace runtime contract", () => {
  it("does not retain freeform window runtime behavior", () => {
    const live = readFileSync(new URL("../AutomationStudioLive.tsx", import.meta.url), "utf8");
    const frame = readFileSync(new URL("./components.tsx", import.meta.url), "utf8");
    const controllers = readFileSync(new URL("../controllers/useAutomationStudioControllers.ts", import.meta.url), "utf8");
    const css = readFileSync(new URL("../../../app/globals.css", import.meta.url), "utf8");

    for (const retired of ["automation-window-shell", "startWindowMove", "startWindowResize", "liveWindowGeometries", "pageFullscreenWindowId"]) {
      expect(live).not.toContain(retired);
      expect(controllers).not.toContain(retired);
    }
    expect(frame).not.toContain("automation-window-resize-edge");
    expect(frame).not.toContain("Reset window size");
    expect(live).toContain('data-workspace-region="main"');
    expect(live).toContain('data-workspace-region="inspector"');
    expect(live).toContain('data-workspace-region="timeline"');
    expect(live).toContain('aria-haspopup="dialog"');
    expect(live).toContain('title="Workspace Preferences"');
    expect(live).toContain('Workspace save failed');
    expect(live).toContain('data-density={workspacePrefs.density}');
    expect(live).toContain('data-motion={workspacePrefs.motion}');
    expect(live).toContain('window.matchMedia("(max-width: 820px)")');
    expect(live).toContain('const panes = isNarrowWorkspace && activeNarrowPane ? [activeNarrowPane] : configuredPanes');
    expect(live).toContain('narrowWorkspacePanel === "hierarchy" ? <Drawer');
    expect(live).toContain('narrowWorkspacePanel === "inspector" ? <Drawer');
    expect(live).toContain('narrowWorkspacePanel === "timeline" ? <Drawer');
    expect(live).toContain('!isNarrowWorkspace ? renderWorkspaceArea("right"');
    expect(live).toContain('!isNarrowWorkspace ? renderBottomTimelineDock()');
    expect(live).toContain('aria-label="Right utilities"');
    expect(live).toContain('const narrowRightUtilityLabel = activeRightUtility ? viewTitle(activeRightUtility) : "Inspector"');
    expect(live).toContain('title={narrowRightUtilityLabel}');
    expect(live).toContain('current === "inspector" ? null : "inspector"');
    expect(live).toContain('if (isNarrowWorkspace) setNarrowWorkspacePanel("inspector")');
    expect(css).toContain('.automation-studio-shell[data-narrow="true"]');
    expect(css).toContain('.drawer-panel.automation-preview-sheet');
  });

  it("keeps nested Subflow and folder creation in one hierarchy dialog", () => {
    const live = readFileSync(new URL("../AutomationStudioLive.tsx", import.meta.url), "utf8");
    expect(live).toContain('aria-label="Choose item type"');
    expect(live).toContain('label: "Subflow"');
    expect(live).toContain('label: "Folder"');
    expect(live).toContain('hierarchySubflowCategoryParent');
    expect(live).toContain('createSubflowCategoryFolder');
    expect(live).toContain('createFlowSubflowFromHierarchy');
    expect(live).toContain('Field label="Location"');
    expect(live).toContain('placeholder={hierarchyKind === "subflow" ? "Subflow name"');
  });
  it("migrates legacy geometry into strict panes and then discards it", () => {
    const legacy = {
      ...defaultAutomationWorkspacePrefs(),
      layoutVersion: 2 as const,
      panes: undefined as never,
      windows: [
        { id: "legacy", activeViewId: "runtime-debug", tabs: ["runtime-debug"], area: "main" as const, xPct: 10, yPct: 10, widthPct: 70, heightPct: 70, zIndex: 4 }
      ],
      activeWindowId: "legacy"
    };
    const migrated = normalizeAutomationWorkspacePrefs(legacy);

    expect(migrated.layoutVersion).toBe(3);
    expect(migrated.panes.some((pane) => pane.tabs.includes("runtime-debug"))).toBe(true);
    expect(migrated.windows).toEqual([]);
    expect(migrated.activeWindowId).toBe("");
    expect(migrated.maximizedWindowId).toBeNull();
  });
});