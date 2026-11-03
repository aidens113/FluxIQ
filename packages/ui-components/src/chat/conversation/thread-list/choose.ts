// Which thread the chat opens by itself. No DOM.
//
// Only the latest chat gives way to a thread: the thread the person chose
// (or the chat chose first) stays, and so does an automation's or a question's
// chat that the host opened, so nothing the person is looking at is taken
// from them. `initial` is the thread to come back to (the host's restore); it
// is used when it is listed, otherwise the list's first thread is, which is the
// one waiting on the person, else the newest.

import type { ChatTarget } from "../../target.ts";
import type { ChatThreadSummary } from "./summary.ts";

/** The thread `target` should give way to, or undefined to leave things as they are. `threads` is already in list order. */
export function threadToSelect(target: ChatTarget, threads: readonly ChatThreadSummary[], initial: string | undefined): ChatThreadSummary | undefined {
  if (target.kind !== "latest" || threads.length === 0) return undefined;
  return threads.find((thread) => thread.conversationId === initial) ?? threads[0];
}
