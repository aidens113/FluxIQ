// Compatibility exports; the framework runtime owns this capability.
export {
  AUTOMATION_STUDIO_ANTHROPIC_MODELS,
  AUTOMATION_STUDIO_ANTHROPIC_BUILT_IN_DEFAULT_MODEL,
  AUTOMATION_STUDIO_ANTHROPIC_MODEL_LIMITS,
  AUTOMATION_STUDIO_ANTHROPIC_MAX_CONTEXT_TOKENS,
  isAutomationStudioAnthropicModel,
  automationStudioAnthropicModelRefusal
} from "../../../../../runtime/models/catalog/index.ts";
export type {
  AutomationStudioAnthropicModel
} from "../../../../../runtime/models/catalog/index.ts";
