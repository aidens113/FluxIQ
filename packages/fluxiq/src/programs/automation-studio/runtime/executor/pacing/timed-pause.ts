import type { AutomationStudioGraphExecutionOptions, AutomationStudioNodeAttemptTrace } from "../contracts.ts";
import { automationStudioRunWait } from "./run-wait.ts";

/**
 * Takes the pause a node asked for and goes on, rather than ending the run.
 *
 * A node asks for a timed pause by answering `waiting` with a whole
 * `durationMs` output and no question to a person -- the Wait node
 * (`nodes/timing/wait.ts`) does. Until t378 the graph run returned the whole
 * run `waiting` on it, with nothing parked to resume from, so the node after a
 * Wait never ran and a pause in a loop ended the loop (lane D, `wait ->
 * math.add` ended `{"status":"waiting","parked":null}`). The run now sleeps the
 * duration and the attempt settles `succeeded`, keeping what it asked for and
 * what it was given.
 *
 * The pause is held to the run's own limits: its deadline (`deadlineAt`), the
 * time its region has left, and its signal, which ends the sleep at once.
 * Answers nothing for an attempt that is not a timed pause -- an approval or any
 * other question parks as before.
 */
export async function automationStudioTimedPause(input: {
  attempt: AutomationStudioNodeAttemptTrace;
  options: AutomationStudioGraphExecutionOptions;
  now: () => number;
  regionRemainingMs?: number | undefined;
}): Promise<AutomationStudioNodeAttemptTrace | undefined> {
  const { attempt, options, now } = input;
  const requestedMs = attempt.outputs.durationMs;
  if (attempt.status !== "waiting" || attempt.ask || typeof requestedMs !== "number" || !Number.isFinite(requestedMs) || requestedMs < 0) return undefined;
  const deadlineLeft = options.deadlineAt === undefined ? Number.POSITIVE_INFINITY : Math.max(0, options.deadlineAt - now());
  const waitMs = Math.round(Math.min(requestedMs, deadlineLeft, Math.max(0, input.regionRemainingMs ?? Number.POSITIVE_INFINITY)));
  await options.commandRun?.checkpoint();
  await automationStudioRunWait(options, waitMs);
  await options.commandRun?.checkpoint();
  return { ...attempt, status: "succeeded", finishedAt: now(), pause: { requestedMs, waitedMs: waitMs, ...(waitMs < requestedMs ? { bounded: true as const } : {}) } };
}
