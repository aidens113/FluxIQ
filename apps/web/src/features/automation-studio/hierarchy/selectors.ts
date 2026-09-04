import { automationStudioViewId } from "../views/view-registry";
import type { AutomationSelection } from "../shared/selection-contracts";
import type { AutomationHierarchyKind, AutomationHierarchyNode } from "./contracts";
import type { AutomationHierarchyIndex } from "./indexing";
import { memoizedAutomationHierarchyIndex, visibleAutomationHierarchyNodeIds } from "./indexing";

export type AutomationHierarchyProjection = {
  index: AutomationHierarchyIndex;
  visibleIds: Set<string>;
  rootNodes: AutomationHierarchyNode[];
  matchCount: number;
};

export function createAutomationHierarchyProjectionSelector(): (
  nodes: AutomationHierarchyNode[],
  search: string,
  typeFilter: "all" | AutomationHierarchyKind
) => AutomationHierarchyProjection {
  let previousNodes: AutomationHierarchyNode[] | undefined;
  let previousSearch = "";
  let previousTypeFilter: "all" | AutomationHierarchyKind = "all";
  let previous: AutomationHierarchyProjection | undefined;
  return (nodes, search, typeFilter) => {
    const normalizedSearch = search.trim().toLocaleLowerCase();
    if (previous && previousNodes === nodes && previousSearch === normalizedSearch && previousTypeFilter === typeFilter) return previous;
    const index = previousNodes === nodes && previous ? previous.index : memoizedAutomationHierarchyIndex(nodes);
    let matchCount = 0;
    const visibleIds = visibleAutomationHierarchyNodeIds(index, (node) => {
      const matches = (typeFilter === "all" || typeFilter === node.kind)
        && (!normalizedSearch || index.searchTextById.get(node.id)?.includes(normalizedSearch) === true);
      if (matches) matchCount += 1;
      return matches;
    });
    previousNodes = nodes;
    previousSearch = normalizedSearch;
    previousTypeFilter = typeFilter;
    previous = {
      index,
      visibleIds,
      rootNodes: (index.childrenByParentId.get(null) ?? []).filter((node) => node.category === "flow" && visibleIds.has(node.id)),
      matchCount
    };
    return previous;
  };
}

export function selectAutomationHierarchyEffectiveCollapsedIds(input: {
  nodes: AutomationHierarchyNode[];
  collapsedFolderIds: string[];
  expandedDefaultCollapsedIds: string[];
  selection: AutomationSelection | null;
}): string[] {
  const expandedIds = new Set(input.expandedDefaultCollapsedIds);
  const explicitlyCollapsedIds = new Set(input.collapsedFolderIds);
  const activeGraphFlowId = automationHierarchySelectionFlowId(input.selection);
  return [
    ...input.collapsedFolderIds,
    ...input.nodes
      .filter((node) => node.metadata?.defaultCollapsed === true
        && !expandedIds.has(node.id)
        && (
          node.metadata?.graphFlowId !== activeGraphFlowId
          || explicitlyCollapsedIds.has(node.id)
        ))
      .map((node) => node.id)
  ];
}

export function automationHierarchyDefaultContainersForSelection(
  nodes: AutomationHierarchyNode[],
  selection: AutomationSelection | null,
  explicitlyCollapsedIds: readonly string[]
): string[] {
  const selectedFlowId = automationHierarchySelectionFlowId(selection);
  if (!selectedFlowId) return [];
  const collapsedIds = new Set(explicitlyCollapsedIds);
  return nodes
    .filter((node) => node.metadata?.defaultCollapsed === true
      && node.metadata?.graphFlowId === selectedFlowId
      && !collapsedIds.has(node.id))
    .map((node) => node.id);
}

export function automationHierarchyAncestorContainersForSelection(
  nodes: AutomationHierarchyNode[],
  selection: AutomationSelection | null,
  activeViewId?: string
): string[] {
  const selectedFlowId = automationHierarchySelectionFlowId(selection);
  if (!selectedFlowId) return [];
  const target = nodes.find((node) => Boolean(
    activeViewId
    && node.viewId === activeViewId
    && node.flowId === selectedFlowId
  )) ?? nodes.find((node) => Boolean(
    (node.kind === "flow" && node.sourceId === selectedFlowId)
    || (node.kind === "subflow" && node.metadata?.graphFlowId === selectedFlowId)
  ));
  if (!target) return [];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const ancestors: string[] = [];
  const visited = new Set<string>();
  let parentId = target.parentId;
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    ancestors.unshift(parentId);
    parentId = byId.get(parentId)?.parentId ?? null;
  }
  return ancestors;
}

export function automationHierarchyNodeMatchesSelection(node: AutomationHierarchyNode, selection: AutomationSelection | null): boolean {
  const selectedFlowId = automationHierarchySelectionFlowId(selection);
  return Boolean(node.sourceId && (
    (selectedFlowId && node.kind === "flow" && selectedFlowId === node.sourceId)
    || (selectedFlowId && node.kind === "subflow" && selectedFlowId === node.metadata?.graphFlowId)
    || (selection?.kind === "policy" && selection.id === node.sourceId)
    || (selection?.kind === "recording" && selection.id === node.sourceId)
    || (selection?.kind === "recording" && selection.id === node.recordingId)

    || (selection?.kind === "workspace" && selection.id === node.sourceId)
  ));
}

export function automationHierarchyNodeMatchesActiveFlowView(
  node: AutomationHierarchyNode,
  selection: AutomationSelection | null,
  activeViewId?: string
): boolean {
  const selectedFlowId = automationHierarchySelectionFlowId(selection);
  return Boolean(
    activeViewId
    && node.viewId === activeViewId
    && node.flowId
    && node.kind !== "flow"
    && selectedFlowId === node.flowId
  );
}

export function automationHierarchyActiveChildOwnsFlowSelection(
  node: AutomationHierarchyNode,
  hierarchyIndex: AutomationHierarchyIndex,
  selection: AutomationSelection | null,
  activeViewId?: string
): boolean {
  const selectedFlowId = automationHierarchySelectionFlowId(selection);
  const ownedFlowId = node.kind === "flow"
    ? node.sourceId
    : node.kind === "subflow" && typeof node.metadata?.graphFlowId === "string"
      ? node.metadata.graphFlowId
      : null;
  return Boolean(
    ownedFlowId
    && selectedFlowId === ownedFlowId
    && activeViewId
    && (hierarchyIndex.childrenByParentId.get(node.id) ?? [])
      .some((candidate) => candidate.flowId === ownedFlowId && candidate.viewId === activeViewId)
  );
}

export function automationHierarchyNodeSelectionState(input: {
  node: AutomationHierarchyNode;
  index: AutomationHierarchyIndex;
  selection: AutomationSelection | null;
  activeViewId?: string;
  primaryTreeNodeId: string | null;
  recordingPrimaryKind: "recording" | null;
}): { primarySelected: boolean; correlatedSelected: boolean } {
  const selectionMatched = automationHierarchyNodeMatchesSelection(input.node, input.selection);
  const activeViewMatched = automationHierarchyNodeMatchesActiveFlowView(input.node, input.selection, input.activeViewId);
  const childOwnsSelection = automationHierarchyActiveChildOwnsFlowSelection(input.node, input.index, input.selection, input.activeViewId);
  const recordingPrimarySelected = input.selection?.kind === "recording" && input.recordingPrimaryKind
    ? input.node.kind === input.recordingPrimaryKind
    : input.node.kind === "recording";
  const primarySelected = input.primaryTreeNodeId
    ? input.primaryTreeNodeId === input.node.id
    : activeViewMatched || (!childOwnsSelection && selectionMatched && (input.selection?.kind === "recording" ? recordingPrimarySelected : true));
  return { primarySelected, correlatedSelected: selectionMatched && !primarySelected && !childOwnsSelection };
}

export function automationHierarchyNodeCanRemainPrimary(
  node: AutomationHierarchyNode,
  selection: AutomationSelection | null,
  activeViewId?: string
): boolean {
  if (automationHierarchyNodeMatchesSelection(node, selection)) return true;
  const selectedFlowId = automationHierarchySelectionFlowId(selection);
  return Boolean(node.flowId
    && node.kind !== "flow"
    && selectedFlowId === node.flowId
    && (!activeViewId || !node.viewId || node.viewId === activeViewId));
}

export function automationHierarchySelectionFlowId(selection: AutomationSelection | null): string | null {
  if (selection?.kind === "flow") return selection.id;
  if ((selection?.kind === "editor-node" || selection?.kind === "editor-mode") && selection.flowId) return selection.flowId;
  return null;
}

export function selectAutomationHierarchyPrimaryTreeNodeId(input: {
  nodes: AutomationHierarchyNode[];
  primaryTreeNodeId: string | null;
  selection: AutomationSelection | null;
  activeViewId: string | undefined;
  recordingPrimaryKind: "recording" | null;
}): string | null {
  if (input.recordingPrimaryKind) {
    if (input.selection?.kind !== "recording") return null;
    return input.nodes.find((node) =>
      node.kind === input.recordingPrimaryKind
      && (node.sourceId === input.selection?.id || node.recordingId === input.selection?.id)
    )?.id ?? null;
  }
  if (!input.primaryTreeNodeId) return null;
  const primaryNode = input.nodes.find((node) => node.id === input.primaryTreeNodeId);
  if (!primaryNode) return null;
  return automationHierarchyNodeCanRemainPrimary(primaryNode, input.selection, input.activeViewId)
    ? primaryNode.id
    : null;
}
export function automationHierarchyPrimaryNode(node: AutomationHierarchyNode, nodes: AutomationHierarchyNode[]): AutomationHierarchyNode {
  if (node.kind === "subflow" && typeof node.metadata?.graphFlowId === "string") {
    return nodes.find((candidate) =>
      candidate.parentId === node.id
      && candidate.metadata?.flowStructure === "subflow-nodes"
      && candidate.flowId === node.metadata?.graphFlowId
    ) ?? node;
  }
  return automationHierarchyRouterPrimaryNode(node, nodes);
}

export function automationHierarchyPrimaryNodeId(node: AutomationHierarchyNode, nodes: AutomationHierarchyNode[]): string {
  return automationHierarchyPrimaryNode(node, nodes).id;
}

export function automationHierarchyRouterPrimaryNode(node: AutomationHierarchyNode, nodes: AutomationHierarchyNode[]): AutomationHierarchyNode {
  if (node.kind !== "flow" || !node.sourceId) return node;
  return nodes.find((candidate) => candidate.viewId === automationStudioViewId.router && candidate.flowId === node.sourceId) ?? node;
}

export function automationHierarchyRouterPrimaryNodeId(node: AutomationHierarchyNode, nodes: AutomationHierarchyNode[]): string {
  return automationHierarchyRouterPrimaryNode(node, nodes).id;
}

export function automationHierarchySettingsPrimaryNodeId(node: AutomationHierarchyNode, nodes: AutomationHierarchyNode[]): string {
  if (!node.sourceId) return node.id;
  return nodes.find((candidate) => candidate.viewId === automationStudioViewId.settings && candidate.flowId === node.sourceId)?.id ?? node.id;
}
