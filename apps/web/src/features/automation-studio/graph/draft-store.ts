export const AUTOMATION_GRAPH_DRAFT_PREFIX = "fluxiq:automation-graph-draft:";

export type AutomationGraphDraftRecord<TGraph = { nodes: any[]; edges: any[] }> = {
  projectId: string;
  flowId: string;
  baseUpdatedAt: number;
  savedAt: number;
  graph: TGraph;
};

type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function automationGraphDraftKey(projectId: string, flowId: string): string {
  return AUTOMATION_GRAPH_DRAFT_PREFIX + encodeURIComponent(projectId) + ":" + encodeURIComponent(flowId);
}

export function loadAutomationGraphDraft<TGraph>(projectId: string, flowId: string, storage: DraftStorage | null = browserDraftStorage()): AutomationGraphDraftRecord<TGraph> | null {
  if (!storage) return null;
  try {
    const value = JSON.parse(storage.getItem(automationGraphDraftKey(projectId, flowId)) ?? "null");
    if (!value || value.projectId !== projectId || value.flowId !== flowId || !value.graph || !Array.isArray(value.graph.nodes) || !Array.isArray(value.graph.edges)) return null;
    return value as AutomationGraphDraftRecord<TGraph>;
  } catch {
    return null;
  }
}

export function saveAutomationGraphDraft<TGraph>(record: AutomationGraphDraftRecord<TGraph>, storage: DraftStorage | null = browserDraftStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(automationGraphDraftKey(record.projectId, record.flowId), JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

export function removeAutomationGraphDraft(projectId: string, flowId: string, storage: DraftStorage | null = browserDraftStorage()): void {
  try {
    storage?.removeItem(automationGraphDraftKey(projectId, flowId));
  } catch {
    // Draft cleanup is best effort; canonical Flow data is unaffected.
  }
}

function browserDraftStorage(): Storage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}