// One evidence-loop decision reduced to a step a reader may keep: the tool it
// called, whether that call's effect was applied, and the code it came to.
//
// It was written for a *refused* build's diagnostic, which is where the shape
// is declared, and that is the whole problem it now also solves. A build that
// failed published its decisions; a build that succeeded published counts and
// a sorted list of tool ids, so the successful builds we most want to study
// were the ones we could not see. Both readers now take the same steps from
// the same function, so a proposed build's trail and a refused build's read
// alike and can be compared.
//
// Codes and names only. Nothing a tool returned and nothing the model wrote
// passes through here, which is what lets a step ride on an audit detail that
// no redaction rule covers.
import type { AutomationStudioLlmEvidenceLoopTrace } from "../llm/index.ts";
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_DECISION_STEP_IDS } from "./decision-step-ids.ts";

/** One decision as a step: identifiers, a boolean and a code, and nothing else. */
export type AutomationStudioFlowBootstrapEvidenceStep = {
  toolId: string;
  effectApplied?: boolean;
  resultCode?: string;
};

/** The shape a code must have to travel: no whitespace, so no sentence. */
const EVIDENCE_STEP_CODE = /^[a-z0-9_.:-]{1,100}$/i;

/**
 * The trace as steps, in the loop's own order. A `tool_call` that named no
 * tool contributes nothing -- there is no step to name -- and every other
 * decision is named by Core's own `core.` step id, which no domain tool may
 * take, so a reader tells a decision from a tool call by its name alone.
 */
export function automationStudioFlowBootstrapEvidenceSteps(
  trace: readonly AutomationStudioLlmEvidenceLoopTrace[]
): AutomationStudioFlowBootstrapEvidenceStep[] {
  return trace.flatMap(automationStudioFlowBootstrapEvidenceStep);
}

function automationStudioFlowBootstrapEvidenceStep(entry: AutomationStudioLlmEvidenceLoopTrace): AutomationStudioFlowBootstrapEvidenceStep[] {
  const resultCode = entry.resultCode && EVIDENCE_STEP_CODE.test(entry.resultCode) ? { resultCode: entry.resultCode } : {};
  if (entry.decision === "tool_call") {
    return entry.toolId ? [{ toolId: entry.toolId, ...(entry.effectApplied !== undefined ? { effectApplied: entry.effectApplied } : {}), ...resultCode }] : [];
  }
  return [{ toolId: AUTOMATION_STUDIO_FLOW_BOOTSTRAP_DECISION_STEP_IDS[entry.decision], ...resultCode }];
}
