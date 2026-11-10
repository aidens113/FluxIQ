// What a thread is called where a person reads it: the thread picker and the
// chat's heading. Never a raw id. A thread a person opens themselves carries no
// title, and an id is what someone quotes in a bug report, not what they call
// their work. The name is Core's own title when it gave one, else a plain noun
// for what the thread is about.

import type { ChatThreadSummary, ThreadSubjectKind } from "./summary.ts";

/** A UUID, or a long run of hex: an id a person would not recognise as a name. */
const RAW_ID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b|\b[0-9a-f]{16,}\b/iu;

const SUBJECT_NOUN: Readonly<Record<ThreadSubjectKind, string>> = Object.freeze({
  project: "This project",
  flow: "This Flow",
  build: "This Flow build",
  run: "This run",
  panel: "FluxIQ assistant"
});

/** What the thread is about, as a noun: "This run", "This Flow". Never the subject's id. */
export function conversationSubjectFallbackLabel(thread: ChatThreadSummary): string {
  return SUBJECT_NOUN[thread.subject.kind];
}

/**
 * How a thread reads in the list. Core's own title when it opened the thread
 * with one ("Nightly listings run") and otherwise a plain noun for its
 * subject. A title that is itself an id is not a name, and is passed over.
 */
export function conversationSubjectLabel(thread: ChatThreadSummary): string {
  const title = thread.title?.trim();
  return title && !RAW_ID.test(title) ? title : conversationSubjectFallbackLabel(thread);
}
