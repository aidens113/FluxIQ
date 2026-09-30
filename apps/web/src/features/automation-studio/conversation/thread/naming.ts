// What a thread is called where a person reads it: the chat's header, the
// thread picker and the prompt that asks for an answer.
//
// Never a raw id. The header used to read "Project 820f86f0-ba20-..." twice,
// once as the name and again as the subtitle, because a thread a person opens
// themselves carries no title and the fallback was the subject's id. An id is
// what someone quotes in a bug report, not what they call their work. The name
// is Core's own title when it gave one, else the project's name when the
// surface knows it, else a plain noun for what the thread is about.

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
export function conversationSubjectFallbackLabel(conversation: Conversation): string {
  return SUBJECT_NOUN[conversation.subject.kind];
}

/**
 * The name at the top of the chat. Core's title first; a thread about the
 * project, or no thread yet, takes the project's name; a thread about a run or
 * a Flow Core did not title reads as that noun in the project ("This run ·
 * Company website"). With neither a thread nor a project, it spans them all.
 */
export function conversationDisplayTitle(conversation: Conversation | null, projectName?: string | null): string {
  const project = projectName?.trim() || null;
  if (!conversation) return project ?? "All projects";
  const label = conversationSubjectLabel(conversation);
  if (label !== conversationSubjectFallbackLabel(conversation)) return label;
  if (!project) return label;
  return conversation.subject.kind === "project" ? project : `${label} · ${project}`;
}
