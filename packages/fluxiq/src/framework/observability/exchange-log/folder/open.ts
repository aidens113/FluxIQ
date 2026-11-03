import type { AutomationStudioLlmStepLogFolder } from "./record.ts";
import { openNativeExchangeLogFolder } from "./operation.ts";

/** A synchronous exclusive numbered folder, shared with the internal native entry. */
export function automationStudioLlmStepLogOpenFolder(directory: string, kind: string): AutomationStudioLlmStepLogFolder {
  return openNativeExchangeLogFolder(directory, kind);
}
