import type { AutomationStudioProblem } from "../../../api/contracts.ts";

// How a problem listing orders itself, and what it says when a host has no
// artifacts yet.

export function problemSeverityRank(value: string): number { return value === "error" ? 0 : value === "warning" ? 1 : 2; }
export function baselineAutomationStudioProblems(): AutomationStudioProblem[] {
  return [{
    id: "automation-studio.host-artifacts",
    severity: "info",
    message: "Automation Studio is ready for host-owned artifacts. Create or load a project to begin recording and authoring."
  }];
}
