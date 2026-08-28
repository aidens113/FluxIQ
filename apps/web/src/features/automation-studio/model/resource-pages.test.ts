import { describe, expect, it } from "vitest";
import { AutomationStudioResourcePageStore, automationStudioResourcePageKey } from "./resource-pages";

describe("AutomationStudioResourcePageStore", () => {
  it("stores paged list views and applies mutation deltas without project-wide invalidation", () => {
    const store = new AutomationStudioResourcePageStore<{ id: string; title: string }>((item) => item.id);
    const key = automationStudioResourcePageKey({ projectId: "project.1", flowId: "flow.1", resource: "instructions", status: "active" });
    store.setPage(key, { items: [{ id: "instruction.1", title: "One" }, { id: "instruction.2", title: "Two" }], nextCursor: "cursor.2", hasMore: true });
    store.applyDelta({ operation: "upsert", item: { id: "instruction.3", title: "Three" } });
    store.applyDelta({ operation: "delete", id: "instruction.1" });
    expect(store.getPage(key)).toEqual({ items: [{ id: "instruction.3", title: "Three" }, { id: "instruction.2", title: "Two" }], nextCursor: "cursor.2", hasMore: true });
  });

  it("creates stable query keys independent of property order", () => {
    expect(automationStudioResourcePageKey({ flowId: "flow.1", projectId: "project.1", cursor: null })).toBe(automationStudioResourcePageKey({ cursor: null, projectId: "project.1", flowId: "flow.1" }));
  });
});
