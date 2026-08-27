import { describe, expect, it } from "vitest";
import { automationGraphDraftKey, loadAutomationGraphDraft, removeAutomationGraphDraft, saveAutomationGraphDraft } from "./draft-store";

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
});