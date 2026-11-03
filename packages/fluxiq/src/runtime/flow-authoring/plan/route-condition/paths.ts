import type { AutomationConditionExpression } from "@fluxiq/contracts/state";



/**
 * The paths a condition reads, in the order it reads them. A path read twice
 * is listed once.
 */
export function automationStudioRouteConditionPaths(expression: AutomationConditionExpression | undefined): string[] {
  const paths: string[] = [];
  const visit = (node: AutomationConditionExpression): void => {
    if ("conditions" in node) {
      node.conditions.forEach(visit);
      return;
    }
    if (!paths.includes(node.signalPath)) paths.push(node.signalPath);
  };
  if (expression) visit(expression);
  return paths;
}
