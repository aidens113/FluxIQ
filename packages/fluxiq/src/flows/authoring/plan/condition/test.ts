import type { AUTOMATION_STUDIO_ROUTE_CONDITION_OPERATORS } from "./operators.ts";

/** One test a route makes: a path, an operator, and the value it is tested against. */
export type AutomationStudioFlowBootstrapRouteTest = {
  signalPath: string;
  operator: (typeof AUTOMATION_STUDIO_ROUTE_CONDITION_OPERATORS)[number];
  expected?: string | number | boolean;
};
