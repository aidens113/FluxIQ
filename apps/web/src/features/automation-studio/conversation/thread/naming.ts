// What a thread is called where the globally mounted prompt names it. (The
// chat widget names threads for its own header and picker.)
//
// Never a raw id. An id is what someone quotes in a bug report, not what they
// call their work. The name is Core's own title when it gave one, else a plain
// noun for what the thread is about.

import type { Conversation } from "./contracts";

/** A UUID, or a long run of hex: an id a person would not recognise as a name. */
const RAW_ID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b|\b[0-9a-f]{16,}\b/iu;

const SUBJECT_NOUN: Readonly<Record<Conversation["subject"]["kind"], string>> = Object.freeze({
  project: "This project",
  flow: "This Flow",
  build: "This Flow build",
  run: "This run"
});

/**
 * How a thread reads in the list. Core's own title when it opened the thread
 * with one -- "Nightly listings run" -- and otherwise a plain noun for its
 * subject. A title that is itself an id is not a name, and is passed over.
 */
export function conversationSubjectLabel(conversation: Conversation): string {
  const title = conversation.title?.trim();
  return title && !RAW_ID.test(title) ? title : conversationSubjectFallbackLabel(conversation);
}

/** What the thread is about, as a noun: "This run", "This Flow". Never the subject's id. */
function conversationSubjectFallbackLabel(conversation: Conversation): string {
  return SUBJECT_NOUN[conversation.subject.kind];
}
