import type { ExecutableFlowRunStatus } from "../../execution/index.ts";
import type { ExecutableRouteDecision } from "../decision.ts";
import type { ExecutableSubflowTarget } from "../subflow.ts";
import type { ExecutableRoutePlanDiagnostic } from "./diagnostic.ts";
import type { ExecutableRouteRuleEvaluation } from "./evaluation.ts";

export type ExecutableRouterExecutionResult<TSubflow extends ExecutableSubflowTarget = ExecutableSubflowTarget> = {
  status: ExecutableFlowRunStatus;
  selectedSubflow: TSubflow | null;
  decision: ExecutableRouteDecision;
  evaluations: ExecutableRouteRuleEvaluation[];
  diagnostics: ExecutableRoutePlanDiagnostic[];
};
