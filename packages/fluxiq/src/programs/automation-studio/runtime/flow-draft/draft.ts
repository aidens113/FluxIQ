// The draft itself: every step the loop took, in the order it took them.
//
// It is deliberately the whole list rather than only the steps it proposes. A
// draft that held just the proposed steps could not answer why a step is not
// among them, and the receipt is the thing that makes the draft checkable: a
// reader can see that the loop pressed six controls, that one of them changed
// nothing and one was marked exploratory, and that the other four are what the
// result should contain. A list with the other two silently absent is a claim
// no one can audit.

import type { AutomationStudioFlowDraftStep } from "./step.ts";
import { automationStudioFlowDraftStepIsProposed } from "./step.ts";

export type AutomationStudioFlowDraft = {
  schemaVersion: "automation-studio.flow-draft.v1";
  /** Every step, in the order it happened. */
  steps: readonly AutomationStudioFlowDraftStep[];
};

/** The draft a list of steps makes. */
export function automationStudioFlowDraft(steps: readonly AutomationStudioFlowDraftStep[]): AutomationStudioFlowDraft {
  return { schemaVersion: "automation-studio.flow-draft.v1", steps: steps.map((step) => ({ ...step })) };
}

/** The steps the draft proposes, in order. */
export function automationStudioFlowDraftProposedSteps(draft: AutomationStudioFlowDraft): readonly AutomationStudioFlowDraftStep[] {
  return draft.steps.filter(automationStudioFlowDraftStepIsProposed);
}
