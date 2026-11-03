import type { AutomationConditionExpression } from "@fluxiq/contracts/state";



/**
 * One text for a condition, with the order of a group's members kept. Two
 * rules with the same text test the same thing, so the later one can never be
 * taken.
 */
export function automationStudioRouteConditionKey(expression: AutomationConditionExpression): string {
  if ("conditions" in expression) {
    return `${expression.type}(${expression.conditions.map((child) => automationStudioRouteConditionKey(child)).join(",")})`;
  }
  return `${expression.signalPath} ${expression.operator} ${JSON.stringify(expression.expected ?? null)}`;
}
