import type { AutomationNodeExecutionContext } from "../contracts.ts";
import type { JsonValue } from "../../../core/index.ts";

export function inputValue(context: AutomationNodeExecutionContext, id: string): JsonValue | undefined {
  return context.inputs[id] ?? context.parameters[id];
}
