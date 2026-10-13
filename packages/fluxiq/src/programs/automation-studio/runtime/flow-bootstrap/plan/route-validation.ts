// Whether a plan's Router can tell its situations apart.
//
// The router runs every rule in order and takes the first that holds. That
// makes three rule lists wrong in a way no single rule shows:
//
//   - a rule with no condition, which always holds, so every rule after it
//     and the fallback can never run -- the collapse every live-built Flow had
//     on 2026-09-18;
//   - two rules with the same condition, where the second can never be taken;
//   - a Subflow no rule, no fallback and no calling step reaches, which is
//     steps that can never run however the page looks.
//
// Each is refused here, before anything is built, rather than left to become
// a Flow that silently always does one thing.
import type { AutomationConditionExpression } from "../../../model/index.ts";
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_STATE_NODE_IDS, type AutomationStudioFlowBootstrapIssue, type AutomationStudioFlowBootstrapPlan } from "./contracts.ts";
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
  const reached = reachedSubflows(plan, issues);
  for (const [index, subflow] of plan.subflows.entries()) {
    if (reached.has(subflow.key)) continue;
    issues.push(error("bootstrap.subflow_unreachable", "No route, fallback, registered recovery handler or call from a reachable Subflow runs this Subflow, so its steps could never run.", `plan.subflows.${index}`));
  }
  return issues;
}

/** Calls contribute reachability only when their caller is itself reached. */
function reachedSubflows(plan: AutomationStudioFlowBootstrapPlan, issues: AutomationStudioFlowBootstrapIssue[]): Set<string> {
  const declared = new Set(plan.subflows.map((subflow) => subflow.key));
  const calls = new Map<string, string[]>();
  const roots = plan.router.rules.map((rule) => rule.targetSubflowKey);
  if (plan.router.fallback.kind === "subflow") roots.push(plan.router.fallback.targetSubflowKey);
  for (const [subflowIndex, subflow] of plan.subflows.entries()) {
    const targets: string[] = [];
    for (const [nodeIndex, node] of subflow.nodes.entries()) {
      if (subflow.role === "recovery" && node.definitionId === AUTOMATION_STUDIO_FLOW_BOOTSTRAP_STATE_NODE_IDS.handler) roots.push(subflow.key);
      if (node.definitionId !== AUTOMATION_STUDIO_FLOW_BOOTSTRAP_STATE_NODE_IDS.callSubflow) continue;
      const called = node.parameters?.subflowId;
      if (called === undefined) continue; // The required parameter is validated by the node's contract.
      if (typeof called !== "string" || !declared.has(called)) {
        issues.push(error("bootstrap.unknown_call_target", "Call Subflow must name a Subflow key declared in this candidate plan.", `plan.subflows.${subflowIndex}.nodes.${nodeIndex}.parameters.subflowId`));
        continue;
      }
      targets.push(called);
    }
    calls.set(subflow.key, targets);
  }
  const reached = new Set<string>();
  for (let cursor = 0; cursor < roots.length; cursor += 1) {
    const key = roots[cursor]!;
    if (!declared.has(key) || reached.has(key)) continue;
    reached.add(key);
    roots.push(...calls.get(key) ?? []);
  }
  return reached;
}
