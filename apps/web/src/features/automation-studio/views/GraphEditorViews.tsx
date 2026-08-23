"use client";

import { AlertTriangle, Blocks, Braces, Calculator, ChevronRight, CircleDot, Clock, Database, Dice5, GitBranch, History, ListChecks, Merge, Network, Radio, Repeat, ShieldCheck, Shuffle, Sparkles, Split, Trash2, Waves, Workflow, Zap } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Background, BaseEdge, Controls, EdgeLabelRenderer, Handle, MiniMap, Position, ReactFlow, addEdge, applyEdgeChanges, applyNodeChanges, type Edge, type EdgeChange, type EdgeProps, type Node, type NodeChange, type NodeProps, type ReactFlowInstance } from "@xyflow/react";
import type { AutomationNodePort } from "fluxiq/automation-studio/nodes";
import type { JsonObject } from "../../programs/program-api";
import { DataTable, KeyValue, Segmented, StatusBadge, SummaryStrip } from "../../programs/shared-ui";
import type { AutomationDockTab, AutomationEditorNodeSpec, AutomationEditorPaletteGroup, AutomationPolicyNodeData, AutomationRoutineNodeData, AutomationSelection } from "../types";
import { automationEditorPalette } from "../types";
import type { AutomationDragSelectBox } from "../workspace/layout";
import type { BuildNodeStateViewModelInput } from "../state/view-model";
import { automationConnectionIsValid, automationPortCaption, automationPortDisplayLabel, automationPortTitle, automationPortTone, uniqueAutomationPorts } from "../graph/ports";
import { automationEdgeRoute, automationLaneEdgePath, automationLoopEdgePath, automationVisualInputPorts, createAutomationConnectionEdge, defaultAutomationParameterValues, flattenRunLogs, policyToReactFlowGraph, rebalanceAutomationEdgeLanes, reconnectAutomationEdge, roundedAutomationPosition, routineToReactFlowGraph, spawnAutomationNodePosition, startAutomationNodeMarquee, syncGraphNodes, taskFlowToReactFlowGraph } from "../graph/view-model";
import { sameStringList } from "./view-utils";
import { AutomationStateView } from "./StateView";

type TabButton<T extends string> = { id: T; label: string; count?: number };

const automationNodeTypes = {
  policyNode: AutomationPolicyNode,
  routineNode: AutomationRoutineNode
};
const automationEdgeTypes = {
  automationEdge: AutomationFlowEdge
};
function automationPaletteIcon(family: string): typeof Blocks {
  switch (family) {
    case "control-flow": return GitBranch;
    case "policy": return ShieldCheck;
    case "routine": return Workflow;
    case "logic": return ListChecks;
    case "math": return Braces;
    case "random": return Radio;
    case "data": return Network;
    case "database": return Network;
    case "timing": return History;
    case "custom": return Blocks;
    default: return Blocks;
  }
}

function automationNodeIcon(icon: string | undefined, family: string | undefined): typeof Blocks {
  switch (icon) {
    case "calculator": return Calculator;
    case "circle-dot": return CircleDot;
    case "clock-alert":
    case "clock": return Clock;
    case "database": return Database;
    case "dice-5": return Dice5;
    case "git-branch": return GitBranch;
    case "merge": return Merge;
    case "repeat": return Repeat;
    case "shield": return ShieldCheck;
    case "shuffle": return Shuffle;
    case "split": return Split;
    case "waves": return Waves;
    case "workflow": return Workflow;
    case "zap": return Zap;
    default: return automationPaletteIcon(family ?? "custom");
  }
}

function AutomationNodePalette(props: {
  collapsed: boolean;
  disabled?: boolean;
  groups: AutomationEditorPaletteGroup[];
  title: string;
  onAddNode(spec: AutomationEditorNodeSpec): void;
  onCollapsedChange(value: boolean): void;
}) {
  return (
    <aside className={props.collapsed ? "automation-node-palette collapsed" : "automation-node-palette"} aria-label={props.title}>
      <header>
        <strong>{props.title}</strong>
        <button className="icon-button" onClick={() => props.onCollapsedChange(!props.collapsed)} title={props.collapsed ? "Expand palette" : "Collapse palette"} aria-label={props.collapsed ? "Expand palette" : "Collapse palette"} type="button">
          {props.collapsed ? <ChevronLeftIcon /> : <ChevronRight size={13} aria-hidden />}
        </button>
      </header>
      {!props.collapsed ? props.groups.map((group) => (
        <section key={group.title}>
          <strong>{group.title}</strong>
          {group.nodes.map((item) => {
            const Icon = automationNodeIcon(item.icon, item.family);
            return (
              <button disabled={props.disabled} key={item.id} onClick={() => props.onAddNode(item)} title={props.disabled ? "Switch to Flow mode to add nodes." : item.description} type="button">
                <Icon size={15} aria-hidden />
                <span><strong>{item.label}</strong><small>{item.description}</small></span>
              </button>
            );
          })}
        </section>
      )) : null}
    </aside>
  );
}

function ChevronLeftIcon() {
  return <ChevronRight size={13} aria-hidden style={{ transform: "rotate(180deg)" }} />;
}

function routineEditorSelection(id: string, data: AutomationRoutineNodeData): AutomationSelection {
  return {
    kind: "editor-node",
    id,
    node: {
      label: data.label,
      nodeType: data.nodeType,
      family: data.family,
      description: data.description,
      ...(data.customDescription !== undefined ? { customDescription: data.customDescription } : {}),
      inputs: data.inputs,
      outputs: data.outputs,
      parameters: data.parameters,
      parameterValues: data.parameterValues,
      ...(data.nodeDefinitionId !== undefined ? { nodeDefinitionId: data.nodeDefinitionId } : {}),
      ...(data.icon !== undefined ? { icon: data.icon } : {}),
      ...(data.metadata !== undefined ? { metadata: data.metadata } : {}),
      ...(data.privileged !== undefined ? { privileged: data.privileged } : {})
    }
  };
}

function policyEditorSelection(id: string, data: AutomationPolicyNodeData): AutomationSelection {
  return {
    kind: "editor-node",
    id,
    node: {
      label: data.label,
      nodeType: data.isStart ? "start" : "policy",
      family: data.recovery,
      description: data.description,
      ...(data.customDescription !== undefined ? { customDescription: data.customDescription } : {}),
      inputs: data.inputs,
      outputs: data.outputs,
      parameters: data.parameters,
      parameterValues: data.parameterValues,
      ...(data.nodeDefinitionId !== undefined ? { nodeDefinitionId: data.nodeDefinitionId } : {}),
      ...(data.icon !== undefined ? { icon: data.icon } : {}),
      ...(data.metadata !== undefined ? { metadata: data.metadata } : {}),
      actionTypes: data.actionTypes
    }
  };
}

type AutomationRoutineEditorMode = "flow" | "data" | "plan";

const automationRoutineEditorModes: Array<{ id: AutomationRoutineEditorMode; label: string; description: string }> = [
  { id: "flow", label: "Flow", description: "Edit routine orchestration nodes, routes, branches, waits, approvals, and recovery." },
  { id: "data", label: "Data", description: "Inspect routine inputs, outputs, variables, handoffs, and configuration values." },
  { id: "plan", label: "Run Plan", description: "Review execution order, dependencies, parallel paths, and validation warnings." }
];
const automationNodeEditorConnectionRadius = 72;
const automationNodeEditorReconnectRadius = 22;

function protectRecentlyConnectedEdge(edgeIdsRef: { current: Set<string> }, edgeId: string) {
  edgeIdsRef.current.add(edgeId);
  window.setTimeout(() => {
    edgeIdsRef.current.delete(edgeId);
  }, 300);
}

export function automationCompositeCallMetadata(spec: AutomationEditorNodeSpec): JsonObject | undefined {
  if (spec.source?.kind !== "composite") return undefined;
  return { "fluxiq.callFlow": { target: { flowId: spec.source.flowId, version: spec.source.version, scope: spec.availability?.kind === "domain" ? { kind: "domain", domainId: spec.availability.domainId } : { kind: "global" } }, inputBindings: spec.inputs.map((port) => ({ targetPortId: port.id, valueKey: port.id })), outputBindings: spec.outputs.filter((port) => port.role !== "error").map((port) => ({ targetPortId: port.id, valueKey: port.id })), errorBindings: spec.outputs.filter((port) => port.role === "error").map((port) => ({ targetPortId: port.id.replace(/^error\./, ""), valueKey: port.id })) } } as JsonObject;
}

function ignoreProtectedEdgeRemovals(changes: EdgeChange[], protectedEdgeIds: Set<string>): EdgeChange[] {
  return changes.filter((change) => change.type !== "remove" || !protectedEdgeIds.has(change.id));
}

export function AutomationRoutineView(props: { models: any[]; policies: any[]; setSelection(selection: AutomationSelection): void }) {
  const [selectedRoutineNodeId, setSelectedRoutineNodeId] = useState("");
  const [selectedRoutineEdgeIds, setSelectedRoutineEdgeIds] = useState<string[]>([]);
  const [mode, setMode] = useState<AutomationRoutineEditorMode>("flow");
  const [paletteCollapsed, setPaletteCollapsed] = useState(false);
  const [routineDragSelectBox, setRoutineDragSelectBox] = useState<AutomationDragSelectBox | null>(null);
  const routineFrameRef = useRef<HTMLDivElement>(null);
  const routineSelectionRef = useRef("");
  const routineViewportRestoreRef = useRef<{ x: number; y: number; zoom: number } | null>(null);
  const [routineFlow, setRoutineFlow] = useState<ReactFlowInstance<Node<AutomationRoutineNodeData>, Edge> | null>(null);
  const graph = useMemo(() => routineToReactFlowGraph(), []);
  const [routineNodes, setRoutineNodes] = useState(graph.nodes);
  const [routineEdges, setRoutineEdges] = useState(graph.edges);
  const routineNodesRef = useRef<Array<Node<AutomationRoutineNodeData>>>([]);
  const routineEdgesRef = useRef<Edge[]>([]);
  const recentlyConnectedRoutineEdgeIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    setRoutineNodes((current) => syncGraphNodes(current, graph.nodes));
    setRoutineEdges(rebalanceAutomationEdgeLanes(graph.edges, graph.nodes));
  }, [graph.edges, graph.nodes]);
  useEffect(() => {
    routineNodesRef.current = routineNodes;
  }, [routineNodes]);
  useEffect(() => {
    routineEdgesRef.current = routineEdges;
  }, [routineEdges]);
  useEffect(() => {
    function captureViewport() {
      if (routineFlow) routineViewportRestoreRef.current = routineFlow.getViewport();
    }
    function restoreViewport() {
      const viewport = routineViewportRestoreRef.current;
      if (routineFlow && viewport) void routineFlow.setViewport(viewport, { duration: 0 });
    }
    window.addEventListener("automation-studio:capture-node-viewport", captureViewport);
    window.addEventListener("automation-studio:restore-node-viewport", restoreViewport);
    return () => {
      window.removeEventListener("automation-studio:capture-node-viewport", captureViewport);
      window.removeEventListener("automation-studio:restore-node-viewport", restoreViewport);
    };
  }, [routineFlow]);
  const palette = automationEditorPalette
    .map((group) => ({ ...group, nodes: group.nodes.filter((node) => node.scope === "routine" || node.scope === "both") }))
    .filter((group) => group.nodes.length > 0);
  const activeMode = automationRoutineEditorModes.find((item) => item.id === mode) ?? { id: "flow", label: "Flow", description: "Edit routine orchestration nodes, routes, branches, waits, approvals, and recovery." };
  const isFlowMode = mode === "flow";
  const selectRoutineMode = (nextMode: AutomationRoutineEditorMode) => {
    setMode(nextMode);
    if (nextMode !== "flow") props.setSelection(routineEditorModeSelection({ mode: nextMode, nodes: routineNodes, edges: routineEdges, models: props.models, policies: props.policies }));
  };
  const addRoutineNode = (spec: AutomationEditorNodeSpec) => {
    if (!isFlowMode) return;
    const id = `routine-${spec.id}-${Date.now().toString(36)}`;
    const data: AutomationRoutineNodeData = {
      nodeDefinitionId: spec.id,
      nodeDefinitionVersion: spec.version,
      label: spec.label,
      nodeType: spec.nodeType === "custom" ? "custom" : "base",
      family: spec.family,
      description: spec.description,
      ...(spec.icon !== undefined ? { icon: spec.icon } : {}),
      inputs: automationVisualInputPorts(spec.inputs, spec.id),
      outputs: spec.outputs,
      parameters: spec.parameters,
      parameterValues: defaultAutomationParameterValues(spec.parameters),
      ...(spec.privileged !== undefined ? { privileged: spec.privileged } : {})
    };
    const node: Node<AutomationRoutineNodeData> = {
      id,
      type: "routineNode",
      position: roundedAutomationPosition(spawnAutomationNodePosition(selectedRoutineNodeId, routineNodes, routineEdges, routineFlow, routineFrameRef.current)),
      data
    };
    setRoutineNodes((nodes) => [...nodes, node]);
    setSelectedRoutineNodeId(id);
    setSelectedRoutineEdgeIds([]);
    props.setSelection(routineEditorSelection(id, data));
    routineSelectionRef.current = `node:${id}`;
  };
  const deleteRoutineSelection = () => {
    const nodeIds = new Set(selectedRoutineNodeId ? [selectedRoutineNodeId] : []);
    const edgeIds = new Set(selectedRoutineEdgeIds);
    setRoutineNodes((nodes) => nodes.filter((node) => !nodeIds.has(node.id)));
    setRoutineEdges((edges) => rebalanceAutomationEdgeLanes(edges.filter((edge) => !edgeIds.has(edge.id) && !nodeIds.has(edge.source) && !nodeIds.has(edge.target)), routineNodes));
    setSelectedRoutineNodeId("");
    setSelectedRoutineEdgeIds([]);
  };
  const startRoutineDragSelect = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isFlowMode) return;
    startAutomationNodeMarquee({
      event,
      flow: routineFlow,
      frame: routineFrameRef.current,
      nodes: routineNodes,
      setDragBox: setRoutineDragSelectBox,
      setEdges: (updater) => setRoutineEdges((edges) => updater(edges)),
      setNodes: (updater) => setRoutineNodes((nodes) => updater(nodes)),
      onSelected: (nodes) => {
        const primaryNode = nodes[0];
        setSelectedRoutineNodeId(primaryNode?.id ?? "");
        setSelectedRoutineEdgeIds([]);
        routineSelectionRef.current = primaryNode ? `node:${primaryNode.id}` : "";
        if (primaryNode) props.setSelection(routineEditorSelection(primaryNode.id, primaryNode.data));
      }
    });
  };
  useEffect(() => {
    function handleDeleteNode(event: Event) {
      if (!isFlowMode) return;
      const nodeId = (event as CustomEvent<{ nodeId?: string }>).detail?.nodeId;
      if (!nodeId) return;
      setRoutineNodes((nodes) => nodes.filter((node) => node.id !== nodeId));
      setRoutineEdges((edges) => rebalanceAutomationEdgeLanes(edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId), routineNodes));
      setSelectedRoutineNodeId((current) => current === nodeId ? "" : current);
    }
    function handleDeleteEdge(event: Event) {
      if (!isFlowMode) return;
      const edgeId = (event as CustomEvent<{ edgeId?: string }>).detail?.edgeId;
      if (!edgeId) return;
      setRoutineEdges((edges) => rebalanceAutomationEdgeLanes(edges.filter((edge) => edge.id !== edgeId), routineNodes));
      setSelectedRoutineEdgeIds((ids) => ids.filter((id) => id !== edgeId));
    }
    function handleSelectEdge(event: Event) {
      if (!isFlowMode) return;
      const edgeId = (event as CustomEvent<{ edgeId?: string }>).detail?.edgeId;
      if (!edgeId || !routineEdgesRef.current.some((edge) => edge.id === edgeId)) return;
      setSelectedRoutineNodeId("");
      setSelectedRoutineEdgeIds([edgeId]);
      const nextEdges = routineEdgesRef.current.map((edge) => ({ ...edge, selected: edge.id === edgeId }));
      routineEdgesRef.current = nextEdges;
      setRoutineEdges(nextEdges);
    }
    function handleUpdateParameters(event: Event) {
      const detail = (event as CustomEvent<{ nodeId?: string; parameterValues?: JsonObject; customDescription?: string }>).detail;
      if (!detail?.nodeId) return;
      setRoutineNodes((nodes) => {
        const nextNodes = nodes.map((node) => {
          if (node.id !== detail.nodeId) return node;
          const data = { ...node.data, ...(detail.parameterValues ? { parameterValues: detail.parameterValues } : {}), ...(detail.customDescription !== undefined ? { customDescription: detail.customDescription } : {}) };
          if (routineSelectionRef.current === `node:${node.id}`) props.setSelection(routineEditorSelection(node.id, data));
          return { ...node, data };
        });
        routineNodesRef.current = nextNodes;
        return nextNodes;
      });
    }
    window.addEventListener("automation-studio:delete-node", handleDeleteNode);
    window.addEventListener("automation-studio:delete-edge", handleDeleteEdge);
    window.addEventListener("automation-studio:select-edge", handleSelectEdge);
    window.addEventListener("automation-studio:update-node-parameters", handleUpdateParameters);
    return () => {
      window.removeEventListener("automation-studio:delete-node", handleDeleteNode);
      window.removeEventListener("automation-studio:delete-edge", handleDeleteEdge);
      window.removeEventListener("automation-studio:select-edge", handleSelectEdge);
      window.removeEventListener("automation-studio:update-node-parameters", handleUpdateParameters);
    };
  }, [isFlowMode, props.setSelection]);
  return (
    <section className="automation-policy-canvas routine-canvas">
      <div className="automation-editor-mode-bar">
        <div className="automation-layer-tabs" role="tablist" aria-label="Legacy orchestration view modes">
          {automationRoutineEditorModes.map((item) => (
          <button className={mode === item.id ? "selected" : ""} key={item.id} onClick={() => selectRoutineMode(item.id)} title={item.description} type="button">{item.label}</button>
        ))}
        </div>
        <span>{activeMode.description}</span>
      </div>
      <div className={paletteCollapsed ? "automation-routine-editor-grid palette-collapsed" : "automation-routine-editor-grid"}>
        <div className="automation-react-flow-frame" onContextMenu={(event) => event.preventDefault()} onPointerDownCapture={startRoutineDragSelect} ref={routineFrameRef}>
          <ReactFlow<Node<AutomationRoutineNodeData>, Edge>
            fitView
            fitViewOptions={{ padding: 0.25 }}
            nodes={routineNodes}
            edges={routineEdges}
            edgeTypes={automationEdgeTypes}
            nodeTypes={automationNodeTypes}
            nodesDraggable={isFlowMode}
            nodesConnectable={isFlowMode}
            edgesReconnectable={isFlowMode}
            connectionRadius={automationNodeEditorConnectionRadius}
            elementsSelectable
            deleteKeyCode={isFlowMode ? ["Backspace", "Delete"] : null}
            minZoom={0.1}
            reconnectRadius={automationNodeEditorReconnectRadius}
            onInit={setRoutineFlow}
            isValidConnection={(connection) => automationConnectionIsValid(connection, routineNodes)}
            onConnect={(connection) => {
              if (!isFlowMode) return;
              const nextEdge = createAutomationConnectionEdge(connection, routineEdgesRef.current, "routine-edge", routineNodesRef.current);
              protectRecentlyConnectedEdge(recentlyConnectedRoutineEdgeIdsRef, nextEdge.id);
              setRoutineEdges((edges) => {
                const nextEdges = rebalanceAutomationEdgeLanes(addEdge(nextEdge, edges), routineNodesRef.current);
                routineEdgesRef.current = nextEdges;
                return nextEdges;
              });
            }}
            onReconnect={(oldEdge, connection) => {
              if (!isFlowMode) return;
              setRoutineEdges((edges) => {
                const nextEdges = reconnectAutomationEdge(oldEdge, connection, edges, routineNodesRef.current);
                routineEdgesRef.current = nextEdges;
                return nextEdges;
              });
            }}
            onEdgesChange={(changes: EdgeChange[]) => {
              if (!isFlowMode) return;
              const allowedChanges = ignoreProtectedEdgeRemovals(changes, recentlyConnectedRoutineEdgeIdsRef.current);
              if (!allowedChanges.length) return;
              setRoutineEdges((edges) => {
                const nextEdges = rebalanceAutomationEdgeLanes(applyEdgeChanges(allowedChanges, edges), routineNodesRef.current);
                routineEdgesRef.current = nextEdges;
                return nextEdges;
              });
            }}
            onEdgesDelete={(deletedEdges) => setSelectedRoutineEdgeIds((ids) => ids.filter((id) => !deletedEdges.some((edge) => edge.id === id)))}
            onNodesDelete={(deletedNodes) => {
              const deletedIds = new Set(deletedNodes.map((node) => node.id));
              setRoutineEdges((edges) => rebalanceAutomationEdgeLanes(edges.filter((edge) => !deletedIds.has(edge.source) && !deletedIds.has(edge.target)), routineNodes));
              if (deletedIds.has(selectedRoutineNodeId)) setSelectedRoutineNodeId("");
            }}
            onNodesChange={(changes: NodeChange<Node<AutomationRoutineNodeData>>[]) => isFlowMode ? setRoutineNodes((nodes) => {
              const nextNodes = applyNodeChanges(changes, nodes);
              return nextNodes;
            }) : undefined}
            onEdgeClick={(_event, edge) => {
              setSelectedRoutineNodeId("");
              setSelectedRoutineEdgeIds([edge.id]);
              setRoutineEdges((edges) => {
                const nextEdges = edges.map((item) => ({ ...item, selected: item.id === edge.id }));
                routineEdgesRef.current = nextEdges;
                return nextEdges;
              });
            }}
            onNodeDragStop={() => setRoutineEdges((edges) => rebalanceAutomationEdgeLanes(edges, routineNodesRef.current))}
            onNodeClick={(_event, node) => {
              setSelectedRoutineNodeId((current) => current === node.id ? current : node.id);
              const key = `node:${node.id}`;
              if (routineSelectionRef.current !== key) {
                routineSelectionRef.current = key;
                props.setSelection(routineEditorSelection(node.id, node.data));
              }
            }}
            onSelectionChange={({ nodes, edges }) => {
              const selectedNode = nodes[0];
              const edgeIds = edges.map((edge) => edge.id);
              setSelectedRoutineNodeId((current) => current === (selectedNode?.id ?? "") ? current : selectedNode?.id ?? "");
              setSelectedRoutineEdgeIds((current) => sameStringList(current, edgeIds) ? current : edgeIds);
              const key = selectedNode ? `node:${selectedNode.id}` : edgeIds.length ? `edges:${edgeIds.join(",")}` : "";
              if (selectedNode && routineSelectionRef.current !== key) {
                routineSelectionRef.current = key;
                props.setSelection(routineEditorSelection(selectedNode.id, selectedNode.data));
              } else if (!selectedNode) {
                routineSelectionRef.current = key;
              }
            }}
          >
            <Background gap={24} size={1} />
            <MiniMap pannable zoomable />
            <Controls showInteractive={false} />
          </ReactFlow>
          {routineDragSelectBox ? <div className="automation-node-marquee" style={{ left: routineDragSelectBox.left, top: routineDragSelectBox.top, width: routineDragSelectBox.width, height: routineDragSelectBox.height }} /> : null}
        </div>
        <AutomationNodePalette collapsed={paletteCollapsed} disabled={!isFlowMode} groups={palette} title="Routine Nodes" onAddNode={addRoutineNode} onCollapsedChange={setPaletteCollapsed} />
      </div>
    </section>
  );
}

function routineEditorModeSelection(props: { mode: AutomationRoutineEditorMode; nodes: Array<Node<AutomationRoutineNodeData>>; edges: Edge[]; models: any[]; policies: any[] }): AutomationSelection {
  const modeDefinition = automationRoutineEditorModes.find((item) => item.id === props.mode) ?? automationRoutineEditorModes[0]!;
  if (props.mode === "data") {
    return {
      kind: "editor-mode",
      id: "routine:data",
      editor: "routine",
      label: modeDefinition.label,
      description: modeDefinition.description,
      sections: [
        { title: "Data Summary", rows: [["Routine nodes", String(props.nodes.length)], ["Task policies", String(props.policies.length)], ["Learned models", String(props.models.length)], ["Handoffs", String(props.edges.length)]] },
        { title: "Node Data Shape", rows: topRoutineNodeRows(props.nodes) }
      ]
    };
  }
  if (props.mode === "plan") {
    return {
      kind: "editor-mode",
      id: "routine:plan",
      editor: "routine",
      label: modeDefinition.label,
      description: modeDefinition.description,
      sections: [
        { title: "Run Plan Summary", rows: [["Steps", String(props.nodes.length)], ["Routes", String(props.edges.length)], ["Parallel paths", String(props.nodes.filter((node) => node.data.family === "control-flow" && node.data.outputs.length > 2).length)], ["Approvals", String(props.nodes.filter((node) => node.data.privileged).length)]] },
        { title: "Current Behavior", rows: [["Execution order", "Derived from graph connections in a later runtime slice."], ["Canvas editing", "Disabled in Run Plan mode."]] }
      ]
    };
  }
  return {
    kind: "editor-mode",
    id: "routine:plan",
    editor: "routine",
    label: modeDefinition.label,
    description: modeDefinition.description,
    sections: [
      { title: "Run Plan Summary", rows: [["Steps", String(props.nodes.length)], ["Routes", String(props.edges.length)], ["Parallel paths", String(props.nodes.filter((node) => node.data.family === "control-flow" && node.data.outputs.length > 2).length)], ["Approvals", String(props.nodes.filter((node) => node.data.privileged).length)]] },
      { title: "Current Behavior", rows: [["Execution order", "Derived from graph connections in a later runtime slice."], ["Canvas editing", "Disabled in Run Plan mode."]] }
    ]
  };
}

function topRoutineNodeRows(nodes: Array<Node<AutomationRoutineNodeData>>): Array<[string, string]> {
  if (!nodes.length) return [["Routine graph", "Add routine nodes in Flow mode to define data handoffs."]];
  return nodes.slice(0, 6).map((node) => [node.data.label, `${node.data.inputs.length} inputs | ${node.data.outputs.length} outputs`]);
}

function EmptyAutomationView(props: { title: string; message: string }) {
  return <section className="automation-empty-view"><strong>{props.title}</strong><span>{props.message}</span></section>;
}

export function AutomationWorkspaceDock(props: { activeTab: AutomationDockTab; problems: any[]; signals: any[]; models: any[]; selectedNode: any; stateInput: BuildNodeStateViewModelInput; setActiveTab(tab: AutomationDockTab): void; setSelection(selection: AutomationSelection): void }) {
  const tabs: Array<{ id: AutomationDockTab; label: string; count?: number }> = [
    { id: "assistant", label: "Assistant" },
    { id: "problems", label: "Problems", count: props.problems.length },
    { id: "history", label: "History" },
    { id: "state", label: "State View", count: props.signals.length }
  ];
  return (
    <footer className="automation-bottom-dock">
      <div className="automation-dock-tabs">
        {tabs.map((tab) => <button className={props.activeTab === tab.id ? "selected" : ""} key={tab.id} onClick={() => props.setActiveTab(tab.id)} type="button">{tab.label}{tab.count !== undefined ? <span>{tab.count}</span> : null}</button>)}
      </div>
      {props.activeTab === "assistant" ? <div className="automation-dock-panel-grid single">
        <section className="automation-ai-panel">
          <header><Sparkles size={14} aria-hidden /><strong>Context</strong></header>
          <div className="context-chip-row">
            <span>Node: {props.selectedNode?.label ?? "none"}</span>
            <span>Signals: {props.signals.length}</span>
            <span>Models: {props.models.length}</span>
          </div>
          <p>Proposed changes appear here with preview, apply, reject, and evidence before anything edits the policy.</p>
        </section>
      </div> : null}
      {props.activeTab === "problems" ? <div className="automation-dock-panel-grid single">
        <section className="automation-problem-strip">
          <header><AlertTriangle size={14} aria-hidden /><strong>Problems</strong></header>
          {props.problems.slice(0, 3).map((problem) => <button key={problem.id} type="button"><StatusBadge value={problem.severity} />{problem.message}</button>)}
          {!props.problems.length ? <span>No validation problems in the current snapshot.</span> : null}
        </section>
      </div> : null}
      {props.activeTab === "history" ? <div className="automation-dock-panel-grid single">
        <section className="automation-history-strip">
          <header><History size={14} aria-hidden /><strong>Change History</strong></header>
          <span>Generated values will record source, previous value, new value, timestamp, and actor.</span>
        </section>
      </div> : null}
      {props.activeTab === "state" ? <div className="automation-dock-panel-grid single">
        <AutomationStateView input={props.stateInput} setSelection={props.setSelection} />
      </div> : null}
    </footer>
  );
}

export function AutomationPolicyCanvas(props: { active: boolean; editable: boolean; entries: any[]; policy: any; taskGraph?: any; taskGraphDraft?: { nodes: Array<Node<AutomationPolicyNodeData>>; edges: Edge[] } | null; nativeNodeDefinitions: any[]; recordings: any[]; selectedNode: any; selectedTimeline: any; signals: any[]; onSaveGraph(graph: { nodes: Array<Node<AutomationPolicyNodeData>>; edges: Edge[] }): Promise<boolean | void>; onGraphDraftChange(graph: { nodes: Array<Node<AutomationPolicyNodeData>>; edges: Edge[] } | null): void; onDirtyChange(dirty: boolean): void; setSelection(selection: AutomationSelection): void }) {
  const [selectedPolicyNodeId, setSelectedPolicyNodeId] = useState(props.selectedNode?.id ?? "");
  const [selectedPolicyEdgeIds, setSelectedPolicyEdgeIds] = useState<string[]>([]);
  const [paletteCollapsed, setPaletteCollapsed] = useState(false);
  const [policyDragSelectBox, setPolicyDragSelectBox] = useState<AutomationDragSelectBox | null>(null);
  const policyFrameRef = useRef<HTMLDivElement>(null);
  const policySelectionRef = useRef("");
  const policyViewportRestoreRef = useRef<{ x: number; y: number; zoom: number } | null>(null);
  const [policyFlow, setPolicyFlow] = useState<ReactFlowInstance<Node<AutomationPolicyNodeData>, Edge> | null>(null);
  const policyNodesRef = useRef<Array<Node<AutomationPolicyNodeData>>>([]);
  const policyEdgesRef = useRef<Edge[]>([]);
  const savedGraphSignatureRef = useRef("");
  const recentlyConnectedPolicyEdgeIdsRef = useRef<Set<string>>(new Set());
  const taskGraphSignature = props.taskGraph ? automationTaskGraphSourceSignature(props.taskGraph) : "";
  const policyGraphSignature = props.taskGraph ? "" : automationPolicySourceSignature(props.policy);
  const nativeNodeDefinitionSignature = JSON.stringify(props.nativeNodeDefinitions.map((definition) => ({
    id: definition.id,
    version: definition.version,
    parameters: (definition.parameters ?? []).map((parameter: any) => parameter.id),
    inputs: (definition.inputs ?? []).map((input: any) => input.id),
    outputs: (definition.outputs ?? []).map((output: any) => output.id)
  })));
  const taskGraphDraftSignature = props.taskGraphDraft ? graphSignature(props.taskGraphDraft.nodes, props.taskGraphDraft.edges) : "";
  const graph = useMemo(() => props.taskGraphDraft ?? (props.taskGraph ? taskFlowToReactFlowGraph(props.taskGraph, "", props.nativeNodeDefinitions) : policyToReactFlowGraph(props.policy, "")), [taskGraphSignature, policyGraphSignature, nativeNodeDefinitionSignature, taskGraphDraftSignature]);
  const [policyNodes, setPolicyNodes] = useState(graph.nodes);
  const [policyEdges, setPolicyEdges] = useState(graph.edges);
  const policyNodeDragActiveRef = useRef(false);
  const pendingPolicyGraphDraftRef = useRef<{ nodes: Array<Node<AutomationPolicyNodeData>>; edges: Edge[] } | null>(null);
  const policyGraphDraftFlushQueuedRef = useRef(false);
  useEffect(() => {
    const nextEdges = rebalanceAutomationEdgeLanes(graph.edges, graph.nodes);
    setPolicyNodes((current) => syncGraphNodes(current, graph.nodes));
    setPolicyEdges(nextEdges);
    policyNodesRef.current = graph.nodes;
    policyEdgesRef.current = nextEdges;
    savedGraphSignatureRef.current = graphSignature(graph.nodes, nextEdges);
    if (props.active) props.onDirtyChange(Boolean(props.taskGraphDraft));
    setSelectedPolicyEdgeIds([]);
  }, [taskGraphSignature, policyGraphSignature, taskGraphDraftSignature]);
  useEffect(() => {
    if (props.active) props.onDirtyChange(graphSignature(policyNodes, policyEdges) !== savedGraphSignatureRef.current);
  }, [policyNodes, policyEdges, props.active, props.onDirtyChange]);
  useEffect(() => {
    policyNodesRef.current = policyNodes;
  }, [policyNodes]);
  useEffect(() => {
    policyEdgesRef.current = policyEdges;
  }, [policyEdges]);
  useEffect(() => {
    function captureViewport() {
      if (policyFlow) policyViewportRestoreRef.current = policyFlow.getViewport();
    }
    function restoreViewport() {
      const viewport = policyViewportRestoreRef.current;
      if (policyFlow && viewport) void policyFlow.setViewport(viewport, { duration: 0 });
    }
    window.addEventListener("automation-studio:capture-node-viewport", captureViewport);
    window.addEventListener("automation-studio:restore-node-viewport", restoreViewport);
    return () => {
      window.removeEventListener("automation-studio:capture-node-viewport", captureViewport);
      window.removeEventListener("automation-studio:restore-node-viewport", restoreViewport);
    };
  }, [policyFlow]);
  useEffect(() => {
    setSelectedPolicyNodeId(props.selectedNode?.id ?? "");
  }, [props.selectedNode?.id]);
  const dynamicDefinitions = props.nativeNodeDefinitions.map((definition: any): AutomationEditorNodeSpec => ({ id: definition.id, version: definition.version, label: definition.label, description: definition.description, family: definition.category ?? "custom", scope: definition.legacyScope ?? "both", nodeType: "custom", inputs: definition.inputs ?? [], outputs: definition.outputs ?? [], parameters: definition.parameters ?? [], source: definition.source, availability: definition.availability, ...(definition.icon ? { icon: definition.icon } : {}), privileged: definition.safety?.privileged === true, ...(definition.outputAction ? { actionTypes: ["action"] } : {}) }));
  const frameworkGroups = automationEditorPalette.map((group) => ({ ...group, nodes: group.nodes.filter((node) => (node.scope === "policy" || node.scope === "both") && node.family !== "policy") })).filter((group) => group.nodes.length);
  const dynamicGroup = (title: string, predicate: (node: AutomationEditorNodeSpec) => boolean): AutomationEditorPaletteGroup => ({ title, nodes: dynamicDefinitions.filter(predicate) });
  const palette = [
    ...frameworkGroups,
    dynamicGroup("Integrations", (node) => node.source?.kind === "importer" && node.availability?.kind !== "domain"),
    dynamicGroup("Domain Nodes", (node) => node.source?.kind === "importer" && node.availability?.kind === "domain"),
    dynamicGroup("Public Flows", (node) => node.source?.kind === "composite"),
    dynamicGroup("Project Nodes", (node) => node.source?.kind === "recording"),
    dynamicGroup("Code", (node) => node.source?.kind === "code"),
    ...automationEditorPalette.map((group) => ({ ...group, nodes: group.nodes.filter((node) => (node.scope === "policy" || node.scope === "both") && node.family === "policy") }))
  ].filter((group) => group.nodes.length > 0);
  const codeOwned = props.taskGraph?.source?.mode === "code";
  const isFlowMode = !codeOwned && props.editable;
  const policyCanvasSelectionForNode = (node: Node<AutomationPolicyNodeData>): AutomationSelection => {
    if (props.taskGraph) return policyEditorSelection(node.id, node.data);
    return props.policy?.nodes?.some((policyNode: any) => policyNode.id === node.id) ? { kind: "node", id: node.id } : policyEditorSelection(node.id, node.data);
  };
  const publishPolicyGraphDraft = (nodes: Array<Node<AutomationPolicyNodeData>>, edges: Edge[]) => {
    if (!props.taskGraph || !isFlowMode) return;
    pendingPolicyGraphDraftRef.current = { nodes, edges };
    if (policyGraphDraftFlushQueuedRef.current) return;
    policyGraphDraftFlushQueuedRef.current = true;
    queueMicrotask(() => {
      policyGraphDraftFlushQueuedRef.current = false;
      const draft = pendingPolicyGraphDraftRef.current;
      if (!draft) return;
      pendingPolicyGraphDraftRef.current = null;
      props.onGraphDraftChange(draft);
    });
  };
  useEffect(() => {
    async function handleGlobalSave(event: Event) {
      if (!props.active) return;
      const detail = (event as CustomEvent<{ onComplete?: (result: { ok: boolean; message: string }) => void }>).detail;
      if (!props.editable || codeOwned) { detail?.onComplete?.({ ok: false, message: codeOwned ? "Code-owned Flows are read-only in the visual editor." : "Legacy Flows are read-only until migrated." }); return; }
      const saved = await props.onSaveGraph({ nodes: policyNodesRef.current, edges: policyEdgesRef.current });
      if (saved !== false) {
        savedGraphSignatureRef.current = graphSignature(policyNodesRef.current, policyEdgesRef.current);
        props.onDirtyChange(false);
      }
      detail?.onComplete?.({
        ok: saved !== false,
        message: saved === false ? "Flow graph could not be saved." : "Flow graph saved."
      });
    }
    window.addEventListener("automation-studio:global-save", handleGlobalSave);
    return () => window.removeEventListener("automation-studio:global-save", handleGlobalSave);
  }, [props.active, props.editable, props.onSaveGraph, codeOwned]);
  const addPolicyNode = (spec: AutomationEditorNodeSpec) => {
    if (!isFlowMode) return;
    const id = `policy-${spec.id}-${Date.now().toString(36)}`;
    const compositeMetadata = automationCompositeCallMetadata(spec);
    const data: AutomationPolicyNodeData = {
      nodeDefinitionId: spec.id,
      nodeDefinitionVersion: spec.version,
      label: spec.label,
      description: spec.description,
      ...(spec.icon !== undefined ? { icon: spec.icon } : {}),
      actionTypes: spec.actionTypes ?? [],
      recovery: spec.family,
      evidenceCount: 0,
      readinessCount: spec.inputs.length,
      successCount: spec.outputs.length,
      inputs: automationVisualInputPorts(spec.inputs, spec.id),
      outputs: spec.outputs,
      parameters: spec.parameters,
      parameterValues: defaultAutomationParameterValues(spec.parameters),
      ...(compositeMetadata ? { metadata: compositeMetadata } : {}),
      isStart: spec.id === "builtin.control.start"
    };
    const node: Node<AutomationPolicyNodeData> = {
      id,
      type: "policyNode",
      position: roundedAutomationPosition(spawnAutomationNodePosition(selectedPolicyNodeId, policyNodes, policyEdges, policyFlow, policyFrameRef.current)),
      data
    };
    const nextNodes = [...policyNodesRef.current, node];
    policyNodesRef.current = nextNodes;
    setPolicyNodes(nextNodes);
    publishPolicyGraphDraft(nextNodes, policyEdgesRef.current);
    setSelectedPolicyNodeId(id);
    setSelectedPolicyEdgeIds([]);
    props.setSelection(policyEditorSelection(id, data));
    policySelectionRef.current = `node:${id}`;
  };
  const deletePolicySelection = () => {
    const nodeIds = new Set(selectedPolicyNodeId ? [selectedPolicyNodeId] : []);
    const edgeIds = new Set(selectedPolicyEdgeIds);
    const nextNodes = policyNodesRef.current.filter((node) => !nodeIds.has(node.id));
    const nextEdges = rebalanceAutomationEdgeLanes(policyEdgesRef.current.filter((edge) => !edgeIds.has(edge.id) && !nodeIds.has(edge.source) && !nodeIds.has(edge.target)), nextNodes);
    policyNodesRef.current = nextNodes;
    policyEdgesRef.current = nextEdges;
    setPolicyNodes(nextNodes);
    setPolicyEdges(nextEdges);
    publishPolicyGraphDraft(nextNodes, nextEdges);
    setSelectedPolicyNodeId("");
    setSelectedPolicyEdgeIds([]);
  };
  const startPolicyDragSelect = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isFlowMode) return;
    startAutomationNodeMarquee({
      event,
      flow: policyFlow,
      frame: policyFrameRef.current,
      nodes: policyNodes,
      setDragBox: setPolicyDragSelectBox,
      setEdges: (updater) => setPolicyEdges((edges) => updater(edges)),
      setNodes: (updater) => setPolicyNodes((nodes) => updater(nodes)),
      onSelected: (nodes) => {
        const primaryNode = nodes[0];
        setSelectedPolicyNodeId(primaryNode?.id ?? "");
        setSelectedPolicyEdgeIds([]);
        policySelectionRef.current = primaryNode ? `node:${primaryNode.id}` : "";
        if (primaryNode) props.setSelection(policyCanvasSelectionForNode(primaryNode));
      }
    });
  };
  useEffect(() => {
    function handleDeleteNode(event: Event) {
      if (!isFlowMode) return;
      const nodeId = (event as CustomEvent<{ nodeId?: string }>).detail?.nodeId;
      if (!nodeId) return;
      const nextNodes = policyNodesRef.current.filter((node) => node.id !== nodeId);
      const nextEdges = rebalanceAutomationEdgeLanes(policyEdgesRef.current.filter((edge) => edge.source !== nodeId && edge.target !== nodeId), nextNodes);
      policyNodesRef.current = nextNodes;
      policyEdgesRef.current = nextEdges;
      setPolicyNodes(nextNodes);
      setPolicyEdges(nextEdges);
      publishPolicyGraphDraft(nextNodes, nextEdges);
      setSelectedPolicyNodeId((current: string) => current === nodeId ? "" : current);
    }
    function handleDeleteEdge(event: Event) {
      if (!isFlowMode) return;
      const edgeId = (event as CustomEvent<{ edgeId?: string }>).detail?.edgeId;
      if (!edgeId) return;
      setPolicyEdges((edges) => {
        const nextEdges = rebalanceAutomationEdgeLanes(edges.filter((edge) => edge.id !== edgeId), policyNodesRef.current);
        policyEdgesRef.current = nextEdges;
        publishPolicyGraphDraft(policyNodesRef.current, nextEdges);
        return nextEdges;
      });
      setSelectedPolicyEdgeIds((ids) => ids.filter((id) => id !== edgeId));
    }
    function handleSelectEdge(event: Event) {
      if (!isFlowMode) return;
      const edgeId = (event as CustomEvent<{ edgeId?: string }>).detail?.edgeId;
      if (!edgeId || !policyEdgesRef.current.some((edge) => edge.id === edgeId)) return;
      setSelectedPolicyNodeId("");
      setSelectedPolicyEdgeIds([edgeId]);
      const nextEdges = policyEdgesRef.current.map((edge) => ({ ...edge, selected: edge.id === edgeId }));
      policyEdgesRef.current = nextEdges;
      setPolicyEdges(nextEdges);
    }
    function handleUpdateParameters(event: Event) {
      const detail = (event as CustomEvent<{ nodeId?: string; parameterValues?: JsonObject; customDescription?: string }>).detail;
      if (!detail?.nodeId) return;
      const nextNodes = policyNodesRef.current.map((node) => {
        if (node.id !== detail.nodeId) return node;
        const data = { ...node.data, ...(detail.parameterValues ? { parameterValues: detail.parameterValues } : {}), ...(detail.customDescription !== undefined ? { customDescription: detail.customDescription } : {}) };
        if (policySelectionRef.current === `node:${node.id}`) props.setSelection(policyCanvasSelectionForNode({ ...node, data }));
        return { ...node, data };
      });
      policyNodesRef.current = nextNodes;
      setPolicyNodes(nextNodes);
      publishPolicyGraphDraft(nextNodes, policyEdgesRef.current);
    }
    window.addEventListener("automation-studio:delete-node", handleDeleteNode);
    window.addEventListener("automation-studio:delete-edge", handleDeleteEdge);
    window.addEventListener("automation-studio:select-edge", handleSelectEdge);
    window.addEventListener("automation-studio:update-node-parameters", handleUpdateParameters);
    return () => {
      window.removeEventListener("automation-studio:delete-node", handleDeleteNode);
      window.removeEventListener("automation-studio:delete-edge", handleDeleteEdge);
      window.removeEventListener("automation-studio:select-edge", handleSelectEdge);
      window.removeEventListener("automation-studio:update-node-parameters", handleUpdateParameters);
    };
  }, [isFlowMode, props.setSelection, props.taskGraph, props.policy]);
  return (
    <section className="automation-policy-canvas">
      {codeOwned ? <div className="automation-source-warning"><strong>Code-owned Flow</strong><span>The compiled graph is read-only. Change its module and recompile, or explicitly convert it back to visual ownership.</span></div> : null}
      <div className={paletteCollapsed ? "automation-policy-editor-grid palette-collapsed" : "automation-policy-editor-grid"}>
        <div className="automation-react-flow-frame" onContextMenu={(event) => event.preventDefault()} onPointerDownCapture={startPolicyDragSelect} ref={policyFrameRef}>
          <ReactFlow<Node<AutomationPolicyNodeData>, Edge>
            fitView
            fitViewOptions={{ padding: 0.25 }}
            nodes={policyNodes}
            edges={policyEdges}
            edgeTypes={automationEdgeTypes}
            nodeTypes={automationNodeTypes}
            nodesDraggable={isFlowMode}
            nodesConnectable={isFlowMode}
            edgesReconnectable={isFlowMode}
            connectionRadius={automationNodeEditorConnectionRadius}
            elementsSelectable
            deleteKeyCode={isFlowMode ? ["Backspace", "Delete"] : null}
            minZoom={0.1}
            reconnectRadius={automationNodeEditorReconnectRadius}
            onInit={setPolicyFlow}
            isValidConnection={(connection) => automationConnectionIsValid(connection, policyNodes)}
            onConnect={(connection) => {
              if (!isFlowMode) return;
              const nextEdge = createAutomationConnectionEdge(connection, policyEdgesRef.current, "policy-edge", policyNodesRef.current);
              protectRecentlyConnectedEdge(recentlyConnectedPolicyEdgeIdsRef, nextEdge.id);
              setPolicyEdges((edges) => {
                const nextEdges = rebalanceAutomationEdgeLanes(addEdge(nextEdge, edges), policyNodesRef.current);
                policyEdgesRef.current = nextEdges;
                publishPolicyGraphDraft(policyNodesRef.current, nextEdges);
                return nextEdges;
              });
            }}
            onReconnect={(oldEdge, connection) => {
              if (!isFlowMode) return;
              setPolicyEdges((edges) => {
                const nextEdges = reconnectAutomationEdge(oldEdge, connection, edges, policyNodesRef.current);
                policyEdgesRef.current = nextEdges;
                publishPolicyGraphDraft(policyNodesRef.current, nextEdges);
                return nextEdges;
              });
            }}
            onEdgesChange={(changes: EdgeChange[]) => {
              if (!isFlowMode) return;
              const allowedChanges = ignoreProtectedEdgeRemovals(changes, recentlyConnectedPolicyEdgeIdsRef.current);
              if (!allowedChanges.length) return;
              setPolicyEdges((edges) => {
                const nextEdges = rebalanceAutomationEdgeLanes(applyEdgeChanges(allowedChanges, edges), policyNodesRef.current);
                policyEdgesRef.current = nextEdges;
                publishPolicyGraphDraft(policyNodesRef.current, nextEdges);
                return nextEdges;
              });
            }}
            onEdgesDelete={(deletedEdges) => setSelectedPolicyEdgeIds((ids) => ids.filter((id) => !deletedEdges.some((edge) => edge.id === id)))}
            onNodesDelete={(deletedNodes) => {
              const deletedIds = new Set(deletedNodes.map((node) => node.id));
              setPolicyEdges((edges) => {
                const nextEdges = rebalanceAutomationEdgeLanes(edges.filter((edge) => !deletedIds.has(edge.source) && !deletedIds.has(edge.target)), policyNodesRef.current);
                policyEdgesRef.current = nextEdges;
                publishPolicyGraphDraft(policyNodesRef.current.filter((node) => !deletedIds.has(node.id)), nextEdges);
                return nextEdges;
              });
              if (deletedIds.has(selectedPolicyNodeId)) setSelectedPolicyNodeId("");
            }}
            onNodesChange={(changes: NodeChange<Node<AutomationPolicyNodeData>>[]) => {
              if (!isFlowMode) return;
              const nextNodes = applyNodeChanges(changes, policyNodesRef.current);
              policyNodesRef.current = nextNodes;
              const removedNodeIds = new Set(changes.filter((change) => change.type === "remove").map((change) => change.id));
              if (removedNodeIds.size) {
                const nextEdges = rebalanceAutomationEdgeLanes(policyEdgesRef.current.filter((edge) => !removedNodeIds.has(edge.source) && !removedNodeIds.has(edge.target)), nextNodes);
                policyEdgesRef.current = nextEdges;
                setPolicyEdges(nextEdges);
                publishPolicyGraphDraft(nextNodes, nextEdges);
              }
              setPolicyNodes(nextNodes);
            }}
            onEdgeClick={(_event, edge) => {
              setSelectedPolicyNodeId("");
              setSelectedPolicyEdgeIds([edge.id]);
              setPolicyEdges((edges) => {
                const nextEdges = edges.map((item) => ({ ...item, selected: item.id === edge.id }));
                policyEdgesRef.current = nextEdges;
                return nextEdges;
              });
            }}
            onNodeDragStart={() => {
              policyNodeDragActiveRef.current = true;
            }}
            onNodeDragStop={() => {
              policyNodeDragActiveRef.current = false;
              const nodes = policyNodesRef.current;
              setPolicyEdges((edges) => {
                const nextEdges = rebalanceAutomationEdgeLanes(edges, nodes);
                policyEdgesRef.current = nextEdges;
                publishPolicyGraphDraft(nodes, nextEdges);
                return nextEdges;
              });
            }}
            onNodeClick={(_event, node) => {
              setSelectedPolicyNodeId((current: string) => current === node.id ? current : node.id);
              const key = `node:${node.id}`;
              if (policySelectionRef.current !== key) {
                policySelectionRef.current = key;
                props.setSelection(policyCanvasSelectionForNode(node));
              }
            }}
            onSelectionChange={({ nodes, edges }) => {
              const selectedNode = nodes[0];
              const nodeId = selectedNode?.id ?? "";
              const edgeIds = edges.map((edge) => edge.id);
              setSelectedPolicyNodeId((current: string) => current === nodeId ? current : nodeId);
              setSelectedPolicyEdgeIds((current) => sameStringList(current, edgeIds) ? current : edgeIds);
              const key = selectedNode ? `node:${selectedNode.id}` : edgeIds.length ? `edges:${edgeIds.join(",")}` : "";
              if (selectedNode && policySelectionRef.current !== key) {
                policySelectionRef.current = key;
                props.setSelection(policyCanvasSelectionForNode(selectedNode));
              } else if (!selectedNode) {
                policySelectionRef.current = key;
              }
            }}
          >
            <Background gap={24} size={1} />
            <MiniMap pannable zoomable />
            <Controls showInteractive={false} />
          </ReactFlow>
          {policyDragSelectBox ? <div className="automation-node-marquee" style={{ left: policyDragSelectBox.left, top: policyDragSelectBox.top, width: policyDragSelectBox.width, height: policyDragSelectBox.height }} /> : null}
        </div>
        <AutomationNodePalette collapsed={paletteCollapsed} disabled={!isFlowMode} groups={palette} title="Policy Nodes" onAddNode={addPolicyNode} onCollapsedChange={setPaletteCollapsed} />
      </div>
    </section>
  );
}

function graphSignature(nodes: Array<Node<any>>, edges: Edge[]): string {
  return JSON.stringify({
    nodes: nodes.map(({ id, type, position, data }) => ({
      id,
      type,
      position,
      data: graphNodeDataSignature(data)
    })),
    edges: edges.map(({ id, source, target, sourceHandle, targetHandle, data }) => ({ id, source, target, sourceHandle, targetHandle, data }))
  });
}

function graphNodeDataSignature(data: any) {
  return {
    nodeDefinitionId: data?.nodeDefinitionId,
    nodeDefinitionVersion: data?.nodeDefinitionVersion,
    label: data?.label,
    description: data?.description,
    customDescription: data?.customDescription,
    actionTypes: data?.actionTypes,
    recovery: data?.recovery,
    inputs: (data?.inputs ?? []).map((input: any) => input.id),
    outputs: (data?.outputs ?? []).map((output: any) => output.id),
    parameters: (data?.parameters ?? []).map((parameter: any) => parameter.id),
    parameterValues: data?.parameterValues,
    timeoutMs: data?.timeoutMs,
    regionId: data?.regionId,
    metadata: graphMetadataSignature(data?.metadata)
  };
}

function graphMetadataSignature(metadata: any) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return metadata;
  return {
    ownerKind: metadata.ownerKind,
    ownerId: metadata.ownerId,
    proposalId: metadata.proposalId,
    recordingId: metadata.recordingId,
    regionId: metadata.regionId,
    position: metadata.position
  };
}

export type AutomationPolicyGraphEditorMode = "full-edit" | "readonly" | "proposal-review";

export function AutomationPolicyGraphEditor(props: {
  className?: string;
  showPalette?: boolean;
  mode: AutomationPolicyGraphEditorMode;
  nodes: Array<Node<AutomationPolicyNodeData>>;
  edges: Edge[];
  editableNodeIds?: string[];
  selectedNodeId?: string;
  onGraphChange?(graph: { nodes: Array<Node<AutomationPolicyNodeData>>; edges: Edge[] }): void;
  onNodeSelect?(node: Node<AutomationPolicyNodeData>): void;
}) {
  const [nodes, setNodes] = useState(props.nodes);
  const [edges, setEdges] = useState(props.edges);
  const [paletteCollapsed, setPaletteCollapsed] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState(props.selectedNodeId ?? "");
  const [localEditableNodeIds, setLocalEditableNodeIds] = useState<string[]>([]);
  const [flow, setFlow] = useState<ReactFlowInstance<Node<AutomationPolicyNodeData>, Edge> | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef(props.nodes);
  const edgesRef = useRef(props.edges);
  const recentlyConnectedEdgeIdsRef = useRef<Set<string>>(new Set());
  const lastExternalGraphSignatureRef = useRef("");
  const editableNodeKey = (props.editableNodeIds ?? []).join("\u0000");
  const localEditableNodeKey = localEditableNodeIds.join("\u0000");
  const editableNodeIds = useMemo(() => new Set([...(props.editableNodeIds ?? []), ...localEditableNodeIds]), [editableNodeKey, localEditableNodeKey]);
  const canEditGraph = props.mode === "full-edit" || props.mode === "proposal-review";
  const canMoveNode = (node: Node<AutomationPolicyNodeData>) => props.mode === "full-edit" || (props.mode === "proposal-review" && editableNodeIds.has(node.id));
  const palette = automationEditorPalette
    .map((group) => ({ ...group, nodes: group.nodes.filter((node) => node.scope === "policy" || node.scope === "both") }))
    .filter((group) => group.nodes.length > 0);
  useEffect(() => {
    const externalSignature = automationEmbeddedGraphSignature(props.nodes, props.edges, props.selectedNodeId ?? "", props.mode, editableNodeKey);
    if (externalSignature === lastExternalGraphSignatureRef.current) return;
    lastExternalGraphSignatureRef.current = externalSignature;
    setSelectedNodeId(props.selectedNodeId ?? "");
    setLocalEditableNodeIds((current) => {
      const next = current.filter((id) => props.nodes.some((node) => node.id === id));
      return sameStringList(current, next) ? current : next;
    });
    const nextNodes = props.nodes.map((node) => ({
      ...node,
      selected: node.id === props.selectedNodeId,
      draggable: canMoveNode(node),
      data: props.mode === "proposal-review" || node.data.reviewTone
        ? { ...node.data, reviewTone: node.data.reviewTone ?? "proposed" }
        : node.data
    }));
    const nextEdges = rebalanceAutomationEdgeLanes(props.edges, props.nodes);
    nodesRef.current = nextNodes;
    edgesRef.current = nextEdges;
    setNodes(nextNodes);
    setEdges(nextEdges);
  }, [props.edges, props.mode, props.nodes, props.selectedNodeId, editableNodeKey]);
  const emit = (nextNodes: Array<Node<AutomationPolicyNodeData>>, nextEdges: Edge[]) => props.onGraphChange?.({ nodes: nextNodes, edges: nextEdges });
  const removeNodes = (nodeIds: Set<string>) => {
    if (!nodeIds.size || !canEditGraph) return;
    if (props.mode === "proposal-review" && [...nodeIds].some((id) => !editableNodeIds.has(id))) return;
    const nextNodes = nodesRef.current.filter((node) => !nodeIds.has(node.id));
    const nextEdges = edgesRef.current.filter((edge) => !nodeIds.has(edge.source) && !nodeIds.has(edge.target));
    nodesRef.current = nextNodes;
    edgesRef.current = nextEdges;
    setNodes(nextNodes);
    setEdges(nextEdges);
    emit(nextNodes, nextEdges);
  };
  const removeEdge = (edgeId: string) => {
    if (!edgeId || !canEditGraph) return;
    const nextEdges = edgesRef.current.filter((edge) => edge.id !== edgeId);
    edgesRef.current = nextEdges;
    setEdges(nextEdges);
    emit(nodesRef.current, nextEdges);
  };
  const selectEdge = (edgeId: string) => {
    if (!edgeId || !edgesRef.current.some((edge) => edge.id === edgeId)) return;
    const nextEdges = edgesRef.current.map((edge) => ({ ...edge, selected: edge.id === edgeId }));
    edgesRef.current = nextEdges;
    setEdges(nextEdges);
  };
  useEffect(() => {
    function handleDeleteNode(event: Event) {
      const nodeId = (event as CustomEvent<{ nodeId?: string }>).detail?.nodeId;
      if (nodeId) removeNodes(new Set([nodeId]));
    }
    function handleDeleteEdge(event: Event) {
      const edgeId = (event as CustomEvent<{ edgeId?: string }>).detail?.edgeId;
      if (edgeId) removeEdge(edgeId);
    }
    function handleSelectEdge(event: Event) {
      const edgeId = (event as CustomEvent<{ edgeId?: string }>).detail?.edgeId;
      if (edgeId) selectEdge(edgeId);
    }
    window.addEventListener("automation-studio:delete-node", handleDeleteNode);
    window.addEventListener("automation-studio:delete-edge", handleDeleteEdge);
    window.addEventListener("automation-studio:select-edge", handleSelectEdge);
    return () => {
      window.removeEventListener("automation-studio:delete-node", handleDeleteNode);
      window.removeEventListener("automation-studio:delete-edge", handleDeleteEdge);
      window.removeEventListener("automation-studio:select-edge", handleSelectEdge);
    };
  }, [canEditGraph, editableNodeKey, localEditableNodeKey, props.mode]);
  const addNode = (spec: AutomationEditorNodeSpec) => {
    if (!canEditGraph) return;
    const id = `proposal-${spec.id}-${Date.now().toString(36)}`;
    const compositeMetadata = automationCompositeCallMetadata(spec);
    const data: AutomationPolicyNodeData = {
      nodeDefinitionId: spec.id,
      nodeDefinitionVersion: spec.version,
      label: spec.label,
      description: spec.description,
      ...(spec.icon !== undefined ? { icon: spec.icon } : {}),
      actionTypes: spec.actionTypes ?? [],
      recovery: spec.family,
      evidenceCount: 0,
      readinessCount: spec.inputs.length,
      successCount: spec.outputs.length,
      inputs: automationVisualInputPorts(spec.inputs, spec.id),
      outputs: spec.outputs,
      parameters: spec.parameters,
      parameterValues: defaultAutomationParameterValues(spec.parameters),
      ...(compositeMetadata ? { metadata: compositeMetadata } : {}),
      isStart: false,
      reviewTone: "proposed"
    };
    const node: Node<AutomationPolicyNodeData> = {
      id,
      type: "policyNode",
      position: roundedAutomationPosition(spawnAutomationNodePosition(selectedNodeId, nodes, edges, flow, frameRef.current)),
      draggable: true,
      data
    };
    const nextNodes = [...nodes, node];
    nodesRef.current = nextNodes;
    setLocalEditableNodeIds((current) => current.includes(id) ? current : [...current, id]);
    setNodes(nextNodes);
    setSelectedNodeId(id);
    emit(nextNodes, edges);
  };
  return (
    <div className={props.showPalette ? paletteCollapsed ? "automation-graph-embed-shell with-palette palette-collapsed" : "automation-graph-embed-shell with-palette" : "automation-graph-embed-shell"}>
      <div className={props.className ? `automation-graph-embed ${props.className}` : "automation-graph-embed"} ref={frameRef}>
        <ReactFlow<Node<AutomationPolicyNodeData>, Edge>
        fitView
        fitViewOptions={{ padding: 0.28 }}
        nodes={nodes}
        edges={edges}
        edgeTypes={automationEdgeTypes}
        nodeTypes={automationNodeTypes}
        nodesDraggable={props.mode === "full-edit" || props.mode === "proposal-review"}
        nodesConnectable={canEditGraph}
        edgesReconnectable={canEditGraph}
        elementsSelectable
        deleteKeyCode={canEditGraph ? ["Backspace", "Delete"] : null}
        minZoom={0.1}
        nodesFocusable
        edgesFocusable
        onInit={setFlow}
        onNodeClick={(_event, node) => {
          setSelectedNodeId(node.id);
          props.onNodeSelect?.(node);
        }}
        onNodesChange={(changes: NodeChange<Node<AutomationPolicyNodeData>>[]) => {
          const allowedChanges = props.mode === "proposal-review"
            ? changes.filter((change) => !("id" in change) || editableNodeIds.has(change.id))
            : changes;
          if (!canEditGraph) return;
          const nextNodes = applyNodeChanges(allowedChanges, nodesRef.current);
          const removedNodeIds = new Set(allowedChanges.filter((change) => change.type === "remove").map((change) => change.id));
          const nextEdges = removedNodeIds.size
            ? edgesRef.current.filter((edge) => !removedNodeIds.has(edge.source) && !removedNodeIds.has(edge.target))
            : edgesRef.current;
          nodesRef.current = nextNodes;
          edgesRef.current = nextEdges;
          setNodes(nextNodes);
          if (nextEdges !== edges) setEdges(nextEdges);
          const shouldPersist = allowedChanges.some((change) => change.type === "remove");
          if (shouldPersist) emit(nextNodes, nextEdges);
        }}
        onNodeDragStop={() => {
          const currentNodes = nodesRef.current;
          const nextEdges = rebalanceAutomationEdgeLanes(edgesRef.current, currentNodes);
          edgesRef.current = nextEdges;
          setEdges(nextEdges);
          emit(currentNodes, nextEdges);
        }}
        onEdgesChange={(changes: EdgeChange[]) => {
          if (!canEditGraph) return;
          const allowedChanges = ignoreProtectedEdgeRemovals(changes, recentlyConnectedEdgeIdsRef.current);
          if (!allowedChanges.length) return;
          const nextEdges = rebalanceAutomationEdgeLanes(applyEdgeChanges(allowedChanges, edgesRef.current), nodesRef.current);
          edgesRef.current = nextEdges;
          setEdges(nextEdges);
          emit(nodesRef.current, nextEdges);
        }}
        onEdgeClick={(_event, edge) => {
          const nextEdges = edgesRef.current.map((item) => ({ ...item, selected: item.id === edge.id }));
          edgesRef.current = nextEdges;
          setEdges(nextEdges);
        }}
        onConnect={(connection) => {
          if (!canEditGraph) return;
          const nextEdge = createAutomationConnectionEdge(connection, edgesRef.current, "policy-edge", nodesRef.current);
          protectRecentlyConnectedEdge(recentlyConnectedEdgeIdsRef, nextEdge.id);
          const nextEdges = rebalanceAutomationEdgeLanes(addEdge(nextEdge, edgesRef.current), nodesRef.current);
          edgesRef.current = nextEdges;
          setEdges(nextEdges);
          emit(nodesRef.current, nextEdges);
        }}
        onReconnect={(oldEdge, connection) => {
          if (!canEditGraph) return;
          const nextEdges = reconnectAutomationEdge(oldEdge, connection, edgesRef.current, nodesRef.current);
          edgesRef.current = nextEdges;
          setEdges(nextEdges);
          emit(nodesRef.current, nextEdges);
        }}
      >
        <Background gap={24} size={1} />
        <MiniMap pannable zoomable />
        <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      {props.showPalette ? <AutomationNodePalette collapsed={paletteCollapsed} disabled={!canEditGraph} groups={palette} title="Proposal Nodes" onAddNode={addNode} onCollapsedChange={setPaletteCollapsed} /> : null}
    </div>
  );
}

function AutomationPolicyNode({ id, data, selected }: NodeProps) {
  const node = data as AutomationPolicyNodeData;
  const Icon = automationNodeIcon(node.icon, node.recovery);
  const description = node.customDescription || node.description || node.actionTypes.join(", ") || "Policy node";
  const toneClass = node.reviewTone ? ` ${node.reviewTone}` : "";
  return (
    <div className={selected ? `automation-flow-node selected${toneClass}` : `automation-flow-node${toneClass}`}>
      {selected ? <SelectedNodeDeleteButton nodeId={id} /> : null}
      {selected ? <SelectedNodeStateButton nodeId={id} /> : null}
      <div className="node-badges">
        {node.isStart ? <span className="node-badge start">Start</span> : null}
        <span className="node-badge category">{node.nodeDefinitionId ? "Base" : "Generated"}</span>
        <span className="node-badge category">{node.recovery.replace(/_/g, " ")}</span>
        {node.regionName ? <span className={`node-badge region-${node.regionKind}`}>{node.regionName}</span> : null}
        {node.confidence !== undefined ? <span className="node-badge confidence">{Math.round(node.confidence * 100)}%</span> : null}
      </div>
      <div className="automation-flow-node-main">
        <span className="node-icon" title={node.nodeDefinitionId ? node.label : "Generated policy node"}>
          <Icon size={18} strokeWidth={2.2} />
        </span>
        <div>
          <strong>{node.label}</strong>
          <span>{description}</span>
        </div>
      </div>
      <div className="node-definition-lines">
        <span>Eligible: {node.readinessCount || 0} signals</span>
        <span>Success: {node.successCount || 0} expectations</span>
        <span>Timeout: {node.timeoutMs ? `${(node.timeoutMs / 1000).toFixed(1)}s` : "default"}</span>
      </div>
      <AutomationNodePortList inputs={node.inputs} outputs={node.outputs} />
      <div className="node-state-indicators">
        <span className={node.readinessCount ? "node-state-chip has-state" : "node-state-chip empty-state"}>Ready {node.readinessCount}</span>
        <span className={node.successCount ? "node-state-chip has-state" : "node-state-chip empty-state"}>Success {node.successCount}</span>
        <span className="node-state-chip has-state">Evidence {node.evidenceCount}</span>
      </div>
      <footer className="node-runtime-line">12 successes - 1 retry</footer>
    </div>
  );
}

function automationEmbeddedGraphSignature(nodes: Array<Node<AutomationPolicyNodeData>>, edges: Edge[], selectedNodeId: string, mode: AutomationPolicyGraphEditorMode, editableNodeKey: string): string {
  return JSON.stringify({
    selectedNodeId,
    mode,
    editableNodeKey,
    nodes: nodes.map((node) => ({
      id: node.id,
      x: Math.round(node.position.x),
      y: Math.round(node.position.y),
      label: node.data.label,
      description: node.data.description,
      customDescription: node.data.customDescription,
      reviewTone: node.data.reviewTone
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      label: edge.label ?? edge.data?.label
    }))
  });
}

function automationTaskGraphSourceSignature(graph: any): string {
  return JSON.stringify({
    flowId: graph?.flowId,
    ownerId: graph?.ownerId,
    updatedAt: graph?.updatedAt,
    nodes: (graph?.nodes ?? []).map((node: any) => ({
      id: node.id,
      definitionId: node.definitionId,
      definitionVersion: node.definitionVersion,
      label: node.label,
      description: node.description,
      position: node.position,
      parameterValues: node.parameterValues,
      metadata: node.metadata
    })),
    edges: (graph?.edges ?? []).map((edge: any) => ({
      id: edge.id,
      sourceNodeId: edge.sourceNodeId,
      targetNodeId: edge.targetNodeId,
      sourcePortId: edge.sourcePortId,
      targetPortId: edge.targetPortId,
      label: edge.label,
      metadata: edge.metadata
    }))
  });
}

function automationPolicySourceSignature(policy: any): string {
  return JSON.stringify({
    policyId: policy?.policyId,
    taskId: policy?.taskId,
    updatedAt: policy?.updatedAt ?? policy?.generatedMetadata?.generatedAt,
    nodes: (policy?.nodes ?? []).map((node: any) => ({
      id: node.id,
      label: node.label,
      description: node.description,
      metadata: node.metadata,
      actions: node.actions,
      recovery: node.recovery,
      timeout: node.timeout
    })),
    edges: (policy?.edges ?? []).map((edge: any) => ({
      id: edge.id,
      fromNodeId: edge.fromNodeId,
      toNodeId: edge.toNodeId,
      label: edge.label,
      metadata: edge.metadata
    }))
  });
}

function AutomationRoutineNode({ id, data, selected }: NodeProps) {
  const node = data as AutomationRoutineNodeData;
  const Icon = automationNodeIcon(node.icon, node.family);
  const description = node.customDescription || node.description;
  return (
    <div className={selected ? `automation-flow-node routine-node selected ${node.nodeType}` : `automation-flow-node routine-node ${node.nodeType}`}>
      {selected ? <SelectedNodeDeleteButton nodeId={id} /> : null}
      <div className="node-badges">
        <span className={node.nodeType === "custom" ? "node-badge custom" : "node-badge category"}>{node.nodeType}</span>
        <span className="node-badge category">{node.family}</span>
        {node.privileged ? <span className="node-badge privileged">PIN</span> : null}
      </div>
      <div className="automation-flow-node-main">
        <span className="node-icon" title={node.label}>
          <Icon size={18} strokeWidth={2.2} />
        </span>
        <div>
          <strong>{node.label}</strong>
          <span>{description}</span>
        </div>
      </div>
      <div className="node-definition-lines">
        <span>Inputs: {node.inputs.length}</span>
        <span>Outputs: {node.outputs.length}</span>
        <span>Scope: routine orchestration</span>
      </div>
      <AutomationNodePortList inputs={node.inputs} outputs={node.outputs} />
      <footer className="node-runtime-line">No recordings or state bindings</footer>
    </div>
  );
}

function AutomationNodePortList(props: { inputs: AutomationNodePort[]; outputs: AutomationNodePort[] }) {
  return (
    <div className="automation-node-port-list">
      <div className="automation-node-port-column input">
        {props.inputs.length ? props.inputs.map((port) => <AutomationNodePortRow key={port.id} port={port} direction="target" />) : <span className="empty">No inputs</span>}
      </div>
      <div className="automation-node-port-column output">
        {props.outputs.length ? props.outputs.map((port) => <AutomationNodePortRow key={port.id} port={port} direction="source" />) : <span className="empty">No outputs</span>}
      </div>
    </div>
  );
}

function AutomationNodePortRow(props: { port: AutomationNodePort; direction: "source" | "target" }) {
  const tone = automationPortTone(props.port, props.direction);
  const caption = automationPortCaption(props.port, props.direction);
  return (
    <span className={`tone-${tone}`} title={automationPortTitle(props.port, props.direction)}>
      <Handle
        type={props.direction}
        position={props.direction === "source" ? Position.Right : Position.Left}
        id={props.port.id}
        className={`${props.direction === "source" ? "automation-flow-handle output" : "automation-flow-handle input"} tone-${tone}`}
        title={automationPortTitle(props.port, props.direction)}
      />
      <i aria-hidden />
      <strong>{automationPortDisplayLabel(props.port)}</strong>
      {caption ? <small>{caption}</small> : null}
    </span>
  );
}

function SelectedNodeDeleteButton(props: { nodeId: string }) {
  return (
    <button
      className="automation-node-delete-button nodrag nopan"
      onClick={(event) => {
        event.stopPropagation();
        window.dispatchEvent(new CustomEvent("automation-studio:delete-node", { detail: { nodeId: props.nodeId } }));
      }}
      title="Delete node"
      aria-label="Delete node"
      type="button"
    >
      <Trash2 size={13} aria-hidden />
    </button>
  );
}

function SelectedNodeStateButton(props: { nodeId: string }) {
  return (
    <button
      className="automation-node-state-button nodrag nopan"
      onClick={(event) => {
        event.stopPropagation();
        window.dispatchEvent(new CustomEvent("automation-studio:open-node-state", { detail: { nodeId: props.nodeId } }));
      }}
      title="Open state"
      aria-label="Open state"
      type="button"
    >
      <ListChecks size={13} aria-hidden />
    </button>
  );
}

function AutomationFlowEdge(props: EdgeProps) {
  const route = automationEdgeRoute(props.id, props.sourceX, props.sourceY, props.targetX, props.targetY, props.data as Record<string, unknown> | undefined);
  const [edgePath, labelX, labelY] = route.kind === "loop"
    ? automationLoopEdgePath(props.sourceX, props.sourceY, props.targetX, props.targetY, route.lane)
    : automationLaneEdgePath(props.sourceX, props.sourceY, props.targetX, props.targetY, route.lane);
  const label = String(props.label ?? props.data?.label ?? "");
  const selectEdge = () => window.dispatchEvent(new CustomEvent("automation-studio:select-edge", { detail: { edgeId: props.id } }));
  const deleteEdge = () => window.dispatchEvent(new CustomEvent("automation-studio:delete-edge", { detail: { edgeId: props.id } }));
  return (
    <>
      <BaseEdge
        id={props.id}
        path={edgePath}
        interactionWidth={24}
        style={{
          ...props.style,
          strokeWidth: props.selected ? 4 : props.style?.strokeWidth
        }}
        {...(props.markerEnd ? { markerEnd: props.markerEnd } : {})}
      />
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={24}
        style={{ cursor: "pointer", pointerEvents: "stroke" }}
        onPointerDown={(event) => {
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          selectEdge();
        }}
      />
      {label ? (
        <EdgeLabelRenderer>
          <span className={props.selected ? "automation-edge-label selected nodrag nopan" : "automation-edge-label nodrag nopan"} style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}>{label}</span>
        </EdgeLabelRenderer>
      ) : null}
      {props.selected ? (
        <EdgeLabelRenderer>
          <button
            className="automation-edge-delete-button nodrag nopan"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              deleteEdge();
            }}
            onPointerUp={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY - 28}px)` }}
            title="Delete edge"
            aria-label="Delete edge"
            type="button"
          >
            <Trash2 size={13} aria-hidden />
          </button>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
