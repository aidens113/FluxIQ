import type { Conversation } from "../automation-studio/conversation/thread";

/** The project id Core gives the assistant's own threads; it is never shown to a person. */
export const PANEL_PROJECT = "panel";

/**
 * The assistant's own threads as chats. `list-panel-threads` answers flat records
 * (`subjectKind: "panel"`), which the project conversation parser refuses, so they are
 * read here: a thread without an id, a valid status or a time is dropped alone.
 */
export function parsePanelThreads(value: unknown): Conversation[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): Conversation[] => {
    if (typeof entry !== "object" || entry === null) return [];
    const record = entry as Record<string, unknown>;
    const { conversationId, status, createdAt, updatedAt } = record;
    if (typeof conversationId !== "string" || !conversationId) return [];
    if (status !== "open" && status !== "resolved") return [];
    if (typeof createdAt !== "number" || typeof updatedAt !== "number") return [];
    const count = (field: unknown) => (typeof field === "number" && field >= 0 ? field : 0);
    return [{
      conversationId,
      projectId: typeof record.projectId === "string" && record.projectId ? record.projectId : PANEL_PROJECT,
      subject: { kind: "project", id: PANEL_PROJECT },
      status,
      title: typeof record.title === "string" && record.title.trim() ? record.title : null,
      turnCount: count(record.turnCount),
      pendingAskCount: count(record.pendingAskCount),
      createdAt,
      updatedAt
    }];
  });
}
