import type { AutomationNodeExecutionResult } from "../contracts.ts";
import type { JsonValue } from "../../../core/index.ts";

export function failedResult(outputs: Record<string, unknown> = {}): AutomationNodeExecutionResult {
  return { status: "failed", route: "failed", outputs: outputs as Record<string, JsonValue> };
}
