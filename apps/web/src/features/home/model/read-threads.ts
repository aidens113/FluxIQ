import { asRecord } from "./as-record";
import { numberOf } from "./number-of";
import { textOf } from "./text-of";
import type { HomeThread } from "./types";

/** The `list-conversations` answer as threads. Rows without an id are dropped. */
export function readThreads(payload: unknown): HomeThread[] {
  const list = asRecord(payload)?.conversations;
  if (!Array.isArray(list)) return [];
  return list.flatMap((raw) => {
    const row = asRecord(raw);
    const conversationId = textOf(row?.conversationId);
    if (!row || !conversationId) return [];
    const subject = asRecord(row.subject);
    const thread: HomeThread = {
      conversationId,
      projectId: textOf(row.projectId) ?? "",
      subjectKind: textOf(subject?.kind) ?? "",
      subjectId: textOf(subject?.id) ?? "",
      pendingAskCount: numberOf(row.pendingAskCount) ?? 0,
      status: textOf(row.status) ?? "open"
    };
    const title = textOf(row.title);
    if (title !== undefined) thread.title = title;
    return [thread];
  });
}
