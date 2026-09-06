import { describe, expect, it } from "vitest";
import { defaultAutomationWorkspacePrefs } from "../workspace/layout";
import { automationStudioObjectViewInstanceId, automationStudioViewId } from "../views/view-registry";
import { recoverParentBoundFlowEditorViews } from "./flow-editor-view-recovery";

describe("parent-bound Nodes view recovery", () => {
  it("replaces a restored parent Nodes tab with its Subflows view", () => {
    const prefs = defaultAutomationWorkspacePrefs();
    const editorId = automationStudioObjectViewInstanceId(automationStudioViewId.flowEditor, "flow.parent");
    prefs.panes[0] = { ...prefs.panes[0]!, activeViewId: editorId, tabs: [editorId] };
    prefs.activeViewId = editorId;
    prefs.viewStates = { [editorId]: { flowId: "flow.parent", lastOpenFlowId: "flow.parent" } };

    const result = recoverParentBoundFlowEditorViews(prefs, [{
      source: "canonical",
      flow: { flowId: "flow.parent", metadata: { flowRepresentationKind: "orchestration" } }
    }]);
    const replacementId = automationStudioObjectViewInstanceId(automationStudioViewId.subflows, "flow.parent");

    expect(result.recoveredFlowIds).toEqual(["flow.parent"]);
    expect(result.prefs.panes[0]).toMatchObject({ activeViewId: replacementId, tabs: [replacementId] });
    expect(result.prefs.viewStates[editorId]).toBeUndefined();
    expect(result.prefs.viewStates[replacementId]).toMatchObject({
      flowId: "flow.parent",
      selection: { kind: "flow", id: "flow.parent" }
    });
  });

  it("preserves a Nodes tab bound to a valid Subflow graph", () => {
    const prefs = defaultAutomationWorkspacePrefs();
    const editorId = automationStudioObjectViewInstanceId(automationStudioViewId.flowEditor, "flow.child.graph");
    prefs.panes[0] = { ...prefs.panes[0]!, activeViewId: editorId, tabs: [editorId] };
    prefs.viewStates = { [editorId]: { flowId: "flow.child.graph" } };
    const result = recoverParentBoundFlowEditorViews(prefs, [{ flow: {
      flowId: "flow.child.graph",
      metadata: {
        flowRepresentationVersion: 1,
        flowRepresentationKind: "subflow_graph",
        subflowGraph: true,
        parentFlowId: "flow.parent",
        parentSubflowId: "subflow.child"
      }
    } }]);
    expect(result).toEqual({ prefs, recoveredFlowIds: [] });
  });
});
