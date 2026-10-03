import type { AutomationStudioRuntimeSession } from "../../../model/index.ts";
import { AutomationStudioProjectStoreUnavailableError } from "../../../storage/index.ts";
import { errorMessage } from "../error-message.ts";

/** What ending a run reaches the service for. */
export type AutomationStudioRuntimeSessionEndingPorts = {
  getRuntimeSession(projectId: string, runId: string): Promise<AutomationStudioRuntimeSession | null>;
  writeRuntimeSession(projectId: string, session: AutomationStudioRuntimeSession): Promise<void>;
  /**
   * Settles what the run left waiting on its judged end -- a runtime patch held
   * for it (t249) -- once the run is known to have thrown. Handed the session as
   * it now stands, and hands back the session as the settle left it (it may
   * note there what the store could not take). A failure here joins the
   * caller's error rather than hiding it.
   */
  settleAfterThrow?: (session: AutomationStudioRuntimeSession) => Promise<AutomationStudioRuntimeSession | void>;
  now?: () => number;
};

/** How a run that threw ends: the session to hand back, or the error to throw. */
export type AutomationStudioRuntimeSessionEnding = { session: AutomationStudioRuntimeSession } | { error: unknown };

/**
 * Ends a run that threw before it recorded how it ended, and says what the
 * caller should do: throw an error, or hand back the ended session.
 *
 * A run's session is written `queued` before its start can fail, and `running`
 * before its Flow executes. Left in either state, it counts as active: it holds
 * the project's next adaptive run off until somebody cancels it. So it is
 * written `failed`, with the error as its reason, in the trace message and in
 * `metadata.runFailure` (which also says which state the run was in).
 *
 * A session that already records an outcome (succeeded, failed, cancelled or
 * waiting) is left as it is: a cancellation, or an outcome written before a
 * later step threw, is the truer account. So is a session that is no longer
 * stored, which is not recreated.
 *
 * The caller's error comes back unchanged. When the session cannot be read or
 * written, an `AggregateError` holding both failures comes back instead, so
 * that neither is lost.
 *
 * **A run whose project store went away does not throw (t258).** When the
 * error says the store is unavailable, the session -- kept outside that store
 * -- is ended as above, notes the store's absence in
 * `metadata.projectStoreUnavailable`, and comes back as the run's result. It
 * keeps its own outcome: a run that failed at a step before the store went away
 * ends failed for that step's reason, not for the store. Only a failure to read
 * or write the session itself is still thrown.
 */
export async function endAutomationStudioRuntimeSessionAfterThrow(
  ports: AutomationStudioRuntimeSessionEndingPorts,
  projectId: string,
  runId: string,
  error: unknown
): Promise<AutomationStudioRuntimeSessionEnding> {
  const reason = errorMessage(error, String(error));
  let current: AutomationStudioRuntimeSession | null;
  try {
    current = await ports.getRuntimeSession(projectId, runId);
    if (current?.status === "queued" || current?.status === "running") current = await markFailed(ports, projectId, current, reason);
  } catch (endingError) {
    return { error: new AggregateError(
      [error, endingError],
      `${reason} The run's session could not be marked failed: ${errorMessage(endingError, String(endingError))}`
    ) };
  }
  if (!current) return { error };
  // Settled whatever the session said: a run that threw after it recorded an
  // outcome still never reached the judgement its held patch waits for.
  if (ports.settleAfterThrow) {
    try {
      current = (await ports.settleAfterThrow(current)) || current;
    } catch (settleError) {
      return { error: new AggregateError([error, settleError], `${reason} What the run held for its judged end could not be settled: ${errorMessage(settleError, String(settleError))}`) };
    }
  }
  if (!AutomationStudioProjectStoreUnavailableError.is(error)) return { error };
  const ended: AutomationStudioRuntimeSession = {
    ...current,
    metadata: { ...(current.metadata ?? {}), projectStoreUnavailable: { at: (ports.now ?? Date.now)(), sessionStatus: current.status, reason } }
  };
  try {
    await ports.writeRuntimeSession(projectId, ended);
    return { session: ended };
  } catch (writeError) {
    return { error: new AggregateError([error, writeError], `${reason} The run's session could not record that its store was unavailable: ${errorMessage(writeError, String(writeError))}`) };
  }
}

async function markFailed(ports: AutomationStudioRuntimeSessionEndingPorts, projectId: string, current: AutomationStudioRuntimeSession, reason: string): Promise<AutomationStudioRuntimeSession> {
  const failedAt = (ports.now ?? Date.now)();
  const failed: AutomationStudioRuntimeSession = {
    ...current,
    status: "failed",
    finishedAt: failedAt,
    trace: {
      attempts: [],
      values: {},
      effects: [],
      ...current.trace,
      status: "failed",
      startedAt: current.trace?.startedAt ?? current.startedAt ?? current.queuedAt,
      finishedAt: failedAt,
      message: reason
    },
    metadata: { ...(current.metadata ?? {}), runFailure: { at: failedAt, sessionStatus: current.status, reason } }
  };
  await ports.writeRuntimeSession(projectId, failed);
  return failed;
}
