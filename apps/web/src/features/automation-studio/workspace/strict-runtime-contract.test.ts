import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { defaultAutomationWorkspacePrefs } from "./layout/defaults";
import { normalizeAutomationWorkspacePrefs } from "./layout/persistence";

describe("strict workspace runtime contract", () => {
  it("does not retain freeform window runtime behavior", () => {
    const live = readFileSync(new URL("../AutomationStudioLive.tsx", import.meta.url), "utf8");
    const externalLifecycle = readFileSync(new URL("../live/useAutomationExternalLifecycle.ts", import.meta.url), "utf8");
    const hierarchyUi = readFileSync(new URL("../live/useAutomationHierarchyUiRuntime.ts", import.meta.url), "utf8");
    const preferencesOverlay = readFileSync(new URL("./overlays/PreferencesOverlaySubscriber.tsx", import.meta.url), "utf8");
    const frame = readFileSync(new URL("./components.tsx", import.meta.url), "utf8");
    const shell = readFileSync(new URL("./shell/WorkspaceShell.tsx", import.meta.url), "utf8");
    const paneArea = readFileSync(new URL("./shell/PaneArea.tsx", import.meta.url), "utf8");
    const rightPane = readFileSync(new URL("./shell/RightPaneArea.tsx", import.meta.url), "utf8");
    const timeline = readFileSync(new URL("./shell/TimelineDock.tsx", import.meta.url), "utf8");
    const drawers = readFileSync(new URL("./shell/ResponsiveDrawers.tsx", import.meta.url), "utf8");
    const header = readFileSync(new URL("./shell/WorkspaceHeader.tsx", import.meta.url), "utf8");
    const source = readFileSync(new URL("./shell/view-source.ts", import.meta.url), "utf8");
    const css = readFileSync(new URL("../styles/workspace/06-responsive.css", import.meta.url), "utf8");

    for (const retired of ["automation-window-shell", "startWindowMove", "startWindowResize", "liveWindowGeometries", "pageFullscreenWindowId"]) {
      expect(live).not.toContain(retired);
    }
    expect(frame).not.toContain("automation-window-resize-edge");
    expect(frame).not.toContain("Reset window size");
    expect(paneArea).toContain('data-workspace-region="main"');
    expect(rightPane).toContain('data-workspace-region="inspector"');
    expect(timeline).toContain('data-workspace-region="timeline"');
    expect(header).toContain('aria-haspopup="dialog"');
    expect(preferencesOverlay).toContain('title="Workspace Preferences"');
    expect(hierarchyUi).toContain("Workspace save failed");
    expect(shell).toContain("data-density={shell.density}");
    expect(shell).toContain("data-motion={shell.motion}");
    expect(externalLifecycle).toContain('window.matchMedia("(max-width: 820px)")');
    expect(shell).toContain("{!isNarrowWorkspace ? hierarchy : null}");
    expect(shell).toContain("{!props.narrow ? props.rightPane : null}");
    expect(shell).toContain("{!props.narrow ? props.timeline : null}");
    expect(shell).toContain("<AutomationResponsiveDrawers");
    expect(drawers).toContain('props.panel === "hierarchy"');
    expect(drawers).toContain('props.panel === "inspector"');
    expect(drawers).toContain('props.panel === "timeline"');
    expect(rightPane).toContain('aria-label="Right utilities"');
    expect(shell).toContain('const inspectorLabel = activeRightView?.view.label ?? "Inspector"');
    expect(drawers).toContain("title={props.inspectorTitle}");
    expect(source).toContain("source.subscribe(viewId, listener)");
    expect(source).toContain("source.getRevision(viewId)");
    expect(source).toContain("useSyncExternalStore(subscribe, getRevision, getRevision)");
    expect(css).toContain('.automation-studio-shell[data-narrow="true"]');
    expect(css).toContain(".drawer-panel.automation-preview-sheet");
  });

  it("keeps nested Subflow and folder creation in one typed hierarchy dialog", () => {
    const dialog = readFileSync(new URL("../hierarchy/AutomationHierarchyDialog.tsx", import.meta.url), "utf8");
    const executor = readFileSync(new URL("../hierarchy/create-command-executor.ts", import.meta.url), "utf8");

    expect(dialog).toContain('aria-label="Choose item type"');
    expect(dialog).toContain('label: "Subflow"');
    expect(dialog).toContain('label: "Folder"');
    expect(dialog).toContain("automationHierarchyNodeIsSubflowCategory");
    expect(dialog).toContain("automationHierarchyNodeIsSubflowRoot");
    expect(dialog).toContain('Field label="Location"');
    expect(dialog).toContain('placeholder={transaction.createKind === "subflow" ? "Subflow name"');
    expect(dialog).toContain("automationHierarchyDialogSubmission(transaction)");
    expect(executor).toContain("createSubflow(transaction, subflowParent, dependencies)");
    expect(executor).toContain("createSubflowCategory(transaction, subflowParent, dependencies)");
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

    expect(migrated.layoutVersion).toBe(4);
    expect(migrated.panes.some((pane) => pane.tabs.includes("runtime-debug"))).toBe(true);
    expect(migrated.windows).toEqual([]);
    expect(migrated.activeWindowId).toBe("");
    expect(migrated.maximizedWindowId).toBeNull();
  });
});
