import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AutomationStudioFlowAdaptation } from "../model/index.ts";
import { AutomationStudioService } from "./service.ts";

describe("Automation Studio Subflow-scoped node adaptations", () => {
  let dataDir: string;
  let service: AutomationStudioService;

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-subflow-adaptation-"));
    service = new AutomationStudioService({ dataDir, seedFixture: false });
  });

  afterEach(async () => {
    await service.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  it("applies and reverts a parent-scoped adaptation against its explicitly owned Subflow graph", async () => {
    const project = await service.createProject({ name: "Owned adaptation" });
    const parent = await service.createFlow({ projectId: project.id, flowId: "flow.parent", name: "Parent" });
    const subflow = await service.createFlowSubflow({ projectId: project.id, flowId: parent.flowId, name: "Primary", role: "primary" });
    const graph = await service.getFlow(project.id, subflow.graphFlowId!);
    await service.saveFlow({
      projectId: project.id,
      flow: {
        ...graph,
        nodes: [
          { id: "action.submit", definitionId: "builtin.policy.action", parameterValues: { target: { selector: "#old" } } },
          { id: "end", definitionId: "builtin.control.end", parameterValues: { status: "success" } }
        ]
      }
    });
    await installRouter(service, project.id, parent.flowId, subflow.subflowId);
    await service.saveFlowAdaptation(adaptationFixture({
      projectId: project.id,
      flowId: parent.flowId,
      subflowId: subflow.subflowId,
      adaptationId: "adaptation.owned"
    }));

    const applied = await service.reviewFlowAdaptation({
      projectId: project.id,
      flowId: parent.flowId,
      adaptationId: "adaptation.owned",
      action: "apply"
    });
    expect(applied).toMatchObject({
      status: "applied",
      flowId: parent.flowId,
      subflowId: subflow.subflowId,
      appliedTo: [{ kind: "action_target", id: "action.submit" }],
      metadata: {
        applicationRecord: {
          mutations: expect.arrayContaining([
            expect.objectContaining({ artifactKind: "flow", artifactId: graph.flowId, rollback: { kind: "restore_owned_subflow_graph", parentFlowId: parent.flowId, subflowId: subflow.subflowId, graphFlowId: graph.flowId } })
          ])
        }
      }
    });
    await expect(service.getFlow(project.id, parent.flowId)).resolves.toMatchObject({ nodes: [], metadata: { appliedAdaptationIds: ["adaptation.owned"] } });
    await expect(service.getFlow(project.id, graph.flowId)).resolves.toMatchObject({
      nodes: expect.arrayContaining([expect.objectContaining({ id: "action.submit", parameterValues: { target: { selector: "#new" } } })])
    });

    await expect(service.reviewFlowAdaptation({
      projectId: project.id,
      flowId: parent.flowId,
      adaptationId: "adaptation.owned",
      action: "revert"
    })).resolves.toMatchObject({ status: "reverted" });
    await expect(service.getFlow(project.id, graph.flowId)).resolves.toMatchObject({
      nodes: expect.arrayContaining([expect.objectContaining({ id: "action.submit", parameterValues: { target: { selector: "#old" } } })])
    });

    await service.saveFlowAdaptation({
      ...adaptationFixture({ projectId: project.id, flowId: parent.flowId, subflowId: subflow.subflowId, adaptationId: "adaptation.reroute" }),
      proposalId: "proposal.reroute",
      patch: [{ kind: "edit_router", targetId: "action.submit", summary: "Route failures to the end node.", after: { toNodeId: "end" } }]
    });
    await expect(service.reviewFlowAdaptation({ projectId: project.id, flowId: parent.flowId, adaptationId: "adaptation.reroute", action: "apply" }))
      .resolves.toMatchObject({ status: "applied", subflowId: subflow.subflowId });
    await expect(service.getFlow(project.id, graph.flowId)).resolves.toMatchObject({
      edges: [expect.objectContaining({ sourceNodeId: "action.submit", sourcePortId: "failed", targetNodeId: "end" })]
    });
    await expect(service.getFlowRouter(project.id, parent.flowId)).resolves.toMatchObject({ rules: [], fallback: { kind: "subflow", subflowId: subflow.subflowId } });
    await service.reviewFlowAdaptation({ projectId: project.id, flowId: parent.flowId, adaptationId: "adaptation.reroute", action: "revert" });
    await expect(service.getFlow(project.id, graph.flowId)).resolves.toMatchObject({ edges: [] });
  });

  it("fails closed when a modern node adaptation omits or misstates Subflow ownership", async () => {
    const project = await service.createProject({ name: "Ownership failures" });
    const parent = await service.createFlow({ projectId: project.id, flowId: "flow.parent", name: "Parent" });
    const owned = await service.createFlowSubflow({ projectId: project.id, flowId: parent.flowId, name: "Owned", role: "primary" });
    const graph = await service.getFlow(project.id, owned.graphFlowId!);
    await service.saveFlow({ projectId: project.id, flow: { ...graph, nodes: [{ id: "action.submit", definitionId: "builtin.policy.action", parameterValues: { target: { selector: "#old" } } }] } });
    const otherParent = await service.createFlow({ projectId: project.id, flowId: "flow.other", name: "Other" });
    const foreign = await service.createFlowSubflow({ projectId: project.id, flowId: otherParent.flowId, name: "Foreign", role: "primary" });

    await service.saveFlowAdaptation(adaptationFixture({ projectId: project.id, flowId: parent.flowId, adaptationId: "adaptation.missing" }));
    await expect(service.reviewFlowAdaptation({ projectId: project.id, flowId: parent.flowId, adaptationId: "adaptation.missing", action: "apply" }))
      .rejects.toThrow("requires an explicit Subflow target");

    await service.saveFlowAdaptation(adaptationFixture({ projectId: project.id, flowId: parent.flowId, subflowId: foreign.subflowId, adaptationId: "adaptation.foreign" }));
    await expect(service.reviewFlowAdaptation({ projectId: project.id, flowId: parent.flowId, adaptationId: "adaptation.foreign", action: "apply" }))
      .rejects.toThrow("is not owned by orchestration Flow");
    await expect(service.getFlow(project.id, graph.flowId)).resolves.toMatchObject({
      nodes: [expect.objectContaining({ parameterValues: { target: { selector: "#old" } } })]
    });
  });
});

function adaptationFixture(input: { projectId: string; flowId: string; subflowId?: string; adaptationId: string }): AutomationStudioFlowAdaptation {
  return {
    schemaVersion: "0.1",
    projectId: input.projectId,
    flowId: input.flowId,
    ...(input.subflowId ? { subflowId: input.subflowId } : {}),
    adaptationId: input.adaptationId,
    trigger: "Recorded target changed",
    patch: [{ kind: "edit_action_target", targetId: "action.submit", summary: "Use the new target.", after: { selector: "#new" } }],
    validationResults: [{ runId: "run.validation", status: "succeeded", checkedAt: 20 }],
    status: "validated",
    author: "runtime",
    riskLevel: "low",
    createdAt: 10,
    updatedAt: 10
  };
}

async function installRouter(service: AutomationStudioService, projectId: string, flowId: string, subflowId: string): Promise<void> {
  const now = Date.now();
  await service.saveFlowRouter({
    schemaVersion: "0.1",
    routerId: `router.${flowId}`,
    projectId,
    flowId,
    name: "Primary router",
    rules: [],
    fallback: { kind: "subflow", subflowId },
    status: "active",
    createdAt: now,
    updatedAt: now
  });
}
