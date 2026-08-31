import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { automationNodeCompatibilityHint, automationFlowGraphProblems, graphSignature, NODE_PALETTE_FAVORITES_MAX_LOCAL_STORAGE_CHARS, NODE_PALETTE_FAVORITES_STORAGE_KEY, readNodePaletteFavoritesFromLocalStorage } from "../flow-editor";
function flowEditorSource(): string {
  return [
    "../flow-editor/useFlowEditorController.ts",
    "../flow-editor/useFlowEditorGraphDocument.ts",
    "../flow-editor/useFlowEditorSelection.ts",
    "../flow-editor/useFlowEditorCommands.ts",
    "../flow-editor/useFlowEditorCanvasInteractions.ts",
    "../flow-editor/useFlowEditorPalette.ts",
    "../flow-editor/FlowGraphCanvas.tsx",
    "../flow-editor/FlowGraphStatus.tsx",
    "../flow-editor/FlowGraphToolbar.tsx",
    "../flow-editor/useFlowEditorClipboardCommands.ts",
    "../flow-editor/FlowOutline.tsx",
    "../flow-editor/FlowNodePalette.tsx",
    "../flow-editor/NodePortList.tsx",
    "../flow-editor/NodeSelectionActions.tsx",
    "../flow-editor/FlowEditorActionsContext.tsx",
    "../flow-editor/graph-signatures.ts",
    "../flow-editor/graph-validation.ts",
    "../flow-editor/flow-editor-types.ts",
    "../flow-editor/palette-preferences-repository.ts"
  ].map((path) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n")).join("\n");
}

describe("Automation graph editor browser storage guards", () => {
  it("removes oversized node palette favorites before parsing", () => {
    const removed: string[] = [];
    const storage = {
      getItem: (key: string) => key === NODE_PALETTE_FAVORITES_STORAGE_KEY ? "x".repeat(NODE_PALETTE_FAVORITES_MAX_LOCAL_STORAGE_CHARS + 1) : null,
      removeItem: (key: string) => { removed.push(key); }
    };
    Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: storage }});

    expect(readNodePaletteFavoritesFromLocalStorage()).toEqual([]);
    expect(removed).toEqual([NODE_PALETTE_FAVORITES_STORAGE_KEY]);
  });
});
describe("Automation graph editor render-cost guards", () => {
  it("does not include full node payloads or bulky metadata in graph signatures", () => {
    const signature = graphSignature([
      {
        id: "node.large",
        type: "automationFlow",
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
    const problems = automationFlowGraphProblems(nodes, edges);
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
    const problems = automationFlowGraphProblems(nodes, [{ id: "dangling", source: "missing", target: "orphan" }] as any);

    expect(problems.map((problem) => problem.id)).toEqual(["dangling:dangling", "start:missing", "unreachable:orphan"]);
  });

  it("reports incompatible connections and invalid node parameters", () => {
    const nodes = [
      { id: "start", position: { x: 0, y: 0 }, data: { label: "Start", isStart: true, inputs: [], outputs: [{ id: "value", valueType: "string" }], parameters: [], parameterValues: {} } },
      { id: "target", position: { x: 200, y: 0 }, data: { label: "Target", inputs: [{ id: "value", valueType: "number" }], outputs: [], parameters: [{ id: "name", label: "Name", valueType: "string", required: true }], parameterValues: {} } }
    ] as any;
    const edges = [{ id: "edge.bad", source: "start", sourceHandle: "value", target: "target", targetHandle: "value" }] as any;
    const problems = automationFlowGraphProblems(nodes, edges);

    expect(problems.map((problem) => problem.id)).toEqual(["incompatible:edge.bad", "parameter:target:name"]);
    expect(problems.find((problem) => problem.targetId === "target")?.message).toContain("required");
  });
  it("renders explicit canvas modes, complete commands, and a semantic graph outline", () => {
    const source = flowEditorSource();
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
    expect(source).toContain("startFlowDragSelect");
    expect(source).toContain("flowDragSelectBoxRef");
    expect(source).toContain("props.focusRequest?.problem");
    expect(source).not.toContain("automation-studio:focus-graph-problem");
    expect(source).toContain("validatedFlowNodes");
    expect(source).toContain("flowGraphValidationRevision");
    expect(source).toContain("scheduleAutomationGraphIdleTask");
    expect(source).not.toContain("useMemo(() => automationFlowGraphProblems(flowNodes, flowEdges)");
    expect(source).toContain("onlyRenderVisibleElements");
    expect(source).toContain("automationGraphRevisionSignature");
    expect(source).toContain("automationGraphMiniMapNodeColor");
    expect(source).toContain("const nodesById = new Map");
    expect(source).toContain("currentProps.onOpenProblems()");
    expect(source).not.toContain("startTransition");
    expect(source).toContain("currentProps.setSelection(");
    expect(source).not.toContain("publishAutomationGraphSelection");
    expect(source).not.toContain("automation-studio:update-node-parameters");
    expect(source).toContain("publishFlowSelection");
    expect(source).toContain("setSelectedFlowNodeIds(");
    expect(source).toContain("sameStringList(current, [node.id])");
    const nodeClickStart = source.indexOf("const selectClickedFlowNode:");
    const selectionChangeStart = source.indexOf("const previewFlowViewport", nodeClickStart);
    const selectionChangeEnd = source.indexOf("const validateFlowGraph", selectionChangeStart);
    expect(nodeClickStart).toBeGreaterThan(0);
    expect(selectionChangeStart).toBeGreaterThan(nodeClickStart);
    const nodeClickSource = source.slice(nodeClickStart, selectionChangeStart);
    const selectionChangeSource = source.slice(selectionChangeStart, selectionChangeEnd);
    expect(nodeClickSource).toContain("flowSelectionRef.current = `node:${node.id}`");
    expect(nodeClickSource).toContain("currentSelection.publishFlowSelection(");
    expect(nodeClickSource).toContain("currentSelection.flowCanvasSelectionForNode(node)");
    expect(nodeClickSource).not.toContain("currentProps.setSelection(");
    expect(nodeClickSource).not.toContain("setTransientFlowNodes");
    expect(nodeClickSource).not.toContain("setTransientFlowEdges");
    expect(selectionChangeSource).not.toContain("currentProps.setSelection(");
  });
});
describe("Node palette", () => {
  it("describes node compatibility without exposing internal availability JSON", () => {
    expect(automationNodeCompatibilityHint({ scope: "policy", privileged: true } as any)).toBe("Privileged action");
    expect(automationNodeCompatibilityHint({ scope: "both", source: { kind: "composite" } } as any)).toBe("Published Flow");
    expect(automationNodeCompatibilityHint({ scope: "policy", availability: { kind: "domain", domainId: "billing" } } as any)).toBe("Domain: billing");
  });

  it("provides search, all/favorite/recent modes, persisted favorites, and focused Add Node entry", () => {
    const source = flowEditorSource();
    expect(source).toContain('aria-label="Search nodes"');
    expect(source).toContain('"all" | "favorites" | "recent"');
    expect(source).toContain('fluxiq:node-palette:favorites');
    expect(source).toContain('automation-node-compatibility');
    expect(source).toContain('focusRevision');
    expect(source).not.toContain('automation-studio:focus-node-palette');
    expect(source).toContain('className="automation-node-palette-item"');
  });
});
describe("Nodes whiteboard draft and save states", () => {
  it("exposes explicit save states and reload recovery actions", () => {
    const source = flowEditorSource();
    for (const state of ["Saved", "Unsaved changes", "Saving", "Save failed", "Save conflict"]) expect(source).toContain(state);
    expect(source).toContain("Unsaved draft available");
    expect(source).toContain("Unsaved draft from an older Flow version");
    expect(source).toContain("Restore Draft");
    expect(source).toContain("Discard");
  });
});
describe("Nodes whiteboard interaction completeness", () => {
  it("keeps multi-selection and exposes keyboard-equivalent graph mutations", () => {
    const source = flowEditorSource();
    expect(source).toContain("selectedFlowNodeIds");
    expect(source).toContain('key === "a"');
    expect(source).toContain('key === "c"');
    expect(source).toContain('key === "v"');
    expect(source).toContain('key === "d"');
    expect(source).toContain("moveFlowSelection");
    expect(source).toContain("connectFlowSelection");
    expect(source).toContain('aria-label="Duplicate selected nodes"');
    expect(source).toContain('aria-label="Connect selected node"');
    expect(source).toContain('aria-label="Delete graph selection"');
    expect(source).toContain("nodesFocusable");
    expect(source).toContain("edgesFocusable");
    expect(source).toContain('aria-label={(props.direction === "source" ? "Output " : "Input ")');
    expect(source).toContain("startFlowDragSelect");
    expect(source).toContain("flowDragSelectBoxRef");
  });

  it("does not rescan graph documents for activity-only renders", () => {
    const source = flowEditorSource();

    expect(source).toContain("activeRef: { current: boolean }");
    expect(source).toContain("props.activeRef.current");
    expect(source).toContain("const taskGraphSignature = useMemo");
    expect(source).toContain("const taskGraphDraftSignature = useMemo");
    expect(source).not.toContain("const taskGraphDraftSignature = props.taskGraphDraft ?");
  });
});


describe("Flow editor decomposition contracts", () => {
  const implementationFiles = [
    "../flow-editor/model/policy-graph.ts",
    "../flow-editor/model/run-log-formatting.ts",
    "../graph/edge-routing.ts",
    "../graph/interaction-geometry.ts",
    "../graph/node-parameters.ts",
    "../flow-editor/FlowEdge.tsx",
    "../flow-editor/FlowEditorView.tsx",
    "../flow-editor/FlowGraphCanvas.tsx",
    "../flow-editor/FlowGraphStatus.tsx",
    "../flow-editor/FlowGraphToolbar.tsx",
    "../flow-editor/useFlowEditorClipboardCommands.ts",
    "../flow-editor/model/flow-graph.ts",
    "../flow-editor/FlowNode.tsx",
    "../flow-editor/FlowNodePalette.tsx",
    "../flow-editor/FlowOutline.tsx",
    "../flow-editor/NodePortList.tsx",
    "../flow-editor/NodeSelectionActions.tsx",
    "../flow-editor/FlowEditorActionsContext.tsx",
    "../flow-editor/graph-interactions.ts",
    "../flow-editor/graph-signatures.ts",
    "../flow-editor/graph-validation.ts",
    "../flow-editor/palette-preferences-repository.ts",
    "../flow-editor/useFlowEditorController.ts",
    "../flow-editor/useFlowEditorGraphDocument.ts",
    "../flow-editor/useFlowEditorSelection.ts",
    "../flow-editor/useFlowEditorCommands.ts",
    "../flow-editor/useFlowEditorCanvasInteractions.ts",
    "../flow-editor/useFlowEditorPalette.ts",
  ];

  it("keeps active-tab changes behind the Flow editor render boundary", () => {
    const source = readFileSync(new URL("../flow-editor/FlowEditorView.tsx", import.meta.url), "utf8");

    expect(source).toContain("memo(function FlowEditorView");
  });

  it("keeps implementation modules below the hard source limit", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(new URL(path, import.meta.url), "utf8");
      const lineLimit = path.endsWith("/useFlowEditorController.ts") ? 300 : 600;
      expect(source.split(/\r?\n/).length, path).toBeLessThan(lineLimit);
    }
  });

  it("removes the old GraphEditorViews compatibility path", () => {
    expect(existsSync(new URL("./GraphEditorViews.tsx", import.meta.url))).toBe(false);
  });

  it("keeps node and edge commands local to each mounted editor", () => {
    const files = [
      "../flow-editor/FlowEdge.tsx",
      "../flow-editor/NodePortList.tsx",
      "../flow-editor/FlowGraphCanvas.tsx",
      "../flow-editor/useFlowEditorController.ts",
    ].map((path) => readFileSync(new URL(path, import.meta.url), "utf8")).join("\n");
    expect(files).toContain("FlowEditorActionsProvider");
    for (const eventName of ["automation-studio:delete-node", "automation-studio:delete-edge", "automation-studio:select-edge", "automation-studio:update-node-parameters"]) {
      expect(files).not.toContain(eventName);
    }
  });
  it("preserves the established pointer contract", () => {
    const canvas = readFileSync(new URL("../flow-editor/FlowGraphCanvas.tsx", import.meta.url), "utf8");
    const interactions = readFileSync(new URL("../flow-editor/useFlowEditorCanvasInteractions.ts", import.meta.url), "utf8");
    const controller = readFileSync(new URL("../flow-editor/flow-canvas-interaction-controller.ts", import.meta.url), "utf8");
    expect(canvas).toContain("panOnDrag={automationGraphMiddleMousePanButtons}");
    expect(canvas).toContain("selectionOnDrag={false}");
    expect(canvas).toContain("onPointerDownCapture={startFlowDragSelect}");
    expect(canvas).toContain("onNodeClick={selectClickedFlowNode}");
    expect(canvas).toContain("onNodeContextMenu={reserveFlowNodeContextMenu}");
    expect(interactions).toContain("if (event.button !== 0) return");
    expect(interactions).toContain("event.button !== 2");
    expect(interactions).toContain('".react-flow__node, .react-flow__handle');
    expect(controller).toContain("marqueeMovementThreshold");
  });
});
