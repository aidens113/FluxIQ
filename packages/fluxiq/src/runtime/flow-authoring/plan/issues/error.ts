import type { AutomationStudioFlowBootstrapIssue } from "../../../../flows/authoring/plan/index.ts";



export function error(code: string, message: string, path?: string): AutomationStudioFlowBootstrapIssue {
  return { severity: "error", code, message, ...(path ? { path } : {}) };
}
