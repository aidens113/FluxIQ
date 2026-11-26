// @fluxiq-test-group real-sql
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { AutomationStudioService } from "../../../index.ts";
import type { AutomationStudioLlmEvidenceRuntimeBinding } from "../../../../../runtime/llm/index.ts";
import { blankFixture, caller, expectNoTopology, isJudgeRequest, judgeReply, mockProvider, permissionScopedNativeRuntime, rejectedGenerationDiagnostic } from "../../service-bootstrap/index.ts";

// A build's purse is dollars, never a count of calls (t1056). The test-scoped call limit this once read
// (`FLUXIQ_LLM_BUILD_CALL_LIMIT`) is stubbed at three and read by nothing: the build runs past it and its purse ends it.
it("bounds a fresh service build's reader, decisions and judges by its purse before sends and preserves failed aggregate", async () => {
  vi.stubEnv("FLUXIQ_LLM_BUILD_CALL_LIMIT_SCOPE", "test");
  vi.stubEnv("FLUXIQ_LLM_BUILD_CALL_LIMIT", "3");
  let calls = 0;
  let decisions = 0;
  // Two cents a call: the build's 25-cent purse holds about a dozen.
  const usage = { inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCostUsd: 0.02 };
  const provider = mockProvider(async (request) => {
    calls += 1;
    if (request.metadata?.source === "instructionAuthority") return { response: { kind: "evidence_tool_decision", decision: { kind: "complete", result: { instructed: [] } } }, usage };
    if (isJudgeRequest(request)) return judgeReply("no");
    decisions += 1;
    return { response: { kind: "evidence_tool_decision", decision: { kind: "tool_call", callId: `read-${decisions}`, toolId: "core.run_node", input: { node: "example.click", parameters: { attempt: decisions }, consequences: [] }, add: true } }, usage };
  });
  const binding: AutomationStudioLlmEvidenceRuntimeBinding = {
    domainId: "example", deniedEvidenceKeys: [], runsNodes: {},
    tools: [{ toolId: "example.look", description: "Look.", inputSchema: { type: "object" }, effect: "observe", initialObservation: { input: {} } }],
    executeTool: async ({ toolId, value }) => toolId === "example.look"
      ? { kind: "llm_evidence_tool_execution", evidence: { looked: true }, effectApplied: false }
      : { kind: "llm_evidence_tool_execution", evidence: { read: true }, effectApplied: true,
          draft: { actionId: "example.click", input: value, ranWith: value, effect: "observe", proposes: true,
            replay: { from: { state: "initial" } } } }
  };
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-build-calls-"));
  const service = new AutomationStudioService({ dataDir, llmProviderResolver: () => ({ provider }), llmEvidenceRuntime: binding });
  try {
    service.bindNativeNodeRuntime(permissionScopedNativeRuntime([]));
    const { project, flow } = await blankFixture(service, "active", "example");
    const diagnostic = await rejectedGenerationDiagnostic(service.generateFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, evidenceGuided: true, caller: caller() }));
    expect(calls).toBeGreaterThan(3);
    expect(diagnostic.totalProviderCallCount).toBe(calls);
    expect(diagnostic.ending?.bound).toBe("cost");
    expect(diagnostic.evidenceLoop?.decisionCount).toBeLessThanOrEqual(calls);
    await expectNoTopology(service, project.id, flow.flowId);
  } finally {
    await service.close();
    await rm(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
    vi.unstubAllEnvs();
  }
}, 60_000);
