import { numberValue } from "../shared/definition";
import type { AutomationNodeExecutionContext } from "../contracts";

export function randomFloat(context: AutomationNodeExecutionContext): number {
  return context.random ? context.random() : Math.random();
}

export function randomInRange(context: AutomationNodeExecutionContext): number {
  const min = numberValue(context.parameters.min);
  const max = numberValue(context.parameters.max, 1);
  return Math.min(min, max) + randomFloat(context) * Math.abs(max - min);
}
