import type { RecordingSession } from "../recordings.ts";
import { isAutomationStudioElementTarget, validateAutomationStudioElementTarget } from "../action-element-target.ts";
import { validateRecordingSession as validateSession } from "../../../../runtime/recording/index.ts";
import type { AutomationStudioValidationResult } from "./issue.ts";
export function validateRecordingSession(recording: RecordingSession): AutomationStudioValidationResult {
  return validateSession(recording, {
    targetIssues: (target, path) => target?.elementTarget ? validateAutomationStudioElementTarget(target.elementTarget, `${path}.elementTarget`).issues : [],
    parameterIssues: (parameters, path) => isAutomationStudioElementTarget(parameters.target) ? validateAutomationStudioElementTarget(parameters.target, `${path}.target`).issues : []
  });
}
