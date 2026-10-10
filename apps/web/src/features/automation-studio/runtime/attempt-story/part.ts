import { runtimeAttemptRecord } from "./attempt-record";
import type { RuntimeAttemptStoryLine, RuntimeAttemptStoryOptions } from "./story-line";
import { runtimePartWords } from "./words";

/**
 * The `subflowTarget` record of a Call Subflow step (Core's state-aware
 * recovery plan, C1): the step ran a part of this Flow, whose own steps follow
 * it in the run detail, each naming it as `parentAttemptId`.
 */
export function runtimePartLine(attempt: unknown, options: RuntimeAttemptStoryOptions = {}): RuntimeAttemptStoryLine | undefined {
  const subflowId = runtimeAttemptRecord(attempt, "subflowTarget")?.subflowId;
  if (typeof subflowId !== "string" || !subflowId) return undefined;
  return { kind: "part", text: `Ran the part ${runtimePartWords(subflowId, options)}; its steps are listed under this one.` };
}
