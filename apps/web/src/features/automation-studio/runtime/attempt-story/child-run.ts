import { runtimeAttemptRecord } from "./attempt-record";
import type { RuntimeAttemptStoryLine } from "./story-line";

/** How a called Flow's own run ended, by its graph status. */
const ENDED: Readonly<Record<string, string>> = Object.freeze({
  succeeded: "it finished",
  failed: "it failed",
  waiting: "it is waiting",
  cancelled: "it was stopped",
  running: "it is still running"
});

/**
 * The `childTrace` record of a Call Flow step: the called Flow ran as its own
 * run, and this says how many steps it took and how it ended. The called
 * Flow's id stays in the Raw JSON tab.
 */
export function runtimeChildRunLine(attempt: unknown): RuntimeAttemptStoryLine | undefined {
  const child = runtimeAttemptRecord(attempt, "childTrace");
  if (!child) return undefined;
  const steps = Array.isArray(child.attempts) ? child.attempts.length : undefined;
  const counted = steps === undefined ? "" : ` ${steps} ${steps === 1 ? "step" : "steps"},`;
  const ended = ENDED[String(child.status)] ?? "with no recorded ending";
  return { kind: "child_run", text: `Ran the Flow this step calls:${counted} ${ended}.` };
}
