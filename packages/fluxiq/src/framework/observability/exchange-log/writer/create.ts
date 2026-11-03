import type { AutomationStudioLlmStepLogWriter } from "./contract.ts";
import { NativeExchangeLogWriter } from "./native.ts";

/**
 * The writer for one step folder. Every write is best-effort: a disk that
 * refuses a step file never changes or fails the call the step records.
 */
export function automationStudioLlmStepLogWriter(folder: string): AutomationStudioLlmStepLogWriter {
  return new NativeExchangeLogWriter(folder).writer;
}
