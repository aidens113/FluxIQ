import type { ConversationDeleteRequest, ConversationDeleteResponse } from "../../../../api-contracts/automation.ts";
import { AutomationStudioConversationRefusal } from "../../../../runtime/conversations/index.ts";
import type { AutomationStudioConversationRunLinks } from "./run-links.ts";
import { automationStudioConversationOfRequest, type AutomationStudioConversationProjectGate } from "./thread-of-request.ts";
import type { AutomationStudioConversationRequestService } from "./types.ts";

const NO_RUN_LINKS = "This deployment cannot tell whether a run still uses a conversation, so it does not delete one.";

/**
 * `delete-conversation`: removes a thread with everything said and asked in it.
 * A run Core keeps a record of that still uses the thread refuses it here
 * (`./run-links.ts`); work started from it in this process, and a run parked on
 * one of its asks, refuse it in the collaborator and the store.
 */
export async function deleteConversationForRequest(
  service: AutomationStudioConversationRequestService,
  domainId: string | null | undefined,
  payload: Partial<ConversationDeleteRequest>,
  gates: { mayChange: AutomationStudioConversationProjectGate; runLinks: AutomationStudioConversationRunLinks | undefined }
): Promise<ConversationDeleteResponse> {
  const { projectId, conversation } = await automationStudioConversationOfRequest(service, domainId, payload, gates.mayChange);
  if (!gates.runLinks) throw new Error(NO_RUN_LINKS);
  if (await gates.runLinks.usesThread(projectId, conversation)) throw new AutomationStudioConversationRefusal("conversation_run_active");
  return service.conversations.deleteConversation({ projectId, conversationId: conversation.conversationId });
}
