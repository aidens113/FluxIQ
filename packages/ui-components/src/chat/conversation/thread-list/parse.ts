// Reads Core's list of threads with a checking reader. A record the reader
// cannot read is skipped, so one odd thread never hides the rest; a list that
// is not a list is a failed read (undefined), never an empty one.

import type { ChatThreadSummary, ThreadSubjectKind } from "./summary.ts";

const SUBJECT_KINDS: readonly string[] = ["project", "flow", "build", "run", "panel"];
const STATUSES: readonly string[] = ["open", "resolved"];

/** `value` as a list of threads, in the order Core gave them, or undefined when it is not a list. */
export function parseThreadList(value: unknown): ChatThreadSummary[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.flatMap((raw) => {
    const thread = parseThread(raw);
    return thread === undefined ? [] : [thread];
  });
}

function parseThread(value: unknown): ChatThreadSummary | undefined {
  const record = asRecord(value);
  if (record === undefined) return undefined;
  const { conversationId, projectId, revision, status, updatedAt, pendingAskCount, title } = record;
  if (!isText(conversationId) || !isText(projectId) || typeof revision !== "number") return undefined;
  if (typeof status !== "string" || !STATUSES.includes(status)) return undefined;
  if (typeof updatedAt !== "number" || !Number.isFinite(updatedAt)) return undefined;
  if (typeof pendingAskCount !== "number" || !Number.isFinite(pendingAskCount) || pendingAskCount < 0) return undefined;
  const kind = asRecord(record.subject)?.kind;
  if (typeof kind !== "string" || !SUBJECT_KINDS.includes(kind)) return undefined;
  return {
    conversationId,
    projectId,
    revision,
    status: status as ChatThreadSummary["status"],
    updatedAt,
    pendingAskCount,
    title: typeof title === "string" ? title : null,
    subject: { kind: kind as ThreadSubjectKind }
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}
