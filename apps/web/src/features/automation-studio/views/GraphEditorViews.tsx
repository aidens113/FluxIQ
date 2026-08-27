"use client";

import { Blocks, Braces, Calculator, CheckCircle2, ChevronRight, CircleDot, Clock, Copy, Database, Dice5, GitBranch, Hand, History, ListChecks, ListTree, Merge, MousePointer2, Network, Plus, Radio, Redo2, Repeat, Scan, Search, ShieldCheck, Shuffle, Split, Star, Trash2, Undo2, Waves, Workflow, X, Zap, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Background, BaseEdge, Controls, EdgeLabelRenderer, Handle, MiniMap, Position, ReactFlow, addEdge, applyEdgeChanges, applyNodeChanges, type Edge, type EdgeChange, type EdgeProps, type Node, type NodeChange, type NodeProps, type ReactFlowInstance } from "@xyflow/react";
import type { AutomationNodePort } from "fluxiq/automation-studio/nodes";
import type { JsonObject } from "../../programs/program-api";
import { DataTable, KeyValue, Segmented, SummaryStrip } from "../../programs/shared-ui";
import type { AutomationEditorNodeSpec, AutomationEditorPaletteGroup, AutomationPolicyNodeData, AutomationRoutineNodeData, AutomationSelection } from "../types";
import { automationEditorPalette } from "../types";
import type { AutomationDragSelectBox } from "../workspace/layout";
import { automationConnectionIsValid, automationPortCaption, automationPortDisplayLabel, automationPortTitle, automationPortTone, automationPortTypesCompatible, uniqueAutomationPorts } from "../graph/ports";
import { useAutomationGraphController } from "../graph/useAutomationGraphController";
import { automationEdgeRoute, automationLaneEdgePath, automationLoopEdgePath, automationVisualInputPorts, createAutomationConnectionEdge, defaultAutomationParameterValues, flattenRunLogs, policyToReactFlowGraph, rebalanceAutomationEdgeLanes, reconnectAutomationEdge, roundedAutomationPosition, routineToReactFlowGraph, spawnAutomationNodePosition, startAutomationNodeMarquee, syncGraphNodes, taskFlowToReactFlowGraph } from "../graph/view-model";
import { sameStringList } from "./view-utils";
import { automationParameterError } from "../parameters/ParameterEditor";

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

export function automationNodeCompatibilityHint(item: AutomationEditorNodeSpec): string {
  if (item.availability?.kind === "domain") return "Domain: " + String(item.availability.domainId ?? "current");
  if (item.source?.kind === "composite") return "Published Flow";
  if (item.source?.kind === "recording") return "Project node";
  if (item.source?.kind === "code") return "Code node";
  if (item.privileged) return "Privileged action";
  if (item.scope === "both") return "Flow and routine";
  return item.scope === "policy" ? "Flow only" : "Routine only";
}

function AutomationNodePalette(props: {
  collapsed: boolean;
  disabled?: boolean;
  groups: AutomationEditorPaletteGroup[];
  title: string;
  onAddNode(spec: AutomationEditorNodeSpec): void;
  onCollapsedChange(value: boolean): void;
}) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"all" | "favorites" | "recent">("all");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);
  const allNodes = useMemo(() => props.groups.flatMap((group) => group.nodes), [props.groups]);
  const byId = useMemo(() => new Map(allNodes.map((node) => [node.id, node])), [allNodes]);

  useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem("fluxiq:node-palette:favorites") ?? "[]");
      if (Array.isArray(stored)) setFavorites(stored.filter((id): id is string => typeof id === "string"));
    } catch {
      setFavorites([]);
    }
    const focusSearch = () => searchRef.current?.focus();
    window.addEventListener("automation-studio:focus-node-palette", focusSearch);
    return () => window.removeEventListener("automation-studio:focus-node-palette", focusSearch);
  }, []);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const sourceGroups = mode === "all"
    ? props.groups
    : [{
      title: mode === "favorites" ? "Favorites" : "Recent",
      nodes: (mode === "favorites" ? favorites : recent).map((id) => byId.get(id)).filter((node): node is AutomationEditorNodeSpec => Boolean(node))
    }];
  const visibleGroups = sourceGroups.map((group) => ({
    ...group,
    nodes: group.nodes.filter((item) => !normalizedQuery || [
      item.label,
      item.description,
      item.family,
      automationNodeCompatibilityHint(item)
    ].join(" ").toLocaleLowerCase().includes(normalizedQuery))
  })).filter((group) => group.nodes.length > 0);

  const toggleFavorite = (id: string) => {
    setFavorites((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [id, ...current];
      window.localStorage.setItem("fluxiq:node-palette:favorites", JSON.stringify(next));
      return next;
    });
  };
  const addNode = (item: AutomationEditorNodeSpec) => {
    setRecent((current) => [item.id, ...current.filter((id) => id !== item.id)].slice(0, 12));
    props.onAddNode(item);
  };

  return (
    <aside className={props.collapsed ? "automation-node-palette collapsed" : "automation-node-palette"} aria-label={props.title}>
      <header>
        <strong>{props.title}</strong>
        <button className="icon-button" onClick={() => props.onCollapsedChange(!props.collapsed)} title={props.collapsed ? "Expand palette" : "Collapse palette"} aria-label={props.collapsed ? "Expand palette" : "Collapse palette"} type="button">
          {props.collapsed ? <ChevronLeftIcon /> : <ChevronRight size={13} aria-hidden />}
        </button>
      </header>
      {!props.collapsed ? <>
        <label className="automation-node-palette-search">
          <Search size={14} aria-hidden />
          <input aria-label="Search nodes" onChange={(event) => setQuery(event.target.value)} placeholder="Search nodes" ref={searchRef} type="search" value={query} />
        </label>
        <div aria-label="Node palette view" className="automation-node-palette-modes" role="group">
          {(["all", "favorites", "recent"] as const).map((item) => <button aria-pressed={mode === item} className={mode === item ? "selected" : ""} key={item} onClick={() => setMode(item)} type="button">{item === "all" ? "All" : item === "favorites" ? "Favorites" : "Recent"}</button>)}
        </div>
        <div className="automation-node-palette-results">
          {visibleGroups.map((group) => (
            <section key={group.title}>
              <strong>{group.title}</strong>
              {group.nodes.map((item) => {
                const Icon = automationNodeIcon(item.icon, item.family);
                const favorite = favorites.includes(item.id);
                return (
                  <div className="automation-node-palette-item" key={item.id}>
                    <button className="automation-node-palette-add" disabled={props.disabled} onClick={() => addNode(item)} title={props.disabled ? "This graph is read-only." : item.description} type="button">
                      <Icon size={15} aria-hidden />
                      <span><strong>{item.label}</strong><small>{item.description}</small><small className="automation-node-compatibility">{automationNodeCompatibilityHint(item)}</small></span>
                    </button>
                    <button aria-label={(favorite ? "Remove " : "Add ") + item.label + (favorite ? " from favorites" : " to favorites")} aria-pressed={favorite} className="icon-button automation-node-favorite" onClick={() => toggleFavorite(item.id)} title={favorite ? "Remove favorite" : "Add favorite"} type="button"><Star fill={favorite ? "currentColor" : "none"} size={13} aria-hidden /></button>
                  </div>
                );
              })}
            </section>
          ))}
          {!visibleGroups.length ? <p className="automation-node-palette-empty">{mode === "favorites" ? "No favorite nodes." : mode === "recent" ? "No recently added nodes." : "No matching nodes."}</p> : null}
        </div>
      </> : null}
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
        <div className="automation-react-flow-frame" onPointerDownCapture={startRoutineDragSelect} ref={routineFrameRef}>
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

export type AutomationGraphSaveResult = { ok: boolean; state: "saved" | "failed" | "conflict"; message: string };

export function AutomationPolicyCanvas(props: { active: boolean; editable: boolean; entries: any[]; policy: any; taskGraph?: any; taskGraphDraft?: { nodes: Array<Node<AutomationPolicyNodeData>>; edges: Edge[] } | null; recoverableDraft?: { savedAt: number; stale: boolean } | null; nativeNodeDefinitions: any[]; recordings: any[]; selectedNode: any; selectedTimeline: any; signals: any[]; onSaveGraph(graph: { nodes: Array<Node<AutomationPolicyNodeData>>; edges: Edge[] }): Promise<AutomationGraphSaveResult>; onGraphDraftChange(graph: { nodes: Array<Node<AutomationPolicyNodeData>>; edges: Edge[] } | null): void; onDirtyChange(dirty: boolean): void; onOpenProblems(): void; onRestoreDraft(): void; onDiscardDraft(): void; setSelection(selection: AutomationSelection): void }) {
  const [selectedPolicyNodeId, setSelectedPolicyNodeId] = useState(props.selectedNode?.id ?? "");
  const [selectedPolicyNodeIds, setSelectedPolicyNodeIds] = useState<string[]>(props.selectedNode?.id ? [props.selectedNode.id] : []);
  const [connectionSourceNodeId, setConnectionSourceNodeId] = useState("");
  const policyClipboardRef = useRef<{ nodes: Array<Node<AutomationPolicyNodeData>>; edges: Edge[] } | null>(null);
  const [selectedPolicyEdgeIds, setSelectedPolicyEdgeIds] = useState<string[]>([]);
  const [paletteCollapsed, setPaletteCollapsed] = useState(false);
  const [policyInteractionMode, setPolicyInteractionMode] = useState<"select" | "pan">("select");
  const [policyOutlineOpen, setPolicyOutlineOpen] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "unsaved" | "saving" | "failed" | "conflict">(props.taskGraphDraft ? "unsaved" : "saved");
  const policyFrameRef = useRef<HTMLDivElement>(null);
  const policySelectionRef = useRef("");
  const policyViewportRestoreRef = useRef<{ x: number; y: number; zoom: number } | null>(null);
  const [policyFlow, setPolicyFlow] = useState<ReactFlowInstance<Node<AutomationPolicyNodeData>, Edge> | null>(null);

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
  const {
    nodes: policyNodes,
    edges: policyEdges,
    nodesRef: policyNodesRef,
    edgesRef: policyEdgesRef,
    setNodes: setPolicyNodes,
    setEdges: setPolicyEdges,
    replaceGraph: replacePolicyGraph,
    checkpoint: checkpointPolicyGraph,
    undo: undoPolicyGraph,
    redo: redoPolicyGraph,
    canUndo: canUndoPolicyGraph,
    canRedo: canRedoPolicyGraph
  } = useAutomationGraphController<AutomationPolicyNodeData>(graph.nodes, graph.edges);
  const policyNodeDragActiveRef = useRef(false);
  const pendingPolicyGraphDraftRef = useRef<{ nodes: Array<Node<AutomationPolicyNodeData>>; edges: Edge[] } | null>(null);
  const policyGraphDraftFlushQueuedRef = useRef(false);
  useEffect(() => {
    const nextNodes = syncGraphNodes(policyNodesRef.current, graph.nodes);
    const nextEdges = rebalanceAutomationEdgeLanes(graph.edges, nextNodes);
    replacePolicyGraph({ nodes: nextNodes, edges: nextEdges });
    savedGraphSignatureRef.current = graphSignature(nextNodes, nextEdges);
    if (props.active) props.onDirtyChange(Boolean(props.taskGraphDraft));
    setSelectedPolicyEdgeIds([]);
  }, [taskGraphSignature, policyGraphSignature, taskGraphDraftSignature]);
  useEffect(() => {
    const dirty = graphSignature(policyNodes, policyEdges) !== savedGraphSignatureRef.current;
    if (props.active) props.onDirtyChange(dirty);
    setSaveState((current) => dirty ? (current === "saving" || current === "conflict" ? current : "unsaved") : "saved");
  }, [policyNodes, policyEdges, props.active, props.onDirtyChange]);

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
    const id = props.selectedNode?.id ?? "";
    setSelectedPolicyNodeId(id);
    setSelectedPolicyNodeIds(id ? [id] : []);
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
      setSaveState("saving");
      const result = await props.onSaveGraph({ nodes: policyNodesRef.current, edges: policyEdgesRef.current });
      setSaveState(result.state);
      if (result.ok) {
        savedGraphSignatureRef.current = graphSignature(policyNodesRef.current, policyEdgesRef.current);
        props.onDirtyChange(false);
      }
      detail?.onComplete?.({
        ok: result.ok,
        message: result.message
      });
    }
    window.addEventListener("automation-studio:global-save", handleGlobalSave);
    return () => window.removeEventListener("automation-studio:global-save", handleGlobalSave);
  }, [props.active, props.editable, props.onSaveGraph, codeOwned]);
  const addPolicyNode = (spec: AutomationEditorNodeSpec) => {
    if (!isFlowMode) return;
    checkpointPolicyGraph();
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
    setSelectedPolicyNodeIds([id]);
    setSelectedPolicyEdgeIds([]);
    props.setSelection(policyEditorSelection(id, data));
    policySelectionRef.current = `node:${id}`;
  };
  const deletePolicySelection = () => {
    checkpointPolicyGraph();
    const nodeIds = new Set(selectedPolicyNodeIds);
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
  useEffect(() => {
    function handleDeleteNode(event: Event) {
      if (!isFlowMode) return;
      const nodeId = (event as CustomEvent<{ nodeId?: string }>).detail?.nodeId;
      if (!nodeId) return;
      checkpointPolicyGraph();
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
      checkpointPolicyGraph();
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
      setSelectedPolicyNodeIds([]);
      setSelectedPolicyEdgeIds([edgeId]);
      const nextEdges = policyEdgesRef.current.map((edge) => ({ ...edge, selected: edge.id === edgeId }));
      policyEdgesRef.current = nextEdges;
      setPolicyEdges(nextEdges);
    }
    function handleUpdateParameters(event: Event) {
      const detail = (event as CustomEvent<{ nodeId?: string; parameterValues?: JsonObject; customDescription?: string }>).detail;
      if (!detail?.nodeId) return;
      checkpointPolicyGraph();
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
  const policyGraphProblems = useMemo(() => automationPolicyGraphProblems(policyNodes, policyEdges), [policyNodes, policyEdges]);
  const invalidPolicyNodeIds = useMemo(() => new Set(policyGraphProblems.filter((problem) => problem.kind === "node" && problem.targetId).map((problem) => problem.targetId)), [policyGraphProblems]);
  const invalidPolicyEdgeIds = useMemo(() => new Set(policyGraphProblems.filter((problem) => problem.kind === "edge" && problem.targetId).map((problem) => problem.targetId)), [policyGraphProblems]);
  const validatedPolicyNodes = useMemo(() => policyNodes.map((node) => invalidPolicyNodeIds.has(node.id) ? { ...node, className: [node.className, "automation-validation-invalid"].filter(Boolean).join(" ") } : node), [policyNodes, invalidPolicyNodeIds]);
  const validatedPolicyEdges = useMemo(() => policyEdges.map((edge) => invalidPolicyEdgeIds.has(edge.id) ? { ...edge, className: [edge.className, "automation-validation-invalid"].filter(Boolean).join(" ") } : edge), [policyEdges, invalidPolicyEdgeIds]);
  const applyPolicyHistory = (direction: "undo" | "redo") => {
    if (!isFlowMode) return;
    if (direction === "undo") undoPolicyGraph();
    else redoPolicyGraph();
    queueMicrotask(() => publishPolicyGraphDraft(policyNodesRef.current, policyEdgesRef.current));
  };
  const selectPolicyOutlineNode = (node: Node<AutomationPolicyNodeData>) => {
    setSelectedPolicyNodeId(node.id);
    setSelectedPolicyEdgeIds([]);
    setPolicyNodes((nodes) => nodes.map((item) => ({ ...item, selected: item.id === node.id })));
    props.setSelection(policyCanvasSelectionForNode(node));
    void policyFlow?.fitView({ nodes: [node], padding: 0.8, duration: 180 });
  };
  const focusPolicyGraphProblem = (problem: AutomationGraphProblem) => {
    if (problem.kind === "node" && problem.targetId) {
      const node = policyNodesRef.current.find((item) => item.id === problem.targetId);
      if (node) selectPolicyOutlineNode(node);
      return;
    }
    if (problem.kind === "edge" && problem.targetId) {
      const edge = policyEdgesRef.current.find((item) => item.id === problem.targetId);
      if (!edge) return;
      setSelectedPolicyNodeId("");
      setSelectedPolicyNodeIds([]);
      setSelectedPolicyEdgeIds([edge.id]);
      setPolicyEdges((edges) => edges.map((item) => ({ ...item, selected: item.id === edge.id })));
      const endpoints = policyNodesRef.current.filter((node) => node.id === edge.source || node.id === edge.target);
      if (endpoints.length) void policyFlow?.fitView({ nodes: endpoints, padding: 0.8, duration: 180 });
      return;
    }
    void policyFlow?.fitView({ padding: 0.25, duration: 180 });
  };
  useEffect(() => {
    const handleFocusProblem = (event: Event) => {
      const problem = (event as CustomEvent<AutomationGraphProblem>).detail;
      if (problem) focusPolicyGraphProblem(problem);
    };
    window.addEventListener("automation-studio:focus-graph-problem", handleFocusProblem);
    return () => window.removeEventListener("automation-studio:focus-graph-problem", handleFocusProblem);
  }, [policyFlow]);  const validatePolicyGraph = () => {
    props.setSelection({
      kind: "editor-mode",
      id: "graph-validation",
      editor: "flow",
      label: "Graph Validation",
      description: policyGraphProblems.length ? "Resolve graph problems before running this Flow." : "The graph passed structural validation.",
      sections: [{
        title: policyGraphProblems.length ? "Problems" : "Ready",
        rows: policyGraphProblems.length
          ? policyGraphProblems.map((problem) => [problem.label, problem.message])
          : [["Status", "No structural graph problems"]]
      }]
    });
    props.onOpenProblems();
  };
  const copyPolicySelection = () => {
    const selectedIds = new Set(selectedPolicyNodeIds);
    if (!selectedIds.size) return;
    policyClipboardRef.current = {
      nodes: policyNodesRef.current.filter((node) => selectedIds.has(node.id)),
      edges: policyEdgesRef.current.filter((edge) => selectedIds.has(edge.source) && selectedIds.has(edge.target))
    };
  };
  const pastePolicyClipboard = () => {
    const copied = policyClipboardRef.current;
    if (!isFlowMode || !copied?.nodes.length) return;
    checkpointPolicyGraph();
    const stamp = Date.now().toString(36);
    const idMap = new Map(copied.nodes.map((node, index) => [node.id, node.id + "-copy-" + stamp + "-" + index]));
    const pastedNodes = copied.nodes.map((node) => ({
      ...node,
      id: idMap.get(node.id) ?? node.id,
      position: { x: node.position.x + 40, y: node.position.y + 40 },
      selected: true
    }));
    const pastedEdges = copied.edges.map((edge, index) => ({
      ...edge,
      id: edge.id + "-copy-" + stamp + "-" + index,
      source: idMap.get(edge.source) ?? edge.source,
      target: idMap.get(edge.target) ?? edge.target,
      selected: false
    }));
    const pastedIds = pastedNodes.map((node) => node.id);
    const nextNodes = [...policyNodesRef.current.map((node) => ({ ...node, selected: false })), ...pastedNodes];
    const nextEdges = rebalanceAutomationEdgeLanes([...policyEdgesRef.current.map((edge) => ({ ...edge, selected: false })), ...pastedEdges], nextNodes);
    policyNodesRef.current = nextNodes;
    policyEdgesRef.current = nextEdges;
    setPolicyNodes(nextNodes);
    setPolicyEdges(nextEdges);
    setSelectedPolicyNodeIds(pastedIds);
    setSelectedPolicyNodeId(pastedIds[0] ?? "");
    setSelectedPolicyEdgeIds([]);
    publishPolicyGraphDraft(nextNodes, nextEdges);
    if (pastedNodes[0]) props.setSelection(policyCanvasSelectionForNode(pastedNodes[0]));
  };
  const duplicatePolicySelection = () => {
    copyPolicySelection();
    pastePolicyClipboard();
  };
  const movePolicySelection = (x: number, y: number) => {
    if (!isFlowMode || !selectedPolicyNodeIds.length) return;
    checkpointPolicyGraph();
    const selectedIds = new Set(selectedPolicyNodeIds);
    const nextNodes = policyNodesRef.current.map((node) => selectedIds.has(node.id)
      ? { ...node, position: roundedAutomationPosition({ x: node.position.x + x, y: node.position.y + y }) }
      : node);
    policyNodesRef.current = nextNodes;
    setPolicyNodes(nextNodes);
    publishPolicyGraphDraft(nextNodes, policyEdgesRef.current);
  };
  const connectPolicySelection = () => {
    if (!isFlowMode || !selectedPolicyNodeId) return;
    if (!connectionSourceNodeId) {
      setConnectionSourceNodeId(selectedPolicyNodeId);
      return;
    }
    if (connectionSourceNodeId === selectedPolicyNodeId) {
      setConnectionSourceNodeId("");
      return;
    }
    const source = policyNodesRef.current.find((node) => node.id === connectionSourceNodeId);
    const target = policyNodesRef.current.find((node) => node.id === selectedPolicyNodeId);
    if (!source || !target) {
      setConnectionSourceNodeId("");
      return;
    }
    const compatible = source.data.outputs.flatMap((output) => target.data.inputs.map((input) => ({ output, input })))
      .find(({ output, input }) => automationConnectionIsValid({ source: source.id, target: target.id, sourceHandle: output.id, targetHandle: input.id }, policyNodesRef.current));
    if (!compatible) {
      setConnectionSourceNodeId("");
      return;
    }
    checkpointPolicyGraph();
    const edge = createAutomationConnectionEdge({ source: source.id, target: target.id, sourceHandle: compatible.output.id, targetHandle: compatible.input.id }, policyEdgesRef.current, "policy-edge", policyNodesRef.current);
    const nextEdges = rebalanceAutomationEdgeLanes(addEdge(edge, policyEdgesRef.current), policyNodesRef.current);
    policyEdgesRef.current = nextEdges;
    setPolicyEdges(nextEdges);
    publishPolicyGraphDraft(policyNodesRef.current, nextEdges);
    setConnectionSourceNodeId("");
  };
  const selectAllPolicyNodes = () => {
    const ids = policyNodesRef.current.map((node) => node.id);
    setPolicyNodes((nodes) => nodes.map((node) => ({ ...node, selected: true })));
    setPolicyEdges((edges) => edges.map((edge) => ({ ...edge, selected: false })));
    setSelectedPolicyNodeIds(ids);
    setSelectedPolicyNodeId(ids[0] ?? "");
    setSelectedPolicyEdgeIds([]);
  };  const openPolicyNodePalette = () => {
    setPaletteCollapsed(false);
    queueMicrotask(() => window.dispatchEvent(new CustomEvent("automation-studio:focus-node-palette")));
  };
  const handlePolicyCanvasKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select, [contenteditable=true]")) return;
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && key === "a") {
      event.preventDefault();
      selectAllPolicyNodes();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && key === "c") {
      event.preventDefault();
      copyPolicySelection();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && key === "v") {
      event.preventDefault();
      pastePolicyClipboard();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && key === "d") {
      event.preventDefault();
      duplicatePolicySelection();
      return;
    }
    if (event.shiftKey && ["arrowleft", "arrowright", "arrowup", "arrowdown"].includes(key)) {
      event.preventDefault();
      movePolicySelection(key === "arrowleft" ? -10 : key === "arrowright" ? 10 : 0, key === "arrowup" ? -10 : key === "arrowdown" ? 10 : 0);
      return;
    }
    if ((key === "delete" || key === "backspace") && isFlowMode) {
      event.preventDefault();
      deletePolicySelection();
      return;
    }
    if (key === "c" && isFlowMode) {
      event.preventDefault();
      connectPolicySelection();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && key === "z") {
      event.preventDefault();
      applyPolicyHistory(event.shiftKey ? "redo" : "undo");
      return;
    }
    if ((event.ctrlKey || event.metaKey) && key === "y") {
      event.preventDefault();
      applyPolicyHistory("redo");
      return;
    }
    if (key === "v") setPolicyInteractionMode("select");
    else if (key === "h") setPolicyInteractionMode("pan");
    else if (key === "f") void policyFlow?.fitView({ padding: 0.25, duration: 180 });
    else if (key === "+" || key === "=") void policyFlow?.zoomIn({ duration: 120 });
    else if (key === "-") void policyFlow?.zoomOut({ duration: 120 });
    else if (key === "a" && isFlowMode) openPolicyNodePalette();
    else return;
    event.preventDefault();
  };
  return (
    <section className="automation-policy-canvas">
      <div aria-live="polite" className={`automation-graph-save-state ${saveState}`} role="status"><span aria-hidden />{saveState === "saved" ? "Saved" : saveState === "unsaved" ? "Unsaved changes" : saveState === "saving" ? "Saving" : saveState === "conflict" ? "Save conflict" : "Save failed"}</div>
      {props.recoverableDraft ? <div className={props.recoverableDraft.stale ? "automation-draft-recovery stale" : "automation-draft-recovery"} role="status">
        <div><strong>{props.recoverableDraft.stale ? "Unsaved draft from an older Flow version" : "Unsaved draft available"}</strong><span>Recovered from {new Date(props.recoverableDraft.savedAt).toLocaleString()}.</span></div>
        <div><button className="button button-primary" onClick={props.onRestoreDraft} type="button">Restore Draft</button><button className="button" onClick={props.onDiscardDraft} type="button">Discard</button></div>
      </div> : null}
      {codeOwned ? <div className="automation-source-warning"><strong>Code-owned Flow</strong><span>The compiled graph is read-only. Change its module and recompile, or explicitly convert it back to visual ownership.</span></div> : null}
      <div className={paletteCollapsed ? "automation-policy-editor-grid palette-collapsed" : "automation-policy-editor-grid"}>
        <div aria-label="Nodes whiteboard" className="automation-react-flow-frame" onKeyDown={handlePolicyCanvasKeyDown} ref={policyFrameRef} tabIndex={0}>
          <div aria-label="Canvas tools" className="automation-canvas-toolbar" role="toolbar">
            <div className="automation-canvas-tool-group">
              <button aria-keyshortcuts="V" aria-label="Select mode" aria-pressed={policyInteractionMode === "select"} className="icon-button" onClick={() => setPolicyInteractionMode("select")} title="Select (V)" type="button"><MousePointer2 size={14} aria-hidden /></button>
              <button aria-keyshortcuts="H" aria-label="Pan mode" aria-pressed={policyInteractionMode === "pan"} className="icon-button" onClick={() => setPolicyInteractionMode("pan")} title="Pan (H)" type="button"><Hand size={14} aria-hidden /></button>
            </div>
            <div className="automation-canvas-tool-group">
              <button aria-keyshortcuts="F" aria-label="Fit graph" className="icon-button" onClick={() => void policyFlow?.fitView({ padding: 0.25, duration: 180 })} title="Fit graph (F)" type="button"><Scan size={14} aria-hidden /></button>
              <button aria-keyshortcuts="+" aria-label="Zoom in" className="icon-button" onClick={() => void policyFlow?.zoomIn({ duration: 120 })} title="Zoom in (+)" type="button"><ZoomIn size={14} aria-hidden /></button>
              <button aria-keyshortcuts="-" aria-label="Zoom out" className="icon-button" onClick={() => void policyFlow?.zoomOut({ duration: 120 })} title="Zoom out (-)" type="button"><ZoomOut size={14} aria-hidden /></button>
            </div>
            <div className="automation-canvas-tool-group">
              <button aria-keyshortcuts="Control+Z Meta+Z" aria-label="Undo graph change" className="icon-button" disabled={!canUndoPolicyGraph || !isFlowMode} onClick={() => applyPolicyHistory("undo")} title="Undo" type="button"><Undo2 size={14} aria-hidden /></button>
              <button aria-keyshortcuts="Control+Y Meta+Shift+Z" aria-label="Redo graph change" className="icon-button" disabled={!canRedoPolicyGraph || !isFlowMode} onClick={() => applyPolicyHistory("redo")} title="Redo" type="button"><Redo2 size={14} aria-hidden /></button>
            </div>
            <div className="automation-canvas-tool-group">
              <button aria-keyshortcuts="Control+D Meta+D" aria-label="Duplicate selected nodes" className="icon-button" disabled={!selectedPolicyNodeIds.length || !isFlowMode} onClick={duplicatePolicySelection} title="Duplicate selected" type="button"><Copy size={14} aria-hidden /></button>
              <button aria-keyshortcuts="C" aria-label="Connect selected node" aria-pressed={Boolean(connectionSourceNodeId)} className="icon-button" disabled={!selectedPolicyNodeId || !isFlowMode} onClick={connectPolicySelection} title={connectionSourceNodeId ? "Connect to selected node" : "Start keyboard connection"} type="button"><Network size={14} aria-hidden /></button>
              <button aria-label="Delete graph selection" className="icon-button" disabled={(!selectedPolicyNodeIds.length && !selectedPolicyEdgeIds.length) || !isFlowMode} onClick={deletePolicySelection} title="Delete selection" type="button"><Trash2 size={14} aria-hidden /></button>
            </div>
            <div className="automation-canvas-tool-group">
              <button aria-label="Validate graph" className="automation-canvas-command" onClick={validatePolicyGraph} title="Validate graph" type="button"><CheckCircle2 size={14} aria-hidden /><span>{policyGraphProblems.length}</span></button>
              <button aria-expanded={policyOutlineOpen} aria-label="Toggle graph outline" className="icon-button" onClick={() => setPolicyOutlineOpen((open) => !open)} title="Graph outline" type="button"><ListTree size={14} aria-hidden /></button>
              <button aria-keyshortcuts="A" aria-label="Add node" className="icon-button" disabled={!isFlowMode} onClick={openPolicyNodePalette} title="Add node (A)" type="button"><Plus size={14} aria-hidden /></button>
            </div>
          </div>
          <ReactFlow<Node<AutomationPolicyNodeData>, Edge>
            fitView
            fitViewOptions={{ padding: 0.25 }}
            nodes={validatedPolicyNodes}
            edges={validatedPolicyEdges}
            edgeTypes={automationEdgeTypes}
            nodeTypes={automationNodeTypes}
            nodesDraggable={isFlowMode}
            nodesConnectable={isFlowMode}
            edgesReconnectable={isFlowMode}
            connectionRadius={automationNodeEditorConnectionRadius}
            elementsSelectable
            nodesFocusable
            edgesFocusable
            onlyRenderVisibleElements
            panOnDrag={policyInteractionMode === "pan"}
            selectionOnDrag={policyInteractionMode === "select"}
            deleteKeyCode={isFlowMode ? ["Backspace", "Delete"] : null}
            minZoom={0.1}
            reconnectRadius={automationNodeEditorReconnectRadius}
            onInit={setPolicyFlow}
            isValidConnection={(connection) => automationConnectionIsValid(connection, policyNodes)}
            onConnect={(connection) => {
              if (!isFlowMode) return;
              checkpointPolicyGraph();
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
              checkpointPolicyGraph();
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
              if (allowedChanges.some((change) => change.type === "remove" || change.type === "add")) checkpointPolicyGraph();
              setPolicyEdges((edges) => {
                const nextEdges = rebalanceAutomationEdgeLanes(applyEdgeChanges(allowedChanges, edges), policyNodesRef.current);
                policyEdgesRef.current = nextEdges;
                publishPolicyGraphDraft(policyNodesRef.current, nextEdges);
                return nextEdges;
              });
            }}
            onEdgesDelete={(deletedEdges) => setSelectedPolicyEdgeIds((ids) => ids.filter((id) => !deletedEdges.some((edge) => edge.id === id)))}
            onNodesDelete={(deletedNodes) => {
              checkpointPolicyGraph();
              const deletedIds = new Set(deletedNodes.map((node) => node.id));
              setPolicyEdges((edges) => {
                const nextEdges = rebalanceAutomationEdgeLanes(edges.filter((edge) => !deletedIds.has(edge.source) && !deletedIds.has(edge.target)), policyNodesRef.current);
                policyEdgesRef.current = nextEdges;
                publishPolicyGraphDraft(policyNodesRef.current.filter((node) => !deletedIds.has(node.id)), nextEdges);
                return nextEdges;
              });
              if (deletedIds.has(selectedPolicyNodeId)) setSelectedPolicyNodeId("");
              setSelectedPolicyNodeIds((ids) => ids.filter((id) => !deletedIds.has(id)));
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
              setSelectedPolicyNodeIds([]);
              setSelectedPolicyEdgeIds([edge.id]);
              setPolicyEdges((edges) => {
                const nextEdges = edges.map((item) => ({ ...item, selected: item.id === edge.id }));
                policyEdgesRef.current = nextEdges;
                return nextEdges;
              });
            }}
            onNodeDragStart={() => {
              checkpointPolicyGraph();
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
              const nodeIds = nodes.map((node) => node.id);
              const edgeIds = edges.map((edge) => edge.id);
              setSelectedPolicyNodeId((current: string) => current === nodeId ? current : nodeId);
              setSelectedPolicyNodeIds((current) => sameStringList(current, nodeIds) ? current : nodeIds);
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

          </ReactFlow>
          {policyOutlineOpen ? <AutomationGraphOutline nodes={policyNodes} selectedNodeId={selectedPolicyNodeId} onClose={() => setPolicyOutlineOpen(false)} onSelect={selectPolicyOutlineNode} /> : null}
        </div>
        <AutomationNodePalette collapsed={paletteCollapsed} disabled={!isFlowMode} groups={palette} title="Policy Nodes" onAddNode={addPolicyNode} onCollapsedChange={setPaletteCollapsed} />
      </div>    </section>
  );
}

export type AutomationGraphProblem = {
  id: string;
  kind: "node" | "edge" | "graph";
  targetId: string | null;
  label: string;
  message: string;
};

export function automationPolicyGraphProblems(nodes: Array<Node<AutomationPolicyNodeData>>, edges: Edge[]): AutomationGraphProblem[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const incoming = new Map(nodes.map((node) => [node.id, 0]));
  const problems: AutomationGraphProblem[] = [];
  for (const edge of edges) {
    const source = nodesById.get(edge.source);
    const target = nodesById.get(edge.target);
    if (!source || !target) {
      problems.push({ id: "dangling:" + edge.id, kind: "edge", targetId: edge.id, label: "Dangling edge", message: "This connection references a node that no longer exists." });
      continue;
    }
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
    const sourcePort = source.data.outputs?.find((port) => port.id === edge.sourceHandle);
    const targetPort = target.data.inputs?.find((port) => port.id === edge.targetHandle);
    if (edge.source === edge.target || !sourcePort || !targetPort || !automationPortTypesCompatible(sourcePort.valueType, targetPort.valueType)) {
      problems.push({ id: "incompatible:" + edge.id, kind: "edge", targetId: edge.id, label: "Incompatible connection", message: "The connected ports use incompatible value types." });
    }
  }
  const startNodes = nodes.filter((node) => node.data.isStart || node.data.nodeDefinitionId === "builtin.control.start");
  const startNodeIds = new Set(startNodes.map((node) => node.id));
  if (!startNodes.length) problems.push({ id: "start:missing", kind: "graph", targetId: null, label: "Start node", message: "Add one Start node to define where execution begins." });
  if (startNodes.length > 1) problems.push({ id: "start:multiple", kind: "graph", targetId: null, label: "Start nodes", message: "Keep one Start node so execution has an unambiguous entry point." });
  for (const node of nodes) {
    for (const parameter of node.data.parameters ?? []) {
      const error = automationParameterError(parameter, node.data.parameterValues?.[parameter.id]);
      if (error) problems.push({ id: "parameter:" + node.id + ":" + parameter.id, kind: "node", targetId: node.id, label: node.data.label + " / " + parameter.label, message: error });
    }
    if (!startNodeIds.has(node.id) && (incoming.get(node.id) ?? 0) === 0) {
      problems.push({ id: "unreachable:" + node.id, kind: "node", targetId: node.id, label: node.data.label, message: "This node has no incoming route and cannot be reached." });
    }
  }
  return problems;
}
function AutomationGraphOutline(props: {
  nodes: Array<Node<AutomationPolicyNodeData>>;
  selectedNodeId: string;
  onClose(): void;
  onSelect(node: Node<AutomationPolicyNodeData>): void;
}) {
  const [focusedIndex, setFocusedIndex] = useState(() => Math.max(0, props.nodes.findIndex((node) => node.id === props.selectedNodeId)));
  const focusNodeAt = (index: number) => {
    const bounded = Math.max(0, Math.min(props.nodes.length - 1, index));
    setFocusedIndex(bounded);
    document.getElementById("automation-outline-node-" + props.nodes[bounded]?.id)?.focus();
  };
  return (
    <aside aria-label="Graph outline" className="automation-graph-outline">
      <header><div><ListTree size={14} aria-hidden /><strong>Graph Outline</strong><span>{props.nodes.length}</span></div><button aria-label="Close graph outline" className="icon-button" onClick={props.onClose} title="Close outline" type="button"><X size={13} aria-hidden /></button></header>
      <div aria-label="Graph nodes" role="tree">
        {props.nodes.map((node, index) => (
          <button
            aria-level={1}
            aria-selected={node.id === props.selectedNodeId}
            className={node.id === props.selectedNodeId ? "selected" : ""}
            id={"automation-outline-node-" + node.id}
            key={node.id}
            onClick={() => props.onSelect(node)}
            onFocus={() => setFocusedIndex(index)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") { event.preventDefault(); focusNodeAt(index + 1); }
              else if (event.key === "ArrowUp") { event.preventDefault(); focusNodeAt(index - 1); }
              else if (event.key === "Home") { event.preventDefault(); focusNodeAt(0); }
              else if (event.key === "End") { event.preventDefault(); focusNodeAt(props.nodes.length - 1); }
              else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); props.onSelect(node); }
            }}
            role="treeitem"
            tabIndex={index === focusedIndex ? 0 : -1}
            type="button"
          >
            <span>{index + 1}</span>
            <strong>{node.data.label}</strong>
            <small>{node.data.nodeDefinitionId ?? node.type ?? "node"}</small>
          </button>
        ))}
      </div>
      {!props.nodes.length ? <p>No nodes in this graph.</p> : null}
    </aside>
  );
}
export function graphSignature(nodes: Array<Node<any>>, edges: Edge[]): string {
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
        aria-label={(props.direction === "source" ? "Output " : "Input ") + automationPortTitle(props.port, props.direction)}
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
