import type { AutomationStudioFlowDraftStep } from "../step.ts";

/** The draft as the model was shown it: the step at each number, and the number each step had. */
export type AutomationStudioFlowDraftShownNumbering = {
  step(position: number | undefined): AutomationStudioFlowDraftStep | undefined;
  number(step: AutomationStudioFlowDraftStep): number;
};

/**
 * The numbering every amendment of one decision is read against: the draft's
 * positions as they stood before the first amendment, which is how the draft
 * entry the model read numbered them (`./index.ts`). The first step at a number
 * answers for it, as `find` did. A step's own `position` is kept current as
 * steps move, because other modules order the draft by it mid-decision
 * (`../reversal.ts`); no number an amendment carries is read from it.
 */
export function automationStudioFlowDraftShownNumbering(steps: readonly AutomationStudioFlowDraftStep[]): AutomationStudioFlowDraftShownNumbering {
  const byNumber = new Map<number, AutomationStudioFlowDraftStep>();
  for (const step of steps) if (!byNumber.has(step.position)) byNumber.set(step.position, step);
  const numbers = new Map(steps.map((step) => [step, step.position] as const));
  return {
    step: (position) => position === undefined ? undefined : byNumber.get(position),
    number: (step) => numbers.get(step) ?? step.position
  };
}
