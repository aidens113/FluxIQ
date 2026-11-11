// The conversation list's rows: each thread's name, when it last moved, and
// whether it is waiting on the person, with the thread on screen marked. No DOM.
// `search` holds every word a search may match: the name and the time, both
// as the row says it and as the full date.

import { conversationSubjectLabel } from "./labels.ts";
import type { ChatThreadSummary } from "./summary.ts";
import { threadWhen } from "./when.ts";

/** One row of the conversation list. */
export type ThreadRow = {
  conversationId: string;
  projectId: string;
  /** The thread's name, never an id. */
  label: string;
  /** When it last moved, in words ("3 h ago"). */
  when: string;
  /** The full day it last moved ("November 3, 2026"). */
  date: string;
  /** A question in it waits on the person. */
  waiting: boolean;
  /** It is the thread on screen. */
  selected: boolean;
  /** The words a search matches, in lower case. */
  search: string;
};

/** The rows for `threads`, in list order, at `now`. */
export function threadRows(threads: readonly ChatThreadSummary[], selectedId: string | undefined, now: number): ThreadRow[] {
  return threads.map((thread) => {
    const label = conversationSubjectLabel(thread);
    const { when, date } = threadWhen(thread.updatedAt, now);
    return {
      conversationId: thread.conversationId,
      projectId: thread.projectId,
      label,
      when,
      date,
      waiting: thread.pendingAskCount > 0,
      selected: thread.conversationId === selectedId,
      search: `${label} ${when} ${date}`.toLowerCase()
    };
  });
}
