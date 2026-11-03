import type { ChatTarget } from "./target.ts";

/**
 * True when `a` and `b` show the same thread of Core's: both the latest chat,
 * the same automation (under any name), the same question's subject, or the
 * same thread by its id.
 */
export function sameThread(a: ChatTarget, b: ChatTarget): boolean {
  if (a.projectId !== b.projectId) return false;
  if (a.kind === "project" || b.kind === "project") return a.kind === "project" && b.kind === "project" && a.projectId === b.projectId;
  if (a.kind === "latest" || b.kind === "latest") return a.kind === b.kind;
  if (a.kind === "automation" && b.kind === "automation") return a.flowId === b.flowId;
  if (a.kind === "question" && b.kind === "question") return a.subjectKind === b.subjectKind && a.subjectId === b.subjectId;
  if (a.kind === "thread" && b.kind === "thread") return a.conversationId === b.conversationId;
  return false;
}
