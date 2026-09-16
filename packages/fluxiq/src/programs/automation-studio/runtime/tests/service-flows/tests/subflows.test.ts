import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

describe("AutomationStudioService recording persistence", () => {
  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-automation-studio-service-"));
  });

  afterEach(async () => {
    await Promise.all([...services].map((service) => service.close()));
    services.clear();
    await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
  });

  it("creates, updates, duplicates, disables, and archives Flow subflows", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Subflow CRUD" });
    const flow = await service.createFlow({ projectId: project.id, flowId: "flow.subflow-crud", name: "Subflow CRUD Flow" });

    const created = await service.createFlowSubflow({
      projectId: project.id,
      flowId: flow.flowId,
      name: "Checkout",
      role: "primary",
      routeTags: ["checkout", "cart"]
    });
    const subflowGraph = await service.getFlow(project.id, created.graphFlowId!);
    const now = Date.now();
    await expect(service.saveFlowRouter({
      schemaVersion: "0.1",
      routerId: "router.subflow-invalid",
      projectId: project.id,
      flowId: created.graphFlowId!,
      name: "Subflow Router",
      rules: [],
      fallback: { kind: "fail", message: "No route." },
      status: "active",
      createdAt: now,
      updatedAt: now
    })).rejects.toThrow("top-level Flow");
    const renamed = await service.renameFlowSubflow({ projectId: project.id, flowId: flow.flowId, subflowId: created.subflowId, name: "Checkout happy path" });
    const updated = await service.updateFlowSubflow({
      projectId: project.id,
      flowId: flow.flowId,
      subflowId: created.subflowId,
      inputMapping: [{ flowInputId: "accountId", subflowInputId: "accountId", required: true }],
      outputMapping: [{ subflowOutputId: "receiptId", flowOutputId: "receiptId" }],
      localInstructionIds: ["instruction.checkout"],
      proposalModeOverride: "manual"
    });
    const inheritedApproval = await service.updateFlowSubflow({ projectId: project.id, flowId: flow.flowId, subflowId: created.subflowId, proposalModeOverride: null });
    const duplicated = await service.duplicateFlowSubflow({ projectId: project.id, flowId: flow.flowId, subflowId: created.subflowId, name: "Checkout retry path" });
    const disabled = await service.disableFlowSubflow({ projectId: project.id, flowId: flow.flowId, subflowId: created.subflowId });
    const archived = await service.archiveFlowSubflow({ projectId: project.id, flowId: flow.flowId, subflowId: duplicated.subflowId });
    const enabled = await service.enableFlowSubflow({ projectId: project.id, flowId: flow.flowId, subflowId: created.subflowId });
    const duplicateGraph = await service.getFlow(project.id, duplicated.graphFlowId!);
    const deleted = await service.deleteFlowSubflow({ projectId: project.id, flowId: flow.flowId, subflowId: duplicated.subflowId });
    const page = await service.listFlowSubflowSummaries({ projectId: project.id, flowId: flow.flowId });
    const flowSummaries = await service.listAutomationFlowSummaries(project.id);

    expect(subflowGraph).toMatchObject({ flowId: created.graphFlowId, metadata: { parentFlowId: flow.flowId, parentSubflowId: created.subflowId, subflowGraph: true } });
    expect(flowSummaries).toContainEqual(expect.objectContaining({
      flowId: created.graphFlowId,
      subflowGraph: true,
      parentFlowId: flow.flowId,
      parentSubflowId: created.subflowId
    }));
    expect(renamed.name).toBe("Checkout happy path");
    expect(updated.inputMapping).toEqual([{ flowInputId: "accountId", subflowInputId: "accountId", required: true }]);
    expect(updated.proposalModeOverride).toBe("manual");
    expect(inheritedApproval.proposalModeOverride).toBeUndefined();
    expect(duplicated.metadata).toMatchObject({ duplicatedFromSubflowId: created.subflowId });
    expect(duplicated.graphFlowId).not.toBe(created.graphFlowId);
    expect(duplicateGraph.metadata).toMatchObject({ parentSubflowId: duplicated.subflowId, duplicatedFromFlowId: created.graphFlowId });
    expect(disabled.status).toBe("disabled");
    expect(archived.status).toBe("archived");
    expect(enabled.status).toBe("active");
    expect(deleted).toEqual({ deletedSubflowId: duplicated.subflowId, deletedGraphFlowId: duplicated.graphFlowId });
    expect(page.subflows.map((item) => item.subflowId)).toEqual([created.subflowId]);
    expect(page.subflows[0]).toMatchObject({ summaryVersion: 2, graphFlowId: created.graphFlowId });
  });

  it("rejects stale Subflow Settings revisions without overwriting canonical data", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Subflow settings conflict" });
    const flow = await service.createFlow({ projectId: project.id, flowId: "flow.subflow-conflict", name: "Conflict Flow" });
    const created = await service.createFlowSubflow({ projectId: project.id, flowId: flow.flowId, name: "Original" });
    await new Promise((resolve) => setTimeout(resolve, 2));
    const current = await service.updateFlowSubflow({ projectId: project.id, flowId: flow.flowId, subflowId: created.subflowId, name: "Current" });

    await expect(service.updateFlowSubflow({ projectId: project.id, flowId: flow.flowId, subflowId: created.subflowId, expectedUpdatedAt: created.updatedAt, name: "Stale overwrite" })).rejects.toThrow("SUBFLOW_SAVE_CONFLICT");
    await expect(service.getFlowSubflow(project.id, flow.flowId, created.subflowId)).resolves.toMatchObject({ name: "Current", updatedAt: current.updatedAt });
  });

  it("uses subflow summaries as the canonical Flow hierarchy source", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Canonical Subflow Sidebar" });
    const flow = await service.createFlow({ projectId: project.id, flowId: "flow.canonical-subflows", name: "Canonical" });
    await service.saveFlow({
      projectId: project.id,
      flow: {
        ...flow,
        metadata: { ...(flow.metadata ?? {}), subflowCategories: [{ id: "category.live", name: "Live", parentId: null }] }
      } as any
    });
    const subflow = await service.createFlowSubflow({ projectId: project.id, flowId: flow.flowId, name: "Live Path", parentCategoryId: "category.live" });
    const staleParent = await service.getFlow(project.id, flow.flowId);
    await service.saveFlow({
      projectId: project.id,
      flow: {
        ...staleParent,
        expansion: { subflowIds: [{ subflowId: "subflow.stale", name: "Stale Path", metadata: { subflowCategoryId: "category.live" } }] }
      } as any
    });

    const summaries = await service.listAutomationFlowSummaries(project.id);
    const parentSummary = summaries.find((summary) => summary.flowId === flow.flowId);

    expect(parentSummary?.hierarchySubflows).toEqual([{ subflowId: subflow.subflowId, name: "Live Path", graphFlowId: subflow.graphFlowId, parentCategoryId: "category.live" }]);
    await expect(service.listFlowSubflowSummaries({ projectId: project.id, flowId: flow.flowId })).resolves.toMatchObject({
      subflows: [expect.objectContaining({ subflowId: subflow.subflowId, parentCategoryId: "category.live" })]
    });
  });

  it("rolls back a generated graph Flow when subflow creation fails before canonical membership is written", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Subflow Create Rollback" });
    const flow = await service.createFlow({ projectId: project.id, flowId: "flow.subflow-rollback", name: "Rollback" });

    await expect(service.createFlowSubflow({ projectId: project.id, flowId: flow.flowId, name: "Broken", parentCategoryId: "category.missing" })).rejects.toThrow();

    const summaries = await service.listAutomationFlowSummaries(project.id);
    const subflows = await service.listFlowSubflowSummaries({ projectId: project.id, flowId: flow.flowId });
    expect(subflows.subflows).toEqual([]);
    expect(summaries.some((summary) => summary.parentFlowId === flow.flowId || summary.hierarchySubflows?.some((item) => item.name === "Broken"))).toBe(false);
  });

  it("repairs stale subflow ownership and hierarchy metadata before returning Flow summaries", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Stale Subflow Summary" });
    const parent = await service.createFlow({ projectId: project.id, flowId: "flow.stale-parent", name: "Test" });
    const subflow = await service.createFlowSubflow({
      projectId: project.id,
      flowId: parent.flowId,
      name: "Checkout",
      role: "primary"
    });
    await service.saveFlow({
      projectId: project.id,
      flow: {
        ...parent,
        expansion: { subflowIds: [{ subflowId: subflow.subflowId, name: "Checkout", metadata: { subflowCategoryId: "category.checkout" } }] },
        metadata: { ...(parent.metadata ?? {}), subflowCategories: [{ id: "category.checkout", name: "Checkout paths", parentId: null }] }
      } as any
    });
    const indexFile = path.join(tempRoot, "programs", "automation-studio", "projects", project.id, "indexes", "flows.json");
    const staleEnvelope = JSON.parse(await readFile(indexFile, "utf8")) as {
      version: 1;
      data: {
        schemaVersion: "0.1";
        ownershipMetadataVersion?: 1;
        hierarchyMetadataVersion?: 1;
        flows: Array<Record<string, unknown>>;
      };
    };
    delete staleEnvelope.data.ownershipMetadataVersion;
    delete staleEnvelope.data.hierarchyMetadataVersion;
    for (const summary of staleEnvelope.data.flows) {
      delete summary.subflowGraph;
      delete summary.parentFlowId;
      delete summary.parentSubflowId;
      delete summary.hierarchySubflows;
      delete summary.subflowCategories;
    }
    await writeFile(indexFile, JSON.stringify(staleEnvelope, null, 2), "utf8");

    const reloaded = createService({ dataDir: tempRoot, seedFixture: false });
    const summaries = await reloaded.listAutomationFlowSummaries(project.id);
    const repairedEnvelope = JSON.parse(await readFile(indexFile, "utf8")) as {
      data: {
        ownershipMetadataVersion?: number;
        hierarchyMetadataVersion?: number;
        flows: Array<Record<string, unknown>>;
      };
    };
    const repairedIndex = repairedEnvelope.data;

    expect(summaries).toContainEqual(expect.objectContaining({
      flowId: subflow.graphFlowId,
      subflowGraph: true,
      parentFlowId: parent.flowId,
      parentSubflowId: subflow.subflowId
    }));
    expect(summaries).toContainEqual(expect.objectContaining({
      flowId: parent.flowId,
      hierarchySubflows: [{ subflowId: subflow.subflowId, name: "Checkout", graphFlowId: subflow.graphFlowId, parentCategoryId: "category.checkout" }],
      subflowCategories: [{ id: "category.checkout", name: "Checkout paths" }]
    }));
    expect(repairedIndex.ownershipMetadataVersion).toBe(1);
    expect(repairedIndex.hierarchyMetadataVersion).toBe(1);
    expect(repairedIndex.flows).toContainEqual(expect.objectContaining({
      flowId: subflow.graphFlowId,
      subflowGraph: true,
      parentFlowId: parent.flowId,
      parentSubflowId: subflow.subflowId
    }));
  });
});
