import { automationStudioConversationAmbientStorage, type AutomationStudioConversationAmbient } from "./storage.ts";

/**
 * The chat thread the current work was started from, when it belongs to
 * `projectId`. A thread of one project is never handed to work in another:
 * a build that reaches into a second project is not talking to this person
 * about that project in this thread.
 */
export function currentAutomationStudioConversation(projectId: string): AutomationStudioConversationAmbient | null {
  const ambient = automationStudioConversationAmbientStorage.getStore();
  return ambient && ambient.projectId === projectId ? ambient : null;
}
