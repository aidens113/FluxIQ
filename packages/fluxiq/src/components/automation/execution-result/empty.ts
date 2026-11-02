import type { AutomationNodeExecutionResult } from "../contracts.ts";
import type { JsonValue } from "../../../core/index.ts";

export function emptyResult(outputs: Record<string, unknown> = {}): AutomationNodeExecutionResult {
  return { status: "success", route: "success", outputs: outputs as Record<string, JsonValue> };
}
