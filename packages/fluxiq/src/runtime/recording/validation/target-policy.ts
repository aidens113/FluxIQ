import type { AutomationStudioValidationIssue } from "../../../flows/executable/validation/index.ts";
export type RecordingTargetValidationPolicy<TTarget> = {
  targetIssues(target: TTarget, path: string): readonly AutomationStudioValidationIssue[];
  parameterIssues(parameters: Record<string, unknown>, path: string): readonly AutomationStudioValidationIssue[];
};
