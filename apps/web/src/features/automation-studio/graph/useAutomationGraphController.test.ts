import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveAutomationGraphUpdate } from "./useAutomationGraphController";
import { flowEdgeChangesAreDurable, flowNodeChangesAreDurable } from "../flow-editor/graph-interactions";
function flowEditorSource(): string {
  return [
    "../flow-editor/useFlowEditorController.ts",
    "../flow-editor/useFlowEditorGraphDocument.ts",
    "../flow-editor/useFlowEditorCanvasInteractions.ts",
    "../flow-editor/FlowGraphCanvas.tsx"
  ].map((path) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n")).join("\n");
}

describe("Automation graph controller", () => {
  it("resolves direct and functional document updates", () => {
    expect(resolveAutomationGraphUpdate([1], [2, 3])).toEqual([2, 3]);
    expect(resolveAutomationGraphUpdate([1], (current) => [...current, 2])).toEqual([1, 2]);
  });

  it("owns canonical Flow Canvas node and edge state", () => {
    const source = flowEditorSource();
    expect(source).toContain("useAutomationGraphController<AutomationFlowNodeData>");
    expect(source).toContain("replaceFlowGraph({ nodes: nextNodes, edges: nextEdges })");
    expect(source).not.toContain("const [flowNodes, setFlowNodes] = useState");
    expect(source).not.toContain("const [flowEdges, setFlowEdges] = useState");
  });

  it("keeps scalable graph ownership out of AutomationStudioLive", () => {
    const rootSource = readFileSync(new URL("../AutomationStudioLive.tsx", import.meta.url), "utf8");
    const graphRuntimeSource = readFileSync(new URL("../live/useAutomationGraphRuntime.ts", import.meta.url), "utf8");
    expect(graphRuntimeSource).toContain("automationGraphDraftIdentity(options.selectedTaskGraph)");
    expect(rootSource).not.toContain("automationGraphDraftIdentity");
    expect(rootSource).not.toContain("function taskGraphDraftKey");
    expect(rootSource).not.toContain("stableStringHash(shape)");
  });

  it("keeps graph render caps and avoids full graph dirty serialization on every render", () => {
    const controllerSource = readFileSync(new URL("./useAutomationGraphController.ts", import.meta.url), "utf8");
    const editorSource = flowEditorSource();
    expect(controllerSource).not.toContain("Number.MAX_SAFE_INTEGER");
    expect(controllerSource).toContain("nodesRef.current = document.nodes");
    expect(controllerSource).toContain("edgesRef.current = document.edges");
    expect(controllerSource).toContain("setNodeState(visible.nodes)");
    expect(controllerSource).toContain("setTransientNodes");
    expect(controllerSource).toContain("reconcileVisibleGraphEntities");
    expect(controllerSource).not.toContain("applyGraphDocument({ nodes: nextNodes, edges: edgesRef.current }, false)");
    expect(controllerSource).toContain("commitCheckpoint");
    expect(controllerSource).toContain("scheduleAutomationGraphIdleTask");
    expect(controllerSource).not.toContain("queueMicrotask(() => {");
    expect(editorSource).toContain("markFlowGraphDirty(true)");
    expect(editorSource).toContain("flowNodeChangesAreDurable");
    expect(editorSource).toContain("flowEdgeChangesAreDurable");
    expect(editorSource).toContain("setTransientFlowNodes");
    expect(editorSource).toContain("setTransientFlowEdges");
    expect(editorSource).not.toContain("graphSignature(flowNodes, flowEdges) !== savedGraphSignatureRef.current");
  });

  it("classifies selection and active drag changes as transient graph work", () => {
    expect(flowNodeChangesAreDurable([{ type: "select", id: "node.a", selected: true } as any], false)).toBe(false);
    expect(flowNodeChangesAreDurable([{ type: "dimensions", id: "node.a", dimensions: { width: 320, height: 180 } } as any], false)).toBe(false);
    expect(flowNodeChangesAreDurable([{ type: "position", id: "node.a", position: { x: 20, y: 10 } } as any], true)).toBe(false);
    expect(flowNodeChangesAreDurable([{ type: "position", id: "node.a", position: { x: 20, y: 10 } } as any], false)).toBe(true);
    expect(flowEdgeChangesAreDurable([{ type: "select", id: "edge.a", selected: true } as any])).toBe(false);
    expect(flowEdgeChangesAreDurable([{ type: "remove", id: "edge.a" } as any])).toBe(true);
  });

  it("routes selection-only editor changes through transient setters without draft publishing", () => {
    const editorSource = flowEditorSource();
    const nodeChangeStart = editorSource.indexOf("const handleFlowNodesChange = useCallback");
    const connectStart = editorSource.indexOf("const connectFlowNodes", nodeChangeStart);
    const nodeChangeSource = editorSource.slice(nodeChangeStart, connectStart);
    const nodeClickStart = editorSource.indexOf("const selectClickedFlowNode:");
    const viewportStart = editorSource.indexOf("const previewFlowViewport", nodeClickStart);
    const nodeClickSource = editorSource.slice(nodeClickStart, viewportStart);

    expect(nodeChangeSource).toContain("flowNodeChangesAreDurable(changes, false)");
    expect(nodeChangeSource).toContain("if (durableChange) currentGraph.checkpointFlowGraph()");
    expect(nodeChangeSource).toContain("if (durableChange) currentGraph.setFlowNodes(nextNodes)");
    expect(nodeChangeSource).toContain("else currentGraph.setTransientFlowNodes(nextNodes)");
    expect(nodeClickSource).not.toContain("publishFlowGraphDraft");
    expect(nodeClickSource).not.toContain("checkpointFlowGraph");
  });

  it("keeps full graph validation and draft publishing out of immediate selection/drag render paths", () => {
    const editorSource = flowEditorSource();
    const graphDocumentSource = readFileSync(new URL("../flow-editor/useFlowEditorGraphDocument.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
    const validationEffectStart = graphDocumentSource.indexOf("useEffect(() => {\n    let cancelled = false;");
    const validationEffectEnd = graphDocumentSource.indexOf("const invalidFlowNodeIds", validationEffectStart);
    const validationEffectSource = graphDocumentSource.slice(validationEffectStart, validationEffectEnd);
    const publishStart = graphDocumentSource.indexOf("const publishFlowGraphDraft");
    const publishEnd = graphDocumentSource.indexOf("  useEffect(() => {", publishStart);
    const publishSource = graphDocumentSource.slice(publishStart, publishEnd);

    expect(editorSource).not.toContain("useMemo(() => automationFlowGraphProblems(flowNodes, flowEdges)");
    expect(validationEffectSource).toContain("scheduleAutomationGraphIdleTask");
    expect(validationEffectSource).toContain("automationFlowGraphProblems(nodes, edges)");
    expect(validationEffectSource).toContain("[flowGraphValidationRevision]");
    expect(publishSource).toContain("flowGraphDraftFlushCancelRef.current?.()");
    expect(publishSource).toContain("scheduleAutomationGraphIdleTask");
    expect(publishSource).toContain("delayMs: 160");
    expect(publishSource).not.toContain("queueMicrotask");
  });

  it("does not serialize selected-node parameters in the selection/render effect", () => {
    const graphDocumentSource = readFileSync(new URL("../flow-editor/useFlowEditorGraphDocument.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
    const selectionEffectStart = graphDocumentSource.indexOf("const nodeId = props.selectedNode?.id;");
    const selectionEffectEnd = graphDocumentSource.indexOf("useEffect(() => () =>", selectionEffectStart);
    const selectionEffectSource = graphDocumentSource.slice(selectionEffectStart, selectionEffectEnd);

    expect(selectionEffectSource).toContain("currentNode.data.parameterValues !== selectedParameterValues");
    expect(selectionEffectSource).not.toContain("JSON.stringify");
  });
});
