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

/**
 * Why a handler did not help, by the closed reason Core keeps on an
 * `unhandled` (Core's `executor/lifecycle/unhandled-reason.ts`, t411). A
 * completion check that did not hold is said from the check's own answer, and
 * a refused route from the guard that refused it (`ROUTE_REFUSED`).
 */
const UNHANDLED: Readonly<Record<string, string>> = Object.freeze({
  written_unhandled: "its own steps said it could not deal with it",
  body_failed: "its own steps did not finish",
  disposition_not_allowed: "the way on it chose is not allowed at this point",
  resolve_missing_outputs: "it did not produce everything the step needs",
  budget_spent: "the run had no recovery tries left",
  already_tried: "it had already been tried for this problem",
  no_body: "it has no steps to run",
  core_stop: "the run was stopped"
});

/** Why a route back was refused, by the guard that refused it. */
const ROUTE_REFUSED: Readonly<Record<string, string>> = Object.freeze({
  checkpoint_not_found: "the step it sent the run back to could not be found",
  checkpoint_not_holding: "the page was not ready for the step it sent the run back to",
  requires_unbound: "the step it sent the run back to needs a value the run did not have",
  passes_uncertain_act: "going back would pass a step that may already have gone through",
  unreachable: "the run could not get to the step it sent the run back to",
  unguarded: "the run could not tell what going back would do again",
  repeats_unrecorded_act: "going back would do a finished step again"
});

function outcome(lifecycle: Record<string, unknown>, options: RuntimeAttemptStoryOptions): string {
  const disposition = runtimeAttemptRecord(lifecycle, "disposition");
  if (disposition?.kind === "resume") return "It dealt with it, and the run carried on.";
  if (disposition?.kind === "route") return `Went back to ${runtimeStepWords(disposition.checkpointId, options)}.`;
  if (disposition?.kind === "resolve") return "Used the other way: the run went on with what the handler produced.";
  const why = unhandledWhy(disposition?.reason, disposition?.guard, lifecycle.completionCheck);
  return why ? `It did not help: ${why}.` : "It did not help.";
}

/** Why an `unhandled` did not help, in words; undefined when the record says nothing a person could use. */
function unhandledWhy(reason: unknown, guard: unknown, completionCheck: unknown): string | undefined {
  if (reason === "route_refused") return ROUTE_REFUSED[String(guard)] ?? "going back was not allowed";
  const said = typeof reason === "string" ? UNHANDLED[reason] : undefined;
  if (said) return said;
  // `completion_check_not_true`, and a record from before t411 that kept no reason.
  if (completionCheck === "false") return "its check found the situation still there";
  if (completionCheck === "unknown") return "its check could not tell whether the situation was gone";
  return undefined;
}
