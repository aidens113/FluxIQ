// Unreadable replies never escalate a judge, and standalone fallback keeps a continuing judge on its model.
import { describe, expect, it } from "vitest";
import type { AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest } from "../../harness/index.ts";
import type { AutomationStudioLlmProviderResolution, AutomationStudioLlmProviderResolverInput } from "../../resolver-contract.ts";
import { automationStudioLlmModelLadder, automationStudioLlmProviderRoutedByRole, automationStudioLlmRoleRoutedResolution, runWithAutomationStudioLlmModelLadder } from "../index.ts";

const judge = (metadata: Record<string, unknown> = {}) => ({ requestId: "r", taskKind: "loop_verification", context: {}, metadata }) as unknown as AutomationStudioLlmTaskRequest;
const decision = { requestId: "r", taskKind: "evidence_tool_decision", context: {} } as unknown as AutomationStudioLlmTaskRequest;

/** A host resolver on a Claude key: a provider bound to the model asked for. */
async function resolver(input: AutomationStudioLlmProviderResolverInput): Promise<AutomationStudioLlmProviderResolution> {
  const model = input.modelId ?? "claude-haiku-5-5";
  return { provider: { metadata: { provider: "anthropic", model }, runTask: async () => ({ model }) } as unknown as AutomationStudioLlmProvider };
}

describe("a judge retrying on the same model", () => {
  it("ignores obsolete judge climb metadata and keeps the starting model", async () => {
    const resolution = await automationStudioLlmRoleRoutedResolution(resolver, { projectId: "p", flowId: "f", modelId: "claude-haiku-5-5" });
    const served = (request: AutomationStudioLlmTaskRequest) => (resolution?.provider.servedBy?.(request) ?? resolution?.provider)?.metadata.model;
    const attempt = automationStudioLlmModelLadder();
    const seen = runWithAutomationStudioLlmModelLadder(attempt, () => [
      served(judge()), served(judge({ judgeRungsUp: 1 })), served(judge({ judgeRungsUp: 2 })), served(judge({ judgeRungsUp: 5 })),
      // A value that is not a whole number of rungs climbs nothing.
      served(judge({ judgeRungsUp: -1 })), served(judge({ judgeRungsUp: "1" })),
      served(decision), served(judge())
    ]);
    expect(seen).toEqual(Array(8).fill("claude-haiku-5-5"));
    expect(attempt.level).toBe(0);
  });

  it("keeps a continuing judge gone standalone on the decider's model", async () => {
    const resolution = await automationStudioLlmRoleRoutedResolution(resolver, { projectId: "p", flowId: "f", modelId: "claude-haiku-5-5" });
    const served = (request: AutomationStudioLlmTaskRequest) => (resolution?.provider.servedBy?.(request) ?? resolution?.provider)?.metadata.model;
    const attempt = automationStudioLlmModelLadder();
    const seen = runWithAutomationStudioLlmModelLadder(attempt, () => {
      served(decision);
      attempt.escalate({ reason: "loop_persisted" });
      return [served(judge({ continuesDecider: true })), served(judge({ judgeStandaloneAfterUnreadable: true })), served(judge({ judgeStandaloneAfterUnreadable: true, judgeRungsUp: 1 })), served(judge())];
    });
    // The decider climbed to Sonnet: all standalone retries stay there and other judges keep the base.
    expect(seen).toEqual(Array(4).fill("claude-haiku-5-5"));
  });

  it("uses its own provider without a ladder", () => {
    const explore = { metadata: { provider: "mock", model: "explore" }, runTask: async () => ({}) } as unknown as AutomationStudioLlmProvider;
    const own = { metadata: { provider: "mock", model: "judge" }, runTask: async () => ({}) } as unknown as AutomationStudioLlmProvider;
    const routed = automationStudioLlmProviderRoutedByRole({ explore, judge: own });
    expect(routed.servedBy?.(judge({ judgeRungsUp: 1 })).metadata.model).toBe("explore");
    expect(routed.servedBy?.(judge({ judgeStandaloneAfterUnreadable: true })).metadata.model).toBe("explore");
  });
});
