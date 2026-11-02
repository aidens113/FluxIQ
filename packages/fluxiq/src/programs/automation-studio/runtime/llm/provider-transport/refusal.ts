import { readAutomationStudioProviderRefusal as readRefusal } from "../../../../../runtime/models/transport/index.ts";
import { automationStudioWithoutLocators } from "../screening/index.ts";
export { AUTOMATION_STUDIO_DEEPSEEK_REFUSAL_MESSAGE_MAX_LENGTH, AUTOMATION_STUDIO_DEEPSEEK_REFUSAL_FIELD_MAX_LENGTH, automationStudioProviderRefusalText, type AutomationStudioProviderRefusalWithheld, type AutomationStudioProviderRefusal } from "../../../../../runtime/models/transport/index.ts";

/** Studio supplies its existing evidence screen to the generic refusal transport. */
export function readAutomationStudioProviderRefusal<TRequest>(input: Omit<Parameters<typeof readRefusal<TRequest>>[0], "screenMessage">) {
  return readRefusal({ ...input, screenMessage: automationStudioWithoutLocators });
}

/** Studio evidence policy supplied to canonical provider transports. */
export const automationStudioProviderRefusalMessageScreen = automationStudioWithoutLocators;
