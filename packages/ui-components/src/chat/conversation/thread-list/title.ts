import { conversationSubjectFallbackLabel, conversationSubjectLabel } from "./labels.ts";
import type { ChatThreadSummary } from "./summary.ts";

/**
 * The name at the top of the chat. Core's title first; a thread about the
 * project, or no thread yet, takes the project's name; a thread about a run or
 * a Flow Core did not title reads as that noun in the project ("This run ·
 * Company website"). With neither a thread nor a project, it spans them all.
 */
export function conversationDisplayTitle(thread: ChatThreadSummary | null, projectName?: string | null): string {
  const project = projectName?.trim() || null;
  if (!thread) return project ?? "All projects";
  const label = conversationSubjectLabel(thread);
  if (label !== conversationSubjectFallbackLabel(thread)) return label;
  if (!project) return label;
  return thread.subject.kind === "project" ? project : `${label} · ${project}`;
}
