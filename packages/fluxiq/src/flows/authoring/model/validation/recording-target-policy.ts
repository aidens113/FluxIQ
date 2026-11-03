import type { ActionTarget } from "../actions.ts";
import type { AutomationStudioValidationIssue } from "../../../executable/validation/index.ts";

/** A registered domain's checks of the target data a recording carries; recording data never chooses the policy. */
export type AutomationStudioRecordingTargetPolicy = {
  targetIssues(target: ActionTarget, path: string): readonly AutomationStudioValidationIssue[];
  parameterIssues(parameters: Record<string, unknown>, path: string): readonly AutomationStudioValidationIssue[];
};
