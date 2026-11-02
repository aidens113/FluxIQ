import type { AutomationCondition } from "@fluxiq/contracts/state";
import type { ExecutableRouteConditionInput, ExecutableRouteConditionResult } from "../../../../flows/executable/routing/index.ts";
import { compareExecutableRouteNumbers } from "./numeric.ts";
import { matchExecutableRoutePattern } from "./pattern.ts";
import { normalizedExecutableRouteText } from "./text.ts";
import { executableRouteValueAtPath } from "./path.ts";

export function evaluateExecutableAtomicCondition(condition: AutomationCondition, input: ExecutableRouteConditionInput): ExecutableRouteConditionResult {
  const value = executableRouteValueAtPath({ inputs: input.inputs ?? {}, state: input.currentStateSummary ?? {} }, condition.signalPath);
  const expected = condition.expected;
  if (condition.operator === "exists") return { matched: value !== undefined && value !== null, reason: `${condition.signalPath} ${value === undefined || value === null ? "does not exist" : "exists"}.` };
  if (condition.operator === "equals") return { matched: value === expected, reason: `${condition.signalPath} equals expected value: ${String(value === expected)}.` };
  if (condition.operator === "not_equals") return { matched: value !== expected, reason: `${condition.signalPath} differs from expected value: ${String(value !== expected)}.` };
  if (condition.operator === "greater_than") return compareExecutableRouteNumbers(value, expected, (left, right) => left > right, condition.signalPath, "greater than");
  if (condition.operator === "less_than") return compareExecutableRouteNumbers(value, expected, (left, right) => left < right, condition.signalPath, "less than");
  if (condition.operator === "contains") return { matched: String(value ?? "").includes(String(expected ?? "")), reason: `${condition.signalPath} contains expected text.` };
  if (condition.operator === "matches") return matchExecutableRoutePattern(value, expected, condition.signalPath);
  if (condition.operator === "became_true") return { matched: value === true, reason: `${condition.signalPath} is true.` };
  if (condition.operator === "became_false") return { matched: value === false, reason: `${condition.signalPath} is false.` };
  if (condition.operator === "similar_to") return { matched: normalizedExecutableRouteText(value) === normalizedExecutableRouteText(expected), reason: `${condition.signalPath} normalized text comparison evaluated.` };
  return { matched: false, reason: `${condition.operator} requires transition history and is not supported by the router matcher yet.` };
}
