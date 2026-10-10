// What a trace keeps of one fact condition's answer (state-aware recovery plan, C9, C11).

import type { AutomationStudioLifecycleConditionEvidence } from "../contracts.ts";
import type { AutomationStudioFactConditionResult } from "../lifecycle/index.ts";

/** The answer as a trace keeps it: its truth, the evidence reference when there is one, and when it was captured. */
export function automationStudioConditionEvidence(result: AutomationStudioFactConditionResult): AutomationStudioLifecycleConditionEvidence {
  return result.evidenceRef === undefined ? { truth: result.truth, capturedAt: result.capturedAt } : { truth: result.truth, evidenceRef: result.evidenceRef, capturedAt: result.capturedAt };
}
