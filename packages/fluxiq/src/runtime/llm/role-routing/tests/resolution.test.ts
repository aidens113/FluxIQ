// Fixed starting-model selection and compatibility with historical role overrides.
import { describe, expect, it } from "vitest";
import { runWithAutomationStudioRunOverrides } from "../../../run-overrides/index.ts";
import { AUTOMATION_STUDIO_LLM_DEFAULT_MODEL, AUTOMATION_STUDIO_LLM_DEFAULT_MODEL_NAMED } from "../../../models/catalog/index.ts";
import type { AutomationStudioLlmProviderResolverInput } from "../../resolver-contract.ts";
import { automationStudioLlmRoleRoutedResolution, automationStudioLlmRunJudgeModelId } from "../index.ts";

const BASE = { projectId: "p", flowId: "f", modelId: "custom-start", metadata: { llmModel: "custom-start" } };
function resolver(asked: AutomationStudioLlmProviderResolverInput[]) {
  return async (input: AutomationStudioLlmProviderResolverInput) => {
    asked.push(input);
    if (input.modelId === "unknown") throw new Error("Unknown starting model");
    return { provider: { metadata: { provider: "mock", model: input.modelId! }, runTask: async () => ({ model: input.modelId }) }, tokenLimits: { maxInputTokens: 900 }, timeoutMs: 1_000 };
  };
}

describe("one automation model", () => {
  it("resolves the explicit starting model exactly once and keeps its limits", async () => {
    const asked: AutomationStudioLlmProviderResolverInput[] = [];
    const result = await automationStudioLlmRoleRoutedResolution(resolver(asked), BASE);
    expect(asked).toEqual([BASE]);
    expect(result).toMatchObject({ provider: { metadata: { model: "custom-start" } }, tokenLimits: { maxInputTokens: 900 }, timeoutMs: 1_000 });
  });

  it("uses explore as the explicit task selection and ignores conflicting or unknown legacy role overrides", async () => {
    const asked: AutomationStudioLlmProviderResolverInput[] = [];
    const result = await runWithAutomationStudioRunOverrides({ models: { explore: "selected", judge: "unknown", repair: "unknown" } }, () => automationStudioLlmRoleRoutedResolution(resolver(asked), BASE));
    expect(asked.map((each) => each.modelId)).toEqual(["selected"]);
    expect(result?.provider.metadata.model).toBe("selected");
  });

  it("defaults automation to Haiku unless the environment explicitly selected a model", async () => {
    const asked: AutomationStudioLlmProviderResolverInput[] = [];
    await automationStudioLlmRoleRoutedResolution(resolver(asked), { projectId: "p", flowId: "f" });
    expect(asked[0]?.modelId).toBe(AUTOMATION_STUDIO_LLM_DEFAULT_MODEL_NAMED ? AUTOMATION_STUDIO_LLM_DEFAULT_MODEL : "claude-haiku-5-5");
  });

  it("retains an explicitly selected provider's compatible default", async () => {
    const asked: AutomationStudioLlmProviderResolverInput[] = [];
    await automationStudioLlmRoleRoutedResolution(resolver(asked), { projectId: "p", flowId: "f", providerId: "deepseek" });
    expect(asked[0]?.modelId).toBe(AUTOMATION_STUDIO_LLM_DEFAULT_MODEL_NAMED ? AUTOMATION_STUDIO_LLM_DEFAULT_MODEL : "deepseek-flash");
  });

  it("does not fall back when the selected model fails or is unavailable", async () => {
    const asked: AutomationStudioLlmProviderResolverInput[] = [];
    await expect(automationStudioLlmRoleRoutedResolution(resolver(asked), { ...BASE, modelId: "unknown" })).rejects.toThrow("Unknown starting model");
    expect(asked).toHaveLength(1);
    expect(await automationStudioLlmRoleRoutedResolution(async () => undefined, BASE)).toBeUndefined();
  });

  it("keeps concurrent task selections separate", async () => {
    const [first, second] = await Promise.all([
      runWithAutomationStudioRunOverrides({ models: { explore: "first", judge: "other" } }, () => automationStudioLlmRoleRoutedResolution(resolver([]), BASE)),
      runWithAutomationStudioRunOverrides({ models: { explore: "second", repair: "other" } }, () => automationStudioLlmRoleRoutedResolution(resolver([]), BASE))
    ]);
    expect([first?.provider.metadata.model, second?.provider.metadata.model]).toEqual(["first", "second"]);
  });

  it("uses the task selection for runtime judging rather than a historical judge override", async () => {
    expect(automationStudioLlmRunJudgeModelId("custom-start")).toBe("custom-start");
    expect(await runWithAutomationStudioRunOverrides({ models: { judge: "other" } }, async () => automationStudioLlmRunJudgeModelId("custom-start"))).toBe("custom-start");
    expect(await runWithAutomationStudioRunOverrides({ models: { explore: "selected", judge: "other" } }, async () => automationStudioLlmRunJudgeModelId("custom-start"))).toBe("selected");
  });
});
