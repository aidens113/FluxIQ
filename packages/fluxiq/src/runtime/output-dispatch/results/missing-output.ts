import type { AutomationNodeExecutionResult } from "../../../components/automation/index.ts";
import { outputDispatchFailure } from "./record.ts";
export function missingOutputIdResult(runtimeLabel: "IO runtime" | "runtime"): AutomationNodeExecutionResult {
  const error = `Policy action has no outputId; legacy actionType execution is not supported by the ${runtimeLabel}.`;
  return { status: "failed", route: "failed", effects: [], outputs: { error }, message: error, failure: outputDispatchFailure("graph_validation_or_unknown_node", "output_dispatch.missing_output_id", false, "dispatch") };
}
