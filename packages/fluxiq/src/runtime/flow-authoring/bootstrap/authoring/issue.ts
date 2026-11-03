// The two issues plan authoring raises, built here so every one of them reads
// the same. An error refuses the build; a warning says what was left out and
// lets it through.
import type { AutomationStudioFlowBootstrapIssue } from "../plan/index.ts";

export function authoringError(code: string, message: string, path: string): AutomationStudioFlowBootstrapIssue {
  return { severity: "error", code, message, path };
}

export function authoringWarning(code: string, message: string, path: string): AutomationStudioFlowBootstrapIssue {
  return { severity: "warning", code, message, path };
}
