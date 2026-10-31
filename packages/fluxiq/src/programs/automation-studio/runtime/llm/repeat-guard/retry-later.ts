import { projectAutomationStudioFailureControlRecord } from "@fluxiq/contracts/automation-studio";

/**
 * A validated temporary failure of a call that certainly did not act. Temporary
 * cause alone grants nothing: the producer must permit the unchanged retry,
 * report it unacted, and agree with the actual execution and person-needed
 * facts. Missing or malformed metadata remains a repeat to refuse.
 */
export function automationStudioLlmEvidenceRetriesLater(call: { failure?: unknown; effectApplied?: unknown; personNeeded?: unknown }): boolean {
  if (call.effectApplied !== false || call.personNeeded !== undefined) return false;
  const failure = projectAutomationStudioFailureControlRecord(call.failure);
  return failure?.transient === true && failure.retryable === true && failure.effect === "unacted";
}
