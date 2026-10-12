// A run's retries, planned fails and true failures (state-aware recovery plan,
// C6, C7), counted from the recovery incidents its root trace carries
// (`executor/step-loop/lifecycle-trace.ts`) rather than from attempt stamps,
// which are written only in runs that have a Handler in scope; and the true
// failures the run repaired in place (C6 step 8), from the in-run repairs the
// root trace says were still held when the run ended.

import type { AutomationStudioFlowRunFailureCounts } from "../../../model/index.ts";
import { isJsonRecord } from "../json-values.ts";

/**
 * Counts `incidents`: every retry each spent, each that ended `planned_fail`,
 * and each true failure, repaired or not. `repairs` is the root trace's ids of
 * the in-run repairs still held at the end, one per incident.
 *
 * A held repair's incident was a true failure, but it does not end
 * `true_failure`: the fix's trial decides how it ends, usually `passed`. So a
 * true failure is an incident that ended `true_failure` or one a held repair
 * took the run past, and `repairedInRun` counts the second kind. An incident
 * that ended `true_failure` was not repaired: a fix whose trial failed is
 * dropped, and no longer held.
 *
 * The `trueFailure` mark alone is not counted: a child frame's true failure
 * that its Call Subflow node's own On Fail path then handled keeps the mark,
 * and ends `planned_fail`, which is what it is (C6).
 *
 * Session traces are read back from storage, so anything that is not an
 * incident record or a repair id counts nothing. No incidents count zero of
 * each.
 */
export function automationStudioRunFailureCounts(incidents: unknown, repairs?: unknown): AutomationStudioFlowRunFailureCounts {
  const repairedInRun = new Set(Array.isArray(repairs) ? repairs.filter((id): id is string => typeof id === "string" && id.length > 0) : []).size;
  const counts: AutomationStudioFlowRunFailureCounts = { retries: 0, plannedFails: 0, trueFailures: repairedInRun, repairedInRun };
  if (!Array.isArray(incidents)) return counts;
  for (const incident of incidents) {
    if (!isJsonRecord(incident)) continue;
    if (typeof incident.retries === "number" && Number.isFinite(incident.retries) && incident.retries > 0) counts.retries += Math.floor(incident.retries);
    if (incident.ending === "planned_fail") counts.plannedFails += 1;
    if (incident.ending === "true_failure") counts.trueFailures += 1;
  }
  return counts;
}
