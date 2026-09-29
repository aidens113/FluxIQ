// A build that runs out keeps its draft, and the next build of the Flow
// continues from it -- through the real `generateFlowBootstrapAdaptation`,
// because all of it is wiring: the service used to drop the loop's steps on
// the floor the moment a build ran out (`run-mum0ke7z-940cbd27`, bigbox-retail,
// 34 decisions and a twelve-step draft, nothing written).
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import { AutomationStudioService } from "../../../service.ts";
import { AutomationStudioFlowBootstrapIncompleteDraftStore, AutomationStudioFlowPaths, AutomationStudioProjectPaths, type AutomationStudioProjectStore } from "../../../service/index.ts";
import { blankFixture, expectNoTopology, grant, mockProvider, plan, rejectedGenerationDiagnostic } from "./fixtures.ts";

let tempRoot: string;
const services = new Set<AutomationStudioService>();

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-bootstrap-incomplete-"));
});

afterEach(async () => {
  await Promise.all([...services].map((instance) => instance.close()));
  services.clear();
  await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

/** What the service's own store holds for the Flow, read as a fresh service would. */
async function storedDraft(projectId: string, flowId: string) {
  const projectPaths = new AutomationStudioProjectPaths(path.join(tempRoot, "programs", "automation-studio", "projects"));
  const projects = { findProject: async () => ({ id: projectId }), ensureProjectStructure: async () => undefined } as unknown as AutomationStudioProjectStore;
  return await new AutomationStudioFlowBootstrapIncompleteDraftStore(projectPaths, new AutomationStudioFlowPaths(projectPaths), projects).get(projectId, flowId);
}

describe("a Flow build that runs out, and the build after it", () => {
  it("keeps the proposable steps as an incomplete draft, reports the exhaustion truthfully, and the next build continues and clears it", async () => {
    // Undefined while the first build runs; the call at which the second began once it does.
    let continuedAt: number | undefined;
    let call = 0;
    const requests: AutomationStudioLlmTaskRequest[] = [];
    const provider = mockProvider(async (request) => {
      requests.push(request);
      call += 1;
      // The continuation takes one step of its own -- a build must gather before it may finish -- and then finishes.
      const decision: JsonObject = continuedAt !== undefined && call > continuedAt + 1
        ? { kind: "complete", result: { summary: "Built.", plan: plan() } }
        : { kind: "tool_call", callId: `call.${call}`, toolId: "example.act", input: { press: call } };
      return { response: { kind: "evidence_tool_decision", summary: "Step.", decision }, usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCostUsd: 0.001 } };
    });
    const instance = new AutomationStudioService({
      dataDir: tempRoot,
      llmProviderResolver: (() => ({ provider, maxCallsPerRun: 4, maxEstimatedCostUsd: 0.25, maxTotalEstimatedCostUsd: 2 })) as never,
      llmEvidenceRuntime: {
        domainId: "example",
        deniedEvidenceKeys: [],
        tools: [{ toolId: "example.act", description: "Change the target.", inputSchema: { type: "object" }, effect: "mutate" }],
        executeTool: async (input) => ({ kind: "llm_evidence_tool_execution", evidence: { changed: input.callId }, effectApplied: true, resultCode: "example.acted" })
      }
    });
    services.add(instance);
    const { project, flow } = await blankFixture(instance, "active", "example");

    // The first build never finishes.
    const diagnostic = await rejectedGenerationDiagnostic(instance.generateFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, evidenceGuided: true, executionGrant: await grant(instance, project.id, flow.flowId) }));
    expect(diagnostic.code).toBe("flow_bootstrap.evidence_iteration_limit");
    const kept = diagnostic.evidenceLoop?.incompleteDraft;
    expect(kept?.revision).toBe(1);
    expect(kept?.steps).toBeGreaterThan(0);
    const record = await storedDraft(project.id, flow.flowId);
    expect(record).toMatchObject({ status: "incomplete", revision: 1, flowId: flow.flowId });
    expect(record?.steps).toHaveLength(kept!.steps);
    expect(record?.steps.every((step) => step.actionId === "example.act" && step.callId === undefined)).toBe(true);
    // Never a Flow, never an adaptation.
    await expectNoTopology(instance, project.id, flow.flowId);
    await expect(instance.listFlowAdaptationSummaries({ projectId: project.id, flowId: flow.flowId })).resolves.toMatchObject({ total: 0 });

    // The next build starts from it, is told so, and finishes.
    continuedAt = call;
    const before = requests.length;
    const result = await instance.generateFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, evidenceGuided: true, executionGrant: await grant(instance, project.id, flow.flowId) });
    expect(result.status).toBe("proposed");
    const firstLook = requests[before]?.context.evidenceLoop?.evidence ?? [];
    expect(firstLook.find((entry) => entry.toolId === "core.resumed")?.value).toMatchObject({ code: "llm_evidence_loop.resumed", revision: 1, draftSteps: kept!.steps, proposableSteps: kept!.steps });
    // A Flow was proposed, so there is nothing left to continue.
    await expect(storedDraft(project.id, flow.flowId)).resolves.toBeUndefined();
  });
});
