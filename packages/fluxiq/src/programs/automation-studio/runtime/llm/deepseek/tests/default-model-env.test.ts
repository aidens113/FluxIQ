// Core's default model is one configurable variable, built as the run cost
// ceiling is: FLUXIQ_LLM_DEFAULT_MODEL, `deepseek-flash` when unset, and a value
// that is not a configured model stops Core rather than building on a default.
// The Lab sets it from `--llm-model` so a build started from the extension's
// chat -- whose new Flow names no model -- can run on another one (t233).

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AUTOMATION_STUDIO_DEEPSEEK_BUILT_IN_DEFAULT_MODEL,
  AUTOMATION_STUDIO_DEEPSEEK_MODELS,
  AUTOMATION_STUDIO_LLM_DEFAULT_MODEL_ENV,
  resolveAutomationStudioLlmDefaultModel
} from "../models.ts";

const withModel = (value: string | undefined) => ({ [AUTOMATION_STUDIO_LLM_DEFAULT_MODEL_ENV]: value });

describe("the default model variable", () => {
  it("is named FLUXIQ_LLM_DEFAULT_MODEL and defaults to deepseek-flash", () => {
    expect(AUTOMATION_STUDIO_LLM_DEFAULT_MODEL_ENV).toBe("FLUXIQ_LLM_DEFAULT_MODEL");
    expect(AUTOMATION_STUDIO_DEEPSEEK_BUILT_IN_DEFAULT_MODEL).toBe("deepseek-flash");
    expect(resolveAutomationStudioLlmDefaultModel({})).toBe("deepseek-flash");
    expect(resolveAutomationStudioLlmDefaultModel(withModel(undefined))).toBe("deepseek-flash");
    expect(resolveAutomationStudioLlmDefaultModel(withModel("  "))).toBe("deepseek-flash");
  });

  it("takes any configured model that is set", () => {
    for (const model of AUTOMATION_STUDIO_DEEPSEEK_MODELS) expect(resolveAutomationStudioLlmDefaultModel(withModel(model))).toBe(model);
    expect(resolveAutomationStudioLlmDefaultModel(withModel(" deepseek-v4-pro "))).toBe("deepseek-v4-pro");
  });

  it.each(["gpt-9", "deepseek-chat", "DEEPSEEK-FLASH", "deepseek-v4-flash"])("refuses %s, naming the variable, instead of falling back", (value) => {
    expect(() => resolveAutomationStudioLlmDefaultModel(withModel(value))).toThrow(/FLUXIQ_LLM_DEFAULT_MODEL/u);
  });
});

describe("the default model is read once, when Core loads", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("is what a caller naming no model gets, a new Flow's build among them", async () => {
    vi.stubEnv(AUTOMATION_STUDIO_LLM_DEFAULT_MODEL_ENV, "deepseek-v4-pro");
    vi.resetModules();
    const models = await import("../models.ts");
    expect(models.AUTOMATION_STUDIO_DEEPSEEK_DEFAULT_MODEL).toBe("deepseek-v4-pro");
    expect(models.resolveAutomationStudioDeepSeekModel(undefined)).toBe("deepseek-v4-pro");
    expect(models.resolveAutomationStudioDeepSeekModel(null)).toBe("deepseek-v4-pro");
    // A model the caller names still wins.
    expect(models.resolveAutomationStudioDeepSeekModel("deepseek-flash")).toBe("deepseek-flash");
    // The host's resolver: a new Flow has no `llmModel`, so its build names no model.
    const { createAutomationStudioSessionKeyProviderResolver } = await import("../../session-key-provider.ts");
    const resolve = createAutomationStudioSessionKeyProviderResolver({ ports: {} as never });
    const caller = { actorUserId: "user-1", actorSessionId: "session-1" } as never;
    expect(resolve({ projectId: "p", flowId: "f", caller })?.provider.metadata).toMatchObject({ provider: "deepseek", model: "deepseek-v4-pro" });
    expect(resolve({ projectId: "p", flowId: "f", caller, modelId: "deepseek-flash" })?.provider.metadata).toMatchObject({ model: "deepseek-flash" });
    // And it is priced at the model it calls, not at deepseek-flash's rates.
    const { estimateAutomationStudioDeepSeekCostUsd } = await import("../pricing.ts");
    expect(estimateAutomationStudioDeepSeekCostUsd(1_000, 1_000)).toBe(estimateAutomationStudioDeepSeekCostUsd(1_000, 1_000, 0, "deepseek-v4-pro"));
    // Priced at the rate in force now (t254): the peak figure, or half of it off-peak.
    expect([0.00528, 0.00264]).toContain(resolve({ projectId: "p", flowId: "f", caller })?.provider.estimateCostUsd?.({ inputTokens: 1_000, outputTokens: 1_000 }));
  }, 120_000); // A fresh module graph behind the host's resolver takes a while to load.

  it("stops Core at load when it names no configured model", async () => {
    vi.stubEnv(AUTOMATION_STUDIO_LLM_DEFAULT_MODEL_ENV, "gpt-9");
    vi.resetModules();
    await expect(import("../models.ts")).rejects.toThrow(/FLUXIQ_LLM_DEFAULT_MODEL must name a DeepSeek model Core is configured for\. "gpt-9" is not a DeepSeek model/u);
  });
});
