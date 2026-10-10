import { runtimeAttemptRecord } from "./attempt-record";
import type { RuntimeAttemptStoryLine, RuntimeAttemptStoryOptions } from "./story-line";
import { runtimeStepWords } from "./words";

/** When each lifecycle event fires, as a person says it. */
const WHEN: Readonly<Record<string, string>> = Object.freeze({
  start: "When the part started",
  before: "Before a step",
  retry: "Before trying the step again",
  fail: "When the step failed",
  before_next: "Before the next step"
});

/**
 * The `lifecycle` record (Core's state-aware recovery plan, C3, C5, C11): which
 * handler ran, at which boundary, and how it ended, read from the dispatcher's
 * decided `disposition` and its `completionCheck`, never from the handler's
 * own words. The handler is named by its situation when the caller has the
 * Flow in hand (`handlerName`), else by its id.
 */
export function runtimeHandlerLine(attempt: unknown, options: RuntimeAttemptStoryOptions = {}): RuntimeAttemptStoryLine | undefined {
  const lifecycle = runtimeAttemptRecord(attempt, "lifecycle");
  const handlerId = lifecycle?.handlerId;
  if (!lifecycle || typeof handlerId !== "string" || !handlerId) return undefined;
  const when = WHEN[String(lifecycle.event)] ?? "During the step";
  const situation = options.handlerName?.(handlerId)?.trim() || `“${handlerId}”`;
  return { kind: "handler", text: `${when}, the handler for ${situation} ran. ${outcome(lifecycle, options)}` };
}

function outcome(lifecycle: Record<string, unknown>, options: RuntimeAttemptStoryOptions): string {
  const disposition = runtimeAttemptRecord(lifecycle, "disposition");
  if (disposition?.kind === "resume") return "It dealt with it, and the run carried on.";
  if (disposition?.kind === "route") return `Went back to ${runtimeStepWords(disposition.checkpointId, options)}.`;
  if (disposition?.kind === "resolve") return "Used the other way: the run went on with what the handler produced.";
  if (lifecycle.completionCheck === "false") return "It did not settle it: its check found the situation still there.";
  if (lifecycle.completionCheck === "unknown") return "It did not settle it: its check could not tell whether the situation was gone.";
  return "It did not settle it.";
}
