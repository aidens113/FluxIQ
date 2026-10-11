// The result check draws on the Flow's one purse in a Lab-scoped run (t438).
// The user's words (2026-10-01): "bring the ceiling down to $0.1 per flow max";
// the judge counts against it like the build and the repairs.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowInstruction } from "../../../model/index.ts";
import { AutomationStudioLlmBuildPurse, automationStudioLlmFlowPurseScope } from "../../llm/build-purse/index.ts";
import type { AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest } from "../../llm/index.ts";
import { RUN_MUW60J7C_REQUEST, RUN_MUW60J7C_RESULT_JUDGE, runMuw60j7cRunSummary } from "../request-rows/tests/run-muw60j7c.ts";
import { verifyAutomationStudioRunResult } from "../verify.ts";

const instruction: AutomationStudioFlowInstruction = {
  schemaVersion: "0.1", instructionId: "instruction.flow.goal", title: "Evidence-guided generation goal", body: RUN_MUW60J7C_REQUEST,
  scope: { kind: "flow", projectId: "project-1", flowId: "flow-1" }, priority: 1, status: "active", requirement: "required", createdAt: 1, updatedAt: 1
};

/** A judge that prices each call at a cent and reports costing `costUsd`. */
function judge(costUsd: number): { provider: AutomationStudioLlmProvider; seen: AutomationStudioLlmTaskRequest[] } {
  const seen: AutomationStudioLlmTaskRequest[] = [];
  const provider: AutomationStudioLlmProvider = {
    metadata: { provider: "mock", model: "debug-model" },
    estimateCostUsd: () => 0.01,
    runTask: async (request: AutomationStudioLlmTaskRequest) => {
      seen.push(request);
      return { response: { kind: "diagnosis", summary: RUN_MUW60J7C_RESULT_JUDGE.summary, diagnosis: RUN_MUW60J7C_RESULT_JUDGE.diagnosis }, usage: { inputTokens: 900, outputTokens: 60, totalTokens: 960, estimatedCostUsd: costUsd } } as Awaited<ReturnType<AutomationStudioLlmProvider["runTask"]>>;
    }
  };
  return { provider, seen };
}

const check = async (provider: AutomationStudioLlmProvider) => await verifyAutomationStudioRunResult({ projectId: "project-1", flowId: "flow-1", runId: "run-1", summary: runMuw60j7cRunSummary(), instructions: [instruction], deniedEvidenceKeys: [], provider });

describe("the result check under the Flow's one purse", () => {
  it("is charged to the Flow's purse", async () => {
    const charged: number[] = [];
    const flow = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1, carriedUsd: 0.05, onSettled: (usd) => charged.push(usd) });
    const { provider, seen } = judge(0.002);
    const report = await automationStudioLlmFlowPurseScope(flow, async () => await check(provider));
    expect(report.outcome.performed).toBe(true);
    expect(seen.length).toBeGreaterThan(0);
    expect(charged.reduce((sum, usd) => sum + usd, 0)).toBeCloseTo(0.002 * seen.length, 9);
  });

  it("asks no model once the Flow has spent its ceiling, and says the result was never judged", async () => {
    const flow = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1, carriedUsd: 0.1 });
    const { provider, seen } = judge(0.002);
    const report = await automationStudioLlmFlowPurseScope(flow, async () => await check(provider));
    expect(seen).toHaveLength(0);
    expect(report.outcome).toMatchObject({ verdict: "unsure", basis: "model_unavailable", code: "core.result.verdict_unavailable" });
    expect(report.outcome.reason).toContain("would have gone past its spending or size limit");
  });
});
