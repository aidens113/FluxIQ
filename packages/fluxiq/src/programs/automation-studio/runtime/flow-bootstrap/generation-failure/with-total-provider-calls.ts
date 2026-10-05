import type { AutomationStudioFlowBootstrapFailureDiagnostic } from "./diagnostic.ts";

/** Add only actual current-build calls; absence remains unknown, never an invented zero. */
export function automationStudioFlowBootstrapFailureWithTotalProviderCalls(diagnostic: AutomationStudioFlowBootstrapFailureDiagnostic, calls: number | undefined): AutomationStudioFlowBootstrapFailureDiagnostic {
  return calls === undefined ? diagnostic : { ...diagnostic, totalProviderCallCount: calls };
}
