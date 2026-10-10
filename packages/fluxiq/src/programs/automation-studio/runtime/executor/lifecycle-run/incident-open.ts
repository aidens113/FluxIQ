// Opening and closing a recovery incident (state-aware recovery plan, C7).
//
// This module owns the run's incident ledger. An incident opens at the first
// failed attempt that reaches a permitted retry (C6 step 5) and is keyed to
// that node arrival, so every later retry of the same arrival, and its On Fail
// dispatch, carries the same incident; it closes when the run passes the node
// or ends. A child frame's unresolved failure is carried to its Call Subflow
// node in the parent as the same incident, so handlers already tried for it
// are not run again there.

import type { AutomationStudioIncidentEnding } from "../contracts.ts";
import type { AutomationStudioFramePath, AutomationStudioRunFrames } from "../frames/index.ts";
import type { AutomationStudioRunIncident } from "./run-state.ts";

/**
 * The incident open at this node arrival, opened now when none is: keyed to
 * `invocationId` + `nodeId` + `arrival`. `carriedIncidentId` names a child
 * frame's incident that this failure continues; it is then the one returned,
 * re-keyed to this arrival. The executing frame's `incidentId` is set to it.
 */
export function openAutomationStudioRecoveryIncident(run: AutomationStudioRunFrames, input: {
  invocationId: string;
  nodeId: string;
  arrival: number;
  failureCode: string;
  at: number;
  carriedIncidentId?: string;
}): AutomationStudioRunIncident {
  const state = run.lifecycle;
  const key = automationStudioIncidentArrivalKey(input);
  const carried = input.carriedIncidentId ? state.incidents.get(input.carriedIncidentId) : undefined;
  const existing = carried ?? state.incidents.get(state.openByArrival.get(key) ?? "");
  const incident: AutomationStudioRunIncident = existing ?? {
    incidentId: state.nextId("incident"),
    origin: { framePath: framePathTo(run, input.invocationId), nodeId: input.nodeId, failureCode: input.failureCode },
    handlersRun: [],
    routes: [],
    alternatives: [],
    startedAt: input.at
  };
  state.incidents.set(incident.incidentId, incident);
  state.openByArrival.set(key, incident.incidentId);
  const frame = run.stack.find((candidate) => candidate.invocationId === input.invocationId);
  if (frame) frame.incidentId = incident.incidentId;
  return incident;
}

/**
 * Closes the incident: the run passed the node, or ended. It stays in the
 * run's ledger as a record, and no arrival maps to it any more; the frame that
 * held it no longer does. An incident nothing settled yet takes `ending`
 * (`passed` unless the caller says otherwise); one already settled keeps how
 * it ended.
 */
export function closeAutomationStudioRecoveryIncident(run: AutomationStudioRunFrames, incidentId: string, ending: AutomationStudioIncidentEnding = "passed"): void {
  const state = run.lifecycle;
  const incident = state.incidents.get(incidentId);
  if (incident && !incident.ending) incident.ending = ending;
  for (const [key, open] of [...state.openByArrival]) if (open === incidentId) state.openByArrival.delete(key);
  for (const frame of run.stack) if (frame.incidentId === incidentId) delete frame.incidentId;
}

/** The key an incident is held under: one node arrival in one frame. */
export function automationStudioIncidentArrivalKey(input: { invocationId: string; nodeId: string; arrival: number }): string {
  return `${input.invocationId}/${input.nodeId}#${input.arrival}`;
}

function framePathTo(run: AutomationStudioRunFrames, invocationId: string): AutomationStudioFramePath {
  const at = run.stack.findIndex((frame) => frame.invocationId === invocationId);
  return (at >= 0 ? run.stack.slice(0, at + 1) : run.stack).map((frame) => frame.invocationId);
}
