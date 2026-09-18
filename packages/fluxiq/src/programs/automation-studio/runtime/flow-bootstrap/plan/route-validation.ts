// Whether a plan's Router can tell its situations apart.
//
// The router runs every rule in order and takes the first that holds. That
// makes three rule lists wrong in a way no single rule shows:
//
//   - a rule with no condition, which always holds, so every rule after it
//     and the fallback can never run -- the collapse every live-built Flow had
//     on 2026-09-18;
//   - two rules with the same condition, where the second can never be taken;
//   - a Subflow no rule and no fallback reaches, which is steps that can never
//     run however the page looks.
//
// Each is refused here, before anything is built, rather than left to become
// a Flow that silently always does one thing.
import type { AutomationConditionExpression } from "../../../model/index.ts";
import type { AutomationStudioFlowBootstrapIssue, AutomationStudioFlowBootstrapPlan } from "./contracts.ts";
import { error } from "./issues.ts";
import { automationStudioRouteConditionIssues, automationStudioRouteConditionKey } from "./route-condition.ts";

export function automationStudioFlowBootstrapRouteIssues(plan: AutomationStudioFlowBootstrapPlan): AutomationStudioFlowBootstrapIssue[] {
  const issues: AutomationStudioFlowBootstrapIssue[] = [];
  const conditions = new Map<string, number>();
  for (const [index, rule] of plan.router.rules.entries()) {
    const path = `plan.router.rules.${index}`;
    if (rule.condition === undefined) {
      issues.push(error("bootstrap.route_condition_missing", "A route with no condition always holds, so nothing after it could ever run; say when this route is taken.", `${path}.condition`));
      continue;
    }
    const shape = automationStudioRouteConditionIssues(rule.condition, `${path}.condition`);
    issues.push(...shape);
    if (shape.some((issue) => issue.severity === "error")) continue;
    const key = automationStudioRouteConditionKey(rule.condition as AutomationConditionExpression);
    const earlier = conditions.get(key);
    if (earlier !== undefined) {
      issues.push(error("bootstrap.route_shadowed", `This route tests exactly what route ${earlier + 1} tests, so it could never be taken.`, `${path}.condition`));
      continue;
    }
    conditions.set(key, index);
  }
  const reached = new Set(plan.router.rules.map((rule) => rule.targetSubflowKey));
  if (plan.router.fallback.kind === "subflow") reached.add(plan.router.fallback.targetSubflowKey);
  for (const [index, subflow] of plan.subflows.entries()) {
    if (reached.has(subflow.key)) continue;
    issues.push(error("bootstrap.subflow_unreachable", "No route and no fallback runs this Subflow, so its steps could never run.", `plan.subflows.${index}`));
  }
  return issues;
}
