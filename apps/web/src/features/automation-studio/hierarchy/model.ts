import type { AutomationWorkspacePrefs } from "../workspace/layout";

export type AutomationHierarchyKind = "folder" | "client" | "proposal" | "flow" | "flow-object" | "subflow" | "instruction" | "change-proposal" | "adaptation" | "task" | "routine" | "config" | "recording" | "run";
export type AutomationCreatableHierarchyKind = "folder" | "flow";
export type AutomationHierarchyCategory = "client" | "proposal" | "flow" | "task" | "routine" | "config" | "recording" | "run";
export const automationHierarchyCategories: Array<{ id: AutomationHierarchyCategory; label: string; description: string; creatable?: boolean }> = [
  { id: "flow", label: "Flows", description: "Visual, recorded, and programmatic automations", creatable: true }
];
export type AutomationHierarchyNode = {
  id: string;
  label: string;
  kind: AutomationHierarchyKind;
  category: AutomationHierarchyCategory;
  parentId: string | null;
  viewId?: string;
  sourceId?: string;
  flowId?: string;
  recordingId?: string;
};
export type AutomationHierarchyAction = {
  action: "create" | "delete";
  node?: AutomationHierarchyNode;
  category?: AutomationHierarchyCategory;
  parentId?: string | null;
} | null;

export function automationHierarchyNodeIsGeneratedFlowStructure(node: AutomationHierarchyNode): boolean {
  return Boolean(node.flowId && node.kind !== "flow" && (node.kind === "folder" || node.kind === "flow-object"));
}

export function automationHierarchyNodeCanDelete(node: AutomationHierarchyNode): boolean {
  if (node.kind === "client" || (node.kind === "run" && !node.flowId)) return false;
  if (automationHierarchyNodeIsGeneratedFlowStructure(node)) return false;
  if (node.category === "proposal" && node.kind !== "proposal") return false;
  return true;
}

export type AutomationStudioProject = {
  id: string;
  name: string;
  description: string;
  domainId?: string | null;
  categoryId?: string | null;
  createdAt: number;
  updatedAt: number;
};
export type AutomationStudioProjectCategory = {
  id: string;
  name: string;
  domainId?: string | null;
  order: number;
  createdAt: number;
  updatedAt: number;
};
export type AutomationProjectModal = "create" | "rename" | "delete" | "move" | "create-category" | "rename-category" | "delete-category" | "move-category" | null;

export function sortAutomationHierarchyNodes(nodes: AutomationHierarchyNode[]): AutomationHierarchyNode[] {
  const rank: Record<AutomationHierarchyKind, number> = { folder: 0, flow: 1, "flow-object": 2, subflow: 3, instruction: 3, "change-proposal": 3, adaptation: 3, client: 4, proposal: 4, task: 4, routine: 4, config: 4, recording: 4, run: 4 };
  return [...nodes].sort((first, second) => rank[first.kind] - rank[second.kind] || first.label.localeCompare(second.label));
}

export function automationHierarchyCategoryLabel(category: AutomationHierarchyCategory): string {
  return automationHierarchyCategories.find((item) => item.id === category)?.label ?? "Flows";
}

export function collectHierarchyAncestorIds(parentId: string | null, nodes: AutomationHierarchyNode[]): string[] {
  if (!parentId) return [];
  const parent = nodes.find((node) => node.id === parentId);
  return parent ? [parent.id, ...collectHierarchyAncestorIds(parent.parentId, nodes)] : [];
}

export function collectHierarchyDescendantIds(parentId: string, nodes: AutomationHierarchyNode[]): string[] {
  const children = nodes.filter((node) => node.parentId === parentId);
  return children.flatMap((child) => [child.id, ...collectHierarchyDescendantIds(child.id, nodes)]);
}

export function recordingHierarchyNodes(recordings: any[]): AutomationHierarchyNode[] {
  const clientFolders = new Map<string, AutomationHierarchyNode>();
  const nodes: AutomationHierarchyNode[] = [];
  for (const recording of recordings) {
    const clientName = recordingClientName(recording);
    const folderId = `recordings-client-${stableNodeId(clientName)}`;
    if (!clientFolders.has(folderId)) {
      const folder: AutomationHierarchyNode = {
        id: folderId,
        label: clientName,
        kind: "folder",
        category: "recording",
        parentId: null
      };
      clientFolders.set(folderId, folder);
      nodes.push(folder);
    }
    nodes.push({
      id: recording.recordingId,
      label: recordingDateTimeLabel(recording),
      kind: "recording",
      category: "recording",
      parentId: folderId,
      viewId: "timeline-recording",
      sourceId: recording.recordingId
    });
  }
  return nodes;
}

export function proposalHierarchyNodes(recordings: any[], proposals: any[]): AutomationHierarchyNode[] {
  const clientFolders = new Map<string, AutomationHierarchyNode>();
  const recordingFolders = new Map<string, AutomationHierarchyNode>();
  const nodes: AutomationHierarchyNode[] = [];
  const recordingsById = new Map(recordings.map((recording) => [recording.recordingId, recording]));
  for (const proposal of proposals) {
    const recordingId = proposal?.recordingId ?? proposal?.metadata?.recordingId;
    const recording = typeof recordingId === "string" ? recordingsById.get(recordingId) : null;
    if (!recording) continue;
    const clientName = recordingClientName(recording);
    const folderId = `proposals-client-${stableNodeId(clientName)}`;
    if (!clientFolders.has(folderId)) {
      const folder: AutomationHierarchyNode = {
        id: folderId,
        label: clientName,
        kind: "folder",
        category: "proposal",
        parentId: null
      };
      clientFolders.set(folderId, folder);
      nodes.push(folder);
    }
    const recordingFolderId = `proposals-recording-${stableNodeId(recording.recordingId)}`;
    if (!recordingFolders.has(recordingFolderId)) {
      const folder: AutomationHierarchyNode = {
        id: recordingFolderId,
        label: recordingDateTimeLabel(recording),
        kind: "folder",
        category: "proposal",
        parentId: folderId,
        sourceId: recording.recordingId
      };
      recordingFolders.set(recordingFolderId, folder);
      nodes.push(folder);
    }
    nodes.push({
      id: `proposal-${stableNodeId(proposal.proposalId)}`,
      label: proposalHierarchyLabel(proposal),
      kind: "proposal",
      category: "proposal",
      parentId: recordingFolderId,
      viewId: "proposal-workbench",
      sourceId: proposal.proposalId,
      recordingId: recording.recordingId
    });
  }
  return nodes;
}

export function flowHierarchyNodes(flowEntries: any[], options: { recordings?: any[]; proposals?: any[] } = {}): AutomationHierarchyNode[] {
  const nodes: AutomationHierarchyNode[] = [];
  const recordings = options.recordings ?? [];
  const proposals = options.proposals ?? [];
  for (const entry of flowEntries) {
    const flow = entry?.flow ?? entry;
    if (!flow?.flowId) continue;
    const flowId = String(flow.flowId);
    const flowNodeId = `flow-${stableNodeId(flowId)}`;
    const linkedRecordingIds = linkedArtifactIds(flow, "recordingIds");
    const flowRecordings = linkedRecordingIds.size
      ? recordings.filter((recording) => linkedRecordingIds.has(String(recording.recordingId ?? "")))
      : recordings;
    const flowRecordingIds = new Set(flowRecordings.map((recording) => String(recording.recordingId ?? "")));
    const linkedProposalIds = linkedArtifactIds(flow, "proposalIds");
    const flowProposals = proposals.filter((proposal) => {
      const proposalId = String(proposal.proposalId ?? proposal.id ?? "");
      const proposalFlowId = proposal.flowId ?? proposal.policy?.flowId ?? proposal.metadata?.flowId;
      const proposalRecordingId = String(proposal.recordingId ?? proposal.metadata?.recordingId ?? "");
      if (linkedProposalIds.size && linkedProposalIds.has(proposalId)) return true;
      if (proposalFlowId === flowId) return true;
      return Boolean(proposalRecordingId && flowRecordingIds.has(proposalRecordingId));
    });
    nodes.push({
      id: flowNodeId,
      label: `${flow.name ?? flowId}${entry?.source === "canonical" ? "" : entry?.source ? " (legacy)" : ""}`,
      kind: "flow",
      category: "flow",
      parentId: typeof flow.metadata?.parentId === "string" ? flow.metadata.parentId : null,
      viewId: "policy-primary",
      sourceId: flowId,
      flowId
    });
    const expansion = flow.expansion ?? {};
    const changeProposalIds = Array.isArray(expansion.changeProposalIds) ? expansion.changeProposalIds.map(String).filter(Boolean) : [];
    const flowProposalIds = flowProposals.map((proposal) => String(proposal.proposalId ?? proposal.id ?? "")).filter(Boolean);
    const adaptationSourceIds = [
      ...(Array.isArray(expansion.adaptationIds) ? expansion.adaptationIds.map(String).filter(Boolean) : []),
      ...flowProposalIds,
      ...changeProposalIds
    ].filter((sourceId, index, allIds) => allIds.indexOf(sourceId) === index);
    const sectionSpecs: Array<{ id: string; label: string; kind: AutomationHierarchyKind; viewId: string; sourceIds?: unknown[] }> = [
      { id: "router", label: "Router", kind: "flow-object", viewId: "flow-router" },
      { id: "subflows", label: "Subflows", kind: "folder", viewId: "policy-primary", sourceIds: Array.isArray(expansion.subflowIds) ? expansion.subflowIds : [] },
      { id: "instructions", label: "Instructions", kind: "flow-object", viewId: "flow-instructions", sourceIds: Array.isArray(expansion.instructionIds) ? expansion.instructionIds : [] },
      { id: "recordings", label: "Recordings", kind: "folder", viewId: "timeline-recording", sourceIds: flowRecordings.map((recording) => recording.recordingId) },
      { id: "adaptations", label: "Adaptations", kind: "folder", viewId: "adaptations", sourceIds: adaptationSourceIds },
      { id: "runs", label: "Runs", kind: "folder", viewId: "runs-history", sourceIds: Array.isArray(expansion.runIds) ? expansion.runIds : [] },
      { id: "runtime-debug", label: "Runtime Debug", kind: "flow-object", viewId: "runtime-debug" },
      { id: "settings", label: "Settings", kind: "flow-object", viewId: "flow-settings" }
    ];
    for (const section of sectionSpecs) {
      const sectionId = `flow-${stableNodeId(flowId)}-${section.id}`;
      nodes.push({
        id: sectionId,
        label: section.label,
        kind: section.kind,
        category: "flow",
        parentId: flowNodeId,
        viewId: section.viewId,
        sourceId: flowId,
        flowId
      });
      for (const rawId of section.sourceIds ?? []) {
        const sourceId = String(rawId);
        const childKind = section.id === "subflows"
          ? "subflow"
          : section.id === "instructions"
            ? "instruction"
            : section.id === "adaptations"
              ? "adaptation"
              : section.id === "recordings"
                ? "recording"
                : "run";
        const viewId = section.viewId;
        nodes.push({
          id: `flow-${stableNodeId(flowId)}-${section.id}-${stableNodeId(sourceId)}`,
          label: hierarchyObjectLabel(childKind, sourceId),
          kind: childKind,
          category: "flow",
          parentId: sectionId,
          viewId,
          sourceId,
          flowId,
          ...proposalRecordingNodeData(childKind, sourceId, proposals)
        });
      }
    }
  }
  return nodes;
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

function proposalHierarchyLabel(proposal: any): string {
  const metadata = proposal?.metadata ?? {};
  if (typeof metadata.title === "string" && metadata.title.trim()) return metadata.title.trim();
  const mode = metadata.generationMode === "llm_assisted" ? "Assisted" : metadata.generationMode === "direct" ? "Direct" : "Proposal";
  const detail = proposal?.mapper?.id ?? metadata.generatedBy ?? (proposal?.generatedAt ? new Date(proposal.generatedAt).toLocaleString() : proposal?.proposalId);
  return `${mode}: ${detail}`;
}

export function recordingClientName(recording: any): string {
  const metadata = recording?.metadata ?? {};
  const environment = recording?.environment ?? {};
  return String(
    metadata.clientName
    ?? metadata.clientId
    ?? metadata.sessionId
    ?? environment.label
    ?? environment.id
    ?? recording?.sources?.[0]?.label
    ?? "Local Studio"
  );
}

export function recordingDateTimeLabel(recording: any): string {
  const startedAt = typeof recording?.startedAt === "number" ? recording.startedAt : 0;
  const fallback = recording?.metadata?.name ?? recording?.name ?? recording?.recordingId ?? "Recording";
  if (!startedAt) return String(fallback);
  return new Date(startedAt).toLocaleString();
}

export function stableNodeId(value: string): string {
  return stableHash(value).toString(36);
}

export function automationHierarchySignature(customHierarchyNodes: AutomationHierarchyNode[], deletedHierarchyIds: string[], workspacePrefs: AutomationWorkspacePrefs): string {
  return JSON.stringify({ customHierarchyNodes, deletedHierarchyIds, workspacePrefs });
}


function stableHash(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  return hash;
}
