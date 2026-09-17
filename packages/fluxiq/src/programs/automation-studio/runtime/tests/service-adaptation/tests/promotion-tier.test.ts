import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AutomationStudioFlowAdaptation, AutomationStudioFlowAdaptationValidationResult } from "../../../../model/index.ts";
import { AutomationStudioService, type AutomationStudioRuntimeAdaptationContext } from "../../../service.ts";
import { adaptiveTrainingMetadata, installPrimaryRouter } from "../../service-fixtures.ts";

// The service promotes a runtime adaptation by the confidence tier its saved
// trials and replays earn, and records that tier with its decision. A success
// followed by a failure is contradicted, and a change with no succeeded trial is
// never promoted automatically, however many replays it lists.

type Promoting = {
  maybePromoteRuntimeAdaptation(input: { adaptation: AutomationStudioFlowAdaptation; context: AutomationStudioRuntimeAdaptationContext }): Promise<AutomationStudioFlowAdaptation>;
};

let tempRoot: string;
const services = new Set<AutomationStudioService>();

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-promotion-tier-"));
});

afterEach(async () => {
  await Promise.all([...services].map((service) => service.close()));
  services.clear();
  await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

function result(runId: string, checkedAt: number, status: "succeeded" | "failed", kind?: "trial" | "replay"): AutomationStudioFlowAdaptationValidationResult {
  return { runId, status, checkedAt, ...(kind ? { kind } : {}) };
}

async function promoteWith(adaptationId: string, validationResults: AutomationStudioFlowAdaptationValidationResult[]) {
  const service = new AutomationStudioService({ dataDir: tempRoot, seedFixture: false });
  services.add(service);
  const project = await service.createProject({ name: `Promotion ${adaptationId}` });
  const created = await service.createFlow({ projectId: project.id, flowId: "flow.promotion-tier", name: "Promotion tier" });
  const flow = await service.saveFlow({ projectId: project.id, flow: { ...created, metadata: { ...(created.metadata ?? {}), ...adaptiveTrainingMetadata() } } });
  const primary = await installPrimaryRouter(service, project.id, flow.flowId, {
    nodes: [{ id: "expect.ready", definitionId: "builtin.policy.expectation", parameterValues: { timeoutMs: 100 } }],
    edges: []
  });
  const adaptation = await service.saveFlowAdaptation({
    schemaVersion: "0.1",
    adaptationId,
    flowId: flow.flowId,
    subflowId: primary.subflow.subflowId,
    projectId: project.id,
    trigger: "Expected state changed",
    patch: [{ kind: "edit_expectation", targetId: "expect.ready", summary: "Wait for ready state.", after: { timeoutMs: 500, retryCount: 3 } }],
    validationResults,
    status: "validated",
    author: "runtime",
    riskLevel: "low",
    createdAt: 10,
    updatedAt: 10
  });
  const context = await service.resolveRuntimeAdaptationContext({ projectId: project.id, flow });
  expect(context.behavior.promoteAdaptations).toBe(true);
  return await (service as unknown as Promoting).maybePromoteRuntimeAdaptation({ adaptation, context });
}

describe("the service's runtime adaptation promotion", () => {
  it("applies a change whose trial succeeded, and records its tier", async () => {
    const promoted = await promoteWith("adaptation.trial", [result("run.1", 20, "succeeded")]);

    expect(promoted).toMatchObject({
      status: "applied",
      metadata: {
        approvalDecision: { autoApply: true, confidence: "provisional", validationStatus: "validated" },
        confidence: "provisional"
      }
    });
    expect(promoted.metadata).not.toHaveProperty("confidenceScore");
  });

  it("sends a change whose latest replay failed to a person", async () => {
    const promoted = await promoteWith("adaptation.contradicted", [result("run.1", 20, "succeeded", "trial"), result("run.2", 30, "failed", "replay")]);

    expect(promoted.status).toBe("validated");
    expect(promoted.metadata?.approvalDecision).toEqual(expect.objectContaining({
      autoApply: false,
      requiresManualApproval: true,
      reason: "Its latest replay failed, so the change is not promoted until a new trial succeeds.",
      confidence: "unverified",
      validationStatus: "unvalidated"
    }));
    expect(promoted.metadata?.approvalDecision).not.toHaveProperty("autoApplyFailed");
  });

  it("never applies a change with no succeeded trial, however many replays it lists", async () => {
    const promoted = await promoteWith("adaptation.replays", [
      result("run.1", 20, "succeeded", "replay"),
      result("run.2", 30, "succeeded", "replay"),
      result("run.3", 40, "succeeded", "replay")
    ]);

    expect(promoted.status).toBe("validated");
    expect(promoted.metadata?.approvalDecision).toEqual(expect.objectContaining({
      autoApply: false,
      requiresManualApproval: true,
      reason: "A change with no succeeded trial is never promoted automatically.",
      confidence: "established"
    }));
  });
});
