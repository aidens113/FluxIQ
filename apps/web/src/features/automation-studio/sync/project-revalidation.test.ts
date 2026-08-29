import { describe, expect, it, vi } from "vitest";
import { AutomationStudioProjectDataAccess } from "../cache/project-data-access";
import { createAutomationStudioStores } from "../stores/studio-stores";
import { AutomationProjectRevalidator } from "./project-revalidation";
import { automationStudioInvalidationsFromChangePage, type AutomationStudioProjectChangeOperation } from "./project-sync";

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((done) => { resolve = done; });
  return { promise, resolve };
}

function invalidation(operation: AutomationStudioProjectChangeOperation = "update") {
  return automationStudioInvalidationsFromChangePage("project.a", {
    cursor: 1,
    hasMore: false,
    events: [{
      projectId: "project.a",
      sequence: 1,
      transactionId: "tx.1",
      entityKind: "flow",
      entityId: "flow.1",
      operation,
      revision: 2,
      changedAt: 20,
      hierarchyScope: { kind: "project", id: "project.a" }
    }]
  });
}

function setup(post: ReturnType<typeof vi.fn>) {
  const data = new AutomationStudioProjectDataAccess();
  data.open("project.a");
  const stores = createAutomationStudioStores();
  stores.projectData.activate("project.a");
  const hierarchy = { replace: vi.fn() };
  return {
    data,
    stores,
    hierarchy,
    revalidator: new AutomationProjectRevalidator({ api: { post } as any, data, stores, hierarchy })
  };
}

describe("AutomationProjectRevalidator", () => {
  it.each(["create", "update", "touch"] as const)("revalidates a %s event and notifies only its normalized selector", async (operation) => {
    const post = vi.fn().mockResolvedValue({ ok: true, payload: { flow: { flowId: "flow.1", name: "Remote" } } });
    const { revalidator, stores } = setup(post);
    stores.projectData.replaceAll("flows", [["flow.1", { source: "canonical", flow: { flowId: "flow.1", name: "Old" } }]]);
    stores.projectData.replaceAll("recordings", [["recording.1", { recordingId: "recording.1" }]]);
    const flowListener = vi.fn();
    const recordingListener = vi.fn();
    stores.projectData.subscribe(flowListener, "entities:flows");
    stores.projectData.subscribe(recordingListener, "entities:recordings");

    await revalidator.revalidate("project.a", invalidation(operation));

    expect(post).toHaveBeenCalledWith("get-flow", { projectId: "project.a", flowId: "flow.1" }, { signal: expect.any(AbortSignal) });
    expect((stores.projectData.getState().entities.flows.get("flow.1") as any).flow.name).toBe("Remote");
    expect(flowListener).toHaveBeenCalledOnce();
    expect(recordingListener).not.toHaveBeenCalled();
  });

  it("deduplicates concurrent revalidation for the same entity", async () => {
    const pending = deferred<any>();
    const post = vi.fn(() => pending.promise);
    const { revalidator } = setup(post);
    const first = revalidator.revalidate("project.a", invalidation("create"));
    const second = revalidator.revalidate("project.a", invalidation("touch"));
    expect(post).toHaveBeenCalledOnce();
    pending.resolve({ ok: true, payload: { flow: { flowId: "flow.1" } } });
    await Promise.all([first, second]);
  });

  it("does not overwrite optimistic data when a mutation wins the request race", async () => {
    const pending = deferred<any>();
    const post = vi.fn(() => pending.promise);
    const { data, revalidator, stores } = setup(post);
    stores.projectData.upsert("flows", "flow.1", { source: "canonical", flow: { flowId: "flow.1", name: "Optimistic" } });
    const revalidation = revalidator.revalidate("project.a", invalidation());
    data.invalidate("project.a", ["flow"], ["flow.1"]);
    pending.resolve({ ok: true, payload: { flow: { flowId: "flow.1", name: "Stale remote" } } });
    await revalidation;
    expect((stores.projectData.getState().entities.flows.get("flow.1") as any).flow.name).toBe("Optimistic");
  });

  it("does not publish an old project result after switching projects", async () => {
    const pending = deferred<any>();
    const post = vi.fn(() => pending.promise);
    const { data, revalidator, stores } = setup(post);
    const revalidation = revalidator.revalidate("project.a", invalidation());
    data.open("project.b");
    stores.projectData.activate("project.b");
    pending.resolve({ ok: true, payload: { flow: { flowId: "flow.1", name: "Old project" } } });
    await revalidation;
    expect(stores.projectData.getState().entities.flows.has("flow.1")).toBe(false);
  });

  it("does not refetch locally reconciled deletes", async () => {
    const post = vi.fn();
    const { revalidator } = setup(post);
    await revalidator.revalidate("project.a", invalidation("delete"));
    expect(post).not.toHaveBeenCalled();
  });
});