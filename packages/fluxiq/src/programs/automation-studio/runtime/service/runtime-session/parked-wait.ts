import type { AutomationStudioRuntimeSession } from "../../../model/index.ts";
import { emitAutomationStudioActivityAskResolved, runWithAutomationStudioActivity } from "../../activity/index.ts";

/**
 * Settles, in the activity stream, the wait of a run that was parked on a
 * question and is ended without an answer -- cancelled, today -- so the ask's
 * card stops waiting.
 *
 * A durably parked run said it was waiting when it parked, in the run's own
 * unit of work, which has long ended by the time anything ends the run. So the
 * row is said in that run's unit again (`run:<runId>`): the parked ask's own
 * row (`ref` the ask id, its title), `failed`, with `resolution` -- `cancelled`
 * for a run cancelled while parked -- in the `failed` phase, as the run ends.
 *
 * `session` is the run as it stood before it was ended. One that is not
 * parked (its status is not `waiting`, or its trace holds no `parked`) had no
 * open wait, and nothing is said.
 */
export function settleAutomationStudioParkedRunWait(projectId: string, session: AutomationStudioRuntimeSession, resolution: "cancelled" | "timed_out"): void {
  const parked = session.trace?.parked;
  if (session.status !== "waiting" || !parked) return;
  const scope = { kind: "run" as const, id: session.runId, projectId, ...(session.flowId ? { flowId: session.flowId } : {}) };
  runWithAutomationStudioActivity(scope, () => emitAutomationStudioActivityAskResolved(parked.ask, resolution, "failed"));
}
