// The outer generation catch: preserve a recognized failure, or classify its phase,
// then attach the known current build's settled provider count and what the
// build's permission gate read the instruction to ask for.
import { automationStudioConsequencesInOrder, type AutomationStudioActionConsequence } from "../../action-permissions/index.ts";
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
  totalProviderCallCount: number | undefined,
  /** The gate's read of the instruction (`flow-bootstrap/action-permissions.ts`, `instructed()`), when the build made it. Only the classes are kept. */
  instructed?: readonly { consequence: AutomationStudioActionConsequence }[] | undefined
): AutomationStudioFlowBootstrapGenerationError {
  const diagnostic = parseAutomationStudioFlowBootstrapGenerationError(error)
    ?? flowBootstrapPhaseFailure(stage, accounting, flowBootstrapUnclassifiedThrowCode(error, stage, fallbackCode), error).diagnostic;
  return new AutomationStudioFlowBootstrapGenerationError(withInstructedConsequences(automationStudioFlowBootstrapFailureWithTotalProviderCalls(diagnostic, totalProviderCallCount), instructed));
}

/** The diagnostic with the instructed classes, deduplicated in Core's order; unchanged when there are none. */
function withInstructedConsequences(diagnostic: AutomationStudioFlowBootstrapFailureDiagnostic, instructed: readonly { consequence: AutomationStudioActionConsequence }[] | undefined): AutomationStudioFlowBootstrapFailureDiagnostic {
  const classes = automationStudioConsequencesInOrder((instructed ?? []).map((entry) => entry.consequence));
  return classes.length ? { ...diagnostic, instructedConsequences: classes } : diagnostic;
}
