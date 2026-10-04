// The outer generation catch: preserve a recognized failure, or classify its phase,
// then attach the known current build's settled provider count.
import type { AutomationStudioFlowBootstrapFailureStage, AutomationStudioFlowBootstrapPhaseFailureCode } from "./codes.ts";
import type { AutomationStudioFlowBootstrapFailureDiagnostic } from "./diagnostic.ts";
import { AutomationStudioFlowBootstrapGenerationError, parseAutomationStudioFlowBootstrapGenerationError } from "./error.ts";
import { flowBootstrapPhaseFailure, flowBootstrapUnclassifiedThrowCode } from "./phase-failure.ts";
import { automationStudioFlowBootstrapFailureWithTotalProviderCalls } from "./with-total-provider-calls.ts";

export function automationStudioFlowBootstrapGenerationCatch(
  error: unknown,
  stage: AutomationStudioFlowBootstrapFailureStage,
  accounting: AutomationStudioFlowBootstrapFailureDiagnostic["accounting"],
  fallbackCode: AutomationStudioFlowBootstrapPhaseFailureCode,
  totalProviderCallCount: number | undefined
): AutomationStudioFlowBootstrapGenerationError {
  const diagnostic = parseAutomationStudioFlowBootstrapGenerationError(error)
    ?? flowBootstrapPhaseFailure(stage, accounting, flowBootstrapUnclassifiedThrowCode(error, stage, fallbackCode), error).diagnostic;
  return new AutomationStudioFlowBootstrapGenerationError(automationStudioFlowBootstrapFailureWithTotalProviderCalls(diagnostic, totalProviderCallCount));
}
