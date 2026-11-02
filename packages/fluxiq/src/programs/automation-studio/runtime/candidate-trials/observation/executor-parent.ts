import type { AutomationStudioGraphExecutionOptions } from "../../../../../engine/automation/contracts/index.ts";
import { inheritAutomationExecutionObservation } from "../../../../../engine/automation/execution-admission/index.ts";
import type { ExecutionObservationContext } from "../../../../../runtime/execution-admission/index.ts";

/** The target's values are pinned before entry; only its private binding follows the actual callback parent. */
export function bindTrialExecutorParent(source: AutomationStudioGraphExecutionOptions, target: AutomationStudioGraphExecutionOptions, parent?: ExecutionObservationContext): void {
  inheritAutomationExecutionObservation(source, target, parent);
}
