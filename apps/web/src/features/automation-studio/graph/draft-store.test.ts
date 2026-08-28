import { describe, expect, it } from "vitest";
import { automationGraphDraftIdentity, automationGraphDraftKey, automationGraphOperationDraftKey, browserIndexedDbDraftDatabase, createMemoryAutomationGraphDraftDatabase, loadAutomationGraphDraft, loadAutomationGraphOperationDraft, removeAutomationGraphDraft, removeAutomationGraphOperationDraft, saveAutomationGraphDraft, saveAutomationGraphOperationDraft } from "./draft-store";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); }
  };
}

describe("Automation graph draft store", () => {
  it("isolates drafts by project and Flow and restores graph metadata", () => {
    const storage = memoryStorage();
    const record = { projectId: "project one", flowId: "flow/checkout", baseUpdatedAt: 10, savedAt: 20, graph: { nodes: [{ id: "start" }], edges: [] } };
    expect(saveAutomationGraphDraft(record, storage)).toBe(true);
    expect(automationGraphDraftKey(record.projectId, record.flowId)).toContain("project%20one:flow%2Fcheckout");
    expect(loadAutomationGraphDraft(record.projectId, record.flowId, storage)).toEqual(record);
    expect(loadAutomationGraphDraft("project.two", record.flowId, storage)).toBeNull();
    removeAutomationGraphDraft(record.projectId, record.flowId, storage);
    expect(loadAutomationGraphDraft(record.projectId, record.flowId, storage)).toBeNull();
  });

  it("ignores malformed or incomplete persisted values", () => {
    const storage = memoryStorage();
    storage.setItem(automationGraphDraftKey("project", "flow"), "{bad json");
    expect(loadAutomationGraphDraft("project", "flow", storage)).toBeNull();
    storage.setItem(automationGraphDraftKey("project", "flow"), JSON.stringify({ projectId: "project", flowId: "flow", graph: {} }));
    expect(loadAutomationGraphDraft("project", "flow", storage)).toBeNull();
  });

  it("builds draft identity from revision metadata instead of serializing full graph bodies", () => {
    const graph = {
      flowId: "flow.large",
      graphRevision: 99,
      nodes: [{ id: "a", parameterValues: { bulky: "ignored".repeat(1000) } }],
      edges: [{ id: "edge", metadata: { bulky: "ignored".repeat(1000) } }],
    };

    const identity = automationGraphDraftIdentity(graph);
    expect(identity).toContain("flow.large:99");
    expect(identity).toContain("1:1");
    expect(identity).not.toContain("ignored");
  });

  it("persists operation drafts through the IndexedDB database contract", async () => {
    const database = createMemoryAutomationGraphDraftDatabase();
    const record = {
      projectId: "project one",
      flowId: "flow/checkout",
      baseRevision: "42",
      baseUpdatedAt: 10,
      savedAt: 20,
      operations: [{ kind: "node.update", entityId: "start" }],
      estimatedBytes: 128,
    };

    expect(automationGraphOperationDraftKey(record.projectId, record.flowId)).toContain("project%20one:flow%2Fcheckout");
    await expect(saveAutomationGraphOperationDraft(record, database)).resolves.toBe(true);
    await expect(loadAutomationGraphOperationDraft(record.projectId, record.flowId, database)).resolves.toEqual(record);
    await removeAutomationGraphOperationDraft(record.projectId, record.flowId, database);
    await expect(loadAutomationGraphOperationDraft(record.projectId, record.flowId, database)).resolves.toBeNull();
  });

  it("reuses the browser IndexedDB draft database wrapper", () => {
    const originalIndexedDb = globalThis.indexedDB;
    try {
      Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: {} });
      expect(browserIndexedDbDraftDatabase()).toBe(browserIndexedDbDraftDatabase());
    } finally {
      Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: originalIndexedDb });
    }
  });

  it("ignores malformed operation draft records", async () => {
    const database = createMemoryAutomationGraphDraftDatabase();
    await database.put(automationGraphOperationDraftKey("project", "flow"), { projectId: "project", flowId: "flow", baseRevision: "1", baseUpdatedAt: 1, savedAt: 2, operations: [], estimatedBytes: 0 });
    await expect(loadAutomationGraphOperationDraft("project", "missing", database)).resolves.toBeNull();
    await database.put(automationGraphOperationDraftKey("project", "flow"), { projectId: "project", flowId: "flow", baseRevision: "1", baseUpdatedAt: 1, savedAt: Number.NaN, operations: [], estimatedBytes: 0 });
    await expect(loadAutomationGraphOperationDraft("project", "flow", database)).resolves.toBeNull();
  });
});
