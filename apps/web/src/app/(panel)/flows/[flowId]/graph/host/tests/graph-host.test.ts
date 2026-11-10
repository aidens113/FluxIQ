import { describe, expect, it } from "vitest";
import type { AutomationSelection } from "../../../../../../../features/automation-studio/shared/selection-contracts";
import { graphInspectorContext } from "../inspector-context";
import { selectedEditorNode } from "../selected-node";

const picked: AutomationSelection = {
  kind: "editor-node",
  id: "node.open",
  flowId: "flow.one",
  node: {
    label: "Open the page",
    nodeType: "action",
    family: "retry",
    description: "Opens the start page",
    inputs: [],
    outputs: [],
    parameters: [],
    parameterValues: { url: "https://example.invalid" },
    actionTypes: ["navigate"]
  }
};

describe("the step the graph and its details share", () => {
  it("is the picked graph step, with its values, in the shape the canvas reads", () => {
    expect(selectedEditorNode(picked)).toEqual({
      id: "node.open",
      ...picked.node,
      actions: [{ actionType: "navigate" }],
      recovery: { strategy: "retry" }
    });
  });

  it("is no step when nothing, or something other than a graph step, is picked", () => {
    expect(selectedEditorNode(null)).toBeNull();
    expect(selectedEditorNode({ kind: "flow", id: "flow.one" })).toBeNull();
  });
});

describe("what the step details read", () => {
  it("is nothing while nothing is picked", () => {
    expect(graphInspectorContext({ selection: null, flow: {}, node: null, definitions: [] })).toBeNull();
  });

  it("carries the picked step, its Flow, and offers the Flow's own references", () => {
    const flow = { flowId: "flow.one", name: "One", nodes: [], edges: [] };
    const node = selectedEditorNode(picked);
    const context = graphInspectorContext({ selection: picked, flow, node, definitions: [] });
    expect(context).toMatchObject({ selection: picked, flow, node, policy: null, recording: null, statePanel: null, timelineEntries: [] });
    expect(context?.flowDependencies).toEqual({ dependencies: 0, usedBy: 0, availableUpgrades: 0 });
    expect(context?.referenceOptions).toBeTypeOf("object");
  });

  it("offers no references for a pick that is not a graph step", () => {
    const context = graphInspectorContext({ selection: { kind: "flow", id: "flow.one" }, flow: null, node: null, definitions: [] });
    expect(context?.referenceOptions).toEqual({});
  });
});
