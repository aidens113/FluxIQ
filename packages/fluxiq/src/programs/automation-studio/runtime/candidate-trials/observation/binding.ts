import type { AutomationExecutionAdmissionSource } from "../../../../../engine/automation/execution-admission/index.ts";
import type { PartialTrialContext } from "../partial/index.ts";

/** An existing admitted parent and its actual connected producers; it grants no new root or scope. */
export interface TrialExecutionObservation extends PartialTrialContext {
  readonly automation: AutomationExecutionAdmissionSource;
}
