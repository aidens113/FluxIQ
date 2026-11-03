// Compatibility exports; the framework runtime owns this capability.
export {
  AUTOMATION_STUDIO_LLM_PROVIDER_PREFLIGHT_ERROR_CODES,
  AUTOMATION_STUDIO_LLM_PROVIDER_CALL_ERROR_CODES,
  AUTOMATION_STUDIO_LLM_DEFAULT_TIMEOUT_MS,
  AUTOMATION_STUDIO_LLM_MAX_TIMEOUT_MS,
  automationStudioLlmSignalTimedOut,
  AutomationStudioLlmProviderError,
  normalizedAutomationStudioLlmProviderFailure,
  automationStudioLlmProviderPaidUsage
} from "../models/failures/index.ts";
export type {
  AutomationStudioLlmProviderPreflightErrorCode,
  AutomationStudioLlmProviderErrorCode,
  AutomationStudioLlmProviderInvocationState,
  AutomationStudioLlmProviderResponseState,
  AutomationStudioLlmProviderFailureProvenance,
  AutomationStudioLlmProviderInputSize,
  AutomationStudioLlmOpaqueSecretResolver
} from "../models/failures/index.ts";
