import { recordAutomationStudioDraftWrite } from "../../programs/ui-performance";

export const AUTOMATION_GRAPH_DRAFT_PREFIX = "fluxiq:automation-graph-draft:";
export const AUTOMATION_GRAPH_OPERATION_DRAFT_STORE = "automationGraphOperationDrafts";
export const AUTOMATION_GRAPH_DRAFT_MAX_LOCAL_STORAGE_CHARS = 1_000_000;

export type AutomationGraphDraftRecord<TGraph = { nodes: any[]; edges: any[] }> = {
  projectId: string;
  flowId: string;
  baseUpdatedAt: number;
  savedAt: number;
  graph: TGraph;
};

export type AutomationGraphOperationDraftRecord<TOperation = unknown> = {
  projectId: string;
  flowId: string;
  baseRevision: string;
  baseUpdatedAt: number;
  savedAt: number;
  operations: TOperation[];
  estimatedBytes: number;
};

type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type AutomationGraphDraftDatabase = {
  get(key: string): Promise<AutomationGraphOperationDraftRecord | null>;
  put(key: string, record: AutomationGraphOperationDraftRecord): Promise<void>;
  delete(key: string): Promise<void>;
};

export function automationGraphDraftKey(projectId: string, flowId: string): string {
  return AUTOMATION_GRAPH_DRAFT_PREFIX + encodeURIComponent(projectId) + ":" + encodeURIComponent(flowId);
}

export function automationGraphDraftIdentity(graph: any): string {
  if (!graph) return "";
  const id = String(graph.flowId ?? graph.graphId ?? graph.taskId ?? "");
  if (!id) return "";
  const revision = graph.graphRevision ?? graph.revision ?? graph.metadata?.graphRevision ?? graph.updatedAt ?? graph.createdAt ?? graph.metadata?.savedAt ?? "draft";
  const pendingOperationCount = graph.metadata?.pendingOperationCount ?? graph.operations?.length ?? 0;
  const pendingOperationBytes = graph.metadata?.pendingOperationBytes ?? 0;
  const legacyCounts = `${Array.isArray(graph.nodes) ? graph.nodes.length : 0}:${Array.isArray(graph.edges) ? graph.edges.length : 0}`;
  return [id, revision, pendingOperationCount, pendingOperationBytes, legacyCounts].join(":");
}

export function loadAutomationGraphDraft<TGraph>(projectId: string, flowId: string, storage: DraftStorage | null = browserDraftStorage()): AutomationGraphDraftRecord<TGraph> | null {
  if (!storage) return null;
  const key = automationGraphDraftKey(projectId, flowId);
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    if (raw.length > AUTOMATION_GRAPH_DRAFT_MAX_LOCAL_STORAGE_CHARS) {
      storage.removeItem(key);
      return null;
    }
    const value = JSON.parse(raw);
    if (!value || value.projectId !== projectId || value.flowId !== flowId || !value.graph || !Array.isArray(value.graph.nodes) || !Array.isArray(value.graph.edges)) return null;
    return value as AutomationGraphDraftRecord<TGraph>;
  } catch {
    storage.removeItem(key);
    return null;
  }
}

export function saveAutomationGraphDraft<TGraph>(record: AutomationGraphDraftRecord<TGraph>, storage: DraftStorage | null = browserDraftStorage()): boolean {
  if (!storage) return false;
  try {
    const raw = JSON.stringify(record);
    if (raw.length > AUTOMATION_GRAPH_DRAFT_MAX_LOCAL_STORAGE_CHARS) return false;
    storage.setItem(automationGraphDraftKey(record.projectId, record.flowId), raw);
    recordAutomationStudioDraftWrite("graph-draft", { projectId: record.projectId, flowId: record.flowId, storage: "localStorage" });
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

export function automationGraphOperationDraftKey(projectId: string, flowId: string): string {
  return "operation:" + encodeURIComponent(projectId) + ":" + encodeURIComponent(flowId);
}

export async function loadAutomationGraphOperationDraft<TOperation = unknown>(projectId: string, flowId: string, database: AutomationGraphDraftDatabase | null = browserIndexedDbDraftDatabase()): Promise<AutomationGraphOperationDraftRecord<TOperation> | null> {
  if (!database) return null;
  const value = await database.get(automationGraphOperationDraftKey(projectId, flowId));
  if (!isAutomationGraphOperationDraftRecord(value, projectId, flowId)) return null;
  return value as AutomationGraphOperationDraftRecord<TOperation>;
}

export async function saveAutomationGraphOperationDraft<TOperation = unknown>(record: AutomationGraphOperationDraftRecord<TOperation>, database: AutomationGraphDraftDatabase | null = browserIndexedDbDraftDatabase()): Promise<boolean> {
  if (!database) return false;
  try {
    const normalized: AutomationGraphOperationDraftRecord = {
      projectId: record.projectId,
      flowId: record.flowId,
      baseRevision: record.baseRevision,
      baseUpdatedAt: record.baseUpdatedAt,
      savedAt: record.savedAt,
      operations: [...record.operations],
      estimatedBytes: record.estimatedBytes,
    };
    await database.put(automationGraphOperationDraftKey(record.projectId, record.flowId), normalized);
    recordAutomationStudioDraftWrite("operation-draft", { projectId: record.projectId, flowId: record.flowId, storage: "indexedDB", operations: normalized.operations.length, estimatedBytes: normalized.estimatedBytes });
    return true;
  } catch {
    return false;
  }
}

export async function removeAutomationGraphOperationDraft(projectId: string, flowId: string, database: AutomationGraphDraftDatabase | null = browserIndexedDbDraftDatabase()): Promise<void> {
  await database?.delete(automationGraphOperationDraftKey(projectId, flowId)).catch(() => undefined);
}

export function createMemoryAutomationGraphDraftDatabase(): AutomationGraphDraftDatabase {
  const records = new Map<string, AutomationGraphOperationDraftRecord>();
  return {
    async get(key) {
      return records.get(key) ?? null;
    },
    async put(key, record) {
      records.set(key, structuredCloneIfAvailable(record));
    },
    async delete(key) {
      records.delete(key);
    },
  };
}

export function browserIndexedDbDraftDatabase(): AutomationGraphDraftDatabase | null {
  if (typeof indexedDB === "undefined") return null;
  browserIndexedDbDraftDatabaseInstance ??= new IndexedDbAutomationGraphDraftDatabase();
  return browserIndexedDbDraftDatabaseInstance;
}

let browserIndexedDbDraftDatabaseInstance: AutomationGraphDraftDatabase | null = null;

function isAutomationGraphOperationDraftRecord(value: unknown, projectId: string, flowId: string): value is AutomationGraphOperationDraftRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Partial<AutomationGraphOperationDraftRecord>;
  return record.projectId === projectId
    && record.flowId === flowId
    && typeof record.baseRevision === "string"
    && typeof record.baseUpdatedAt === "number"
    && Number.isFinite(record.baseUpdatedAt)
    && typeof record.savedAt === "number"
    && Number.isFinite(record.savedAt)
    && Array.isArray(record.operations)
    && typeof record.estimatedBytes === "number"
    && Number.isFinite(record.estimatedBytes);
}

class IndexedDbAutomationGraphDraftDatabase implements AutomationGraphDraftDatabase {
  private openPromise: Promise<IDBDatabase> | null = null;

  async get(key: string): Promise<AutomationGraphOperationDraftRecord | null> {
    const database = await this.open();
    return await indexedDbRequest<AutomationGraphOperationDraftRecord | undefined>(database.transaction(AUTOMATION_GRAPH_OPERATION_DRAFT_STORE, "readonly").objectStore(AUTOMATION_GRAPH_OPERATION_DRAFT_STORE).get(key)).then((value) => value ?? null);
  }

  async put(key: string, record: AutomationGraphOperationDraftRecord): Promise<void> {
    const database = await this.open();
    await indexedDbRequest(database.transaction(AUTOMATION_GRAPH_OPERATION_DRAFT_STORE, "readwrite").objectStore(AUTOMATION_GRAPH_OPERATION_DRAFT_STORE).put({ ...record, key }));
  }

  async delete(key: string): Promise<void> {
    const database = await this.open();
    await indexedDbRequest(database.transaction(AUTOMATION_GRAPH_OPERATION_DRAFT_STORE, "readwrite").objectStore(AUTOMATION_GRAPH_OPERATION_DRAFT_STORE).delete(key));
  }

  private open(): Promise<IDBDatabase> {
    this.openPromise ??= new Promise((resolve, reject) => {
      const request = indexedDB.open("fluxiq-automation-studio-graph-drafts", 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(AUTOMATION_GRAPH_OPERATION_DRAFT_STORE)) database.createObjectStore(AUTOMATION_GRAPH_OPERATION_DRAFT_STORE, { keyPath: "key" });
      };
      request.onerror = () => reject(request.error ?? new Error("Could not open Automation Studio graph draft database."));
      request.onsuccess = () => resolve(request.result);
    });
    return this.openPromise;
  }
}

function indexedDbRequest<T = unknown>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
    request.onsuccess = () => resolve(request.result);
  });
}

function structuredCloneIfAvailable<T>(value: T): T {
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value)) as T;
}
