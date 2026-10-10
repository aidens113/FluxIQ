import type { RuntimeAttemptStoryLine } from "./story-line";

/** The failure classes a person needs told apart; a retry, skip or state route is told by its own record. */
const CLASS: Readonly<Record<string, string>> = Object.freeze({
  true_failure: "A true failure: nothing in the Flow took the run past this step.",
  planned_fail: "A planned failure: the Flow's own way on for this failure took the run on.",
  uncertain: "Uncertain: the step may already have gone through, and nothing settled whether it did."
});

/**
 * The `failureClass` stamp (Core's state-aware recovery plan, C6, C11): what a
 * failed attempt counted as, from the attempt or a copy under `metadata`. Only
 * a true failure asks for an in-run repair.
 */
export function runtimeFailureClassLine(attempt: unknown): RuntimeAttemptStoryLine | undefined {
  const record = attempt as { failureClass?: unknown; metadata?: unknown };
  const metadata = typeof record.metadata === "object" && record.metadata !== null ? record.metadata as { failureClass?: unknown } : {};
  const failureClass = record.failureClass ?? metadata.failureClass;
  const text = typeof failureClass === "string" ? CLASS[failureClass] : undefined;
  return text ? { kind: "failure_class", text } : undefined;
}
