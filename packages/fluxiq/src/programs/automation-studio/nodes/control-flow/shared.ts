import { booleanValue, numberValue } from "../shared/definition";
import type { AutomationNodeExecutionContext } from "../contracts";

export function routeFromCondition(context: AutomationNodeExecutionContext, trueRoute = "true", falseRoute = "false"): string {
  return booleanValue(context.inputs.condition ?? context.parameters.condition) ? trueRoute : falseRoute;
}

export function maxIterations(context: AutomationNodeExecutionContext): number {
  return Math.max(0, Math.floor(numberValue(context.parameters.maxIterations, 25)));
}
