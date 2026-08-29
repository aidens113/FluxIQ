import { automationStudioViewId } from "../views/view-registry";
import type { AutomationHierarchyNode } from "./contracts";
import { stableNodeId } from "./identifiers";
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
      viewId: automationStudioViewId.recordingTimeline,
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
