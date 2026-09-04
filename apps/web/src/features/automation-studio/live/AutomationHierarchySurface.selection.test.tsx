import { createElement } from "react";
import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { createAutomationHierarchyUiCoordinator } from "../hierarchy/ui-coordinator";
import { createAutomationWorkspaceCommandPort } from "../workspace/commands/port";
import { defaultAutomationWorkspacePrefs } from "../workspace/layout";
import { createAutomationWorkspaceRenderStore } from "../workspace/render-store";
import { automationStudioViewId } from "../views/view-registry";
import { AutomationHierarchySurface } from "./AutomationHierarchySurface";

describe("AutomationHierarchySurface active tab context", () => {
  it("highlights and restores the Flow bound to the active tab", async () => {
    const prefs = defaultAutomationWorkspacePrefs();
    prefs.activeViewId = automationStudioViewId.router;
    prefs.panes[0] = {
      ...prefs.panes[0]!,
      activeViewId: automationStudioViewId.router,
      tabs: [automationStudioViewId.flowEditor, automationStudioViewId.router]
    };
    prefs.viewStates = {
      [automationStudioViewId.flowEditor]: { flowId: "flow.child.graph", selection: { kind: "flow", id: "flow.child.graph" } },
      [automationStudioViewId.router]: { flowId: "flow.parent", selection: { kind: "flow", id: "flow.parent" } }
    };
    const store = createAutomationWorkspaceRenderStore(prefs);
    const setSelection = vi.fn();
    let renderer: ReturnType<typeof create>;

    await act(async () => {
      renderer = create(createElement(AutomationHierarchySurface, {
        coordinator: createAutomationHierarchyUiCoordinator(),
        nodes: [
          { id: "flow-parent", label: "Parent", kind: "flow", category: "flow", parentId: null, sourceId: "flow.parent", flowId: "flow.parent", metadata: { hierarchyContainer: true } },
          { id: "flow-parent-router", label: "Router", kind: "flow-object", category: "flow", parentId: "flow-parent", sourceId: "flow.parent", flowId: "flow.parent", viewId: automationStudioViewId.router }
        ],
        onCloseProject: vi.fn(),
        openSubflow: vi.fn(),
        openView: vi.fn(),
        port: createAutomationWorkspaceCommandPort(store),
        projectName: "Project",
        recordingPrimaryKind: null,
        requestAction: vi.fn(),
        selection: { kind: "flow", id: "flow.child.graph" },
        setRecordingPrimaryKind: vi.fn(),
        setSelection,
        store
      }));
    });

    const routerRow = renderer!.root.find((node) => node.props.role === "treeitem" && node.props["aria-label"] === "Router");
    expect(routerRow.findByType("button").props.className).toContain("selected");
    expect(setSelection).toHaveBeenCalledWith({ kind: "flow", id: "flow.parent" });
  });
});
