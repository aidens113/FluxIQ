import type { ExecutableRouterExecutionPlan } from "../../../executable/routing/index.ts";
import type { AutomationStudioFlowRouteRule } from "../rule.ts";
import type { AutomationStudioFlowSubflow } from "../subflow.ts";

export type AutomationStudioRouterExecutionPlan = ExecutableRouterExecutionPlan<AutomationStudioFlowRouteRule, AutomationStudioFlowSubflow>;
