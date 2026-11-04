// Where a task got to, in one sentence: how it ended or waits, how many steps it took and
// the last one. The count is the steps a person is shown (quiet reads not counted) once the
// steps are read, and the attempt's own count until then, or when no steps were kept.

import type { ChatTaskOutcome } from "../../../chat/ports/index.ts";
import type { TaskStep } from "../port.ts";
import { waitingReason } from "./waiting.ts";

function stepsWords(count: number): string {
  return count === 1 ? "1 step" : `${count} steps`;
}

/** `steps`: the attempt's steps, or undefined while they are not read. */
export function whereItGotTo(attempt: ChatTaskOutcome["attempt"], steps?: readonly TaskStep[]): string {
  const shown = steps?.filter((step) => step.quiet !== true);
  const count = shown !== undefined && shown.length > 0 ? shown.length : attempt.liveSteps;
  const last = shown?.at(-1)?.title;
  if (count === 0) return attempt.status === "working" ? "It is starting. It has not taken a step yet." : "No steps are recorded for this attempt.";
  const at = last === undefined ? "" : ` The last one was \u201c${last}\u201d.`;
  const reason = waitingReason(attempt);
  if (reason !== undefined) return `It had taken ${stepsWords(count)}${reason === "interrupted" ? " when it stopped" : " so far"}.${at}`;
  switch (attempt.status) {
    case "working":
      return `Working. ${stepsWords(count)} so far.${at}`;
    case "budget_out":
      return `It reached its budget after ${stepsWords(count)}.${at}`;
    case "stopped_by_person":
      return `You stopped it after ${stepsWords(count)}.${at}`;
    default:
      return `Finished in ${stepsWords(count)}.${at}`;
  }
}
