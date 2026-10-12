// Marking an incident a true failure, and what a failed attempt counted as
// (state-aware recovery plan, C6 "What counts as a true failure", C7, C11).
//
// This module owns applying the classifier (`../lifecycle/true-failure.ts`)
// to a run: the incident is marked `trueFailure` at the moment the
// definition is met, the only trigger for in-run repair, and graph-run reads
// the attempt's trace `failureClass` from the same verdict through the one
// mapping (`../lifecycle/failure-class-trace.ts`).

import type { AutomationStudioIncidentEnding, AutomationStudioTraceFailureClass } from "../contracts.ts";
import type { AutomationStudioRunFrames } from "../frames/index.ts";
import { automationStudioTraceFailureClass, classifyAutomationStudioFailure, type AutomationStudioFailureClass } from "../lifecycle/index.ts";

/** What the classifier is told about one failure. */
export type AutomationStudioFailureFacts = Parameters<typeof classifyAutomationStudioFailure>[0];

/** How each verdict settles an incident; a retry and a pending On Fail settle nothing. */
const INCIDENT_ENDING: Readonly<Record<AutomationStudioFailureClass, AutomationStudioIncidentEnding | undefined>> = Object.freeze({
  true_failure: "true_failure",
  planned_fail: "planned_fail",
  deliberate_stop: "planned_fail",
  retry_superseded: undefined,
  skip: "skip",
  state_route: "state_route",
  outcome_uncertain: "uncertain",
  on_fail_pending: undefined
});

/**
 * Classifies the failure and, when it is a `true_failure`, marks the incident
 * so. An incident once marked stays marked. The verdict is returned with the
 * attempt's trace `failureClass` (absent for `on_fail_pending`, which is a
 * dispatcher step, not an outcome).
 *
 * The incident also keeps what the counts read (C6, C7): a retry adds one to
 * its `retries` and leaves it unsettled, since the next attempt decides it;
 * any other verdict but `on_fail_pending` is how it ended, the latest one
 * standing, so a child's true failure its Call Subflow node's On Fail path then
 * handles ends as the parent's planned fail.
 */
export function markAutomationStudioIncidentFailure(run: AutomationStudioRunFrames, incidentId: string | undefined, facts: AutomationStudioFailureFacts): {
  verdict: AutomationStudioFailureClass;
  failureClass?: AutomationStudioTraceFailureClass;
} {
  const verdict = classifyAutomationStudioFailure(facts);
  const incident = incidentId ? run.lifecycle.incidents.get(incidentId) : undefined;
  if (incident && verdict === "true_failure") incident.trueFailure = true;
  if (incident && verdict === "retry_superseded") {
    incident.retries = (incident.retries ?? 0) + 1;
    delete incident.ending;
  }
  const ending = INCIDENT_ENDING[verdict];
  if (incident && ending) incident.ending = ending;
  const failureClass = automationStudioTraceFailureClass(verdict);
  return failureClass === undefined ? { verdict } : { verdict, failureClass };
}

/** The attempt's trace `failureClass` for these facts, without touching any incident. */
export function automationStudioAttemptFailureClass(facts: AutomationStudioFailureFacts): AutomationStudioTraceFailureClass | undefined {
  return automationStudioTraceFailureClass(classifyAutomationStudioFailure(facts));
}
