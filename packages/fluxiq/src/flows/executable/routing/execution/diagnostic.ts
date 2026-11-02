export type ExecutableRoutePlanDiagnostic = {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  ruleId?: string;
  subflowId?: string;
};
