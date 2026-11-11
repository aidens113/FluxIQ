// A call is built to the window of the model that serves it (W3, t899): a role's provider says its model's token
// limits, as its resolution gave them, and the harness holds the request to those in place of the caller's. A call
// served by the explore model is built exactly as before.
import { describe, expect, it } from "vitest";
import { runWithAutomationStudioRunOverrides } from "../../../run-overrides/index.ts";
import type { AutomationStudioRunResultSummary } from "../../../result-verification/index.ts";
import { automationStudioLlmProviderWithDomainInstructions } from "../../domain-instructions/index.ts";
import {
  automationStudioLlmProviderWithTokenLimits,
  automationStudioLlmServedTokenLimits,
  runAutomationStudioLlmHarness,
  type AutomationStudioLlmHarnessInput,
  type AutomationStudioLlmProvider,
  type AutomationStudioLlmTaskRequest,
  type AutomationStudioLlmTaskResult
} from "../../harness/index.ts";
import type { AutomationStudioLlmProviderResolverInput } from "../../resolver-contract.ts";
import { automationStudioLlmProviderRoutedByRole, automationStudioLlmRoleRoutedResolution } from "../index.ts";

const CALLER = { maxInputTokens: 900_000, maxOutputTokens: 8_000, maxTotalTokens: 908_000 };
const SMALL = { maxInputTokens: 3_000, maxOutputTokens: 1_000, maxTotalTokens: 4_000 };
const REPLY = { kind: "diagnosis", summary: "Judged.", diagnosis: { answersRequest: "unknown", observed: "No seat is shown." } };

function model(name: string, seen: AutomationStudioLlmTaskRequest[]): AutomationStudioLlmProvider {
  return {
    metadata: { provider: "mock", model: name },
    runTask: async (request) => {
      seen.push(request);
      return { response: REPLY, usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20, estimatedCostUsd: 0.000_01 } };
    }
  };
}

/** A result summary of about 20,000 tokens by Core's measure, and a shorter form of it that says so. */
const LARGE_SUMMARY = { schemaVersion: "automation-studio.run-result-summary.v1", recordSets: [], view: "a reading room seat plan ".repeat(2_500) } as unknown as AutomationStudioRunResultSummary;
const SHORTER = { schemaVersion: "automation-studio.run-result-summary.v1", recordSets: [], view: { "core.summarised": { item: "view", kind: "text", characters: 62_500 } } } as unknown as AutomationStudioRunResultSummary;

function harness(input: Partial<AutomationStudioLlmHarnessInput>): Promise<AutomationStudioLlmTaskResult> {
  return runAutomationStudioLlmHarness({ taskKind: "instruction_suggestion", projectId: "project.room", flowId: "flow.desk", requestId: "request.1", instructions: [], tokenLimits: CALLER, ...input });
}

describe("a request's limits", () => {
  it("are the judging model's own where its provider says them, and the request is refused by the harness, not the adapter, when over them", async () => {
    const seen: AutomationStudioLlmTaskRequest[] = [];
    const provider = automationStudioLlmProviderRoutedByRole({ explore: model("explorer", []), judge: automationStudioLlmProviderWithTokenLimits(model("judge", seen), SMALL) });

    const fitting = await harness({ provider, taskKind: "loop_verification", resultSummary: SHORTER });
    expect(fitting.ok, JSON.stringify(fitting.diagnostics)).toBe(true);
    expect(fitting.request.tokenLimits).toEqual(SMALL);
    expect(fitting.request.context.instructions.tokenBudget).toBe(SMALL.maxInputTokens);

    const over = await harness({ provider, taskKind: "loop_verification", resultSummary: LARGE_SUMMARY });
    expect(over.providerInvocation).toBe("not_attempted");
    expect(over.diagnostics.map((diagnostic) => diagnostic.code)).toContain("llm_budget.input_limit_exceeded");
    expect(over.diagnostics.find((diagnostic) => diagnostic.code === "llm_budget.input_limit_exceeded")?.metadata).toMatchObject({ maxInputTokens: SMALL.maxInputTokens, maxTotalTokens: SMALL.maxTotalTokens });
    expect(seen).toHaveLength(1);
  });

  it("reach the harness through a decorator that re-applies itself to the provider that serves", async () => {
    const seen: AutomationStudioLlmTaskRequest[] = [];
    const routed = automationStudioLlmProviderRoutedByRole({ explore: model("explorer", []), judge: automationStudioLlmProviderWithTokenLimits(model("judge", seen), SMALL) });
    const decorated = automationStudioLlmProviderWithDomainInstructions(routed, { domainId: "domain.room", version: "1", text: "Rooms have desks." });

    const result = await harness({ provider: decorated, taskKind: "loop_verification", resultSummary: SHORTER });

    expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
    expect(seen[0]?.tokenLimits).toEqual(SMALL);
  });

  it("are the caller's, and the request exactly as before, for a call the explore model serves", async () => {
    const routedSeen: AutomationStudioLlmTaskRequest[] = [];
    const plainSeen: AutomationStudioLlmTaskRequest[] = [];
    const routed = automationStudioLlmProviderRoutedByRole({ explore: model("explorer", routedSeen), judge: automationStudioLlmProviderWithTokenLimits(model("judge", []), SMALL) });

    await harness({ provider: routed });
    await harness({ provider: model("explorer", plainSeen) });

    expect(routedSeen[0]?.tokenLimits).toEqual(CALLER);
    expect(JSON.stringify(routedSeen[0])).toBe(JSON.stringify(plainSeen[0]));
  });
});

describe("a result summary too large for the serving model's window", () => {
  it("is sent in the first shorter form its caller wrote that fits, and whole wherever it fits", async () => {
    const seen: AutomationStudioLlmTaskRequest[] = [];
    const judge = automationStudioLlmProviderWithTokenLimits(model("judge", seen), SMALL);

    const shortened = await harness({ provider: judge, taskKind: "loop_verification", resultSummary: LARGE_SUMMARY, resultSummaryFitting: [LARGE_SUMMARY, SHORTER] });
    expect(shortened.ok, JSON.stringify(shortened.diagnostics)).toBe(true);
    expect(seen[0]?.context.resultSummary).toEqual(SHORTER);

    const roomy = automationStudioLlmProviderWithTokenLimits(model("roomy", seen), CALLER);
    await harness({ provider: roomy, taskKind: "loop_verification", resultSummary: LARGE_SUMMARY, resultSummaryFitting: [SHORTER] });
    expect(seen[1]?.context.resultSummary).toEqual(LARGE_SUMMARY);
  });

  it("is refused by size with its shortest form where none fits, and nothing is cut", async () => {
    const seen: AutomationStudioLlmTaskRequest[] = [];
    const tiny = automationStudioLlmProviderWithTokenLimits(model("tiny", seen), { maxInputTokens: 100, maxOutputTokens: 100, maxTotalTokens: 200 });

    const result = await harness({ provider: tiny, taskKind: "loop_verification", resultSummary: LARGE_SUMMARY, resultSummaryFitting: [SHORTER] });

    expect(result.providerInvocation).toBe("not_attempted");
    expect(result.request.context.resultSummary).toEqual(SHORTER);
    expect(seen).toHaveLength(0);
  });
});

describe("a role resolved with limits of its own", () => {
  it("serves with them, and the explore model's calls keep the attempt's", async () => {
    const resolver = async (input: AutomationStudioLlmProviderResolverInput) => ({
      provider: model(input.modelId ?? "default-model", []),
      tokenLimits: input.modelId === "judge-model" ? SMALL : CALLER
    });
    const request = (taskKind: string) => ({ requestId: "r", taskKind, context: {} }) as unknown as AutomationStudioLlmTaskRequest;
    const resolution = await runWithAutomationStudioRunOverrides({ models: { judge: "judge-model" } }, async () => await automationStudioLlmRoleRoutedResolution(resolver, { projectId: "p", flowId: "f", modelId: "explorer" }));

    expect(resolution?.tokenLimits).toEqual(CALLER);
    expect(automationStudioLlmServedTokenLimits(resolution?.provider.servedBy?.(request("loop_verification")))).toEqual(SMALL);
    expect(resolution?.provider.servedBy?.(request("loop_verification")).metadata).toMatchObject({ provider: "mock", model: "judge-model" });
    expect(automationStudioLlmServedTokenLimits(resolution?.provider.servedBy?.(request("evidence_tool_decision")))).toBeUndefined();
  });
});
