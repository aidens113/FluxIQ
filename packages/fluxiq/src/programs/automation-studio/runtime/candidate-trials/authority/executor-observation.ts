import type { AutomationStudioGraphExecutionOptions } from "../../../../../engine/automation/contracts/index.ts";
import { bindAutomationExecutionObservation, hasAutomationExecutionObservation, inheritAutomationExecutionObservation } from "../../../../../engine/automation/execution-admission/index.ts";
import { candidateTrialExecutionObservation } from "./execution-observation.ts";
import { candidateTrialObservationContext } from "./observation-context.ts";
import { isCandidateTrialReadOnlyInvocation } from "./read-only.ts";

/** Preserve the original run proof and retry series while forwarding the actual current parent. */
export function inheritCandidateTrialExecutorObservation(input: object, source: AutomationStudioGraphExecutionOptions, target: AutomationStudioGraphExecutionOptions): void {
  if (isCandidateTrialReadOnlyInvocation(input)) return;
  const bound = hasAutomationExecutionObservation(source);
  inheritAutomationExecutionObservation(source, target, candidateTrialObservationContext(input));
  if (!bound) {
    const observation = candidateTrialExecutionObservation(input);
    if (observation) bindAutomationExecutionObservation(target, observation);
  }
}
