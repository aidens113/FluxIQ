import type { AutomationStudioRuntimeSession } from "../../../model/index.ts";
import { errorMessage } from "../error-message.ts";

/** What ending a run reaches the service for. */
export type AutomationStudioRuntimeSessionEndingPorts = {
  getRuntimeSession(projectId: string, runId: string): Promise<AutomationStudioRuntimeSession | null>;
  writeRuntimeSession(projectId: string, session: AutomationStudioRuntimeSession): Promise<void>;
  now?: () => number;
};

/**
 * Ends a run that threw before it recorded how it ended, and returns the error
 * the caller should throw.
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
 */
export async function endAutomationStudioRuntimeSessionAfterThrow(
  ports: AutomationStudioRuntimeSessionEndingPorts,
  projectId: string,
  runId: string,
  error: unknown
): Promise<unknown> {
  const reason = errorMessage(error, String(error));
  try {
    const current = await ports.getRuntimeSession(projectId, runId);
    if (current?.status !== "queued" && current?.status !== "running") return error;
    const failedAt = (ports.now ?? Date.now)();
    await ports.writeRuntimeSession(projectId, {
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
    });
    return error;
  } catch (endingError) {
    return new AggregateError(
      [error, endingError],
      `${reason} The run's session could not be marked failed: ${errorMessage(endingError, String(endingError))}`
    );
  }
}
