import { automationStudioViewId } from "../views/view-registry";
import type { AutomationHierarchyKind, AutomationHierarchyNode, AutomationHierarchyViewId } from "./contracts";
import { stableNodeId } from "./identifiers";
export function flowHierarchyNodes(flowEntries: any[], options: { recordings?: any[]; proposals?: any[] } = {}): AutomationHierarchyNode[] {
  const nodes: AutomationHierarchyNode[] = [];
  const recordings = options.recordings ?? [];
  const proposals = options.proposals ?? [];
  const subflowGraphs = new Map<string, { flowId: string; name: string; flow: any }>();
  for (const entry of flowEntries) {
    const candidate = entry?.flow ?? entry;
    const parentFlowId = typeof candidate?.metadata?.parentFlowId === "string" ? candidate.metadata.parentFlowId : "";
    const parentSubflowId = typeof candidate?.metadata?.parentSubflowId === "string" ? candidate.metadata.parentSubflowId : "";
    if (candidate?.flowId && candidate?.metadata?.subflowGraph === true && parentFlowId && parentSubflowId) {
      subflowGraphs.set(subflowGraphKey(parentFlowId, parentSubflowId), {
        flowId: String(candidate.flowId),
        name: typeof candidate.name === "string" && candidate.name.trim() ? candidate.name.trim() : parentSubflowId,
        flow: candidate
      });
    }
  }
  for (const entry of flowEntries) {
    const flow = entry?.flow ?? entry;
    if (!flow?.flowId || flow.metadata?.subflowGraph === true) continue;
    const flowId = String(flow.flowId);
    const flowNodeId = `flow-${stableNodeId(flowId)}`;
    nodes.push({
      id: flowNodeId,
      label: `${flow.name ?? flowId}${entry?.source === "canonical" ? "" : entry?.source ? " (legacy)" : ""}`,
      kind: "flow",
      category: "flow",
      parentId: typeof flow.metadata?.parentId === "string" ? flow.metadata.parentId : null,
      viewId: automationStudioViewId.flowEditor,
      sourceId: flowId,
      flowId,
      metadata: { hierarchyContainer: true }
    });
    appendFlowObjectHierarchy({
      nodes,
      ownerFlow: flow,
      ownerNodeId: flowNodeId,
      navigationFlowId: flowId,
      recordings,
      proposals,
      subflowGraphs,
      includeUnlinkedRecordings: false,
      includeRouter: true,
      visitedFlowIds: new Set([flowId])
    });
  }
  return nodes;
}

function appendFlowObjectHierarchy(input: {
  nodes: AutomationHierarchyNode[];
  ownerFlow: any;
  ownerNodeId: string;
  navigationFlowId: string;
  recordings: any[];
  proposals: any[];
  subflowGraphs: Map<string, { flowId: string; name: string; flow: any }>;
  includeUnlinkedRecordings: boolean;
  includeRouter: boolean;
  visitedFlowIds: Set<string>;
}): void {
  const { nodes, ownerFlow, ownerNodeId, navigationFlowId, proposals, subflowGraphs } = input;
  const expansion = ownerFlow?.expansion ?? {};
  const linkedRecordingIds = linkedArtifactIds(ownerFlow, "recordingIds");
  const flowRecordings = linkedRecordingIds.size
    ? input.recordings.filter((recording) => linkedRecordingIds.has(String(recording.recordingId ?? "")))
    : input.includeUnlinkedRecordings ? input.recordings : [];
  const flowRecordingIds = new Set(flowRecordings.map((recording) => String(recording.recordingId ?? "")));
  const linkedProposalIds = linkedArtifactIds(ownerFlow, "proposalIds");
  const flowProposals = proposals.filter((proposal) => {
    const proposalId = String(proposal.proposalId ?? proposal.id ?? "");
    const proposalFlowId = proposal.flowId ?? proposal.policy?.flowId ?? proposal.metadata?.flowId;
    const proposalRecordingId = String(proposal.recordingId ?? proposal.metadata?.recordingId ?? "");
    if (linkedProposalIds.size && linkedProposalIds.has(proposalId)) return true;
    if (proposalFlowId === navigationFlowId) return true;
    return Boolean(proposalRecordingId && flowRecordingIds.has(proposalRecordingId));
  });
  const changeProposalIds = Array.isArray(expansion.changeProposalIds) ? expansion.changeProposalIds.map(String).filter(Boolean) : [];
  const flowProposalIds = flowProposals.map((proposal) => String(proposal.proposalId ?? proposal.id ?? "")).filter(Boolean);
  const adaptationSourceIds = [
    ...(Array.isArray(expansion.adaptationIds) ? expansion.adaptationIds.map(String).filter(Boolean) : []),
    ...flowProposalIds,
    ...changeProposalIds
  ].filter((sourceId, index, allIds) => allIds.indexOf(sourceId) === index);
  const sectionSpecs: Array<{ id: string; label: string; kind: AutomationHierarchyKind; viewId: AutomationHierarchyViewId; sourceIds?: unknown[]; metadata?: Record<string, unknown> }> = [
    { id: "subflows", label: "Subflows", kind: "folder", viewId: automationStudioViewId.subflows, sourceIds: hierarchySubflowEntries(ownerFlow), metadata: { flowStructure: "subflows" } },
    { id: "instructions", label: "Instructions", kind: "flow-object", viewId: automationStudioViewId.instructions, sourceIds: Array.isArray(expansion.instructionIds) ? expansion.instructionIds : [] },
    { id: "recordings", label: "Recordings", kind: "folder", viewId: automationStudioViewId.recordingTimeline, sourceIds: flowRecordings.map((recording) => recording.recordingId) },
    { id: "adaptations", label: "Adaptations", kind: "folder", viewId: automationStudioViewId.adaptations, sourceIds: adaptationSourceIds },
    { id: automationStudioViewId.runtime, label: "Runtime Debug", kind: "flow-object", viewId: automationStudioViewId.runtime },
    { id: "settings", label: "Settings", kind: "flow-object", viewId: automationStudioViewId.settings }
  ];
  if (input.includeRouter) sectionSpecs.unshift({ id: "router", label: "Router", kind: "flow-object", viewId: automationStudioViewId.router });
  else sectionSpecs.unshift({ id: "nodes", label: "Nodes", kind: "flow-object", viewId: automationStudioViewId.flowEditor, metadata: { flowStructure: "subflow-nodes" } });
  for (const section of sectionSpecs) {
    const sectionId = `flow-${stableNodeId(navigationFlowId)}-${section.id}`;
    nodes.push({
      id: sectionId,
      label: section.label,
      kind: section.kind,
      category: "flow",
      parentId: ownerNodeId,
      viewId: section.viewId,
      sourceId: navigationFlowId,
      flowId: navigationFlowId,
      ...(section.metadata ? { metadata: section.metadata } : {})
    });
    const subflowCategoryNodeIds = section.id === "subflows" ? appendSubflowCategoryNodes(nodes, ownerFlow, sectionId) : new Map<string, string>();
    for (const rawId of section.sourceIds ?? []) {
      const sourceId = section.id === "subflows" ? subflowSourceId(rawId) : String(rawId);
      const childKind = section.id === "subflows"
        ? "subflow"
        : section.id === "instructions"
          ? "instruction"
          : section.id === "adaptations"
            ? "adaptation"
            : section.id === "recordings"
              ? "recording"
              : "run";
      const subflowGraph = childKind === "subflow" ? subflowGraphs.get(subflowGraphKey(navigationFlowId, sourceId)) : null;
      const subflowGraphId = childKind === "subflow"
        ? subflowGraph?.flowId ?? subflowGraphFlowId(rawId) ?? defaultSubflowGraphFlowId(navigationFlowId, sourceId)
        : null;
      const childNodeId = `flow-${stableNodeId(navigationFlowId)}-${section.id}-${stableNodeId(sourceId)}`;
      nodes.push({
        id: childNodeId,
        label: childKind === "subflow"
          ? subflowDisplayName(rawId) ?? subflowGraph?.name ?? hierarchyObjectLabel(childKind, sourceId)
          : hierarchyObjectLabel(childKind, sourceId),
        kind: childKind,
        category: "flow",
        parentId: subflowCategoryParentId(rawId, subflowCategoryNodeIds) ?? sectionId,
        viewId: childKind === "subflow" ? automationStudioViewId.flowEditor : section.viewId,
        sourceId,
        flowId: navigationFlowId,
        ...(subflowGraphId ? { metadata: { graphFlowId: subflowGraphId, hierarchyContainer: true, defaultCollapsed: true } } : {}),
        ...proposalRecordingNodeData(childKind, sourceId, proposals)
      });
      if (childKind !== "subflow" || !subflowGraphId || input.visitedFlowIds.has(subflowGraphId)) continue;
      const visitedFlowIds = new Set(input.visitedFlowIds);
      visitedFlowIds.add(subflowGraphId);
      appendFlowObjectHierarchy({
        ...input,
        ownerFlow: subflowGraph?.flow ?? { flowId: subflowGraphId, expansion: {} },
        ownerNodeId: childNodeId,
        navigationFlowId: subflowGraphId,
        includeUnlinkedRecordings: false,
        includeRouter: false,
        visitedFlowIds
      });
    }
  }
}
function appendSubflowCategoryNodes(nodes: AutomationHierarchyNode[], flow: any, subflowsFolderNodeId: string): Map<string, string> {
  const flowId = String(flow.flowId ?? "");
  const categories = subflowCategoriesFromFlow(flow);
  const nodeIds = new Map(categories.map((category) => [category.id, `flow-${stableNodeId(flowId)}-subflows-category-${stableNodeId(category.id)}`]));
  for (const category of categories) {
    const parentCategoryId = category.parentId && category.parentId !== category.id && !subflowCategoryCreatesCycle(category.id, category.parentId, categories)
      ? category.parentId
      : null;
    nodes.push({
      id: nodeIds.get(category.id)!,
      label: category.name,
      kind: "folder",
      category: "flow",
      parentId: parentCategoryId && nodeIds.has(parentCategoryId) ? nodeIds.get(parentCategoryId)! : subflowsFolderNodeId,
      viewId: automationStudioViewId.flowEditor,
      sourceId: category.id,
      flowId,
      metadata: { flowStructure: "subflow-category", parentCategoryId: parentCategoryId ?? null }
    });
  }
  return nodeIds;
}

function subflowCategoriesFromFlow(flow: any): Array<{ id: string; name: string; parentId: string | null }> {
  const metadata = flow?.metadata && typeof flow.metadata === "object" && !Array.isArray(flow.metadata) ? flow.metadata : {};
  const rawCategories = Array.isArray(metadata.subflowCategories)
    ? metadata.subflowCategories
    : Array.isArray(metadata.subflowFolders)
      ? metadata.subflowFolders
      : [];
  const seen = new Set<string>();
  return rawCategories.flatMap((raw: any) => {
    const id = typeof raw?.id === "string" ? raw.id.trim() : typeof raw?.categoryId === "string" ? raw.categoryId.trim() : "";
    const name = typeof raw?.name === "string" ? raw.name.trim() : typeof raw?.label === "string" ? raw.label.trim() : "";
    if (!id || !name || seen.has(id)) return [];
    seen.add(id);
    const parentId = typeof raw?.parentId === "string" && raw.parentId.trim() ? raw.parentId.trim() : null;
    return [{ id, name, parentId }];
  });
}

function hierarchySubflowEntries(flow: any): unknown[] {
  const metadata = flow?.metadata && typeof flow.metadata === "object" && !Array.isArray(flow.metadata) ? flow.metadata : {};
  if (Array.isArray(metadata.hierarchySubflows)) return metadata.hierarchySubflows;
  return Array.isArray(flow?.expansion?.subflowIds) ? flow.expansion.subflowIds : [];
}

function subflowGraphKey(parentFlowId: string, subflowId: string): string {
  return parentFlowId + "::" + subflowId;
}

function defaultSubflowGraphFlowId(parentFlowId: string, subflowId: string): string {
  return parentFlowId + "." + subflowId + ".graph";
}

function subflowDisplayName(rawId: unknown): string | null {
  if (!rawId || typeof rawId !== "object" || Array.isArray(rawId)) return null;
  const raw = rawId as Record<string, unknown>;
  return typeof raw.name === "string" && raw.name.trim()
    ? raw.name.trim()
    : typeof raw.label === "string" && raw.label.trim() ? raw.label.trim() : null;
}

function subflowGraphFlowId(rawId: unknown): string | null {
  if (!rawId || typeof rawId !== "object" || Array.isArray(rawId)) return null;
  const graphFlowId = (rawId as Record<string, unknown>).graphFlowId;
  return typeof graphFlowId === "string" && graphFlowId.trim() ? graphFlowId.trim() : null;
}

function subflowSourceId(rawId: unknown): string {
  if (rawId && typeof rawId === "object" && !Array.isArray(rawId)) {
    const raw = rawId as any;
    return String(raw.subflowId ?? raw.id ?? raw.sourceId ?? "");
  }
  return String(rawId);
}

function subflowCategoryParentId(rawId: unknown, categoryNodeIds: Map<string, string>): string | null {
  if (!rawId || typeof rawId !== "object" || Array.isArray(rawId)) return null;
  const metadata = (rawId as any).metadata && typeof (rawId as any).metadata === "object" && !Array.isArray((rawId as any).metadata) ? (rawId as any).metadata : {};
  const categoryId = typeof metadata.subflowCategoryId === "string" ? metadata.subflowCategoryId : typeof metadata.categoryId === "string" ? metadata.categoryId : "";
  return categoryId && categoryNodeIds.has(categoryId) ? categoryNodeIds.get(categoryId)! : null;
}

function subflowCategoryCreatesCycle(categoryId: string, parentId: string, categories: Array<{ id: string; parentId: string | null }>): boolean {
  const parents = new Map(categories.map((category) => [category.id, category.parentId]));
  let cursor: string | null | undefined = parentId;
  const visited = new Set<string>();
  while (cursor) {
    if (cursor === categoryId || visited.has(cursor)) return true;
    visited.add(cursor);
    cursor = parents.get(cursor);
  }
  return false;
}
function hierarchyObjectLabel(kind: AutomationHierarchyKind, sourceId: string): string {
  if (kind === "subflow") return sourceId.replace(/^subflow[.:_-]?/, "") || sourceId;
  if (kind === "instruction") return sourceId.replace(/^instruction[.:_-]?/, "") || sourceId;
  if (kind === "change-proposal") return sourceId.replace(/^proposal[.:_-]?/, "") || sourceId;
  if (kind === "adaptation") return sourceId.replace(/^adaptation[.:_-]?/, "") || sourceId;
  if (kind === "recording") return sourceId.replace(/^recording[.:_-]?/, "") || sourceId;
  if (kind === "proposal") return sourceId.replace(/^proposal[.:_-]?/, "") || sourceId;
  if (kind === "run") return sourceId.replace(/^run[.:_-]?/, "") || sourceId;
  return sourceId;
}

function linkedArtifactIds(flow: any, key: string): Set<string> {
  const metadataIds = Array.isArray(flow?.metadata?.[key]) ? flow.metadata[key] : [];
  const expansionIds = Array.isArray(flow?.expansion?.[key]) ? flow.expansion[key] : [];
  const directIds = Array.isArray(flow?.[key]) ? flow[key] : [];
  return new Set([...metadataIds, ...expansionIds, ...directIds].map(String).filter(Boolean));
}

function proposalRecordingId(proposal: any): string | undefined {
  const recordingId = proposal?.recordingId ?? proposal?.metadata?.recordingId;
  return typeof recordingId === "string" && recordingId ? recordingId : undefined;
}

function proposalRecordingNodeData(kind: AutomationHierarchyKind, sourceId: string, proposals: any[]): { recordingId?: string } {
  if (kind !== "proposal") return {};
  const recordingId = proposalRecordingId(proposals.find((proposal) => String(proposal.proposalId ?? proposal.id ?? "") === sourceId));
  return recordingId ? { recordingId } : {};
}
