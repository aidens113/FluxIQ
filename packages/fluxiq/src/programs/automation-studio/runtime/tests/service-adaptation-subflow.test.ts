import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AutomationStudioFlowAdaptation } from "../../model/index.ts";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, type AutomationStudioNodeDefinition } from "../../nodes/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../native-node-runtime.ts";
import { AutomationStudioService } from "../service.ts";

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
          { id: "action.submit", definitionId: "example.target-action", parameterValues: { target: { selector: "#old" } } },
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

    let executedTarget: unknown;
    service.bindNativeNodeRuntime(targetCaptureRuntime((target) => { executedTarget = target; }));
    const runtime = await service.runRuntimeSession({
      projectId: project.id,
      flowId: parent.flowId,
      adaptiveMode: "no_llm_intervention"
    });
    expect(executedTarget).toEqual({ selector: "#new" });
    expect(runtime.trace?.attempts[0]).toMatchObject({ nodeId: "action.submit", status: "succeeded" });

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
    await service.saveFlow({ projectId: project.id, flow: { ...graph, nodes: [{ id: "action.submit", definitionId: "example.target-action", parameterValues: { target: { selector: "#old" } } }] } });
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

  it("writes a typed owned-graph adaptation through to artifact reads and routed execution without changing settings", async () => {
    const project = await service.createProject({ name: "Canonical typed adaptation" });
    const parent = await service.createFlow({ projectId: project.id, flowId: "flow.typed-parent", name: "Parent" });
    const subflow = await service.createFlowSubflow({ projectId: project.id, flowId: parent.flowId, name: "Primary", role: "primary" });
    const graphFlowId = subflow.graphFlowId!;
    await service.getFlowGraphViewport({ projectId: project.id, flowId: graphFlowId, bounds: { minX: -100, minY: -100, maxX: 100, maxY: 100 } });
    const inserted = await service.applyFlowGraphPatch({
      projectId: project.id,
      flowId: graphFlowId,
      baseRevision: 1,
      mutationId: "mutation.seed-typed-action",
      operations: [{
        op: "add_node",
        node: {
          nodeId: "action.typed",
          flowId: graphFlowId,
          definitionId: "example.target-action",
          definitionVersion: "1.0.0",
          label: "Typed action",
          description: "",
          x: 0,
          y: 0,
          width: 240,
          height: 96,
          zIndex: 0,
          disabled: false,
          parameterValues: { target: { selector: "#old" } },
          metadata: {}
        }
      }]
    });
    expect(inserted.result).toMatchObject({ status: "applied", revisionNumber: 2 });
    await installRouter(service, project.id, parent.flowId, subflow.subflowId);
    const settingsRevision = (await service.getLlmExecutionBinding(project.id, parent.flowId)).settingsRevision;
    await service.saveFlowAdaptation({
      ...adaptationFixture({ projectId: project.id, flowId: parent.flowId, subflowId: subflow.subflowId, adaptationId: "adaptation.typed" }),
      patch: [{ kind: "edit_action_target", targetId: "action.typed", summary: "Use the new canonical target.", after: { selector: "#new" } }]
    });

    vi.spyOn(service as any, "synchronizeCanonicalFlowGraphProjection").mockRejectedValueOnce(new Error("injected projection failure"));
    const applied = await service.reviewFlowAdaptation({ projectId: project.id, flowId: parent.flowId, adaptationId: "adaptation.typed", action: "apply" });
    expect(applied).toMatchObject({ status: "applied", metadata: { graphRevisionTargetFlowId: graphFlowId, appliedRevision: 3 } });
    await expect(service.getFlow(project.id, graphFlowId)).resolves.toMatchObject({
      metadata: { graphRevision: 3 },
      nodes: [expect.objectContaining({ id: "action.typed", parameterValues: { target: { selector: "#new" } } })]
    });
    expect((await service.getLlmExecutionBinding(project.id, parent.flowId)).settingsRevision).toBe(settingsRevision);

    const executedTargets: unknown[] = [];
    service.bindNativeNodeRuntime(targetCaptureRuntime((target) => { executedTargets.push(target); }));
    const runtime = await service.runRuntimeSession({ projectId: project.id, flowId: parent.flowId, adaptiveMode: "no_llm_intervention" });
    expect(runtime.trace?.attempts[0]).toMatchObject({ nodeId: "action.typed", status: "succeeded" });
    expect(executedTargets).toEqual([{ selector: "#new" }]);

    await service.reviewFlowAdaptation({ projectId: project.id, flowId: parent.flowId, adaptationId: "adaptation.typed", action: "revert" });
    await expect(service.getFlow(project.id, graphFlowId)).resolves.toMatchObject({
      metadata: { graphRevision: 4 },
      nodes: [expect.objectContaining({ id: "action.typed", parameterValues: { target: { selector: "#old" } } })]
    });
    expect((await service.getLlmExecutionBinding(project.id, parent.flowId)).settingsRevision).toBe(settingsRevision);
  });

  it("keeps typed adaptation identity authoritative when canonical detail objects cannot be read", async () => {
    const project = await service.createProject({ name: "Canonical adaptation identity" });
    const flow = await service.createFlow({ projectId: project.id, flowId: "flow.identity", name: "Identity" });
    const canonical = {
      ...adaptationFixture({ projectId: project.id, flowId: flow.flowId, adaptationId: "adaptation.canonical" }),
      status: "reverted" as const
    };
    await service.saveFlowAdaptation(canonical);
    const projectRoot = path.join(dataDir, "programs", "automation-studio", "projects", project.id);
    const legacyFile = path.join(projectRoot, "flows", flow.flowId, "adaptations", canonical.adaptationId, "adaptation.json");
    await mkdir(path.dirname(legacyFile), { recursive: true });
    await writeFile(legacyFile, JSON.stringify({ ...canonical, status: "applied" }), "utf8");
    await rm(path.join(projectRoot, "objects"), { recursive: true, force: true });

    const before = await service.listFlowAdaptationSummaries({ projectId: project.id, flowId: flow.flowId, limit: 10, offset: 0 });
    expect(before.adaptations).toEqual([expect.objectContaining({ adaptationId: canonical.adaptationId, status: "reverted" })]);
    const staleAppliedFilter = await service.listFlowAdaptationSummaries({ projectId: project.id, flowId: flow.flowId, status: "applied", limit: 10, offset: 0 });
    expect(staleAppliedFilter.adaptations).toEqual([]);
    await service.getFlow(project.id, flow.flowId);
    await expect(service.getFlowAdaptation(project.id, flow.flowId, canonical.adaptationId)).rejects.toThrow(/adaptation object|ENOENT/i);
    const after = await service.listFlowAdaptationSummaries({ projectId: project.id, flowId: flow.flowId, limit: 10, offset: 0 });
    expect(after.adaptations).toEqual([expect.objectContaining({ adaptationId: canonical.adaptationId, status: "reverted" })]);
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

function targetCaptureRuntime(capture: (target: unknown) => void): AutomationStudioNativeNodeRuntime {
  const action: AutomationStudioNodeDefinition = {
    schemaVersion: "0.1",
    id: "example.target-action",
    version: "1.0.0",
    label: "Capture target",
    description: "Capture the canonical action target used by routed execution.",
    category: "action",
    source: { kind: "importer", domainId: "test", packageId: "test.target", implementationKey: "capture" },
    availability: { kind: "domain", domainId: "test" },
    capabilities: { executable: true, codeBacked: true },
    inputs: [],
    outputs: [{ id: "success", label: "Success", valueType: "any" }],
    parameters: []
  };
  return new AutomationStudioNativeNodeRuntime().register({
    schemaVersion: "0.1",
    sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION,
    packageId: "test.target",
    packageVersion: "1.0.0",
    domainId: "test",
    nodes: [action]
  }, {
    packageId: "test.target",
    packageVersion: "1.0.0",
    implementations: {
      capture: ({ parameters }) => {
        capture(parameters.target);
        return { status: "success", route: "success", outputs: { success: true } };
      }
    }
  });
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
