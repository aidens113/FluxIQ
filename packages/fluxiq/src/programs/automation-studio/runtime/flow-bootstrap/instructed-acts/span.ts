// Which steps of a draft a repeat runs once per item, and where a repeat stops
// short of the act it was written for.
//
// **Repeated.** A step runs once per item when it carries `repeat`, or lies
// between a kept step carrying `repeat` and the step that repeat runs through.
// A repeat on a step the model withdrew is in no Flow, so it counts for nothing.
//
// **Stopping short (withdraw audit B2).** Run 3 (`run-munnyvbr-11c28a0f`) was
// told to withdraw every month-old invitation. It repeated the row's Withdraw,
// which only opens a confirmation, and left the confirmation -- the press that
// withdraws -- after the loop. The check accepted it, because the act's step
// was inside a span; the Flow confirmed once, and every later pass met the open
// confirmation. So a span stops short when the next proposed step after it
// changes something lasting (it declares a consequence, read as the dry run
// reads it, `../../flow-draft/verify-only.ts`), is not itself repeated, and is
// claimed for no act. A step claimed for another act is the Flow's next act --
// "add every kettle, then place the order" -- and stays legal.
import type { AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import {
  automationStudioFlowDraftStepById,
  automationStudioFlowDraftStepIsProposed,
  automationStudioFlowDraftStepReplayMode
} from "../../flow-draft/index.ts";

/** One kept repeat that runs a step: the step carrying it, and the positions it runs from and through. */
export type AutomationStudioInstructedActRepeatSpan = { carrier: AutomationStudioFlowDraftStep; from: number; to: number };

/** Every kept repeat whose span holds this step. Empty when the Flow runs it once. */
export function automationStudioInstructedActRepeatSpans(
  step: AutomationStudioFlowDraftStep,
  steps: readonly AutomationStudioFlowDraftStep[]
): AutomationStudioInstructedActRepeatSpan[] {
  return steps.flatMap((carrier) => {
    if (carrier.routing?.kind !== "repeat") return [];
    if (carrier !== step && !automationStudioFlowDraftStepIsProposed(carrier)) return [];
    const through = automationStudioFlowDraftStepById(steps, carrier.routing.through)?.position ?? carrier.position;
    const from = Math.min(carrier.position, through);
    const to = Math.max(carrier.position, through);
    return step.position >= from && step.position <= to ? [{ carrier, from, to }] : [];
  });
}

/**
 * The span repeating this step that stops short, and the step after it that
 * does part of the act once, or nothing when no span does. `claimed` says
 * whether a step is named for some act.
 */
export function automationStudioInstructedActSpanStopsShort(
  step: AutomationStudioFlowDraftStep,
  steps: readonly AutomationStudioFlowDraftStep[],
  claimed: (step: AutomationStudioFlowDraftStep) => boolean
): { span: AutomationStudioInstructedActRepeatSpan; after: AutomationStudioFlowDraftStep } | undefined {
  for (const span of automationStudioInstructedActRepeatSpans(step, steps)) {
    const after = steps
      .filter((each) => each.position > span.to && automationStudioFlowDraftStepIsProposed(each))
      .sort((left, right) => left.position - right.position)[0];
    if (!after) continue;
    // `verify` is the dry run's word for a step that changed something and declared it lasting, or
    // that does an act in place; a step named for an act is the next act, and passed over below anyway.
    if (automationStudioFlowDraftStepReplayMode(after, steps) !== "verify") continue;
    if (automationStudioInstructedActRepeatSpans(after, steps).length || claimed(after)) continue;
    return { span, after };
  }
  return undefined;
}
