// Real provider resolution remains fixed across legacy escalation, roles and attempt restoration.
import { describe, expect, it } from "vitest";
import type { AutomationStudioLlmTaskRequest } from "../../harness/index.ts";
import { runWithAutomationStudioRunOverrides } from "../../../run-overrides/index.ts";
import { automationStudioLlmModelLadder, automationStudioLlmRoleRoutedResolution, runWithAutomationStudioLlmModelLadder, runWithAutomationStudioLlmModelRole } from "../index.ts";

const request = (taskKind: string, metadata = {}) => ({ requestId: "r", taskKind, context: {}, metadata }) as unknown as AutomationStudioLlmTaskRequest;

describe("fixed serving despite historical ladder configuration", () => {
  it.each(["claude-haiku-5-5", "claude-sonnet-5-5"])("keeps %s through repairs, judge continuation, legacy escalation and later attempts", async (modelId) => {
    const resolved: string[] = [];
    const sent: string[] = [];
    const provider = await runWithAutomationStudioRunOverrides({ models: { judge: "claude-opus-5-5", repair: "claude-opus-5-5" } }, () => automationStudioLlmRoleRoutedResolution(async (input) => {
      resolved.push(input.modelId!);
      return { provider: { metadata: { provider: "mock", model: input.modelId! }, runTask: async (_request: AutomationStudioLlmTaskRequest) => {
        sent.push(input.modelId!);
        return {};
      } } };
    }, { projectId: "p", flowId: "f", modelId }));
    const history = { base: modelId, escalations: [{ from: modelId, to: "claude-opus-5-5", reason: "model_decided" as const }] };
    for (const attempt of [automationStudioLlmModelLadder(), automationStudioLlmModelLadder(history)]) {
      await runWithAutomationStudioLlmModelLadder(attempt, async () => {
        attempt.serve([modelId, "claude-opus-5-5"]);
        attempt.escalate({ reason: "loop_persisted" });
        await provider!.provider.runTask(request("evidence_tool_decision"));
        await runWithAutomationStudioLlmModelRole("repair", () => provider!.provider.runTask(request("runtime_patch")));
        await provider!.provider.runTask(request("loop_verification", { continuesDecider: true }));
        await provider!.provider.runTask(request("loop_verification", { judgeStandaloneAfterUnreadable: true, judgeRungsUp: 100 }));
      });
      expect(attempt.level).toBe(0);
    }
    expect(resolved).toEqual([modelId]);
    expect(sent).toEqual(Array(8).fill(modelId));
  });
});
