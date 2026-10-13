import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowInstruction } from "../../../../model/index.ts";
import type { AutomationStudioLlmProvider } from "../../../llm/index.ts";
import { REQUEST_WORDS_REQUEST_TWO_EXCLUSIONS, requestWordsRunSummary } from "../../request-rows/tests/request-words-fixture.ts";
import { automationStudioBuildTestJudge } from "../judge.ts";

const instruction: AutomationStudioFlowInstruction = {
  schemaVersion: "0.1", instructionId: "task", title: "Collect the catalogue", body: REQUEST_WORDS_REQUEST_TWO_EXCLUSIONS,
  scope: { kind: "flow", projectId: "project", flowId: "flow" }, priority: 1, status: "active", requirement: "required", createdAt: 1, updatedAt: 1
};

describe("a build judge's persistently deficient affirmative explanation", () => {
  it("is not judged rather than a graph refutation, and every bounded ask is charged", async () => {
    let calls = 0;
    const provider: AutomationStudioLlmProvider = {
      metadata: { provider: "mock", model: "debug-model" },
      runTask: async () => {
        calls += 1;
        return {
          response: {
            kind: "diagnosis", summary: "Checked.",
            diagnosis: { answersRequest: "yes", observed: "Copper Garden Tools Pair is excluded. Replacement Handle for Garden Tools is excluded.", patchNeeded: false }
          },
          usage: { inputTokens: 900, outputTokens: 60, totalTokens: 960, estimatedCostUsd: 0.001 }
        };
      }
    };
    const judged = await automationStudioBuildTestJudge({ instructions: [instruction], deniedEvidenceKeys: [], projectId: "project", flowId: "flow", provider })({ summary: requestWordsRunSummary(), budget: { maxCostUsd: 0.2 } });
    expect(judged).toMatchObject({ verdict: "not_judged", spent: { calls: 4, estimatedCostUsd: 0.004 } });
    expect(calls).toBe(4);
    expect(judged).not.toHaveProperty("fix");
  });
});
