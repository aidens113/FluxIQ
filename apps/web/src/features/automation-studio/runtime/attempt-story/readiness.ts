import { runtimeAttemptRecord } from "./attempt-record";
import type { RuntimeAttemptStoryLine } from "./story-line";
import { runtimeStoryNumber, runtimeWaitWords } from "./words";

/**
 * The `readiness` record: the wait for the state the step expected before it
 * ran. A page that was ready at once says nothing. A page that never became
 * ready is a mark, not a failure: the step was tried anyway, unless the run
 * passed it over (`skipped`), in which case that line says where it went.
 */
export function runtimeReadinessLine(attempt: unknown): RuntimeAttemptStoryLine | undefined {
  const readiness = runtimeAttemptRecord(attempt, "readiness");
  if (!readiness) return undefined;
  const waitedMs = runtimeStoryNumber(readiness.waitedMs) ?? 0;
  const checked = runtimeStoryNumber(readiness.checkedConditionCount);
  if (readiness.satisfied === true) {
    return waitedMs > 0 ? { kind: "readiness", text: `Waited ${runtimeWaitWords(waitedMs)} for the page to be ready for this step.` } : undefined;
  }
  if (readiness.satisfied !== false || (checked === 0 && waitedMs === 0)) return undefined;
  const passedOver = runtimeAttemptRecord(attempt, "skipped") !== undefined;
  const lead = waitedMs > 0 ? `Waited ${runtimeWaitWords(waitedMs)} for the page to be ready for this step, but it was not` : "The page was not ready for this step";
  return { kind: "readiness", text: passedOver ? `${lead}.` : `${lead}, so the step was tried anyway.` };
}
