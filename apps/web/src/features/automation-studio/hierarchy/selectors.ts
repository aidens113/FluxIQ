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
  const activeSubflowContainerIds = new Set(input.nodes
    .filter((node) => node.kind === "subflow" && input.selection?.kind === "flow" && node.metadata?.graphFlowId === input.selection.id)
    .map((node) => node.id));
  const expandedIds = new Set(input.expandedDefaultCollapsedIds);
  return [
    ...input.collapsedFolderIds.filter((id) => !activeSubflowContainerIds.has(id)),
    ...input.nodes
      .filter((node) => node.metadata?.defaultCollapsed === true && !expandedIds.has(node.id) && !activeSubflowContainerIds.has(node.id))
      .map((node) => node.id)
  ];
}

export function automationHierarchyNodeMatchesSelection(node: AutomationHierarchyNode, selection: AutomationSelection | null): boolean {
  return Boolean(node.sourceId && (
    (selection?.kind === "flow" && node.kind === "flow" && selection.id === node.sourceId)
    || (selection?.kind === "flow" && node.kind === "subflow" && selection.id === node.metadata?.graphFlowId)
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
  return Boolean(
    activeViewId
    && node.viewId === activeViewId
    && node.flowId
    && node.kind !== "flow"
    && selection?.kind === "flow"
    && selection.id === node.flowId
  );
}

export function automationHierarchyActiveChildOwnsFlowSelection(
  node: AutomationHierarchyNode,
  hierarchyIndex: AutomationHierarchyIndex,
  selection: AutomationSelection | null,
  activeViewId?: string
): boolean {
  const ownedFlowId = node.kind === "flow"
    ? node.sourceId
    : node.kind === "subflow" && typeof node.metadata?.graphFlowId === "string"
      ? node.metadata.graphFlowId
      : null;
  return Boolean(
    ownedFlowId
    && selection?.kind === "flow"
    && selection.id === ownedFlowId
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
  return Boolean(node.flowId
    && node.kind !== "flow"
    && selection?.kind === "flow"
    && selection.id === node.flowId
    && (!activeViewId || !node.viewId || node.viewId === activeViewId));
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
