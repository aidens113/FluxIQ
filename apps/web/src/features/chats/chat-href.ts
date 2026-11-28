import { PANEL_PROJECT } from "./parse-panel-threads";

/**
 * The full-page view of one chat. The project rides along so the page opens the thread without searching
 * for it. An earlier chat with no project (Core's reserved `panel`) is opened where it lives, by its id
 * alone, never on that id as if it were a project.
 */
export function chatHref(conversationId: string, projectId: string): string {
  const page = `/chats/${encodeURIComponent(conversationId)}`;
  return projectId === PANEL_PROJECT ? page : `${page}?project=${encodeURIComponent(projectId)}`;
}
