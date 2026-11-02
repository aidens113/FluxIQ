import type { AutomationNodeExecutionResult } from "../../../components/automation/index.ts";
import type { OutputTargetPreparation } from "../target-preparation.ts";
import { targetResolutionField } from "./target-resolution.ts";
export function elementTargetRejectionResult(outputId: string, rejection: Extract<OutputTargetPreparation, {
  ok: false;
}>): AutomationNodeExecutionResult {
  return {
    status: "failed",
    route: "failed",
    effects: [],
    outputs: { outputId, ok: false, error: rejection.error },
    message: rejection.error,
    failure: rejection.failure,
    ...targetResolutionField(rejection.resolution)
  };
}
