import type { ExecutableRouteRule } from "../rule.ts";
import type { ExecutableSubflowTarget } from "../subflow.ts";

export type ExecutableCompiledRouteRule<TRule extends ExecutableRouteRule = ExecutableRouteRule, TSubflow extends ExecutableSubflowTarget = ExecutableSubflowTarget> = {
  rule: TRule;
  targetSubflow: TSubflow | null;
  disabled: boolean;
};
