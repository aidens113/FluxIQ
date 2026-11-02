import type { AutomationNodeExecutionResult } from "../../../components/automation/index.ts";
import { outputDispatchFailure } from "./record.ts";
export function unregisteredOutputResult(outputId: string): AutomationNodeExecutionResult {
  const error = `Output is not registered: ${outputId}`;
  return { status: "failed", route: "failed", effects: [], outputs: { error }, message: error, failure: outputDispatchFailure("blocked_by_capability_or_policy", "output_dispatch.output_not_registered", false, "dispatch") };
}
