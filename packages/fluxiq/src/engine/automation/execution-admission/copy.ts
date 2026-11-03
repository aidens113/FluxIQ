import type { AutomationStudioGraphExecutionOptions } from "../contracts/index.ts";
import type { ExecutionObservationContext } from "../../../runtime/execution-admission/index.ts";
import { inheritAutomationExecutionObservation } from "./inherit.ts";
import { AutomationRetrySeries } from "./kernel/series.ts";
import { AutomationExpectationDiagnostics } from "../expectation-observation/companion/index.ts";
import { AutomationObservationBindings } from "./bindings.ts";
import { assertAutomationEnumerableData } from "./options/index.ts";
import { markAutomationCallbackFrameUnknownSync } from "./kernel/callback/unknown-sync.ts";

/** Copies public options with their private execution and diagnostic companions. */
export function copyAutomationExecutionOptions(source: AutomationStudioGraphExecutionOptions | undefined, changes: Partial<AutomationStudioGraphExecutionOptions> = {}, parent?: ExecutionObservationContext | null): AutomationStudioGraphExecutionOptions {
  if (source && AutomationObservationBindings.of(source)) {
    try {
      assertAutomationEnumerableData(source);
      assertAutomationEnumerableData(changes);
    } catch (error) {
      markAutomationCallbackFrameUnknownSync(source);
      throw error;
    }
  }
  const target = { ...source, ...changes };
  if (source) {
    // A prepared target cannot bind its observation until its real callback enters.
    if (parent === null) AutomationRetrySeries.inherit(source, target);
    else inheritAutomationExecutionObservation(source, target, parent);
    AutomationExpectationDiagnostics.inherit(source, target);
  }
  return target;
}
