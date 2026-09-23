import type { AutomationStudioRuntimeSession } from "../../../model/index.ts";

// Whether a run session has reached an outcome it can no longer leave.

export function isTerminalRuntimeSessionStatus(status: AutomationStudioRuntimeSession["status"]): boolean {
  return status === "succeeded" || status === "failed" || status === "cancelled";
}
