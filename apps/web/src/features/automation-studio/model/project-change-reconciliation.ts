import type { AutomationHierarchyNode } from "../hierarchy/model";
import type { AutomationStudioProjectChangeEvent } from "../sync/project-sync";
import { removeDeletedRecordingArtifacts } from "./deletion";
import {
  applyCustomFolderDelete,
  applyFlowObjectReferenceDelete,
  applySubflowCategoryDelete,
  deleteRecordingCollectionItems,
  type FlowObjectKind
} from "./local-mutations";

export function upsertById<TItem extends Record<string, any>>(items: TItem[], idKey: keyof TItem): TItem[] {
  const seen = new Set<string>();
  const merged: TItem[] = [];
  for (const item of items) {
    const id = String(item[idKey] ?? "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    merged.push(item);
  }
  return merged;
}
export function mergeRecordingSummaries(current: any[], incoming: any[]) {
  const loadedById = new Map(current
    .filter((recording) => recording?.recordingId && recording.metadata?.summaryOnly !== true)
    .map((recording) => [recording.recordingId, recording]));
  return incoming.map((recording) => {
    const loaded = loadedById.get(recording?.recordingId);
    return loaded && recording?.metadata?.summaryOnly === true
      ? { ...recording, ...loaded, metadata: { ...(recording.metadata ?? {}), ...(loaded.metadata ?? {}) } }
      : recording;
  });
}

export function mergeFlowDetails(current: any[], incoming: any[]) {
  const incomingById = new Map(incoming
    .filter((entry) => entry?.flow?.flowId)
    .map((entry) => [entry.flow.flowId, entry]));
  let changed = false;
  const next = current.map((entry) => {
    const replacement = incomingById.get(entry?.flow?.flowId);
    if (!replacement) return entry;
    if (replacement === entry || (replacement.flow === entry.flow && replacement.source === entry.source && replacement.readOnly === entry.readOnly)) return entry;
    if (keepCurrentFlowDetail(entry?.flow, replacement?.flow)) return entry;
    changed = true;
    return replacement;
  });
  for (const entry of incoming) {
    if (entry?.flow?.flowId && !next.some((item) => item?.flow?.flowId === entry.flow.flowId)) {
      next.push(entry);
      changed = true;
    }
  }
  return changed ? next : current;
}

function keepCurrentFlowDetail(current: any, incoming: any): boolean {
  if (!current || !incoming) return false;
  if (current.metadata?.summaryOnly !== true && incoming.metadata?.summaryOnly === true) return true;
  if (current.metadata?.summaryOnly === true || incoming.metadata?.summaryOnly === true) return false;
  const currentRevision = Number(current.graphRevision ?? current.metadata?.graphRevision ?? 0);
  const incomingRevision = Number(incoming.graphRevision ?? incoming.metadata?.graphRevision ?? 0);
  if (Number.isFinite(currentRevision) && Number.isFinite(incomingRevision) && currentRevision > incomingRevision) return true;
  const currentUpdatedAt = comparableFlowTime(current.updatedAt);
  const incomingUpdatedAt = comparableFlowTime(incoming.updatedAt);
  return currentUpdatedAt > 0 && incomingUpdatedAt > 0 && currentUpdatedAt > incomingUpdatedAt;
}

function comparableFlowTime(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return 0;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function mergeRecordingDetail(current: any[], recording: any): any[] {
  if (!recording?.recordingId) return current;
  const existing = current.find((item) => item?.recordingId === recording.recordingId);
  if (existing === recording) return current;
  return [recording, ...current.filter((item) => item?.recordingId !== recording.recordingId)];
}

export function mergeCreatedFlowIntoProjectFlows(current: any[], flow: any): any[] {
  if (!flow?.flowId) return current;
  return mergeFlowDetails(current, [{ source: "canonical", readOnly: false, flow }]);
}

export function removeDeletedFlowsFromProjectFlows(current: any[], flowIds: readonly string[]): any[] {
  const deletedFlowIds = new Set(flowIds.filter(Boolean));
  if (!deletedFlowIds.size) return current;
  return current.filter((entry) => !deletedFlowIds.has(entry?.flow?.flowId));
}

export function upsertSubflowSummaryIntoProjectFlows(current: any[], parentFlowId: string, subflow: any): any[] {
  if (!parentFlowId || !subflow?.subflowId) return current;
  return current.map((entry) => {
    if (entry?.flow?.flowId !== parentFlowId) return entry;
    const flow = entry.flow;
    const metadata = flow.metadata && typeof flow.metadata === "object" ? flow.metadata : {};
    const existing = Array.isArray(metadata.hierarchySubflows) ? metadata.hierarchySubflows : Array.isArray(flow.expansion?.subflowIds) ? flow.expansion.subflowIds : [];
    const parentCategoryId = subflow.parentCategoryId ?? subflow.metadata?.parentCategoryId ?? subflow.metadata?.subflowCategoryId ?? subflow.metadata?.categoryId;
    const summary = {
      subflowId: subflow.subflowId,
      ...(subflow.name ? { name: subflow.name } : {}),
      ...(subflow.graphFlowId ? { graphFlowId: subflow.graphFlowId } : {}),
      ...(typeof parentCategoryId === "string" && parentCategoryId ? { parentCategoryId, metadata: { subflowCategoryId: parentCategoryId } } : {})
    };
    const nextHierarchySubflows = upsertById([...existing.filter((item: any) => subflowSummaryId(item) !== subflow.subflowId), summary], "subflowId");
    return { ...entry, flow: { ...flow, metadata: { ...metadata, hierarchySubflows: nextHierarchySubflows } } };
  });
}

export function removeSubflowSummaryFromProjectFlows(current: any[], parentFlowId: string, subflowIds: readonly string[]): any[] {
  const deleted = new Set(subflowIds.filter(Boolean));
  if (!parentFlowId || !deleted.size) return current;
  return current.map((entry) => {
    if (entry?.flow?.flowId !== parentFlowId) return entry;
    const flow = entry.flow;
    const metadata = flow.metadata && typeof flow.metadata === "object" ? flow.metadata : {};
    const existing = Array.isArray(metadata.hierarchySubflows) ? metadata.hierarchySubflows : Array.isArray(flow.expansion?.subflowIds) ? flow.expansion.subflowIds : [];
    return { ...entry, flow: { ...flow, metadata: { ...metadata, hierarchySubflows: existing.filter((item: any) => !deleted.has(subflowSummaryId(item))) } } };
  });
}

function subflowSummaryId(item: any): string {
  return typeof item === "string" ? item : String(item?.subflowId ?? item?.id ?? item?.sourceId ?? "");
}

export function removeFlowObjectReferencesFromProjectFlows(current: any[], flowId: string | null | undefined, kind: FlowObjectKind, objectIds: string | string[]): any[] {
  const flowIds = flowId
    ? [flowId]
    : current.map((entry) => String(entry?.flow?.flowId ?? "")).filter(Boolean);
  return flowIds.reduce((entries, targetFlowId) => applyFlowObjectReferenceDelete(entries, targetFlowId, kind, objectIds).next, current);
}

export type AutomationStudioLocalFeedReconciliation<TValue> = {
  next: TValue;
  reconciled: boolean;
  reason?: string;
};

export function reconcileProjectFlowsFromChangeFeed(current: any[], event: AutomationStudioProjectChangeEvent): AutomationStudioLocalFeedReconciliation<any[]> {
  if (event.operation !== "delete") return { next: current, reconciled: false, reason: "Only delete feed events include enough information for local Flow reconciliation." };
  const kind = normalizedChangeEntityKind(event.entityKind);
  if (kind === "flow") return { next: removeDeletedFlowsFromProjectFlows(current, [event.entityId]), reconciled: true };
  if (kind === "subflow") return { next: removeSubflowSummaryFromProjectFlowsForFeed(current, event), reconciled: true };
  if (kind === "recording") return { next: removeFlowObjectReferencesFromProjectFlows(current, null, "recording", event.entityId), reconciled: true };
  if (kind === "instruction") return { next: removeFlowObjectReferencesFromProjectFlows(current, event.parentId, "instruction", event.entityId), reconciled: true };
  if (kind === "adaptation") return { next: removeFlowObjectReferencesFromProjectFlows(current, event.parentId, "adaptation", event.entityId), reconciled: true };
  return { next: current, reconciled: false, reason: `${event.entityKind}:delete has no local Flow reconciliation handler.` };
}

export function reconcileCustomHierarchyNodesFromChangeFeed(current: AutomationHierarchyNode[], event: AutomationStudioProjectChangeEvent): AutomationStudioLocalFeedReconciliation<AutomationHierarchyNode[]> {
  if (event.operation !== "delete") return { next: current, reconciled: false };
  const kind = normalizedChangeEntityKind(event.entityKind);
  if (kind !== "folder" && kind !== "hierarchy") return { next: current, reconciled: false };
  if (!current.some((node) => node.id === event.entityId || node.sourceId === event.entityId)) return { next: current, reconciled: true };
  const directNode = current.find((node) => node.sourceId === event.entityId) ?? current.find((node) => node.id === event.entityId);
  return { next: directNode ? applyCustomFolderDelete(current, directNode.id).next : current, reconciled: true };
}

export function reconcileRecordingsFromChangeFeed(current: any[], event: AutomationStudioProjectChangeEvent): AutomationStudioLocalFeedReconciliation<any[]> {
  if (event.operation !== "delete" || normalizedChangeEntityKind(event.entityKind) !== "recording") return { next: current, reconciled: false };
  return { next: deleteRecordingCollectionItems(current, event.entityId).next, reconciled: true };
}

export function reconcileRuntimeSessionsFromChangeFeed(current: any[], event: AutomationStudioProjectChangeEvent): AutomationStudioLocalFeedReconciliation<any[]> {
  if (event.operation !== "delete" || normalizedChangeEntityKind(event.entityKind) !== "runtime") return { next: current, reconciled: false };
  return { next: current.filter((session) => String(session?.runId ?? session?.id ?? "") !== event.entityId), reconciled: true };
}

export function reconcilePipelineArtifactsFromChangeFeed(current: any, event: AutomationStudioProjectChangeEvent): AutomationStudioLocalFeedReconciliation<any> {
  const kind = normalizedChangeEntityKind(event.entityKind);
  if (event.operation !== "delete" || (kind !== "adaptation" && kind !== "proposal")) return { next: current, reconciled: false };
  const deleted = new Set([event.entityId]);
  return { next: removeDeletedRecordingArtifacts(current, new Set(), deleted), reconciled: true };
}

function removeSubflowSummaryFromProjectFlowsForFeed(current: any[], event: AutomationStudioProjectChangeEvent): any[] {
  const parentFlowId = event.parentId ?? event.hierarchyScope?.id ?? null;
  if (parentFlowId) return removeSubflowSummaryFromProjectFlows(current, parentFlowId, [event.entityId]);
  return current.map((entry) => {
    const flowId = String(entry?.flow?.flowId ?? "");
    return flowId ? removeSubflowSummaryFromProjectFlows([entry], flowId, [event.entityId])[0] ?? entry : entry;
  });
}

function normalizedChangeEntityKind(entityKind: string): "flow" | "subflow" | "folder" | "recording" | "instruction" | "adaptation" | "proposal" | "runtime" | "hierarchy" | "other" {
  const kind = entityKind.toLowerCase();
  if (kind.includes("subflow")) return "subflow";
  if (kind.includes("folder") || kind.includes("category")) return "folder";
  if (kind.includes("recording") || kind.includes("timeline")) return "recording";
  if (kind.includes("instruction")) return "instruction";
  if (kind.includes("adaptation")) return "adaptation";
  if (kind.includes("proposal")) return "proposal";
  if (kind.includes("runtime") || kind.includes("run") || kind.includes("action")) return "runtime";
  if (kind.includes("hierarchy")) return "hierarchy";
  if (kind.includes("flow") || kind.includes("graph")) return "flow";
  return "other";
}

export function flowDocumentWithoutFlowObjectReferences(flow: any, kind: FlowObjectKind, objectIds: string | string[]): any {
  if (!flow?.flowId) return flow;
  const [entry] = applyFlowObjectReferenceDelete([{ source: "canonical", readOnly: false, flow }], flow.flowId, kind, objectIds).next;
  return entry?.flow ?? flow;
}

export function flowDocumentWithoutSubflowCategory(flow: any, categoryId: string): any {
  if (!flow?.flowId) return flow;
  const [entry] = applySubflowCategoryDelete([{ source: "canonical", readOnly: false, flow }], flow.flowId, categoryId).next;
  return entry?.flow ?? flow;
}
