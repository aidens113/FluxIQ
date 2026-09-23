// The model is a setting, and this is what that means: the configured model is
// the one that reaches the endpoint, a model nobody configured is refused by
// name before a request is built, and a retired alias is told what replaced it.
//
// Every one of these was a `!== "deepseek-chat"` until 2026-09-23, which is why
// DeepSeek retiring that alias would have failed every run at once with an
// opaque provider 400 and no setting able to fix it.

import { describe, expect, it } from "vitest";
import {
  AUTOMATION_STUDIO_DEEPSEEK_DEFAULT_MODEL,
  AUTOMATION_STUDIO_DEEPSEEK_MODEL_LIMITS,
  AUTOMATION_STUDIO_DEEPSEEK_MODELS,
  automationStudioDeepSeekModelRefusal,
  isAutomationStudioDeepSeekModel,
  resolveAutomationStudioDeepSeekModel
} from "../models.ts";
import { createAutomationStudioDeepSeekProvider } from "../provider.ts";

const SECRET = { kind: "secret_reference", id: "secret:deepseek" } as const;

function provider(model?: string) {
  return createAutomationStudioDeepSeekProvider({
    secretReference: SECRET,
    resolveSecret: async () => "sk-test",
    fetchImpl: (async () => { throw new Error("must not run"); }) as typeof fetch,
    ...(model === undefined ? {} : { model })
  });
}

describe("the DeepSeek models Core is configured for", () => {
  it("defaults to deepseek-flash and carries more than one id", () => {
    expect(AUTOMATION_STUDIO_DEEPSEEK_DEFAULT_MODEL).toBe("deepseek-flash");
    expect(AUTOMATION_STUDIO_DEEPSEEK_MODELS).toContain("deepseek-flash");
    // More than one, deliberately: a set of exactly one is the shape that made
    // the previous rename a source edit in two repositories at once.
    expect(AUTOMATION_STUDIO_DEEPSEEK_MODELS.length).toBeGreaterThan(1);
    expect(AUTOMATION_STUDIO_DEEPSEEK_MODELS).toContain(AUTOMATION_STUDIO_DEEPSEEK_DEFAULT_MODEL);
  });

  it("does not offer an id DeepSeek has retired", () => {
    for (const retired of ["deepseek-chat", "deepseek-reasoner", "deepseek-v4-flash"]) {
      expect(isAutomationStudioDeepSeekModel(retired)).toBe(false);
    }
  });

  it("publishes each model's own context window, which is not Core's request ceiling", () => {
    for (const model of AUTOMATION_STUDIO_DEEPSEEK_MODELS) {
      const limits = AUTOMATION_STUDIO_DEEPSEEK_MODEL_LIMITS[model];
      expect(limits.contextTokens).toBe(1_000_000);
      expect(limits.maxOutputTokens).toBe(384_000);
    }
  });

  it("resolves an absent model to the default and refuses an unconfigured one by name", () => {
    expect(resolveAutomationStudioDeepSeekModel(undefined)).toBe(AUTOMATION_STUDIO_DEEPSEEK_DEFAULT_MODEL);
    expect(resolveAutomationStudioDeepSeekModel("deepseek-v4-pro")).toBe("deepseek-v4-pro");
    expect(() => resolveAutomationStudioDeepSeekModel("gpt-9")).toThrow(/"gpt-9" is not a DeepSeek model Core is configured for\. Configured models: deepseek-flash, deepseek-v4-pro\./u);
  });

  it("says what replaced a withdrawn id rather than only listing the permitted set", () => {
    expect(automationStudioDeepSeekModelRefusal("deepseek-chat"))
      .toBe('"deepseek-chat" was withdrawn by DeepSeek; use "deepseek-flash" instead. Configured models: deepseek-flash, deepseek-v4-pro.');
    expect(automationStudioDeepSeekModelRefusal("")).toMatch(/^An empty DeepSeek model is not a DeepSeek model Core is configured for\./u);
  });
});

describe("the model a provider was configured with", () => {
  it("is the one it reports, for every configured id", () => {
    expect(provider().metadata).toEqual({ provider: "deepseek", model: "deepseek-flash" });
    for (const model of AUTOMATION_STUDIO_DEEPSEEK_MODELS) {
      expect(provider(model).metadata).toEqual({ provider: "deepseek", model });
    }
  });

  it("refuses an unconfigured id at construction, before any transport", () => {
    for (const model of ["deepseek-chat", "deepseek-reasoner", "gpt-9", ""]) {
      let code: string | undefined;
      let message: string | undefined;
      try { provider(model); } catch (error) {
        code = (error as { code?: string }).code;
        message = (error as Error).message;
      }
      expect(code, model).toBe("llm.provider_model_unsupported");
      expect(message, model).toBe(automationStudioDeepSeekModelRefusal(model));
    }
  });
});
