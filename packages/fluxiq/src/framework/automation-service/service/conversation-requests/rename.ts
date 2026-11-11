import type { ConversationRenameRequest, ConversationRenameResponse } from "../../../../api-contracts/automation.ts";
import { automationStudioConversationTitleOrRefuse } from "../../../../runtime/conversations/index.ts";
import { automationStudioConversationOfRequest, type AutomationStudioConversationProjectGate } from "./thread-of-request.ts";
import type { AutomationStudioConversationRequestService } from "./types.ts";

/**
 * `rename-conversation`: a person's own name for a thread. The name is checked
 * before the thread is looked for, so what it says about the name never depends
 * on whether the thread exists.
 */
export async function renameConversationForRequest(
  service: AutomationStudioConversationRequestService,
  domainId: string | null | undefined,
  payload: Partial<ConversationRenameRequest>,
  mayChange: AutomationStudioConversationProjectGate
): Promise<ConversationRenameResponse> {
  const title = automationStudioConversationTitleOrRefuse(payload.title);
  const { projectId, conversation } = await automationStudioConversationOfRequest(service, domainId, payload, mayChange);
  return { conversation: await service.conversations.renameConversation({ projectId, conversationId: conversation.conversationId, title }) };
}
