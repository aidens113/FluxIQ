// Both re-author routes, built from one set of dependencies, for the run
// service to hand the verification in one line.
//
// `runtime/service.ts` is at its line ratchet, and the two routes borrow the
// same things from it -- the run's caller, the Flow's id and cost limit, the
// build and its review -- so they are built together here rather than wired
// twice there.

import type { AutomationStudioFailedStepRepairPort, AutomationStudioRefutedResultRepairPort } from "../../recovery/refuted-result/index.ts";
import { automationStudioRefutedResultRepairPort, type AutomationStudioRefutedResultRepairPortDependencies } from "./refuted-result-port.ts";
import { automationStudioStepFailureRepairPort } from "./step-failure-port.ts";

/** The wrong-answer route and the failed-step route, as the verification's ports. */
export function automationStudioResultRepairPorts(deps: AutomationStudioRefutedResultRepairPortDependencies): {
  repairRefutedResult: AutomationStudioRefutedResultRepairPort;
  repairFailedStep: AutomationStudioFailedStepRepairPort;
} {
  return { repairRefutedResult: automationStudioRefutedResultRepairPort(deps), repairFailedStep: automationStudioStepFailureRepairPort(deps) };
}
