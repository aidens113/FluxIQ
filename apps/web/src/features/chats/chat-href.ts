/** The full-page view of one chat. The project rides along so the page opens the thread without searching for it. */
export function chatHref(conversationId: string, projectId: string): string {
  return `/chats/${encodeURIComponent(conversationId)}?project=${encodeURIComponent(projectId)}`;
}
