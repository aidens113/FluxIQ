import { type RuntimeFailureRecord } from "@fluxiq/contracts/runtime";
import type { JsonValue } from "../../../core/index.ts";
import type { AutomationNodeExecutionResult, AutomationNodeTargetResolution } from "../../../components/automation/index.ts";
import { targetResolutionField } from "./target-resolution.ts";
export function failedDispatchResult(outputs: Record<string, JsonValue>, detail: {
  message: string | undefined;
  failure: RuntimeFailureRecord | null;
  resolution: AutomationNodeTargetResolution | undefined;
}): AutomationNodeExecutionResult {
  return {
    status: "failed",
    route: "failed",
    outputs,
    ...(detail.message ? { message: detail.message } : {}),
    ...(detail.failure ? { failure: detail.failure } : {}),
    ...targetResolutionField(detail.resolution)
  };
}
