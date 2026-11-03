/**
 * Which of Core's threads the chat shows:
 *
 *   latest      the project's own open thread
 *   automation  the thread about one automation (a Flow), opened from the
 *               automations tab
 *   question    the thread a build or a run put its question to the person
 *               in, opened from the live line when that thread is not on
 *               screen (`stream/ask-thread.ts`): a build asks in its Flow's
 *               thread (Core subject `flow`), a run in its own (subject `run`).
 *               `activityId` is the unit of work that asked; `title` names
 *               the thread in the context line.
 */
export type ChatTarget =
  | { kind: "latest"; projectId?: string | undefined }
  | { kind: "project"; projectId: string }
  | { kind: "automation"; flowId: string; name: string; projectId?: string | undefined }
  | { kind: "question"; activityId: string; subjectKind: "flow" | "run"; subjectId: string; title: string; projectId?: string | undefined };
