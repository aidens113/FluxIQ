import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { automationNodeCompatibilityHint, automationPolicyGraphProblems, graphSignature } from "./GraphEditorViews";

describe("Automation graph editor render-cost guards", () => {
  it("does not include full node payloads or bulky metadata in graph signatures", () => {
    const signature = graphSignature([
      {
        id: "node.large",
        type: "automationPolicy",
        position: { x: 10, y: 20 },
        data: {
          label: "Large node",
          nodeDefinitionId: "builtin.policy.action",
          inputs: [{ id: "in", value: "ignored-large-input".repeat(200) }],
          outputs: [{ id: "out", value: "ignored-large-output".repeat(200) }],
          parameters: [{ id: "selector", schema: "ignored-large-schema".repeat(200) }],
          metadata: {
            ownerKind: "flow",
            ownerId: "flow.large",
            rawRecordingPayload: "ignored-large-metadata".repeat(500)
          }
        }
      }
    ] as any, []);

    expect(signature).toContain("node.large");
    expect(signature).toContain("selector");
    expect(signature).not.toContain("ignored-large-input");
    expect(signature).not.toContain("ignored-large-output");
    expect(signature).not.toContain("ignored-large-schema");
    expect(signature).not.toContain("ignored-large-metadata");
  });
});

describe("Large graph performance", () => {
  it("validates a 2,000-node connected graph within the interaction budget", () => {
    const count = 2_000;
    const nodes = Array.from({ length: count }, (_, index) => ({
      id: "node." + index,
      position: { x: (index % 40) * 240, y: Math.floor(index / 40) * 150 },
      data: {
        label: "Node " + index,
        isStart: index === 0,
        inputs: index === 0 ? [] : [{ id: "in", label: "In", valueType: "any" }],
        outputs: index === count - 1 ? [] : [{ id: "next", label: "Next", valueType: "any" }],
        parameters: [],
        parameterValues: {}
      }
    })) as any;
    const edges = Array.from({ length: count - 1 }, (_, index) => ({ id: "edge." + index, source: "node." + index, sourceHandle: "next", target: "node." + (index + 1), targetHandle: "in" })) as any;

    const startedAt = performance.now();
    const problems = automationPolicyGraphProblems(nodes, edges);
    const elapsedMs = performance.now() - startedAt;

    expect(problems).toEqual([]);
    expect(elapsedMs).toBeLessThan(250);
  });
});
describe("Nodes whiteboard toolbar and outline", () => {
  it("reports missing starts, unreachable nodes, and dangling edges structurally", () => {
    const nodes = [
      { id: "orphan", type: "policyNode", position: { x: 0, y: 0 }, data: { label: "Orphan", inputs: [], outputs: [], parameters: [], parameterValues: {} } }
    ] as any;
    const problems = automationPolicyGraphProblems(nodes, [{ id: "dangling", source: "missing", target: "orphan" }] as any);

    expect(problems.map((problem) => problem.id)).toEqual(["dangling:dangling", "start:missing", "unreachable:orphan"]);
  });

  it("reports incompatible connections and invalid node parameters", () => {
    const nodes = [
      { id: "start", position: { x: 0, y: 0 }, data: { label: "Start", isStart: true, inputs: [], outputs: [{ id: "value", valueType: "string" }], parameters: [], parameterValues: {} } },
      { id: "target", position: { x: 200, y: 0 }, data: { label: "Target", inputs: [{ id: "value", valueType: "number" }], outputs: [], parameters: [{ id: "name", label: "Name", valueType: "string", required: true }], parameterValues: {} } }
    ] as any;
    const edges = [{ id: "edge.bad", source: "start", sourceHandle: "value", target: "target", targetHandle: "value" }] as any;
    const problems = automationPolicyGraphProblems(nodes, edges);

    expect(problems.map((problem) => problem.id)).toEqual(["incompatible:edge.bad", "parameter:target:name"]);
    expect(problems.find((problem) => problem.targetId === "target")?.message).toContain("required");
  });
  it("renders explicit canvas modes, complete commands, and a semantic graph outline", () => {
    const source = readFileSync(new URL("./GraphEditorViews.tsx", import.meta.url), "utf8");
    for (const command of ["Fit graph", "Zoom in", "Zoom out", "Undo graph change", "Redo graph change", "Validate graph", "Toggle graph outline", "Add node"]) {
      expect(source).toContain('aria-label="' + command + '"');
    }
    expect(source).not.toContain('aria-label="Select mode"');
    expect(source).not.toContain('aria-label="Pan mode"');
    expect(source).toContain('role="toolbar"');
    expect(source).toContain('role="tree"');
    expect(source).toContain('role="treeitem"');
    expect(source).toContain("automationGraphMiddleMousePanButtons");
    expect(source).toContain("panOnDrag={automationGraphMiddleMousePanButtons}");
    expect(source).toContain('selectionOnDrag={false}');
    expect(source).toContain("startPolicyDragSelect");
    expect(source).toContain("policyDragSelectBoxRef");
    expect(source).toContain("automation-studio:focus-graph-problem");
    expect(source).toContain("validatedPolicyNodes");
    expect(source).toContain("policyGraphValidationRevision");
    expect(source).toContain("scheduleAutomationGraphIdleTask");
    expect(source).not.toContain("useMemo(() => automationPolicyGraphProblems(policyNodes, policyEdges)");
    expect(source).toContain("onlyRenderVisibleElements");
    expect(source).toContain("automationGraphRevisionSignature");
    expect(source).toContain("automationGraphMiniMapNodeColor");
    expect(source).toContain("const nodesById = new Map");
    expect(source).toContain("props.onOpenProblems()");
    expect(source).toContain("startTransition");
    expect(source).toContain("setPolicySelectionDeferred");
    expect(source).toContain("setSelectedPolicyNodeIds((current)");
    expect(source).toContain("sameStringList(current, [node.id])");
    const nodeClickStart = source.indexOf("onNodeClick={(event, node) =>");
    const selectionChangeStart = source.indexOf("onSelectionChange=", nodeClickStart);
    const selectionChangeEnd = source.indexOf("<Background", selectionChangeStart);
    expect(nodeClickStart).toBeGreaterThan(0);
    expect(selectionChangeStart).toBeGreaterThan(nodeClickStart);
    const nodeClickSource = source.slice(nodeClickStart, selectionChangeStart);
    const selectionChangeSource = source.slice(selectionChangeStart, selectionChangeEnd);
    expect(nodeClickSource).toContain("policySelectionRef.current = `node:${node.id}`");
    expect(nodeClickSource).not.toContain("setPolicySelectionDeferred");
    expect(nodeClickSource).not.toContain("setTransientPolicyNodes");
    expect(nodeClickSource).not.toContain("setTransientPolicyEdges");
    expect(selectionChangeSource).not.toContain("setPolicySelectionDeferred");
  });
});
describe("Node palette", () => {
  it("describes node compatibility without exposing internal availability JSON", () => {
    expect(automationNodeCompatibilityHint({ scope: "policy", privileged: true } as any)).toBe("Privileged action");
    expect(automationNodeCompatibilityHint({ scope: "both", source: { kind: "composite" } } as any)).toBe("Published Flow");
    expect(automationNodeCompatibilityHint({ scope: "policy", availability: { kind: "domain", domainId: "billing" } } as any)).toBe("Domain: billing");
  });

  it("provides search, all/favorite/recent modes, persisted favorites, and focused Add Node entry", () => {
    const source = readFileSync(new URL("./GraphEditorViews.tsx", import.meta.url), "utf8");
    expect(source).toContain('aria-label="Search nodes"');
    expect(source).toContain('"all" | "favorites" | "recent"');
    expect(source).toContain('fluxiq:node-palette:favorites');
    expect(source).toContain('automation-node-compatibility');
    expect(source).toContain('automation-studio:focus-node-palette');
    expect(source).toContain('className="automation-node-palette-item"');
  });
});
describe("Nodes whiteboard draft and save states", () => {
  it("exposes explicit save states and reload recovery actions", () => {
    const source = readFileSync(new URL("./GraphEditorViews.tsx", import.meta.url), "utf8");
    for (const state of ["Saved", "Unsaved changes", "Saving", "Save failed", "Save conflict"]) expect(source).toContain(state);
    expect(source).toContain("Unsaved draft available");
    expect(source).toContain("Unsaved draft from an older Flow version");
    expect(source).toContain("Restore Draft");
    expect(source).toContain("Discard");
  });
});
describe("Nodes whiteboard interaction completeness", () => {
  it("keeps multi-selection and exposes keyboard-equivalent graph mutations", () => {
    const source = readFileSync(new URL("./GraphEditorViews.tsx", import.meta.url), "utf8");
    expect(source).toContain("selectedPolicyNodeIds");
    expect(source).toContain('key === "a"');
    expect(source).toContain('key === "c"');
    expect(source).toContain('key === "v"');
    expect(source).toContain('key === "d"');
    expect(source).toContain("movePolicySelection");
    expect(source).toContain("connectPolicySelection");
    expect(source).toContain('aria-label="Duplicate selected nodes"');
    expect(source).toContain('aria-label="Connect selected node"');
    expect(source).toContain('aria-label="Delete graph selection"');
    expect(source).toContain("nodesFocusable");
    expect(source).toContain("edgesFocusable");
    expect(source).toContain('aria-label={(props.direction === "source" ? "Output " : "Input ")');
    expect(source).toContain("startPolicyDragSelect");
    expect(source).toContain("policyDragSelectBoxRef");
  });
});

