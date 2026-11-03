import { AUTOMATION_STUDIO_ROUTE_CONDITION_LIMITS, AUTOMATION_STUDIO_ROUTE_CONDITION_OPERATORS, AUTOMATION_STUDIO_ROUTE_SIGNAL_PATH } from "../../../../flows/authoring/plan/index.ts";
import type { AutomationStudioFlowBootstrapIssue } from "../../../../flows/authoring/plan/index.ts";
import { isRecord } from "../json/index.ts";
import { error } from "../issues/index.ts";

/** Operators whose test needs no expected value. */
const VALUE_FREE_OPERATORS: ReadonlySet<string> = new Set(["exists", "became_true", "became_false"]);
const NUMERIC_OPERATORS: ReadonlySet<string> = new Set(["greater_than", "less_than"]);
const ROUTE_OPERATORS: ReadonlySet<string> = new Set(AUTOMATION_STUDIO_ROUTE_CONDITION_OPERATORS);
const GROUP_TYPES: ReadonlySet<string> = new Set(["all", "any", "none"]);

/** The issues that make `value` something other than a condition the router can evaluate. */
export function automationStudioRouteConditionIssues(value: unknown, path: string): AutomationStudioFlowBootstrapIssue[] {
  const issues: AutomationStudioFlowBootstrapIssue[] = [];
  checkExpression(value, path, 1, issues);
  return issues;
}

function checkExpression(value: unknown, path: string, depth: number, issues: AutomationStudioFlowBootstrapIssue[]): void {
  if (!isRecord(value)) {
    issues.push(error("bootstrap.route_condition_invalid", "A route condition must be an object.", path));
    return;
  }
  if ("conditions" in value || "type" in value) {
    checkGroup(value, path, depth, issues);
    return;
  }
  const extra = Object.keys(value).filter((key) => key !== "signalPath" && key !== "operator" && key !== "expected");
  if (extra.length) issues.push(error("bootstrap.route_condition_invalid", "A route condition holds only signalPath, operator and expected.", `${path}.${extra[0]}`));
  const signalPath = value.signalPath;
  if (typeof signalPath !== "string" || !AUTOMATION_STUDIO_ROUTE_SIGNAL_PATH.test(signalPath)) {
    issues.push(error("bootstrap.route_condition_path", "A route condition reads an inputs.* or state.* path.", `${path}.signalPath`));
  }
  const operator = value.operator;
  if (typeof operator !== "string" || !ROUTE_OPERATORS.has(operator)) {
    issues.push(error("bootstrap.route_condition_operator", "A route condition uses an operator the router evaluates.", `${path}.operator`));
    return;
  }
  const expected = value.expected;
  if (VALUE_FREE_OPERATORS.has(operator)) {
    if (expected !== undefined) issues.push(error("bootstrap.route_condition_value", "This test takes no expected value.", `${path}.expected`));
    return;
  }
  if (!isScalar(expected)) {
    issues.push(error("bootstrap.route_condition_value", "This test needs an expected text, number or true/false.", `${path}.expected`));
    return;
  }
  if (typeof expected === "string" && (!expected.length || expected.length > AUTOMATION_STUDIO_ROUTE_CONDITION_LIMITS.maxExpectedLength)) {
    issues.push(error("bootstrap.route_condition_value", "An expected text must be nonempty and bounded.", `${path}.expected`));
  }
  if (NUMERIC_OPERATORS.has(operator) && !Number.isFinite(Number(expected))) {
    issues.push(error("bootstrap.route_condition_value", "A comparison needs a number.", `${path}.expected`));
  }
  if (operator === "matches" && (typeof expected !== "string" || !compiles(expected))) {
    issues.push(error("bootstrap.route_condition_value", "A match needs a valid pattern.", `${path}.expected`));
  }
}

function checkGroup(value: Record<string, unknown>, path: string, depth: number, issues: AutomationStudioFlowBootstrapIssue[]): void {
  const extra = Object.keys(value).filter((key) => key !== "type" && key !== "conditions");
  if (extra.length) issues.push(error("bootstrap.route_condition_invalid", "A condition group holds only type and conditions.", `${path}.${extra[0]}`));
  if (typeof value.type !== "string" || !GROUP_TYPES.has(value.type)) {
    issues.push(error("bootstrap.route_condition_invalid", "A condition group is all, any or none.", `${path}.type`));
  }
  if (depth >= AUTOMATION_STUDIO_ROUTE_CONDITION_LIMITS.maxDepth) {
    issues.push(error("bootstrap.route_condition_invalid", "Route conditions nest too deeply.", path));
    return;
  }
  const conditions = value.conditions;
  if (!Array.isArray(conditions) || conditions.length === 0 || conditions.length > AUTOMATION_STUDIO_ROUTE_CONDITION_LIMITS.maxGroupSize) {
    issues.push(error("bootstrap.route_condition_invalid", "A condition group holds one to eight conditions.", `${path}.conditions`));
    return;
  }
  conditions.forEach((child, index) => checkExpression(child, `${path}.conditions.${index}`, depth + 1, issues));
}

function isScalar(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));
}

function compiles(pattern: string): boolean {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}
