import type { JsonObject } from "../../../core/index.ts";
import type { ExecutableRouterExecutionInput, ExecutableRouteRuleEvaluation, ExecutableRoutePlanDiagnostic } from "../../../flows/executable/routing/index.ts";

/** Bounded decision projection; the complete execution evaluations remain available to the caller. */
const MAX_RECORDED_EVALUATIONS = 16;
const MAX_RECORDED_REASON_LENGTH = 300;

export function executableRouteDecisionMetadata(
  input: Pick<ExecutableRouterExecutionInput, "stateSource" | "rerouteSource">,
  evaluations: ExecutableRouteRuleEvaluation[],
  diagnostics: ExecutableRoutePlanDiagnostic[] = []
): JsonObject {
  return {
    evaluationCount: evaluations.length,
    // Each rule's verdict and the matcher's reason, which names the path and
    // the test and never a value it read, so a later repair can be told which
    // route a run took and why without the state it was taken on.
    evaluations: evaluations.slice(0, MAX_RECORDED_EVALUATIONS).map((evaluation) => ({
      ruleId: evaluation.ruleId,
      matched: evaluation.matched,
      reason: evaluation.reason.slice(0, MAX_RECORDED_REASON_LENGTH),
      ...(evaluation.targetSubflowId ? { targetSubflowId: evaluation.targetSubflowId } : {})
    })),
    ...(input.stateSource ? {
      routeState: {
        observed: input.stateSource.observed,
        paths: input.stateSource.paths.slice(0, MAX_RECORDED_EVALUATIONS),
        ...(input.stateSource.unavailable ? { unavailable: input.stateSource.unavailable.slice(0, MAX_RECORDED_REASON_LENGTH) } : {})
      }
    } : {}),
    ...(input.rerouteSource ? { rerouteSource: input.rerouteSource } : {}),
    ...(diagnostics.length ? { diagnostics: diagnostics.map((diagnostic) => ({ ...diagnostic })) } : {})
  };
}
