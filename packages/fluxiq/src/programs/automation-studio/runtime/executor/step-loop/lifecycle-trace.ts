import type { AutomationStudioGraphExecutionTrace, AutomationStudioIncidentTraceRecord, AutomationStudioNodeAttemptTrace } from "../contracts.ts";
import type { AutomationStudioInvocationOptions } from "../frames/index.ts";
import type { AutomationStudioRunIncident } from "../lifecycle-run/index.ts";
import type { AutomationStudioStepLifecycleFrame } from "./lifecycle-frame.ts";

/**
 * A frame's saved trace with what lifecycle dispatch adds to it (C11):
 *
 * - each handler body's attempts, where the body ran, each already carrying
 *   its `framePath` through the handler frame; they are saved attempts, whose
 *   values the body's own run already withheld;
 * - on the run's root frame only, every `handler_execution` record of the run,
 *   whichever frame it fired in, what dispatch could not do, and every
 *   recovery incident with how it ended and the retries it spent (C7), which
 *   the run's counts read, and the ids of the in-run repairs whose overlay
 *   the run kept (C6 step 8), which the run session saves only after the
 *   run's judged end.
 *
 * A run that dispatched no handler and met no failure gets its trace back
 * unchanged.
 */
export function automationStudioTraceWithLifecycle(
  trace: AutomationStudioGraphExecutionTrace,
  lifecycle: AutomationStudioStepLifecycleFrame,
  invocation: AutomationStudioInvocationOptions | undefined
): AutomationStudioGraphExecutionTrace {
  const attempts = lifecycle.bodies.length ? withBodies(trace.attempts, lifecycle.bodies) : trace.attempts;
  const root = invocation && !invocation.frame.parentInvocationId ? invocation.run.lifecycle : undefined;
  const executions = root?.executions ?? [];
  const notes = [...new Set(root?.problems ?? [])];
  const incidents = [...(root?.incidents.values() ?? [])].map(incidentRecord);
  const repairs = [...(root?.repairs.values() ?? [])].flatMap((repair) => (repair.outcome === "held" && repair.repairId ? [repair.repairId] : []));
  if (attempts === trace.attempts && !executions.length && !notes.length && !incidents.length && !repairs.length) return trace;
  return {
    ...trace,
    attempts,
    ...(executions.length ? { handlerExecutions: executions.map((record) => ({ ...record, framePath: [...record.framePath] })) } : {}),
    ...(notes.length ? { lifecycleNotes: notes } : {}),
    ...(incidents.length ? { incidents } : {}),
    ...(repairs.length ? { repairs } : {})
  };
}

/** One incident as the trace keeps it: a copy, so the run's own record is never shared with what is persisted. */
function incidentRecord(incident: AutomationStudioRunIncident): AutomationStudioIncidentTraceRecord {
  return {
    incidentId: incident.incidentId,
    origin: { ...incident.origin, framePath: [...incident.origin.framePath] },
    handlersRun: [...incident.handlersRun],
    routes: incident.routes.map((route) => ({ ...route })),
    alternatives: incident.alternatives.map((alternative) => ({ ...alternative })),
    startedAt: incident.startedAt,
    ...(incident.trueFailure ? { trueFailure: true } : {}),
    ending: incident.ending ?? "ended",
    retries: incident.retries ?? 0
  };
}

/** The frame's attempts with each body's attempts placed before the attempt that followed it. */
function withBodies(
  attempts: readonly AutomationStudioNodeAttemptTrace[],
  bodies: AutomationStudioStepLifecycleFrame["bodies"]
): AutomationStudioNodeAttemptTrace[] {
  const merged: AutomationStudioNodeAttemptTrace[] = [];
  let next = 0;
  for (let index = 0; index <= attempts.length; index += 1) {
    while (next < bodies.length && bodies[next]!.at <= index) {
      merged.push(...bodies[next]!.attempts);
      next += 1;
    }
    if (index < attempts.length) merged.push(attempts[index]!);
  }
  for (; next < bodies.length; next += 1) merged.push(...bodies[next]!.attempts);
  return merged;
}
