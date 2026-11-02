// Compatibility exports; the framework runtime owns this capability.
export {
  AUTOMATION_STUDIO_LLM_DEFAULT_MODEL_ENV,
  automationStudioLlmModelProvider,
  isAutomationStudioLlmProviderId,
  automationStudioLlmProviderLabel,
  resolveAutomationStudioLlmDefaultModel,
  AUTOMATION_STUDIO_LLM_DEFAULT_MODEL,
  AUTOMATION_STUDIO_ANTHROPIC_DEFAULT_MODEL,
  automationStudioLlmProviderDefaultModel,
  assertAutomationStudioLlmModelBinding
} from "../../../../../runtime/models/catalog/index.ts";
export type {
  AutomationStudioLlmModel,
  AutomationStudioLlmProviderId
} from "../../../../../runtime/models/catalog/index.ts";
