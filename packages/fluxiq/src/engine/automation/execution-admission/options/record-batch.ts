import type { AutomationStudioGraphExecutionOptions } from "../../contracts/index.ts";

/** Observed execution never invokes an option accessor while looking for a record callback. */
export function assertAutomationRecordBatchData(options: AutomationStudioGraphExecutionOptions): void {
  for (let current: object | null = options; current; current = Object.getPrototypeOf(current)) {
    const field = Object.getOwnPropertyDescriptor(current, "onRecordBatch");
    if (!field) continue;
    if (!("value" in field)) throw new Error("execution_observation.record_batch_accessor_unsupported");
    return;
  }
}
