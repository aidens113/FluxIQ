// The one shape every refusal in this directory takes: an error at the script
// line that made the statement, so the refusal locator places it on the step
// written there (`../authoring/locate-issue.ts`, `flow.line.<N>`). A statement
// refusal without a line could not be found by the model that wrote it.
import type { AutomationStudioFlowBootstrapIssue } from "../plan/index.ts";

/** A refusal of a written statement, at the line it was written on. */
export function scriptStatementRefusal(code: string, message: string, line: number): AutomationStudioFlowBootstrapIssue {
  return { severity: "error", code, message, path: `flow.line.${line}` };
}
