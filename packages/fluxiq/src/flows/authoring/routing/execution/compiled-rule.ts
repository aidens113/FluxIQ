import type { ExecutableCompiledRouteRule } from "../../../executable/routing/index.ts";
import type { AutomationStudioFlowRouteRule } from "../rule.ts";
import type { AutomationStudioFlowSubflow } from "../subflow.ts";

export type AutomationStudioCompiledRouteRule = ExecutableCompiledRouteRule<AutomationStudioFlowRouteRule, AutomationStudioFlowSubflow>;
