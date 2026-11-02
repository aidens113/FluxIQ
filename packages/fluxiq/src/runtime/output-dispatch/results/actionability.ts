import type { AutomationNodeExecutionResult } from "../../../components/automation/index.ts";
import { readRuntimeTargetActionability } from "../../result-control/index.ts";
export function actionabilityField(result: unknown): Pick<AutomationNodeExecutionResult, "actionability"> {
  const reading = readRuntimeTargetActionability(result);
  return reading.kind === "valid" ? { actionability: reading.record } : {};
}
