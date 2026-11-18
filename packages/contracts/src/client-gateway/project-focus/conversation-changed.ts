/**
 * `server.conversation_changed`, unprompted: a chat the pairing person may read
 * changed (a turn written, a reply finished, an ask answered or expired, a
 * rename or a delete), wherever the change was made. It carries no content: the
 * client reads the chat again through its existing reads. `projectId` is the
 * project the chat belongs to, or null for the person's own panel thread.
 * Nothing is replayed after a reconnect: a client reads its chats again once
 * its session is ready (`server.session_ready`).
 */
export type ClientGatewayConversationChanged = { conversationId: string; projectId: string | null };
