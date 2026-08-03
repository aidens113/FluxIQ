import type { AutomationWorkspacePrefs } from "../workspace/layout";

export type AutomationHierarchyKind = "folder" | "client" | "pipeline" | "task" | "routine" | "config" | "recording" | "run";
export type AutomationCreatableHierarchyKind = "folder" | "task" | "routine";
export type AutomationHierarchyCategory = "client" | "pipeline" | "task" | "routine" | "config" | "recording" | "run";
export const automationHierarchyCategories: Array<{ id: AutomationHierarchyCategory; label: string; description: string; creatable?: boolean }> = [
  { id: "routine", label: "Routines", description: "Deterministic routine orchestration", creatable: true },
  { id: "task", label: "Tasks", description: "Learned task workspaces", creatable: true },
  { id: "pipeline", label: "Pipelines", description: "Transform recordings into task drafts" },
  { id: "recording", label: "Recordings", description: "Raw browser recording sessions", creatable: true },
  { id: "config", label: "Configurations", description: "Configuration folders and defaults", creatable: true }
];
export type AutomationHierarchyNode = {
  id: string;
  label: string;
  kind: AutomationHierarchyKind;
  category: AutomationHierarchyCategory;
  parentId: string | null;
  viewId?: string;
  sourceId?: string;
};
export type AutomationHierarchyAction = {
  action: "create" | "delete";
  node?: AutomationHierarchyNode;
  category?: AutomationHierarchyCategory;
  parentId?: string | null;
} | null;
export type AutomationStudioProject = {
  id: string;
  name: string;
  description: string;
  categoryId?: string | null;
  createdAt: number;
  updatedAt: number;
};
export type AutomationStudioProjectCategory = {
  id: string;
  name: string;
  order: number;
  createdAt: number;
  updatedAt: number;
};
export type AutomationProjectModal = "create" | "rename" | "delete" | "move" | "create-category" | "rename-category" | "delete-category" | "move-category" | null;

export function sortAutomationHierarchyNodes(nodes: AutomationHierarchyNode[]): AutomationHierarchyNode[] {
  const rank: Record<AutomationHierarchyKind, number> = { folder: 0, client: 1, pipeline: 1, task: 1, routine: 1, config: 1, recording: 1, run: 1 };
  return [...nodes].sort((first, second) => rank[first.kind] - rank[second.kind] || first.label.localeCompare(second.label));
}

export function automationHierarchyCategoryLabel(category: AutomationHierarchyCategory): string {
  return automationHierarchyCategories.find((item) => item.id === category)?.label ?? "Tasks";
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

export function pipelineHierarchyNodes(recordings: any[]): AutomationHierarchyNode[] {
  const clientFolders = new Map<string, AutomationHierarchyNode>();
  const nodes: AutomationHierarchyNode[] = [];
  for (const recording of recordings) {
    const clientName = recordingClientName(recording);
    const folderId = `pipelines-client-${stableNodeId(clientName)}`;
    if (!clientFolders.has(folderId)) {
      const folder: AutomationHierarchyNode = {
        id: folderId,
        label: clientName,
        kind: "folder",
        category: "pipeline",
        parentId: null
      };
      clientFolders.set(folderId, folder);
      nodes.push(folder);
    }
    nodes.push({
      id: `pipeline-${stableNodeId(recording.recordingId)}`,
      label: recordingDateTimeLabel(recording),
      kind: "pipeline",
      category: "pipeline",
      parentId: folderId,
      viewId: "pipeline-workbench",
      sourceId: recording.recordingId
    });
  }
  return nodes;
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
