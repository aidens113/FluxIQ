import type { ExecutableFlowRunStatus } from "../../execution/index.ts";
import type { ExecutableRouteRule } from "../rule.ts";
import type { ExecutableSubflowTarget } from "../subflow.ts";
import type { ExecutableCompiledRouteRule } from "./compiled-rule.ts";
import type { ExecutableRoutePlanDiagnostic } from "./diagnostic.ts";

export type ExecutableRouterExecutionPlan<TRule extends ExecutableRouteRule = ExecutableRouteRule, TSubflow extends ExecutableSubflowTarget = ExecutableSubflowTarget> = {
  routerId: string;
  flowId: string;
  status: ExecutableFlowRunStatus;
  rules: ExecutableCompiledRouteRule<TRule, TSubflow>[];
  fallbackSubflow: TSubflow | null;
  fallbackFailure?: string;
  diagnostics: ExecutableRoutePlanDiagnostic[];
};
