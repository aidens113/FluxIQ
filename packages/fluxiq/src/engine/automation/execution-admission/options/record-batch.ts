import type { AutomationStudioGraphExecutionOptions } from "../../contracts/index.ts";
import { automationPropertyDescriptor } from "./descriptor.ts";

/** Observed execution never invokes an option accessor while looking for a record callback. */
export function assertAutomationRecordBatchData(options: AutomationStudioGraphExecutionOptions): void {
  const field = automationPropertyDescriptor(options, "onRecordBatch");
  if (field && !("value" in field)) throw new Error("execution_observation.record_batch_accessor_unsupported");
}
