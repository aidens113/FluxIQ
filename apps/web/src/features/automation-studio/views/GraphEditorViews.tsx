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
import { automationConnectionIsValid, automationPortCaption, automationPortDisplayLabel, automationPortTitle, automationPortTone, uniqueAutomationPorts } from "../graph/ports";
import { automationEdgeRoute, automationLaneEdgePath, automationLoopEdgePath, automationVisualInputPorts, createAutomationConnectionEdge, defaultAutomationParameterValues, flattenRunLogs, policyToReactFlowGraph, rebalanceAutomationEdgeLanes, reconnectAutomationEdge, roundedAutomationPosition, routineToReactFlowGraph, spawnAutomationNodePosition, startAutomationNodeMarquee, syncGraphNodes } from "../graph/view-model";
import { timelineEntrySummary } from "../timeline/view-model";
import { groupByNamespace, sameStringList } from "./view-utils";

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
      actionTypes: data.actionTypes
    }
  };
}

type AutomationTaskEditorMode = "flow" | "state" | "evidence" | "test";
type AutomationRoutineEditorMode = "flow" | "data" | "plan" | "test";

const automationTaskEditorModes: Array<{ id: AutomationTaskEditorMode; label: string; description: string }> = [
  { id: "flow", label: "Flow", description: "Edit policy nodes, routes, conditions, actions, retries, and recovery." },
  { id: "state", label: "State", description: "Inspect task signals, observed state changes, volatility, and expectations." },
  { id: "evidence", label: "Evidence", description: "Review recordings, notes, checkpoints, normalized timeline entries, and raw evidence links." },
  { id: "test", label: "Test Run", description: "Preview policy execution against the selected recording and state timeline." }
];

const automationRoutineEditorModes: Array<{ id: AutomationRoutineEditorMode; label: string; description: string }> = [
  { id: "flow", label: "Flow", description: "Edit routine orchestration nodes, routes, branches, waits, approvals, and recovery." },
  { id: "data", label: "Data", description: "Inspect routine inputs, outputs, variables, handoffs, and configuration values." },
  { id: "plan", label: "Run Plan", description: "Review execution order, dependencies, parallel paths, and validation warnings." },
  { id: "test", label: "Test Run", description: "Preview routine execution, skipped branches, approval pauses, retries, and final status." }
];
const automationNodeEditorConnectionRadius = 72;
const automationNodeEditorReconnectRadius = 22;

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
  useEffect(() => {
    setRoutineNodes((current) => syncGraphNodes(current, graph.nodes));
    setRoutineEdges(rebalanceAutomationEdgeLanes(graph.edges, graph.nodes));
  }, [graph.edges, graph.nodes]);
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
    function handleUpdateParameters(event: Event) {
      const detail = (event as CustomEvent<{ nodeId?: string; parameterValues?: JsonObject; customDescription?: string }>).detail;
      if (!detail?.nodeId) return;
      setRoutineNodes((nodes) => nodes.map((node) => node.id === detail.nodeId ? { ...node, data: { ...node.data, ...(detail.parameterValues ? { parameterValues: detail.parameterValues } : {}), ...(detail.customDescription !== undefined ? { customDescription: detail.customDescription } : {}) } } : node));
    }
    window.addEventListener("automation-studio:delete-node", handleDeleteNode);
    window.addEventListener("automation-studio:delete-edge", handleDeleteEdge);
    window.addEventListener("automation-studio:update-node-parameters", handleUpdateParameters);
    return () => {
      window.removeEventListener("automation-studio:delete-node", handleDeleteNode);
      window.removeEventListener("automation-studio:delete-edge", handleDeleteEdge);
      window.removeEventListener("automation-studio:update-node-parameters", handleUpdateParameters);
    };
  }, [isFlowMode]);
  return (
    <section className="automation-policy-canvas routine-canvas">
      <div className="automation-editor-mode-bar">
        <div className="automation-layer-tabs" role="tablist" aria-label="Routine editor modes">
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
            onConnect={(connection) => isFlowMode ? setRoutineEdges((edges) => rebalanceAutomationEdgeLanes(addEdge(createAutomationConnectionEdge(connection, edges, "routine-edge", routineNodes), edges), routineNodes)) : undefined}
            onReconnect={(oldEdge, connection) => isFlowMode ? setRoutineEdges((edges) => reconnectAutomationEdge(oldEdge, connection, edges, routineNodes)) : undefined}
            onEdgesChange={(changes: EdgeChange[]) => isFlowMode ? setRoutineEdges((edges) => rebalanceAutomationEdgeLanes(applyEdgeChanges(changes, edges), routineNodes)) : undefined}
            onEdgesDelete={(deletedEdges) => setSelectedRoutineEdgeIds((ids) => ids.filter((id) => !deletedEdges.some((edge) => edge.id === id)))}
            onNodesDelete={(deletedNodes) => {
              const deletedIds = new Set(deletedNodes.map((node) => node.id));
              setRoutineEdges((edges) => rebalanceAutomationEdgeLanes(edges.filter((edge) => !deletedIds.has(edge.source) && !deletedIds.has(edge.target)), routineNodes));
              if (deletedIds.has(selectedRoutineNodeId)) setSelectedRoutineNodeId("");
            }}
            onNodesChange={(changes: NodeChange<Node<AutomationRoutineNodeData>>[]) => isFlowMode ? setRoutineNodes((nodes) => {
              const nextNodes = applyNodeChanges(changes, nodes);
              setRoutineEdges((edges) => rebalanceAutomationEdgeLanes(edges, nextNodes));
              return nextNodes;
            }) : undefined}
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

function taskEditorModeSelection(props: { entries: any[]; mode: AutomationTaskEditorMode; policy: any; recordings: any[]; selectedTimeline: any; signals: any[] }): AutomationSelection {
  const modeDefinition = automationTaskEditorModes.find((item) => item.id === props.mode) ?? automationTaskEditorModes[0]!;
  const stateEntries = props.entries.filter((entry) => entry.type === "state_delta" || entry.type === "state_checkpoint");
  const actionEntries = props.entries.filter((entry) => entry.type === "action");
  const noteEntries = props.entries.filter((entry) => entry.type === "note");
  const stateDeltas = stateEntries.reduce((total, entry) => total + (entry.deltas?.length ?? 0), 0);
  const policyConditions = props.policy?.nodes?.reduce((total: number, node: any) => total + (node.readiness?.length ?? 0) + (node.successConditions?.length ?? 0), 0) ?? 0;
  if (props.mode === "state") {
    return {
      kind: "editor-mode",
      id: "task:state",
      editor: "task",
      label: modeDefinition.label,
      description: modeDefinition.description,
      sections: [
        { title: "State Summary", rows: [["Signals", String(props.signals.length)], ["State timeline entries", String(stateEntries.length)], ["State deltas", String(stateDeltas)], ["Policy conditions", String(policyConditions)]] },
        { title: "Visible Signals", rows: topSignalRows(props.signals) }
      ]
    };
  }
  if (props.mode === "evidence") {
    return {
      kind: "editor-mode",
      id: "task:evidence",
      editor: "task",
      label: modeDefinition.label,
      description: modeDefinition.description,
      sections: [
        { title: "Evidence Summary", rows: [["Recordings", String(props.recordings.length)], ["Timeline entries", String(props.selectedTimeline?.timeline?.length ?? props.entries.length)], ["Actions", String(actionEntries.length)], ["Notes", String(noteEntries.length)]] },
        { title: "Recent Evidence", rows: topTimelineRows(props.entries) }
      ]
    };
  }
  return {
    kind: "editor-mode",
    id: "task:test",
    editor: "task",
    label: modeDefinition.label,
    description: modeDefinition.description,
    sections: [
      { title: "Test Run Summary", rows: [["Runnable nodes", String(props.policy?.nodes?.length ?? 0)], ["Routes", String(props.policy?.edges?.length ?? 0)], ["Replay entries", String(props.entries.length)], ["Signals", String(props.signals.length)]] },
      { title: "Current Behavior", rows: [["Simulation", "Uses selected recording/state data once runtime simulation is connected."], ["Canvas editing", "Disabled in Test Run mode."]] }
    ]
  };
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
    id: "routine:test",
    editor: "routine",
    label: modeDefinition.label,
    description: modeDefinition.description,
    sections: [
      { title: "Test Run Summary", rows: [["Steps", String(props.nodes.length)], ["Routes", String(props.edges.length)], ["Retries", String(props.nodes.filter((node) => node.data.label.toLowerCase().includes("retry")).length)], ["Terminal nodes", String(props.nodes.filter((node) => node.data.outputs.length === 0).length)]] },
      { title: "Current Behavior", rows: [["Simulation", "Will show skipped branches, approval pauses, retries, and final routine status."], ["Canvas editing", "Disabled in Test Run mode."]] }
    ]
  };
}

function topSignalRows(signals: any[]): Array<[string, string]> {
  if (!signals.length) return [["Signals", "No state signals loaded yet."]];
  return signals.slice(0, 6).map((signal) => [signal.path ?? "Signal", `${signal.type ?? "unknown"} | ${signal.volatility ?? "normal"}`]);
}

function topTimelineRows(entries: any[]): Array<[string, string]> {
  if (!entries.length) return [["Evidence", "No recording evidence loaded for this task."]];
  return entries.slice(0, 5).map((entry, index) => [`${index + 1}. ${entry.type ?? "Entry"}`, timelineEntrySummary(entry)]);
}

function topRoutineNodeRows(nodes: Array<Node<AutomationRoutineNodeData>>): Array<[string, string]> {
  if (!nodes.length) return [["Routine graph", "Add routine nodes in Flow mode to define data handoffs."]];
  return nodes.slice(0, 6).map((node) => [node.data.label, `${node.data.inputs.length} inputs | ${node.data.outputs.length} outputs`]);
}

export function AutomationStateExplorerView(props: { signals: any[]; entries: any[]; setSelection(selection: AutomationSelection): void }) {
  const [mode, setMode] = useState<"Tree" | "Table" | "Diff" | "Graph" | "Raw">("Tree");
  const stateEntries = props.entries.filter((entry) => entry.type === "state_delta" || entry.type === "state_checkpoint");
  const stateDeltas = stateEntries.flatMap((entry) => entry.deltas ?? []);
  const namespaces = groupByNamespace(props.signals);
  return (
    <section className="automation-state-explorer-view">
      <div className="segmented-control">{(["Tree", "Table", "Diff", "Graph", "Raw"] as const).map((item) => <button className={mode === item ? "selected" : ""} key={item} onClick={() => setMode(item)} type="button">{item}</button>)}</div>
      <div className="automation-state-list">
        {mode === "Diff" ? stateDeltas.map((delta, index) => (
          <button key={`${delta.path?.namespace ?? "state"}:${delta.path?.path ?? index}:${index}`} type="button">
            <strong>{statePathLabel(delta.path)}</strong>
            <span>{delta.change} | {stateValueLabel(delta.previous)} {"->"} {stateValueLabel(delta.current)}</span>
          </button>
        )) : Object.entries(namespaces).map(([namespace, namespaceSignals]) => (
          <div className="automation-state-namespace" key={namespace}>
            <strong>{namespace}</strong>
            {namespaceSignals.map((signal) => (
              <button key={signal.path} onClick={() => props.setSelection({ kind: "signal", id: signal.path })} type="button">
                <strong>{signal.path}</strong>
                <span>{mode}: {signal.type} | {signal.comparator?.kind ?? "exact"} | weight {signal.defaultWeight}</span>
              </button>
            ))}
          </div>
        ))}
        {!props.signals.length ? <span>No state signals available.</span> : null}
      </div>
      <div className="automation-range-summary"><strong>State Framework</strong><span>Signals {props.signals.length}</span><span>State entries {stateEntries.length}</span><span>Deltas {stateDeltas.length}</span></div>
    </section>
  );
}

function statePathLabel(pathValue: any): string {
  if (!pathValue) return "state";
  return `${pathValue.namespace ?? "state"}.${pathValue.path ?? ""}`;
}

function stateValueLabel(value: any): string {
  if (!value) return "unset";
  if (value.value === undefined) return "unset";
  if (typeof value.value === "object") return value.type ?? "object";
  return String(value.value);
}

function EmptyAutomationView(props: { title: string; message: string }) {
  return <section className="automation-empty-view"><strong>{props.title}</strong><span>{props.message}</span></section>;
}

export function AutomationWorkspaceDock(props: { activeTab: AutomationDockTab; problems: any[]; signals: any[]; models: any[]; selectedNode: any; setActiveTab(tab: AutomationDockTab): void }) {
  const tabs: Array<{ id: AutomationDockTab; label: string; count?: number }> = [
    { id: "assistant", label: "Assistant" },
    { id: "problems", label: "Problems", count: props.problems.length },
    { id: "history", label: "History" },
    { id: "state", label: "State Explorer", count: props.signals.length }
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
        <section className="automation-history-strip">
          <header><ListChecks size={14} aria-hidden /><strong>State Signals</strong></header>
          <div className="context-chip-row">{props.signals.slice(0, 8).map((signal) => <span key={signal.path}>{signal.path}</span>)}</div>
        </section>
      </div> : null}
    </footer>
  );
}

export function AutomationPolicyCanvas(props: { entries: any[]; policy: any; recordings: any[]; selectedNode: any; selectedTimeline: any; signals: any[]; setSelection(selection: AutomationSelection): void }) {
  const [mode, setMode] = useState<AutomationTaskEditorMode>("flow");
  const [selectedPolicyNodeId, setSelectedPolicyNodeId] = useState(props.selectedNode?.id ?? "");
  const [selectedPolicyEdgeIds, setSelectedPolicyEdgeIds] = useState<string[]>([]);
  const [paletteCollapsed, setPaletteCollapsed] = useState(false);
  const [policyDragSelectBox, setPolicyDragSelectBox] = useState<AutomationDragSelectBox | null>(null);
  const policyFrameRef = useRef<HTMLDivElement>(null);
  const policySelectionRef = useRef("");
  const policyViewportRestoreRef = useRef<{ x: number; y: number; zoom: number } | null>(null);
  const [policyFlow, setPolicyFlow] = useState<ReactFlowInstance<Node<AutomationPolicyNodeData>, Edge> | null>(null);
  const graph = useMemo(() => policyToReactFlowGraph(props.policy, ""), [props.policy]);
  const [policyNodes, setPolicyNodes] = useState(graph.nodes);
  const [policyEdges, setPolicyEdges] = useState(graph.edges);
  useEffect(() => {
    setPolicyNodes((current) => syncGraphNodes(current, graph.nodes));
    setPolicyEdges(rebalanceAutomationEdgeLanes(graph.edges, graph.nodes));
    setSelectedPolicyEdgeIds([]);
  }, [graph.edges, graph.nodes]);
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
  const palette = automationEditorPalette
    .map((group) => ({ ...group, nodes: group.nodes.filter((node) => node.scope === "policy" || node.scope === "both") }))
    .filter((group) => group.nodes.length > 0);
  const activeMode = automationTaskEditorModes.find((item) => item.id === mode) ?? { id: "flow", label: "Flow", description: "Edit policy nodes, routes, conditions, actions, retries, and recovery." };
  const isFlowMode = mode === "flow";
  const selectTaskMode = (nextMode: AutomationTaskEditorMode) => {
    setMode(nextMode);
    if (nextMode !== "flow") props.setSelection(taskEditorModeSelection({ entries: props.entries, mode: nextMode, policy: props.policy, recordings: props.recordings, selectedTimeline: props.selectedTimeline, signals: props.signals }));
  };
  const addPolicyNode = (spec: AutomationEditorNodeSpec) => {
    if (!isFlowMode) return;
    const id = `policy-${spec.id}-${Date.now().toString(36)}`;
    const data: AutomationPolicyNodeData = {
      nodeDefinitionId: spec.id,
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
      isStart: spec.id === "builtin.control.start"
    };
    const node: Node<AutomationPolicyNodeData> = {
      id,
      type: "policyNode",
      position: roundedAutomationPosition(spawnAutomationNodePosition(selectedPolicyNodeId, policyNodes, policyEdges, policyFlow, policyFrameRef.current)),
      data
    };
    setPolicyNodes((nodes) => [...nodes, node]);
    setSelectedPolicyNodeId(id);
    setSelectedPolicyEdgeIds([]);
    props.setSelection(policyEditorSelection(id, data));
    policySelectionRef.current = `node:${id}`;
  };
  const deletePolicySelection = () => {
    const nodeIds = new Set(selectedPolicyNodeId ? [selectedPolicyNodeId] : []);
    const edgeIds = new Set(selectedPolicyEdgeIds);
    setPolicyNodes((nodes) => nodes.filter((node) => !nodeIds.has(node.id)));
    setPolicyEdges((edges) => rebalanceAutomationEdgeLanes(edges.filter((edge) => !edgeIds.has(edge.id) && !nodeIds.has(edge.source) && !nodeIds.has(edge.target)), policyNodes));
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
        if (primaryNode) props.setSelection(props.policy?.nodes?.some((policyNode: any) => policyNode.id === primaryNode.id) ? { kind: "node", id: primaryNode.id } : policyEditorSelection(primaryNode.id, primaryNode.data));
      }
    });
  };
  useEffect(() => {
    function handleDeleteNode(event: Event) {
      if (!isFlowMode) return;
      const nodeId = (event as CustomEvent<{ nodeId?: string }>).detail?.nodeId;
      if (!nodeId) return;
      setPolicyNodes((nodes) => nodes.filter((node) => node.id !== nodeId));
      setPolicyEdges((edges) => rebalanceAutomationEdgeLanes(edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId), policyNodes));
      setSelectedPolicyNodeId((current: string) => current === nodeId ? "" : current);
    }
    function handleDeleteEdge(event: Event) {
      if (!isFlowMode) return;
      const edgeId = (event as CustomEvent<{ edgeId?: string }>).detail?.edgeId;
      if (!edgeId) return;
      setPolicyEdges((edges) => rebalanceAutomationEdgeLanes(edges.filter((edge) => edge.id !== edgeId), policyNodes));
      setSelectedPolicyEdgeIds((ids) => ids.filter((id) => id !== edgeId));
    }
    function handleUpdateParameters(event: Event) {
      const detail = (event as CustomEvent<{ nodeId?: string; parameterValues?: JsonObject; customDescription?: string }>).detail;
      if (!detail?.nodeId) return;
      setPolicyNodes((nodes) => nodes.map((node) => node.id === detail.nodeId ? { ...node, data: { ...node.data, ...(detail.parameterValues ? { parameterValues: detail.parameterValues } : {}), ...(detail.customDescription !== undefined ? { customDescription: detail.customDescription } : {}) } } : node));
    }
    window.addEventListener("automation-studio:delete-node", handleDeleteNode);
    window.addEventListener("automation-studio:delete-edge", handleDeleteEdge);
    window.addEventListener("automation-studio:update-node-parameters", handleUpdateParameters);
    return () => {
      window.removeEventListener("automation-studio:delete-node", handleDeleteNode);
      window.removeEventListener("automation-studio:delete-edge", handleDeleteEdge);
      window.removeEventListener("automation-studio:update-node-parameters", handleUpdateParameters);
    };
  }, [isFlowMode]);
  return (
    <section className="automation-policy-canvas">
      <div className="automation-editor-mode-bar">
        <div className="automation-layer-tabs" role="tablist" aria-label="Task editor modes">
          {automationTaskEditorModes.map((item) => (
            <button className={mode === item.id ? "selected" : ""} key={item.id} onClick={() => selectTaskMode(item.id)} title={item.description} type="button">{item.label}</button>
          ))}
        </div>
        <span>{activeMode.description}</span>
      </div>
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
            onConnect={(connection) => isFlowMode ? setPolicyEdges((edges) => rebalanceAutomationEdgeLanes(addEdge(createAutomationConnectionEdge(connection, edges, "policy-edge", policyNodes), edges), policyNodes)) : undefined}
            onReconnect={(oldEdge, connection) => isFlowMode ? setPolicyEdges((edges) => reconnectAutomationEdge(oldEdge, connection, edges, policyNodes)) : undefined}
            onEdgesChange={(changes: EdgeChange[]) => isFlowMode ? setPolicyEdges((edges) => rebalanceAutomationEdgeLanes(applyEdgeChanges(changes, edges), policyNodes)) : undefined}
            onEdgesDelete={(deletedEdges) => setSelectedPolicyEdgeIds((ids) => ids.filter((id) => !deletedEdges.some((edge) => edge.id === id)))}
            onNodesDelete={(deletedNodes) => {
              const deletedIds = new Set(deletedNodes.map((node) => node.id));
              setPolicyEdges((edges) => rebalanceAutomationEdgeLanes(edges.filter((edge) => !deletedIds.has(edge.source) && !deletedIds.has(edge.target)), policyNodes));
              if (deletedIds.has(selectedPolicyNodeId)) setSelectedPolicyNodeId("");
            }}
            onNodesChange={(changes: NodeChange<Node<AutomationPolicyNodeData>>[]) => isFlowMode ? setPolicyNodes((nodes) => {
              const nextNodes = applyNodeChanges(changes, nodes);
              setPolicyEdges((edges) => rebalanceAutomationEdgeLanes(edges, nextNodes));
              return nextNodes;
            }) : undefined}
            onNodeClick={(_event, node) => {
              setSelectedPolicyNodeId((current: string) => current === node.id ? current : node.id);
              const key = `node:${node.id}`;
              if (policySelectionRef.current !== key) {
                policySelectionRef.current = key;
                props.setSelection(props.policy?.nodes?.some((policyNode: any) => policyNode.id === node.id) ? { kind: "node", id: node.id } : policyEditorSelection(node.id, node.data));
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
                props.setSelection(props.policy?.nodes?.some((policyNode: any) => policyNode.id === selectedNode.id) ? { kind: "node", id: selectedNode.id } : policyEditorSelection(selectedNode.id, selectedNode.data));
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

function AutomationPolicyNode({ id, data, selected }: NodeProps) {
  const node = data as AutomationPolicyNodeData;
  const Icon = automationNodeIcon(node.icon, node.recovery);
  const description = node.customDescription || node.description || node.actionTypes.join(", ") || "Policy node";
  return (
    <div className={selected ? "automation-flow-node selected" : "automation-flow-node"}>
      {selected ? <SelectedNodeDeleteButton nodeId={id} /> : null}
      <div className="node-badges">
        {node.isStart ? <span className="node-badge start">Start</span> : null}
        <span className="node-badge category">{node.nodeDefinitionId ? "Base" : "Generated"}</span>
        <span className="node-badge category">{node.recovery.replace(/_/g, " ")}</span>
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

function AutomationFlowEdge(props: EdgeProps) {
  const route = automationEdgeRoute(props.id, props.sourceX, props.sourceY, props.targetX, props.targetY, props.data as Record<string, unknown> | undefined);
  const [edgePath, labelX, labelY] = route.kind === "loop"
    ? automationLoopEdgePath(props.sourceX, props.sourceY, props.targetX, props.targetY, route.lane)
    : automationLaneEdgePath(props.sourceX, props.sourceY, props.targetX, props.targetY, route.lane);
  const label = String(props.label ?? props.data?.label ?? "");
  const deleteEdge = () => window.dispatchEvent(new CustomEvent("automation-studio:delete-edge", { detail: { edgeId: props.id } }));
  return (
    <>
      <BaseEdge
        id={props.id}
        path={edgePath}
        style={{
          ...props.style,
          strokeWidth: props.selected ? 4 : props.style?.strokeWidth
        }}
        {...(props.markerEnd ? { markerEnd: props.markerEnd } : {})}
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
