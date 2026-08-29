import { describe, expect, it, vi } from "vitest";
import { AutomationStudioProjectDataAccess } from "../cache/project-data-access";
import { createAutomationStudioStores } from "../stores/studio-stores";
import { applyAutomationProjectInvalidations } from "./project-invalidation";
import { automationStudioInvalidationsFromChangePage } from "./project-sync";

describe("project invalidation application", () => {
  it("publishes only the affected normalized selector and keeps unrelated cached detail", async () => {
    const stores = createAutomationStudioStores();
    stores.projectData.activate("project.a");
    stores.projectData.replaceAll("flows", [["flow.delete", { flow: { flowId: "flow.delete" } }]]);
    stores.projectData.replaceAll("recordings", [["recording.keep", { recordingId: "recording.keep" }]]);
    const flowListener = vi.fn();
    const recordingListener = vi.fn();
    stores.projectData.subscribe(flowListener, "entities:flows");
    stores.projectData.subscribe(recordingListener, "entities:recordings");
    const data = new AutomationStudioProjectDataAccess();
    data.open("project.a");
    data.remember("project.a", "recording", "recording.keep", { detail: true });
    const hierarchy = [{ id: "folder.keep", kind: "folder", name: "Keep", parentId: null }] as any[];

    applyAutomationProjectInvalidations({
      projectId: "project.a",
      invalidations: automationStudioInvalidationsFromChangePage("project.a", {
        cursor: 1,
        hasMore: false,
        events: [{
          projectId: "project.a",
          sequence: 1,
          transactionId: "tx.1",
          entityKind: "flow",
          entityId: "flow.delete",
          operation: "delete",
          revision: 2,
          changedAt: 10
        }]
      }),
      data,
      stores,
      hierarchy: { getNodes: () => hierarchy, replaceNodes: vi.fn() }
    });

    expect(stores.projectData.getState().entities.flows.has("flow.delete")).toBe(false);
    expect(flowListener).toHaveBeenCalledOnce();
    expect(recordingListener).not.toHaveBeenCalled();
    const recordingLoad = vi.fn();
    await expect(data.readThrough({ projectId: "project.a", scope: "recording", resourceId: "recording.keep", load: recordingLoad })).resolves.toEqual({ detail: true });
    expect(recordingLoad).not.toHaveBeenCalled();
  });

  it("ignores notifications for a non-active project", () => {
    const stores = createAutomationStudioStores();
    stores.projectData.activate("project.b");
    const data = new AutomationStudioProjectDataAccess();
    data.open("project.b");
    const listener = vi.fn();
    stores.projectData.subscribe(listener, "entities:flows");
    applyAutomationProjectInvalidations({
      projectId: "project.a",
      invalidations: automationStudioInvalidationsFromChangePage("project.a", {
        cursor: 1,
        hasMore: false,
        events: [{
          projectId: "project.a", sequence: 1, transactionId: "tx.foreign", entityKind: "flow",
          entityId: "flow.foreign", operation: "delete", revision: 1, changedAt: 10
        }]
      }),
      data,
      stores,
      hierarchy: { getNodes: () => [], replaceNodes: vi.fn() }
    });
    expect(listener).not.toHaveBeenCalled();
  });
});