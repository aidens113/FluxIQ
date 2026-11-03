import type { AutomationStudioLlmStepLogRow } from "./row.ts";
import { listNativeExchangeLogStep } from "./operation.ts";

/** Best-effort synchronous index writing, shared with the internal native entry. */
export function automationStudioLlmStepLogListStep(directory: string, row: AutomationStudioLlmStepLogRow): void {
  listNativeExchangeLogStep(directory, row);
}
