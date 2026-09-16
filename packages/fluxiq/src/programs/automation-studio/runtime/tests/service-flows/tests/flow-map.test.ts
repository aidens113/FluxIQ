import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AutomationStudioService } from "../../../service.ts";
import { AutomationStudioProjectDatabasePool, AutomationStudioProjectFlowResourceRepository } from "../../../../storage/index.ts";

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

  it("mutates Flow Map route groups and routes through validated router writes", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Flow Map Mutations" });
    const flow = await service.createFlow({ projectId: project.id, flowId: "flow.flow-map-mutations", name: "Flow Map Mutations" });
    const primary = await service.createFlowSubflow({ projectId: project.id, flowId: flow.flowId, name: "Main Task", role: "primary" });
    const fallback = await service.createFlowSubflow({ projectId: project.id, flowId: flow.flowId, name: "Fallback Task", role: "fallback" });

    const grouped = await service.upsertFlowMapRouteGroup({ projectId: project.id, flowId: flow.flowId, name: "Checkout", description: "Checkout traffic", order: 10, status: "disabled", collapsed: true });
    const group = (grouped.metadata?.routeGroups as any[])[0];
    expect(group).toMatchObject({ name: "Checkout", description: "Checkout traffic", order: 10, status: "disabled", collapsed: true });
    await expect(service.getFlowRouterSummary(project.id, flow.flowId)).resolves.toMatchObject({
      metadata: { routeGroups: [{ name: "Checkout", description: "Checkout traffic", order: 10, status: "disabled", collapsed: true }] },
      ruleCount: 0
    });

    const routed = await service.upsertFlowMapRoute({
      projectId: project.id,
      flowId: flow.flowId,
      name: "Primary Checkout",
      targetSubflowId: primary.subflowId,
      groupId: group.groupId,
      order: 5,
      conditionSummary: "User intent is checkout",
      conditionSignalPath: "inputs.intent",
      conditionOperator: "equals",
      conditionExpected: "checkout"
    });
    expect(routed.rules).toHaveLength(1);
    expect(routed.rules[0]).toMatchObject({
      name: "Primary Checkout",
      order: 5,
      target: { kind: "subflow", subflowId: primary.subflowId },
      condition: { signalPath: "inputs.intent", operator: "equals", expected: "checkout" },
      metadata: { groupId: group.groupId, conditionSummary: "User intent is checkout" }
    });

    const always = await service.upsertFlowMapRoute({
      projectId: project.id,
      flowId: flow.flowId,
      ruleId: routed.rules[0]!.ruleId,
      name: "Primary Checkout",
      targetSubflowId: primary.subflowId,
      clearCondition: true
    });
    expect(always.rules[0]?.condition).toBeUndefined();
    expect(always.rules[0]?.metadata?.conditionSummary).toBeUndefined();
    const withFallback = await service.upsertFlowMapRoute({ projectId: project.id, flowId: flow.flowId, name: "Fallback Route", targetSubflowId: fallback.subflowId, setAsFallback: true });
    expect(withFallback.fallback).toEqual({ kind: "subflow", subflowId: fallback.subflowId });

    const duplicated = await service.mutateFlowMapRoute({ projectId: project.id, flowId: flow.flowId, ruleId: routed.rules[0]!.ruleId, action: "duplicate" });
    const copy = duplicated.rules.find((rule) => rule.name === "Primary Checkout copy");
    expect(copy).toBeDefined();
    expect(duplicated.rules.map((rule) => rule.order)).toEqual([0, 10, 20]);

    const moved = await service.mutateFlowMapRoute({ projectId: project.id, flowId: flow.flowId, ruleId: copy!.ruleId, action: "move_up" });
    expect(moved.rules[0]?.ruleId).toBe(copy!.ruleId);

    const toggled = await service.mutateFlowMapRoute({ projectId: project.id, flowId: flow.flowId, ruleId: routed.rules[0]!.ruleId, action: "toggle" });
    expect(toggled.rules.find((rule) => rule.ruleId === routed.rules[0]!.ruleId)?.status).toBe("disabled");

    const removedCopy = await service.mutateFlowMapRoute({ projectId: project.id, flowId: flow.flowId, ruleId: copy!.ruleId, action: "delete" });
    expect(removedCopy.rules.some((rule) => rule.ruleId === copy!.ruleId)).toBe(false);
    const stoppedFallback = await service.setFlowMapFallback({ projectId: project.id, flowId: flow.flowId, kind: "fail", message: "No supported request matched." });
    expect(stoppedFallback.fallback).toEqual({ kind: "fail", message: "No supported request matched." });
    expect(stoppedFallback.rules).toHaveLength(2);

    const directFallback = await service.setFlowMapFallback({ projectId: project.id, flowId: flow.flowId, kind: "subflow", targetSubflowId: primary.subflowId });
    expect(directFallback.fallback).toEqual({ kind: "subflow", subflowId: primary.subflowId });
    expect(directFallback.rules).toHaveLength(2);
    await expect(service.listFlowRouterTargetReferences({ projectId: project.id, flowId: flow.flowId, subflowIds: [primary.subflowId, fallback.subflowId], perTargetLimit: 1 })).resolves.toMatchObject({
      perTargetLimit: 1,
      targets: [
        { subflowId: primary.subflowId, total: 2, hasMore: false, references: [{ name: "Primary Checkout" }, { kind: "fallback", conditionLabel: "No rule matched" }] },
        { subflowId: fallback.subflowId, total: 1, hasMore: false, references: [{ name: "Fallback Route" }] }
      ]
    });

    const ungrouped = await service.deleteFlowMapRouteGroup({ projectId: project.id, flowId: flow.flowId, groupId: group.groupId });
    expect(ungrouped.metadata?.routeGroups).toEqual([]);
    expect(ungrouped.rules.find((rule) => rule.name === "Primary Checkout")?.metadata?.groupId).toBeUndefined();

    const withoutRoute = await service.deleteFlowMapRoute({ projectId: project.id, flowId: flow.flowId, ruleId: routed.rules[0]!.ruleId });
    expect(withoutRoute.rules.map((rule) => rule.name)).toEqual(["Fallback Route"]);
  });

  it("projects legacy subflows without graph IDs before their Router fallback", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Legacy Subflow Projection" });
    const flow = await service.createFlow({ projectId: project.id, flowId: "flow.legacy-projection", name: "Legacy Projection" });
    const subflowId = "subflow.legacy-projection";
    const legacySubflow = {
      schemaVersion: "0.1",
      projectId: project.id,
      flowId: flow.flowId,
      subflowId,
      name: "Legacy Task",
      role: "primary",
      status: "active",
      createdAt: 10,
      updatedAt: 10
    };
    const legacyRouter = {
      schemaVersion: "0.1",
      projectId: project.id,
      flowId: flow.flowId,
      routerId: "router.legacy-projection",
      name: "Legacy Router",
      rules: [],
      fallback: { kind: "subflow", subflowId },
      status: "active",
      createdAt: 10,
      updatedAt: 10
    };
    const flowDirectory = path.join(tempRoot, "programs", "automation-studio", "projects", project.id, "flows", flow.flowId);
    const legacySubflowFile = path.join(flowDirectory, "subflows", subflowId, "subflow.json");
    await mkdir(path.dirname(legacySubflowFile), { recursive: true });
    await writeFile(legacySubflowFile, `${JSON.stringify({ version: 1, data: legacySubflow }, null, 2)}\n`, "utf8");
    await writeFile(path.join(flowDirectory, "router.json"), `${JSON.stringify({ version: 1, data: legacyRouter }, null, 2)}\n`, "utf8");

    await expect(service.getFlowSubflow(project.id, flow.flowId, subflowId)).resolves.not.toHaveProperty("graphFlowId");
    await expect(service.getFlowRouterSummary(project.id, flow.flowId)).resolves.toMatchObject({
      fallback: { kind: "subflow", subflowId }
    });

    const graphFlowId = `${flow.flowId}.${subflowId}.graph`;
    await expect(service.getFlow(project.id, graphFlowId)).resolves.toMatchObject({
      metadata: { parentFlowId: flow.flowId, parentSubflowId: subflowId, subflowGraph: true }
    });
    const pool = new AutomationStudioProjectDatabasePool({ rootDir: path.join(tempRoot, "programs", "automation-studio") });
    const repository = await AutomationStudioProjectFlowResourceRepository.open({ pool, projectId: project.id });
    try {
      await expect(repository.getSubflow(subflowId)).resolves.toMatchObject({
        parentFlowId: flow.flowId,
        graphFlowId
      });
      await expect(repository.getFlow(graphFlowId)).resolves.toMatchObject({
        flowId: graphFlowId,
        parentFlowId: flow.flowId
      });
      await expect(repository.getRouterSummaryForFlow(flow.flowId)).resolves.toMatchObject({
        fallbackKind: "subflow",
        fallbackSubflowId: subflowId
      });
    } finally {
      await repository.close();
      await pool.closeAll();
    }

    const canonicalLegacy = JSON.parse(await readFile(legacySubflowFile, "utf8"));
    expect(canonicalLegacy.data).not.toHaveProperty("graphFlowId");
  });
});
