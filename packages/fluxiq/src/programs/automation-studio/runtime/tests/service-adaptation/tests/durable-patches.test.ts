import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AutomationStudioService } from "../../../service.ts";
import { getPrimarySubflowGraph, installPrimaryRouter } from "../../service-fixtures.ts";

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

  it("filters adaptations by status and records review/promotion transitions", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Adaptation Review" });
    const flow = await service.createFlow({ projectId: project.id, flowId: "flow.adaptation-review", name: "Adaptation Review Flow" });
    const primary = await installPrimaryRouter(service, project.id, flow.flowId, {
        nodes: [
          { id: "expect.ready", definitionId: "builtin.policy.expectation", parameterValues: { timeoutMs: 100 } },
          { id: "action.submit", definitionId: "builtin.policy.action", parameterValues: { target: { selector: "#old" } } }
        ],
        edges: []
    });
    const base = {
      schemaVersion: "0.1" as const,
      flowId: flow.flowId,
      subflowId: primary.subflow.subflowId,
      projectId: project.id,
      trigger: "Expected state changed",
      patch: [{ kind: "edit_expectation" as const, targetId: "expect.ready", summary: "Wait for ready state.", after: { timeoutMs: 500, retryCount: 3 } }],
      validationResults: [{ runId: "run.validation.1", status: "succeeded" as const, checkedAt: 20 }],
      author: "runtime" as const,
      riskLevel: "low" as const,
      createdAt: 10,
      updatedAt: 10
    };
    await service.saveFlowAdaptation({ ...base, adaptationId: "adaptation.apply", status: "validated" });
    await service.saveFlowAdaptation({ ...base, adaptationId: "adaptation.reject", status: "proposed" });
    await service.saveFlowAdaptation({ ...base, adaptationId: "adaptation.disable", status: "proposed" });
    await service.saveFlowAdaptation({ ...base, adaptationId: "adaptation.supersede", status: "validated" });
    await service.saveFlowAdaptation({ ...base, adaptationId: "adaptation.manual", status: "validated" });

    const validated = await service.listFlowAdaptationSummaries({ projectId: project.id, flowId: flow.flowId, status: "validated", limit: 10 });
    expect(validated.adaptations.map((adaptation) => adaptation.adaptationId).sort()).toEqual(["adaptation.apply", "adaptation.manual", "adaptation.supersede"]);

    await expect(service.reviewFlowAdaptation({ projectId: project.id, flowId: flow.flowId, adaptationId: "adaptation.apply", action: "apply", reason: "Validation passed." })).resolves.toMatchObject({
      status: "applied",
      appliedTo: [{ kind: "expectation", id: "expect.ready" }],
      metadata: { applicationRecord: { reversible: true, durable: true } }
    });
    await expect(service.getFlow(project.id, flow.flowId)).resolves.toMatchObject({
      metadata: { appliedAdaptationIds: ["adaptation.apply"] }
    });
    await expect(getPrimarySubflowGraph(service, project.id, flow.flowId)).resolves.toMatchObject({
      nodes: expect.arrayContaining([expect.objectContaining({ id: "expect.ready", parameterValues: { timeoutMs: 500, retryCount: 3 } })])
    });
    await expect(service.reviewFlowAdaptation({ projectId: project.id, flowId: flow.flowId, adaptationId: "adaptation.apply", action: "revert" })).resolves.toMatchObject({ status: "reverted" });
    await expect(getPrimarySubflowGraph(service, project.id, flow.flowId)).resolves.toMatchObject({
      nodes: expect.arrayContaining([expect.objectContaining({ id: "expect.ready", parameterValues: { timeoutMs: 100 } })])
    });
    await expect(service.reviewFlowAdaptation({ projectId: project.id, flowId: flow.flowId, adaptationId: "adaptation.reject", action: "reject", reason: "Conflicts with operator instruction." })).resolves.toMatchObject({ status: "rejected" });
    await expect(service.reviewFlowAdaptation({ projectId: project.id, flowId: flow.flowId, adaptationId: "adaptation.disable", action: "disable" })).resolves.toMatchObject({ status: "disabled" });
    await expect(service.reviewFlowAdaptation({ projectId: project.id, flowId: flow.flowId, adaptationId: "adaptation.supersede", action: "supersede", supersededByAdaptationId: "adaptation.apply" })).resolves.toMatchObject({ status: "superseded", metadata: { supersededByAdaptationId: "adaptation.apply" } });
    await expect(service.reviewFlowAdaptation({ projectId: project.id, flowId: flow.flowId, adaptationId: "adaptation.manual", action: "switch_manual" })).resolves.toMatchObject({ status: "proposed", metadata: { proposalModeOverride: "manual" } });
    await expect(service.reviewFlowAdaptation({ projectId: project.id, flowId: flow.flowId, adaptationId: "adaptation.reject", action: "apply" })).rejects.toThrow("rejected adaptations cannot be applied");
  });

  it("applies and reverts durable action target and structural adaptation patches", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Durable Adaptations" });
    const flow = await service.createFlow({ projectId: project.id, flowId: "flow.durable-adaptations", name: "Durable Adaptations Flow" });
    const primary = await installPrimaryRouter(service, project.id, flow.flowId, {
        nodes: [
          // A recorded step: the element it acts on travels in the payload it dispatches.
          { id: "action.submit", definitionId: "builtin.policy.action", parameterValues: { parameters: { target: { selector: "#old" } } } },
          { id: "broken", definitionId: "builtin.math.divide", parameterValues: {} },
          { id: "end", definitionId: "builtin.control.end", parameterValues: { status: "success" } }
        ],
        edges: []
    });

    const base = {
      schemaVersion: "0.1" as const,
      flowId: flow.flowId,
      subflowId: primary.subflow.subflowId,
      projectId: project.id,
      trigger: "Runtime drift",
      validationResults: [{ runId: "run.validation.1", status: "succeeded" as const, checkedAt: 20 }],
      author: "runtime" as const,
      riskLevel: "low" as const,
      createdAt: 10,
      updatedAt: 10
    };

    await service.saveFlowAdaptation({
      ...base,
      adaptationId: "adaptation.target",
      status: "validated",
      patch: [{ kind: "edit_action_target", targetId: "action.submit", summary: "Use the new submit target.", after: { selector: "#new" } }]
    });
    await service.reviewFlowAdaptation({ projectId: project.id, flowId: flow.flowId, adaptationId: "adaptation.target", action: "apply" });
    await expect(service.reviewFlowAdaptation({ projectId: project.id, flowId: flow.flowId, adaptationId: "adaptation.target", action: "apply" })).resolves.toMatchObject({
      status: "applied",
      metadata: { idempotentApply: { reason: "Adaptation was already applied." } }
    });
    const run = await service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId, adaptiveMode: "deterministic" });
    const detail = await service.getFlowRunDetail(project.id, run.runId);
    expect(detail).toBeTruthy();
    await service.saveFlowRunDetail({ ...detail!, adaptationIds: ["adaptation.target"] });
    await expect(service.exportFlowRunAudit(project.id, run.runId)).resolves.toMatchObject({
      runId: run.runId,
      manifest: { actionCount: expect.any(Number), recoveryCount: expect.any(Number), routeDecisionCount: expect.any(Number), interventionCount: expect.any(Number), adaptationCount: 1 },
      integrity: { algorithm: "sha256", runDetailHash: expect.stringMatching(/^[a-f0-9]{64}$/) },
      retention: { rawPromptsRetained: false, compactContextRetained: true, sensitiveValuesRedacted: true },
      adaptations: [expect.objectContaining({
        adaptationId: "adaptation.target",
        validationResults: [{ runId: "run.validation.1", status: "succeeded", checkedAt: 20 }],
        mutationEvidence: expect.arrayContaining([expect.objectContaining({
          patchKind: "edit_action_target",
          before: expect.any(Object),
          after: expect.any(Object),
          rollback: expect.any(Object)
        })])
      })]
    });
    await expect(getPrimarySubflowGraph(service, project.id, flow.flowId)).resolves.toMatchObject({
      nodes: expect.arrayContaining([expect.objectContaining({ id: "action.submit", parameterValues: { parameters: { target: { selector: "#new" } } } })])
    });
    await service.reviewFlowAdaptation({ projectId: project.id, flowId: flow.flowId, adaptationId: "adaptation.target", action: "revert" });
    await expect(getPrimarySubflowGraph(service, project.id, flow.flowId)).resolves.toMatchObject({
      nodes: expect.arrayContaining([expect.objectContaining({ id: "action.submit", parameterValues: { parameters: { target: { selector: "#old" } } } })])
    });

    await service.saveFlowChangeProposal({
      schemaVersion: "0.1",
      proposalId: "proposal.reroute",
      flowId: flow.flowId,
      projectId: project.id,
      mode: "auto",
      status: "auto_approved",
      riskLevel: "low",
      patches: [{ kind: "edit_router", targetId: "broken", summary: "Route failures to the end node.", after: { toNodeId: "end" } }],
      createdBy: "runtime",
      createdAt: 30,
      updatedAt: 30
    });
    await service.saveFlowAdaptation({
      ...base,
      adaptationId: "adaptation.reroute",
      status: "validated",
      proposalId: "proposal.reroute",
      patch: [{ kind: "edit_router", targetId: "broken", summary: "Route failures to the end node.", after: { toNodeId: "end" } }]
    });
    const appliedRouter = await service.reviewFlowAdaptation({ projectId: project.id, flowId: flow.flowId, adaptationId: "adaptation.reroute", action: "apply" });
    expect(appliedRouter.metadata?.applicationRecord).toMatchObject({ durable: true, mutations: expect.any(Array) });
    expect((await getPrimarySubflowGraph(service, project.id, flow.flowId)).edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceNodeId: "broken", sourcePortId: "failed", targetNodeId: "end" })
    ]));
    await service.reviewFlowAdaptation({ projectId: project.id, flowId: flow.flowId, adaptationId: "adaptation.reroute", action: "revert" });
    expect((await getPrimarySubflowGraph(service, project.id, flow.flowId)).edges).toEqual([]);
  });

  it("rolls back created subflows and rejects invalid durable mutations", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Durable Subflow Rollback" });
    const flow = await service.createFlow({ projectId: project.id, flowId: "flow.subflow-rollback", name: "Subflow Rollback Flow" });
    const base = {
      schemaVersion: "0.1" as const,
      flowId: flow.flowId,
      projectId: project.id,
      trigger: "Needs recovery path",
      validationResults: [{ runId: "run.validation.1", status: "succeeded" as const, checkedAt: 20 }],
      author: "llm" as const,
      riskLevel: "low" as const,
      createdAt: 10,
      updatedAt: 10
    };

    await service.saveFlowChangeProposal({
      schemaVersion: "0.1",
      proposalId: "proposal.create-subflow",
      flowId: flow.flowId,
      projectId: project.id,
      mode: "auto",
      status: "auto_approved",
      riskLevel: "low",
      patches: [{ kind: "create_subflow", summary: "Create a recovery path.", after: { name: "Recovery path", role: "recovery" } }],
      createdBy: "llm",
      createdAt: 30,
      updatedAt: 30
    });
    await service.saveFlowAdaptation({
      ...base,
      adaptationId: "adaptation.create-subflow",
      status: "validated",
      proposalId: "proposal.create-subflow",
      patch: [{ kind: "create_subflow", summary: "Create a recovery path.", after: { name: "Recovery path", role: "recovery" } }]
    });
    const applied = await service.reviewFlowAdaptation({ projectId: project.id, flowId: flow.flowId, adaptationId: "adaptation.create-subflow", action: "apply" });
    const createdSubflowId = applied.appliedTo?.[0]?.id;
    expect(createdSubflowId).toEqual(expect.stringContaining("subflow."));
    await expect(service.listFlowSubflowSummaries({ projectId: project.id, flowId: flow.flowId })).resolves.toMatchObject({ total: 1 });
    await service.reviewFlowAdaptation({ projectId: project.id, flowId: flow.flowId, adaptationId: "adaptation.create-subflow", action: "revert" });
    await expect(service.listFlowSubflowSummaries({ projectId: project.id, flowId: flow.flowId })).resolves.toMatchObject({ total: 0 });

    const primary = await installPrimaryRouter(service, project.id, flow.flowId, { nodes: [], edges: [] });
    await service.saveFlowAdaptation({
      ...base,
      subflowId: primary.subflow.subflowId,
      adaptationId: "adaptation.invalid-target",
      status: "validated",
      author: "runtime",
      patch: [{ kind: "edit_action_target", targetId: "missing", summary: "Retarget a missing node.", after: { selector: "#nope" } }]
    });
    await expect(service.reviewFlowAdaptation({ projectId: project.id, flowId: flow.flowId, adaptationId: "adaptation.invalid-target", action: "apply" })).rejects.toThrow("Unknown Flow node");
    await expect(service.getFlow(project.id, flow.flowId)).resolves.toMatchObject({ nodes: [] });

    await service.saveFlowAdaptation({
      ...base,
      subflowId: primary.subflow.subflowId,
      adaptationId: "adaptation.destructive",
      status: "validated",
      riskLevel: "destructive",
      patch: [{ kind: "edit_expectation", targetId: "missing", summary: "Dangerous edit.", after: { timeoutMs: 1 } }]
    });
    await expect(service.reviewFlowAdaptation({ projectId: project.id, flowId: flow.flowId, adaptationId: "adaptation.destructive", action: "apply" })).rejects.toThrow("destructive adaptations require manual proposal review");
  });
});
