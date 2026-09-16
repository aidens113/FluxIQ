import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AutomationStudioService } from "../../../service.ts";
import type { JsonObject } from "../../../../../../core/index.ts";
import { installPrimaryRouter, createFailingCanonicalFlow, adaptiveTrainingMetadata } from "../../service-fixtures.ts";

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

  it("rejects a non-target patch from an explicit diagnose_and_adapt grant without executing it", async () => {
    const resolved: any[] = [];
    const revoked: string[] = [];
    const taskKinds: string[] = [];
    const service = createService({
      dataDir: tempRoot,
      seedFixture: false,
      revokeLlmExecutionGrant: (grantId) => revoked.push(grantId),
      llmProviderResolver: (input) => {
        resolved.push(input);
        return {
          provider: {
            metadata: { provider: "mock", model: "patch-model" },
            runTask: async (request) => {
              taskKinds.push(request.taskKind);
              return request.taskKind === "runtime_patch"
                ? {
                  response: {
                    kind: "runtime_patch",
                    summary: "Route around the broken confirmation node.",
                    riskLevel: "medium",
                    patches: [{ kind: "temporary_reroute", fromNodeId: "broken", toNodeId: "end", reason: "The confirmation node implementation is missing." }]
                  },
                  usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30, estimatedCostUsd: 0.004 }
                }
                : {
                  response: { kind: "diagnosis", summary: "The confirmation node has no runtime implementation." },
                  usage: { inputTokens: 8, outputTokens: 4, totalTokens: 12, estimatedCostUsd: 0.001 }
                };
            }
          },
          maxCallsPerRun: 2
        };
      }
    });
    const project = await service.createProject({ name: "Runtime patch" });
    const flow = await service.createFlow({ projectId: project.id, flowId: "flow.runtime-patch", name: "Runtime patch Flow" });
    await service.saveFlow({ projectId: project.id, flow: { ...flow, metadata: { ...(flow.metadata ?? {}), ...adaptiveTrainingMetadata() } } });
    await installPrimaryRouter(service, project.id, flow.flowId, {
        nodes: [
          { id: "start", definitionId: "builtin.control.start", parameterValues: {} },
          { id: "constant", definitionId: "builtin.data.constant", parameterValues: { value: "ok" } },
          { id: "broken", definitionId: "unknown.confirmation", parameterValues: {} },
          { id: "end", definitionId: "builtin.control.end", parameterValues: { status: "success" } }
        ],
        edges: [
          { id: "start.constant", sourceNodeId: "start", sourcePortId: "success", targetNodeId: "constant", targetPortId: "in" },
          { id: "constant.broken", sourceNodeId: "constant", sourcePortId: "success", targetNodeId: "broken", targetPortId: "in" }
        ]
    });

    const grant = { grantId: "llm-grant:diagnose-adapt", actorUserId: "user.test", actorSessionId: "session.test", purpose: "diagnose_and_adapt" as const };
    const run = await service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId, llmExecution: grant });
    const detail = await service.getFlowRunDetail(project.id, run.runId);

    expect(taskKinds).toEqual(["runtime_diagnosis", "runtime_patch"]);
    expect(resolved).toEqual([expect.objectContaining({ executionGrant: grant })]);
    expect(revoked).toEqual([grant.grantId]);
    expect(detail?.metadata?.runtimePatchAttempts).toEqual([expect.objectContaining({
      kind: "temporary_reroute",
      proposalOnly: true,
      executed: false,
      preflightOk: false,
      restoredExpectedState: false,
      retryOriginalAction: false,
      traceStatus: "not-run",
      issues: ["diagnose_and_adapt supports temporary_target_override proposals only."]
    })]);
    expect(detail?.adaptationIds).toEqual([]);
    expect(detail?.changeProposalIds).toEqual([]);
  });

  it("persists a canonical target override for manual review without executing it", async () => {
    const target = { handles: { control: "submit-order" } };
    const taskKinds: string[] = [];
    const service = createService({
      dataDir: tempRoot,
      seedFixture: false,
      llmProviderResolver: () => ({
        provider: {
          metadata: { provider: "mock", model: "target-proposal-model" },
          runTask: async (request) => {
            taskKinds.push(request.taskKind);
            expect(request.context.policyGates).toMatchObject({ allowExternalSideEffects: false });
            return request.taskKind === "runtime_patch"
              ? {
                response: {
                  kind: "runtime_patch",
                  summary: "Propose the current action target.",
                  riskLevel: "high",
                  patches: [{ kind: "temporary_target_override", targetNodeId: "divide", target, reason: "The recorded target changed." }]
                },
                usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30, estimatedCostUsd: 0.004 }
              }
              : {
                response: { kind: "diagnosis", summary: "The action target no longer resolves." },
                usage: { inputTokens: 8, outputTokens: 4, totalTokens: 12, estimatedCostUsd: 0.001 }
              };
          }
        },
        tokenLimits: { maxInputTokens: 4000, maxOutputTokens: 1000, maxTotalTokens: 5000 },
        maxCallsPerRun: 2,
        maxEstimatedCostUsd: 0.1,
        maxTotalEstimatedCostUsd: 0.15
      })
    });
    const project = await service.createProject({ name: "Target override proposal" });
    const adaptive = adaptiveTrainingMetadata();
    const policy = adaptive.adaptationPolicySettings as JsonObject;
    const training = adaptive.trainingModeSettings as JsonObject;
    const flow = await createFailingCanonicalFlow(service, project.id, {
      flowId: "flow.target-proposal",
      metadata: {
        ...adaptive,
        adaptationPolicySettings: { ...policy, allowModifyActionTargets: false, maxInterventionsPerRun: 1, maxEstimatedCostUsdPerRun: 0.001 },
        trainingModeSettings: {
          ...training,
          budgets: { ...(training.budgets as JsonObject), maxInterventionsPerRun: 1, maxTokensPerRun: 3000 }
        }
      }
    });
    const subflowSummary = (await service.listFlowSubflowSummaries({ projectId: project.id, flowId: flow.flowId })).subflows[0]!;
    const subflow = (await service.getFlowSubflow(project.id, flow.flowId, subflowSummary.subflowId))!;
    const graphBefore = await service.getFlow(project.id, subflow.graphFlowId!);
    const grant = { grantId: "llm-grant:target-proposal", actorUserId: "user.test", actorSessionId: "session.test", purpose: "diagnose_and_adapt" as const };

    const run = await service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId, inputs: { numerator: 1, denominator: 0 }, llmExecution: grant });
    const detail = await service.getFlowRunDetail(project.id, run.runId);

    expect(taskKinds).toEqual(["runtime_diagnosis", "runtime_patch"]);
    expect(detail?.metadata?.llmGate).toMatchObject({
      ok: true,
      costAccounting: { calls: 2, inputTokens: 28, outputTokens: 14, totalTokens: 42, estimatedCostUsd: 0.005, budgetBreaches: 0, pendingCalls: 0 }
    });
    expect(detail?.actionAttempts?.map((attempt) => attempt.nodeId)).toEqual(["start", "divide"]);
    expect(detail?.metadata).not.toHaveProperty("adaptiveRetry");
    expect(detail?.metadata?.runtimePatchAttempts).toEqual([expect.objectContaining({
      kind: "temporary_target_override",
      preflightOk: true,
      proposalOnly: true,
      executed: false,
      restoredExpectedState: false,
      retryOriginalAction: false,
      traceStatus: "not-run",
      adaptationId: expect.stringContaining("adaptation."),
      changeProposalId: expect.stringContaining("proposal.")
    })]);
    expect(await service.getFlow(project.id, subflow.graphFlowId!)).toEqual(graphBefore);

    const adaptationId = detail!.adaptationIds[0]!;
    const proposalId = detail!.changeProposalIds[0]!;
    await expect(service.getFlowChangeProposal(project.id, flow.flowId, proposalId)).resolves.toMatchObject({
      status: "pending",
      mode: "manual",
      riskLevel: "high",
      patches: [{ kind: "edit_action_target", targetId: "divide", after: target, metadata: { externalSideEffect: true } }]
    });
    await expect(service.getFlowAdaptation(project.id, flow.flowId, adaptationId)).resolves.toMatchObject({
      status: "proposed",
      riskLevel: "high",
      proposalId,
      metadata: {
        proposalOnly: true,
        executed: false,
        approvalDecision: { mode: "manual", autoApply: false, requiresManualApproval: true, externalSideEffects: true }
      }
    });

    await service.reviewFlowAdaptation({ projectId: project.id, flowId: flow.flowId, adaptationId, action: "approve", actorId: "reviewer" });
    await service.reviewFlowAdaptation({ projectId: project.id, flowId: flow.flowId, adaptationId, action: "apply", actorId: "reviewer" });
    const appliedGraph = await service.getFlow(project.id, subflow.graphFlowId!);
    expect(appliedGraph.nodes.find((node) => node.id === "divide")?.parameterValues?.target).toEqual(target);
  });

  it("rejects multiple patches from an explicit diagnose_and_adapt grant without persisting proposals", async () => {
    const service = createService({
      dataDir: tempRoot,
      seedFixture: false,
      llmProviderResolver: () => ({
        provider: {
          metadata: { provider: "mock", model: "multi-patch-model" },
          runTask: async (request) => request.taskKind === "runtime_patch"
            ? {
              response: {
                kind: "runtime_patch",
                summary: "Two competing target proposals.",
                riskLevel: "high",
                patches: [
                  { kind: "temporary_target_override", targetNodeId: "divide", target: { handles: { control: "first" } }, reason: "First candidate." },
                  { kind: "temporary_target_override", targetNodeId: "divide", target: { handles: { control: "second" } }, reason: "Second candidate." }
                ]
              },
              usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30, estimatedCostUsd: 0.004 }
            }
            : {
              response: { kind: "diagnosis", summary: "The action target no longer resolves." },
              usage: { inputTokens: 8, outputTokens: 4, totalTokens: 12, estimatedCostUsd: 0.001 }
            }
        },
        maxCallsPerRun: 2
      })
    });
    const project = await service.createProject({ name: "Multiple target proposals" });
    const flow = await createFailingCanonicalFlow(service, project.id, { flowId: "flow.multiple-target-proposals", metadata: adaptiveTrainingMetadata() });
    const subflowSummary = (await service.listFlowSubflowSummaries({ projectId: project.id, flowId: flow.flowId })).subflows[0]!;
    const subflow = (await service.getFlowSubflow(project.id, flow.flowId, subflowSummary.subflowId))!;
    const graphBefore = await service.getFlow(project.id, subflow.graphFlowId!);

    const run = await service.runRuntimeSession({
      projectId: project.id,
      flowId: flow.flowId,
      inputs: { numerator: 1, denominator: 0 },
      llmExecution: { grantId: "llm-grant:multiple-targets", actorUserId: "user.test", actorSessionId: "session.test", purpose: "diagnose_and_adapt" }
    });
    const detail = await service.getFlowRunDetail(project.id, run.runId);

    expect(detail?.metadata?.runtimePatchAttempts).toEqual([expect.objectContaining({
      kind: "runtime_patch_response",
      proposalOnly: true,
      executed: false,
      preflightOk: false,
      traceStatus: "not-run",
      issues: ["diagnose_and_adapt requires exactly one runtime patch."]
    })]);
    expect(detail?.adaptationIds).toEqual([]);
    expect(detail?.changeProposalIds).toEqual([]);
    expect(await service.getFlow(project.id, subflow.graphFlowId!)).toEqual(graphBefore);
  });
});
