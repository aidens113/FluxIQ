import { automationStudioAnthropicMessage as sendMessage, type AutomationStudioAnthropicMessageInput as ModelMessageInput } from "../../../models/providers/anthropic/index.ts";
import { automationStudioLlmStepLogModelStep } from "../step-log/index.ts";
import { automationStudioProviderRefusalMessageScreen } from "../provider-transport/index.ts";
export { AUTOMATION_STUDIO_ANTHROPIC_MESSAGES_URL, AUTOMATION_STUDIO_ANTHROPIC_API_VERSION, automationStudioAnthropicPaidFailure } from "../../../models/providers/anthropic/index.ts";

export type AutomationStudioAnthropicMessageInput<T> = Omit<ModelMessageInput<T>, "observe" | "screenMessage">;

/** Studio composes its existing diagnostic observer and evidence screen around the generic Messages transport. */
export function automationStudioAnthropicMessage<T>(input: AutomationStudioAnthropicMessageInput<T>) {
  return sendMessage({ ...input, observe: automationStudioLlmStepLogModelStep, screenMessage: automationStudioProviderRefusalMessageScreen });
}
