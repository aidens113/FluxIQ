import type { AutomationNodeExecutionResult } from "../../../components/automation/index.ts";
// A wait the target reports clearing by itself is carried on to the executor,
// which tells the run's activity stream; whether it is readable is decided
// there, so a failed dispatch carries it too. Absent stays absent.
export function clearedWaitField(clearedWait: AutomationNodeExecutionResult["clearedWait"]): Pick<AutomationNodeExecutionResult, "clearedWait"> {
  return clearedWait !== undefined ? { clearedWait } : {};
}
