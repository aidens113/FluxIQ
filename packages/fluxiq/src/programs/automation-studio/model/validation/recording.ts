import type { RecordingSession } from "../recordings.ts";
import type { ActionTarget } from "../actions.ts";
import { validateRecordingSession as validateSession, type RecordingTargetValidationPolicy } from "../../../../runtime/recording/validation/index.ts";
import type { AutomationStudioValidationResult } from "./issue.ts";

const structuralTargets: RecordingTargetValidationPolicy<unknown> = {
  targetIssues: () => [],
  parameterIssues: () => []
};

/** Supplied recording data never chooses a domain validator. */
export function validateRecordingSession(recording: RecordingSession, targetPolicy: RecordingTargetValidationPolicy<ActionTarget> = structuralTargets): AutomationStudioValidationResult {
  return validateSession(recording, targetPolicy);
}
