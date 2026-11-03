import { conversationSubjectLabel } from "./labels.ts";
import type { ChatThreadSummary } from "./summary.ts";

/** One line of the thread picker. */
export type ThreadOption = { conversationId: string; label: string };

function whenMoved(updatedAt: number): string {
  return new Date(updatedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/**
 * The picker's options: each thread's name, whether it is waiting on the
 * person, and, where two threads would read the same, when each last moved.
 * `format` writes a date; it exists so a test does not depend on the locale.
 */
export function threadOptions(threads: readonly ChatThreadSummary[], format: (updatedAt: number) => string = whenMoved): ThreadOption[] {
  const labels = threads.map((thread) => conversationSubjectLabel(thread));
  return threads.map((thread, index) => {
    const label = labels[index]!;
    const repeated = labels.indexOf(label) !== labels.lastIndexOf(label);
    const when = repeated ? ` · ${format(thread.updatedAt)}` : "";
    const waiting = thread.pendingAskCount > 0 ? " (waiting on you)" : "";
    return { conversationId: thread.conversationId, label: `${label}${when}${waiting}` };
  });
}
