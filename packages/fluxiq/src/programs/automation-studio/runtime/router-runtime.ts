import type { AutomationStudioAdaptationPolicy, AutomationStudioFlowArtifact, AutomationStudioFlowRouteRule, AutomationStudioFlowRouter, AutomationStudioFlowSubflow } from "../model/index.ts";
import type { ExecutableRouterExecutionInput, ExecutableCompiledRouteRule, ExecutableRouterExecutionPlan, ExecutableRouterExecutionResult } from "../../../flows/executable/routing/index.ts";

export { compileExecutableRouterPlan as compileAutomationStudioRouterPlan, runExecutableRouter as runAutomationStudioRouter, evaluateExecutableRouteCondition as evaluateAutomationStudioRouteCondition } from "../../../engine/automation/router/index.ts";
export type { ExecutableRoutePlanDiagnostic as AutomationStudioRoutePlanDiagnostic, ExecutableRouteRuleEvaluation as AutomationStudioRouteRuleEvaluation } from "../../../flows/executable/routing/index.ts";

export type AutomationStudioRouterExecutionInput = Omit<ExecutableRouterExecutionInput<AutomationStudioFlowRouter, AutomationStudioFlowSubflow>, "adaptationPolicy"> & { adaptationPolicy?: AutomationStudioAdaptationPolicy };
export type AutomationStudioCompiledRouteRule = ExecutableCompiledRouteRule<AutomationStudioFlowRouteRule, AutomationStudioFlowSubflow>;
export type AutomationStudioRouterExecutionPlan = ExecutableRouterExecutionPlan<AutomationStudioFlowRouteRule, AutomationStudioFlowSubflow>;
export type AutomationStudioRouterExecutionResult = ExecutableRouterExecutionResult<AutomationStudioFlowSubflow>;

/** Studio artifact projection remains an adapter; routing is owned by the engine. */
export function defaultAutomationStudioSubflowForFlow(flow: AutomationStudioFlowArtifact): AutomationStudioFlowSubflow {
  return {
    schemaVersion: "0.1",
    subflowId: `${flow.flowId}.default-subflow`,
    flowId: flow.flowId,
    projectId: flow.projectId,
    name: flow.name,
    ...(flow.description ? { description: flow.description } : {}),
    role: "primary",
    status: "active",
    graphFlowId: flow.flowId,
    createdAt: flow.createdAt,
    updatedAt: flow.updatedAt,
    metadata: { generatedDefault: true }
  };
}
