// A build's judge runs under the build's own per-call timeout, the one its
// decisions get from the resolved provider (t473; live run
// `run-mv5q4j5c-49bfb5e2` cut a judge off at the harness's 20 s default).
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowInstruction } from "../../../../model/index.ts";
import { AUTOMATION_STUDIO_LLM_DEFAULT_TIMEOUT_MS, type AutomationStudioLlmProvider, type AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import { automationStudioFlowBootstrapBuildJudge } from "../build-judge.ts";

const ASKS = "Read the price of every product on the page.";
const instruction: AutomationStudioFlowInstruction = {
  schemaVersion: "0.1", instructionId: "instruction.flow.goal", title: "Goal", body: ASKS,
  scope: { kind: "flow", projectId: "project.1", flowId: "flow.1" }, priority: 1, status: "active", requirement: "required", createdAt: 1, updatedAt: 1
};

function scripted(): { provider: AutomationStudioLlmProvider; seen: AutomationStudioLlmTaskRequest[] } {
  const seen: AutomationStudioLlmTaskRequest[] = [];
  return {
    seen,
    provider: {
      metadata: { provider: "mock", model: "debug-model" },
      runTask: async (request: AutomationStudioLlmTaskRequest) => {
        seen.push(request);
        return { response: { kind: "diagnosis", summary: "Judged.", diagnosis: { answersRequest: "no", observed: "No step reads a price." } }, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUsd: 0 } };
      }
    }
  };
}

const judged = async (timeoutMs?: number) => {
  const { provider, seen } = scripted();
  const judge = automationStudioFlowBootstrapBuildJudge({ provider, ...(timeoutMs !== undefined ? { timeoutMs } : {}), instructions: [instruction], deniedEvidenceKeys: ["html"], projectId: "project.1", flowId: "flow.1", instructionText: ASKS, plan: () => undefined });
  judge.roundStarted();
  const asked: Parameters<typeof judge.judge>[0] = {
    round: 1,
    loop: { ok: true, result: { summary: "Read." }, trace: [], steps: [], accounting: { iterations: 1, toolCalls: 0, evidenceBytes: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 } },
    budget: { maxCostUsd: 1 }
  };
  await judge.judge(asked);
  return seen;
};

describe("a build's judge and the build's per-call timeout", () => {
  it("sends every judge call with the timeout the build's decisions run under", async () => {
    const seen = await judged(45_000);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((request) => request.timeoutMs === 45_000)).toBe(true);
  });

  it("without one, falls to the harness default the live run's judge was cut off at", async () => {
    const seen = await judged();
    expect(seen[0]?.timeoutMs).toBe(AUTOMATION_STUDIO_LLM_DEFAULT_TIMEOUT_MS);
  });
});
