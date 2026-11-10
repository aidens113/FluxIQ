// One thread as the thread list holds it: what the picker, the heading and the
// badge are made from. Read from Core's record by `parse.ts`; the rest of the
// record is ignored.

/** What a thread is about. `build` is a Flow's build. */
export type ThreadSubjectKind = "project" | "flow" | "build" | "run" | "panel";

/** One thread of the list. */
export type ChatThreadSummary = {
  conversationId: string;
  /** The thread's own project: the list may span every project the person can see. */
  projectId: string;
  revision: number;
  status: "open" | "resolved";
  /** When it last moved, in ms since the epoch. */
  updatedAt: number;
  /** How many questions nobody has answered in it. */
  pendingAskCount: number;
  /** Core's own title, when it opened the thread with one. */
  title: string | null;
  subject: { kind: ThreadSubjectKind };
};
