import { numberValue } from "../shared/definition";
import type { AutomationNodeExecutionContext } from "../contracts";

export function binaryNumbers(context: AutomationNodeExecutionContext): [number, number] {
  return [numberValue(context.inputs.left), numberValue(context.inputs.right)];
}
