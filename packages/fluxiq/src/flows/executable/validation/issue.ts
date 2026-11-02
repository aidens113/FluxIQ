export type AutomationStudioValidationSeverity = "error" | "warning" | "info";

export type AutomationStudioValidationIssue = {
  severity: AutomationStudioValidationSeverity;
  code: string;
  message: string;
  path: string;
};

export type AutomationStudioValidationResult = {
  ok: boolean;
  issues: AutomationStudioValidationIssue[];
};

export function addIssue(
  issues: AutomationStudioValidationIssue[],
  severity: AutomationStudioValidationSeverity,
  code: string,
  message: string,
  path: string
): void {
  issues.push({ severity, code, message, path });
}

export function result(issues: AutomationStudioValidationIssue[]): AutomationStudioValidationResult {
  return {
    ok: issues.every((issue) => issue.severity !== "error"),
    issues
  };
}
