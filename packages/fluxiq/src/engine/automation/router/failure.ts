import type { ExecutableRouter, ExecutableRouteRule, ExecutableSubflowTarget, ExecutableRouterExecutionInput, ExecutableRouterExecutionPlan, ExecutableRouterExecutionResult, ExecutableRouteRuleEvaluation } from "../../../flows/executable/routing/index.ts";
import { executableRouteDecisionMetadata } from "./metadata.ts";

export function executableRouterFailureResult<TSubflow extends ExecutableSubflowTarget>(
  input: ExecutableRouterExecutionInput<ExecutableRouter, TSubflow>,
  plan: ExecutableRouterExecutionPlan<ExecutableRouteRule, TSubflow>,
  evaluations: ExecutableRouteRuleEvaluation[],
  rejectedRuleIds: string[],
  decidedAt: number
): ExecutableRouterExecutionResult<TSubflow> {
  const diagnostics = plan.diagnostics.length
    ? plan.diagnostics
    : [{
      severity: "error" as const,
      code: "router.no_route",
      message: plan.fallbackFailure ?? "No active route matched and no active fallback subflow is configured."
    }];
  return {
    status: "failed",
    selectedSubflow: null,
    decision: {
      decisionId: `route-decision.${input.router.routerId}.${decidedAt}`,
      routerId: input.router.routerId,
      fallbackUsed: Boolean(plan.fallbackFailure),
      rejectedRuleIds,
      decidedAt,
      metadata: executableRouteDecisionMetadata(input, evaluations, diagnostics)
    },
    evaluations,
    diagnostics
  };
}
