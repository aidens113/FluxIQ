import type { AutomationStudioProviderRefusal } from "../provider-transport/index.ts";
import type { AutomationStudioDeepSeekRequestShape } from "./request-shape.ts";
export type AutomationStudioDeepSeekRefusal = AutomationStudioProviderRefusal<AutomationStudioDeepSeekRequestShape>;
export { AUTOMATION_STUDIO_DEEPSEEK_REFUSAL_FIELD_MAX_LENGTH, AUTOMATION_STUDIO_DEEPSEEK_REFUSAL_MESSAGE_MAX_LENGTH, readAutomationStudioProviderRefusal as readAutomationStudioDeepSeekRefusal, automationStudioProviderRefusalText as automationStudioDeepSeekRefusalText, type AutomationStudioProviderRefusalWithheld as AutomationStudioDeepSeekRefusalWithheld } from "../provider-transport/index.ts";
