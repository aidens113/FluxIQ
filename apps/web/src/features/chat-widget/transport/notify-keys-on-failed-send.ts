import type { ChatConversationPort } from "@fluxiq/ui-components";

/**
 * The conversation, with one addition: when a message could not be sent, or came back with a problem, whatever
 * shows the person's AI key is told to read it again, because a failed message is often the key. Nothing is read
 * after a message that went well.
 */
export function notifyKeysOnFailedSend(conversation: ChatConversationPort, keysMayHaveChanged: () => void): ChatConversationPort {
  return {
    ...conversation,
    async send(message) {
      const result = await conversation.send(message);
      const value = result.ok ? (result.value as { problem?: unknown } | undefined) : undefined;
      if (!result.ok || (value && typeof value === "object" && value.problem)) keysMayHaveChanged();
      return result;
    }
  };
}
