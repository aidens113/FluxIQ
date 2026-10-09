import { runtimeAttemptRecord } from "./attempt-record";
import type { RuntimeAttemptStoryLine } from "./story-line";
import { runtimeStoryNumber, runtimeWaitWords } from "./words";

/**
 * Why each ladder rung asks for another attempt, in the words the chat's
 * recovery choice uses (Core's `activity/wording/recovery-choice.ts`).
 */
const WHY: Readonly<Record<string, string>> = Object.freeze({
  retry_node: "a step like this often works on a second try",
  await_recorded_state: "the page wasn't yet the way this step expects",
  clear_interference: "something on the page was in the way"
});

/**
 * The `retry` record: which attempt of the step this is, what the run waited
 * before it, and why the ladder put the step back on the page. A wait the site
 * itself asked for (`hintedWaitMs`) says so, as the chat does.
 */
export function runtimeRetriedLine(attempt: unknown): RuntimeAttemptStoryLine | undefined {
  const retry = runtimeAttemptRecord(attempt, "retry");
  if (!retry) return undefined;
  const attemptNumber = runtimeStoryNumber(retry.attemptNumber);
  const maxAttempts = runtimeStoryNumber(retry.maxAttempts);
  const backoffMs = runtimeStoryNumber(retry.backoffMs);
  const hinted = runtimeStoryNumber(retry.hintedWaitMs);
  const which = attemptNumber !== undefined ? `Attempt ${attemptNumber}${maxAttempts !== undefined ? ` of ${maxAttempts}` : ""}: tried` : "Tried";
  const wait = backoffMs === undefined ? "" : backoffMs > 0 ? ` after waiting ${runtimeWaitWords(backoffMs)}` : " straight away";
  const why = hinted !== undefined && hinted > 0 ? "the site asked to slow down" : WHY[String(retry.rung)] ?? "the step didn't work the first time";
  return { kind: "retried", text: `${which} the step again${wait}, because ${why}.` };
}
