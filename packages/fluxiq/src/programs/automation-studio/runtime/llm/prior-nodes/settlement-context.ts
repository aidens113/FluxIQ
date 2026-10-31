import type { AutomationStudioLlmEvidenceDecisionHandlerContext } from "../decision-handlers/index.ts";

/** Shared counters/history stay live; only authoring and implicit recovery are disabled. */
export function automationStudioLlmPriorNodesSettlementContext(context: AutomationStudioLlmEvidenceDecisionHandlerContext): AutomationStudioLlmEvidenceDecisionHandlerContext {
  const { recoverStall: _recovery, ...input } = context.input;
  return {
    ...context, input, draftRecord: () => false, observeToolFailures: true,
    get lastAction() { return context.lastAction; },
    set lastAction(value) { context.lastAction = value; }
  };
}
