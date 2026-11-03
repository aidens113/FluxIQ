import type { AutomationStudioFlowBootstrapRouteTest } from "./test.ts";

/**
 * A route's condition: Core's `AutomationConditionExpression`, narrowed to the
 * operators the router evaluates, JSON values, and the three plain groups.
 * Every value of it is an `AutomationConditionExpression`.
 */
export type AutomationStudioFlowBootstrapRouteCondition =
  | AutomationStudioFlowBootstrapRouteTest
  | { type: "all" | "any" | "none"; conditions: AutomationStudioFlowBootstrapRouteCondition[] };
