import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AutomationStudioService } from "../../../service.ts";

let tempRoot: string;

const services = new Set<AutomationStudioService>();

function createService(...args: ConstructorParameters<typeof AutomationStudioService>): AutomationStudioService {
  const service = new AutomationStudioService(...args);
  services.add(service);
  return service;
}

describe("AutomationStudioService canonical Flow persistence", () => {
  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-automation-studio-service-"));
  });

  afterEach(async () => {
    await Promise.all([...services].map((service) => service.close()));
    services.clear();
    await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
  });

  it("emits scoped project change-feed rows for Flow create, update, and delete", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Flow Feed Project" });
    const created = await service.createFlow({ projectId: project.id, flowId: "flow.feed", name: "Feed Flow" });
    const saved = await service.saveFlow({ projectId: project.id, flow: { ...created, name: "Updated Feed Flow" } });
    await service.deleteFlow({ projectId: project.id, flowId: saved.flowId });

    const feed = await service.listProjectChangeFeed({ projectId: project.id, afterSequence: 0, limit: 10 });
    expect(feed).toMatchObject({ fallback: false, hasMore: false });
    expect(feed.events.map((event) => ({
      projectId: event.projectId,
      entityKind: event.entityKind,
      entityId: event.entityId,
      operation: event.operation
    }))).toEqual([
      { projectId: project.id, entityKind: "flow", entityId: "flow.feed", operation: "create" },
      { projectId: project.id, entityKind: "flow", entityId: "flow.feed", operation: "update" },
      { projectId: project.id, entityKind: "flow", entityId: "flow.feed", operation: "delete" }
    ]);
    expect(feed.events.every((event) => event.revision >= 1 && event.changedAt > 0 && event.transactionId.startsWith(`project-change.${event.operation}.`))).toBe(true);
  });

  it("emits scoped project change-feed rows for subflow create, update, and delete", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Subflow Feed Project" });
    const flow = await service.createFlow({ projectId: project.id, flowId: "flow.subflow-feed", name: "Parent Flow" });
    const created = await service.createFlowSubflow({ projectId: project.id, flowId: flow.flowId, name: "Verify Payment" });
    const updated = await service.updateFlowSubflow({ projectId: project.id, flowId: flow.flowId, subflowId: created.subflowId, name: "Verify Payment Method" });
    await service.deleteFlowSubflow({ projectId: project.id, flowId: flow.flowId, subflowId: updated.subflowId });

    const feed = await service.listProjectChangeFeed({ projectId: project.id, afterSequence: 0, limit: 20 });
    const subflowEvents = feed.events.filter((event) => event.entityKind === "subflow");
    expect(subflowEvents.map((event) => ({
      projectId: event.projectId,
      entityId: event.entityId,
      operation: event.operation
    }))).toEqual([
      { projectId: project.id, entityId: created.subflowId, operation: "create" },
      { projectId: project.id, entityId: created.subflowId, operation: "update" },
      { projectId: project.id, entityId: created.subflowId, operation: "delete" }
    ]);
    expect(subflowEvents.every((event) => event.revision >= 1 && event.changedAt > 0 && event.transactionId.startsWith(`project-change.${event.operation}.`))).toBe(true);
  });

  it("emits project hierarchy change-feed rows for legacy hierarchy saves", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Hierarchy Feed Project" });

    await service.saveProjectHierarchy(project.id, {
      customHierarchyNodes: [{ id: "folder.root", label: "Root", kind: "folder", category: "flow", parentId: null, sourceId: "folder.root" }],
      deletedHierarchyIds: [],
      workspacePrefs: {}
    });
    await service.saveProjectHierarchy(project.id, {
      customHierarchyNodes: [{ id: "folder.root", label: "Root Renamed", kind: "folder", category: "flow", parentId: null, sourceId: "folder.root" }],
      deletedHierarchyIds: ["folder.deleted"],
      workspacePrefs: { mainLayoutPreset: "single" }
    });

    const feed = await service.listProjectChangeFeed({ projectId: project.id, afterSequence: 0, limit: 10 });
    const hierarchyEvents = feed.events.filter((event) => event.entityKind === "hierarchy");
    expect(hierarchyEvents).toHaveLength(2);
    expect(hierarchyEvents.map((event) => ({ projectId: event.projectId, entityId: event.entityId, operation: event.operation }))).toEqual([
      { projectId: project.id, entityId: project.id, operation: "update" },
      { projectId: project.id, entityId: project.id, operation: "update" }
    ]);
    expect(hierarchyEvents.every((event) => event.revision >= 1 && event.changedAt > 0 && event.transactionId.startsWith("project-change.update."))).toBe(true);
  });
});
