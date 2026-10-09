import { runtimeAttemptRecord } from "./attempt-record";
import type { RuntimeAttemptStoryLine } from "./story-line";
import { runtimeStoryNumber, runtimeWaitWords } from "./words";

/** The `pace` record before the step started: what holding to the step's pace cost. */
export function runtimePaceHeldLine(attempt: unknown): RuntimeAttemptStoryLine | undefined {
  const pace = runtimeAttemptRecord(attempt, "pace");
  const waitedMs = runtimeStoryNumber(pace?.waitedMs);
  if (!pace || waitedMs === undefined || waitedMs <= 0) return undefined;
  const inForceMs = runtimeStoryNumber(pace.inForceMs);
  const keep = inForceMs !== undefined && inForceMs > 0 ? `to keep at least ${runtimeWaitWords(inForceMs)} between starts of this step` : "to keep this step's pace";
  return { kind: "pace", text: `Held back ${runtimeWaitWords(waitedMs)} ${keep}.` };
}

/** The `pace` record after a failure that carried a wait hint: the pace the run holds the step to from then on. */
export function runtimePaceRaisedLine(attempt: unknown): RuntimeAttemptStoryLine | undefined {
  const raisedToMs = runtimeStoryNumber(runtimeAttemptRecord(attempt, "pace")?.raisedToMs);
  if (raisedToMs === undefined || raisedToMs <= 0) return undefined;
  return { kind: "pace", text: `Slowed this step down because the site asked to: from now on at least ${runtimeWaitWords(raisedToMs)} between its starts.` };
}
