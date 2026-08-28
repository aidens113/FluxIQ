import { describe, expect, it } from "vitest";
import {
  applyCustomFolderCreate,
  applyCustomFolderDelete,
  applyCustomFolderMove,
  applyCustomFolderRename,
  applyFlowCreate,
  applyFlowDelete,
  applyFlowObjectReferenceDelete,
  applyFlowObjectReferenceUpsert,
  applyFlowRename,
  applySubflowCategoryCreate,
  applySubflowCategoryDelete,
  applySubflowCategoryMove,
  applySubflowCategoryRename,
  applySubflowReferenceDelete,
  applySubflowReferenceUpsert,
  deleteObjectCollectionItems,
  deleteRecordingCollectionItems,
  upsertObjectCollection,
  upsertRecordingCollection,
  type AutomationStudioFlowEntry
} from "./local-mutations";

describe("Automation Studio local mutation reducers", () => {
  it("upserts created flows and restores the previous catalog", () => {
    const current = [flowEntry("flow.one", "One")];
    const mutation = applyFlowCreate(current, { flowId: "flow.two", name: "Two" });

    expect(mutation.next.map((entry) => entry.flow.flowId)).toEqual(["flow.two", "flow.one"]);
    expect(firstFlow(mutation.next)).toMatchObject({ source: "canonical", readOnly: false, flow: { name: "Two" } });
    expect(mutation.restore()).toBe(current);
  });

  it("replaces an existing flow entry when create receives the final saved flow", () => {
    const current = [flowEntry("flow.one", "Draft", { metadata: { summaryOnly: true } })];
    const mutation = applyFlowCreate(current, flowEntry("flow.one", "Saved", { nodes: [{ id: "start" }], metadata: { preset: "blank" } }));

    expect(mutation.next).toHaveLength(1);
    expect(firstFlow(mutation.next).flow).toMatchObject({ flowId: "flow.one", name: "Saved", nodes: [{ id: "start" }], metadata: { preset: "blank" } });
  });

  it("renames flows without touching unrelated entries", () => {
    const current = [flowEntry("flow.one", "One"), flowEntry("flow.two", "Two")];
    const mutation = applyFlowRename(current, "flow.two", "Renamed", { description: "Updated", updatedAt: 123 });

    expect(mutation.next.at(0)?.flow.name).toBe("One");
    expect(mutation.next.at(1)?.flow).toMatchObject({ name: "Renamed", description: "Updated", updatedAt: 123 });
  });

  it("deletes flows and their subflow graph entries", () => {
    const current = [
      flowEntry("flow.parent", "Parent"),
      flowEntry("flow.parent.sub.graph", "Child", { metadata: { subflowGraph: true, parentFlowId: "flow.parent", parentSubflowId: "sub.one" } }),
      flowEntry("flow.other", "Other")
    ];
    const mutation = applyFlowDelete(current, "flow.parent");

    expect(mutation.next.map((entry) => entry.flow.flowId)).toEqual(["flow.other"]);
  });

  it("creates, renames, moves, deletes, and restores custom folders", () => {
    const current: any[] = [{ id: "folder.parent", label: "Parent", kind: "folder", category: "flow", parentId: null }];
    const created = applyCustomFolderCreate(current, { id: "folder.child", label: "Child", kind: "folder", category: "flow", parentId: "folder.parent" });
    const renamed = applyCustomFolderRename(created.next, "folder.child", "Renamed");
    const moved = applyCustomFolderMove(renamed.next, "folder.child", null);
    const deleted = applyCustomFolderDelete([...moved.next, { id: "folder.grandchild", label: "Grandchild", kind: "folder", category: "flow", parentId: "folder.child" }], "folder.child");

    expect(created.next).toHaveLength(2);
    expect(renamed.next.find((node) => node.id === "folder.child")?.label).toBe("Renamed");
    expect(moved.next.find((node) => node.id === "folder.child")?.parentId).toBeNull();
    expect(deleted.next.map((node) => node.id)).toEqual(["folder.parent"]);
    expect(deleted.restore()).toHaveLength(3);
  });

  it("creates, renames, moves, deletes, and restores subflow categories on the owning flow", () => {
    const current = [flowEntry("flow.parent", "Parent", {
      expansion: { subflowIds: [{ subflowId: "sub.one", metadata: { subflowCategoryId: "cat.child" } }] },
      metadata: { subflowCategories: [{ id: "cat.parent", name: "Parent", parentId: null }, { id: "cat.child", name: "Child", parentId: "cat.parent" }] }
    })];

    const created = applySubflowCategoryCreate(current, "flow.parent", { id: "cat.new", name: "New", parentId: null });
    const renamed = applySubflowCategoryRename(created.next, "flow.parent", "cat.new", "Renamed", 123);
    const moved = applySubflowCategoryMove(renamed.next, "flow.parent", "cat.new", "cat.parent", 124);
    const deleted = applySubflowCategoryDelete(moved.next, "flow.parent", "cat.parent");

    expect(categories(created.next)).toEqual(expect.arrayContaining([expect.objectContaining({ id: "cat.new", name: "New" })]));
    expect(categories(renamed.next).find((category: any) => category.id === "cat.new")).toMatchObject({ name: "Renamed", updatedAt: 123 });
    expect(categories(moved.next).find((category: any) => category.id === "cat.new")).toMatchObject({ parentId: "cat.parent", updatedAt: 124 });
    expect(categories(deleted.next)).toEqual([]);
    expect(firstFlow(deleted.next).flow.expansion.subflowIds[0]).toEqual({ subflowId: "sub.one" });
    expect(deleted.restore()).toBe(moved.next);
  });

  it("upserts and deletes recording collection items", () => {
    const current = [{ recordingId: "recording.one", name: "Old" }];
    const upserted = upsertRecordingCollection(current, { recordingId: "recording.one", name: "New" });
    const created = upsertRecordingCollection(upserted.next, { recordingId: "recording.two", name: "Two" });
    const deleted = deleteRecordingCollectionItems(created.next, "recording.one");

    expect(upserted.next).toEqual([{ recordingId: "recording.one", name: "New" }]);
    expect(created.next.map((item) => item.recordingId)).toEqual(["recording.two", "recording.one"]);
    expect(deleted.next).toEqual([{ recordingId: "recording.two", name: "Two" }]);
  });

  it("upserts and deletes instruction/adaptation detail collections with caller-owned ids", () => {
    const current = [{ instructionId: "instruction.one", title: "Old" }];
    const upserted = upsertObjectCollection(current, { instructionId: "instruction.two", title: "Two" }, (item) => item.instructionId);
    const deleted = deleteObjectCollectionItems(upserted.next, ["instruction.one"], (item) => item.instructionId);

    expect(upserted.next.map((item) => item.instructionId)).toEqual(["instruction.two", "instruction.one"]);
    expect(deleted.next).toEqual([{ instructionId: "instruction.two", title: "Two" }]);
    expect(deleted.restore()).toBe(upserted.next);
  });

  it("upserts and deletes flow object references used by the sidebar", () => {
    const current = [flowEntry("flow.parent", "Parent", { expansion: { instructionIds: ["instruction.one"], adaptationIds: ["adaptation.one"] } })];
    const instruction = applyFlowObjectReferenceUpsert(current, "flow.parent", "instruction", { instructionId: "instruction.two" });
    const adaptation = applyFlowObjectReferenceUpsert(instruction.next, "flow.parent", "adaptation", { adaptationId: "adaptation.two" });
    const recording = applyFlowObjectReferenceUpsert(adaptation.next, "flow.parent", "recording", { recordingId: "recording.one" });
    const runtimeObject = applyFlowObjectReferenceUpsert(recording.next, "flow.parent", "runtime-object", { runtimeObjectId: "runtime.one" });
    const deleted = applyFlowObjectReferenceDelete(runtimeObject.next, "flow.parent", "instruction", "instruction.one");

    expect(firstFlow(deleted.next).flow.expansion).toMatchObject({
      instructionIds: ["instruction.two"],
      adaptationIds: ["adaptation.two", "adaptation.one"],
      recordingIds: ["recording.one"],
      runtimeObjectIds: ["runtime.one"]
    });
  });

  it("upserts and deletes subflow references with display metadata", () => {
    const current = [flowEntry("flow.parent", "Parent")];
    const upserted = applySubflowReferenceUpsert(current, "flow.parent", { subflowId: "sub.one", role: "utility" }, { name: "Collect Data", parentCategoryId: "cat.one" });
    const renamed = applySubflowReferenceUpsert(upserted.next, "flow.parent", "sub.one", { name: "Collect Fresh Data" });
    const deleted = applySubflowReferenceDelete(renamed.next, "flow.parent", "sub.one");

    expect(firstFlow(upserted.next).flow.expansion.subflowIds).toEqual([{ subflowId: "sub.one", role: "utility", name: "Collect Data", metadata: { subflowCategoryId: "cat.one" } }]);
    expect(firstFlow(renamed.next).flow.expansion.subflowIds).toEqual([{ subflowId: "sub.one", name: "Collect Fresh Data" }]);
    expect(firstFlow(deleted.next).flow.expansion.subflowIds).toEqual([]);
  });
});

function flowEntry(flowId: string, name: string, overrides: Record<string, any> = {}): AutomationStudioFlowEntry {
  return {
    source: "canonical",
    readOnly: false,
    flow: {
      flowId,
      name,
      nodes: [],
      edges: [],
      expansion: {},
      metadata: {},
      ...overrides
    }
  };
}

function categories(entries: AutomationStudioFlowEntry[]) {
  return firstFlow(entries).flow.metadata.subflowCategories;
}

function firstFlow(entries: AutomationStudioFlowEntry[]): AutomationStudioFlowEntry {
  const entry = entries[0];
  if (!entry) throw new Error("Expected a flow entry");
  return entry;
}
