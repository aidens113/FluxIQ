import { describe, expect, it, vi } from "vitest";
import { createAutomationStudioAnthropicProvider } from "../provider.ts";
import { createAutomationStudioAnthropicPanelCommandModel } from "../panel-command.ts";
import { AUTOMATION_STUDIO_ANTHROPIC_BUILT_IN_DEFAULT_MODEL, AUTOMATION_STUDIO_ANTHROPIC_DEFAULT_MODEL, automationStudioLlmProviderDefaultModel } from "../../models/index.ts";
import { automationStudioLlmStartingModelId } from "../../role-routing/index.ts";

// t1012 / user 2026-11-20 (no model ladder, Haiku for build and judge): a Claude call that names no model runs Haiku.
describe("Core's built-in Anthropic default", () => {
  it("is Haiku, and every unnamed path agrees with it", () => {
    expect(AUTOMATION_STUDIO_ANTHROPIC_BUILT_IN_DEFAULT_MODEL).toBe("claude-haiku-5-5");
    expect(AUTOMATION_STUDIO_ANTHROPIC_DEFAULT_MODEL).toBe("claude-haiku-5-5");
    expect(automationStudioLlmProviderDefaultModel("anthropic")).toBe("claude-haiku-5-5");
    expect(automationStudioLlmStartingModelId("anthropic")).toBe("claude-haiku-5-5");
    expect(automationStudioLlmStartingModelId(undefined)).toBe("claude-haiku-5-5");
    expect(automationStudioLlmStartingModelId("deepseek")).toBe("deepseek-flash");
  });

  it("runs the provider and the panel command on Haiku when no model is passed", () => {
    const adapter = createAutomationStudioAnthropicProvider({ secretReference: { kind: "secret_reference", id: "secret:claude" }, resolveSecret: async () => "dummy-provider-key", fetchImpl: vi.fn() as unknown as typeof fetch });
    expect(adapter.metadata).toMatchObject({ provider: "anthropic", model: "claude-haiku-5-5" });
    expect(createAutomationStudioAnthropicPanelCommandModel({ resolveKey: async () => "dummy-provider-key" }).name).toBe("anthropic:claude-haiku-5-5");
  });
});
