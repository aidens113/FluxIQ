// A run's llmCallMs and judgeMs (W3, t899) govern the Flow-less judge: each model call's timeout and the whole check's deadline.
import { describe, expect, it } from "vitest";
import { runAutomationStudioLlmHarness, type AutomationStudioLlmProvider, type AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import { runWithAutomationStudioRunOverrides } from "../../../run-overrides/index.ts";
import { automationStudioFlowLessJudge } from "../judge.ts";
import type { AutomationStudioFlowLessSummary } from "../types.ts";

const SUMMARY = { instructions: "Book the hall for the choir.", acts: [], witnesses: [] } as unknown as AutomationStudioFlowLessSummary;

function hanging(timeouts: number[] = []): AutomationStudioLlmProvider {
  return {
    metadata: { provider: "mock", model: "debug-model" },
    estimateCostUsd: () => 0.001,
    runTask: (request: AutomationStudioLlmTaskRequest) => {
      timeouts.push(request.timeoutMs);
      return new Promise(() => {});
    }
  };
}

const judge = (provider: AutomationStudioLlmProvider, extra: { timeoutMs?: number; deadlineMs?: number } = {}) => automationStudioFlowLessJudge({
  summary: SUMMARY, provider, run: runAutomationStudioLlmHarness, projectId: "project-1", flowId: "flow-1", deniedEvidenceKeys: [], ...extra
});

describe("the judge under a run's deadlines", () => {
  it("is cut off at the run's judgeMs, saying it was not judged", async () => {
    const started = Date.now();
    const result = await runWithAutomationStudioRunOverrides({ deadlines: { judgeMs: 60 } }, () => judge(hanging()));
    expect(result.verdict).toBe("not_judged");
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it("asks its model call under the run's llmCallMs", async () => {
    const timeouts: number[] = [];
    await runWithAutomationStudioRunOverrides({ deadlines: { llmCallMs: 9_000, judgeMs: 60 } }, () => judge(hanging(timeouts), { timeoutMs: 20_000 }));
    expect(timeouts).toEqual([9_000]);
  });

  it("lets a caller's own deadlineMs win over the run's judgeMs", async () => {
    const started = Date.now();
    await runWithAutomationStudioRunOverrides({ deadlines: { judgeMs: 600_000 } }, () => judge(hanging(), { deadlineMs: 50 }));
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it("is today's call timeout without a frame", async () => {
    const timeouts: number[] = [];
    await judge(hanging(timeouts), { timeoutMs: 15_000, deadlineMs: 40 });
    expect(timeouts).toEqual([15_000]);
  });

  it("gives two concurrent runs their own judgeMs", async () => {
    const order: string[] = [];
    const slow = runWithAutomationStudioRunOverrides({ deadlines: { judgeMs: 400 } }, () => judge(hanging())).then(() => order.push("slow"));
    const quick = runWithAutomationStudioRunOverrides({ deadlines: { judgeMs: 30 } }, () => judge(hanging())).then(() => order.push("quick"));
    await Promise.all([slow, quick]);
    expect(order).toEqual(["quick", "slow"]);
  });
});
