// The Flow editor answers another view's request to open a node of the graph
// it shows (the Inspector's effective-handler links) by selecting it as its
// outline does, and ignores a request for another graph.
import { createElement } from "react";
import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { requestAutomationGraphNodeFocus } from "../../../graph/node-focus";
import type { FlowEditorProps } from "../../flow-editor-types";
import { WORKED_EXAMPLE, workedExampleGraph, workedExampleNodeId } from "../../../graph/handlers/tests/worked-example-graphs";
import { useFlowEditorController } from "../useFlowEditorController";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function Editor(input: { props: FlowEditorProps }) {
  useFlowEditorController(input.props);
  return null;
}

describe("a request to open a node", () => {
  it("selects the node in the editor showing its graph, and only there", () => {
    const saved = workedExampleGraph(WORKED_EXAMPLE.checkpoint);
    const setSelection = vi.fn();
    const props = {
      activeRef: { current: true },
      editable: true,
      entries: [],
      policy: null,
      taskGraph: saved.flow,
      taskGraphDraft: null,
      nativeNodeDefinitions: [],
      recordings: [],
      selectedNode: null,
      selectedTimeline: null,
      signals: [],
      onSaveGraph: vi.fn(),
      onGraphDraftChange: vi.fn(),
      onDirtyChange: vi.fn(),
      onOpenValidation: vi.fn(),
      onOpenNodeState: vi.fn(),
      onRestoreDraft: vi.fn(),
      onDiscardDraft: vi.fn(),
      onReloadGraph: vi.fn(),
      setSelection
    } satisfies FlowEditorProps;
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(createElement(Editor, { props }));
    });
    const handlerId = workedExampleNodeId(saved, "h1-s1");
    act(() => requestAutomationGraphNodeFocus({ flowId: "another.graph", nodeId: handlerId }));
    expect(setSelection).not.toHaveBeenCalled();
    act(() => requestAutomationGraphNodeFocus({ flowId: saved.flow.flowId, nodeId: handlerId }));
    expect(setSelection).toHaveBeenCalledTimes(1);
    expect(setSelection.mock.calls[0]![0]).toMatchObject({ kind: "editor-node", id: handlerId, flowId: saved.flow.flowId, node: { nodeDefinitionId: "builtin.control.handler" } });
    act(() => renderer.unmount());
    act(() => requestAutomationGraphNodeFocus({ flowId: saved.flow.flowId, nodeId: handlerId }));
    expect(setSelection).toHaveBeenCalledTimes(1);
  });
});
