import type { AutomationStudioGraphExecutionOptions } from "../contracts/index.ts";
import type { ExecutionObservationContext } from "../../../runtime/execution-admission/index.ts";
import { inheritAutomationExecutionObservation } from "./inherit.ts";
import { AutomationRetrySeries } from "./kernel/series.ts";

/** Copies public options and the original private observation/retry companions together. */
export function copyAutomationExecutionOptions(source: AutomationStudioGraphExecutionOptions | undefined, changes: Partial<AutomationStudioGraphExecutionOptions> = {}, parent?: ExecutionObservationContext | null): AutomationStudioGraphExecutionOptions {
  const target = { ...source, ...changes };
  if (source) {
    // A prepared target cannot bind its observation until its real callback enters.
    if (parent === null) AutomationRetrySeries.inherit(source, target);
    else inheritAutomationExecutionObservation(source, target, parent);
  }
  return target;
}
