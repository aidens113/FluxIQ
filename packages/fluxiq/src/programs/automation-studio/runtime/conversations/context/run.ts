import { automationStudioConversationAmbientStorage, type AutomationStudioConversationAmbient } from "./storage.ts";

/**
 * Runs `work` for one chat thread: anything inside it that opens its subject's
 * thread without naming one, in the same project, is handed this thread
 * instead, and the activity it emits is stamped with it.
 */
export function runInAutomationStudioConversation<T>(ambient: AutomationStudioConversationAmbient, work: () => T): T {
  return automationStudioConversationAmbientStorage.run({ projectId: ambient.projectId, conversationId: ambient.conversationId }, work);
}
