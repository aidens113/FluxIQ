import type { ExecutableRouter, ExecutableSubflowTarget, ExecutableRouterExecutionInput, ExecutableRouterExecutionResult, ExecutableRouteRuleEvaluation } from "../../../flows/executable/routing/index.ts";
import { compileExecutableRouterPlan } from "./compile.ts";
import { executableRouterFailureResult } from "./failure.ts";
import { executableRouteDecisionMetadata } from "./metadata.ts";
import { evaluateExecutableRouteCondition } from "./condition/index.ts";
import { hasObservedExecutionFrame, type ExecutionCallbackObservation } from "../../../runtime/execution-observation/index.ts";
import { automationObservedClock } from "../execution-admission/kernel/index.ts";

export function runExecutableRouter<TRouter extends ExecutableRouter, TSubflow extends ExecutableSubflowTarget>(input: ExecutableRouterExecutionInput<TRouter, TSubflow>, observation?: ExecutionCallbackObservation): ExecutableRouterExecutionResult<TSubflow> {
  if (observation && !hasObservedExecutionFrame(observation)) throw new Error("execution_observation.durable_frame_missing");
  const plan = compileExecutableRouterPlan({ router: input.router, subflows: input.subflows });
  const decidedAt = automationObservedClock(observation, input, input)();
  const evaluations: ExecutableRouteRuleEvaluation[] = [];
  const rejectedRuleIds: string[] = [];
  if (plan.status === "failed") {
    return executableRouterFailureResult(input, plan, evaluations, rejectedRuleIds, decidedAt);
  }
  for (const candidate of plan.rules) {
    if (candidate.disabled) {
      rejectedRuleIds.push(candidate.rule.ruleId);
      evaluations.push({
        ruleId: candidate.rule.ruleId,
        matched: false,
        reason: candidate.targetSubflow?.status !== "active" ? "Target subflow is not active." : "Rule is not active.",
        targetSubflowId: candidate.rule.target.subflowId
      });
      continue;
    }
    const evaluation = evaluateExecutableRouteCondition(candidate.rule.condition, input);
    evaluations.push({
      ruleId: candidate.rule.ruleId,
      matched: evaluation.matched,
      reason: evaluation.reason,
      targetSubflowId: candidate.rule.target.subflowId
    });
    if (!evaluation.matched) {
      rejectedRuleIds.push(candidate.rule.ruleId);
      continue;
    }
    return {
      status: "running",
      selectedSubflow: candidate.targetSubflow,
      decision: {
        decisionId: `route-decision.${input.router.routerId}.${decidedAt}`,
        routerId: input.router.routerId,
        selectedRuleId: candidate.rule.ruleId,
        selectedSubflowId: candidate.rule.target.subflowId,
        rejectedRuleIds,
        decidedAt,
        metadata: executableRouteDecisionMetadata(input, evaluations)
      },
      evaluations,
      diagnostics: plan.diagnostics
    };
  }
  if (plan.fallbackSubflow?.status === "active") {
    return {
      status: "running",
      selectedSubflow: plan.fallbackSubflow,
      decision: {
        decisionId: `route-decision.${input.router.routerId}.${decidedAt}`,
        routerId: input.router.routerId,
        selectedSubflowId: plan.fallbackSubflow.subflowId,
        fallbackUsed: true,
        rejectedRuleIds,
        decidedAt,
        metadata: executableRouteDecisionMetadata(input, evaluations)
      },
      evaluations,
      diagnostics: plan.diagnostics
    };
  }
  return executableRouterFailureResult(input, plan, evaluations, rejectedRuleIds, decidedAt);
}
