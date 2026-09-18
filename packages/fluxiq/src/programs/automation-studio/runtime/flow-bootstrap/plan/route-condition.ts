// What a route rule's condition may be when a model writes it.
//
// A Router decides before any step runs, with no model: rules in order, each
// an `AutomationConditionExpression` over `inputs.*` and `state.*`, and the
// first that holds wins. A rule with no condition always holds, so everything
// after it -- later rules and the fallback -- can never run. Every Flow built
// live on 2026-09-18 was that: one Subflow behind a Router that always jumped
// to it. So a model-authored rule must carry a condition, and the condition
// must be one the router can actually evaluate.
//
// This module holds only the shape: which paths, which operators, which
// values. Whether a rule list can tell its situations apart is
// `./route-validation.ts`; how a condition is read out of the words a model
// wrote is `../authoring/condition.ts`.
import type { AutomationConditionExpression, AutomationConditionOperator } from "../../../model/index.ts";
import type { AutomationStudioFlowBootstrapIssue } from "./contracts.ts";
import { error } from "./issues.ts";
import { isRecord } from "./json-guards.ts";

/**
 * The operators the router evaluates on the state it is given. The rest of
 * Core's vocabulary -- `changed`, `increased`, `decreased`, `stable_for` --
 * needs a history of transitions the router does not have, so it fails
 * closed there and is refused here rather than authored into a rule that can
 * never hold.
 */
export const AUTOMATION_STUDIO_ROUTE_CONDITION_OPERATORS = [
  "equals",
  "not_equals",
  "exists",
  "greater_than",
  "less_than",
  "contains",
  "matches",
  "similar_to",
  "became_true",
  "became_false"
] as const satisfies readonly AutomationConditionOperator[];

/** One test a route makes: a path, an operator, and the value it is tested against. */
export type AutomationStudioFlowBootstrapRouteTest = {
  signalPath: string;
  operator: (typeof AUTOMATION_STUDIO_ROUTE_CONDITION_OPERATORS)[number];
  expected?: string | number | boolean;
};

/**
 * A route's condition: Core's `AutomationConditionExpression`, narrowed to the
 * operators the router evaluates, JSON values, and the three plain groups.
 * Every value of it is an `AutomationConditionExpression`.
 */
export type AutomationStudioFlowBootstrapRouteCondition =
  | AutomationStudioFlowBootstrapRouteTest
  | { type: "all" | "any" | "none"; conditions: AutomationStudioFlowBootstrapRouteCondition[] };

/** How a model is told to write a condition, used wherever one is refused. */
export const AUTOMATION_STUDIO_ROUTE_CONDITION_FORM = "Write a condition as `<path> <test> [value]`: the path is one listed under routing.paths, and the test is exists, is missing, is, is not, contains, does not contain, matches, starts with, greater than, less than, is true or is false. Join tests with `and` or `or`, or write `when:` twice for both.";

/** Operators whose test needs no expected value. */
const VALUE_FREE_OPERATORS: ReadonlySet<string> = new Set(["exists", "became_true", "became_false"]);
const NUMERIC_OPERATORS: ReadonlySet<string> = new Set(["greater_than", "less_than"]);
const ROUTE_OPERATORS: ReadonlySet<string> = new Set(AUTOMATION_STUDIO_ROUTE_CONDITION_OPERATORS);
const GROUP_TYPES: ReadonlySet<string> = new Set(["all", "any", "none"]);

/** `inputs.<name>` or `state.<name>`, dotted, each segment a plain word. */
export const AUTOMATION_STUDIO_ROUTE_SIGNAL_PATH = /^(?:inputs|state)(?:\.[A-Za-z0-9_-]{1,64}){1,6}$/u;

export const AUTOMATION_STUDIO_ROUTE_CONDITION_LIMITS = {
  /** Conditions one group may hold. */
  maxGroupSize: 8,
  /** Groups inside groups, counting the outermost. */
  maxDepth: 3,
  /** Characters an expected text may hold. */
  maxExpectedLength: 500
} as const;

/** The issues that make `value` something other than a condition the router can evaluate. */
export function automationStudioRouteConditionIssues(value: unknown, path: string): AutomationStudioFlowBootstrapIssue[] {
  const issues: AutomationStudioFlowBootstrapIssue[] = [];
  checkExpression(value, path, 1, issues);
  return issues;
}

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
