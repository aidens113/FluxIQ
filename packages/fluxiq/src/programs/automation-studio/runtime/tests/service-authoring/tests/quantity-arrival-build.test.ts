import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import type { AutomationStudioLlmEvidenceRuntimeBinding, AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../native-node-runtime.ts";
import { AutomationStudioService } from "../../../service.ts";
import { blankFixture, caller, isJudgeRequest, judgeReply, mockProvider } from "../../service-bootstrap/index.ts";

it("carries declared arrival identity into the real model checklist and build judge", async () => {
  const start = "warehouse-A";
  const arrive = "domain.example.arrive";
  const increment = "domain.example.increment";
  const requests: AutomationStudioLlmTaskRequest[] = [];
  const decisions: JsonObject[] = [
    { kind: "tool_call", callId: "increment", toolId: "core.run_node", input: { node: increment, parameters: { destination: start, amount: 2 }, consequences: [] }, add: true, act: "a1.quantity" },
    { kind: "complete", result: { summary: "Set the requested quantity." } }
  ];
  const usage = { inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCostUsd: 0.001 };
  const provider = mockProvider(async (request) => {
    if (request.metadata?.source === "instructionAuthority") return { response: { kind: "evidence_tool_decision", decision: { kind: "complete", result: { instructed: [] } } }, usage };
    requests.push(request);
    if (isJudgeRequest(request)) return judgeReply("yes");
    const decision = decisions.shift();
    if (!decision) throw new Error("Unexpected additional model decision");
    return { response: { kind: "evidence_tool_decision", summary: "Build.", decision }, usage };
  });
  const binding: AutomationStudioLlmEvidenceRuntimeBinding = {
    domainId: "example", deniedEvidenceKeys: [], tools: [{ toolId: "example.look", description: "Look at state.", inputSchema: { type: "object" }, effect: "observe", initialObservation: { input: {} } }], runsNodes: { arrival: { node: arrive, parameter: "destination" } },
    executeTool: async ({ value, toolId }) => {
      if (toolId === "example.look") return { kind: "llm_evidence_tool_execution", evidence: { location: start }, effectApplied: false };
      if (value.replay) return { kind: "llm_evidence_tool_execution", evidence: { succeeded: true }, effectApplied: true, resultCode: "core.replay.replayed" };
      return { kind: "llm_evidence_tool_execution", evidence: { succeeded: true }, effectApplied: true,
        draft: { actionId: String(value.node), input: value, ranWith: value, effect: "mutate", proposes: true, replay: { from: { location: start } } } };
    }
  };
  const runtime = new AutomationStudioNativeNodeRuntime({ permissions: [], runtimeCapabilities: ["example.actions"] }).register({
    schemaVersion: "0.1", sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, packageId: "example.package", packageVersion: "1.0.0", domainId: "example",
    nodes: [arrive, increment].map((id): AutomationStudioNodeDefinition => ({ schemaVersion: "0.1", id, version: "1.0.0", label: id, description: "Synthetic action.", category: "action",
      source: { kind: "importer", domainId: "example", packageId: "example.package", implementationKey: id }, availability: { kind: "domain", domainId: "example" },
      requiredRuntimeCapabilities: ["example.actions"], capabilities: { executable: true, codeBacked: true },
      inputs: [{ id: "in", label: "In", valueType: "any", required: false }], outputs: [{ id: "success", label: "Success", valueType: "any" }],
      parameters: [{ id: "destination", label: "Destination", valueType: "string", required: false }, { id: "amount", label: "Amount", valueType: "number", required: false }], outputAction: { fixedOutputId: id } }))
  }, { packageId: "example.package", packageVersion: "1.0.0", implementations: Object.fromEntries([arrive, increment].map((id) => [id, () => ({ status: "success", route: "success", outputs: { success: true } })])) });
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-arrival-proof-"));
  const service = new AutomationStudioService({ dataDir, llmProviderResolver: (() => ({ provider, maxCallsPerRun: 12, maxEstimatedCostUsd: 0.1 })) as never, llmEvidenceRuntime: binding });
  try {
    service.bindNativeNodeRuntime(runtime);
    const { project, flow } = await blankFixture(service, "active", "example");
    const instruction = await service.getFlowInstruction(project.id, "instruction.build");
    await service.saveFlowInstruction(project.id, { ...instruction!, body: "Put two of the paper towels in my cart.", updatedAt: Date.now() });
    const result = await service.generateFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, evidenceGuided: true, startLocation: start, caller: caller() });
    expect(result.status).toBe("proposed");
    const model = requests.filter((request) => !isJudgeRequest(request)).at(-1)!;
    const judges = requests.filter(isJudgeRequest);
    expect(judges.length).toBeGreaterThan(0);
    expect(quantityEntries(model).length).toBeGreaterThan(0);
    expect(quantityEntries(model).every((item) => typeof item.done === "number")).toBe(true);
    expect(JSON.stringify(model).includes("step_only_arrives")).toBe(false);
    expect(JSON.stringify(judges).includes("step_only_arrives")).toBe(false);
    expect(quantityEntries(judges).length).toBeGreaterThan(0);
    expect(quantityEntries(judges).every((item) => typeof item.done === "number")).toBe(true);
  } finally {
    await service.close();
    await rm(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
  }
}, 60_000);




/** Only the synthetic quantity checklist entries, so assertions never print a request. */
function quantityEntries(value: unknown): Record<string, unknown>[] {
  if (typeof value !== "object" || value === null) return [];
  const record = value as Record<string, unknown>;
  if (record.id === "a1.quantity") return [record];
  return Object.values(record).flatMap(quantityEntries);
}
