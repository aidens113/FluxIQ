import { runtimeAttemptRecord } from "./attempt-record";
import type { RuntimeAttemptStoryLine } from "./story-line";

/**
 * An attempt the `clear_interference` rung asked for: the run first ran the
 * Flow's own step for what was in the way (an overlay, a consent prompt), then
 * tried this step again.
 */
export function runtimeInterferenceLine(attempt: unknown): RuntimeAttemptStoryLine | undefined {
  const retry = runtimeAttemptRecord(attempt, "retry");
  if (retry?.rung !== "clear_interference") return undefined;
  return { kind: "interference", text: "Cleared what was in the way on the page before this attempt." };
}
