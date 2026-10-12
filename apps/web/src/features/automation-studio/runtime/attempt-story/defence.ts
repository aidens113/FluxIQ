import { runtimeAttemptRecord } from "./attempt-record";
import type { RuntimeAttemptStoryLine } from "./story-line";

/**
 * The `fault` record: how the run's defensive policy read this attempt's
 * failure, in the words the chat's recovery choice uses when the ladder stops.
 * The fault's code and category stay in the Raw JSON tab.
 */
export function runtimeDefenceLine(attempt: unknown): RuntimeAttemptStoryLine | undefined {
  const fault = runtimeAttemptRecord(attempt, "fault");
  if (!fault) return undefined;
  if (fault.disposition === "retry") return { kind: "defence", text: "The run judged this failure safe to try again." };
  if (fault.disposition !== "refuse") return undefined;
  return fault.actUncertain === true
    ? { kind: "defence", text: "Not repeating the step: it may already have gone through, and repeating it could do it twice." }
    : { kind: "defence", text: "Not repeating the step: another try wouldn't change what happened." };
}
