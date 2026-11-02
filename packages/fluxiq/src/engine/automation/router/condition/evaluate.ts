import type { AutomationConditionExpression } from "@fluxiq/contracts/state";
import type { ExecutableRouteConditionInput, ExecutableRouteConditionResult } from "../../../../flows/executable/routing/index.ts";
import { executableRouteGroupReason } from "./group.ts";
import { evaluateExecutableAtomicCondition } from "./atomic.ts";

export function evaluateExecutableRouteCondition(expression: AutomationConditionExpression | undefined, input: ExecutableRouteConditionInput): ExecutableRouteConditionResult {
  if (!expression) return { matched: true, reason: "No condition configured." };
  if ("conditions" in expression) {
    const children = expression.conditions.map((child) => evaluateExecutableRouteCondition(child, input));
    if (expression.type === "all") return { matched: children.every((child) => child.matched), reason: executableRouteGroupReason(expression.type, children) };
    if (expression.type === "any") return { matched: children.some((child) => child.matched), reason: executableRouteGroupReason(expression.type, children) };
    if (expression.type === "none") return { matched: children.every((child) => !child.matched), reason: executableRouteGroupReason(expression.type, children) };
    const weightedScore = expression.conditions.reduce((score, child, index) => score + (children[index]?.matched ? child.weight : 0), 0);
    return { matched: weightedScore >= expression.threshold, reason: `Weighted condition score ${weightedScore} ${weightedScore >= expression.threshold ? "met" : "missed"} threshold ${expression.threshold}.` };
  }
  return evaluateExecutableAtomicCondition(expression, input);
}
