import { AUTOMATION_STUDIO_ANTHROPIC_BUILT_IN_DEFAULT_MODEL, isAutomationStudioAnthropicModel, type AutomationStudioAnthropicModel } from "./anthropic.ts";

export const AUTOMATION_STUDIO_LLM_DEFAULT_MODEL_ENV = "FLUXIQ_LLM_DEFAULT_MODEL";
export type AutomationStudioLlmModel = AutomationStudioAnthropicModel | "deepseek-flash" | "deepseek-v4-pro";
export type AutomationStudioLlmProviderId = "deepseek" | "anthropic";
type Environment = Readonly<Record<string, string | undefined>>;

export function automationStudioLlmModelProvider(value: unknown): AutomationStudioLlmProviderId | undefined {
  if (isAutomationStudioAnthropicModel(value)) return "anthropic";
  return value === "deepseek-flash" || value === "deepseek-v4-pro" ? "deepseek" : undefined;
}

export function isAutomationStudioLlmProviderId(value: unknown): value is AutomationStudioLlmProviderId {
  return value === "anthropic" || value === "deepseek";
}

export function automationStudioLlmProviderLabel(value: AutomationStudioLlmProviderId): string {
  return value === "anthropic" ? "Anthropic (Claude)" : "DeepSeek";
}

/** A bad global default fails at startup; a valid default never changes another provider's default. */
export function resolveAutomationStudioLlmDefaultModel(env: Environment = (globalThis as { process?: { env?: Environment } }).process?.env ?? {}): AutomationStudioLlmModel {
  const raw = env[AUTOMATION_STUDIO_LLM_DEFAULT_MODEL_ENV]?.trim();
  if (!raw) return "deepseek-flash";
  if (automationStudioLlmModelProvider(raw)) return raw as AutomationStudioLlmModel;
  throw new Error(`${AUTOMATION_STUDIO_LLM_DEFAULT_MODEL_ENV} must name a configured DeepSeek or Anthropic (Claude) model; received ${JSON.stringify(raw)}. Unset it to use the default, deepseek-flash.`);
}

export const AUTOMATION_STUDIO_LLM_DEFAULT_MODEL = resolveAutomationStudioLlmDefaultModel();
export const AUTOMATION_STUDIO_ANTHROPIC_DEFAULT_MODEL: AutomationStudioAnthropicModel = isAutomationStudioAnthropicModel(AUTOMATION_STUDIO_LLM_DEFAULT_MODEL)
  ? AUTOMATION_STUDIO_LLM_DEFAULT_MODEL : AUTOMATION_STUDIO_ANTHROPIC_BUILT_IN_DEFAULT_MODEL;

export function automationStudioLlmProviderDefaultModel(provider: AutomationStudioLlmProviderId): AutomationStudioLlmModel {
  if (automationStudioLlmModelProvider(AUTOMATION_STUDIO_LLM_DEFAULT_MODEL) === provider) return AUTOMATION_STUDIO_LLM_DEFAULT_MODEL;
  return provider === "anthropic" ? AUTOMATION_STUDIO_ANTHROPIC_BUILT_IN_DEFAULT_MODEL : "deepseek-flash";
}

/** The boundary every settings surface and resolver uses: no provider/model mismatch is inferred away. */
export function assertAutomationStudioLlmModelBinding(provider: unknown, model: unknown): void {
  if (provider !== undefined && !isAutomationStudioLlmProviderId(provider)) throw new Error("Live LLM execution supports DeepSeek and Anthropic (Claude).");
  const owner = automationStudioLlmModelProvider(model);
  if (model !== undefined && !owner) throw new Error(`Unsupported DeepSeek or Anthropic (Claude) model ${JSON.stringify(model)}.`);
  if (provider !== undefined && owner !== undefined && owner !== provider) throw new Error("The selected model does not belong to the selected provider.");
}
