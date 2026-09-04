import { describe, expect, it } from "vitest";
import { defaultAutomationWorkspacePrefs } from "../workspace/layout";
import { automationStudioObjectViewInstanceId, automationStudioViewId } from "../views/view-registry";
import {
  automationActiveWorkspaceSelection,
  bindAutomationActiveFlowView,
  bindAutomationUnboundFlowViews
} from "./active-workspace-selection";
import { automationRestoredWorkspaceSelection } from "./useAutomationProjectRuntime";

const editorSelection = {
  kind: "editor-node" as const,
  id: "node.output",
  flowId: "flow.checkout.primary.graph",
  node: {
    label: "Output",
    nodeType: "custom",
    family: "output",
    description: "Output",
    inputs: [],
    outputs: [],
    parameters: [],
    parameterValues: {}
  }
};

describe("automationRestoredWorkspaceSelection", () => {
  it("restores the Flow editor selection for an active Flow-scoped window", () => {
    const prefs = defaultAutomationWorkspacePrefs();
    prefs.activeViewId = automationStudioViewId.router;
    prefs.panes[0] = { ...prefs.panes[0]!, activeViewId: automationStudioViewId.router, tabs: [automationStudioViewId.router] };
    prefs.viewStates = {
      [automationStudioViewId.flowEditor]: {
        lastOpenFlowId: editorSelection.flowId,
        selection: editorSelection
      }
    };

    expect(automationRestoredWorkspaceSelection(prefs)).toEqual(editorSelection);
  });

  it("falls back to the last open Flow but does not leak it into project-scoped windows", () => {
    const prefs = defaultAutomationWorkspacePrefs();
    prefs.viewStates = { [automationStudioViewId.flowEditor]: { lastOpenFlowId: "flow.checkout" } };
    prefs.activeViewId = automationStudioViewId.settings;
    prefs.panes[0] = { ...prefs.panes[0]!, activeViewId: automationStudioViewId.settings, tabs: [automationStudioViewId.settings] };
    expect(automationRestoredWorkspaceSelection(prefs)).toEqual({ kind: "flow", id: "flow.checkout" });

    prefs.activeViewId = automationStudioViewId.clients;
    prefs.panes[0] = { ...prefs.panes[0]!, activeViewId: automationStudioViewId.clients, tabs: [automationStudioViewId.clients] };
    expect(automationRestoredWorkspaceSelection(prefs)).toBeNull();
  });

  it("derives the highlighted Flow from the active pane when live selection is unrelated", () => {
    const prefs = defaultAutomationWorkspacePrefs();
    prefs.activeViewId = automationStudioViewId.router;
    prefs.panes[0] = { ...prefs.panes[0]!, activeViewId: automationStudioViewId.router, tabs: [automationStudioViewId.router] };
    prefs.viewStates = {
      [automationStudioViewId.flowEditor]: {
        lastOpenFlowId: "flow.checkout",
        selection: { kind: "flow", id: "flow.checkout" }
      }
    };

    expect(automationActiveWorkspaceSelection(prefs, { kind: "recording", id: "recording.other" })).toEqual({
      kind: "flow",
      id: "flow.checkout"
    });
  });

  it("derives the restored Flow directly from an object-qualified active view", () => {
    const prefs = defaultAutomationWorkspacePrefs();
    const instructionsId = automationStudioObjectViewInstanceId(automationStudioViewId.instructions, "flow.child");
    prefs.activeViewId = instructionsId;
    prefs.panes[0] = { ...prefs.panes[0]!, activeViewId: instructionsId, tabs: [instructionsId] };
    prefs.viewStates = {};

    expect(automationActiveWorkspaceSelection(prefs, { kind: "flow", id: "flow.parent" })).toEqual({
      kind: "flow",
      id: "flow.child"
    });
  });

  it("keeps an existing Router tab bound to its top-level Flow after Nodes switches to a subflow", () => {
    const prefs = defaultAutomationWorkspacePrefs();
    prefs.activeViewId = automationStudioViewId.router;
    prefs.panes[0] = {
      ...prefs.panes[0]!,
      activeViewId: automationStudioViewId.router,
      tabs: [automationStudioViewId.flowEditor, automationStudioViewId.router]
    };
    prefs.viewStates = {
      [automationStudioViewId.flowEditor]: {
        flowId: "flow.child.graph",
        lastOpenFlowId: "flow.child.graph",
        selection: editorSelection
      },
      [automationStudioViewId.router]: {
        flowId: "flow.checkout",
        selection: { kind: "flow", id: "flow.checkout" }
      }
    };

    expect(automationActiveWorkspaceSelection(prefs, editorSelection)).toEqual({ kind: "flow", id: "flow.checkout" });
  });

  it("binds only the active Flow tab and migrates legacy unbound tabs", () => {
    const prefs = defaultAutomationWorkspacePrefs();
    prefs.panes[0] = {
      ...prefs.panes[0]!,
      activeViewId: automationStudioViewId.router,
      tabs: [automationStudioViewId.flowEditor, automationStudioViewId.router, automationStudioViewId.settings]
    };
    prefs.activeViewId = automationStudioViewId.router;
    prefs.viewStates = {
      [automationStudioViewId.flowEditor]: {
        lastOpenFlowId: "flow.checkout",
        selection: { kind: "flow", id: "flow.checkout" }
      }
    };

    const migrated = bindAutomationUnboundFlowViews(prefs);
    expect(migrated.viewStates[automationStudioViewId.router]?.flowId).toBe("flow.checkout");
    expect(migrated.viewStates[automationStudioViewId.settings]?.flowId).toBe("flow.checkout");

    const rebound = bindAutomationActiveFlowView(migrated, { kind: "flow", id: "flow.other" });
    expect(rebound.viewStates[automationStudioViewId.router]?.flowId).toBe("flow.other");
    expect(rebound.viewStates[automationStudioViewId.flowEditor]?.flowId).toBe("flow.checkout");
    expect(rebound.viewStates[automationStudioViewId.settings]?.flowId).toBe("flow.checkout");
  });
});
