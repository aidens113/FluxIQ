// The attempt's provider resolution with a run's model per role: asked exactly as before with no frame or no models,
// each other role's model resolved as the attempt starts, a model resolved once however many roles name it, and a role
// model that cannot be resolved failing as the attempt's own model would, with no fallback.
import { describe, expect, it } from "vitest";
import { runWithAutomationStudioRunOverrides, type AutomationStudioRunOverrides } from "../../../run-overrides/index.ts";
import type { AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest } from "../../harness/index.ts";
import type { AutomationStudioLlmProviderResolution, AutomationStudioLlmProviderResolverInput } from "../../resolver-contract.ts";
import { automationStudioLlmRoleRoutedResolution, automationStudioLlmRunJudgeModelId } from "../index.ts";

const BASE: AutomationStudioLlmProviderResolverInput = { projectId: "p", flowId: "f", modelId: "base-model", providerId: "mock", metadata: { llmModel: "flow-model" } };
const KNOWN = new Set(["base-model", "explorer", "judge-model", "repair-model", "default-model"]);
const request = (taskKind: string) => ({ requestId: "r", taskKind, context: {} }) as unknown as AutomationStudioLlmTaskRequest;

/** A resolver like the host's: a provider bound to the model asked for, its default when none, and a throw for an unknown id. */
function resolver(asked: AutomationStudioLlmProviderResolverInput[]) {
  return async (input: AutomationStudioLlmProviderResolverInput): Promise<AutomationStudioLlmProviderResolution | undefined> => {
    asked.push(input);
    const model = input.modelId ?? "default-model";
    if (!KNOWN.has(model)) throw new Error(`Unknown LLM model: ${model}`);
    const provider: AutomationStudioLlmProvider = { metadata: { provider: "mock", model }, runTask: async () => ({ model }) };
    return { provider, tokenLimits: { maxInputTokens: 9 }, timeoutMs: 1_000, maxTotalEstimatedCostUsd: 0.5 };
  };
}

const inFrame = <T>(models: AutomationStudioRunOverrides["models"] | undefined, run: () => Promise<T>): Promise<T> => runWithAutomationStudioRunOverrides(models ? { models } : {}, run);
const servedModel = (resolution: AutomationStudioLlmProviderResolution | undefined, taskKind: string) => (resolution?.provider.servedBy?.(request(taskKind)) ?? resolution?.provider)?.metadata.model;

describe("the attempt's resolution with a model per role", () => {
  it("asks the resolver exactly as before, once, with no frame or a frame without models", async () => {
    for (const models of [undefined, {}]) {
      const asked: AutomationStudioLlmProviderResolverInput[] = [];
      const resolution = await inFrame(models, async () => await automationStudioLlmRoleRoutedResolution(resolver(asked), BASE));
      expect(asked).toEqual([BASE]);
      expect(resolution?.provider.servedBy).toBeUndefined();
      expect(resolution?.provider.metadata.model).toBe("base-model");
    }
    const asked: AutomationStudioLlmProviderResolverInput[] = [];
    await automationStudioLlmRoleRoutedResolution(resolver(asked), BASE);
    expect(asked).toEqual([BASE]);
  });

  it("serves each role by its own model, the others by the caller's, and keeps the explore resolution's limits", async () => {
    const asked: AutomationStudioLlmProviderResolverInput[] = [];
    const resolution = await inFrame({ explore: "explorer", judge: "judge-model" }, async () => await automationStudioLlmRoleRoutedResolution(resolver(asked), BASE));
    expect(asked.map((input) => input.modelId)).toEqual(["explorer", "judge-model", "base-model"]);
    expect(asked.every((input) => input.projectId === "p" && input.providerId === "mock" && input.metadata?.llmModel === "flow-model")).toBe(true);
    expect(servedModel(resolution, "evidence_tool_decision")).toBe("explorer");
    expect(servedModel(resolution, "loop_verification")).toBe("judge-model");
    // A role left out uses the caller's model, as the docs say: `options.model`, else the engine's default.
    expect(servedModel(resolution, "runtime_patch")).toBe("base-model");
    expect(resolution).toMatchObject({ tokenLimits: { maxInputTokens: 9 }, timeoutMs: 1_000, maxTotalEstimatedCostUsd: 0.5 });
  });

  it("resolves a model once however many roles name it, and the engine's default where nobody named one", async () => {
    const asked: AutomationStudioLlmProviderResolverInput[] = [];
    const withoutModel: AutomationStudioLlmProviderResolverInput = { projectId: "p", flowId: "f", providerId: "mock", metadata: { llmModel: "flow-model" } };
    const resolution = await inFrame({ judge: "judge-model", repair: "judge-model" }, async () => await automationStudioLlmRoleRoutedResolution(resolver(asked), withoutModel));
    expect(asked.map((input) => input.modelId)).toEqual([undefined, "judge-model"]);
    expect(servedModel(resolution, "flow_bootstrap")).toBe("default-model");
    expect(servedModel(resolution, "loop_verification")).toBe("judge-model");
    expect(servedModel(resolution, "runtime_diagnosis")).toBe("judge-model");

    const same: AutomationStudioLlmProviderResolverInput[] = [];
    const collapsed = await inFrame({ explore: "base-model", judge: "base-model" }, async () => await automationStudioLlmRoleRoutedResolution(resolver(same), BASE));
    expect(same).toHaveLength(1);
    expect(collapsed?.provider.servedBy).toBeUndefined();
  });

  it("fails as an unknown attempt model fails, with the resolver's own error, and never falls back", async () => {
    const asked: AutomationStudioLlmProviderResolverInput[] = [];
    await expect(inFrame({ judge: "no-such-model" }, async () => await automationStudioLlmRoleRoutedResolution(resolver(asked), BASE))).rejects.toThrow("Unknown LLM model: no-such-model");
    await expect(automationStudioLlmRoleRoutedResolution(resolver([]), { ...BASE, modelId: "no-such-model" })).rejects.toThrow("Unknown LLM model: no-such-model");
    // A resolver that answers nothing for a role answers nothing for the attempt, as for its own model.
    const nothingFor = (model: string) => async (input: AutomationStudioLlmProviderResolverInput) => (input.modelId === model ? undefined : await resolver([])(input));
    expect(await inFrame({ repair: "repair-model" }, async () => await automationStudioLlmRoleRoutedResolution(nothingFor("repair-model"), BASE))).toBeUndefined();
  });

  it("routes two attempts at once each by its own run's models", async () => {
    const pausedThenResolved = async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return await automationStudioLlmRoleRoutedResolution(resolver([]), BASE);
    };
    const [first, second] = await Promise.all([
      inFrame({ judge: "judge-model" }, pausedThenResolved),
      inFrame({ judge: "repair-model", explore: "explorer" }, pausedThenResolved)
    ]);
    expect([servedModel(first, "evidence_tool_decision"), servedModel(first, "loop_verification")]).toEqual(["base-model", "judge-model"]);
    expect([servedModel(second, "evidence_tool_decision"), servedModel(second, "loop_verification")]).toEqual(["explorer", "repair-model"]);
  });
});

describe("the model a run's result check asks for", () => {
  it("is the run's judge model, else the Flow's", async () => {
    expect(automationStudioLlmRunJudgeModelId("flow-model")).toBe("flow-model");
    expect(automationStudioLlmRunJudgeModelId(undefined)).toBeUndefined();
    expect(automationStudioLlmRunJudgeModelId(7)).toBeUndefined();
    expect(await inFrame({ judge: "judge-model" }, async () => automationStudioLlmRunJudgeModelId("flow-model"))).toBe("judge-model");
    expect(await inFrame({ explore: "explorer" }, async () => automationStudioLlmRunJudgeModelId("flow-model"))).toBe("flow-model");
  });
});
