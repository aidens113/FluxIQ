import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveAutomationGraphUpdate } from "./useAutomationGraphController";
import { policyEdgeChangesAreDurable, policyNodeChangesAreDurable } from "../views/GraphEditorViews";

describe("Automation graph controller", () => {
  it("resolves direct and functional document updates", () => {
    expect(resolveAutomationGraphUpdate([1], [2, 3])).toEqual([2, 3]);
    expect(resolveAutomationGraphUpdate([1], (current) => [...current, 2])).toEqual([1, 2]);
  });

  it("owns canonical Policy Canvas node and edge state", () => {
    const source = readFileSync(new URL("../views/GraphEditorViews.tsx", import.meta.url), "utf8");
    expect(source).toContain("useAutomationGraphController<AutomationPolicyNodeData>");
    expect(source).toContain("replacePolicyGraph({ nodes: nextNodes, edges: nextEdges })");
    expect(source).not.toContain("const [policyNodes, setPolicyNodes] = useState");
    expect(source).not.toContain("const [policyEdges, setPolicyEdges] = useState");
  });

  it("keeps scalable graph ownership out of AutomationStudioLive", () => {
    const liveSource = readFileSync(new URL("../AutomationStudioLive.tsx", import.meta.url), "utf8");
    expect(liveSource).toContain("automationGraphDraftIdentity(selectedTaskGraph)");
    expect(liveSource).not.toContain("function taskGraphDraftKey");
    expect(liveSource).not.toContain("stableStringHash(shape)");
  });

  it("keeps graph render caps and avoids full graph dirty serialization on every render", () => {
    const controllerSource = readFileSync(new URL("./useAutomationGraphController.ts", import.meta.url), "utf8");
    const editorSource = readFileSync(new URL("../views/GraphEditorViews.tsx", import.meta.url), "utf8");
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
    expect(editorSource).toContain("markPolicyGraphDirty(true)");
    expect(editorSource).toContain("policyNodeChangesAreDurable");
    expect(editorSource).toContain("policyEdgeChangesAreDurable");
    expect(editorSource).toContain("setTransientPolicyNodes");
    expect(editorSource).toContain("setTransientPolicyEdges");
    expect(editorSource).not.toContain("graphSignature(policyNodes, policyEdges) !== savedGraphSignatureRef.current");
  });

  it("classifies selection and active drag changes as transient graph work", () => {
    expect(policyNodeChangesAreDurable([{ type: "select", id: "node.a", selected: true } as any], false)).toBe(false);
    expect(policyNodeChangesAreDurable([{ type: "dimensions", id: "node.a", dimensions: { width: 320, height: 180 } } as any], false)).toBe(false);
    expect(policyNodeChangesAreDurable([{ type: "position", id: "node.a", position: { x: 20, y: 10 } } as any], true)).toBe(false);
    expect(policyNodeChangesAreDurable([{ type: "position", id: "node.a", position: { x: 20, y: 10 } } as any], false)).toBe(true);
    expect(policyEdgeChangesAreDurable([{ type: "select", id: "edge.a", selected: true } as any])).toBe(false);
    expect(policyEdgeChangesAreDurable([{ type: "remove", id: "edge.a" } as any])).toBe(true);
  });

  it("routes selection-only editor changes through transient setters without draft publishing", () => {
    const editorSource = readFileSync(new URL("../views/GraphEditorViews.tsx", import.meta.url), "utf8");
    const nodeChangeStart = editorSource.indexOf("onNodesChange={(changes: NodeChange<Node<AutomationPolicyNodeData>>[])");
    const edgeClickStart = editorSource.indexOf("onEdgeClick={(event, edge)", nodeChangeStart);
    const nodeChangeSource = editorSource.slice(nodeChangeStart, edgeClickStart);
    const nodeClickStart = editorSource.indexOf("onNodeClick={(event, node)", edgeClickStart);
    const selectionChangeStart = editorSource.indexOf("onSelectionChange=", nodeClickStart);
    const nodeClickSource = editorSource.slice(nodeClickStart, selectionChangeStart);

    expect(nodeChangeSource).toContain("policyNodeChangesAreDurable(changes, policyNodeDragActiveRef.current)");
    expect(nodeChangeSource).toContain("if (durableChange) checkpointPolicyGraph()");
    expect(nodeChangeSource).toContain("if (durableChange) setPolicyNodes(nextNodes)");
    expect(nodeChangeSource).toContain("else setTransientPolicyNodes(nextNodes)");
    expect(nodeClickSource).not.toContain("publishPolicyGraphDraft");
    expect(nodeClickSource).not.toContain("checkpointPolicyGraph");
  });

  it("keeps full graph validation and draft publishing out of immediate selection/drag render paths", () => {
    const editorSource = readFileSync(new URL("../views/GraphEditorViews.tsx", import.meta.url), "utf8");
    const validationEffectStart = editorSource.indexOf("useEffect(() => {\n    let cancelled = false;");
    const applyHistoryStart = editorSource.indexOf("const applyPolicyHistory", validationEffectStart);
    const validationEffectSource = editorSource.slice(validationEffectStart, applyHistoryStart);
    const publishStart = editorSource.indexOf("const publishPolicyGraphDraft");
    const publishEnd = editorSource.indexOf("  useEffect(() => () => {", publishStart);
    const publishSource = editorSource.slice(publishStart, publishEnd);

    expect(editorSource).not.toContain("useMemo(() => automationPolicyGraphProblems(policyNodes, policyEdges)");
    expect(validationEffectSource).toContain("scheduleAutomationGraphIdleTask");
    expect(validationEffectSource).toContain("automationPolicyGraphProblems(nodes, edges)");
    expect(validationEffectSource).toContain("[policyGraphValidationRevision]");
    expect(publishSource).toContain("policyGraphDraftFlushCancelRef.current?.()");
    expect(publishSource).toContain("scheduleAutomationGraphIdleTask");
    expect(publishSource).toContain("delayMs: 160");
    expect(publishSource).not.toContain("queueMicrotask");
  });
});
