// Provider-owned facts checked against Anthropic's model overview and pricing,
// https://platform.claude.com/docs/en/models/overview, on 2026-10-30.
// Browser-safe: this module imports no runtime or Node code.
export const AUTOMATION_STUDIO_ANTHROPIC_MODELS = ["claude-sonnet-5-5", "claude-haiku-5-5", "claude-opus-5-5"] as const;
export type AutomationStudioAnthropicModel = (typeof AUTOMATION_STUDIO_ANTHROPIC_MODELS)[number];
export const AUTOMATION_STUDIO_ANTHROPIC_BUILT_IN_DEFAULT_MODEL: AutomationStudioAnthropicModel = "claude-sonnet-5-5";
export const AUTOMATION_STUDIO_ANTHROPIC_MODEL_LIMITS = Object.freeze({
  "claude-sonnet-5-5": Object.freeze({ contextTokens: 1_000_000, maxOutputTokens: 128_000 }),
  "claude-haiku-5-5": Object.freeze({ contextTokens: 1_000_000, maxOutputTokens: 128_000 }),
  "claude-opus-5-5": Object.freeze({ contextTokens: 1_000_000, maxOutputTokens: 128_000 })
});
export const AUTOMATION_STUDIO_ANTHROPIC_MAX_CONTEXT_TOKENS = 1_000_000;

export function isAutomationStudioAnthropicModel(value: unknown): value is AutomationStudioAnthropicModel {
  return typeof value === "string" && (AUTOMATION_STUDIO_ANTHROPIC_MODELS as readonly string[]).includes(value);
}

export function automationStudioAnthropicModelRefusal(value: unknown): string {
  return `${typeof value === "string" ? JSON.stringify(value) : "An empty Claude model"} is not an Anthropic (Claude) model Core is configured for. Configured models: ${AUTOMATION_STUDIO_ANTHROPIC_MODELS.join(", ")}.`;
}
