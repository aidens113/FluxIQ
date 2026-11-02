import type { ExecutableRouter, ExecutableSubflowTarget, ExecutableCompiledRouteRule, ExecutableRoutePlanDiagnostic, ExecutableRouterExecutionPlan } from "../../../flows/executable/routing/index.ts";

export function compileExecutableRouterPlan<TRouter extends ExecutableRouter, TSubflow extends ExecutableSubflowTarget>(input: {
  router: TRouter;
  subflows: TSubflow[];
}): ExecutableRouterExecutionPlan<TRouter["rules"][number], TSubflow> {
  const subflowsById = new Map(input.subflows.map((subflow) => [subflow.subflowId, subflow]));
  const diagnostics: ExecutableRoutePlanDiagnostic[] = [];
  const rules: ExecutableCompiledRouteRule<TRouter["rules"][number], TSubflow>[] = [...input.router.rules]
    .sort((left, right) => left.order - right.order || left.ruleId.localeCompare(right.ruleId))
    .map((rule: TRouter["rules"][number]) => {
      const targetSubflow = subflowsById.get(rule.target.subflowId) ?? null;
      if (!targetSubflow) {
        diagnostics.push({
          severity: "error",
          code: "router.rule_missing_target",
          message: `Route rule ${rule.ruleId} targets missing subflow ${rule.target.subflowId}.`,
          ruleId: rule.ruleId,
          subflowId: rule.target.subflowId
        });
      }
      return {
        rule,
        targetSubflow,
        disabled: rule.status !== "active" || targetSubflow?.status !== "active"
      };
    });
  let fallbackSubflow: TSubflow | null = null;
  let fallbackFailure: string | undefined;
  if (input.router.fallback?.kind === "subflow") {
    fallbackSubflow = subflowsById.get(input.router.fallback.subflowId) ?? null;
    if (!fallbackSubflow) {
      diagnostics.push({
        severity: "error",
        code: "router.fallback_missing_target",
        message: `Router fallback targets missing subflow ${input.router.fallback.subflowId}.`,
        subflowId: input.router.fallback.subflowId
      });
    }
  } else if (input.router.fallback?.kind === "fail") {
    fallbackFailure = input.router.fallback.message ?? "No route matched and router fallback is configured to fail.";
  }
  return {
    routerId: input.router.routerId,
    flowId: input.router.flowId,
    status: diagnostics.some((diagnostic) => diagnostic.severity === "error") ? "failed" : "queued",
    rules,
    fallbackSubflow,
    ...(fallbackFailure ? { fallbackFailure } : {}),
    diagnostics
  };
}
