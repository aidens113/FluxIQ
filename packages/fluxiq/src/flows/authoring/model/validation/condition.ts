import type { AutomationConditionExpression } from "../index.ts";
import { addIssue, type AutomationStudioValidationIssue } from "./issue.ts";

export function validateConditionExpression(
  expression: AutomationConditionExpression,
  issues: AutomationStudioValidationIssue[],
  path: string
): void {
  if ("conditions" in expression) {
    if (expression.conditions.length === 0) {
      addIssue(issues, "warning", "condition.empty_group", "Condition groups should contain at least one condition.", `${path}.conditions`);
    }
    if (expression.type === "weighted" && (expression.threshold < 0 || expression.threshold > 1)) {
      addIssue(issues, "error", "condition.invalid_threshold", "Weighted condition threshold must be between 0 and 1.", `${path}.threshold`);
    }
    for (const [index, child] of expression.conditions.entries()) {
      validateConditionExpression(child, issues, `${path}.conditions.${index}`);
    }
    return;
  }

  if (!expression.signalPath) {
    addIssue(issues, "error", "condition.missing_signal_path", "Condition must reference a signalPath.", `${path}.signalPath`);
  }
  if (expression.weight !== undefined && (expression.weight < 0 || expression.weight > 1)) {
    addIssue(issues, "error", "condition.invalid_weight", "Condition weight must be between 0 and 1.", `${path}.weight`);
  }
}
