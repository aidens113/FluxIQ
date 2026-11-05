// The steps of an attempt that did something lasting and are out of the Flow it saved (t869): the
// model dropped them from its draft, so what they did stands on the site and the saved Flow will not
// do it again. The saved line says so, by the step's own words, or by its place where it has none.

import { automationStudioFlowDraftStepLandedOut, type AutomationStudioFlowDraftStep } from "../../../../../runtime/flow-authoring/draft/index.ts";

/** The name of each such step, as a person reads it, in the order of the draft. */
export function automationStudioAnswerFirstLeftOutSteps(steps: readonly AutomationStudioFlowDraftStep[]): string[] {
  return steps.filter(automationStudioFlowDraftStepLandedOut).map((step) => (step.words?.target ?? step.control ?? "").replace(/\s+/gu, " ").trim().slice(0, 200) || `Step ${step.position}`);
}
