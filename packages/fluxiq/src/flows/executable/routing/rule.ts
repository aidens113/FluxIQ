import type { AutomationConditionExpression } from "@fluxiq/contracts/state";
import type { ExecutableDefinitionStatus } from "../definition-status.ts";
import type { ExecutableRouteTarget } from "./target.ts";

export type ExecutableRouteRule = {
  ruleId: string;
  target: ExecutableRouteTarget;
  order: number;
  status: ExecutableDefinitionStatus;
  condition?: AutomationConditionExpression;
};
